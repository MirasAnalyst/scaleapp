'use client';

import React, { useEffect, useRef } from 'react';
import * as go from 'gojs';

export default function GoJSTest() {
  const diagramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!diagramRef.current) return;

    try {
      const $ = go.GraphObject.make;
      
      const myDiagram = $(go.Diagram, diagramRef.current, {
        initialContentAlignment: go.Spot.Center,
        "undoManager.isEnabled": true,
        "grid.visible": true,
        "grid.gridCellSize": 20
      });

      // Simple node template
      myDiagram.nodeTemplate =
        $(go.Node, "Auto",
          new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify),
          $(go.Shape, "RoundedRectangle",
            {
              fill: "lightblue",
              stroke: "blue",
              strokeWidth: 2
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

      // Create model with test data
      const model = $(go.GraphLinksModel);
      model.nodeDataArray = [
        { key: 1, text: "Node 1", loc: "100 100" },
        { key: 2, text: "Node 2", loc: "300 100" },
        { key: 3, text: "Node 3", loc: "200 200" }
      ];
      model.linkDataArray = [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 1 }
      ];

      myDiagram.model = model;

      return () => {
        if (myDiagram && myDiagram.div) {
          myDiagram.div = null;
        }
      };
    } catch (error) {
      console.error('GoJS Test initialization error:', error);
    }
  }, []);

  return (
    <div className="w-full h-96 border border-gray-300 rounded-lg">
      <div className="p-2 bg-gray-50 border-b">
        <h3 className="text-sm font-semibold">GoJS Test - Simple Diagram</h3>
        <p className="text-xs text-gray-600">Testing GoJS integration without errors</p>
      </div>
      <div ref={diagramRef} className="w-full h-full" />
    </div>
  );
}