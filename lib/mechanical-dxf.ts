import { 
  Colors, 
  DxfWriter, 
  LineTypes, 
  LWPolylineFlags, 
  Units, 
  point2d, 
  point3d 
} from '@tarikjabiri/dxf';

interface ComponentDefinition {
  type: string;
  label: string;
  shape: 'circle' | 'rectangle' | 'diamond' | 'triangle' | 'capsule' | 'propeller' | 'ship' | 'nozzle';
  keywords: string[];
}

interface DetectedComponent {
  type: string;
  label: string;
  shape: ComponentDefinition['shape'];
}

export interface MechanicalDXFMetadata {
  systemType: string;
  components: string[];
  units: 'meters';
}

export interface MechanicalDXFResult {
  dxf: string;
  metadata: MechanicalDXFMetadata;
}

const COMPONENT_LIBRARY: ComponentDefinition[] = [
  { type: 'pump', label: 'Pump', shape: 'circle', keywords: ['pump', 'centrifugal', 'booster pump', 'coolant pump'] },
  { type: 'compressor', label: 'Compressor', shape: 'circle', keywords: ['compressor', 'screw compressor', 'reciprocating compressor'] },
  { type: 'heat_exchanger', label: 'Heat Exchanger', shape: 'rectangle', keywords: ['heat exchanger', 'radiator', 'intercooler', 'hx', 'condenser'] },
  { type: 'valve', label: 'Control Valve', shape: 'diamond', keywords: ['valve', 'control valve', 'regulator', 'throttle'] },
  { type: 'propellant_tank', label: 'Propellant Tank', shape: 'capsule', keywords: ['propellant tank', 'fuel tank', 'oxidizer tank', 'cryogenic'] },
  { type: 'pressure_vessel', label: 'Pressure Vessel', shape: 'capsule', keywords: ['pressure vessel', 'storage vessel', 'accumulator'] },
  { type: 'rocket_engine', label: 'Rocket Engine', shape: 'nozzle', keywords: ['rocket engine', 'thruster', 'main engine', 'raptor', 'merlin', 'rs-25'] },
  { type: 'rocket_stage', label: 'Rocket Stage', shape: 'triangle', keywords: ['rocket stage', 'booster', 'upper stage', 'first stage', 'second stage'] },
  { type: 'guidance', label: 'Guidance & Avionics', shape: 'rectangle', keywords: ['avionics', 'guidance', 'navigation', 'imu', 'gnc'] },
  { type: 'heat_shield', label: 'Heat Shield', shape: 'capsule', keywords: ['heat shield', 'thermal protection', 'tps'] },
  { type: 'battery_bank', label: 'Battery Bank', shape: 'rectangle', keywords: ['battery bank', 'power cell', 'energy storage'] },
  { type: 'ship_hull', label: 'Ship Hull', shape: 'ship', keywords: ['ship', 'vessel', 'frigate', 'destroyer', 'boat', 'submarine', 'hull'] },
  { type: 'engine_room', label: 'Engine Room', shape: 'rectangle', keywords: ['engine room', 'machinery space', 'diesel', 'gas turbine', 'engine module'] },
  { type: 'propeller', label: 'Propeller', shape: 'propeller', keywords: ['propeller', 'thruster', 'screw', 'azipod'] },
  { type: 'piping', label: 'Process Piping', shape: 'rectangle', keywords: ['manifold', 'piping', 'pipe rack', 'flow manifold'] },
  { type: 'heat_rejection', label: 'Heat Rejection', shape: 'rectangle', keywords: ['radiator', 'heat rejection', 'cooling loop'] }
];

function ensureLayer(dxf: DxfWriter, name: string, color: Colors, lineType: string) {
  if (!dxf.layer(name)) {
    dxf.addLayer(name, color, lineType);
  }
}

function detectComponents(prompt: string): DetectedComponent[] {
  const normalized = prompt.toLowerCase();
  const detected: DetectedComponent[] = [];

  for (const component of COMPONENT_LIBRARY) {
    if (component.keywords.some(keyword => normalized.includes(keyword))) {
      if (!detected.some(item => item.type === component.type)) {
        detected.push({
          type: component.type,
          label: component.label,
          shape: component.shape
        });
      }
    }
  }

  const hasRocketContext = normalized.includes('rocket') || normalized.includes('spacecraft') || normalized.includes('launcher');
  const hasShipContext = normalized.includes('ship') || normalized.includes('vessel') || normalized.includes('submarine') || normalized.includes('frigate');

  if (hasRocketContext) {
    addIfMissing(detected, { type: 'rocket_stage', label: 'Rocket Stage', shape: 'triangle' });
    addIfMissing(detected, { type: 'propellant_tank', label: 'Propellant Tank', shape: 'capsule' });
    addIfMissing(detected, { type: 'rocket_engine', label: 'Rocket Engine', shape: 'nozzle' });
    addIfMissing(detected, { type: 'guidance', label: 'Guidance & Avionics', shape: 'rectangle' });
  }

  if (hasShipContext) {
    addIfMissing(detected, { type: 'ship_hull', label: 'Ship Hull', shape: 'ship' });
    addIfMissing(detected, { type: 'engine_room', label: 'Engine Room', shape: 'rectangle' });
    addIfMissing(detected, { type: 'propeller', label: 'Propulsion', shape: 'propeller' });
  }

  if (detected.length === 0) {
    detected.push(
      { type: 'pump', label: 'Pump', shape: 'circle' },
      { type: 'heat_exchanger', label: 'Heat Exchanger', shape: 'rectangle' },
      { type: 'valve', label: 'Control Valve', shape: 'diamond' }
    );
  }

  return detected.slice(0, 9); // keep layout manageable
}

function addIfMissing(list: DetectedComponent[], component: DetectedComponent) {
  if (!list.some(item => item.type === component.type)) {
    list.push(component);
  }
}

function detectSystemType(prompt: string, components: DetectedComponent[]): string {
  const normalized = prompt.toLowerCase();

  if (normalized.includes('rocket') || normalized.includes('spacecraft') || normalized.includes('launch')) {
    if (normalized.includes('ship')) {
      return 'Launch & Recovery Support System';
    }
    return 'Rocket Propulsion Assembly';
  }

  if (normalized.includes('ship') || normalized.includes('vessel') || normalized.includes('marine')) {
    if (normalized.includes('propulsion')) {
      return 'Marine Propulsion System';
    }
    return 'Shipboard Mechanical Layout';
  }

  if (normalized.includes('thermal') || normalized.includes('cooling') || normalized.includes('heat exchanger')) {
    return 'Thermal Management Loop';
  }

  if (normalized.includes('fuel') || normalized.includes('propellant')) {
    return 'Propellant Handling System';
  }

  if (components.some(component => component.type === 'compressor')) {
    return 'Compressor Train Layout';
  }

  return 'Mechanical Equipment Arrangement';
}

function drawComponentSymbol(dxf: DxfWriter, component: DetectedComponent, x: number, y: number, layer: string) {
  const width = 80;
  const height = 50;
  const radius = 25;

  switch (component.shape) {
    case 'circle': {
      dxf.addCircle(point3d(x, y, 0), radius, { layerName: layer });
      dxf.addLine(point3d(x - radius, y, 0), point3d(x + radius, y, 0), { layerName: layer });
      dxf.addLine(point3d(x, y - radius, 0), point3d(x, y + radius, 0), { layerName: layer });
      break;
    }
    case 'rectangle': {
      dxf.addLWPolyline(
        [
          { point: point2d(x - width / 2, y - height / 2) },
          { point: point2d(x + width / 2, y - height / 2) },
          { point: point2d(x + width / 2, y + height / 2) },
          { point: point2d(x - width / 2, y + height / 2) }
        ],
        { layerName: layer, flags: LWPolylineFlags.Closed }
      );
      break;
    }
    case 'diamond': {
      dxf.addLWPolyline(
        [
          { point: point2d(x, y + height / 2) },
          { point: point2d(x + width / 2, y) },
          { point: point2d(x, y - height / 2) },
          { point: point2d(x - width / 2, y) }
        ],
        { layerName: layer, flags: LWPolylineFlags.Closed }
      );
      break;
    }
    case 'triangle': {
      dxf.addLWPolyline(
        [
          { point: point2d(x - width / 2, y - height / 2) },
          { point: point2d(x + width / 2, y) },
          { point: point2d(x - width / 2, y + height / 2) }
        ],
        { layerName: layer, flags: LWPolylineFlags.Closed }
      );
      break;
    }
    case 'capsule': {
      dxf.addLWPolyline(
        [
          { point: point2d(x - width / 2, y) },
          { point: point2d(x - width / 3, y + height / 2) },
          { point: point2d(x + width / 3, y + height / 2) },
          { point: point2d(x + width / 2, y) },
          { point: point2d(x + width / 3, y - height / 2) },
          { point: point2d(x - width / 3, y - height / 2) }
        ],
        { layerName: layer, flags: LWPolylineFlags.Closed }
      );
      break;
    }
    case 'propeller': {
      const bladeLength = 40;
      dxf.addCircle(point3d(x, y, 0), 12, { layerName: layer });
      dxf.addLWPolyline(
        [
          { point: point2d(x, y) },
          { point: point2d(x + bladeLength, y + 10) },
          { point: point2d(x + bladeLength, y - 10) }
        ],
        { layerName: layer, flags: LWPolylineFlags.Closed }
      );
      dxf.addLWPolyline(
        [
          { point: point2d(x, y) },
          { point: point2d(x - bladeLength, y + 10) },
          { point: point2d(x - bladeLength, y - 10) }
        ],
        { layerName: layer, flags: LWPolylineFlags.Closed }
      );
      break;
    }
    case 'ship': {
      dxf.addLWPolyline(
        [
          { point: point2d(x - width / 2, y) },
          { point: point2d(x - width / 4, y + height / 2) },
          { point: point2d(x + width / 4, y + height / 2) },
          { point: point2d(x + width / 2, y) },
          { point: point2d(x + width / 4, y - height / 2) },
          { point: point2d(x - width / 4, y - height / 2) }
        ],
        { layerName: layer, flags: LWPolylineFlags.Closed }
      );
      break;
    }
    case 'nozzle': {
      dxf.addLWPolyline(
        [
          { point: point2d(x - width / 2, y + height / 2) },
          { point: point2d(x + width / 4, y + height / 4) },
          { point: point2d(x + width / 2, y) },
          { point: point2d(x + width / 4, y - height / 4) },
          { point: point2d(x - width / 2, y - height / 2) }
        ],
        { layerName: layer, flags: LWPolylineFlags.Closed }
      );
      break;
    }
    default: {
      dxf.addCircle(point3d(x, y, 0), radius, { layerName: layer });
    }
  }
}

function drawFlowConnector(dxf: DxfWriter, x1: number, x2: number, y: number, layer: string) {
  dxf.addLine(point3d(x1, y, 0), point3d(x2, y, 0), { layerName: layer });

  const arrowSize = 12;
  dxf.addLWPolyline(
    [
      { point: point2d(x2 - arrowSize, y + arrowSize / 2) },
      { point: point2d(x2, y) },
      { point: point2d(x2 - arrowSize, y - arrowSize / 2) }
    ],
    { layerName: layer, flags: LWPolylineFlags.Closed }
  );
}

function sanitizeSystemName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateMechanicalDXF(prompt: string): MechanicalDXFResult {
  const trimmedPrompt = prompt.trim();
  const components = detectComponents(trimmedPrompt);
  const systemType = detectSystemType(trimmedPrompt, components);

  const dxf = new DxfWriter();

  dxf.setUnits(Units.Meters);
  dxf.setVariable('$INSUNITS', { 70: Units.Meters });
  dxf.addLType('DASHED', 'Dashed __ __ __', [0.5, -0.25, 0.5, -0.25]);
  dxf.addLType('CENTER', 'Center ____ _ ____', [1.2, -0.2, 0.2, -0.2]);

  ensureLayer(dxf, 'M-BORDER', Colors.White, LineTypes.Continuous);
  ensureLayer(dxf, 'M-EQUIP', Colors.Cyan, LineTypes.Continuous);
  ensureLayer(dxf, 'M-FLOW', Colors.Yellow, LineTypes.Continuous);
  ensureLayer(dxf, 'M-ANNO', Colors.Green, LineTypes.Continuous);
  ensureLayer(dxf, 'M-GUIDE', Colors.Black, 'DASHED');

  const layoutWidth = Math.max(components.length * 140, 360);
  const layoutHeight = 260;
  const halfWidth = layoutWidth / 2;
  const halfHeight = layoutHeight / 2;

  dxf.addLWPolyline(
    [
      { point: point2d(-halfWidth - 30, -halfHeight - 40) },
      { point: point2d(halfWidth + 30, -halfHeight - 40) },
      { point: point2d(halfWidth + 30, halfHeight + 40) },
      { point: point2d(-halfWidth - 30, halfHeight + 40) }
    ],
    { layerName: 'M-BORDER', flags: LWPolylineFlags.Closed }
  );

  const spacing = 140;
  const startX = -((components.length - 1) * spacing) / 2;
  const equipmentLayer = 'M-EQUIP';
  const flowLayer = 'M-FLOW';

  components.forEach((component, index) => {
    const x = startX + index * spacing;
    const y = 0;

    drawComponentSymbol(dxf, component, x, y, equipmentLayer);

    dxf.addText(
      point3d(x - 32, y - 50, 0),
      6,
      component.label,
      { layerName: 'M-ANNO' }
    );
  });

  for (let i = 0; i < components.length - 1; i++) {
    const xCurrent = startX + i * spacing + 50;
    const xNext = startX + (i + 1) * spacing - 50;
    drawFlowConnector(dxf, xCurrent, xNext, 0, flowLayer);
  }

  dxf.addText(
    point3d(-halfWidth, halfHeight + 20, 0),
    10,
    `Mechanical System: ${systemType}`,
    { layerName: 'M-ANNO' }
  );

  dxf.addText(
    point3d(-halfWidth, halfHeight - 5, 0),
    6,
    `Prompt Summary: ${trimmedPrompt.slice(0, 120)}${trimmedPrompt.length > 120 ? '...' : ''}`,
    { layerName: 'M-ANNO' }
  );

  dxf.addText(
    point3d(-halfWidth, -halfHeight - 20, 0),
    5,
    'Generated with AI Mechanical Layout Engine',
    { layerName: 'M-ANNO' }
  );

  dxf.setVariable('$EXTMIN', { 10: -halfWidth - 40, 20: -halfHeight - 60, 30: 0 });
  dxf.setVariable('$EXTMAX', { 10: halfWidth + 40, 20: halfHeight + 60, 30: 0 });

  return {
    dxf: dxf.stringify(),
    metadata: {
      systemType,
      components: components.map(component => component.label),
      units: 'meters'
    }
  };
}

export function generateMechanicalFilename(systemType: string) {
  const base = sanitizeSystemName(systemType) || 'mechanical-system';
  return `${base}_layout.dxf`;
}
