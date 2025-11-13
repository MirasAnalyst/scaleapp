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

const HANDLE_ALIASES: Record<string, NodeHandleAliases> = {
  heaterCooler: {
    target: alias([
      ['hot-in-left', 'hot-in-left'],
      ['inlet', 'hot-in-left'],
      ['in', 'hot-in-left'],
      ['feed', 'hot-in-left'],
      ['process-in', 'hot-in-left'],
    ], 'hot-in-left'),
    source: alias([
      ['hot-out-right', 'hot-out-right'],
      ['outlet', 'hot-out-right'],
      ['out', 'hot-out-right'],
      ['product', 'hot-out-right'],
      ['process-out', 'hot-out-right'],
    ], 'hot-out-right'),
  },
  shellTubeHX: {
    target: alias([
      ['hot-in-left', 'hot-in-left'],
      ['inlet', 'hot-in-left'],
      ['in', 'hot-in-left'],
      ['feed', 'hot-in-left'],
      ['shell-inlet', 'hot-in-left'],
      ['process-in', 'hot-in-left'],
    ], 'hot-in-left'),
    source: alias([
      ['hot-out-right', 'hot-out-right'],
      ['outlet', 'hot-out-right'],
      ['out', 'hot-out-right'],
      ['product', 'hot-out-right'],
      ['shell-outlet', 'hot-out-right'],
      ['process-out', 'hot-out-right'],
    ], 'hot-out-right'),
  },
  airCooler: {
    target: alias([
      ['hot-in-left', 'hot-in-left'],
      ['inlet', 'hot-in-left'],
      ['in', 'hot-in-left'],
      ['feed', 'hot-in-left'],
    ], 'hot-in-left'),
    source: alias([
      ['hot-out-right', 'hot-out-right'],
      ['outlet', 'hot-out-right'],
      ['out', 'hot-out-right'],
      ['product', 'hot-out-right'],
    ], 'hot-out-right'),
  },
  plateHX: {
    target: alias([
      ['hot-in-left', 'hot-in-left'],
      ['inlet', 'hot-in-left'],
      ['feed', 'hot-in-left'],
    ], 'hot-in-left'),
    source: alias([
      ['hot-out-right', 'hot-out-right'],
      ['outlet', 'hot-out-right'],
      ['out', 'hot-out-right'],
    ], 'hot-out-right'),
  },
  doublePipeHX: {
    target: alias([
      ['hot-in-left', 'hot-in-left'],
      ['inlet', 'hot-in-left'],
      ['feed', 'hot-in-left'],
    ], 'hot-in-left'),
    source: alias([
      ['hot-out-right', 'hot-out-right'],
      ['outlet', 'hot-out-right'],
      ['out', 'hot-out-right'],
    ], 'hot-out-right'),
  },
  kettleReboiler: {
    target: alias([
      ['hot-in-left', 'hot-in-left'],
      ['inlet', 'hot-in-left'],
      ['feed', 'hot-in-left'],
      ['process-in', 'hot-in-left'],
    ], 'hot-in-left'),
    source: alias([
      ['hot-out-right', 'hot-out-right'],
      ['outlet', 'hot-out-right'],
      ['product', 'hot-out-right'],
      ['process-out', 'hot-out-right'],
    ], 'hot-out-right'),
  },
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
  separator: {
    target: alias([
      ['feed-left', 'feed-left'],
      ['inlet', 'feed-left'],
      ['feed', 'feed-left'],
      ['in', 'feed-left'],
    ], 'feed-left'),
    source: alias([
      ['vapor-top', 'vapor-top'],
      ['gas-top', 'vapor-top'],
      ['gas', 'vapor-top'],
      ['vapor', 'vapor-top'],
      ['outlet', 'vapor-top'],
      ['liquid-bottom', 'liquid-bottom'],
      ['liquid', 'liquid-bottom'],
      ['bottoms', 'liquid-bottom'],
    ], 'vapor-top'),
  },
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
  flashDrum: {
    target: alias([
      ['feed-left', 'feed-left'],
      ['inlet', 'feed-left'],
      ['feed', 'feed-left'],
    ], 'feed-left'),
    source: alias([
      ['vapor-top', 'vapor-top'],
      ['gas', 'vapor-top'],
      ['outlet', 'vapor-top'],
      ['liquid-bottom', 'liquid-bottom'],
      ['liquid', 'liquid-bottom'],
      ['bottoms', 'liquid-bottom'],
    ], 'vapor-top'),
  },
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
  horizontalVessel: {
    target: alias([
      ['in-left', 'in-left'],
      ['inlet', 'in-left'],
      ['feed', 'in-left'],
    ], 'in-left'),
    source: alias([
      ['out-right', 'out-right'],
      ['outlet', 'out-right'],
      ['product', 'out-right'],
    ], 'out-right'),
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
  return edges.map(edge => {
    const sourceType = nodeTypeMap.get(edge.source);
    const targetType = nodeTypeMap.get(edge.target);
    return {
      ...edge,
      sourceHandle: normalizeHandle(edge.sourceHandle, sourceType, 'source'),
      targetHandle: normalizeHandle(edge.targetHandle, targetType, 'target'),
    };
  });
};

export const normalizeFlowsheetHandles = (data: FlowSheetData): FlowSheetData => {
  return {
    ...data,
    edges: normalizeEdgeHandles(data.nodes, data.edges),
  };
};
