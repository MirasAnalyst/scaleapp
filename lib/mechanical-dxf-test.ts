import { DxfWriter, Units, point2d, point3d } from "@tarikjabiri/dxf";

/**
 * Test mechanical DXF generator using the same approach as civil DXF
 */
export function generateTestMechanicalDXF(): string {
  const dxf = new DxfWriter();
  
  // Set units (same as civil DXF)
  dxf.setUnits(Units.Millimeters);
  
  // Set variables using the same approach as civil DXF
  const halfWidth = 100;
  const halfDepth = 75;
  const totalHeight = 50;
  
  dxf.setVariable("$EXTMIN", { 10: -halfWidth - 5, 20: -halfDepth - 10, 30: 0 });
  dxf.setVariable("$EXTMAX", { 10: halfWidth + 5, 20: halfDepth + 5, 30: totalHeight + 5 });
  
  // Add line types (same as civil DXF)
  dxf.addLType("DASHED", "Dashed __ __ __", [0.5, -0.25, 0.5, -0.25]);
  dxf.addLType("CENTER2", "Center ____ _ ____", [1.2, -0.2, 0.2, -0.2]);
  
  // Add layers
  dxf.addLayer("COMPONENTS", 1, "CONTINUOUS");
  dxf.addLayer("TEXT", 2, "CONTINUOUS");
  
  // Draw a simple pump at position (50, 50)
  const pumpX = 50;
  const pumpY = 50;
  const pumpSize = 30;
  
  // Pump casing
  dxf.addLWPolyline([
    { point: point2d(pumpX - pumpSize/2, pumpY - pumpSize/2) },
    { point: point2d(pumpX + pumpSize/2, pumpY - pumpSize/2) },
    { point: point2d(pumpX + pumpSize/2, pumpY + pumpSize/2) },
    { point: point2d(pumpX - pumpSize/2, pumpY + pumpSize/2) },
    { point: point2d(pumpX - pumpSize/2, pumpY - pumpSize/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Pump impeller
  dxf.addCircle(point3d(pumpX, pumpY, 0), pumpSize/4, {
    layerName: "COMPONENTS"
  });
  
  // Pump label
  dxf.addText(point3d(pumpX - 15, pumpY + pumpSize/2 + 5, 0), 6, "PUMP", {
    layerName: "TEXT"
  });
  
  // Draw a tank at position (150, 100)
  const tankX = 150;
  const tankY = 100;
  const tankWidth = 60;
  const tankHeight = 80;
  
  // Tank shell
  dxf.addLWPolyline([
    { point: point2d(tankX - tankWidth/2, tankY - tankHeight/2) },
    { point: point2d(tankX + tankWidth/2, tankY - tankHeight/2) },
    { point: point2d(tankX + tankWidth/2, tankY + tankHeight/2) },
    { point: point2d(tankX - tankWidth/2, tankY + tankHeight/2) },
    { point: point2d(tankX - tankWidth/2, tankY - tankHeight/2) }
  ], {
    closed: true,
    layerName: "COMPONENTS"
  });
  
  // Tank label
  dxf.addText(point3d(tankX - 15, tankY + tankHeight/2 + 5, 0), 6, "TANK", {
    layerName: "TEXT"
  });
  
  // Draw connection
  dxf.addLine(point3d(pumpX + pumpSize/2, pumpY, 0), point3d(tankX - tankWidth/2, tankY, 0), {
    layerName: "COMPONENTS"
  });
  
  // Add title
  dxf.addText(point3d(10, 130, 0), 10, "TEST MECHANICAL SYSTEM", {
    layerName: "TEXT"
  });
  
  return dxf.stringify();
}
