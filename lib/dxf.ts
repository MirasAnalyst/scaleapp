import { DxfWriter, LWPolylineFlags, LineTypes, Colors, Units, point2d, point3d } from "@tarikjabiri/dxf";
import { BuildingSpecType } from "./spec";

// Professional DXF generator that creates AutoCAD-compatible files
export function generatePlanDXF(spec: BuildingSpecType): string {
  const { tower, cores, grid } = spec.project;

  // Calculate dimensions
  const footprintWidth = tower.footprintDims.x;
  const footprintDepth = tower.footprintDims.y;
  const coreWidth = cores.coreWidth;
  const coreDepth = cores.coreDepth;

  // Calculate positions (centered at origin)
  const halfWidth = footprintWidth / 2;
  const halfDepth = footprintDepth / 2;
  const halfCoreWidth = coreWidth / 2;
  const halfCoreDepth = coreDepth / 2;
  const totalHeight = tower.floors * tower.typicalFloorHeight;

  const siteHalfWidth = spec.project.site.width / 2;
  const siteHalfDepth = spec.project.site.depth / 2;
  const { front: setbackFront, rear: setbackRear, side: setbackSide } = spec.project.site.setbacks;

  const toAlpha = (index: number) => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    let i = index;
    while (i >= 0) {
      result = letters[i % 26] + result;
      i = Math.floor(i / 26) - 1;
    }
    return result;
  };

  const formatValue = (value: number) => {
    const rounded = Math.round(value * 1000) / 1000;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(3);
  };

  const unitSymbol = spec.project.units === "meters" ? "m" : "ft";
  const defaultTextHeight = spec.project.units === "meters" ? 1.5 : 5;

  const dxf = new DxfWriter();

  dxf.setUnits(spec.project.units === "meters" ? Units.Meters : Units.Feet);
  dxf.setVariable("$EXTMIN", { 10: -halfWidth - 5, 20: -halfDepth - 10, 30: 0 });
  dxf.setVariable("$EXTMAX", { 10: halfWidth + 5, 20: halfDepth + 5, 30: totalHeight + 5 });
  dxf.addLType("DASHED", "Dashed __ __ __", [0.5, -0.25, 0.5, -0.25]);
  dxf.addLType("CENTER2", "Center ____ _ ____", [1.2, -0.2, 0.2, -0.2]);

  const ensureLayer = (name: string, color: Colors, lineType: string) => {
    if (!dxf.layer(name)) {
      dxf.addLayer(name, color, lineType);
    }
  };

  ensureLayer("A-SITE-BOUNDARY", Colors.Yellow, LineTypes.Continuous);
  ensureLayer("A-SETBACK", Colors.Blue, "DASHED");
  ensureLayer("A-WALL-FULL", Colors.White, LineTypes.Continuous);
  ensureLayer("A-CORE", Colors.Red, LineTypes.Continuous);
  ensureLayer("A-GRID", Colors.Green, "CENTER2");
  ensureLayer("A-COLUMN", Colors.Magenta, LineTypes.Continuous);
  ensureLayer("A-ANNO-TEXT", Colors.Cyan, LineTypes.Continuous);
  ensureLayer("A-DIMS", Colors.White, LineTypes.Continuous);
  ensureLayer("A-FEAT-ELEV", Colors.Red, LineTypes.Continuous);
  ensureLayer("A-FEAT-STAIR", Colors.Green, LineTypes.Continuous);
  ensureLayer("A-BLDG-3D", Colors.Yellow, LineTypes.Continuous);
  ensureLayer("A-CORE-3D", Colors.Magenta, LineTypes.Continuous);

  const polylineOptions = (layerName: string) => ({
    layerName,
    flags: LWPolylineFlags.Closed,
  });

  // Site boundary
  dxf.addLWPolyline(
    [
      { point: point2d(-siteHalfWidth, -siteHalfDepth) },
      { point: point2d(siteHalfWidth, -siteHalfDepth) },
      { point: point2d(siteHalfWidth, siteHalfDepth) },
      { point: point2d(-siteHalfWidth, siteHalfDepth) },
    ],
    polylineOptions("A-SITE-BOUNDARY")
  );

  // Buildable area (setbacks)
  const buildableMinX = -siteHalfWidth + setbackSide;
  const buildableMaxX = siteHalfWidth - setbackSide;
  const buildableMinY = -siteHalfDepth + setbackRear;
  const buildableMaxY = siteHalfDepth - setbackFront;

  if (buildableMaxX > buildableMinX && buildableMaxY > buildableMinY) {
    dxf.addLWPolyline(
      [
        { point: point2d(buildableMinX, buildableMinY) },
        { point: point2d(buildableMaxX, buildableMinY) },
        { point: point2d(buildableMaxX, buildableMaxY) },
        { point: point2d(buildableMinX, buildableMaxY) },
      ],
      polylineOptions("A-SETBACK")
    );
  }

  // Footprint outline
  dxf.addLWPolyline(
    [
      { point: point2d(-halfWidth, -halfDepth) },
      { point: point2d(halfWidth, -halfDepth) },
      { point: point2d(halfWidth, halfDepth) },
      { point: point2d(-halfWidth, halfDepth) },
    ],
    polylineOptions("A-WALL-FULL")
  );

  // Core outline
  dxf.addLWPolyline(
    [
      { point: point2d(-halfCoreWidth, -halfCoreDepth) },
      { point: point2d(halfCoreWidth, -halfCoreDepth) },
      { point: point2d(halfCoreWidth, halfCoreDepth) },
      { point: point2d(-halfCoreWidth, halfCoreDepth) },
    ],
    polylineOptions("A-CORE")
  );

  // Grid lines
  const gridSpacingX = grid.bayX;
  const gridSpacingY = grid.bayY;
  const gridXs: number[] = [];
  const gridYs: number[] = [];

  for (let x = -halfWidth; x <= halfWidth + 1e-6; x += gridSpacingX) {
    gridXs.push(Number((Math.abs(x) < 1e-6 ? 0 : x).toFixed(6)));
    dxf.addLine(point3d(x, -halfDepth, 0), point3d(x, halfDepth, 0), { layerName: "A-GRID" });
  }

  for (let y = -halfDepth; y <= halfDepth + 1e-6; y += gridSpacingY) {
    gridYs.push(Number((Math.abs(y) < 1e-6 ? 0 : y).toFixed(6)));
    dxf.addLine(point3d(-halfWidth, y, 0), point3d(halfWidth, y, 0), { layerName: "A-GRID" });
  }

  // Annotation text
  const textX = -halfWidth + Math.min(3, footprintWidth / 6);
  const textY = -halfDepth - Math.max(3, footprintDepth / 6);

  dxf.addText(point3d(textX, textY, 0), defaultTextHeight, `Plan - ${spec.project.name}`, { layerName: "A-ANNO-TEXT" });
  dxf.addText(
    point3d(textX, textY - defaultTextHeight * 1.5, 0),
    defaultTextHeight * 0.8,
    `Floors: ${tower.floors}`,
    { layerName: "A-ANNO-TEXT" }
  );
  dxf.addText(
    point3d(textX, textY - defaultTextHeight * 2.7, 0),
    defaultTextHeight * 0.8,
    `Floor Height: ${tower.typicalFloorHeight}${unitSymbol}`,
    { layerName: "A-ANNO-TEXT" }
  );
  dxf.addText(
    point3d(textX, textY - defaultTextHeight * 3.9, 0),
    defaultTextHeight * 0.8,
    `Grid: ${grid.bayX}x${grid.bayY}${unitSymbol}`,
    { layerName: "A-ANNO-TEXT" }
  );

  const annotateGridLines = () => {
    const offset = Math.max(3, gridSpacingY / 2);
    gridXs.forEach((x, index) => {
      const label = (index + 1).toString();
      dxf.addText(point3d(x, halfDepth + offset, 0), defaultTextHeight * 0.6, label, { layerName: "A-ANNO-TEXT" });
      dxf.addText(point3d(x, -halfDepth - offset, 0), defaultTextHeight * 0.6, label, { layerName: "A-ANNO-TEXT" });
    });

    const offsetX = Math.max(3, gridSpacingX / 2);
    gridYs.forEach((y, index) => {
      const label = toAlpha(index);
      dxf.addText(point3d(halfWidth + offsetX, y, 0), defaultTextHeight * 0.6, label, { layerName: "A-ANNO-TEXT" });
      dxf.addText(point3d(-halfWidth - offsetX, y, 0), defaultTextHeight * 0.6, label, { layerName: "A-ANNO-TEXT" });
    });
  };

  annotateGridLines();

  const addColumnMarkers = () => {
    const radius = Math.min(gridSpacingX, gridSpacingY) * 0.08;
    gridXs.forEach((x) => {
      gridYs.forEach((y) => {
        if (Math.abs(x) <= halfWidth + 1e-6 && Math.abs(y) <= halfDepth + 1e-6) {
          dxf.addCircle(point3d(x, y, 0), radius, { layerName: "A-COLUMN" });
        }
      });
    });
  };

  addColumnMarkers();

  const addDimensions = () => {
    const offsetPlan = Math.max(4, footprintDepth * 0.15);
    const offsetCore = Math.max(2, coreDepth * 0.2);

    dxf.addLinearDim(point3d(-halfWidth, -halfDepth, 0), point3d(halfWidth, -halfDepth, 0), {
      layerName: "A-DIMS",
      offset: -offsetPlan,
    });
    dxf.addLinearDim(point3d(-halfWidth, -halfDepth, 0), point3d(-halfWidth, halfDepth, 0), {
      layerName: "A-DIMS",
      offset: -offsetPlan,
      angle: 90,
    });

    dxf.addLinearDim(point3d(-halfCoreWidth, -halfCoreDepth, 0), point3d(halfCoreWidth, -halfCoreDepth, 0), {
      layerName: "A-DIMS",
      offset: -offsetCore,
    });
    dxf.addLinearDim(point3d(-halfCoreWidth, -halfCoreDepth, 0), point3d(-halfCoreWidth, halfCoreDepth, 0), {
      layerName: "A-DIMS",
      offset: -offsetCore,
      angle: 90,
    });

    dxf.addLinearDim(point3d(-siteHalfWidth, -siteHalfDepth, 0), point3d(siteHalfWidth, -siteHalfDepth, 0), {
      layerName: "A-DIMS",
      offset: -offsetPlan * 1.5,
    });
    dxf.addLinearDim(point3d(-siteHalfWidth, -siteHalfDepth, 0), point3d(-siteHalfWidth, siteHalfDepth, 0), {
      layerName: "A-DIMS",
      offset: -offsetPlan * 1.5,
      angle: 90,
    });
  };

  addDimensions();

  const addInteriorCoreDetails = () => {
    const margin = Math.min(coreWidth, coreDepth) * 0.1;
    const usableWidth = coreWidth - margin * 2;
    const usableDepth = coreDepth - margin * 2;

    const elevatorCount = cores.elevators;
    const stairCount = cores.stairs;

    if (elevatorCount > 0) {
      const elevatorCols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(elevatorCount))));
      const elevatorRows = Math.max(1, Math.ceil(elevatorCount / elevatorCols));
      const maxElevatorWidth = spec.project.units === "meters" ? 2.4 : 8;
      const maxElevatorDepth = spec.project.units === "meters" ? 2.4 : 8;
      const spacingX = usableWidth / elevatorCols;
      const spacingY = usableDepth / elevatorRows;
      const elevatorWidth = Math.min(maxElevatorWidth, spacingX * 0.8);
      const elevatorDepth = Math.min(maxElevatorDepth, spacingY * 0.8);

      let placed = 0;
      for (let row = 0; row < elevatorRows; row++) {
        for (let col = 0; col < elevatorCols; col++) {
          if (placed >= elevatorCount) {
            break;
          }
          const centerX = -halfCoreWidth + margin + spacingX * (col + 0.5);
          const centerY = -halfCoreDepth + margin + spacingY * (row + 0.5);
          const halfElWidth = elevatorWidth / 2;
          const halfElDepth = elevatorDepth / 2;

          dxf.addLWPolyline(
            [
              { point: point2d(centerX - halfElWidth, centerY - halfElDepth) },
              { point: point2d(centerX + halfElWidth, centerY - halfElDepth) },
              { point: point2d(centerX + halfElWidth, centerY + halfElDepth) },
              { point: point2d(centerX - halfElWidth, centerY + halfElDepth) },
            ],
            polylineOptions("A-FEAT-ELEV")
          );
          dxf.addText(point3d(centerX, centerY - elevatorDepth * 0.1, 0), defaultTextHeight * 0.5, "EL", {
            layerName: "A-ANNO-TEXT",
          });

          placed += 1;
        }
      }
    }

    if (stairCount > 0) {
      const stairWidth = spec.project.units === "meters" ? 3 : 10;
      const stairDepth = spec.project.units === "meters" ? 5 : 16;
      const spacing = usableWidth / Math.max(1, stairCount);

      for (let i = 0; i < stairCount; i++) {
        const centerX = -halfCoreWidth + margin + spacing * (i + 0.5);
        const centerY = halfCoreDepth - margin - stairDepth / 2;
        const halfStairWidth = stairWidth / 2;
        const halfStairDepth = stairDepth / 2;

        dxf.addLWPolyline(
          [
            { point: point2d(centerX - halfStairWidth, centerY - halfStairDepth) },
            { point: point2d(centerX + halfStairWidth, centerY - halfStairDepth) },
            { point: point2d(centerX + halfStairWidth, centerY + halfStairDepth) },
            { point: point2d(centerX - halfStairWidth, centerY + halfStairDepth) },
          ],
          polylineOptions("A-FEAT-STAIR")
        );
        dxf.addLine(
          point3d(centerX - halfStairWidth, centerY - halfStairDepth, 0),
          point3d(centerX + halfStairWidth, centerY + halfStairDepth, 0),
          { layerName: "A-FEAT-STAIR" }
        );
        dxf.addLine(
          point3d(centerX + halfStairWidth, centerY - halfStairDepth, 0),
          point3d(centerX - halfStairWidth, centerY + halfStairDepth, 0),
          { layerName: "A-FEAT-STAIR" }
        );
        dxf.addText(point3d(centerX, centerY - stairDepth * 0.1, 0), defaultTextHeight * 0.5, "ST", {
          layerName: "A-ANNO-TEXT",
        });
      }
    }
  };

  addInteriorCoreDetails();

  const addProjectData = () => {
    const startX = halfWidth + Math.max(6, footprintWidth / 4);
    let cursorY = halfDepth;
    const lineSpacing = defaultTextHeight * 1.1;

    const addLine = (label: string, value: string) => {
      dxf.addText(point3d(startX, cursorY, 0), defaultTextHeight * 0.7, `${label}: ${value}`, {
        layerName: "A-ANNO-TEXT",
      });
      cursorY -= lineSpacing;
    };

    dxf.addText(point3d(startX, cursorY, 0), defaultTextHeight, "Project Data", { layerName: "A-ANNO-TEXT" });
    cursorY -= lineSpacing * 1.4;

    addLine("Site", `${formatValue(spec.project.site.width)} x ${formatValue(spec.project.site.depth)} ${unitSymbol}`);
    addLine(
      "Setbacks",
      `Front ${formatValue(setbackFront)}${unitSymbol}, Rear ${formatValue(setbackRear)}${unitSymbol}, Side ${formatValue(
        setbackSide
      )}${unitSymbol}`
    );
    addLine("Footprint", `${formatValue(footprintWidth)} x ${formatValue(footprintDepth)} ${unitSymbol}`);
    addLine("Core", `${formatValue(coreWidth)} x ${formatValue(coreDepth)} ${unitSymbol}`);
    addLine("Floors", `${tower.floors} @ ${formatValue(tower.typicalFloorHeight)}${unitSymbol}`);
    addLine("Grid Bays", `${Math.round(footprintWidth / gridSpacingX)} x ${Math.round(footprintDepth / gridSpacingY)}`);
    addLine("Vertical Circulation", `${cores.stairs} stairs, ${cores.elevators} elevators`);
  };

  addProjectData();

  const addExtrudedBox = (
    layerName: string,
    halfX: number,
    halfY: number,
    height: number,
    elevation = 0
  ) => {
    const baseZ = elevation;
    const topZ = elevation + height;

    const p1 = point3d(-halfX, -halfY, baseZ);
    const p2 = point3d(halfX, -halfY, baseZ);
    const p3 = point3d(halfX, halfY, baseZ);
    const p4 = point3d(-halfX, halfY, baseZ);

    const p1Top = point3d(-halfX, -halfY, topZ);
    const p2Top = point3d(halfX, -halfY, topZ);
    const p3Top = point3d(halfX, halfY, topZ);
    const p4Top = point3d(-halfX, halfY, topZ);

    dxf.add3dFace(p1, p2, p3, p4, { layerName });
    dxf.add3dFace(p1Top, p2Top, p3Top, p4Top, { layerName });
    dxf.add3dFace(p1, p2, p2Top, p1Top, { layerName });
    dxf.add3dFace(p2, p3, p3Top, p2Top, { layerName });
    dxf.add3dFace(p3, p4, p4Top, p3Top, { layerName });
    dxf.add3dFace(p4, p1, p1Top, p4Top, { layerName });
  };

  addExtrudedBox("A-BLDG-3D", halfWidth, halfDepth, totalHeight);
  addExtrudedBox("A-CORE-3D", halfCoreWidth, halfCoreDepth, totalHeight);

  return dxf.stringify();
}

// Helper function to validate core fits within footprint
export function validateCoreFit(spec: BuildingSpecType): boolean {
  const { tower, cores } = spec.project;
  const clearance = 1; // 1 unit clearance requirement
  
  return (
    cores.coreWidth + (2 * clearance) <= tower.footprintDims.x &&
    cores.coreDepth + (2 * clearance) <= tower.footprintDims.y
  );
}

// Helper function to get building dimensions for 3D preview
export function getBuildingDimensions(spec: BuildingSpecType) {
  const { tower, cores } = spec.project;
  return {
    width: tower.footprintDims.x,
    depth: tower.footprintDims.y,
    height: tower.floors * tower.typicalFloorHeight,
    coreWidth: cores.coreWidth,
    coreDepth: cores.coreDepth,
    coreHeight: tower.floors * tower.typicalFloorHeight
  };
}
