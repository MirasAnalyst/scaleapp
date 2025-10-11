'use client';

import React, { useState, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  Save,
  ArrowRight,
  Circle,
  Square,
  Triangle
} from 'lucide-react';

interface Node {
  id: string;
  type: 'tank' | 'valve' | 'pump' | 'column';
  x: number;
  y: number;
  label: string;
}

interface Connection {
  id: string;
  from: string;
  to: string;
  label?: string;
}

interface SimpleFlowsheetBuilderProps {
  onDiagramChange?: (diagramData: any) => void;
  initialData?: any;
}

const SimpleFlowsheetBuilder = React.forwardRef<any, SimpleFlowsheetBuilderProps>(({ onDiagramChange, initialData }, ref) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);

  // Node types with icons and colors
  const nodeTypes = {
    tank: { icon: Square, color: 'bg-blue-500', label: 'Tank' },
    valve: { icon: Triangle, color: 'bg-yellow-500', label: 'Valve' },
    pump: { icon: Circle, color: 'bg-red-500', label: 'Pump' },
    column: { icon: Square, color: 'bg-green-500', label: 'Column' }
  };

  const addNode = (type: Node['type'], x: number, y: number) => {
    const nodeType = nodeTypes[type] || nodeTypes.tank; // Ensure type exists
    const newNode: Node = {
      id: `node_${Date.now()}`,
      type: type || 'tank', // Default to tank if type is invalid
      x,
      y,
      label: `${nodeType.label} ${nodes.length + 1}`
    };
    setNodes(prev => [...prev, newNode]);
  };

  const deleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
  };

  const updateNodePosition = (nodeId: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, x, y } : n));
  };

  const updateNodeLabel = (nodeId: string, label: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, label } : n));
  };

  const startConnection = (nodeId: string) => {
    if (isConnecting && connectionStart) {
      // Complete connection
      if (connectionStart !== nodeId) {
        const newConnection: Connection = {
          id: `conn_${Date.now()}`,
          from: connectionStart,
          to: nodeId
        };
        setConnections(prev => [...prev, newConnection]);
      }
      setIsConnecting(false);
      setConnectionStart(null);
    } else {
      // Start connection
      setIsConnecting(true);
      setConnectionStart(nodeId);
    }
  };

  const clearDiagram = () => {
    setNodes([]);
    setConnections([]);
    setSelectedNode(null);
    setIsConnecting(false);
    setConnectionStart(null);
  };

  const exportDiagram = () => {
    return {
      nodes,
      connections,
      timestamp: Date.now()
    };
  };

  const importDiagram = (data: any) => {
    if (data.nodes) {
      // Ensure all imported nodes have valid types
      const validNodes = data.nodes.map((node: any) => ({
        ...node,
        type: node.type && nodeTypes[node.type] ? node.type : 'tank'
      }));
      setNodes(validNodes);
    }
    if (data.connections) setConnections(data.connections);
  };

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    addUnitOperation: (unitData: any) => {
      // Ensure we have a valid type
      const validType = unitData.type && nodeTypes[unitData.type] ? unitData.type : 'tank';
      addNode(validType, 100, 100);
    },
    addConnection: (fromKey: string, toKey: string, label?: string) => {
      const newConnection: Connection = {
        id: `conn_${Date.now()}`,
        from: fromKey,
        to: toKey,
        label
      };
      setConnections(prev => [...prev, newConnection]);
    },
    clearDiagram,
    exportDiagram,
    importDiagram
  }), [addNode, exportDiagram, importDiagram, nodeTypes]);

  // Handle canvas click
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      addNode('tank', x, y);
    }
  };

  // Handle node drag
  const handleNodeDrag = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      updateNodePosition(nodeId, x, y);
    }
  };

  return (
    <div className="w-full h-full relative">
      <div className="absolute top-2 left-2 z-10 flex space-x-2">
        <button
          onClick={() => addNode('tank', 100, 100)}
          className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          title="Add Tank"
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          onClick={() => addNode('valve', 100, 100)}
          className="p-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors"
          title="Add Valve"
        >
          <Triangle className="w-4 h-4" />
        </button>
        <button
          onClick={() => addNode('pump', 100, 100)}
          className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          title="Add Pump"
        >
          <Circle className="w-4 h-4" />
        </button>
        <button
          onClick={() => addNode('column', 100, 100)}
          className="p-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          title="Add Column"
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          onClick={clearDiagram}
          className="p-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          title="Clear All"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="absolute top-2 right-2 z-10 flex space-x-2">
        <button
          onClick={() => {
            const data = exportDiagram();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `flowsheet-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
          className="p-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          title="Export"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      <div
        ref={canvasRef}
        className="w-full h-full border border-gray-300 rounded-lg bg-gray-50 cursor-crosshair relative overflow-hidden"
        onClick={handleCanvasClick}
      >
        {/* Connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {connections.map(conn => {
            const fromNode = nodes.find(n => n.id === conn.from);
            const toNode = nodes.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return null;

            return (
              <g key={conn.id}>
                <line
                  x1={fromNode.x + 25}
                  y1={fromNode.y + 25}
                  x2={toNode.x + 25}
                  y2={toNode.y + 25}
                  stroke="blue"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead)"
                />
                {conn.label && (
                  <text
                    x={(fromNode.x + toNode.x) / 2}
                    y={(fromNode.y + toNode.y) / 2}
                    textAnchor="middle"
                    className="text-xs fill-blue-600"
                  >
                    {conn.label}
                  </text>
                )}
              </g>
            );
          })}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill="blue"
              />
            </marker>
          </defs>
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const nodeType = nodeTypes[node.type] || nodeTypes.tank; // Default to tank if type is invalid
          const NodeIcon = nodeType.icon;
          const isSelected = selectedNode === node.id;
          const isConnectingFrom = connectionStart === node.id;

          return (
            <div
              key={node.id}
              className={`absolute w-12 h-12 ${nodeType.color} rounded-lg cursor-move flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all ${
                isSelected ? 'ring-2 ring-blue-400' : ''
              } ${isConnectingFrom ? 'ring-2 ring-green-400' : ''}`}
              style={{ left: node.x, top: node.y }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNode(node.id);
                startConnection(node.id);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                const startX = e.clientX - node.x;
                const startY = e.clientY - node.y;

                const handleMouseMove = (e: MouseEvent) => {
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (rect) {
                    const x = e.clientX - rect.left - startX;
                    const y = e.clientY - rect.top - startY;
                    updateNodePosition(node.id, x, y);
                  }
                };

                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            >
              <NodeIcon className="w-6 h-6" />
            </div>
          );
        })}

        {/* Instructions */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg font-semibold mb-2">Simple Flowsheet Builder</p>
              <p className="text-sm">Click on the canvas to add units</p>
              <p className="text-sm">Use the toolbar buttons to add specific unit types</p>
              <p className="text-sm">Click on units to connect them</p>
            </div>
          </div>
        )}
      </div>

      {/* Node Properties Panel */}
      {selectedNode && (
        <div className="absolute bottom-2 left-2 z-10 bg-white border border-gray-300 rounded-lg p-3 shadow-lg">
          <h4 className="font-semibold mb-2">Node Properties</h4>
          <input
            type="text"
            value={nodes.find(n => n.id === selectedNode)?.label || ''}
            onChange={(e) => updateNodeLabel(selectedNode, e.target.value)}
            className="w-full p-2 border border-gray-300 rounded mb-2"
            placeholder="Node label"
          />
          <button
            onClick={() => deleteNode(selectedNode)}
            className="w-full p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            Delete Node
          </button>
        </div>
      )}

      {/* Connection Mode Indicator */}
      {isConnecting && (
        <div className="absolute top-16 left-2 z-10 bg-green-100 border border-green-300 rounded-lg p-2">
          <p className="text-sm text-green-800">Click on another unit to connect</p>
        </div>
      )}
    </div>
  );
});

SimpleFlowsheetBuilder.displayName = 'SimpleFlowsheetBuilder';

export default SimpleFlowsheetBuilder;
