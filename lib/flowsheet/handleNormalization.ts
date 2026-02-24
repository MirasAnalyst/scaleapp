import type { FlowSheetData, FlowEdge, FlowNode } from '../../app/api/flowsheet/route';

type Role = 'source' | 'target';

type HandleAliasMap = Record<string, string> & { __default?: string };

interface NodeHandleAliases {
  source?: HandleAliasMap;
  target?: HandleAliasMap;
}

const alias = (entries: Array<[string, string]>, fallback?: string): HandleAliasMap => {
  const map: HandleAliasMap = {} as HandleAliasMap;
  if (fallback) {
    map.__default = fallback;
  }
  for (const [key, value] of entries) {
    map[key.toLowerCase()] = value;
  }
  return map;
};

// ---------------------------------------------------------------------------
// Reusable alias groups
// ---------------------------------------------------------------------------

// Group A — Simple in-left / out-right equipment
const GROUP_A_TARGET = alias([
  ['in-left', 'in-left'],
  ['inlet', 'in-left'],
  ['in', 'in-left'],
  ['feed', 'in-left'],
  ['feed-left', 'in-left'],
  ['suction-left', 'in-left'],
  ['process-in', 'in-left'],
], 'in-left');

const GROUP_A_SOURCE = alias([
  ['out-right', 'out-right'],
  ['outlet', 'out-right'],
  ['out', 'out-right'],
  ['product', 'out-right'],
  ['discharge-right', 'out-right'],
  ['process-out', 'out-right'],
], 'out-right');

const GROUP_A: NodeHandleAliases = { target: GROUP_A_TARGET, source: GROUP_A_SOURCE };

// Group B — Pump/compressor suction-left / discharge-right
const GROUP_B_TARGET = alias([
  ['suction-left', 'suction-left'],
  ['inlet', 'suction-left'],
  ['in', 'suction-left'],
  ['in-left', 'suction-left'],
  ['feed', 'suction-left'],
  ['suction', 'suction-left'],
], 'suction-left');

const GROUP_B_SOURCE = alias([
  ['discharge-right', 'discharge-right'],
  ['outlet', 'discharge-right'],
  ['out', 'discharge-right'],
  ['out-right', 'discharge-right'],
  ['product', 'discharge-right'],
  ['discharge', 'discharge-right'],
], 'discharge-right');

const GROUP_B: NodeHandleAliases = { target: GROUP_B_TARGET, source: GROUP_B_SOURCE };

// Group C — 2-phase separator (feed-left / vapor-top + liquid-bottom)
const GROUP_C_TARGET = alias([
  ['feed-left', 'feed-left'],
  ['inlet', 'feed-left'],
  ['feed', 'feed-left'],
  ['in', 'feed-left'],
], 'feed-left');

const GROUP_C_SOURCE = alias([
  ['vapor-top', 'vapor-top'],
  ['gas-top', 'vapor-top'],
  ['gas', 'vapor-top'],
  ['vapor', 'vapor-top'],
  ['outlet', 'vapor-top'],
  ['liquid-bottom', 'liquid-bottom'],
  ['liquid', 'liquid-bottom'],
  ['bottoms', 'liquid-bottom'],
], 'vapor-top');

const GROUP_C: NodeHandleAliases = { target: GROUP_C_TARGET, source: GROUP_C_SOURCE };

// Group D — Mixer (multiple in-N-left / out-right)
const GROUP_D_TARGET = alias([
  ['in-1-left', 'in-1-left'],
  ['in-2-left', 'in-2-left'],
  ['in-3-left', 'in-3-left'],
  ['in-1', 'in-1-left'],
  ['in-2', 'in-2-left'],
  ['in-3', 'in-3-left'],
  ['inlet', 'in-1-left'],
  ['in', 'in-1-left'],
  ['feed', 'in-1-left'],
], 'in-1-left');

const GROUP_D_SOURCE = alias([
  ['out-right', 'out-right'],
  ['outlet', 'out-right'],
  ['out', 'out-right'],
  ['product', 'out-right'],
], 'out-right');

const GROUP_D: NodeHandleAliases = { target: GROUP_D_TARGET, source: GROUP_D_SOURCE };

// Group E — Splitter/Tee (in-left / multiple out-N-right)
const GROUP_E_TARGET = alias([
  ['in-left', 'in-left'],
  ['inlet', 'in-left'],
  ['in', 'in-left'],
  ['feed', 'in-left'],
], 'in-left');

const GROUP_E_SOURCE = alias([
  ['out-1-right', 'out-1-right'],
  ['out-2-right', 'out-2-right'],
  ['out-3-right', 'out-3-right'],
  ['out-1', 'out-1-right'],
  ['out-2', 'out-2-right'],
  ['out-3', 'out-3-right'],
  ['outlet', 'out-1-right'],
  ['out', 'out-1-right'],
], 'out-1-right');

const GROUP_E: NodeHandleAliases = { target: GROUP_E_TARGET, source: GROUP_E_SOURCE };

// Group F — Column (feed-left + reflux-top / overhead-top + bottoms-bottom)
const GROUP_F_TARGET = alias([
  ['reflux-top', 'reflux-top'],
  ['reflux', 'reflux-top'],
  ['feed-left', 'feed-left'],
  ['in-left', 'feed-left'],
  ['inlet', 'feed-left'],
  ['in', 'feed-left'],
  ['feed', 'feed-left'],
], 'feed-left');

const GROUP_F_SOURCE = alias([
  ['overhead-top', 'overhead-top'],
  ['overhead', 'overhead-top'],
  ['distillate', 'overhead-top'],
  ['vapor-top', 'overhead-top'],
  ['vapor', 'overhead-top'],
  ['bottoms-bottom', 'bottoms-bottom'],
  ['bottoms', 'bottoms-bottom'],
  ['liquid-bottom', 'bottoms-bottom'],
  ['liquid', 'bottoms-bottom'],
], 'overhead-top');

const GROUP_F: NodeHandleAliases = { target: GROUP_F_TARGET, source: GROUP_F_SOURCE };

// Group F2 — Stripper (single-feed inlet with column-style outlets)
const GROUP_F2_TARGET = alias([
  ['feed-left', 'feed-left'],
  ['in-left', 'feed-left'],
  ['inlet', 'feed-left'],
  ['in', 'feed-left'],
  ['feed', 'feed-left'],
], 'feed-left');

const GROUP_F2: NodeHandleAliases = { target: GROUP_F2_TARGET, source: GROUP_F_SOURCE };

// Group G — Condenser / HX (hot-in-left / hot-out-right + cold-in-bottom / cold-out-top)
const GROUP_G_TARGET = alias([
  ['hot-in-left', 'hot-in-left'],
  ['inlet', 'hot-in-left'],
  ['in', 'hot-in-left'],
  ['feed', 'hot-in-left'],
  ['process-in', 'hot-in-left'],
  ['cold-in-bottom', 'cold-in-bottom'],
  ['utility-in', 'cold-in-bottom'],
  ['cold-inlet', 'cold-in-bottom'],
], 'hot-in-left');

const GROUP_G_SOURCE = alias([
  ['hot-out-right', 'hot-out-right'],
  ['outlet', 'hot-out-right'],
  ['out', 'hot-out-right'],
  ['product', 'hot-out-right'],
  ['process-out', 'hot-out-right'],
  ['cold-out-top', 'cold-out-top'],
  ['utility-out', 'cold-out-top'],
  ['cold-outlet', 'cold-out-top'],
], 'hot-out-right');

const GROUP_G: NodeHandleAliases = { target: GROUP_G_TARGET, source: GROUP_G_SOURCE };

// ---------------------------------------------------------------------------
// HANDLE_ALIASES — maps every equipment type to its alias group
// ---------------------------------------------------------------------------

const HANDLE_ALIASES: Record<string, NodeHandleAliases> = {
  // Group A — Simple in-left / out-right
  valve:              GROUP_A,
  controlValve:       GROUP_A,
  checkValve:         GROUP_A,
  throttleValve:      GROUP_A,
  prv:                GROUP_A,
  turbine:            GROUP_A,
  steamTurbine:       GROUP_A,
  cstr:               GROUP_A,
  pfr:                GROUP_A,
  conversionReactor:  GROUP_A,
  equilibriumReactor: GROUP_A,
  batchReactor:       GROUP_A,
  kineticReactor:     GROUP_A,
  boiler:             GROUP_A,
  filter:             GROUP_A,
  adsorber:           GROUP_A,
  membrane:           GROUP_A,
  pipeSegment:        GROUP_A,
  pipeline:           GROUP_A,
  pipe:               GROUP_A,
  horizontalVessel:   GROUP_A,
  firedHeater: {
    target: alias([
      ['in-left', 'in-left'],
      ['inlet', 'in-left'],
      ['feed', 'in-left'],
      ['process-in', 'in-left'],
    ], 'in-left'),
    source: alias([
      ['out-right', 'out-right'],
      ['outlet', 'out-right'],
      ['product', 'out-right'],
      ['process-out', 'out-right'],
    ], 'out-right'),
  },

  // Group B — Pump/compressor suction-left / discharge-right
  pump:               GROUP_B,
  compressor:         GROUP_B,
  recipPump:          GROUP_A,
  recipCompressor:    GROUP_A,
  gibbsReactor:       GROUP_A,

  // Group C — 2-phase separator
  separator:          GROUP_C,
  flashDrum:          GROUP_C,
  surgeDrum:          GROUP_C,
  knockoutDrumH:      GROUP_C,
  refluxDrum:         GROUP_C,
  cyclone:            GROUP_C,

  // Group D — Mixer
  mixer:              GROUP_D,

  // Group E — Splitter/Tee
  splitter:           GROUP_E,
  tee:                GROUP_E,

  // Group F — Column
  distillationColumn: GROUP_F,
  packedColumn:       GROUP_F,
  absorber:           GROUP_F,
  rigorousDistillationColumn: GROUP_F,

  // Group F2 — Stripper (single-feed, column-style outlets)
  stripper:           GROUP_F2,

  // Group G — Condenser / HX
  condenser:          GROUP_G,
  heaterCooler:       GROUP_G,
  airCooler:          GROUP_G,
  kettleReboiler:     GROUP_G,
  shellTubeHX: {
    target: alias([
      ['hot-in-left', 'hot-in-left'],
      ['inlet', 'hot-in-left'],
      ['in', 'hot-in-left'],
      ['feed', 'hot-in-left'],
      ['shell-inlet', 'hot-in-left'],
      ['process-in', 'hot-in-left'],
      ['cold-in-bottom', 'cold-in-bottom'],
      ['utility-in', 'cold-in-bottom'],
      ['cold-inlet', 'cold-in-bottom'],
      ['tube-inlet', 'cold-in-bottom'],
    ], 'hot-in-left'),
    source: alias([
      ['hot-out-right', 'hot-out-right'],
      ['outlet', 'hot-out-right'],
      ['out', 'hot-out-right'],
      ['product', 'hot-out-right'],
      ['shell-outlet', 'hot-out-right'],
      ['process-out', 'hot-out-right'],
      ['cold-out-top', 'cold-out-top'],
      ['utility-out', 'cold-out-top'],
      ['cold-outlet', 'cold-out-top'],
      ['tube-outlet', 'cold-out-top'],
    ], 'hot-out-right'),
  },
  plateHX:            GROUP_G,
  doublePipeHX:       GROUP_G,

  // Common AI alias types
  reactor:            GROUP_A,
  cooler:             GROUP_G,
  heater:             GROUP_G,
  reboiler:           GROUP_G,
  furnace: {
    target: alias([
      ['in-left', 'in-left'],
      ['inlet', 'in-left'],
      ['feed', 'in-left'],
      ['process-in', 'in-left'],
    ], 'in-left'),
    source: alias([
      ['out-right', 'out-right'],
      ['outlet', 'out-right'],
      ['product', 'out-right'],
      ['process-out', 'out-right'],
    ], 'out-right'),
  },
  expander:           GROUP_A,
  fan:                GROUP_B,
  blower:             GROUP_B,
  scrubber:           GROUP_F,

  // 3-phase separator (unique — 3 outlets)
  separator3p: {
    target: alias([
      ['feed-left', 'feed-left'],
      ['inlet', 'feed-left'],
      ['feed', 'feed-left'],
    ], 'feed-left'),
    source: alias([
      ['gas-top', 'gas-top'],
      ['vapor-top', 'gas-top'],
      ['gas', 'gas-top'],
      ['vapor', 'gas-top'],
      ['oil-right', 'oil-right'],
      ['liquid-right', 'oil-right'],
      ['oil', 'oil-right'],
      ['water-bottom', 'water-bottom'],
      ['liquid-bottom', 'water-bottom'],
      ['water', 'water-bottom'],
      ['bottoms', 'water-bottom'],
    ], 'gas-top'),
  },

  // Tank (unique — in-top / out-bottom)
  tank: {
    target: alias([
      ['in-top', 'in-top'],
      ['inlet', 'in-top'],
      ['feed', 'in-top'],
    ], 'in-top'),
    source: alias([
      ['out-bottom', 'out-bottom'],
      ['outlet', 'out-bottom'],
      ['product', 'out-bottom'],
      ['bottoms', 'out-bottom'],
    ], 'out-bottom'),
  },
};

const normalizeHandle = (
  handleId: string | undefined,
  nodeType: string | undefined,
  role: Role,
): string | undefined => {
  if (!nodeType) return handleId;
  const aliasConfig = HANDLE_ALIASES[nodeType]?.[role];
  if (!aliasConfig) return handleId;
  if (handleId) {
    const lower = handleId.toLowerCase();
    const normalized = aliasConfig[handleId] ?? aliasConfig[lower];
    if (normalized) {
      return normalized;
    }
  }
  return aliasConfig.__default ?? handleId;
};

const normalizeEdgeHandles = (nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] => {
  const nodeTypeMap = new Map(nodes.map(node => [node.id, node.type]));
  return edges
    .filter(edge => nodeTypeMap.has(edge.source) && nodeTypeMap.has(edge.target)) // drop edges to removed nodes
    .map(edge => {
      const sourceType = nodeTypeMap.get(edge.source);
      const targetType = nodeTypeMap.get(edge.target);
      const sourceHandle = normalizeHandle(edge.sourceHandle, sourceType, 'source') ?? 'outlet';
      const targetHandle = normalizeHandle(edge.targetHandle, targetType, 'target') ?? 'inlet';
      return {
        ...edge,
        sourceHandle,
        targetHandle,
      };
    });
};

export const normalizeFlowsheetHandles = (data: FlowSheetData): FlowSheetData => {
  const allNodes = data.nodes || [];
  const allEdges = data.edges || [];

  // Build type map from ALL nodes (including labels) so no edges are dropped
  const nodeTypeMap = new Map(allNodes.map(node => [node.id, node.type]));

  const normalizedEdges = allEdges
    .filter(edge => nodeTypeMap.has(edge.source) && nodeTypeMap.has(edge.target))
    .map(edge => {
      const sourceType = nodeTypeMap.get(edge.source);
      const targetType = nodeTypeMap.get(edge.target);
      // Skip both-label edges entirely; for mixed edges, only normalize the equipment side
      if (sourceType === 'label' && targetType === 'label') return edge;
      const sourceHandle = sourceType === 'label'
        ? edge.sourceHandle
        : (normalizeHandle(edge.sourceHandle, sourceType, 'source') ?? 'outlet');
      const targetHandle = targetType === 'label'
        ? edge.targetHandle
        : (normalizeHandle(edge.targetHandle, targetType, 'target') ?? 'inlet');
      return { ...edge, sourceHandle, targetHandle };
    });

  return { ...data, nodes: allNodes, edges: normalizedEdges };
};
