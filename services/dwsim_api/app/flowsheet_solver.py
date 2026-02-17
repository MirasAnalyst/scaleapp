"""
Sequential-modular flowsheet solver.

Mirrors the approach used by Aspen HYSYS:
  1. Topological sort to determine calculation order
  2. Detect recycle loops via Tarjan's SCC algorithm
  3. Select tear streams to break cycles
  4. Iterate with Wegstein acceleration until convergence
  5. Report mass & energy balance closure
"""

from __future__ import annotations

import copy
import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from loguru import logger

from . import schemas
from .thermo_engine import StreamState, ThermoEngine
from .unit_operations import UNIT_OP_REGISTRY, UnitOpBase


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class Connection:
    """A directed edge in the flowsheet graph."""
    stream_id: str
    from_unit: Optional[str]  # None = feed stream
    from_port: Optional[str]
    to_unit: Optional[str]  # None = product stream
    to_port: Optional[str]


@dataclass
class SolverResult:
    converged: bool
    iterations: int
    streams: Dict[str, StreamState]
    unit_results: Dict[str, UnitOpBase]
    warnings: List[str]
    mass_balance_error: float
    energy_balance_error: float


# ---------------------------------------------------------------------------
# Solver
# ---------------------------------------------------------------------------


class FlowsheetSolver:
    """Sequential-modular flowsheet solver with tear-stream handling."""

    # Default outlet ports for multi-outlet units — used when sourceHandle
    # is missing so we assign sequentially instead of all defaulting to "out".
    _DEFAULT_OUTLET_PORTS: Dict[str, List[str]] = {
        "flashDrum": ["vapor", "liquid"],
        "separator": ["vapor", "liquid"],
        "separatorHorizontal": ["vapor", "liquid"],
        "knockoutDrumH": ["vapor", "liquid"],
        "surgeDrum": ["vapor", "liquid"],
        "refluxDrum": ["vapor", "liquid"],
        "separator3p": ["gas", "oil", "water"],
        "distillationColumn": ["distillate", "bottoms"],
        "packedColumn": ["distillate", "bottoms"],
        "absorber": ["distillate", "bottoms"],
        "stripper": ["distillate", "bottoms"],
        "splitter": ["out-1", "out-2", "out-3"],
        "shellTubeHX": ["hot_out", "cold_out"],
        "plateHX": ["hot_out", "cold_out"],
        "doublePipeHX": ["hot_out", "cold_out"],
    }

    # Default inlet ports for multi-inlet units
    _DEFAULT_INLET_PORTS: Dict[str, List[str]] = {
        "mixer": ["in-1", "in-2", "in-3"],
        "shellTubeHX": ["hot_in", "cold_in"],
        "plateHX": ["hot_in", "cold_in"],
        "doublePipeHX": ["hot_in", "cold_in"],
    }

    def __init__(self, engine: ThermoEngine) -> None:
        self.engine = engine
        self.units: Dict[str, UnitOpBase] = {}
        self.connections: List[Connection] = []
        self.streams: Dict[str, StreamState] = {}
        self.feed_streams: Dict[str, StreamState] = {}  # user-specified feeds

        # Build-phase warnings surfaced in solve() result
        self._build_warnings: List[str] = []

        # Graph adjacency (unit_id -> set of downstream unit_ids)
        self._adj: Dict[str, Set[str]] = defaultdict(set)
        self._rev: Dict[str, Set[str]] = defaultdict(set)

        # Maps: stream_id -> connection, unit_id -> [inlet stream ids], etc.
        self._unit_inlets: Dict[str, Dict[str, str]] = defaultdict(dict)  # unit -> {port: stream_id}
        self._unit_outlets: Dict[str, Dict[str, str]] = defaultdict(dict)
        self._stream_connection: Dict[str, Connection] = {}

        # Per-unit counters for sequential port assignment
        self._outlet_port_counters: Dict[str, int] = defaultdict(int)
        self._inlet_port_counters: Dict[str, int] = defaultdict(int)
        # Map unit_id → unit type (for port lookup)
        self._unit_types: Dict[str, str] = {}

    # ------------------------------------------------------------------
    # Build from payload
    # ------------------------------------------------------------------

    def _next_default_port(self, unit_id: str, direction: str) -> str:
        """Return the next unused default port for a multi-port unit.

        For a flash drum with 2 outgoing edges both missing sourceHandle,
        the first call returns "vapor" and the second returns "liquid",
        preventing dict key collision.
        """
        unit_type = self._unit_types.get(unit_id)
        if direction == "outlet":
            ports = self._DEFAULT_OUTLET_PORTS.get(unit_type, [])
            counter_key = f"{unit_id}:out"
            idx = self._outlet_port_counters[counter_key]
            self._outlet_port_counters[counter_key] = idx + 1
        else:
            ports = self._DEFAULT_INLET_PORTS.get(unit_type, [])
            counter_key = f"{unit_id}:in"
            idx = self._inlet_port_counters[counter_key]
            self._inlet_port_counters[counter_key] = idx + 1

        if idx < len(ports):
            return ports[idx]
        # Fallback for types not in the registry or exhausted ports
        return "out" if direction == "outlet" else "in"

    def build_from_payload(self, payload: schemas.FlowsheetPayload) -> None:
        """Parse a FlowsheetPayload into the internal graph."""

        # 1. Create unit operations
        for unit_spec in payload.units:
            unit_type = unit_spec.type
            cls = UNIT_OP_REGISTRY.get(unit_type)
            if cls is None:
                logger.warning("Unknown unit type '{}', skipping", unit_type)
                continue
            unit = cls(
                id=unit_spec.id,
                name=unit_spec.name or unit_spec.id,
                params=dict(unit_spec.parameters),
                engine=self.engine,
            )
            self.units[unit_spec.id] = unit
            self._unit_types[unit_spec.id] = unit_type

        # 2. Parse streams / connections (pass 1: build graph structure)
        for stream_spec in payload.streams:
            conn = Connection(
                stream_id=stream_spec.id,
                from_unit=stream_spec.source,
                from_port=self._extract_port(stream_spec.properties.get("sourceHandle")),
                to_unit=stream_spec.target,
                to_port=self._extract_port(stream_spec.properties.get("targetHandle")),
            )
            self.connections.append(conn)
            self._stream_connection[stream_spec.id] = conn

            # Build adjacency
            if conn.from_unit and conn.to_unit:
                self._adj[conn.from_unit].add(conn.to_unit)
                self._rev[conn.to_unit].add(conn.from_unit)

            # Track unit inlet/outlet ports — sequential assignment for
            # multi-port units when the handle is missing
            if conn.to_unit:
                port = conn.to_port
                if port is None:
                    port = self._next_default_port(conn.to_unit, "inlet")
                self._unit_inlets[conn.to_unit][port] = stream_spec.id
            if conn.from_unit:
                port = conn.from_port
                if port is None:
                    port = self._next_default_port(conn.from_unit, "outlet")
                self._unit_outlets[conn.from_unit][port] = stream_spec.id

        # 3. Identify feed streams (pass 2: use graph topology)
        # Source-only units: units with no incoming connections from other known units
        units_with_incoming: set = set()
        for conn in self.connections:
            if conn.to_unit and conn.to_unit in self.units:
                if conn.from_unit and conn.from_unit in self.units:
                    units_with_incoming.add(conn.to_unit)
        source_only_units = set(self.units.keys()) - units_with_incoming

        # Build a lookup from stream_id -> StreamSpec for pass 2
        stream_specs = {s.id: s for s in payload.streams}

        for conn in self.connections:
            stream_spec = stream_specs[conn.stream_id]

            is_external_feed = conn.from_unit is None or conn.from_unit not in self.units
            has_thermo_data = (
                stream_spec.properties
                and stream_spec.properties.get("temperature") is not None
                and stream_spec.properties.get("composition")
            )

            if is_external_feed or has_thermo_data:
                result = self._create_feed_stream(stream_spec)
                # Handle both return forms: StreamState or (None, missing_fields)
                if isinstance(result, tuple):
                    _, missing_fields = result
                    # Only warn for truly external feeds, not internal streams
                    if is_external_feed:
                        self._build_warnings.append(
                            f"Feed stream '{stream_spec.id}' dropped: missing {', '.join(missing_fields)}"
                        )
                elif result is not None:
                    self.streams[stream_spec.id] = result
                    self.feed_streams[stream_spec.id] = result

    # ------------------------------------------------------------------
    # Solve
    # ------------------------------------------------------------------

    def solve(
        self,
        max_iterations: int = 50,
        tolerance: float = 1e-6,
    ) -> SolverResult:
        """
        Run the sequential-modular solve loop.

        Returns a SolverResult with converged flag, streams, and diagnostics.
        """
        warnings: List[str] = list(self._build_warnings)

        if not self.feed_streams:
            warnings.append("No feed streams were created — check that feed edges have temperature, pressure, and composition")

        if not self.units:
            return SolverResult(
                converged=True, iterations=0,
                streams=self.streams, unit_results=self.units,
                warnings=["No unit operations to solve"],
                mass_balance_error=0.0, energy_balance_error=0.0,
            )

        # Determine calculation order
        sccs = self._tarjan_scc()
        tear_streams = self._select_tear_streams(sccs)
        calc_order = self._topological_sort_with_tears(tear_streams)

        if tear_streams:
            logger.info("Tear streams detected: {}", tear_streams)
            warnings.append(f"Recycle detected, tear streams: {tear_streams}")

        # Initialise tear streams with estimates (copy of feed or zero)
        for sid in tear_streams:
            if sid not in self.streams:
                self.streams[sid] = self._initial_tear_estimate(sid)

        converged = False
        iteration = 0
        tear_history: Dict[str, List[List[float]]] = {sid: [] for sid in tear_streams}

        for iteration in range(1, max_iterations + 1):
            # Calculate each unit in order
            for unit_id in calc_order:
                unit = self.units.get(unit_id)
                if unit is None:
                    continue
                try:
                    self._calculate_unit(unit)
                except Exception as exc:
                    warnings.append(f"Unit '{unit_id}' calculation failed: {exc}")
                    logger.error("Unit '{}' failed: {}", unit_id, exc)

            # Check tear stream convergence
            if not tear_streams:
                converged = True
                break

            max_err = 0.0
            for sid in tear_streams:
                old_state = self.streams.get(sid)
                # Re-read the stream from the upstream unit's outlet
                new_state = self._get_upstream_outlet(sid)
                if old_state is None or new_state is None:
                    continue

                err = self._stream_distance(old_state, new_state)
                max_err = max(max_err, err)

                # Store history for Wegstein
                tear_history[sid].append(self._stream_to_vector(new_state))

                # Apply Wegstein acceleration if enough history
                if len(tear_history[sid]) >= 3:
                    accelerated = self._wegstein_update(tear_history[sid])
                    self.streams[sid] = self._vector_to_stream(
                        accelerated, new_state
                    )
                else:
                    self.streams[sid] = new_state

            logger.info("Iteration {}: max tear error = {:.2e}", iteration, max_err)

            if max_err < tolerance:
                converged = True
                break

        # Collect warnings from units
        for unit in self.units.values():
            for w in unit.warnings:
                warnings.append(f"[{unit.name}] {w}")

        # Diagnostic: converged but nothing actually computed
        calculated_streams = len(self.streams) - len(self.feed_streams)
        if converged and calculated_streams <= 0 and self.units:
            warnings.append(
                "Solver converged but no outlet streams were calculated — "
                "check that feed streams are connected and unit operations have valid parameters"
            )

        # Check overall balances (only if there are calculated streams)
        if calculated_streams > 0:
            mass_err = self._check_mass_balance()
            energy_err = self._check_energy_balance()

            if mass_err is not None and mass_err > 0.01:
                warnings.append(f"Mass balance error is {mass_err*100:.2f}% (>1% threshold)")
            if energy_err is not None and energy_err > 0.05:
                warnings.append(f"Energy balance error is {energy_err*100:.2f}% (>5% threshold)")
        else:
            mass_err = None
            energy_err = None
        if not converged:
            warnings.append(f"Solver did not converge after {iteration} iterations")

        return SolverResult(
            converged=converged,
            iterations=iteration,
            streams=self.streams,
            unit_results=self.units,
            warnings=warnings,
            mass_balance_error=mass_err,
            energy_balance_error=energy_err,
        )

    # ------------------------------------------------------------------
    # Unit calculation
    # ------------------------------------------------------------------

    def _calculate_unit(self, unit: UnitOpBase) -> None:
        """Gather inlets, call unit.calculate(), and store outlets."""
        inlet_ports = self._unit_inlets.get(unit.id, {})
        inlets: Dict[str, StreamState] = {}

        for port, stream_id in inlet_ports.items():
            state = self.streams.get(stream_id)
            if state is not None:
                inlets[port] = state

        if not inlets:
            logger.warning("Unit '{}' has no available inlet streams, skipping", unit.id)
            unit.warnings.append("No inlet streams available — unit was skipped")
            return

        outlets = unit.calculate(inlets)

        # Map outlet port names to stream IDs
        outlet_ports = self._unit_outlets.get(unit.id, {})

        # Try matching by port name or by position
        outlet_keys = list(outlets.keys())
        port_keys = list(outlet_ports.keys())

        assigned_streams: set = set()  # track which stream IDs have been assigned

        for out_port, out_state in outlets.items():
            stream_id = None

            # 0. Semantic alias: unit op key (e.g. "distillate") → solver port ("vapor")
            mapped_port = self._OUTLET_KEY_TO_PORT.get(out_port)
            if mapped_port is not None:
                stream_id = outlet_ports.get(mapped_port)

            # 1. Direct match
            if stream_id is None:
                stream_id = outlet_ports.get(out_port)

            # 2. Fuzzy match (e.g. "out" matches "out-right")
            if stream_id is None:
                for pk, sid in outlet_ports.items():
                    if out_port in pk or pk in out_port:
                        stream_id = sid
                        break

            # 3. Positional fallback
            if stream_id is None and outlet_keys and port_keys:
                idx = outlet_keys.index(out_port)
                if idx < len(port_keys):
                    stream_id = outlet_ports[port_keys[idx]]

            if stream_id and stream_id not in assigned_streams:
                self.streams[stream_id] = out_state
                assigned_streams.add(stream_id)

        # Step 4: Last-resort fallback using connection graph.
        # When port-name matching fails (e.g. AI omitted sourceHandle causing
        # dict key collisions in _unit_outlets), pair unmatched outlet results
        # with any remaining outgoing connections from this unit.
        if len(assigned_streams) < len(outlets):
            unmatched = [
                (k, v) for k, v in outlets.items()
                if not any(
                    sid in assigned_streams
                    for sid in [
                        outlet_ports.get(self._OUTLET_KEY_TO_PORT.get(k)),
                        outlet_ports.get(k),
                    ]
                    if sid is not None
                )
            ]
            available = [
                c.stream_id for c in self.connections
                if c.from_unit == unit.id
                and c.stream_id not in assigned_streams
            ]
            for (out_port, out_state), sid in zip(unmatched, available):
                self.streams[sid] = out_state
                assigned_streams.add(sid)
                logger.info(
                    "Fallback outlet mapping: '{}' port '{}' → stream '{}'",
                    unit.id, out_port, sid,
                )

    # ------------------------------------------------------------------
    # Graph algorithms
    # ------------------------------------------------------------------

    def _tarjan_scc(self) -> List[List[str]]:
        """Find strongly connected components using Tarjan's algorithm."""
        index_counter = [0]
        stack: List[str] = []
        lowlink: Dict[str, int] = {}
        index: Dict[str, int] = {}
        on_stack: Set[str] = set()
        sccs: List[List[str]] = []

        all_units = set(self.units.keys())

        def strongconnect(v: str):
            index[v] = index_counter[0]
            lowlink[v] = index_counter[0]
            index_counter[0] += 1
            stack.append(v)
            on_stack.add(v)

            for w in self._adj.get(v, set()):
                if w not in all_units:
                    continue
                if w not in index:
                    strongconnect(w)
                    lowlink[v] = min(lowlink[v], lowlink[w])
                elif w in on_stack:
                    lowlink[v] = min(lowlink[v], index[w])

            if lowlink[v] == index[v]:
                scc: List[str] = []
                while True:
                    w = stack.pop()
                    on_stack.discard(w)
                    scc.append(w)
                    if w == v:
                        break
                sccs.append(scc)

        for v in all_units:
            if v not in index:
                strongconnect(v)

        return sccs

    def _select_tear_streams(self, sccs: List[List[str]]) -> List[str]:
        """Select streams to tear for each SCC with > 1 unit."""
        tear_streams: List[str] = []
        for scc in sccs:
            if len(scc) <= 1:
                continue
            scc_set = set(scc)
            # Pick the stream going from last to first in the SCC
            for conn in self.connections:
                if (
                    conn.from_unit in scc_set
                    and conn.to_unit in scc_set
                ):
                    tear_streams.append(conn.stream_id)
                    break  # One tear per SCC is usually sufficient
        return tear_streams

    def _topological_sort_with_tears(self, tear_streams: List[str]) -> List[str]:
        """
        Topological sort of units, treating tear streams as broken edges.
        Falls back to BFS-based ordering if cycles remain.
        """
        tear_set = set(tear_streams)

        # Build in-degree map ignoring tear edges
        in_degree: Dict[str, int] = {uid: 0 for uid in self.units}
        adj_no_tears: Dict[str, List[str]] = defaultdict(list)

        for conn in self.connections:
            if conn.stream_id in tear_set:
                continue
            if conn.from_unit in self.units and conn.to_unit in self.units:
                adj_no_tears[conn.from_unit].append(conn.to_unit)
                in_degree[conn.to_unit] = in_degree.get(conn.to_unit, 0) + 1

        # Kahn's algorithm
        queue = deque(uid for uid, deg in in_degree.items() if deg == 0)
        order: List[str] = []

        while queue:
            u = queue.popleft()
            order.append(u)
            for v in adj_no_tears.get(u, []):
                in_degree[v] -= 1
                if in_degree[v] == 0:
                    queue.append(v)

        # Add any remaining units not in order (shouldn't happen if tears are correct)
        remaining = [uid for uid in self.units if uid not in set(order)]
        if remaining:
            logger.warning("Units not in topological order: {}", remaining)
            order.extend(remaining)

        return order

    # ------------------------------------------------------------------
    # Tear stream helpers
    # ------------------------------------------------------------------

    def _initial_tear_estimate(self, stream_id: str) -> StreamState:
        """Create an initial estimate for a tear stream."""
        # Use feed conditions as a starting guess
        if self.feed_streams:
            ref = next(iter(self.feed_streams.values()))
            return StreamState(
                temperature=ref.temperature,
                pressure=ref.pressure,
                phase=ref.phase,
                vapor_fraction=ref.vapor_fraction,
                liquid_fraction=ref.liquid_fraction,
                zs=list(ref.zs),
                enthalpy=ref.enthalpy,
                entropy=ref.entropy,
                heat_capacity=ref.heat_capacity,
                molecular_weight=ref.molecular_weight,
                density=ref.density,
                molar_flow=ref.molar_flow,
                mass_flow=ref.mass_flow,
                component_names=list(ref.component_names),
            )
        # Fallback: ambient conditions
        zs = [1.0 / self.engine.n] * self.engine.n
        return self.engine.pt_flash(T=298.15, P=101325.0, zs=zs, molar_flow=1.0)

    def _get_upstream_outlet(self, stream_id: str) -> Optional[StreamState]:
        """Get the latest outlet state for a stream from its source unit."""
        conn = self._stream_connection.get(stream_id)
        if conn is None or conn.from_unit is None:
            return None
        unit = self.units.get(conn.from_unit)
        if unit is None:
            return None
        # The stream should already be in self.streams if the unit was calculated
        return self.streams.get(stream_id)

    @staticmethod
    def _stream_to_vector(state: StreamState) -> List[float]:
        """Convert key stream properties to a numeric vector for convergence check."""
        vec = [state.temperature, state.pressure, state.molar_flow]
        vec.extend(state.zs)
        return vec

    def _vector_to_stream(
        self, vec: List[float], template: StreamState
    ) -> StreamState:
        """Reconstruct a StreamState from a numeric vector, re-flashing."""
        T = max(vec[0], 100.0)  # Guard against negative T
        P = max(vec[1], 1000.0)  # Guard against near-zero P
        flow = max(vec[2], 0.0)
        zs = list(vec[3:])

        # Normalise and clamp
        zs = [max(z, 0.0) for z in zs]
        total = sum(zs)
        if total > 0:
            zs = [z / total for z in zs]
        else:
            zs = list(template.zs)

        try:
            return self.engine.pt_flash(T=T, P=P, zs=zs, molar_flow=flow)
        except Exception:
            return template

    @staticmethod
    def _stream_distance(a: StreamState, b: StreamState) -> float:
        """Euclidean distance between two stream states (normalised)."""
        err = 0.0
        if a.temperature > 0:
            err += ((a.temperature - b.temperature) / a.temperature) ** 2
        if a.pressure > 0:
            err += ((a.pressure - b.pressure) / a.pressure) ** 2
        if a.molar_flow > 0:
            err += ((a.molar_flow - b.molar_flow) / max(a.molar_flow, 1e-10)) ** 2
        for za, zb in zip(a.zs, b.zs):
            err += (za - zb) ** 2
        return math.sqrt(err)

    @staticmethod
    def _wegstein_update(history: List[List[float]]) -> List[float]:
        """
        Wegstein acceleration for tear stream convergence.

        Uses the last 3 iterates to extrapolate.
        """
        x_n = history[-1]
        x_nm1 = history[-2]
        g_nm1 = history[-3] if len(history) >= 3 else x_nm1

        result = []
        for i in range(len(x_n)):
            dx = x_n[i] - x_nm1[i]
            dg = x_n[i] - g_nm1[i]
            if abs(dg - dx) > 1e-15:
                s = dx / (dg - dx + 1e-30)
                # Bound the Wegstein parameter
                s = max(min(s, 0.0), -5.0)
                q = s / (s - 1.0)
                val = q * x_n[i] + (1.0 - q) * x_nm1[i]
            else:
                val = x_n[i]  # Direct substitution
            result.append(val)
        return result

    # ------------------------------------------------------------------
    # Balance checks
    # ------------------------------------------------------------------

    def _check_mass_balance(self) -> float:
        """Check overall mass balance: sum(feeds) - sum(products)."""
        # Feed mass from tracked feed streams (reliable regardless of source node type)
        feed_mass = sum(s.mass_flow for s in self.feed_streams.values())
        if feed_mass <= 0:
            return 0.0

        # Identify terminal units: units with no downstream *known* units
        known_ids = set(self.units.keys())
        terminal_units = set()
        for uid in known_ids:
            downstream_known = self._adj.get(uid, set()) & known_ids
            if not downstream_known:
                terminal_units.add(uid)

        product_mass = 0.0
        for conn in self.connections:
            state = self.streams.get(conn.stream_id)
            if state is None or conn.stream_id in self.feed_streams:
                continue
            # Original: stream leaves the known-unit boundary
            if conn.to_unit is None or conn.to_unit not in known_ids:
                product_mass += state.mass_flow
            # New: stream enters a terminal unit (end of process chain)
            elif conn.to_unit in terminal_units:
                product_mass += state.mass_flow

        return abs(feed_mass - product_mass) / feed_mass

    def _check_energy_balance(self) -> float:
        """Check overall energy balance including unit duties."""
        # Feed energy from tracked feed streams
        feed_energy = 0.0
        for s in self.feed_streams.values():
            feed_energy += s.molar_flow * s.enthalpy

        # Terminal units (same logic as mass balance)
        known_ids = set(self.units.keys())
        terminal_units = set()
        for uid in known_ids:
            downstream_known = self._adj.get(uid, set()) & known_ids
            if not downstream_known:
                terminal_units.add(uid)

        product_energy = 0.0
        for conn in self.connections:
            state = self.streams.get(conn.stream_id)
            if state is None or conn.stream_id in self.feed_streams:
                continue
            energy = state.molar_flow * state.enthalpy
            if conn.to_unit is None or conn.to_unit not in known_ids:
                product_energy += energy
            elif conn.to_unit in terminal_units:
                product_energy += energy

        total_duty = sum(u.duty_W for u in self.units.values())

        energy_in = feed_energy + total_duty
        if abs(energy_in) > 0:
            return abs(energy_in - product_energy) / abs(energy_in)
        return 0.0

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _create_feed_stream(
        self, spec: schemas.StreamSpec
    ) -> "StreamState | tuple[None, list[str]]":
        """Create a StreamState from a StreamSpec's properties dict.

        Returns a StreamState on success, or ``(None, missing_fields)``
        when required data is absent so callers can issue specific warnings.
        """
        props = spec.properties
        if not props:
            return None, ["temperature", "pressure", "composition"]

        T_c = props.get("temperature") or props.get("temperature_c")
        P_kpa = props.get("pressure") or props.get("pressure_kpa")
        flow_kg_h = props.get("flow_rate") or props.get("mass_flow_kg_per_h")
        composition = props.get("composition", {})

        # Defensive: ensure numeric values (AI sometimes generates string "value")
        try:
            T_c = float(T_c) if T_c is not None else None
        except (ValueError, TypeError):
            T_c = None
        try:
            P_kpa = float(P_kpa) if P_kpa is not None else None
        except (ValueError, TypeError):
            P_kpa = None
        try:
            flow_kg_h = float(flow_kg_h) if flow_kg_h is not None else None
        except (ValueError, TypeError):
            flow_kg_h = None

        missing: list[str] = []
        if T_c is None:
            missing.append("temperature")
        if P_kpa is None:
            missing.append("pressure")
        if missing:
            return None, missing

        T_K = T_c + 273.15
        P_Pa = P_kpa * 1000.0

        # Build mole fractions aligned with engine components
        zs = []
        for name in self.engine.component_names:
            frac = composition.get(name, 0.0)
            # Try case-insensitive match
            if frac == 0.0:
                for k, v in composition.items():
                    if k.lower() == name.lower():
                        frac = v
                        break
            zs.append(float(frac))

        total_z = sum(zs)
        if total_z <= 0:
            logger.warning(
                "Stream '{}' has zero composition — falling back to equal mole fractions",
                spec.id,
            )
            n = len(self.engine.component_names)
            zs = [1.0 / n] * n
        else:
            zs = [z / total_z for z in zs]

        mass_flow_kg_s = float(flow_kg_h) / 3600.0 if flow_kg_h else 1.0

        try:
            return self.engine.create_stream(
                T=T_K, P=P_Pa, zs=zs, mass_flow_kg_s=mass_flow_kg_s
            )
        except Exception as exc:
            logger.error("Failed to create feed stream '{}': {}", spec.id, exc)
            return None, [f"flash failed: {exc}"]

    # Maps unit-operation output keys (e.g. ShortcutDistillationOp returns
    # "distillate"/"bottoms") to solver port names used in _unit_outlets.
    _OUTLET_KEY_TO_PORT: Dict[str, str] = {
        "distillate": "vapor",
        "bottoms": "liquid",
        "overhead": "vapor",
        "residue": "liquid",
        "hot_out": "hot_out",
        "cold_out": "cold_out",
    }

    # Port name aliases: maps AI-generated port names to what unit operations expect
    _PORT_ALIASES: Dict[str, str] = {
        "overhead": "vapor",
        "bottoms": "liquid",
        "hot-in": "hot_in",
        "hot-out": "hot_out",
        "cold-in": "cold_in",
        "cold-out": "cold_out",
        "gas": "vapor",
        "oil": "liquid",
        "water": "liquid2",
        "suction": "in",
        "discharge": "out",
        "vapor": "vapor",
        "liquid": "liquid",
        "in": "in",
        "out": "out",
        "feed": "feed",
    }

    @classmethod
    def _extract_port(cls, handle: Any) -> Optional[str]:
        """Extract a port name from a handle string like 'suction-left' -> 'in'."""
        if handle is None:
            return None
        s = str(handle)
        # Remove direction suffixes
        for suffix in ("-left", "-right", "-top", "-bottom"):
            if s.endswith(suffix):
                s = s[: -len(suffix)]
                break
        # Handle feed-stage-N pattern → "feed"
        if s.startswith("feed-stage"):
            return "feed"
        # Apply alias if available
        return cls._PORT_ALIASES.get(s, s)
