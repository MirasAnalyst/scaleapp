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
        "cyclone": ["vapor", "liquid"],
        "distillationColumn": ["distillate", "bottoms"],
        "rigorousDistillationColumn": ["distillate", "bottoms"],
        "packedColumn": ["distillate", "bottoms"],
        "absorber": ["vapor", "liquid"],
        "stripper": ["vapor", "liquid"],
        "splitter": ["out-1", "out-2", "out-3"],
        "shellTubeHX": ["hot_out", "cold_out"],
        "plateHX": ["hot_out", "cold_out"],
        "doublePipeHX": ["hot_out", "cold_out"],
    }

    # Default inlet ports for multi-inlet units
    _DEFAULT_INLET_PORTS: Dict[str, List[str]] = {
        "mixer": ["in-1", "in-2", "in-3"],
        "absorber": ["in-1", "in-2"],
        "stripper": ["in"],
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

        # Energy streams: source_unit → target_unit with duty routing
        self._energy_streams: List[schemas.EnergyStreamSpec] = []
        # Cached duty values from producing units
        self._unit_duties: Dict[str, float] = {}

        # Per-unit engine overrides: unit_id → ThermoEngine
        self._unit_engines: Dict[str, ThermoEngine] = {}
        # Engine cache keyed by (package, tuple(components)) to avoid duplicates
        self._engine_cache: Dict[Tuple[str, Tuple[str, ...]], ThermoEngine] = {}

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

            # Per-unit property package override
            if unit_spec.property_package and unit_spec.components:
                pkg = unit_spec.property_package
                comps = tuple(unit_spec.components)
                cache_key = (pkg, comps)
                if cache_key not in self._engine_cache:
                    try:
                        self._engine_cache[cache_key] = ThermoEngine(
                            component_names=list(comps),
                            property_package=pkg,
                        )
                    except Exception as exc:
                        logger.warning(
                            "Failed to create per-unit engine for '{}' ({}): {}",
                            unit_spec.id, pkg, exc,
                        )
                if cache_key in self._engine_cache:
                    self._unit_engines[unit_spec.id] = self._engine_cache[cache_key]
                    unit.engine = self._unit_engines[unit_spec.id]

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
                # Collision guard: loop until we find an unused port
                max_attempts = 5
                while port in self._unit_inlets[conn.to_unit] and max_attempts > 0:
                    port = self._next_default_port(conn.to_unit, "inlet")
                    max_attempts -= 1
                if port in self._unit_inlets[conn.to_unit]:
                    port = f"in-{stream_spec.id}"
                self._unit_inlets[conn.to_unit][port] = stream_spec.id
            if conn.from_unit:
                port = conn.from_port
                if port is None:
                    port = self._next_default_port(conn.from_unit, "outlet")
                # Collision guard: loop until we find an unused port
                max_attempts = 5
                while port in self._unit_outlets[conn.from_unit] and max_attempts > 0:
                    port = self._next_default_port(conn.from_unit, "outlet")
                    max_attempts -= 1
                if port in self._unit_outlets[conn.from_unit]:
                    port = f"out-{stream_spec.id}"
                self._unit_outlets[conn.from_unit][port] = stream_spec.id

        # 2b. Parse energy streams
        if hasattr(payload, 'energy_streams') and payload.energy_streams:
            self._energy_streams = list(payload.energy_streams)

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

            if not is_external_feed:
                continue  # Solver computes all internal/product streams

            result = self._create_feed_stream(stream_spec)
            # Handle both return forms: StreamState or (None, missing_fields)
            if isinstance(result, tuple):
                _, missing_fields = result
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
        max_iterations: int = 100,
        tolerance: float = 1e-4,
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
        # Wegstein needs both input (x) and output g(x) for each iteration
        tear_input_history: Dict[str, List[List[float]]] = {sid: [] for sid in tear_streams}
        tear_output_history: Dict[str, List[List[float]]] = {sid: [] for sid in tear_streams}

        for iteration in range(1, max_iterations + 1):
            # Snapshot tear stream states BEFORE calculating so convergence
            # check compares old vs new (not new vs new, which always = 0).
            tear_snapshots: Dict[str, StreamState] = {}
            for sid in tear_streams:
                s = self.streams.get(sid)
                if s is not None:
                    tear_snapshots[sid] = copy.deepcopy(s)

            # Clear unit warnings each iteration (only final iteration's are kept)
            for unit in self.units.values():
                unit.warnings.clear()

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
                old_state = tear_snapshots.get(sid)      # BEFORE calc
                new_state = self.streams.get(sid)         # AFTER calc (overwritten by upstream unit)
                if old_state is None or new_state is None:
                    continue

                err = self._stream_distance(old_state, new_state)
                max_err = max(max_err, err)

                # Wegstein tracks x (input to iteration) and g(x) (output)
                x_vec = self._stream_to_vector(old_state)   # input this iteration
                gx_vec = self._stream_to_vector(new_state)  # output this iteration
                tear_input_history[sid].append(x_vec)
                tear_output_history[sid].append(gx_vec)

                # Apply Wegstein acceleration once we have >= 2 pairs
                n_hist = len(tear_input_history[sid])
                if n_hist >= 2:
                    accelerated = self._wegstein_update(
                        tear_input_history[sid], tear_output_history[sid]
                    )
                    self.streams[sid] = self._vector_to_stream(
                        accelerated, new_state
                    )
                else:
                    # Direct substitution for first iteration
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
            if hasattr(self, '_missing_products') and self._missing_products:
                warnings.append(
                    f"Product stream(s) have no calculated state: {self._missing_products}"
                )
        else:
            mass_err = None
            energy_err = None
        # Pressure profile validation
        pressure_warnings = self._validate_pressure_profile()
        warnings.extend(pressure_warnings)

        # Per-unit mass balance checks
        if calculated_streams > 0:
            unit_balance_warnings = self._check_per_unit_mass_balance()
            warnings.extend(unit_balance_warnings)

        # Stream condition warnings (extreme T or P)
        stream_condition_warnings = self._check_stream_conditions()
        warnings.extend(stream_condition_warnings)

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

        # Re-flash inlets at package boundary if unit has a custom engine
        unit_engine = self._unit_engines.get(unit.id)
        if unit_engine is not None and unit_engine is not self.engine:
            reflashed: Dict[str, StreamState] = {}
            for port, state in inlets.items():
                try:
                    # Map compositions: find matching components by name
                    new_zs = []
                    for comp_name in unit_engine.component_names:
                        idx = None
                        for i, src_name in enumerate(state.component_names):
                            if src_name.lower() == comp_name.lower():
                                idx = i
                                break
                        if idx is not None and idx < len(state.zs):
                            new_zs.append(state.zs[idx])
                        else:
                            new_zs.append(0.0)
                    total_z = sum(new_zs)
                    if total_z > 0:
                        new_zs = [z / total_z for z in new_zs]
                    else:
                        new_zs = [1.0 / unit_engine.n] * unit_engine.n
                    reflashed[port] = unit_engine.pt_flash(
                        T=state.temperature, P=state.pressure,
                        zs=new_zs, molar_flow=state.molar_flow,
                    )
                except Exception as exc:
                    logger.warning(
                        "Re-flash failed for inlet '{}' of unit '{}': {}",
                        port, unit.id, exc,
                    )
                    reflashed[port] = state
            inlets = reflashed

        # Energy stream injection: if an energy stream targets this unit,
        # inject the available duty as duty_kw parameter
        for es in self._energy_streams:
            if es.target_unit == unit.id:
                if es.source_unit and es.source_unit in self._unit_duties:
                    # Inject duty from source unit (convert W → kW)
                    injected_duty = self._unit_duties[es.source_unit] / 1000.0
                    unit.params["duty_kw"] = injected_duty
                    logger.info(
                        "Energy stream '{}': injecting {:.2f} kW from '{}' to '{}'",
                        es.id, injected_duty, es.source_unit, es.target_unit,
                    )
                elif es.duty_kw is not None:
                    # Fixed duty specified on the energy stream itself
                    unit.params["duty_kw"] = es.duty_kw

        outlets = unit.calculate(inlets)

        # Store duty for energy stream routing
        self._unit_duties[unit.id] = unit.duty_W

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

        # Warn if some outlet streams were never populated
        if len(assigned_streams) < len(outlets):
            all_outgoing = {c.stream_id for c in self.connections if c.from_unit == unit.id}
            missing = all_outgoing - assigned_streams
            if missing:
                unit.warnings.append(
                    f"{len(missing)} outlet(s) not populated: {missing}. "
                    f"Unit keys: {list(outlets.keys())}; Ports: {dict(outlet_ports)}"
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
        """Select streams to tear for each SCC with > 1 unit.

        Iteratively tears edges and checks if the remaining graph within
        the SCC is still cyclic.  Continues adding tears until the SCC
        subgraph becomes acyclic (DAG).  This handles complex topologies
        like TEG dehydration loops where a single tear is insufficient.
        """
        tear_streams: List[str] = []
        for scc in sccs:
            if len(scc) <= 1:
                continue
            scc_set = set(scc)
            torn_set: Set[str] = set()

            # Collect all internal edges
            internal_edges = [
                conn for conn in self.connections
                if conn.from_unit in scc_set and conn.to_unit in scc_set
            ]

            # Iteratively tear until acyclic
            max_tears = len(internal_edges)
            for _ in range(max_tears):
                # Build adjacency with current tears removed
                adj: Dict[str, Set[str]] = defaultdict(set)
                for conn in internal_edges:
                    if conn.stream_id not in torn_set:
                        adj[conn.from_unit].add(conn.to_unit)

                # Check if remaining graph is acyclic (DFS cycle detection)
                has_cycle = False
                visited: Set[str] = set()
                on_stack: Set[str] = set()

                def _has_cycle_dfs(u: str) -> bool:
                    visited.add(u)
                    on_stack.add(u)
                    for v in adj.get(u, set()):
                        if v not in scc_set:
                            continue
                        if v in on_stack:
                            return True
                        if v not in visited and _has_cycle_dfs(v):
                            return True
                    on_stack.discard(u)
                    return False

                for node in scc:
                    if node not in visited:
                        if _has_cycle_dfs(node):
                            has_cycle = True
                            break

                if not has_cycle:
                    break  # SCC is now acyclic

                # Find a back-edge to tear: pick edge from a node on the
                # stack back to an earlier node.  Fall back to the first
                # untorn internal edge.
                tore_one = False
                for conn in internal_edges:
                    if conn.stream_id in torn_set:
                        continue
                    # Simple heuristic: tear this edge
                    torn_set.add(conn.stream_id)
                    tear_streams.append(conn.stream_id)
                    tore_one = True
                    break

                if not tore_one:
                    break  # No more edges to tear

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
        """Create an initial estimate for a tear stream.

        Uses context-aware template selection:
        - If the tear stream exits from a column/stripper/absorber liquid port,
          look for a solvent-type feed (second inlet to the absorber/stripper)
          and use it as the template so the initial guess has the right
          composition for lean-solvent recycle loops.
        - Otherwise, fall back to the first feed stream at ~30% flow.

        Uses ~30% of template flow as initial guess to avoid over-estimation
        and oscillation in recycle loops.
        """
        scale = 0.3  # 30% of template flow to avoid oscillation

        # --- Context-aware template selection ---
        _COLUMN_TYPES = {"absorber", "stripper", "distillation_column",
                         "distillation", "absorber_column", "stripper_column"}
        _LIQUID_PORT_KEYWORDS = {"liquid", "bottoms"}

        conn = self._stream_connection.get(stream_id)
        if conn and conn.from_unit and self.feed_streams:
            from_type = (self._unit_types.get(conn.from_unit) or "").lower()
            from_port = (conn.from_port or "").lower()

            # Check if tear exits from a column-type unit's liquid/bottoms port
            is_column_liquid = (
                any(ct in from_type for ct in _COLUMN_TYPES)
                and any(kw in from_port for kw in _LIQUID_PORT_KEYWORDS)
            )

            if is_column_liquid:
                # Search for a solvent-type feed: a feed stream that connects
                # to an absorber or stripper as a secondary inlet (port "in-2"
                # or higher, i.e. not the primary "in-1" / "in" port).
                solvent_ref = None
                for feed_sid, feed_state in self.feed_streams.items():
                    feed_conn = self._stream_connection.get(feed_sid)
                    if not feed_conn or not feed_conn.to_unit:
                        continue
                    target_type = (self._unit_types.get(feed_conn.to_unit) or "").lower()
                    target_port = (feed_conn.to_port or "").lower()
                    if (any(ct in target_type for ct in _COLUMN_TYPES)
                            and target_port not in ("in", "in-1", "feed", "")
                            and "in" in target_port):
                        solvent_ref = feed_state
                        break

                if solvent_ref is not None:
                    return StreamState(
                        temperature=solvent_ref.temperature,
                        pressure=solvent_ref.pressure,
                        phase=solvent_ref.phase,
                        vapor_fraction=solvent_ref.vapor_fraction,
                        liquid_fraction=solvent_ref.liquid_fraction,
                        zs=list(solvent_ref.zs),
                        enthalpy=solvent_ref.enthalpy,
                        entropy=solvent_ref.entropy,
                        heat_capacity=solvent_ref.heat_capacity,
                        molecular_weight=solvent_ref.molecular_weight,
                        density=solvent_ref.density,
                        molar_flow=solvent_ref.molar_flow * scale,
                        mass_flow=solvent_ref.mass_flow * scale,
                        component_names=list(solvent_ref.component_names),
                    )

        # --- Default: use first feed stream as template ---
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
                molar_flow=ref.molar_flow * scale,
                mass_flow=ref.mass_flow * scale,
                component_names=list(ref.component_names),
            )
        # Fallback: ambient conditions
        zs = [1.0 / self.engine.n] * self.engine.n
        return self.engine.pt_flash(T=298.15, P=101325.0, zs=zs, molar_flow=1.0)

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
    def _wegstein_update(
        x_history: List[List[float]],
        gx_history: List[List[float]],
    ) -> List[float]:
        """
        Wegstein acceleration for tear stream convergence.

        Uses the two most recent (x, g(x)) pairs:
            s_i = (g(x_n)_i - g(x_{n-1})_i) / (x_n_i - x_{n-1}_i)
            q_i = s_i / (s_i - 1)
            x_{n+1}_i = q_i * g(x_n)_i + (1 - q_i) * x_n_i

        Bounds q to [0, 1] (direct substitution to averaging) for stability.
        """
        x_n = x_history[-1]
        x_nm1 = x_history[-2]
        gx_n = gx_history[-1]
        gx_nm1 = gx_history[-2]

        result = []
        for i in range(len(x_n)):
            dx = x_n[i] - x_nm1[i]
            dgx = gx_n[i] - gx_nm1[i]
            if abs(dx) > 1e-15:
                s = dgx / dx
                # Bound s ∈ [-5, 0] to keep q ∈ [0, 5/6] for stability.
                # s > 0 → q < 0, causing divergent oscillations.
                # s < -5 → q > 5/6, overly aggressive extrapolation.
                s = max(min(s, 0.0), -5.0)
                q = s / (s - 1.0)
                val = q * gx_n[i] + (1.0 - q) * x_n[i]
            else:
                val = gx_n[i]  # Direct substitution
            result.append(val)
        return result

    # ------------------------------------------------------------------
    # Balance checks
    # ------------------------------------------------------------------

    def _check_mass_balance(self) -> Optional[float]:
        """Check overall mass balance: sum(feeds) - sum(products).

        Only counts streams that cross the process boundary (leave the
        known-unit graph).  For closed loops (e.g. Rankine cycle) where
        no products leave, returns 0.0 instead of a spurious 100% error.
        Returns None when product streams are missing (can't compute).
        """
        feed_mass = sum(s.mass_flow for s in self.feed_streams.values())
        if feed_mass <= 0:
            return 0.0

        known_ids = set(self.units.keys())
        product_mass = 0.0
        self._missing_products: List[str] = []
        for conn in self.connections:
            if conn.stream_id in self.feed_streams:
                continue
            # Product = stream that leaves the known-unit boundary
            is_product = conn.to_unit is None or conn.to_unit not in known_ids
            if not is_product:
                continue
            state = self.streams.get(conn.stream_id)
            if state is None:
                self._missing_products.append(conn.stream_id)
                continue
            product_mass += state.mass_flow

        # Can't compute balance with missing product streams
        if self._missing_products:
            return None

        # For closed loops (no products leave), skip balance check
        if product_mass <= 0 or product_mass < feed_mass * 1e-6:
            return 0.0

        return abs(feed_mass - product_mass) / feed_mass

    # Heat exchangers transfer energy internally between process streams;
    # both outlet enthalpies already reflect the transfer, so including
    # their duty in the overall balance double-counts it.
    _INTERNAL_TRANSFER_TYPES = {"shellTubeHX", "plateHX", "doublePipeHX"}

    def _check_energy_balance(self) -> float:
        """Check overall energy balance including unit duties.

        Same boundary logic as mass balance: only streams crossing the
        process boundary are counted.  Closed loops return 0.0.

        Heat exchanger duties are excluded from total_duty because they
        represent internal energy transfers — the outlet enthalpies of
        both sides already account for the transfer.

        Uses max(|feed_energy|, |product_energy|, 1.0) as the
        denominator to avoid near-zero division when enthalpies are
        large negative numbers that nearly cancel with duties.
        """
        feed_energy = 0.0
        for s in self.feed_streams.values():
            feed_energy += s.molar_flow * s.enthalpy

        known_ids = set(self.units.keys())
        product_energy = 0.0
        has_products = False
        for conn in self.connections:
            state = self.streams.get(conn.stream_id)
            if state is None or conn.stream_id in self.feed_streams:
                continue
            # Product = stream that leaves the known-unit boundary
            if conn.to_unit is None or conn.to_unit not in known_ids:
                product_energy += state.molar_flow * state.enthalpy
                has_products = True

        # For closed loops (no products leave), skip balance check
        if not has_products:
            return 0.0

        # Exclude internal-transfer units (heat exchangers with both sides
        # connected) from total duty.  A one-sided HX acts as a heater/cooler
        # and its duty IS real energy added/removed from the system.
        total_duty = 0.0
        for uid, u in self.units.items():
            utype = self._unit_types.get(uid)
            if utype in self._INTERNAL_TRANSFER_TYPES:
                # Only exclude if both sides are connected (2+ inlets)
                n_inlets = len(self._unit_inlets.get(uid, {}))
                if n_inlets >= 2:
                    continue  # internal transfer — skip
            total_duty += u.duty_W

        energy_in = feed_energy + total_duty
        scale = max(abs(feed_energy), abs(product_energy), 1.0)
        return abs(energy_in - product_energy) / scale

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _check_per_unit_mass_balance(self) -> List[str]:
        """Check mass balance around each individual unit operation.

        Compares total inlet mass flow vs total outlet mass flow.
        Warns if error > 2% (allowing for small numerical tolerance).
        """
        warnings: List[str] = []
        for unit_id, unit in self.units.items():
            inlet_ports = self._unit_inlets.get(unit_id, {})
            outlet_ports = self._unit_outlets.get(unit_id, {})

            inlet_mass = 0.0
            for port, sid in inlet_ports.items():
                state = self.streams.get(sid)
                if state is not None:
                    inlet_mass += state.mass_flow

            outlet_mass = 0.0
            for port, sid in outlet_ports.items():
                state = self.streams.get(sid)
                if state is not None:
                    outlet_mass += state.mass_flow

            if inlet_mass <= 0 or outlet_mass <= 0:
                continue

            error = abs(inlet_mass - outlet_mass) / inlet_mass
            if error > 0.02:
                warnings.append(
                    f"[{unit.name}] Mass balance error {error*100:.1f}% "
                    f"(in: {inlet_mass:.2f} kg/s, out: {outlet_mass:.2f} kg/s)"
                )
        return warnings

    def _check_stream_conditions(self) -> List[str]:
        """Flag streams with extreme conditions that may indicate errors."""
        warnings: List[str] = []
        for sid, state in self.streams.items():
            if sid in self.feed_streams:
                continue
            P_kpa = state.pressure / 1000.0
            T_K = state.temperature
            if P_kpa < 10:
                warnings.append(
                    f"Stream '{sid}' pressure {P_kpa:.1f} kPa is very low (<10 kPa)"
                )
            if T_K < 100:
                warnings.append(
                    f"Stream '{sid}' temperature {T_K - 273.15:.0f}°C is extremely low (<-173°C)"
                )
        return warnings

    def _validate_pressure_profile(self) -> List[str]:
        """Walk all connections and warn if pressure rises through non-pressure-raising equipment."""
        PRESSURE_RAISING = {"pump", "recipPump", "compressor", "recipCompressor",
                           "polytropicCompressor"}
        # Units that legitimately operate at a set pressure (may differ from inlet)
        SET_PRESSURE_UNITS = {"absorber", "stripper", "flashDrum", "separator",
                              "separatorHorizontal", "separator3p", "knockoutDrumH",
                              "surgeDrum", "refluxDrum", "tank", "horizontalVessel",
                              "distillationColumn", "rigorousDistillationColumn",
                              "packedColumn", "mixer", "heaterCooler", "firedHeater",
                              "boiler", "condenser", "airCooler", "kettleReboiler",
                              "conversionReactor", "cstr", "pfr", "gibbsReactor",
                              "kineticReactor", "equilibriumReactor"}
        warnings: List[str] = []
        for conn in self.connections:
            if not conn.from_unit or not conn.to_unit:
                continue
            if conn.to_unit not in self.units:
                continue
            unit_type = self._unit_types.get(conn.to_unit)
            if unit_type in PRESSURE_RAISING or unit_type in SET_PRESSURE_UNITS:
                continue
            # Get inlet and outlet stream states
            inlet_stream = None
            outlet_stream = self.streams.get(conn.stream_id)
            for port, sid in self._unit_inlets.get(conn.from_unit, {}).items():
                if sid in self.streams:
                    inlet_stream = self.streams[sid]
                    break
            if outlet_stream and inlet_stream:
                if outlet_stream.pressure > inlet_stream.pressure + 1000.0:
                    logger.debug(
                        "Pressure rises from {:.1f} kPa to {:.1f} kPa through '{}' (type: {})",
                        inlet_stream.pressure / 1000, outlet_stream.pressure / 1000,
                        conn.to_unit, unit_type,
                    )
        return warnings

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

        # Composition basis detection
        composition_basis = (
            props.get("composition_basis", "mole")
            or "mole"
        ).lower().strip()

        # Support alternative composition keys
        if not composition and props.get("mass_composition"):
            composition = props["mass_composition"]
            composition_basis = "mass"
        if not composition and props.get("component_mass_flows"):
            composition = props["component_mass_flows"]
            composition_basis = "mass"

        # Build raw fractions aligned with engine components
        from .thermo_engine import ThermoEngine

        raw_fracs = []
        for name in self.engine.component_names:
            frac = composition.get(name, 0.0)
            # Try case-insensitive match with underscore/hyphen/space normalization
            if frac == 0.0:
                norm_name = name.lower().replace('-', ' ').replace('_', ' ').strip()
                for k, v in composition.items():
                    norm_k = k.lower().replace('-', ' ').replace('_', ' ').strip()
                    if norm_k == norm_name or k.lower() == name.lower():
                        frac = v
                        break
            # Try compound alias resolution (CO2 -> carbon dioxide, H2S -> hydrogen sulfide, etc.)
            if frac == 0.0:
                for k, v in composition.items():
                    resolved = ThermoEngine._normalize_compound_name(k)
                    resolved_norm = resolved.lower().replace('-', ' ').replace('_', ' ').strip()
                    if resolved_norm == norm_name:
                        frac = v
                        break
            raw_fracs.append(float(frac))

        total_raw = sum(raw_fracs)
        if total_raw <= 0:
            logger.warning(
                "Stream '{}' has zero composition — falling back to equal mole fractions",
                spec.id,
            )
            n = len(self.engine.component_names)
            zs = [1.0 / n] * n
        elif composition_basis == "mass":
            # Convert mass fractions to mole fractions: ws[i]/MW[i] normalized
            MWs = self.engine.constants.MWs  # g/mol
            raw = []
            for i in range(len(raw_fracs)):
                mw_i = MWs[i] if i < len(MWs) and MWs[i] > 0 else 1.0
                raw.append(raw_fracs[i] / mw_i)
            total = sum(raw)
            zs = [r / total for r in raw] if total > 0 else [1.0 / len(raw_fracs)] * len(raw_fracs)
        elif composition_basis == "volume":
            # Convert volume fractions to mole fractions using liquid molar volumes at STP
            try:
                Vms = self.engine.constants.Vml_STPs  # m³/mol at STP
            except AttributeError:
                Vms = None
            if Vms:
                raw = []
                for i in range(len(raw_fracs)):
                    vm_i = Vms[i] if i < len(Vms) and Vms[i] and Vms[i] > 0 else 1e-5
                    raw.append(raw_fracs[i] / vm_i)
                total = sum(raw)
                zs = [r / total for r in raw] if total > 0 else [1.0 / len(raw_fracs)] * len(raw_fracs)
            else:
                logger.warning("Volume basis requested but molar volumes unavailable, treating as mole fractions")
                zs = [f / total_raw for f in raw_fracs]
        else:
            # Default: mole fractions
            zs = [f / total_raw for f in raw_fracs]

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
        # 3-phase separator: unit returns "gas"/"oil"/"water",
        # but _PORT_ALIASES transforms handles to "vapor"/"liquid"/"liquid2"
        "gas": "vapor",
        "oil": "liquid",
        "water": "liquid2",
        # Flash drum: identity mappings for safety
        "vapor": "vapor",
        "liquid": "liquid",
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
        "inlet": "in",
        "outlet": "out",
        "product": "out",
        "liquid2": "liquid2",
        "aqueous": "liquid2",
        "reflux": "reflux",
        "distillate": "vapor",
        "hot": "hot_in",
        "cold": "cold_in",
        "top": "vapor",
        "bottom": "liquid",
        "condensate": "liquid",
    }

    @classmethod
    def _extract_port(cls, handle: Any) -> Optional[str]:
        """Extract a port name from a handle string like 'suction-left' -> 'in'.

        Iteratively strips positional and flow-direction suffixes, checking
        _PORT_ALIASES after each strip so compound names like 'hot-out' are
        resolved before being further decomposed.
        """
        if handle is None:
            return None
        s = str(handle)
        # Handle feed-stage-N pattern → "feed"
        if s.startswith("feed-stage"):
            return "feed"
        # Check direct alias match first
        if s in cls._PORT_ALIASES:
            return cls._PORT_ALIASES[s]
        # Iteratively strip suffixes, checking aliases after each
        _SUFFIXES = ("-left", "-right", "-top", "-bottom", "-out", "-in", "-outlet", "-inlet")
        changed = True
        while changed:
            changed = False
            for suffix in _SUFFIXES:
                if s.endswith(suffix):
                    candidate = s[: -len(suffix)]
                    if candidate in cls._PORT_ALIASES:
                        return cls._PORT_ALIASES[candidate]
                    s = candidate
                    changed = True
                    break
        return cls._PORT_ALIASES.get(s, s)
