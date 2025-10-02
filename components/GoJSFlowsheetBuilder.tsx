'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as go from 'gojs';

interface GoJSFlowsheetBuilderProps {
  onDiagramChange?: (diagramData: any) => void;
  initialData?: any;
  onError?: (error: string) => void;
}

const GoJSFlowsheetBuilder = React.forwardRef<any, GoJSFlowsheetBuilderProps>(({ onDiagramChange, initialData, onError }, ref) => {
  const diagramRef = useRef<HTMLDivElement>(null);
  const [diagram, setDiagram] = useState<go.Diagram | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initGoJS = () => {
      if (!diagramRef.current) {
        console.warn('GoJS: No diagram ref');
        return;
      }

      try {
        // Clear any existing content
        diagramRef.current.innerHTML = '';

        const $ = go.GraphObject.make;
        
        const myDiagram = $(go.Diagram, diagramRef.current, {
          initialContentAlignment: go.Spot.Center,
          "undoManager.isEnabled": true,
          "grid.visible": true,
          "grid.gridCellSize": 20,
          "draggingTool.isGridSnapEnabled": true,
          "resizingTool.isGridSnapEnabled": true
        });

        // Simple node template
        myDiagram.nodeTemplate =
          $(go.Node, "Auto",
            new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify),
            $(go.Shape, "RoundedRectangle",
              {
                fill: "lightblue",
                stroke: "blue",
                strokeWidth: 2,
                minSize: new go.Size(100, 50)
              }
            ),
            $(go.TextBlock,
              {
                font: "bold 12pt sans-serif",
                stroke: "white",
                textAlign: "center",
                margin: 5
              },
              new go.Binding("text", "text")
            )
          );

        // Simple link template
        myDiagram.linkTemplate =
          $(go.Link,
            {
              routing: go.Link.Orthogonal,
              corner: 5
            },
            $(go.Shape,
              {
                strokeWidth: 3,
                stroke: "blue"
              }
            ),
            $(go.Shape,
              {
                toArrow: "Standard",
                stroke: null,
                fill: "blue"
              }
            )
          );

        // Create model - use initial data if provided, otherwise use sample data
        const model = $(go.GraphLinksModel);
        
        if (initialData && initialData.nodes && initialData.nodes.length > 0) {
          // Use provided initial data
          model.nodeDataArray = initialData.nodes;
          model.linkDataArray = initialData.links || [];
          console.log('GoJS: Loading initial data:', initialData);
        } else {
          // Use sample data
          model.nodeDataArray = [
            { key: 1, text: "Feed Tank", loc: "100 100" },
            { key: 2, text: "Distillation Column", loc: "300 100" },
            { key: 3, text: "Condenser", loc: "500 50" },
            { key: 4, text: "Pump", loc: "300 200" },
            { key: 5, text: "Product Tank", loc: "500 200" }
          ];

          model.linkDataArray = [
            { from: 1, to: 2 },
            { from: 2, to: 3 },
            { from: 2, to: 4 },
            { from: 4, to: 5 }
          ];
          console.log('GoJS: Using sample data');
        }

        myDiagram.model = model;

        // Handle diagram changes
        myDiagram.addModelChangedListener((e) => {
          if (onDiagramChange) {
            const diagramData = {
              nodes: (myDiagram.model as any).nodeDataArray,
              links: (myDiagram.model as any).linkDataArray
            };
            console.log('GoJS: Diagram changed, sending data:', diagramData);
            onDiagramChange(diagramData);
          }
        });

        setDiagram(myDiagram);
        setIsLoading(false);

        return () => {
          if (myDiagram && myDiagram.div) {
            myDiagram.div = null;
          }
        };
      } catch (error) {
        console.error('GoJS initialization error:', error);
        setHasError(true);
        setIsLoading(false);
        if (onError) {
          onError(error instanceof Error ? error.message : 'GoJS initialization failed');
        }
      }
    };

    // Try initialization with multiple strategies
    const strategies = [
      () => initGoJS(), // Immediate
      () => setTimeout(initGoJS, 50), // Short delay
      () => setTimeout(initGoJS, 100), // Medium delay
      () => setTimeout(initGoJS, 200), // Longer delay
    ];

    let strategyIndex = 0;
    const tryNextStrategy = () => {
      if (strategyIndex < strategies.length) {
        strategies[strategyIndex]();
        strategyIndex++;
      } else {
        // All strategies failed
        setHasError(true);
        setIsLoading(false);
        if (onError) {
          onError('All GoJS initialization strategies failed');
        }
      }
    };

    // Start with first strategy
    tryNextStrategy();

    return () => {
      // Cleanup
    };
  }, [onDiagramChange, onError]);

  // Handle initialData changes after component is mounted
  useEffect(() => {
    if (diagram && initialData && initialData.nodes && initialData.nodes.length > 0) {
      console.log('GoJS: Updating diagram with new initial data:', initialData);
      diagram.model = new go.GraphLinksModel(initialData.nodes, initialData.links || []);
    }
  }, [diagram, initialData]);

  // Expose diagram methods
  const addUnitOperation = (unitData: any) => {
    if (diagram) {
      (diagram.model as any).addNodeData(unitData);
    }
  };

  const addConnection = (fromKey: string, toKey: string, label?: string) => {
    if (diagram) {
      (diagram.model as any).addLinkData({
        from: fromKey,
        to: toKey,
        text: label || ""
      });
    }
  };

  const clearDiagram = () => {
    if (diagram) {
      (diagram.model as any).clear();
    }
  };

  const exportDiagram = () => {
    if (diagram) {
      return {
        nodes: (diagram.model as any).nodeDataArray,
        links: (diagram.model as any).linkDataArray
      };
    }
    return null;
  };

  const importDiagram = (data: any) => {
    if (diagram) {
      console.log('GoJS: Importing diagram data:', data);
      if (data && data.nodes && data.nodes.length > 0) {
        diagram.model = new go.GraphLinksModel(data.nodes, data.links || []);
      } else {
        console.warn('GoJS: No valid data to import');
      }
    }
  };

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    addUnitOperation,
    addConnection,
    clearDiagram,
    exportDiagram,
    importDiagram
  }), [diagram]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center border border-gray-300 rounded-lg bg-gray-50">
        <div className="text-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Initializing GoJS diagram...</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="w-full h-full flex items-center justify-center border border-gray-300 rounded-lg bg-red-50">
        <div className="text-center p-6 max-w-md">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-red-800 mb-2">GoJS Initialization Failed</h3>
          <p className="text-sm text-red-600 mb-4">
            Unable to initialize the GoJS diagram. This can happen due to:
          </p>
          <ul className="text-xs text-red-600 mb-4 text-left">
            <li>• DOM timing issues</li>
            <li>• GoJS library loading problems</li>
            <li>• Browser compatibility issues</li>
          </ul>
          <div className="space-y-2">
            <button
              onClick={() => {
                setHasError(false);
                setIsLoading(true);
                // Force re-initialization
                setTimeout(() => {
                  if (diagramRef.current) {
                    window.location.reload();
                  }
                }, 100);
              }}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Retry Initialization
            </button>
            <button
              onClick={() => {
                setHasError(false);
                setIsLoading(false);
                // This will trigger the parent to switch to Simple Builder
                if (onError) {
                  onError('User requested fallback to Simple Builder');
                }
              }}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Use Simple Builder Instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full" style={{ minHeight: '500px', minWidth: '500px' }}>
      <div 
        ref={diagramRef} 
        className="w-full h-full border border-gray-300 rounded-lg bg-white"
        style={{ 
          minHeight: '500px', 
          minWidth: '500px',
          position: 'relative',
          overflow: 'hidden'
        }}
      />
    </div>
  );
});

GoJSFlowsheetBuilder.displayName = 'GoJSFlowsheetBuilder';

export default GoJSFlowsheetBuilder;