import { MechanicalSystemSpecType } from "./mechanical-spec";
import { DxfWriter, LWPolylineFlags, LineTypes, Colors, Units, point2d, point3d } from "@tarikjabiri/dxf";

type MechanicalComponent = MechanicalSystemSpecType['components'][number];

/**
 * Generate professional P&ID-style DXF from AI-generated mechanical system spec
 */
export function generateMechanicalDXF(spec: MechanicalSystemSpecType): string {
  const dxf = new DxfWriter();
  
  // Set units and drawing limits
  dxf.setUnits(Units.Millimeters);
  
  // Set proper drawing limits to ensure AutoCAD can display the drawing
  // Use the same approach as the working test DXF generation
  const halfWidth = 100;
  const halfHeight = 75;
  const margin = 50;
  
  // Set limits using the same format as working test DXF
  dxf.setVariable("$EXTMIN", { 10: -halfWidth - margin, 20: -halfHeight - margin, 30: 0 });
  dxf.setVariable("$EXTMAX", { 10: halfWidth + margin, 20: halfHeight + margin, 30: 100 });
  
  // Add line types
  dxf.addLType("DASHED", "Dashed __ __ __", [5, -2.5, 5, -2.5]);
  dxf.addLType("CENTER2", "Center ____ _ ____", [12, -2, 2, -2]);
  
  // Create professional P&ID layers
  dxf.addLayer("COMPONENTS", Colors.Cyan, "CONTINUOUS");
  dxf.addLayer("PIPING", Colors.Red, "CONTINUOUS");
  dxf.addLayer("ELECTRICAL", Colors.Yellow, "DASHED");
  dxf.addLayer("CONTROL", Colors.Green, "DASHED");
  dxf.addLayer("TEXT", Colors.White, "CONTINUOUS");
  dxf.addLayer("ANNOTATIONS", Colors.Gray, "CONTINUOUS");
  dxf.addLayer("GRID", Colors.DarkGray, "DASHED");
  dxf.addLayer("BORDER", Colors.White, "CONTINUOUS");
  
  // Draw border and title block
  drawBorder(dxf, spec);
  
  // Draw grid (optional, subtle)
  drawGrid(dxf, spec);
  
  // Draw all components
  for (const component of spec.components) {
    drawComponent(dxf, component);
  }
  
  // Add a simple test rectangle to ensure there's always visible content
  dxf.addLWPolyline([
    { point: point2d(10, 10) },
    { point: point2d(50, 10) },
    { point: point2d(50, 30) },
    { point: point2d(10, 30) },
    { point: point2d(10, 10) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Add test text
  dxf.addText(point3d(15, 20, 0), 5, "TEST DRAWING", {
    layerName: "TEXT"
  });
  
  // Add a simple pump symbol to ensure there's always visible content
  const testPumpX = 100;
  const testPumpY = 100;
  const testPumpSize = 40;
  
  // Test pump casing
  dxf.addLWPolyline([
    { point: point2d(testPumpX - testPumpSize/2, testPumpY - testPumpSize/2) },
    { point: point2d(testPumpX + testPumpSize/2, testPumpY - testPumpSize/2) },
    { point: point2d(testPumpX + testPumpSize/2, testPumpY + testPumpSize/2) },
    { point: point2d(testPumpX - testPumpSize/2, testPumpY + testPumpSize/2) },
    { point: point2d(testPumpX - testPumpSize/2, testPumpY - testPumpSize/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Test pump impeller
  dxf.addCircle(point3d(testPumpX, testPumpY, 0), testPumpSize/4, {
    layerName: "COMPONENTS"
  });
  
  // Test pump label
  dxf.addText(point3d(testPumpX - 15, testPumpY + testPumpSize/2 + 5, 0), 6, "TEST PUMP", {
    layerName: "TEXT"
  });
  
  // Draw all connections
  for (const connection of spec.connections) {
    drawConnection(dxf, connection, spec);
  }
  
  // Draw annotations
  if (spec.annotations) {
    for (const annotation of spec.annotations) {
      dxf.addText(point3d(annotation.position.x, annotation.position.y, 0), 8, annotation.text, {
        layerName: "ANNOTATIONS"
      });
    }
  }
  
  return dxf.stringify();
}

function drawBorder(dxf: DxfWriter, spec: MechanicalSystemSpecType) {
  const margin = 50;
  
  // Main border
  dxf.addLWPolyline([
    { point: point2d(-margin, -margin) },
    { point: point2d(spec.layout.width + margin, -margin) },
    { point: point2d(spec.layout.width + margin, spec.layout.height + margin) },
    { point: point2d(-margin, spec.layout.height + margin) },
    { point: point2d(-margin, -margin) }
  ], {
    closed: true,
    layerName: "BORDER"
  });
  
  // Title block
  const titleBlockY = spec.layout.height + margin + 20;
  dxf.addText(point3d(10, titleBlockY, 0), 12, `Project: ${spec.project.name}`, {
    layerName: "TEXT"
  });
  dxf.addText(point3d(10, titleBlockY + 20, 0), 10, `System: ${spec.project.systemType.replace(/_/g, " ").toUpperCase()}`, {
    layerName: "TEXT"
  });
  dxf.addText(point3d(10, titleBlockY + 35, 0), 8, `Units: ${spec.project.units.toUpperCase()}`, {
    layerName: "TEXT"
  });
  
  if (spec.project.description) {
    dxf.addText(point3d(10, titleBlockY + 50, 0), 8, spec.project.description, {
      layerName: "TEXT"
    });
  }
}

function drawGrid(dxf: DxfWriter, spec: MechanicalSystemSpecType) {
  const spacing = spec.layout.gridSpacing;
  
  // Vertical grid lines
  for (let x = 0; x <= spec.layout.width; x += spacing) {
    dxf.addLine(point3d(x, 0, 0), point3d(x, spec.layout.height, 0), {
      layerName: "GRID"
    });
  }
  
  // Horizontal grid lines
  for (let y = 0; y <= spec.layout.height; y += spacing) {
    dxf.addLine(point3d(0, y, 0), point3d(spec.layout.width, y, 0), {
      layerName: "GRID"
    });
  }
}

function drawComponent(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const { width, height } = component.size;
  
  // Draw symbol based on component type
  switch (component.type) {
    case "pump":
      drawPumpSymbol(dxf, component);
      break;
    case "compressor":
      drawCompressorSymbol(dxf, component);
      break;
    case "heat_exchanger":
      drawHeatExchangerSymbol(dxf, component);
      break;
    case "valve":
      drawValveSymbol(dxf, component);
      break;
    case "tank":
      drawTankSymbol(dxf, component);
      break;
    case "pressure_vessel":
      drawPressureVesselSymbol(dxf, component);
      break;
    case "turbine":
      drawTurbineSymbol(dxf, component);
      break;
    case "motor":
      drawMotorSymbol(dxf, component);
      break;
    case "generator":
      drawGeneratorSymbol(dxf, component);
      break;
    case "filter":
      drawFilterSymbol(dxf, component);
      break;
    case "separator":
      drawSeparatorSymbol(dxf, component);
      break;
    case "reactor":
      drawReactorSymbol(dxf, component);
      break;
    case "instrument":
      drawInstrumentationSymbol(dxf, component);
      break;
    default:
      // Generic rectangle for unknown types
      dxf.addLWPolyline([
        { point: point2d(x - width/2, y - height/2) },
        { point: point2d(x + width/2, y - height/2) },
        { point: point2d(x + width/2, y + height/2) },
        { point: point2d(x - width/2, y + height/2) },
        { point: point2d(x - width/2, y - height/2) }
      ], {
        closed: true,
        layerName: "COMPONENTS"
      });
  }
  
  // Draw component label
  dxf.addText(point3d(x - width/2, y + height/2 + 20, 0), 8, component.name, {
    layerName: "TEXT"
  });
  
  // Draw specifications if available
  if (component.parameters) {
    const specEntries = Object.entries(component.parameters)
      .filter(([, value]) => typeof value === "string" || typeof value === "number")
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`);
    specEntries.forEach((line, index) => {
      dxf.addText(point3d(x - width/2, y + height/2 + 35 + index * 10, 0), 6, line, {
        layerName: "TEXT"
      });
    });
  }

  // Parameter-specific callouts supplied via metadata
  if ((component.parameters as Record<string, any> | undefined)?.additionalCallouts) {
    const callouts = component.parameters.additionalCallouts as Array<{
      label?: string;
      text: string;
      target?: { x: number; y: number };
      textPosition?: { x: number; y: number };
    }>;
    callouts.forEach((detail) => {
      const target = detail.target
        ? { x: component.position.x + detail.target.x, y: component.position.y + detail.target.y }
        : { x: component.position.x, y: component.position.y };
      const textPosition = detail.textPosition
        ? { x: component.position.x + detail.textPosition.x, y: component.position.y + detail.textPosition.y }
        : { x: component.position.x + width / 2 + 60, y: component.position.y + height / 2 + 60 };
      drawLeaderCallout(dxf, {
        label: detail.label,
        text: detail.text,
        target,
        textPosition
      });
    });
  }
}

function drawConnection(dxf: DxfWriter, connection: any, spec: MechanicalSystemSpecType) {
  const fromComp = spec.components.find(c => c.id === connection.from);
  const toComp = spec.components.find(c => c.id === connection.to);
  
  if (fromComp && toComp) {
    const startX = fromComp.position.x;
    const startY = fromComp.position.y;
    const endX = toComp.position.x;
    const endY = toComp.position.y;
    
    // Draw connection line
    dxf.addLine(point3d(startX, startY, 0), point3d(endX, endY, 0), {
      layerName: "PIPING"
    });
    
    // Add pipe diameter label
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    dxf.addText(point3d(midX, midY + 10, 0), 6, `${connection.diameter}mm`, {
      layerName: "ANNOTATIONS"
    });
  }
}

// Component symbol drawing functions
function drawPumpSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const width = component.size.width || 280;
  const height = component.size.height || 200;
  const scale = Math.max(width, height) / 200;
  const casingWidth = width * 0.8;
  const casingHeight = height * 0.65;
  const casingLeft = x - casingWidth / 2;
  const casingRight = x + casingWidth / 2;
  const casingTop = y + casingHeight / 2;
  const casingBottom = y - casingHeight / 2;
  const wall = Math.max(6, casingWidth * 0.06);
  const parameters = component.parameters as Record<string, any> | undefined;

  // Outer pump casing with volute form
  dxf.addLWPolyline([
    { point: point2d(casingLeft, casingBottom) },
    { point: point2d(casingLeft, casingTop) },
    { point: point2d(x - casingWidth * 0.05, casingTop + wall * 2) },
    { point: point2d(x + casingWidth * 0.3, casingTop + wall * 1.5) },
    { point: point2d(casingRight + casingWidth * 0.15, y + casingHeight * 0.1) },
    { point: point2d(casingRight, casingBottom) },
    { point: point2d(casingLeft, casingBottom) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });

  // Inner casing wall (shows thickness)
  dxf.addLWPolyline([
    { point: point2d(casingLeft + wall, casingBottom + wall) },
    { point: point2d(casingLeft + wall, casingTop - wall) },
    { point: point2d(x - casingWidth * 0.03, casingTop + wall * 1.1) },
    { point: point2d(x + casingWidth * 0.2, casingTop + wall * 0.8) },
    { point: point2d(casingRight - wall, y + casingHeight * 0.08) },
    { point: point2d(casingRight - wall, casingBottom + wall) },
    { point: point2d(casingLeft + wall, casingBottom + wall) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });

  // Section hatching inside casing
  const hatchSpacing = 8 * scale;
  for (let hx = casingLeft + wall * 1.5; hx < casingRight - wall * 1.5; hx += hatchSpacing) {
    dxf.addLine(
      point3d(hx, casingBottom + wall * 1.2, 0),
      point3d(hx + casingHeight * 0.4, casingTop - wall * 1.2, 0),
      { layerName: "COMPONENTS" }
    );
  }

  // Impeller hub and blades
  const impellerRadius = Math.min(casingWidth, casingHeight) * 0.24;
  dxf.addCircle(point3d(x, y, 0), impellerRadius, { layerName: "COMPONENTS" });
  dxf.addCircle(point3d(x, y, 0), impellerRadius * 0.42, { layerName: "COMPONENTS" });
  dxf.addCircle(point3d(x, y, 0), impellerRadius * 0.08, { layerName: "COMPONENTS" });

  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 + 15) * Math.PI / 180;
    const innerR = impellerRadius * 0.45;
    const outerR = impellerRadius * 0.95;
    const offsetAngle = 12 * Math.PI / 180;
    const start = point3d(x + Math.cos(angle) * innerR, y + Math.sin(angle) * innerR, 0);
    const end = point3d(x + Math.cos(angle + offsetAngle) * outerR, y + Math.sin(angle + offsetAngle) * outerR, 0);
    dxf.addLine(start, end, { layerName: "COMPONENTS" });
  }

  // Wear rings
  dxf.addCircle(point3d(x, y, 0), impellerRadius * 1.05, { layerName: "COMPONENTS" });

  // Shaft with stepped diameters
  const shaftHalfWidth = Math.max(6, width * 0.03);
  const shaftTop = casingTop + 120 * scale;
  const shaftBottom = casingBottom - 40 * scale;
  dxf.addLWPolyline([
    { point: point2d(x - shaftHalfWidth, shaftBottom) },
    { point: point2d(x + shaftHalfWidth, shaftBottom) },
    { point: point2d(x + shaftHalfWidth, shaftTop) },
    { point: point2d(x - shaftHalfWidth, shaftTop) },
    { point: point2d(x - shaftHalfWidth, shaftBottom) }
  ], { closed: true, layerName: "COMPONENTS" });

  // Shaft shoulders
  const shoulderWidth = shaftHalfWidth * 1.8;
  dxf.addLWPolyline([
    { point: point2d(x - shoulderWidth, casingTop + wall * 0.4) },
    { point: point2d(x + shoulderWidth, casingTop + wall * 0.4) },
    { point: point2d(x + shoulderWidth, casingTop + wall * 1.3) },
    { point: point2d(x - shoulderWidth, casingTop + wall * 1.3) },
    { point: point2d(x - shoulderWidth, casingTop + wall * 0.4) }
  ], { closed: true, layerName: "COMPONENTS" });

  // Mechanical seal assembly
  const sealTop = casingTop + 30 * scale;
  const sealBottom = casingTop - 10 * scale;
  dxf.addLWPolyline([
    { point: point2d(x - shoulderWidth * 1.1, sealBottom) },
    { point: point2d(x + shoulderWidth * 1.1, sealBottom) },
    { point: point2d(x + shoulderWidth * 1.1, sealTop) },
    { point: point2d(x - shoulderWidth * 1.1, sealTop) },
    { point: point2d(x - shoulderWidth * 1.1, sealBottom) }
  ], { closed: true, layerName: "COMPONENTS" });

  // Seal springs
  const springCount = 6;
  const springRadius = shaftHalfWidth * 0.7;
  for (let i = 0; i < springCount; i++) {
    const springY = sealBottom + (i + 0.5) * ((sealTop - sealBottom) / springCount);
    dxf.addCircle(point3d(x + shoulderWidth * 0.85, springY, 0), springRadius, { layerName: "COMPONENTS" });
    dxf.addCircle(point3d(x - shoulderWidth * 0.85, springY, 0), springRadius, { layerName: "COMPONENTS" });
  }

  // Seal faces
  dxf.addLWPolyline([
    { point: point2d(x - shaftHalfWidth * 1.2, casingTop + wall * 0.2) },
    { point: point2d(x + shaftHalfWidth * 1.2, casingTop + wall * 0.2) },
    { point: point2d(x + shaftHalfWidth * 1.2, casingTop + wall * 0.9) },
    { point: point2d(x - shaftHalfWidth * 1.2, casingTop + wall * 0.9) },
    { point: point2d(x - shaftHalfWidth * 1.2, casingTop + wall * 0.2) }
  ], { closed: true, layerName: "COMPONENTS" });

  // Bearings (drive end and non-drive end)
  const bearingWidth = 35 * scale;
  const bearingOffset = 50 * scale;
  const bearing1Bottom = sealTop + 10 * scale;
  const bearing1Top = bearing1Bottom + bearingWidth;
  const bearing2Bottom = bearing1Top + bearingOffset;
  const bearing2Top = bearing2Bottom + bearingWidth;

  [ [bearing1Bottom, bearing1Top], [bearing2Bottom, bearing2Top] ].forEach(([bottom, top]) => {
    dxf.addLWPolyline([
      { point: point2d(x - shoulderWidth * 1.4, bottom) },
      { point: point2d(x + shoulderWidth * 1.4, bottom) },
      { point: point2d(x + shoulderWidth * 1.4, top) },
      { point: point2d(x - shoulderWidth * 1.4, top) },
      { point: point2d(x - shoulderWidth * 1.4, bottom) }
    ], { closed: true, layerName: "COMPONENTS" });

    for (let i = 0; i < 4; i++) {
      const hatchY = bottom + ((top - bottom) / 4) * i;
      dxf.addLine(
        point3d(x - shoulderWidth * 1.4, hatchY, 0),
        point3d(x + shoulderWidth * 1.4, hatchY + 6 * scale, 0),
        { layerName: "COMPONENTS" }
      );
    }
  });

  // Coupling spacer and guard
  const couplingTop = bearing2Top + 20 * scale;
  const couplingBottom = couplingTop + 25 * scale;
  const couplingWidth = shoulderWidth * 1.6;
  dxf.addLWPolyline([
    { point: point2d(x - couplingWidth, couplingTop) },
    { point: point2d(x + couplingWidth, couplingTop) },
    { point: point2d(x + couplingWidth, couplingBottom) },
    { point: point2d(x - couplingWidth, couplingBottom) },
    { point: point2d(x - couplingWidth, couplingTop) }
  ], { closed: true, layerName: "ELECTRICAL" });

  dxf.addLWPolyline([
    { point: point2d(x - couplingWidth * 1.2, couplingTop - 10 * scale) },
    { point: point2d(x + couplingWidth * 1.2, couplingTop - 10 * scale) },
    { point: point2d(x + couplingWidth * 1.2, couplingBottom + 10 * scale) },
    { point: point2d(x - couplingWidth * 1.2, couplingBottom + 10 * scale) },
    { point: point2d(x - couplingWidth * 1.2, couplingTop - 10 * scale) }
  ], { closed: true, layerName: "ELECTRICAL" });

  // Baseplate & grout pockets
  const baseTop = casingBottom - 30 * scale;
  const baseBottom = baseTop - 35 * scale;
  const baseWidth = casingWidth * 1.2;
  const baseLeft = x - baseWidth / 2;
  const baseRight = x + baseWidth / 2;
  dxf.addLWPolyline([
    { point: point2d(baseLeft, baseBottom) },
    { point: point2d(baseRight, baseBottom) },
    { point: point2d(baseRight, baseTop) },
    { point: point2d(baseLeft, baseTop) },
    { point: point2d(baseLeft, baseBottom) }
  ], { closed: true, layerName: "COMPONENTS" });

  const anchorSpacing = baseWidth / 4;
  for (let i = -1; i <= 1; i += 2) {
    const holeX = x + i * anchorSpacing * 0.8;
    dxf.addCircle(point3d(holeX, baseBottom + (baseTop - baseBottom) * 0.4, 0), 6 * scale, { layerName: "COMPONENTS" });
    dxf.addCircle(point3d(holeX, baseBottom + (baseTop - baseBottom) * 0.4, 0), 10 * scale, { layerName: "COMPONENTS" });
  }

  // Suction nozzle with flange
  const nozzleLength = 80 * scale;
  const nozzleHeight = 40 * scale;
  const suctionY = y - casingHeight * 0.18;
  dxf.addLWPolyline([
    { point: point2d(casingLeft - nozzleLength, suctionY - nozzleHeight / 2) },
    { point: point2d(casingLeft - wall, suctionY - nozzleHeight / 2) },
    { point: point2d(casingLeft - wall, suctionY + nozzleHeight / 2) },
    { point: point2d(casingLeft - nozzleLength, suctionY + nozzleHeight / 2) },
    { point: point2d(casingLeft - nozzleLength, suctionY - nozzleHeight / 2) }
  ], { closed: true, layerName: "PIPING" });

  dxf.addCircle(point3d(casingLeft - nozzleLength - 12 * scale, suctionY, 0), nozzleHeight / 2, { layerName: "PIPING" });

  // Discharge nozzle with flange
  const dischargeY = y + casingHeight * 0.2;
  dxf.addLWPolyline([
    { point: point2d(casingRight - wall, dischargeY - nozzleHeight / 2) },
    { point: point2d(casingRight + nozzleLength, dischargeY - nozzleHeight / 2) },
    { point: point2d(casingRight + nozzleLength, dischargeY + nozzleHeight / 2) },
    { point: point2d(casingRight - wall, dischargeY + nozzleHeight / 2) },
    { point: point2d(casingRight - wall, dischargeY - nozzleHeight / 2) }
  ], { closed: true, layerName: "PIPING" });
  dxf.addCircle(point3d(casingRight + nozzleLength + 12 * scale, dischargeY, 0), nozzleHeight / 2, { layerName: "PIPING" });

  // Auto-generated callouts
  const callouts = [
    {
      label: "Impeller",
      text: parameters?.impeller ?? "Closed impeller with wear ring",
      target: { x, y },
      textPosition: { x: x - casingWidth, y: casingTop + 90 * scale }
    },
    {
      label: "Mechanical Seal",
      text: parameters?.mechanicalSeal ?? "Mechanical seal cartridge",
      target: { x, y: (sealTop + sealBottom) / 2 },
      textPosition: { x: x + casingWidth * 0.85, y: sealTop + 80 * scale }
    },
    {
      label: "Bearings",
      text: parameters?.bearings ?? "Angular contact (DE) / deep groove (NDE)",
      target: { x, y: (bearing1Top + bearing2Bottom) / 2 },
      textPosition: { x: x + casingWidth * 0.9, y: bearing2Top + 60 * scale }
    },
    {
      label: "Shaft",
      text: parameters?.shaft ?? "AISI 4140 shaft with stepped journals",
      target: { x, y: casingTop - wall * 1.2 },
      textPosition: { x: x - casingWidth * 1.05, y: casingTop + 130 * scale }
    },
    {
      label: "Spacer Coupling",
      text: parameters?.coupling ?? "Spacer coupling with guard",
      target: { x, y: (couplingTop + couplingBottom) / 2 },
      textPosition: { x: x + casingWidth * 0.9, y: couplingBottom + 40 * scale }
    },
    {
      label: "Baseplate",
      text: parameters?.baseplate ?? "Fabricated base with grout pockets",
      target: { x, y: baseBottom + (baseTop - baseBottom) / 2 },
      textPosition: { x: x + casingWidth * 0.8, y: baseBottom - 70 * scale }
    },
    {
      label: "Suction Nozzle",
      text: parameters?.suction ?? "DN200 suction, ANSI B16.5 RF",
      target: { x: casingLeft - wall, y: suctionY },
      textPosition: { x: casingLeft - casingWidth * 0.95, y: suctionY - 60 * scale }
    },
    {
      label: "Discharge Nozzle",
      text: parameters?.discharge ?? "DN150 discharge, ANSI B16.5 RF",
      target: { x: casingRight + wall, y: dischargeY },
      textPosition: { x: casingRight + casingWidth * 0.7, y: dischargeY + 60 * scale }
    }
  ];

  const additionalCallouts = Array.isArray(parameters?.additionalCallouts)
    ? parameters.additionalCallouts as Array<{
        label?: string;
        text: string;
        target?: { x: number; y: number };
        textPosition?: { x: number; y: number };
      }>
    : [];

  for (const callout of additionalCallouts) {
    callouts.push({
      label: callout.label ?? "",
      text: callout.text,
      target: callout.target
        ? { x: x + callout.target.x, y: y + callout.target.y }
        : { x, y },
      textPosition: callout.textPosition
        ? { x: x + callout.textPosition.x, y: y + callout.textPosition.y }
        : { x: x + casingWidth * 0.8, y: casingTop + 160 * scale }
    });
  }

  callouts.forEach((detail) => drawLeaderCallout(dxf, detail));
}

function drawCompressorSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const radius = size / 2;
  
  // Outer circle
  dxf.addCircle(point3d(x, y, 0), radius, {
    layerName: "COMPONENTS"
  });
  
  // Inner circle
  dxf.addCircle(point3d(x, y, 0), radius * 0.7, {
    layerName: "COMPONENTS"
  });
  
  // Compression arrows
  dxf.addLine(point3d(x - radius * 0.3, y, 0), point3d(x + radius * 0.3, y, 0), {
    layerName: "COMPONENTS"
  });
  dxf.addLine(point3d(x, y - radius * 0.3, 0), point3d(x, y + radius * 0.3, 0), {
    layerName: "COMPONENTS"
  });
}

function drawHeatExchangerSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const width = size * 1.5;
  const height = size;
  
  // Shell (main body)
  dxf.addLWPolyline([
    { point: point2d(x - width/2, y - height/2) },
    { point: point2d(x + width/2, y - height/2) },
    { point: point2d(x + width/2, y + height/2) },
    { point: point2d(x - width/2, y + height/2) },
    { point: point2d(x - width/2, y - height/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Tube bundle (detailed representation)
  const tubeCount = 8;
  const tubeSpacing = height / (tubeCount + 1);
  for (let i = 1; i <= tubeCount; i++) {
    const tubeY = y - height/2 + (i * tubeSpacing);
    // Tube
    dxf.addLine(point3d(x - width/2 + 15, tubeY, 0), point3d(x + width/2 - 15, tubeY, 0), {
      layerName: "COMPONENTS"
    });
    // Tube sheet connection
    dxf.addCircle(point3d(x - width/2 + 15, tubeY, 0), 2, {
      layerName: "COMPONENTS"
    });
    dxf.addCircle(point3d(x + width/2 - 15, tubeY, 0), 2, {
      layerName: "COMPONENTS"
    });
  }
  
  // Baffles (cross-flow plates)
  for (let i = 1; i <= 3; i++) {
    const baffleX = x - width/2 + (i * width/4);
    dxf.addLine(point3d(baffleX, y - height/2 + 10, 0), point3d(baffleX, y + height/2 - 10, 0), {
      layerName: "COMPONENTS"
    });
  }
  
  // Tube sheets (end plates)
  dxf.addLine(point3d(x - width/2 + 10, y - height/2, 0), point3d(x - width/2 + 10, y + height/2, 0), {
    layerName: "COMPONENTS"
  });
  dxf.addLine(point3d(x + width/2 - 10, y - height/2, 0), point3d(x + width/2 - 10, y + height/2, 0), {
    layerName: "COMPONENTS"
  });
  
  // Primary side connections (shell side)
  dxf.addLine(point3d(x - width/2, y - height/4, 0), point3d(x - width/2 - 30, y - height/4, 0), {
    layerName: "PIPING"
  });
  dxf.addCircle(point3d(x - width/2 - 30, y - height/4, 0), 8, {
    layerName: "PIPING"
  });
  dxf.addLine(point3d(x + width/2, y + height/4, 0), point3d(x + width/2 + 30, y + height/4, 0), {
    layerName: "PIPING"
  });
  dxf.addCircle(point3d(x + width/2 + 30, y + height/4, 0), 8, {
    layerName: "PIPING"
  });
  
  // Secondary side connections (tube side)
  dxf.addLine(point3d(x - width/4, y - height/2, 0), point3d(x - width/4, y - height/2 - 30, 0), {
    layerName: "PIPING"
  });
  dxf.addCircle(point3d(x - width/4, y - height/2 - 30, 0), 8, {
    layerName: "PIPING"
  });
  dxf.addLine(point3d(x + width/4, y + height/2, 0), point3d(x + width/4, y + height/2 + 30, 0), {
    layerName: "PIPING"
  });
  dxf.addCircle(point3d(x + width/4, y + height/2 + 30, 0), 8, {
    layerName: "PIPING"
  });
  
  // Supports
  dxf.addLWPolyline([
    { point: point2d(x - width/2 - 5, y - height/2 - 10) },
    { point: point2d(x - width/2 + 5, y - height/2 - 10) },
    { point: point2d(x - width/2 + 5, y - height/2 - 5) },
    { point: point2d(x - width/2 - 5, y - height/2 - 5) },
    { point: point2d(x - width/2 - 5, y - height/2 - 10) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  dxf.addLWPolyline([
    { point: point2d(x + width/2 - 5, y - height/2 - 10) },
    { point: point2d(x + width/2 + 5, y - height/2 - 10) },
    { point: point2d(x + width/2 + 5, y - height/2 - 5) },
    { point: point2d(x + width/2 - 5, y - height/2 - 5) },
    { point: point2d(x + width/2 - 5, y - height/2 - 10) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
}

function drawValveSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const width = size;
  const height = size * 0.8;
  
  // Valve body (main casing)
  dxf.addLWPolyline([
    { point: point2d(x - width/2, y - height/2) },
    { point: point2d(x + width/2, y - height/2) },
    { point: point2d(x + width/2, y + height/2) },
    { point: point2d(x - width/2, y + height/2) },
    { point: point2d(x - width/2, y - height/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Valve seat (internal)
  dxf.addCircle(point3d(x, y, 0), width * 0.15, {
    layerName: "COMPONENTS"
  });
  
  // Disc/plug (valve closure element)
  dxf.addLWPolyline([
    { point: point2d(x - width * 0.1, y - height * 0.1) },
    { point: point2d(x + width * 0.1, y - height * 0.1) },
    { point: point2d(x + width * 0.1, y + height * 0.1) },
    { point: point2d(x - width * 0.1, y + height * 0.1) },
    { point: point2d(x - width * 0.1, y - height * 0.1) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Stem (valve stem)
  dxf.addLine(point3d(x, y + height/2, 0), point3d(x, y + height/2 + 20, 0), {
    layerName: "COMPONENTS"
  });
  
  // Bonnet (valve bonnet)
  dxf.addLWPolyline([
    { point: point2d(x - width/3, y + height/2) },
    { point: point2d(x + width/3, y + height/2) },
    { point: point2d(x + width/3, y + height/2 + 15) },
    { point: point2d(x - width/3, y + height/2 + 15) },
    { point: point2d(x - width/3, y + height/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Packing gland
  dxf.addCircle(point3d(x, y + height/2 + 15, 0), 6, {
    layerName: "COMPONENTS"
  });
  
  // Actuator (pneumatic cylinder)
  dxf.addLWPolyline([
    { point: point2d(x - 8, y + height/2 + 20) },
    { point: point2d(x + 8, y + height/2 + 20) },
    { point: point2d(x + 8, y + height/2 + 40) },
    { point: point2d(x - 8, y + height/2 + 40) },
    { point: point2d(x - 8, y + height/2 + 20) }
  ], {
    closed: true,
    layerName: "CONTROL"
  });
  
  // Inlet connection
  dxf.addLine(point3d(x - width/2, y, 0), point3d(x - width/2 - 25, y, 0), {
    layerName: "PIPING"
  });
  dxf.addCircle(point3d(x - width/2 - 25, y, 0), 6, {
    layerName: "PIPING"
  });
  
  // Outlet connection
  dxf.addLine(point3d(x + width/2, y, 0), point3d(x + width/2 + 25, y, 0), {
    layerName: "PIPING"
  });
  dxf.addCircle(point3d(x + width/2 + 25, y, 0), 6, {
    layerName: "PIPING"
  });
  
  // Flange bolts
  for (let i = -1; i <= 1; i += 2) {
    dxf.addCircle(point3d(x + i * width/3, y - height/2 - 5, 0), 2, {
      layerName: "COMPONENTS"
    });
    dxf.addCircle(point3d(x + i * width/3, y + height/2 + 5, 0), 2, {
      layerName: "COMPONENTS"
    });
  }
}

function drawTankSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const width = size * 0.8;
  const height = size * 1.2;
  
  // Tank shell (main body)
  dxf.addLWPolyline([
    { point: point2d(x - width/2, y - height/2) },
    { point: point2d(x + width/2, y - height/2) },
    { point: point2d(x + width/2, y + height/2) },
    { point: point2d(x - width/2, y + height/2) },
    { point: point2d(x - width/2, y - height/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Tank heads (elliptical ends)
  dxf.addLine(point3d(x - width/2, y - height/2, 0), point3d(x - width/2 - 5, y - height/2 - 3, 0), {
    layerName: "COMPONENTS"
  });
  dxf.addLine(point3d(x - width/2 - 5, y - height/2 - 3, 0), point3d(x + width/2 + 5, y - height/2 - 3, 0), {
    layerName: "COMPONENTS"
  });
  dxf.addLine(point3d(x + width/2 + 5, y - height/2 - 3, 0), point3d(x + width/2, y - height/2, 0), {
    layerName: "COMPONENTS"
  });
  
  dxf.addLine(point3d(x - width/2, y + height/2, 0), point3d(x - width/2 - 5, y + height/2 + 3, 0), {
    layerName: "COMPONENTS"
  });
  dxf.addLine(point3d(x - width/2 - 5, y + height/2 + 3, 0), point3d(x + width/2 + 5, y + height/2 + 3, 0), {
    layerName: "COMPONENTS"
  });
  dxf.addLine(point3d(x + width/2 + 5, y + height/2 + 3, 0), point3d(x + width/2, y + height/2, 0), {
    layerName: "COMPONENTS"
  });
  
  // Manway (access opening)
  dxf.addCircle(point3d(x + width/2 + 10, y, 0), 15, {
    layerName: "COMPONENTS"
  });
  dxf.addCircle(point3d(x + width/2 + 10, y, 0), 12, {
    layerName: "COMPONENTS"
  });
  
  // Nozzles with flanges
  // Inlet nozzle (top)
  dxf.addLine(point3d(x - width/3, y - height/2 - 3, 0), point3d(x - width/3, y - height/2 - 25, 0), {
    layerName: "PIPING"
  });
  dxf.addCircle(point3d(x - width/3, y - height/2 - 25, 0), 8, {
    layerName: "PIPING"
  });
  
  // Outlet nozzle (bottom)
  dxf.addLine(point3d(x - width/3, y + height/2 + 3, 0), point3d(x - width/3, y + height/2 + 25, 0), {
    layerName: "PIPING"
  });
  dxf.addCircle(point3d(x - width/3, y + height/2 + 25, 0), 8, {
    layerName: "PIPING"
  });
  
  // Vent nozzle (top)
  dxf.addLine(point3d(x + width/3, y - height/2 - 3, 0), point3d(x + width/3, y - height/2 - 20, 0), {
    layerName: "PIPING"
  });
  dxf.addCircle(point3d(x + width/3, y - height/2 - 20, 0), 6, {
    layerName: "PIPING"
  });
  
  // Drain nozzle (bottom)
  dxf.addLine(point3d(x + width/3, y + height/2 + 3, 0), point3d(x + width/3, y + height/2 + 20, 0), {
    layerName: "PIPING"
  });
  dxf.addCircle(point3d(x + width/3, y + height/2 + 20, 0), 6, {
    layerName: "PIPING"
  });
  
  // Level indicator
  dxf.addLine(point3d(x + width/2 + 25, y - height/2, 0), point3d(x + width/2 + 25, y + height/2, 0), {
    layerName: "CONTROL"
  });
  dxf.addCircle(point3d(x + width/2 + 25, y, 0), 8, {
    layerName: "CONTROL"
  });
  
  // Pressure gauge
  dxf.addLine(point3d(x - width/2 - 15, y + height/3, 0), point3d(x - width/2 - 30, y + height/3, 0), {
    layerName: "CONTROL"
  });
  dxf.addCircle(point3d(x - width/2 - 30, y + height/3, 0), 10, {
    layerName: "CONTROL"
  });
  
  // Tank supports
  dxf.addLWPolyline([
    { point: point2d(x - width/2 - 8, y + height/2 + 3) },
    { point: point2d(x - width/2 + 8, y + height/2 + 3) },
    { point: point2d(x - width/2 + 8, y + height/2 + 15) },
    { point: point2d(x - width/2 - 8, y + height/2 + 15) },
    { point: point2d(x - width/2 - 8, y + height/2 + 3) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  dxf.addLWPolyline([
    { point: point2d(x + width/2 - 8, y + height/2 + 3) },
    { point: point2d(x + width/2 + 8, y + height/2 + 3) },
    { point: point2d(x + width/2 + 8, y + height/2 + 15) },
    { point: point2d(x + width/2 - 8, y + height/2 + 15) },
    { point: point2d(x + width/2 - 8, y + height/2 + 3) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Agitator (if specified)
  dxf.addLine(point3d(x, y - height/2 - 3, 0), point3d(x, y + height/4, 0), {
    layerName: "COMPONENTS"
  });
  // Agitator blades
  for (let i = 0; i < 3; i++) {
    const angle = (i * 120) * Math.PI / 180;
    const x1 = x + Math.cos(angle) * 15;
    const y1 = y + height/4 + Math.sin(angle) * 15;
    dxf.addLine(point3d(x, y + height/4, 0), point3d(x1, y1, 0), {
      layerName: "COMPONENTS"
    });
  }
}

function drawPressureVesselSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const width = size * 0.9;
  const height = size * 1.5;
  
  // Main body (capsule shape)
  dxf.addLWPolyline([
    { point: point2d(x - width/2, y - height/2) },
    { point: point2d(x + width/2, y - height/2) },
    { point: point2d(x + width/2, y + height/2) },
    { point: point2d(x - width/2, y + height/2) },
    { point: point2d(x - width/2, y - height/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Inlet/Outlet
  dxf.addLine(point3d(x - width/2, y, 0), point3d(x - width/2 - 15, y, 0), {
    layerName: "PIPING"
  });
  dxf.addLine(point3d(x + width/2, y, 0), point3d(x + width/2 + 15, y, 0), {
    layerName: "PIPING"
  });
}

function drawTurbineSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const width = size * 1.5;
  const height = size;
  
  // Main body (rectangle)
  dxf.addLWPolyline([
    { point: point2d(x - width/2, y - height/2) },
    { point: point2d(x + width/2, y - height/2) },
    { point: point2d(x + width/2, y + height/2) },
    { point: point2d(x - width/2, y + height/2) },
    { point: point2d(x - width/2, y - height/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Blades (simplified lines)
  dxf.addLine(point3d(x - width/2 + 5, y, 0), point3d(x + width/2 - 5, y, 0), {
    layerName: "COMPONENTS"
  });
  dxf.addLine(point3d(x - width/4, y - height/2 + 5, 0), point3d(x + width/4, y + height/2 - 5, 0), {
    layerName: "COMPONENTS"
  });
  dxf.addLine(point3d(x - width/4, y + height/2 - 5, 0), point3d(x + width/4, y - height/2 + 5, 0), {
    layerName: "COMPONENTS"
  });
}

function drawMotorSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const width = size * 0.8;
  const height = size * 0.6;
  
  // Main body (rectangle)
  dxf.addLWPolyline([
    { point: point2d(x - width/2, y - height/2) },
    { point: point2d(x + width/2, y - height/2) },
    { point: point2d(x + width/2, y + height/2) },
    { point: point2d(x - width/2, y + height/2) },
    { point: point2d(x - width/2, y - height/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Electrical connection
  dxf.addLine(point3d(x, y + height/2, 0), point3d(x, y + height/2 + 15, 0), {
    layerName: "ELECTRICAL"
  });
  
  // Shaft output
  dxf.addLine(point3d(x + width/2, y, 0), point3d(x + width/2 + 15, y, 0), {
    layerName: "COMPONENTS"
  });
}

function drawGeneratorSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const width = size * 0.9;
  const height = size * 0.7;

  // Stator housing
  dxf.addLWPolyline([
    { point: point2d(x - width / 2, y - height / 2) },
    { point: point2d(x + width / 2, y - height / 2) },
    { point: point2d(x + width / 2, y + height / 2) },
    { point: point2d(x - width / 2, y + height / 2) },
    { point: point2d(x - width / 2, y - height / 2) }
  ], { closed: true, layerName: "COMPONENTS" });

  // Rotor and stator laminations
  dxf.addCircle(point3d(x, y, 0), height * 0.25, { layerName: "COMPONENTS" });
  dxf.addCircle(point3d(x, y, 0), height * 0.32, { layerName: "COMPONENTS" });

  for (let i = 0; i < 6; i++) {
    const angle = (i * 60) * Math.PI / 180;
    const inner = point3d(x + Math.cos(angle) * height * 0.32, y + Math.sin(angle) * height * 0.32, 0);
    const outer = point3d(x + Math.cos(angle) * height * 0.45, y + Math.sin(angle) * height * 0.45, 0);
    dxf.addLine(inner, outer, { layerName: "COMPONENTS" });
  }

  // Terminal box
  dxf.addLWPolyline([
    { point: point2d(x + width / 2, y + height * 0.1) },
    { point: point2d(x + width / 2 + height * 0.25, y + height * 0.1) },
    { point: point2d(x + width / 2 + height * 0.25, y - height * 0.1) },
    { point: point2d(x + width / 2, y - height * 0.1) },
    { point: point2d(x + width / 2, y + height * 0.1) }
  ], { closed: true, layerName: "ELECTRICAL" });

  // Base frame
  dxf.addLWPolyline([
    { point: point2d(x - width / 2 - 10, y - height / 2 - 15) },
    { point: point2d(x + width / 2 + 10, y - height / 2 - 15) },
    { point: point2d(x + width / 2 + 10, y - height / 2 - 5) },
    { point: point2d(x - width / 2 - 10, y - height / 2 - 5) },
    { point: point2d(x - width / 2 - 10, y - height / 2 - 15) }
  ], { closed: true, layerName: "COMPONENTS" });
}

function drawSeparatorSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const width = size * 1.2;
  const height = size * 0.8;

  // Vessel outline
  dxf.addLWPolyline([
    { point: point2d(x - width / 2, y - height / 2) },
    { point: point2d(x + width / 2, y - height / 2) },
    { point: point2d(x + width / 2, y + height / 2) },
    { point: point2d(x - width / 2, y + height / 2) },
    { point: point2d(x - width / 2, y - height / 2) }
  ], { closed: true, layerName: "COMPONENTS" });

  // Mist eliminator pad
  const padTop = y + height * 0.25;
  dxf.addLWPolyline([
    { point: point2d(x - width / 2, padTop) },
    { point: point2d(x + width / 2, padTop) },
    { point: point2d(x + width / 2, padTop - height * 0.1) },
    { point: point2d(x - width / 2, padTop - height * 0.1) },
    { point: point2d(x - width / 2, padTop) }
  ], { closed: true, layerName: "COMPONENTS" });

  for (let i = 0; i <= 6; i++) {
    const hx = x - width / 2 + (width / 6) * i;
    dxf.addLine(point3d(hx, padTop, 0), point3d(hx + 20, padTop - height * 0.1, 0), { layerName: "COMPONENTS" });
  }

  // Weir plate
  const weirX = x + width * 0.15;
  dxf.addLine(point3d(weirX, y - height / 2, 0), point3d(weirX, y + height / 2, 0), { layerName: "COMPONENTS" });

  // Liquid outlet nozzle
  dxf.addLine(point3d(x - width / 2, y - height * 0.2, 0), point3d(x - width / 2 - 40, y - height * 0.2, 0), { layerName: "PIPING" });

  // Gas outlet nozzle
  dxf.addLine(point3d(x + width / 2, y + height * 0.3, 0), point3d(x + width / 2 + 40, y + height * 0.3, 0), { layerName: "PIPING" });

  // Level gauge
  dxf.addLine(point3d(x + width / 2 + 25, y - height / 2, 0), point3d(x + width / 2 + 25, y + height / 2, 0), { layerName: "CONTROL" });
}

function drawReactorSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const width = size * 0.9;
  const height = size * 1.4;

  // Reactor vessel
  dxf.addLWPolyline([
    { point: point2d(x - width / 2, y - height / 2) },
    { point: point2d(x + width / 2, y - height / 2) },
    { point: point2d(x + width / 2, y + height / 2) },
    { point: point2d(x - width / 2, y + height / 2) },
    { point: point2d(x - width / 2, y - height / 2) }
  ], { closed: true, layerName: "COMPONENTS" });

  // Internal coil
  for (let i = 0; i < 5; i++) {
    const coilY = y - height / 2 + (i + 1) * (height / 6);
    const coilWidth = width * 0.36;
    const coilHeight = height * 0.04;
    dxf.addLWPolyline([
      { point: point2d(x - coilWidth, coilY - coilHeight / 2) },
      { point: point2d(x + coilWidth, coilY - coilHeight / 2) },
      { point: point2d(x + coilWidth, coilY + coilHeight / 2) },
      { point: point2d(x - coilWidth, coilY + coilHeight / 2) },
      { point: point2d(x - coilWidth, coilY - coilHeight / 2) }
    ], { closed: true, layerName: "COMPONENTS" });
    dxf.addLine(point3d(x - coilWidth, coilY, 0), point3d(x + coilWidth, coilY, 0), { layerName: "COMPONENTS" });
  }

  // Sparger ring
  dxf.addCircle(point3d(x, y - height * 0.3, 0), width * 0.3, { layerName: "COMPONENTS" });

  // Nozzles
  dxf.addLine(point3d(x - width / 2, y + height * 0.1, 0), point3d(x - width / 2 - 35, y + height * 0.1, 0), { layerName: "PIPING" });
  dxf.addLine(point3d(x + width / 2, y - height * 0.1, 0), point3d(x + width / 2 + 35, y - height * 0.1, 0), { layerName: "PIPING" });
}

function drawInstrumentationSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const radius = size / 2;

  dxf.addCircle(point3d(x, y, 0), radius, { layerName: "CONTROL" });
  dxf.addLine(point3d(x - radius * 0.7, y, 0), point3d(x + radius * 0.7, y, 0), { layerName: "CONTROL" });
  dxf.addLine(point3d(x, y - radius * 0.7, 0), point3d(x, y + radius * 0.7, 0), { layerName: "CONTROL" });
}

function drawFilterSymbol(dxf: DxfWriter, component: MechanicalComponent) {
  const { x, y } = component.position;
  const size = Math.min(component.size.width, component.size.height);
  const width = size * 0.6;
  const height = size * 1.2;
  
  // Main body (rectangle)
  dxf.addLWPolyline([
    { point: point2d(x - width/2, y - height/2) },
    { point: point2d(x + width/2, y - height/2) },
    { point: point2d(x + width/2, y + height/2) },
    { point: point2d(x - width/2, y + height/2) },
    { point: point2d(x - width/2, y - height/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Filter media lines
  for (let i = 0; i < 3; i++) {
    const offset = (i - 1) * (height / 4);
    dxf.addLine(point3d(x - width/2, y + offset, 0), point3d(x + width/2, y + offset, 0), {
      layerName: "COMPONENTS"
    });
  }
  
  // Inlet/Outlet
  dxf.addLine(point3d(x - width/2, y, 0), point3d(x - width/2 - 15, y, 0), {
    layerName: "PIPING"
  });
  dxf.addLine(point3d(x + width/2, y, 0), point3d(x + width/2 + 15, y, 0), {
    layerName: "PIPING"
  });
}

interface CalloutDetail {
  label?: string;
  text: string;
  target: { x: number; y: number };
  textPosition: { x: number; y: number };
}

function drawLeaderCallout(dxf: DxfWriter, detail: CalloutDetail) {
  const { target, textPosition, label, text } = detail;
  const leaderMid = {
    x: (target.x + textPosition.x) / 2,
    y: (target.y + textPosition.y) / 2
  };

  dxf.addLine(point3d(target.x, target.y, 0), point3d(leaderMid.x, leaderMid.y, 0), {
    layerName: "ANNOTATIONS"
  });
  dxf.addLine(point3d(leaderMid.x, leaderMid.y, 0), point3d(textPosition.x, textPosition.y, 0), {
    layerName: "ANNOTATIONS"
  });

  const angle = Math.atan2(leaderMid.y - target.y, leaderMid.x - target.x);
  const arrow = 6;
  const left = {
    x: target.x + Math.cos(angle + Math.PI / 6) * arrow,
    y: target.y + Math.sin(angle + Math.PI / 6) * arrow
  };
  const right = {
    x: target.x + Math.cos(angle - Math.PI / 6) * arrow,
    y: target.y + Math.sin(angle - Math.PI / 6) * arrow
  };

  dxf.addLWPolyline([
    { point: point2d(target.x, target.y) },
    { point: point2d(left.x, left.y) },
    { point: point2d(right.x, right.y) },
    { point: point2d(target.x, target.y) }
  ], {
    closed: true,
    layerName: "ANNOTATIONS"
  });

  const annotationText = label && label.trim().length > 0 ? `${label}: ${text}` : text;
  dxf.addText(point3d(textPosition.x + 4, textPosition.y + 4, 0), 5.5, annotationText, {
    layerName: "TEXT"
  });
}

export function generateFilename(systemType: string): string {
  const baseName = systemType.replace(/_/g, '-');
  return `${baseName}-layout.dxf`;
}
