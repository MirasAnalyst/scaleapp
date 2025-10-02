'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as go from 'gojs';

interface GoJSUnitPaletteProps {
  onUnitSelected?: (unitType: string, unitData: any) => void;
}

export default function GoJSUnitPalette({ onUnitSelected }: GoJSUnitPaletteProps) {
  const paletteRef = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState<go.Palette | null>(null);

  useEffect(() => {
    const initPalette = () => {
      if (!paletteRef.current) return;

      try {
        // Clear any existing content
        paletteRef.current.innerHTML = '';

        const $ = go.GraphObject.make;
        
        const myPalette = $(go.Palette, paletteRef.current);

        // Simple node template for palette
        myPalette.nodeTemplate =
          $(go.Node, "Auto",
            {
              selectionAdorned: false,
              fromSpot: go.Spot.AllSides,
              toSpot: go.Spot.AllSides,
              fromLinkable: true,
              toLinkable: true,
              cursor: "grab"
            },
            $(go.Shape, "RoundedRectangle",
              {
                fill: "lightblue",
                stroke: "blue",
                strokeWidth: 2,
                width: 100,
                height: 50
              }
            ),
            $(go.TextBlock,
              {
                font: "bold 10pt sans-serif",
                stroke: "white",
                textAlign: "center",
                margin: 5
              },
              new go.Binding("text", "text")
            )
          );

        // Create palette model with unit operations
        const model = $(go.GraphLinksModel);
        
        model.nodeDataArray = [
          { key: "Tank1", text: "Storage Tank" },
          { key: "Tank2", text: "Feed Tank" },
          { key: "Tank3", text: "Product Tank" },
          { key: "Column1", text: "Distillation Column" },
          { key: "Valve1", text: "Control Valve" },
          { key: "Valve2", text: "Gate Valve" },
          { key: "Pump1", text: "Centrifugal Pump" },
          { key: "Pump2", text: "Positive Displacement" },
          { key: "Condenser1", text: "Shell & Tube" },
          { key: "Condenser2", text: "Air Cooler" },
          { key: "Boiler1", text: "Reboiler" },
          { key: "Boiler2", text: "Steam Generator" }
        ];

        myPalette.model = model;

        // Handle selection
        myPalette.addModelChangedListener((e) => {
          if (onUnitSelected) {
            const selectedNodes = myPalette.selection.toArray();
            if (selectedNodes.length > 0) {
              const selectedUnit = selectedNodes[0].data;
              onUnitSelected(selectedUnit.key, selectedUnit);
            }
          }
        });

        setPalette(myPalette);

        return () => {
          if (myPalette && myPalette.div) {
            myPalette.div = null;
          }
        };
      } catch (error) {
        console.error('GoJS Palette initialization error:', error);
      }
    };

    // Try initialization with delay
    const timer = setTimeout(initPalette, 100);
    return () => clearTimeout(timer);
  }, [onUnitSelected]);

  return (
    <div className="w-full h-full">
      <div className="p-2 border-b border-gray-300 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">GoJS Unit Operations</h3>
        <p className="text-xs text-gray-500">Click units to add to flowsheet</p>
        <p className="text-xs text-blue-600 mt-1">Simplified GoJS implementation</p>
      </div>
      <div ref={paletteRef} className="w-full h-full overflow-auto" />
    </div>
  );
}