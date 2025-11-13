import React, { useMemo, useState, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  Node,
  Edge,
  Connection,
  EdgeProps,
} from "reactflow";
import "reactflow/dist/style.css";

/**
 * Aspen HYSYS‑style Unit Operations Palette (No GoJS)
 * ----------------------------------------------------------------------------
 * This file expands the palette to cover the *common* HYSYS unit operations
 * as SVG React Flow nodes. Symbols are simplified but follow standard PFD/P&ID
 * conventions so your team instantly recognizes them.
 *
 * Included equipment (aliases in parentheses):
 *  - Pump (Centrifugal Pump)
 *  - Valve (Control/Block Valve symbol)
 *  - Compressor (also usable as Blower)
 *  - Turbine/Expander
 *  - Heater / Cooler (generic) + Shell & Tube Heat Exchanger
 *  - Air Cooler (fin-fan, stylized)
 *  - Distillation Column (also Absorber/Stripper by labeling)
 *  - Flash Drum (vertical vapor-liquid separator)
 *  - Separator (Horizontal 2-phase) + 3‑Phase Separator (horizontal)
 *  - CSTR (Stirred Tank Reactor)
 *  - PFR (Plug Flow Reactor / tubular)
 *  - Boiler / Reboiler
 *  - Condenser
 *  - Mixer, Splitter (material junctions)
 *  - Label
 *
 * Streams:
 *  - Material streams are default edges (AnimatedPipe).
 *  - Energy streams provided as a dashed, thin arrow edge (EnergyEdge).
 */

// ────────────────────────────────────────────────────────────────────────────────
// Shared SVG <defs>
// ────────────────────────────────────────────────────────────────────────────────
const SvgDefs = ({ waveId = "wavePattern", metalId = "metalGradient" }) => (
  <defs>
    {/* Metal gradient for vessels and housings */}
    <linearGradient id={metalId} x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#9aa7b3" />
      <stop offset="20%" stopColor="#dfe6ee" />
      <stop offset="33%" stopColor="#f7fafc" />
      <stop offset="50%" stopColor="#dfe6ee" />
      <stop offset="100%" stopColor="#9aa7b3" />
    </linearGradient>

    {/* Animated liquid wave pattern */}
    <pattern id={waveId} width="50" height="10" patternUnits="userSpaceOnUse">
      <g>
        <path d="M0 7 Q 12.5 0 25 7 T 50 7 V10 H0 Z" fill="#c5d3e0" />
        <path d="M0 9 Q 12.5 2 25 9 T 50 9 V10 H0 Z" fill="#a3b7ca" />
        <animateTransform attributeName="patternTransform" type="translate" from="0 0" to="50 0" dur="2s" repeatCount="indefinite" />
      </g>
    </pattern>

    {/* Arrowhead marker for edges */}
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
    </marker>
  </defs>
);

// Helpers
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Calculate dynamic label width based on text length
const calculateLabelWidth = (text: string, minWidth: number = 60, maxWidth: number = 200) => {
  const baseWidth = text.length * 8; // Approximate 8px per character
  return Math.max(minWidth, Math.min(maxWidth, baseWidth));
};

// Calculate dynamic label height for multi-line text
const calculateLabelHeight = (text: string, baseHeight: number = 24) => {
  const lines = text.split('\n').length;
  return Math.max(baseHeight, lines * 16);
};

// Wrap text to fit within specified width
const wrapText = (text: string, maxWidth: number, charWidth: number = 8): string[] => {
  if (text.length * charWidth <= maxWidth) {
    return [text];
  }
  
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length * charWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Single word is too long, break it
        lines.push(word);
        currentLine = '';
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
};

// Calculate label dimensions with text wrapping
const calculateLabelDimensions = (text: string, maxWidth: number, minWidth: number = 60, baseHeight: number = 24) => {
  const wrappedLines = wrapText(text, maxWidth);
  const labelWidth = Math.max(minWidth, Math.min(maxWidth, Math.max(...wrappedLines.map(line => line.length * 8))));
  const labelHeight = Math.max(baseHeight, wrappedLines.length * 16);
  
  return {
    width: labelWidth,
    height: labelHeight,
    lines: wrappedLines
  };
};

const clampPercent = (value: number) => Math.min(90, Math.max(10, value));

const extractStageValue = (portId: string) => {
  const match = portId.match(/(?:stage|sidedraw)-(\d+)/i);
  if (match) {
    const stage = parseInt(match[1], 10);
    if (!Number.isNaN(stage)) {
      return stage;
    }
  }
  return undefined;
};

const computeColumnHandleTop = (portId: string, index: number, total: number) => {
  if (/top/.test(portId)) {
    return 12;
  }
  if (/bottom/.test(portId)) {
    return 88;
  }
  const stage = extractStageValue(portId);
  if (stage !== undefined) {
    return clampPercent((stage / 40) * 95);
  }
  if (/feed/.test(portId)) {
    return clampPercent(40 + index * 6);
  }
  return clampPercent(35 + (total > 1 ? (index / Math.max(1, total - 1)) * 30 : 0));
};

// ────────────────────────────────────────────────────────────────────────────────
// CORE VESSELS / TANKS
// ────────────────────────────────────────────────────────────────────────────────
const DistillationColumnNode = ({ id, data }: { id: string; data: any }) => {
  const { width = 80, height = 220, fillLevel = 0.5, label = "Column" } = data || {};
  const level = clamp01(fillLevel);
  const pad = 6, innerW = width - pad * 2, innerH = height - pad * 2, fillH = innerH * level;
  const defaultInlets = new Set([
    "reflux-top",
    "feed-stage-6",
    "feed-stage-8",
    "feed-stage-10",
    "feed-stage-12",
    "feed-stage-18",
    "feed-left",
    "in-left",
  ]);
  const defaultOutlets = new Set(["overhead-top", "bottoms-bottom"]);
  const dynamicInlets = (data?.ports?.inlets || []).filter((portId: string) => !defaultInlets.has(portId));
  const dynamicOutlets = (data?.ports?.outlets || []).filter((portId: string) => !defaultOutlets.has(portId));
  
  // Calculate dynamic label dimensions with text wrapping
  const maxLabelWidth = Math.min(200, width - 10);
  const labelDimensions = calculateLabelDimensions(label, maxLabelWidth, 60, 24);
  const labelX = Math.max(5, (width - labelDimensions.width) / 2);
  const labelY = height / 2 - labelDimensions.height / 2;
  
  return (
    <div style={{ width, height, position: "relative" }}>
      <svg width={width} height={height}>
        <SvgDefs />
        {/* Capsule shell */}
        <rect x="0.5" y="0.5" width={width - 1} height={height - 1} rx={width / 2} ry={width / 2} fill="url(#metalGradient)" stroke="#000" />
        {/* Clip interior */}
        <clipPath id={`clip-col-${id}`}>
          <rect x={pad} y={pad} width={innerW} height={innerH} rx={innerW / 2} ry={innerW / 2} />
        </clipPath>
        {/* Liquid */}
        <g clipPath={`url(#clip-col-${id})`}>
          <rect x={pad} y={pad + (innerH - fillH)} width={innerW} height={fillH} fill="url(#wavePattern)" />
          <linearGradient id={`liquidGrad-col-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9fb4ca" />
            <stop offset="100%" stopColor="#194a7a" />
          </linearGradient>
          <rect x={pad} y={pad + (innerH - fillH)} width={innerW} height={fillH} fill={`url(#liquidGrad-col-${id})`} opacity="0.35" />
        </g>
        {/* Tray hints */}
        {Array.from({ length: 10 }).map((_, i) => {
          const y = pad + (i / 10) * innerH; return <line key={i} x1={4} x2={width - 4} y1={y} y2={y} stroke="#000" strokeDasharray="6 6" opacity="0.25"/>;
        })}
        {/* Dynamic Multi-line Label */}
        <rect x={labelX} y={labelY} width={labelDimensions.width} height={labelDimensions.height} fill="rgba(255,255,255,0.85)" stroke="#000" rx="2"/>
        {labelDimensions.lines.map((line, index) => (
          <text 
            key={index}
            x={width/2} 
            y={labelY + 12 + (index * 16)} 
            fontSize="12" 
            fontWeight={600} 
            textAnchor="middle"
          >
            {line}
          </text>
        ))}
      </svg>
      {/* Ports - Distillation Column */}
      <Handle type="target" position={Position.Top} id="reflux-top" style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-stage-18" style={{ top: "60%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-stage-12" style={{ top: "58%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-stage-10" style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-stage-8" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-stage-6" style={{ top: "45%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-left" style={{ top: "40%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="in-left" style={{ top: "35%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Top} id="overhead-top" style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Bottom} id="bottoms-bottom" style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
      {dynamicInlets.map((portId: string, index: number) => {
        const top = computeColumnHandleTop(portId, index, dynamicInlets.length);
        const isTop = /top/.test(portId);
        const isBottom = /bottom/.test(portId);
        const position = portId.includes("left") ? Position.Left : Position.Right;

        if (isTop) {
          return (
            <Handle
              key={`${id}-dyn-in-${portId}`}
              type="target"
              position={Position.Top}
              id={portId}
              style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
            />
          );
        }

        if (isBottom) {
          return (
            <Handle
              key={`${id}-dyn-in-${portId}`}
              type="target"
              position={Position.Bottom}
              id={portId}
              style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
            />
          );
        }

        return (
          <Handle
            key={`${id}-dyn-in-${portId}`}
            type="target"
            position={position}
            id={portId}
            style={{ top: `${top}%`, transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
          />
        );
      })}
      {dynamicOutlets.map((portId: string, index: number) => {
        const top = computeColumnHandleTop(portId, index, dynamicOutlets.length);
        const isTop = /top/.test(portId);
        const isBottom = /bottom/.test(portId);

        if (isTop) {
          return (
            <Handle
              key={`${id}-dyn-out-${portId}`}
              type="source"
              position={Position.Top}
              id={portId}
              style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
            />
          );
        }

        if (isBottom) {
          return (
            <Handle
              key={`${id}-dyn-out-${portId}`}
              type="source"
              position={Position.Bottom}
              id={portId}
              style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
            />
          );
        }

        return (
          <Handle
            key={`${id}-dyn-out-${portId}`}
            type="source"
            position={Position.Right}
            id={portId}
            style={{ top: `${top}%`, transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
          />
        );
      })}
    </div>
  );
};

const FlashDrumNode = ({ id, data }) => {
  // Vertical vapor-liquid separator
  const { width = 90, height = 130, fillLevel = 0.5, label = "Flash Drum" } = data || {};
  const level = clamp01(fillLevel);
  const pad = 6, innerW = width - pad * 2, innerH = height - pad * 2, fillH = innerH * level;
  
  // Calculate dynamic label dimensions with text wrapping
  const maxLabelWidth = Math.min(200, width - 10);
  const labelDimensions = calculateLabelDimensions(label, maxLabelWidth, 60, 20);
  const labelX = Math.max(5, (width - labelDimensions.width) / 2);
  const labelY = height - labelDimensions.height - 5;
  
  return (
    <div style={{ width, height, position: "relative" }}>
      <svg width={width} height={height}>
        <SvgDefs />
        <rect x="0.5" y="0.5" width={width - 1} height={height - 1} rx={width / 3} ry={width / 3} fill="url(#metalGradient)" stroke="#000" />
        <clipPath id={`clip-flash-${id}`}><rect x={pad} y={pad} width={innerW} height={innerH} rx={innerW/3} ry={innerW/3}/></clipPath>
        <g clipPath={`url(#clip-flash-${id})`}>
          <rect x={pad} y={pad + (innerH - fillH)} width={innerW} height={fillH} fill="url(#wavePattern)" />
        </g>
        {/* Dynamic Multi-line Label */}
        <rect x={labelX} y={labelY} width={labelDimensions.width} height={labelDimensions.height} fill="rgba(255,255,255,0.85)" stroke="#000" rx="2"/>
        {labelDimensions.lines.map((line, index) => (
          <text 
            key={index}
            x={width/2} 
            y={labelY + 12 + (index * 16)} 
            fontSize="12" 
            fontWeight={600} 
            textAnchor="middle"
          >
            {line}
          </text>
        ))}
      </svg>
      {["feed-left", "inlet", "in", "feed"].map(handleId => (
        <Handle
          key={`${id}-flash-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
        />
      ))}
      {["vapor-top", "gas-top", "gas", "vapor", "outlet"].map(handleId => (
        <Handle
          key={`${id}-flash-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
        />
      ))}
      {["liquid-bottom", "bottoms", "liquid", "outlet-bottom"].map(handleId => (
        <Handle
          key={`${id}-flash-${handleId}`}
          type="source"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
        />
      ))}
    </div>
  );
};

const SeparatorHorizontalNode = ({ id, data }) => {
  // 2‑phase horizontal separator
  const { width = 180, height = 70, label = "Separator" } = data || {};
  
  // Calculate dynamic label dimensions with text wrapping
  const maxLabelWidth = Math.min(200, width - 20);
  const labelDimensions = calculateLabelDimensions(label, maxLabelWidth, 80, 20);
  const labelX = Math.max(10, (width - labelDimensions.width) / 2);
  const labelY = height / 2 - labelDimensions.height / 2;
  
  return (
    <div style={{ width, height, position: "relative" }}>
      <svg width={width} height={height}>
        <SvgDefs />
        <rect x="0.5" y="10.5" width={width - 1} height={height - 21} rx={height/2} ry={height/2} fill="url(#metalGradient)" stroke="#000" />
        {/* Dynamic Multi-line Label */}
        <rect x={labelX} y={labelY} width={labelDimensions.width} height={labelDimensions.height} fill="rgba(255,255,255,0.85)" stroke="#000" rx="2"/>
        {labelDimensions.lines.map((line, index) => (
          <text 
            key={index}
            x={width/2} 
            y={labelY + 12 + (index * 16)} 
            fontSize="12" 
            fontWeight={600} 
            textAnchor="middle"
          >
            {line}
          </text>
        ))}
      </svg>
      {["feed-left", "inlet", "in", "feed"].map(handleId => (
        <Handle
          key={`${id}-2ph-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
        />
      ))}
      {["vapor-top", "gas-top", "gas", "vapor", "outlet"].map(handleId => (
        <Handle
          key={`${id}-2ph-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
        />
      ))}
      {["liquid-bottom", "bottoms", "liquid", "outlet-bottom"].map(handleId => (
        <Handle
          key={`${id}-2ph-${handleId}`}
          type="source"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
        />
      ))}
    </div>
  );
};

const Separator3PhaseNode = ({ id, data }) => {
  // 3‑phase horizontal separator (gas, oil, water)
  const { width = 200, height = 80, label = "3‑Phase Sep" } = data || {};
  return (
    <div style={{ width, height, position: "relative" }}>
      <svg width={width} height={height}>
        <SvgDefs />
        <rect x="0.5" y="12.5" width={width - 1} height={height - 25} rx={height/2} ry={height/2} fill="url(#metalGradient)" stroke="#000" />
        {/* Internal weir hints */}
        <line x1={width*0.35} y1={height*0.25} x2={width*0.35} y2={height*0.75} stroke="#000" opacity=".3" />
        <line x1={width*0.65} y1={height*0.25} x2={width*0.65} y2={height*0.75} stroke="#000" opacity=".3" />
        <text x={width/2} y={height/2+5} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
      </svg>
      {["feed-left", "inlet", "in", "feed"].map(handleId => (
        <Handle
          key={`${id}-3ph-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
        />
      ))}
      {["gas-top", "vapor-top", "gas", "vapor"].map(handleId => (
        <Handle
          key={`${id}-3ph-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
        />
      ))}
      {["oil-right", "liquid-right", "oil", "light-liquid"].map(handleId => (
        <Handle
          key={`${id}-3ph-${handleId}`}
          type="source"
          position={Position.Right}
          id={handleId}
          style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
        />
      ))}
      {["water-bottom", "liquid-bottom", "water", "heavy-liquid", "bottoms"].map(handleId => (
        <Handle
          key={`${id}-3ph-${handleId}`}
          type="source"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
        />
      ))}
    </div>
  );
};

const TankNode = ({ id, data }) => {
  const { width = 140, height = 100, fillLevel = 0.6, label = "Tank" } = data || {};
  const level = clamp01(fillLevel), pad = 6, innerW = width - pad*2, innerH = height - pad*2, fillH = innerH*level;
  
  // Calculate dynamic label dimensions with text wrapping
  const maxLabelWidth = Math.min(200, width - 10);
  const labelDimensions = calculateLabelDimensions(label, maxLabelWidth, 60, 24);
  const labelX = Math.max(5, (width - labelDimensions.width) / 2);
  const labelY = height / 2 - labelDimensions.height / 2;
  
  return (
    <div style={{ width, height }}>
      <svg width={width} height={height}><SvgDefs />
        <rect x="0.5" y="0.5" width={width - 1} height={height - 1} rx={Math.min(16, height/2)} ry={Math.min(16, height/2)} fill="url(#metalGradient)" stroke="#000" />
        <clipPath id={`clip-tank-${id}`}><rect x={pad} y={pad} width={innerW} height={innerH} rx={12} ry={12}/></clipPath>
        <g clipPath={`url(#clip-tank-${id})`}>
          <rect x={pad} y={pad + (innerH - fillH)} width={innerW} height={fillH} fill="url(#wavePattern)" />
        </g>
        {/* Dynamic Multi-line Label */}
        <rect x={labelX} y={labelY} width={labelDimensions.width} height={labelDimensions.height} fill="rgba(255,255,255,0.85)" stroke="#000" rx="2"/>
        {labelDimensions.lines.map((line, index) => (
          <text 
            key={index}
            x={width/2} 
            y={labelY + 12 + (index * 16)} 
            fontSize="12" 
            fontWeight={600} 
            textAnchor="middle"
          >
            {line}
          </text>
        ))}
      </svg>
      <Handle
        type="target"
        position={Position.Top}
        id="in-top"
        style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out-bottom"
        style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
      />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// HEAT TRANSFER
// ────────────────────────────────────────────────────────────────────────────────
const HeaterCoolerNode = ({ id, data }) => {
  // Generic heater/cooler block; use label to distinguish (Heater/Cooler)
  const { width = 120, height = 70, label = "Heater" } = data || {};
  
  // Calculate dynamic label dimensions with text wrapping
  const maxLabelWidth = Math.min(200, width - 10);
  const labelDimensions = calculateLabelDimensions(label, maxLabelWidth, 60, 20);
  const labelX = Math.max(5, (width - labelDimensions.width) / 2);
  const labelY = height / 2 - labelDimensions.height / 2;
  
  return (
    <div style={{ width, height }}>
      <svg width={width} height={height}><SvgDefs />
        <rect x="0.5" y="0.5" width={width-1} height={height-1} rx={8} ry={8} fill="url(#metalGradient)" stroke="#000"/>
        {/* Dynamic Multi-line Label */}
        <rect x={labelX} y={labelY} width={labelDimensions.width} height={labelDimensions.height} fill="rgba(255,255,255,0.85)" stroke="#000" rx="2"/>
        {labelDimensions.lines.map((line, index) => (
          <text 
            key={index}
            x={width/2} 
            y={labelY + 12 + (index * 16)} 
            fontSize="12" 
            fontWeight={600} 
            textAnchor="middle"
          >
            {line}
          </text>
        ))}
      </svg>
      {["hot-in-left", "inlet", "in", "feed", "process-in"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["hot-out-right", "outlet", "out", "product", "process-out"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Right}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["cold-in-bottom", "utility-in", "cold-inlet"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
      {["cold-out-top", "utility-out", "cold-outlet"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
    </div>
  );
};

const ShellTubeHXNode = ({ id, data }) => {
  const { width = 140, height = 80, label = "Shell & Tube HX" } = data || {};
  
  // Calculate dynamic label dimensions
  const labelWidth = calculateLabelWidth(label, 80, Math.min(200, width - 20));
  const labelHeight = calculateLabelHeight(label, 20);
  const labelX = Math.max(10, (width - labelWidth) / 2);
  const labelY = height / 2 - labelHeight / 2;
  
  return (
    <div style={{ width, height }}>
      <svg width={width} height={height}><SvgDefs />
        {/* Shell */}
        <rect x="0.5" y="10.5" width={width-1} height={height-21} rx={12} ry={12} fill="url(#metalGradient)" stroke="#000"/>
        {/* Tube bundle hint */}
        {Array.from({length:4}).map((_,i)=>{
          const y=20+i*12; return <line key={i} x1={15} x2={width-15} y1={y} y2={y} stroke="#000" opacity=".35"/>;
        })}
        {/* Dynamic Label */}
        <rect x={labelX} y={labelY} width={labelWidth} height={labelHeight} fill="rgba(255,255,255,0.85)" stroke="#000" rx="2"/>
        <text x={width/2} y={labelY + labelHeight/2 + 4} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
      </svg>
      {["hot-in-left", "inlet", "in", "feed", "shell-inlet", "process-in"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["hot-out-right", "outlet", "out", "shell-outlet", "process-out"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Right}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["cold-in-bottom", "tube-inlet", "cold-inlet", "utility-in"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
      {["cold-out-top", "tube-outlet", "cold-outlet", "utility-out"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
    </div>
  );
};

const AirCoolerNode = ({ id, data }) => {
  const { width = 160, height = 90, label = "Air Cooler" } = data || {};
  
  // Calculate dynamic label dimensions
  const labelWidth = calculateLabelWidth(label, 80, Math.min(200, width - 20));
  const labelHeight = calculateLabelHeight(label, 20);
  const labelX = Math.max(10, (width - labelWidth) / 2);
  const labelY = height - labelHeight - 5;
  
  return (
    <div style={{ width, height }}>
      <svg width={width} height={height}><SvgDefs />
        <rect x="0.5" y="10.5" width={width-1} height={height-21} rx={8} ry={8} fill="url(#metalGradient)" stroke="#000"/>
        {/* Fans (stylized) */}
        {[0.25,0.5,0.75].map((f,i)=> (
          <g key={i} transform={`translate(${width*f}, ${height/2})`}>
            <circle cx="0" cy="0" r="12" fill="#fff" stroke="#000"/>
            <path d="M0 -10 L6 0 L0 10 L-6 0 Z" fill="#cfd8e3" stroke="#000"/>
          </g>
        ))}
        {/* Dynamic Label */}
        <rect x={labelX} y={labelY} width={labelWidth} height={labelHeight} fill="rgba(255,255,255,0.85)" stroke="#000" rx="2"/>
        <text x={width/2} y={labelY + labelHeight/2 + 4} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
      </svg>
      {["hot-in-left", "inlet", "in", "feed", "process-in"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["hot-out-right", "outlet", "out", "process-out"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Right}
          id={handleId}
          style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["cold-in-bottom", "utility-in", "cold-inlet"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
      {["cold-out-top", "utility-out", "cold-outlet"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// REACTION
// ────────────────────────────────────────────────────────────────────────────────
const CSTRNode = ({ id, data }) => {
  // Stirred tank reactor: vessel + impeller
  const { width = 120, height = 120, fillLevel = 0.5, label = "CSTR" } = data || {};
  const level = clamp01(fillLevel), pad=8, innerW=width-pad*2, innerH=height-pad*2, fillH=innerH*level;
  
  // Calculate dynamic label dimensions
  const labelWidth = calculateLabelWidth(label, 60, Math.min(200, width - 10));
  const labelHeight = calculateLabelHeight(label, 20);
  const labelX = Math.max(5, (width - labelWidth) / 2);
  const labelY = height - labelHeight - 5;
  
  return (
    <div style={{ width, height }}>
      <svg width={width} height={height}><SvgDefs />
        <rect x="0.5" y="0.5" width={width-1} height={height-1} rx={16} ry={16} fill="url(#metalGradient)" stroke="#000"/>
        <clipPath id={`clip-cstr-${id}`}><rect x={pad} y={pad} width={innerW} height={innerH} rx={14} ry={14}/></clipPath>
        <g clipPath={`url(#clip-cstr-${id})`}>
          <rect x={pad} y={pad + (innerH - fillH)} width={innerW} height={fillH} fill="url(#wavePattern)" />
          {/* Impeller */}
          <g transform={`translate(${width/2}, ${height/2})`} opacity=".6">
            <line x1="0" y1="-20" x2="0" y2="20" stroke="#000"/>
            <path d="M0 0 L16 6 L0 12 Z" fill="#000"/>
          </g>
        </g>
        {/* Dynamic Label */}
        <rect x={labelX} y={labelY} width={labelWidth} height={labelHeight} fill="rgba(255,255,255,0.85)" stroke="#000" rx="2"/>
        <text x={width/2} y={labelY + labelHeight/2 + 4} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="in-left"
        style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out-right"
        style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
      />
    </div>
  );
};

const PFRNode = ({ data }) => {
  // Tubular reactor: long rounded rectangle
  const { width = 180, height = 40, label = "PFR" } = data || {};
  
  // Calculate dynamic label dimensions
  const labelWidth = calculateLabelWidth(label, 60, Math.min(200, width - 20));
  const labelHeight = calculateLabelHeight(label, 20);
  const labelX = Math.max(10, (width - labelWidth) / 2);
  const labelY = height / 2 - labelHeight / 2;
  
  return (
    <div style={{ width, height }}>
      <svg width={width} height={height}><SvgDefs />
        <rect x="0.5" y="0.5" width={width-1} height={height-1} rx={height/2} ry={height/2} fill="url(#metalGradient)" stroke="#000"/>
        {/* Dynamic Label */}
        <rect x={labelX} y={labelY} width={labelWidth} height={labelHeight} fill="rgba(255,255,255,0.85)" stroke="#000" rx="2"/>
        <text x={width/2} y={labelY + labelHeight/2 + 4} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="in-left"
        style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out-right"
        style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
      />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// ROTATING MACHINERY
// ────────────────────────────────────────────────────────────────────────────────
const PumpNode = ({ data }) => {
  const { label = "Pump" } = data || {};
  
  // Calculate dynamic label dimensions
  const labelWidth = calculateLabelWidth(label, 50, 120);
  const labelHeight = 20;
  
  return (
    <div style={{ width: Math.max(70, labelWidth + 20), height: 70, display: "grid", placeItems: "center" }}>
      <svg width="70" height="55"><SvgDefs />
        <circle cx="30" cy="22" r="12" fill="url(#metalGradient)" stroke="#000" />
        <rect x="20" y="34" width="20" height="8" fill="url(#metalGradient)" stroke="#000" />
      </svg>
      <div style={{ 
        fontSize: 12, 
        fontWeight: 600, 
        marginTop: 2, 
        background: "rgba(255,255,255,0.85)", 
        border: "1px solid #000", 
        borderRadius: "2px",
        padding: "2px 6px",
        minWidth: labelWidth,
        textAlign: "center"
      }}>{label}</div>
      <Handle type="target" position={Position.Left} id="suction-left" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} id="discharge-right" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
    </div>
  );
};

const CompressorNode = ({ data }) => {
  // Classic compressor: triangle wedge against a circle
  const { label = "Compressor" } = data || {};
  
  // Calculate dynamic label dimensions
  const labelWidth = calculateLabelWidth(label, 60, 140);
  const labelHeight = 20;
  
  return (
    <div style={{ width: Math.max(100, labelWidth + 20), height: 70, display: "grid", placeItems: "center" }}>
      <svg width="100" height="60"><SvgDefs />
        <g transform="translate(10,10)">
          <circle cx="24" cy="20" r="18" fill="url(#metalGradient)" stroke="#000" />
          <path d="M50 4 L80 20 L50 36 Z" fill="url(#metalGradient)" stroke="#000" />
        </g>
      </svg>
      <div style={{ 
        fontSize: 12, 
        fontWeight: 600, 
        background: "rgba(255,255,255,0.85)", 
        border: "1px solid #000", 
        borderRadius: "2px",
        padding: "2px 6px",
        minWidth: labelWidth,
        textAlign: "center"
      }}>{label}</div>
      <Handle type="target" position={Position.Left} id="suction-left" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} id="discharge-right" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
    </div>
  );
};

const TurbineNode = ({ data }) => {
  // Turbine/expander: inverted triangle wedge
  const { label = "Turbine" } = data || {};
  
  // Calculate dynamic label dimensions
  const labelWidth = calculateLabelWidth(label, 60, 140);
  const labelHeight = 20;
  
  return (
    <div style={{ width: Math.max(100, labelWidth + 20), height: 70, display: "grid", placeItems: "center" }}>
      <svg width="100" height="60"><SvgDefs />
        <g transform="translate(10,10)">
          <path d="M50 4 L20 20 L50 36 Z" fill="url(#metalGradient)" stroke="#000" />
          <circle cx="76" cy="20" r="18" fill="url(#metalGradient)" stroke="#000" />
        </g>
      </svg>
      <div style={{ 
        fontSize: 12, 
        fontWeight: 600, 
        background: "rgba(255,255,255,0.85)", 
        border: "1px solid #000", 
        borderRadius: "2px",
        padding: "2px 6px",
        minWidth: labelWidth,
        textAlign: "center"
      }}>{label}</div>
      <Handle
        type="target"
        position={Position.Left}
        id="in-left"
        style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out-right"
        style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
      />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// VALVING & SIMPLE DEVICES
// ────────────────────────────────────────────────────────────────────────────────
const ValveNode = ({ data }) => {
  // Gate symbol with stem
  const { label = "Valve" } = data || {};
  return (
    <div style={{ width: 80, height: 80, display: "grid", placeItems: "center" }}>
      <svg width="80" height="60"><SvgDefs />
        <g transform="translate(10,10)">
          <path d="M0 10 L30 25 L30 10 L0 25 Z" fill="url(#metalGradient)" stroke="#000" />
          <line x1="15" y1="18" x2="15" y2="38" stroke="#000" />
          <line x1="9" y1="38" x2="21" y2="38" stroke="#000" />
        </g>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      <Handle type="target" position={Position.Left} id="in-left" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} id="out-right" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
    </div>
  );
};

const MixerNode = ({ data }) => {
  // Junction: multiple feeds -> one product
  const { label = "Mixer" } = data || {};
  return (
    <div style={{ width: 70, height: 70, display: "grid", placeItems: "center" }}>
      <svg width="70" height="60"><SvgDefs />
        <circle cx="35" cy="30" r="14" fill="#fff" stroke="#000" />
      </svg>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      <Handle type="target" position={Position.Left} id="in-1-left" style={{ top: "25%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Left} id="in-2-left" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Left} id="in-3-left" style={{ top: "75%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} id="out-right" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
    </div>
  );
};

const SplitterNode = ({ data }) => {
  // One feed -> two products (Y splitter)
  const { label = "Splitter" } = data || {};
  return (
    <div style={{ width: 80, height: 70, display: "grid", placeItems: "center" }}>
      <svg width="80" height="60"><SvgDefs />
        <path d="M40 10 L40 30 M40 30 L15 50 M40 30 L65 50" stroke="#000" fill="none" strokeWidth="3" />
      </svg>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      <Handle type="target" position={Position.Left} id="in-left" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} id="out-1-right" style={{ top: "25%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} id="out-2-right" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} id="out-3-right" style={{ top: "75%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// BOILER / CONDENSER
// ────────────────────────────────────────────────────────────────────────────────
const BoilerNode = ({ data }) => {
  const { label = "Boiler" } = data || {};
  return (
    <div style={{ width: 90, height: 90, display: "grid", placeItems: "center" }}>
      <svg width="90" height="70"><SvgDefs />
        <g transform="translate(10,6)">
          <circle cx="25" cy="25" r="22" fill="url(#metalGradient)" stroke="#000" />
          <circle cx="25" cy="45" r="10" fill="url(#metalGradient)" stroke="#000" />
        </g>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      <Handle
        type="target"
        position={Position.Left}
        id="in-left"
        style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out-right"
        style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="Qin"
        style={{ left: "50%", transform: "translateX(-50%)", width: 10, height: 10, background: "#F97316", border: "2px solid #fff" }}
      />
    </div>
  );
};

const CondenserNode = ({ data }) => {
  const { label = "Condenser" } = data || {};
  return (
    <div style={{ width: 90, height: 90, display: "grid", placeItems: "center" }}>
      <svg width="90" height="70"><SvgDefs />
        <g transform="translate(10,6)">
          <circle cx="25" cy="25" r="22" fill="url(#metalGradient)" stroke="#000" />
          <path d="M5 50 L5 56 L11 56 L5 56 L25 28 L25 36 L45 8" fill="url(#metalGradient)" stroke="#000" />
        </g>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      <Handle
        type="target"
        position={Position.Left}
        id="hot-in-left"
        style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="hot-out-right"
        style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="cold-in-bottom"
        style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="cold-out-top"
        style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="Qout"
        style={{ left: "80%", width: 10, height: 10, background: "#F97316", border: "2px solid #fff" }}
      />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// LABEL
// ────────────────────────────────────────────────────────────────────────────────
const LabelNode = ({ data }) => {
  const { text = "Label" } = data || {};
  return (
    <div style={{ background: "#fff", border: "1px solid #000", padding: "4px 8px", borderRadius: 4, fontWeight: 600 }}>{text}</div>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// ADDITIONAL ICONS TO COMPLETE HYSYS-LIKE SET
// (Simplified but faithful; tweak geometry to match your house style)
// ────────────────────────────────────────────────────────────────────────────────

// Columns (dedicated absorber/stripper + packed column)
const AbsorberNode = (props) => <DistillationColumnNode {...props} data={{ ...(props.data||{}), label: props?.data?.label || "Absorber" }} />;
const StripperNode = (props) => <DistillationColumnNode {...props} data={{ ...(props.data||{}), label: props?.data?.label || "Stripper" }} />;
const PackedColumnNode = ({ id, data }) => {
  // Same shell as column, but with packed-pattern hint instead of trays
  const { width = 80, height = 220, fillLevel = 0.5, label = "Packed Column" } = data || {};
  const level = clamp01(fillLevel); const pad=6, innerW=width-pad*2, innerH=height-pad*2, fillH=innerH*level;
  return (
    <div style={{ width, height, position: "relative" }}>
      <svg width={width} height={height}><SvgDefs />
        <rect x="0.5" y="0.5" width={width - 1} height={height - 1} rx={width/2} ry={width/2} fill="url(#metalGradient)" stroke="#000" />
        <clipPath id={`clip-pack-${id}`}><rect x={pad} y={pad} width={innerW} height={innerH} rx={innerW/2} ry={innerW/2}/></clipPath>
        <g clipPath={`url(#clip-pack-${id})`}>
          <rect x={pad} y={pad + (innerH - fillH)} width={innerW} height={fillH} fill="url(#wavePattern)" />
          {/* Packed bed pattern */}
          {Array.from({length:12}).map((_,i)=>{
            const y = pad + i*(innerH/12) + 4; const x0 = pad+6, x1 = pad+innerW-6;
            return <path key={i} d={`M ${x0} ${y} q 10 -6 20 0 t 20 0 t 20 0 t 20 0`} stroke="#000" opacity=".2" fill="none"/>;
          })}
        </g>
        <rect x={Math.max(0, width/2-44)} y={height/2-12} width="88" height="24" fill="rgba(255,255,255,.85)" stroke="#000"/>
        <text x={width/2} y={height/2+6} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
      </svg>
      <Handle type="target" position={Position.Top} id="reflux-top" style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-stage-18" style={{ top: "60%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-stage-12" style={{ top: "58%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-stage-10" style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-stage-8" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-stage-6" style={{ top: "45%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="feed-left" style={{ top: "40%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Right} id="in-left" style={{ top: "35%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Top} id="overhead-top" style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Bottom} id="bottoms-bottom" style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }} />
    </div>
  );
};

// Heat Exchanger variants
const KettleReboilerNode = ({ id, data }) => {
  const { width=150, height=90, label="Kettle Reboiler" } = data || {};
  return (
    <div style={{ width, height }}>
      <svg width={width} height={height}><SvgDefs />
        {/* Kettle shell with vapor disengagement dome */}
        <rect x="0.5" y="20.5" width={width-1} height={height-41} rx={height/2} ry={height/2} fill="url(#metalGradient)" stroke="#000" />
        <path d={`M 10 20 Q ${width/2} 0 ${width-10} 20`} fill="url(#metalGradient)" stroke="#000" />
        {/* Tube bundle hint on left */}
        {Array.from({length:4}).map((_,i)=> <line key={i} x1={18} x2={width*0.6} y1={28+i*12} y2={28+i*12} stroke="#000" opacity=".35"/>) }
        <text x={width/2} y={height-6} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
      </svg>
      {["hot-in-left", "inlet", "feed", "process-in"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          style={{ top: "60%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["hot-out-right", "outlet", "process-out"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Right}
          id={handleId}
          style={{ top: "60%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["cold-in-bottom", "utility-in"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "35%", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
      {["cold-out-top", "utility-out"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "35%", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
      {["vapor-out-top", "steam-out"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "70%", width: 12, height: 12, background: "#10B981", border: "2px solid #fff" }}
        />
      ))}
      {["liquid-return-bottom", "return", "reflux-in"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "70%", width: 12, height: 12, background: "#10B981", border: "2px solid #fff" }}
        />
      ))}
    </div>
  );
};

const PlateHXNode = ({ id, data }) => {
  const { width=130, height=90, label="Plate HX" } = data || {};
  return (
    <div style={{ width, height }}>
      <svg width={width} height={height}><SvgDefs />
        <rect x="0.5" y="10.5" width={width-1} height={height-21} rx={10} ry={10} fill="url(#metalGradient)" stroke="#000" />
        {/* Chevron plate pattern */}
        {Array.from({length:6}).map((_,i)=>{
          const y = 18 + i*12; return <path key={i} d={`M 12 ${y} L ${width/2} ${y+6} L ${width-12} ${y}`} stroke="#000" opacity=".35" fill="none"/>;
        })}
        <text x={width/2} y={height-6} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
      </svg>
      {["hot-in-left", "inlet", "feed", "process-in"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["hot-out-right", "outlet", "process-out"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Right}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["cold-in-bottom", "utility-in", "cold-inlet"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
      {["cold-out-top", "utility-out", "cold-outlet"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
    </div>
  );
};

const DoublePipeHXNode = ({ id, data }) => {
  const { width=160, height=60, label="Double-Pipe HX" } = data || {};
  return (
    <div style={{ width, height }}>
      <svg width={width} height={height}><SvgDefs />
        {/* Outer pipe */}
        <rect x="0.5" y="10.5" width={width-1} height={height-21} rx={height/2} ry={height/2} fill="url(#metalGradient)" stroke="#000" />
        {/* Inner pipe line */}
        <rect x="10" y={height/2-8} width={width-20} height={16} rx={8} ry={8} fill="#fff" stroke="#000" opacity=".6" />
        <text x={width/2} y={height-4} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
      </svg>
      {["hot-in-left", "inlet", "feed", "process-in"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["hot-out-right", "outlet", "process-out"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Right}
          id={handleId}
          style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#F59E0B", border: "2px solid #fff" }}
        />
      ))}
      {["cold-in-bottom", "utility-in", "cold-inlet"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
      {["cold-out-top", "utility-out", "cold-outlet"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "#3B82F6", border: "2px solid #fff" }}
        />
      ))}
    </div>
  );
};

const FiredHeaterNode = ({ id, data }) => {
  const { width=130, height=90, label="Fired Heater" } = data || {};
  return (
    <div style={{ width, height }}>
      <svg width={width} height={height}><SvgDefs />
        <rect x="0.5" y="10.5" width={width-1} height={height-21} rx={8} ry={8} fill="url(#metalGradient)" stroke="#000" />
        {/* Flame symbol */}
        <path d={`M ${width/2} ${height/2+10} c -10 -12 -2 -18 0 -26 c 6 6 12 12 10 20 c -2 8 -6 10 -10 6 z`} fill="#ffcc66" stroke="#cc9933" />
        <text x={width/2} y={height-6} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
      </svg>
      {["in-left", "inlet", "feed", "process-in"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}
        />
      ))}
      {["out-right", "outlet", "product", "process-out"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Right}
          id={handleId}
          style={{ top: "55%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}
        />
      ))}
      {["fuel-in-bottom", "fuel-inlet"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="target"
          position={Position.Bottom}
          id={handleId}
          style={{ left: "35%", width: 10, height: 10, background: "#F97316", border: "2px solid #fff" }}
        />
      ))}
      {["flue-out-top", "flue-out", "stack"].map(handleId => (
        <Handle
          key={`${id}-${handleId}`}
          type="source"
          position={Position.Top}
          id={handleId}
          style={{ left: "70%", width: 10, height: 10, background: "#F97316", border: "2px solid #fff" }}
        />
      ))}
    </div>
  );
};

// Reactors (additional)
const GibbsReactorNode = ({ data }) => { const { width=120,height=90,label="Gibbs Reactor" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs />
    <rect x="0.5" y="0.5" width={width-1} height={height-1} rx={10} ry={10} fill="url(#metalGradient)" stroke="#000"/>
    <text x={width/2} y={height/2+4} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
  </svg>
    <Handle type="target" position={Position.Left} id="suction-left" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/>
    <Handle type="source" position={Position.Right} id="discharge-right" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/>
  </div> ); };
const EquilibriumReactorNode = ({ data }) => { const { width=120,height=90,label="Equil. Reactor" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs />
    <rect x="0.5" y="0.5" width={width-1} height={height-1} rx={10} ry={10} fill="url(#metalGradient)" stroke="#000"/>
    {/* equilibrium symbol */}
    <g transform={`translate(${width/2-14}, ${height/2-6})`} opacity=".7">
      <path d="M0 0 L12 0" stroke="#000"/>
      <path d="M12 -4 L20 0 L12 4 Z" fill="#000"/>
      <path d="M20 12 L8 12" stroke="#000"/>
      <path d="M8 8 L0 12 L8 16 Z" fill="#000"/>
    </g>
    <text x={width/2} y={height-6} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
  </svg>
  <Handle type="target" position={Position.Left} id="in-left" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/>
  <Handle type="source" position={Position.Right} id="out-right" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/>
  </div> ); };
const ConversionReactorNode = ({ data }) => { const { width=120,height=90,label="Conversion Reactor" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs />
    <rect x="0.5" y="0.5" width={width-1} height={height-1} rx={10} ry={10} fill="url(#metalGradient)" stroke="#000"/>
    {/* conversion arrow */}
    <path d={`M 20 ${height/2} L ${width-20} ${height/2}`} stroke="#000"/>
    <path d={`M ${width-28} ${height/2-6} L ${width-20} ${height/2} L ${width-28} ${height/2+6} Z`} fill="#000"/>
    <text x={width/2} y={height-6} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
  </svg>
  <Handle type="target" position={Position.Left} id="in-left" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/>
  <Handle type="source" position={Position.Right} id="out-right" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/>
  </div> ); };
const BatchReactorNode = ({ data }) => { const { width=120,height=120,label="Batch Reactor" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs />
    <rect x="0.5" y="0.5" width={width-1} height={height-1} rx={16} ry={16} fill="url(#metalGradient)" stroke="#000"/>
    <path d={`M ${width/2} 12 L ${width/2} ${height-12}`} stroke="#000"/>
    <text x={width/2} y={height-6} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text>
  </svg>
  <Handle type="target" position={Position.Left} id="in-left" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/>
  <Handle type="source" position={Position.Right} id="out-right" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/>
  </div> ); };

// Rotating equipment variants
const SteamTurbineNode = ({ data }) => { const { label="Steam Turbine" } = data||{}; return (
  <div style={{ width: 110, height: 70, display:"grid", placeItems:"center" }}>
    <svg width="110" height="60"><SvgDefs />
      <g transform="translate(10,10)"><path d="M20 4 L50 20 L20 36 Z" fill="url(#metalGradient)" stroke="#000"/><circle cx="70" cy="20" r="18" fill="url(#metalGradient)" stroke="#000"/></g>
    </svg>
    <div style={{ fontSize:12, fontWeight:600 }}>{label}</div>
    <Handle type="target" position={Position.Left} id="in-left" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}/>
    <Handle type="source" position={Position.Right} id="out-right" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}/>
  </div> ); };
const RecipPumpNode = ({ data }) => { const { label="Recip Pump" }=data||{}; return (
  <div style={{ width: 110, height: 70, display:"grid", placeItems:"center" }}>
    <svg width="110" height="60"><SvgDefs />
      <rect x="10" y="18" width="44" height="12" fill="url(#metalGradient)" stroke="#000"/>
      <circle cx="80" cy="24" r="10" fill="url(#metalGradient)" stroke="#000"/>
    </svg>
    <div style={{ fontSize:12, fontWeight:600 }}>{label}</div>
    <Handle type="target" position={Position.Left} id="in-left" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}/>
    <Handle type="source" position={Position.Right} id="out-right" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}/>
  </div> ); };
const RecipCompressorNode = ({ data }) => { const { label="Recip Compressor" }=data||{}; return (
  <div style={{ width: 120, height: 70, display:"grid", placeItems:"center" }}>
    <svg width="120" height="60"><SvgDefs />
      <rect x="10" y="18" width="54" height="12" fill="url(#metalGradient)" stroke="#000"/>
      <circle cx="94" cy="24" r="12" fill="url(#metalGradient)" stroke="#000"/>
    </svg>
    <div style={{ fontSize:12, fontWeight:600 }}>{label}</div>
    <Handle type="target" position={Position.Left} id="in-left" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}/>
    <Handle type="source" position={Position.Right} id="out-right" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}/>
  </div> ); };

// Valves & Safety
const ControlValveNode = ({ data }) => { const { label="Control Valve" }=data||{}; return (
  <div style={{ width: 90, height: 80, display:"grid", placeItems:"center" }}>
    <svg width="90" height="60"><SvgDefs />
      <g transform="translate(10,10)"><path d="M0 10 L30 25 L30 10 L0 25 Z" fill="url(#metalGradient)" stroke="#000"/><circle cx="15" cy="-2" r="6" fill="#fff" stroke="#000"/><line x1="15" y1="4" x2="15" y2="18" stroke="#000"/></g>
    </svg>
    <div style={{ fontSize:12, fontWeight:600 }}>{label}</div>
    <Handle type="target" position={Position.Left} id="in-left" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#4CAF50", border: "2px solid #fff" }}/>
    <Handle type="source" position={Position.Right} id="out-right" style={{ top: "50%", transform: "translateY(-50%)", width: 12, height: 12, background: "#2196F3", border: "2px solid #fff" }}/>
  </div> ); };
const CheckValveNode = ({ data }) => { const { label="Check Valve" }=data||{}; return (
  <div style={{ width: 90, height: 80, display:"grid", placeItems:"center" }}>
    <svg width="90" height="60"><SvgDefs />
      <g transform="translate(10,10)"><rect x="0" y="10" width="40" height="10" fill="#fff" stroke="#000"/><path d="M0 10 L20 5 L20 25 L0 20 Z" fill="url(#metalGradient)" stroke="#000"/></g>
    </svg>
    <div style={{ fontSize:12, fontWeight:600 }}>{label}</div>
    <Handle type="target" position={Position.Left} id="in-left" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/>
    <Handle type="source" position={Position.Right} id="out-right" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/>
  </div> ); };
const PRVNode = ({ data }) => { const { label="PRV/PSV" }=data||{}; return (
  <div style={{ width: 90, height: 90, display:"grid", placeItems:"center" }}>
    <svg width="90" height="70"><SvgDefs />
      <g transform="translate(20,8)"><path d="M10 0 L20 14 L0 14 Z" fill="#fff" stroke="#000"/><rect x="6" y="14" width="8" height="22" fill="#fff" stroke="#000"/><path d="M0 36 L20 36 L20 44 L0 44 Z" fill="#fff" stroke="#000"/></g>
    </svg>
    <div style={{ fontSize:12, fontWeight:600 }}>{label}</div>
    <Handle type="target" position={Position.Left} id="in-left" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/>
    <Handle type="source" position={Position.Right} id="out-right" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/>
  </div> ); };
const ThrottleValveNode = ({ data }) => { const { label="Throttle Valve" }=data||{}; return (
  <div style={{ width: 90, height: 80, display:"grid", placeItems:"center" }}>
    <svg width="90" height="60"><SvgDefs /><g transform="translate(10,10)"><path d="M0 10 L30 25 L30 10 L0 25 Z" fill="url(#metalGradient)" stroke="#000"/><circle cx="15" cy="18" r="4" fill="#000"/></g></svg>
    <div style={{ fontSize:12, fontWeight:600 }}>{label}</div>
    <Handle type="target" position={Position.Left} id="in-left" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/>
    <Handle type="source" position={Position.Right} id="out-right" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/>
  </div> ); };

// Additional vessels
const HorizontalVesselNode = ({ data }) => { const { width=180,height=70,label="Horizontal Vessel" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs /><rect x="0.5" y="10.5" width={width-1} height={height-21} rx={height/2} ry={height/2} fill="url(#metalGradient)" stroke="#000"/><text x={width/2} y={height/2+5} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text></svg><Handle type="target" position={Position.Left} id="in-left" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/><Handle type="source" position={Position.Right} id="out-right" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/></div> ); };
const SurgeDrumNode = ({ data }) => { const { width=140,height=90,label="Surge Drum" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs /><rect x="0.5" y="20.5" width={width-1} height={height-41} rx={16} ry={16} fill="url(#metalGradient)" stroke="#000"/><text x={width/2} y={height-6} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text></svg><Handle type="target" position={Position.Left} id="feed-left" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/><Handle type="source" position={Position.Top} id="vapor-top" style={{ left:"50%", transform:"translateX(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/><Handle type="source" position={Position.Bottom} id="liquid-bottom" style={{ left:"50%", transform:"translateX(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/></div> ); };
const HorizontalKODrumNode = ({ data }) => { const { width=180,height=70,label="KO Drum (Horiz)" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs /><rect x="0.5" y="10.5" width={width-1} height={height-21} rx={height/2} ry={height/2} fill="url(#metalGradient)" stroke="#000"/><line x1={width*0.2} x2={width*0.8} y1={height/2} y2={height/2} stroke="#000" opacity=".3"/><text x={width/2} y={height-6} fontSize="12" fontWeight={600} textAnchor="middle">{label}</text></svg><Handle type="target" position={Position.Left} id="feed-left" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/><Handle type="source" position={Position.Top} id="vapor-top" style={{ left:"50%", transform:"translateX(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/><Handle type="source" position={Position.Bottom} id="liquid-bottom" style={{ left:"50%", transform:"translateX(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/></div> ); };

// Misc equipment
const TeeJunctionNode = ({ data }) => { const { label="Tee" }=data||{}; return (
  <div style={{ width: 70, height: 60, display:"grid", placeItems:"center" }}>
    <svg width="70" height="50"><SvgDefs />
      <path d="M10 25 L60 25 M35 10 L35 40" stroke="#000" strokeWidth="4" />
    </svg>
    <div style={{ fontSize:12, fontWeight:600 }}>{label}</div>
    <Handle type="target" position={Position.Left} id="in-left" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }} />
    <Handle type="source" position={Position.Right} id="out-1-right" style={{ top:"30%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/>
    <Handle type="source" position={Position.Right} id="out-2-right" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/>
    <Handle type="source" position={Position.Right} id="out-3-right" style={{ top:"80%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/>
  </div> ); };
const FilterStrainerNode = ({ data }) => { const { width=110,height=70,label="Filter" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs /><rect x="10" y="10" width={width-20} height={height-20} rx={10} ry={10} fill="#fff" stroke="#000"/><path d={`M 20 20 L ${width-20} ${height-20}`} stroke="#000" opacity=".4"/><path d={`M 20 ${height-20} L ${width-20} 20`} stroke="#000" opacity=".4"/></svg><div style={{ fontSize:12, fontWeight:600, textAlign:"center" }}>{label}</div><Handle type="target" position={Position.Left} id="in-left" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/><Handle type="source" position={Position.Right} id="out-right" style={{ top:"50%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/></div> ); };
const CycloneNode = ({ data }) => { const { width=90,height=120,label="Cyclone" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs /><path d={`M ${width/2} 10 L ${width-20} ${height-40} L 20 ${height-40} Z`} fill="#fff" stroke="#000"/><rect x={width/2-8} y={height-40} width={16} height={24} fill="#fff" stroke="#000"/></svg><div style={{ fontSize:12, fontWeight:600, textAlign:"center" }}>{label}</div><Handle type="target" position={Position.Left} id="feed-left" style={{ top:"40%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/><Handle type="source" position={Position.Top} id="vapor-top" style={{ left:"50%", transform:"translateX(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/><Handle type="source" position={Position.Bottom} id="liquid-bottom" style={{ left:"50%", transform:"translateX(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/></div> ); };
const AdsorberNode = ({ data }) => { const { width=100,height=160,label="Adsorber" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs /><rect x="10" y="10" width={width-20} height={height-20} rx={20} ry={20} fill="url(#metalGradient)" stroke="#000"/><text x={width/2} y={height/2} fontSize="10" textAnchor="middle" opacity=".6">BED</text></svg><div style={{ fontSize:12, fontWeight:600, textAlign:"center" }}>{label}</div><Handle type="target" position={Position.Left} id="in-left" style={{ top:"60%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/><Handle type="source" position={Position.Right} id="out-right" style={{ top:"60%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/></div> ); };
const MembraneNode = ({ data }) => { const { width=140,height=80,label="Membrane" }=data||{}; return (
  <div style={{ width, height }}><svg width={width} height={height}><SvgDefs /><rect x="0.5" y="10.5" width={width-1} height={height-21} rx={10} ry={10} fill="#fff" stroke="#000"/><path d={`M ${width/2} 12 L ${width/2} ${height-12}`} stroke="#000" strokeDasharray="4 4"/><path d={`M ${width/2-16} ${height/2} L ${width/2+16} ${height/2}`} stroke="#000" markerEnd="url(#arrow)"/></svg><div style={{ fontSize:12, fontWeight:600, textAlign:"center" }}>{label}</div><Handle type="target" position={Position.Left} id="in-left" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#4CAF50", border:"2px solid #fff" }}/><Handle type="source" position={Position.Right} id="out-right" style={{ top:"55%", transform:"translateY(-50%)", width:12, height:12, background:"#2196F3", border:"2px solid #fff" }}/></div> ); };

// Instrumentation bubbles
const InstrumentBubble = ({ code="TI" }) => (
  <svg width="28" height="28"><circle cx="14" cy="14" r="12" fill="#fff" stroke="#000"/><text x="14" y="18" fontSize="10" textAnchor="middle" fontWeight={700}>{code}</text></svg>
);
const FCBubbleNode = () => <div style={{display:'grid',placeItems:'center'}}><InstrumentBubble code="FC" /></div>;
const PCBubbleNode = () => <div style={{display:'grid',placeItems:'center'}}><InstrumentBubble code="PC" /></div>;
const TCBubbleNode = () => <div style={{display:'grid',placeItems:'center'}}><InstrumentBubble code="TC" /></div>;

// ────────────────────────────────────────────────────────────────────────────────
// EDGES (Material & Energy)
// ────────────────────────────────────────────────────────────────────────────────
const AnimatedPipe = ({ sourceX, sourceY, targetX, targetY, markerEnd }: EdgeProps) => {
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  return (
    <g>
      <path d={path} stroke="#000" strokeWidth={6} fill="none" />
      <path d={path} stroke="#aaa" strokeWidth={4} fill="none" />
      <path d={path} className="pipe-flow" stroke="#fff" strokeWidth={3} strokeDasharray="10 10" markerEnd={markerEnd} fill="none" />
    </g>
  );
};

// Step edge for horizontal/vertical lines like Aspen HYSYS
const StepEdge = ({ sourceX, sourceY, targetX, targetY, markerEnd }: EdgeProps) => {
  // Calculate the midpoint for the step
  const midX = (sourceX + targetX) / 2;
  
  // Create step path: horizontal first, then vertical
  const path = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
  
  return (
    <g>
      <path d={path} stroke="#000" strokeWidth={6} fill="none" />
      <path d={path} stroke="#aaa" strokeWidth={4} fill="none" />
      <path d={path} className="pipe-flow" stroke="#fff" strokeWidth={3} strokeDasharray="10 10" markerEnd={markerEnd} fill="none" />
    </g>
  );
};

// Smooth step edge with better routing
const SmoothStepEdge = ({ sourceX, sourceY, targetX, targetY, markerEnd }: EdgeProps) => {
  const deltaX = Math.abs(targetX - sourceX);
  const deltaY = Math.abs(targetY - sourceY);
  
  // Determine if we should go horizontal first or vertical first
  const horizontalFirst = deltaX > deltaY;
  
  let path;
  if (horizontalFirst) {
    // Go horizontal first, then vertical
    const midX = sourceX + (targetX - sourceX) * 0.5;
    path = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
  } else {
    // Go vertical first, then horizontal
    const midY = sourceY + (targetY - sourceY) * 0.5;
    path = `M ${sourceX} ${sourceY} L ${sourceX} ${midY} L ${targetX} ${midY} L ${targetX} ${targetY}`;
  }
  
  return (
    <g>
      <path d={path} stroke="#000" strokeWidth={6} fill="none" />
      <path d={path} stroke="#aaa" strokeWidth={4} fill="none" />
      <path d={path} className="pipe-flow" stroke="#fff" strokeWidth={3} strokeDasharray="10 10" markerEnd={markerEnd} fill="none" />
    </g>
  );
};

// Advanced step edge with multiple segments for complex routing
const AdvancedStepEdge = ({ sourceX, sourceY, targetX, targetY, markerEnd }: EdgeProps) => {
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const absDeltaX = Math.abs(deltaX);
  const absDeltaY = Math.abs(deltaY);
  
  // For very close nodes, use straight line
  if (absDeltaX < 20 && absDeltaY < 20) {
    const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    return (
      <g>
        <path d={path} stroke="#000" strokeWidth={6} fill="none" />
        <path d={path} stroke="#aaa" strokeWidth={4} fill="none" />
        <path d={path} className="pipe-flow" stroke="#fff" strokeWidth={3} strokeDasharray="10 10" markerEnd={markerEnd} fill="none" />
      </g>
    );
  }
  
  // Determine routing strategy based on distance and direction
  let path;
  
  if (absDeltaX > absDeltaY) {
    // Horizontal routing: go horizontal first
    const midX = sourceX + deltaX * 0.5;
    path = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
  } else {
    // Vertical routing: go vertical first
    const midY = sourceY + deltaY * 0.5;
    path = `M ${sourceX} ${sourceY} L ${sourceX} ${midY} L ${targetX} ${midY} L ${targetX} ${targetY}`;
  }
  
  return (
    <g>
      <path d={path} stroke="#000" strokeWidth={6} fill="none" />
      <path d={path} stroke="#aaa" strokeWidth={4} fill="none" />
      <path d={path} className="pipe-flow" stroke="#fff" strokeWidth={3} strokeDasharray="10 10" markerEnd={markerEnd} fill="none" />
    </g>
  );
};

const EnergyEdge = ({ sourceX, sourceY, targetX, targetY }: EdgeProps) => {
  // Thin dashed line for heat/work streams - also use step pattern
  const deltaX = Math.abs(targetX - sourceX);
  const deltaY = Math.abs(targetY - sourceY);
  const horizontalFirst = deltaX > deltaY;
  
  let path;
  if (horizontalFirst) {
    const midX = sourceX + (targetX - sourceX) * 0.5;
    path = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
  } else {
    const midY = sourceY + (targetY - sourceY) * 0.5;
    path = `M ${sourceX} ${sourceY} L ${sourceX} ${midY} L ${targetX} ${midY} L ${targetX} ${targetY}`;
  }
  
  return <path d={path} stroke="#333" strokeWidth={2} strokeDasharray="6 6" markerEnd="url(#arrow)" fill="none" />;
};

const edgeTypes = { 
  animatedPipe: AnimatedPipe, 
  step: AdvancedStepEdge,  // Use advanced step as default for material streams
  smoothStep: SmoothStepEdge,  // Alternative smooth step option
  energy: EnergyEdge, 
  info: EnergyEdge 
};

// Register all node types
const nodeTypes = {
  // Vessels & Columns
  distillationColumn: DistillationColumnNode,
  packedColumn: PackedColumnNode,
  absorber: AbsorberNode,
  stripper: StripperNode,
  flashDrum: FlashDrumNode,
  separator: SeparatorHorizontalNode,
  separator3p: Separator3PhaseNode,
  tank: TankNode,
  horizontalVessel: HorizontalVesselNode,
  surgeDrum: SurgeDrumNode,
  knockoutDrumH: HorizontalKODrumNode,

  // Heat transfer
  heaterCooler: HeaterCoolerNode,
  shellTubeHX: ShellTubeHXNode,
  airCooler: AirCoolerNode,
  kettleReboiler: KettleReboilerNode,
  plateHX: PlateHXNode,
  doublePipeHX: DoublePipeHXNode,
  firedHeater: FiredHeaterNode,

  // Reaction
  cstr: CSTRNode,
  pfr: PFRNode,
  gibbsReactor: GibbsReactorNode,
  equilibriumReactor: EquilibriumReactorNode,
  conversionReactor: ConversionReactorNode,
  batchReactor: BatchReactorNode,

  // Rotating machinery
  pump: PumpNode,
  compressor: CompressorNode,
  turbine: TurbineNode,
  steamTurbine: SteamTurbineNode,
  recipPump: RecipPumpNode,
  recipCompressor: RecipCompressorNode,

  // Valving & junctions
  valve: ValveNode,
  controlValve: ControlValveNode,
  checkValve: CheckValveNode,
  prv: PRVNode,
  throttleValve: ThrottleValveNode,
  mixer: MixerNode,
  splitter: SplitterNode,
  tee: TeeJunctionNode,

  // Misc process units
  filter: FilterStrainerNode,
  cyclone: CycloneNode,
  adsorber: AdsorberNode,
  membrane: MembraneNode,

  // Instruments
  fc: FCBubbleNode,
  pc: PCBubbleNode,
  tc: TCBubbleNode,

  // Misc
  boiler: BoilerNode,
  condenser: CondenserNode,
  label: LabelNode,

  // Fallback mappings for common AI-generated types
  reactor: CSTRNode, // Default reactor to CSTR
  heat_exchanger: ShellTubeHXNode, // Default heat exchanger to shell & tube
  storage_tank: TankNode, // Default storage tank to tank
  flash_drum: FlashDrumNode, // Flash drum mapping
  knockout_drum: HorizontalKODrumNode, // Knockout drum mapping
  surge_drum: SurgeDrumNode, // Surge drum mapping
  reflux_drum: SurgeDrumNode, // Reflux drum to surge drum
  accumulator: SurgeDrumNode, // Accumulator to surge drum
  phase_separator: SeparatorHorizontalNode, // Phase separator to separator
  gas_liquid_separator: SeparatorHorizontalNode, // Gas-liquid separator
  liquid_liquid_separator: SeparatorHorizontalNode, // Liquid-liquid separator
  solid_liquid_separator: SeparatorHorizontalNode, // Solid-liquid separator
  cooler: HeaterCoolerNode, // Cooler to heater/cooler
  heater: HeaterCoolerNode, // Heater to heater/cooler
  preheater: HeaterCoolerNode, // Preheater to heater/cooler
  intercooler: HeaterCoolerNode, // Intercooler to heater/cooler
  aftercooler: HeaterCoolerNode, // Aftercooler to heater/cooler
  economizer: HeaterCoolerNode, // Economizer to heater/cooler
  superheater: HeaterCoolerNode, // Superheater to heater/cooler
  desuperheater: HeaterCoolerNode, // Desuperheater to heater/cooler
  reboiler: KettleReboilerNode, // Reboiler to kettle reboiler
  expander: TurbineNode, // Expander to turbine
  fan: CompressorNode, // Fan to compressor
  blower: CompressorNode, // Blower to compressor
  crystallizer: CSTRNode, // Crystallizer to CSTR
  dryer: HeaterCoolerNode, // Dryer to heater/cooler
  evaporator: HeaterCoolerNode, // Evaporator to heater/cooler
  scrubber: AbsorberNode, // Scrubber to absorber
  extractor: SeparatorHorizontalNode, // Extractor to separator
  decanter: SeparatorHorizontalNode, // Decanter to separator
  settler: SeparatorHorizontalNode, // Settler to separator
  thickener: SeparatorHorizontalNode, // Thickener to separator
  clarifier: SeparatorHorizontalNode, // Clarifier to separator
  centrifuge: SeparatorHorizontalNode, // Centrifuge to separator
  filter_press: FilterStrainerNode, // Filter press to filter
  belt_filter: FilterStrainerNode, // Belt filter to filter
  vacuum_filter: FilterStrainerNode, // Vacuum filter to filter
  rotary_filter: FilterStrainerNode, // Rotary filter to filter
  pressure_filter: FilterStrainerNode, // Pressure filter to filter
  gravity_filter: FilterStrainerNode, // Gravity filter to filter
  magnetic_filter: FilterStrainerNode, // Magnetic filter to filter
  electrostatic_filter: FilterStrainerNode, // Electrostatic filter to filter
  ion_exchange: AdsorberNode, // Ion exchange to adsorber
  adsorption: AdsorberNode, // Adsorption to adsorber
  absorption: AbsorberNode, // Absorption to absorber
  stripping: StripperNode, // Stripping to stripper
  extraction: SeparatorHorizontalNode, // Extraction to separator
  distillation: DistillationColumnNode, // Distillation to distillation column
  rectification: DistillationColumnNode, // Rectification to distillation column
  desorption: StripperNode, // Desorption to stripper
  regeneration: HeaterCoolerNode, // Regeneration to heater/cooler
  crystallization: CSTRNode, // Crystallization to CSTR
  precipitation: SeparatorHorizontalNode, // Precipitation to separator
  coagulation: SeparatorHorizontalNode, // Coagulation to separator
  flocculation: SeparatorHorizontalNode, // Flocculation to separator
  sedimentation: SeparatorHorizontalNode, // Sedimentation to separator
  filtration: FilterStrainerNode, // Filtration to filter
  centrifugation: SeparatorHorizontalNode, // Centrifugation to separator
  drying: HeaterCoolerNode, // Drying to heater/cooler
  evaporation: HeaterCoolerNode, // Evaporation to heater/cooler
  concentration: HeaterCoolerNode, // Concentration to heater/cooler
  purification: SeparatorHorizontalNode, // Purification to separator
  separation: SeparatorHorizontalNode, // Separation to separator
  fractionation: DistillationColumnNode, // Fractionation to distillation column
};

const initialNodes = [
  { id: "n1", type: "tank", position: { x: 40, y: 40 }, data: { label: "Propane Separation Tank", width: 160, height: 110, fillLevel: 0.7 } },
  { id: "n2", type: "pump", position: { x: 260, y: 70 }, data: { label: "Centrifugal Feed Pump P‑101" } },
  { id: "n3", type: "heaterCooler", position: { x: 380, y: 60 }, data: { label: "Preheater E‑201" } },
  { id: "n4", type: "distillationColumn", position: { x: 520, y: 10 }, data: { label: "Propane Butane Distillation Column T‑201", width: 90, height: 260, fillLevel: 0.45 } },
  { id: "n5", type: "condenser", position: { x: 720, y: 10 }, data: { label: "Overhead Condenser" } },
  { id: "n6", type: "boiler", position: { x: 720, y: 220 }, data: { label: "Reboiler E‑202" } },
  { id: "n7", type: "flashDrum", position: { x: 900, y: 40 }, data: { label: "Knockout Drum V‑301" } },
  { id: "n8", type: "shellTubeHX", position: { x: 1060, y: 40 }, data: { label: "Shell & Tube Heat Exchanger E‑301" } },
  { id: "n9", type: "compressor", position: { x: 1060, y: 200 }, data: { label: "Multi Stage Centrifugal Compressor K‑401" } },
  { id: "n10", type: "separator3p", position: { x: 1260, y: 160 }, data: { label: "3‑Phase Separator V‑501" } },
  { id: "n11", type: "cstr", position: { x: 1260, y: 20 }, data: { label: "Continuous Stirred Tank Reactor R‑501", fillLevel: 0.55 } },
  { id: "n12", type: "pfr", position: { x: 1480, y: 40 }, data: { label: "Plug Flow Reactor R‑601" } },
  { id: "n13", type: "airCooler", position: { x: 1480, y: 160 }, data: { label: "Air Cooler E‑701" } },
  { id: "n14", type: "mixer", position: { x: 260, y: 220 }, data: { label: "Static Mixer" } },
  { id: "n15", type: "splitter", position: { x: 380, y: 220 }, data: { label: "Stream Splitter" } },
  { id: "n16", type: "valve", position: { x: 520, y: 220 }, data: { label: "Control Valve" } },
  { id: "n17", type: "turbine", position: { x: 900, y: 220 }, data: { label: "Steam Turbine K‑801" } },
  { id: "n18", type: "label", position: { x: 860, y: 320 }, data: { text: "Aspen‑style palette (ReactFlow)" } },
  { id: "n19", type: "absorber", position: { x: 520, y: 300 }, data: { label: "Gas Absorption Column T‑401", width: 80, height: 200, fillLevel: 0.4 } },
  { id: "n20", type: "stripper", position: { x: 640, y: 300 }, data: { label: "Stripping Column T‑402", width: 80, height: 200, fillLevel: 0.3 } },
  { id: "n21", type: "knockoutDrum", position: { x: 760, y: 300 }, data: { label: "Horizontal Knockout Drum V‑601", fillLevel: 0.5 } },
];

const initialEdges = [
  { id: "e1", source: "n1", target: "n2", type: "step" },
  { id: "e2", source: "n2", target: "n3", type: "step" },
  { id: "e3", source: "n3", target: "n4", type: "step" },
  { id: "e4", source: "n4", target: "n5", type: "step" },
  { id: "e5", source: "n4", target: "n6", type: "step" },
  { id: "e6", source: "n5", target: "n7", type: "step" },
  { id: "e7", source: "n7", target: "n8", type: "step" },
  { id: "e8", source: "n8", target: "n9", type: "step" },
  { id: "e9", source: "n9", target: "n10", type: "step" },
  { id: "e10", source: "n11", target: "n12", type: "step" },
  { id: "e11", source: "n12", target: "n13", type: "step" },
  // Energy links (duty) to condenser and reboiler
  { id: "q1", source: "n6", target: "n4", type: "energy" },
  { id: "q2", source: "n5", target: "n4", type: "energy" },
];

// ────────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────────
// Main HYSYS Flowsheet Editor Component
// ────────────────────────────────────────────────────────────────────────────────
interface HYSYSFlowsheetEditorProps {
  generatedNodes?: Node[];
  generatedEdges?: Edge[];
}

export default function HYSYSFlowsheetEditor({ generatedNodes = [], generatedEdges = [] }: HYSYSFlowsheetEditorProps) {
  const [nodes, setNodes, onNodesState] = useNodesState(generatedNodes);
  const [edges, setEdges, onEdgesState] = useEdgesState(generatedEdges);

  // Update nodes and edges when props change
  useEffect(() => {
    setNodes(generatedNodes);
  }, [generatedNodes, setNodes]);

  useEffect(() => {
    setEdges(generatedEdges);
  }, [generatedEdges, setEdges]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, type: "step" }, eds));
  }, [setEdges]);

  const proStyles = useMemo(() => ({
    width: "100%",
    height: "100%",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
  }), []);

  return (
    <div style={{ padding: 0, position: "relative", height: "100%" }}>
      <style>{`
        .pipe-flow { animation: dash 1.2s linear infinite; }
        @keyframes dash { to { stroke-dashoffset: -20; } }
      `}</style>

      <div style={proStyles}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesState}
          onEdgesChange={onEdgesState}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background gap={24} size={1} />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

// Export the node types for use in other components
export { nodeTypes };
