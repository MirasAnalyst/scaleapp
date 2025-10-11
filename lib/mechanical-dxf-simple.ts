import { DxfWriter, Units, LWPolylineFlags, point2d, point3d } from "@tarikjabiri/dxf";

/**
 * Simple mechanical DXF generator for testing
 */
export function generateSimpleMechanicalDXF(): string {
  const dxf = new DxfWriter();
  
  // Set units
  dxf.setUnits(Units.Millimeters);
  
  // Set drawing limits (same approach as civil DXF)
  const margin = 50;
  const minX = -margin;
  const minY = -margin;
  const maxX = 500 + margin;
  const maxY = 400 + margin;
  
  dxf.setVariable("$EXTMIN", { 10: minX, 20: minY, 30: 0 });
  dxf.setVariable("$EXTMAX", { 10: maxX, 20: maxY, 30: 100 });
  
  // Add layers
  dxf.addLayer("COMPONENTS", 1, "CONTINUOUS");
  dxf.addLayer("TEXT", 2, "CONTINUOUS");
  dxf.addLayer("BORDER", 3, "CONTINUOUS");
  
  // Draw border
  dxf.addLWPolyline([
    { point: point2d(0, 0) },
    { point: point2d(500, 0) },
    { point: point2d(500, 400) },
    { point: point2d(0, 400) },
    { point: point2d(0, 0) }
  ], {
    flags: LWPolylineFlags.Closed,
    layerName: "BORDER"
  });
  
  // Draw a simple pump symbol
  const pumpX = 100;
  const pumpY = 100;
  const pumpSize = 50;
  
  // Pump casing
  dxf.addLWPolyline([
    { point: point2d(pumpX - pumpSize/2, pumpY - pumpSize/2) },
    { point: point2d(pumpX + pumpSize/2, pumpY - pumpSize/2) },
    { point: point2d(pumpX + pumpSize/2, pumpY + pumpSize/2) },
    { point: point2d(pumpX - pumpSize/2, pumpY + pumpSize/2) },
    { point: point2d(pumpX - pumpSize/2, pumpY - pumpSize/2) }
  ], {
    flags: LWPolylineFlags.Closed,
    layerName: "COMPONENTS"
  });
  
  // Pump impeller
  dxf.addCircle(point3d(pumpX, pumpY, 0), pumpSize/4, {
    layerName: "COMPONENTS"
  });
  
  // Pump label
  dxf.addText(point3d(pumpX - 20, pumpY + pumpSize/2 + 10, 0), 8, "PUMP", {
    layerName: "TEXT"
  });
  
  // Draw a simple tank
  const tankX = 300;
  const tankY = 200;
  const tankWidth = 80;
  const tankHeight = 120;
  
  // Tank shell
  dxf.addLWPolyline([
    { point: point2d(tankX - tankWidth/2, tankY - tankHeight/2) },
    { point: point2d(tankX + tankWidth/2, tankY - tankHeight/2) },
    { point: point2d(tankX + tankWidth/2, tankY + tankHeight/2) },
    { point: point2d(tankX - tankWidth/2, tankY + tankHeight/2) },
    { point: point2d(tankX - tankWidth/2, tankY - tankHeight/2) }
  ], {
    flags: LWPolylineFlags.Closed,
    layerName: "COMPONENTS"
  });
  
  // Tank label
  dxf.addText(point3d(tankX - 20, tankY + tankHeight/2 + 10, 0), 8, "TANK", {
    layerName: "TEXT"
  });
  
  // Draw connection between pump and tank
  dxf.addLine(point3d(pumpX + pumpSize/2, pumpY, 0), point3d(tankX - tankWidth/2, tankY, 0), {
    layerName: "COMPONENTS"
  });
  
  // Add title
  dxf.addText(point3d(10, 380, 0), 12, "SIMPLE MECHANICAL SYSTEM", {
    layerName: "TEXT"
  });
  
  return dxf.stringify();
}
