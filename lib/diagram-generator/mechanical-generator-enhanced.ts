// Enhanced Mechanical diagram generator with intelligent prompt analysis
import { DiagramComponent, DiagramConnection, GeneratedDiagram, DiagramGenerationRequest } from './types';

interface ComponentSpec {
  type: string;
  position: { x: number; y: number };
  properties: any;
}

interface SystemLayout {
  components: ComponentSpec[];
  connections: Array<{ from: string; to: string; type: 'power' | 'signal' | 'piping' | 'structural' }>;
  title: string;
}

export class MechanicalDiagramGenerator {
  private components: DiagramComponent[] = [];
  private connections: DiagramConnection[] = [];
  private componentCounter = 0;

  generateDiagram(request: DiagramGenerationRequest): GeneratedDiagram {
    this.components = [];
    this.connections = [];
    this.componentCounter = 0;

    const prompt = request.prompt.toLowerCase();
    const layout = this.analyzePromptAndGenerateLayout(prompt);
    
    return this.createDiagramFromLayout(layout, request);
  }

  private analyzePromptAndGenerateLayout(prompt: string): SystemLayout {
    // Extract equipment from prompt
    const equipment = this.extractEquipment(prompt);
    const specifications = this.extractSpecifications(prompt);
    const flowDirection = this.determineFlowDirection(prompt);
    
    // Generate layout based on equipment and specifications
    return this.generateSystemLayout(equipment, specifications, flowDirection, prompt);
  }

  private extractEquipment(prompt: string): string[] {
    const equipmentKeywords = {
      'pump': ['pump', 'centrifugal', 'positive displacement', 'gear pump', 'piston pump'],
      'compressor': ['compressor', 'air compressor', 'reciprocating', 'screw compressor'],
      'heat_exchanger': ['heat exchanger', 'heater', 'cooler', 'condenser', 'evaporator', 'shell and tube', 'plate'],
      'valve': ['valve', 'gate valve', 'ball valve', 'check valve', 'relief valve', 'control valve'],
      'tank': ['tank', 'vessel', 'storage', 'reservoir', 'accumulator'],
      'boiler': ['boiler', 'steam generator', 'furnace'],
      'turbine': ['turbine', 'steam turbine', 'gas turbine'],
      'separator': ['separator', 'cyclone', 'filter', 'strainer'],
      'mixer': ['mixer', 'blender', 'agitator'],
      'fan': ['fan', 'blower', 'ventilator'],
      'motor': ['motor', 'engine', 'drive'],
      'pipe': ['pipe', 'piping', 'line', 'pipeline']
    };

    const foundEquipment: string[] = [];
    
    for (const [equipmentType, keywords] of Object.entries(equipmentKeywords)) {
      for (const keyword of keywords) {
        if (prompt.includes(keyword)) {
          foundEquipment.push(equipmentType);
          break;
        }
      }
    }

    return [...new Set(foundEquipment)]; // Remove duplicates
  }

  private extractSpecifications(prompt: string): any {
    const specs: any = {};
    
    // Extract flow rates
    const flowMatch = prompt.match(/(\d+)\s*(gpm|lpm|m3\/h|m3\/min|l\/min|gph)/i);
    if (flowMatch) {
      specs.flowRate = `${flowMatch[1]} ${flowMatch[2].toUpperCase()}`;
    }

    // Extract pressures
    const pressureMatch = prompt.match(/(\d+)\s*(bar|psi|kpa|mpa|atm)/i);
    if (pressureMatch) {
      specs.pressure = `${pressureMatch[1]} ${pressureMatch[2].toUpperCase()}`;
    }

    // Extract temperatures
    const tempMatch = prompt.match(/(\d+)\s*(°c|°f|celsius|fahrenheit)/i);
    if (tempMatch) {
      specs.temperature = `${tempMatch[1]}${tempMatch[2].includes('°') ? tempMatch[2] : '°C'}`;
    }

    // Extract pipe sizes
    const pipeMatch = prompt.match(/(\d+)\s*(inch|in|mm|cm|"|'')/i);
    if (pipeMatch) {
      specs.pipeSize = `${pipeMatch[1]} ${pipeMatch[2].replace(/['"]/g, 'inch')}`;
    }

    // Extract power ratings
    const powerMatch = prompt.match(/(\d+)\s*(kw|hp|w|mw)/i);
    if (powerMatch) {
      specs.power = `${powerMatch[1]} ${powerMatch[2].toUpperCase()}`;
    }

    // Extract equipment tags
    const tagMatches = prompt.match(/([A-Z]-\d{3,4})/g);
    if (tagMatches) {
      specs.tags = tagMatches;
    }

    return specs;
  }

  private determineFlowDirection(prompt: string): 'horizontal' | 'vertical' | 'mixed' {
    if (prompt.includes('vertical') || prompt.includes('tower') || prompt.includes('column')) {
      return 'vertical';
    } else if (prompt.includes('horizontal') || prompt.includes('line') || prompt.includes('pipeline')) {
      return 'horizontal';
    }
    return 'horizontal'; // Default
  }

  private generateSystemLayout(equipment: string[], specs: any, flowDirection: string, prompt: string): SystemLayout {
    const components: ComponentSpec[] = [];
    const connections: Array<{ from: string; to: string; type: 'power' | 'signal' | 'piping' | 'structural' }> = [];
    
    let x = 100;
    const y = 200;
    const spacing = 150;
    let previousComponent: string | null = null;

    // Generate components based on equipment found
    for (const equipmentType of equipment) {
      const component = this.createComponentSpec(equipmentType, { x, y }, specs, components.length);
      components.push(component);
      
      if (previousComponent) {
        connections.push({
          from: previousComponent,
          to: component.properties.tag,
          type: 'piping'
        });
      }
      
      previousComponent = component.properties.tag;
      x += spacing;
    }

    // If no specific equipment found, create a basic system
    if (components.length === 0) {
      return this.createBasicSystem(specs, prompt);
    }

    // Generate title based on equipment and prompt
    const title = this.generateTitle(equipment, prompt);

    return { components, connections, title };
  }

  private createComponentSpec(type: string, position: { x: number; y: number }, specs: any, index: number): ComponentSpec {
    const tag = specs.tags && specs.tags[index] ? specs.tags[index] : this.generateTag(type, index + 1);
    
    const properties: any = {
      tag: tag,
      type: type
    };

    // Add specifications to properties
    if (specs.flowRate) properties.flowRate = specs.flowRate;
    if (specs.pressure) properties.pressure = specs.pressure;
    if (specs.temperature) properties.temperature = specs.temperature;
    if (specs.power) properties.power = specs.power;
    if (specs.pipeSize) properties.pipeSize = specs.pipeSize;

    return {
      type: type,
      position: position,
      properties: properties
    };
  }

  private generateTag(equipmentType: string, index: number): string {
    const prefixes: { [key: string]: string } = {
      'pump': 'P',
      'compressor': 'C',
      'heat_exchanger': 'E',
      'valve': 'V',
      'tank': 'T',
      'boiler': 'B',
      'turbine': 'T',
      'separator': 'S',
      'mixer': 'M',
      'fan': 'F',
      'motor': 'M',
      'pipe': 'L'
    };

    const prefix = prefixes[equipmentType] || 'E';
    return `${prefix}-${String(index).padStart(3, '0')}`;
  }

  private createBasicSystem(specs: any, prompt: string): SystemLayout {
    // Create a basic system based on common mechanical terms
    const components: ComponentSpec[] = [];
    const connections: Array<{ from: string; to: string; type: 'power' | 'signal' | 'piping' | 'structural' }> = [];

    if (prompt.includes('system') || prompt.includes('loop') || prompt.includes('circuit')) {
      // Create a basic pump-tank system
      components.push({
        type: 'tank',
        position: { x: 100, y: 200 },
        properties: { tag: 'T-101', type: 'source', volume: '1000L' }
      });

      components.push({
        type: 'pump',
        position: { x: 250, y: 200 },
        properties: { tag: 'P-201', type: 'centrifugal', flowRate: specs.flowRate || '100 GPM' }
      });

      components.push({
        type: 'tank',
        position: { x: 400, y: 200 },
        properties: { tag: 'T-301', type: 'destination', volume: '1000L' }
      });

      connections.push({ from: 'T-101', to: 'P-201', type: 'piping' });
      connections.push({ from: 'P-201', to: 'T-301', type: 'piping' });
    } else {
      // Single component system
      components.push({
        type: 'pump',
        position: { x: 200, y: 200 },
        properties: { tag: 'P-101', type: 'centrifugal', flowRate: specs.flowRate || '100 GPM' }
      });
    }

    return {
      components,
      connections,
      title: this.generateTitle(['pump', 'tank'], prompt)
    };
  }

  private generateTitle(equipment: string[], prompt: string): string {
    if (equipment.length === 0) {
      return "Mechanical System Diagram";
    }

    const equipmentNames = equipment.map(eq => {
      const names: { [key: string]: string } = {
        'pump': 'Pump',
        'compressor': 'Compressor',
        'heat_exchanger': 'Heat Exchanger',
        'valve': 'Valve',
        'tank': 'Tank',
        'boiler': 'Boiler',
        'turbine': 'Turbine',
        'separator': 'Separator',
        'mixer': 'Mixer',
        'fan': 'Fan',
        'motor': 'Motor',
        'pipe': 'Piping'
      };
      return names[eq] || eq;
    });

    if (equipmentNames.length === 1) {
      return `${equipmentNames[0]} System`;
    } else if (equipmentNames.length === 2) {
      return `${equipmentNames[0]} and ${equipmentNames[1]} System`;
    } else {
      return `${equipmentNames.slice(0, -1).join(', ')} and ${equipmentNames[equipmentNames.length - 1]} System`;
    }
  }

  private createDiagramFromLayout(layout: SystemLayout, request: DiagramGenerationRequest): GeneratedDiagram {
    // Add components
    for (const compSpec of layout.components) {
      this.addComponent(compSpec.type, compSpec.position, compSpec.properties);
    }

    // Add connections
    for (const connSpec of layout.connections) {
      this.addConnection(connSpec.from, connSpec.to, connSpec.type);
    }

    return this.createDiagram(layout.title, request);
  }

  private addComponent(type: string, position: { x: number; y: number }, properties: any): DiagramComponent {
    const component: DiagramComponent = {
      id: `comp_${++this.componentCounter}`,
      type: type,
      position: position,
      properties: properties
    };
    this.components.push(component);
    return component;
  }

  private addConnection(from: string, to: string, type: 'power' | 'signal' | 'piping' | 'structural'): void {
    const connection: DiagramConnection = {
      from: from,
      to: to,
      type: type,
      properties: {}
    };
    this.connections.push(connection);
  }

  private createDiagram(title: string, request: DiagramGenerationRequest): GeneratedDiagram {
    return {
      id: `diagram_${Date.now()}`,
      discipline: request.discipline,
      title: title,
      components: this.components,
      connections: this.connections,
      svg: this.generateSVG(),
      metadata: {
        generatedAt: new Date().toISOString(),
        prompt: request.prompt,
        estimatedTime: '2-5 minutes',
        outputFormats: ['DWG', 'DXF', 'SVG']
      }
    };
  }

  private generateSVG(): string {
    const width = 800;
    const height = 400;
    
    let svg = `<svg viewBox="0 0 ${width} ${height}" class="w-full h-full">
      <rect width="${width}" height="${height}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
      <text x="${width/2}" y="30" text-anchor="middle" class="text-lg font-bold fill-gray-800">${this.components.length > 0 ? this.components[0].properties.tag || 'System' : 'Mechanical System'}</text>`;

    // Add components
    for (const component of this.components) {
      svg += this.generateComponentSVG(component);
    }

    // Add connections
    for (const connection of this.connections) {
      svg += this.generateConnectionSVG(connection);
    }

    // Add arrow markers
    svg += `
      <defs>
        <marker id="arrowhead" marker-width="10" marker-height="7" ref-x="9" ref-y="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
    </svg>`;

    return svg;
  }

  private generateComponentSVG(component: DiagramComponent): string {
    const { x, y } = component.position;
    const { type, properties } = component;

    switch (type) {
      case 'pump':
        return `
          <g transform="translate(${x}, ${y})">
            <circle cx="0" cy="0" r="20" fill="#3b82f6" stroke="#1e40af" stroke-width="2"/>
            <text x="0" y="5" text-anchor="middle" class="text-xs font-semibold fill-white">${properties.tag || 'P-101'}</text>
            <text x="0" y="40" text-anchor="middle" class="text-xs fill-gray-600">Pump</text>
          </g>`;

      case 'tank':
        return `
          <g transform="translate(${x}, ${y})">
            <rect x="-30" y="-25" width="60" height="50" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
            <text x="0" y="-5" text-anchor="middle" class="text-xs font-semibold fill-white">${properties.tag || 'T-101'}</text>
            <text x="0" y="10" text-anchor="middle" class="text-xs font-semibold fill-white">${properties.type || 'TANK'}</text>
            <text x="0" y="40" text-anchor="middle" class="text-xs fill-gray-600">${properties.volume || '1000L'}</text>
          </g>`;

      case 'heat_exchanger':
        return `
          <g transform="translate(${x}, ${y})">
            <rect x="-25" y="-15" width="50" height="30" fill="#10b981" stroke="#059669" stroke-width="2"/>
            <text x="0" y="-5" text-anchor="middle" class="text-xs font-semibold fill-white">${properties.tag || 'E-201'}</text>
            <text x="0" y="10" text-anchor="middle" class="text-xs font-semibold fill-white">HX</text>
            <text x="0" y="40" text-anchor="middle" class="text-xs fill-gray-600">${properties.area || '100 m²'}</text>
          </g>`;

      case 'valve':
        return `
          <g transform="translate(${x}, ${y})">
            <rect x="-8" y="-15" width="16" height="30" fill="#f59e0b" stroke="#d97706" stroke-width="2"/>
            <text x="0" y="5" text-anchor="middle" class="text-xs font-semibold fill-white">${properties.tag || 'V-101'}</text>
            <text x="0" y="40" text-anchor="middle" class="text-xs fill-gray-600">${properties.type || 'VALVE'}</text>
          </g>`;

      case 'compressor':
        return `
          <g transform="translate(${x}, ${y})">
            <rect x="-20" y="-15" width="40" height="30" fill="#8b5cf6" stroke="#7c3aed" stroke-width="2"/>
            <text x="0" y="-5" text-anchor="middle" class="text-xs font-semibold fill-white">${properties.tag || 'C-201'}</text>
            <text x="0" y="10" text-anchor="middle" class="text-xs font-semibold fill-white">COMP</text>
            <text x="0" y="40" text-anchor="middle" class="text-xs fill-gray-600">${properties.power || '50 kW'}</text>
          </g>`;

      default:
        return `
          <g transform="translate(${x}, ${y})">
            <rect x="-20" y="-15" width="40" height="30" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
            <text x="0" y="5" text-anchor="middle" class="text-xs font-semibold fill-white">${properties.tag || 'E-101'}</text>
            <text x="0" y="40" text-anchor="middle" class="text-xs fill-gray-600">${type.toUpperCase()}</text>
          </g>`;
    }
  }

  private generateConnectionSVG(connection: DiagramConnection): string {
    const fromComp = this.components.find(c => c.id === connection.from);
    const toComp = this.components.find(c => c.id === connection.to);

    if (!fromComp || !toComp) return '';

    const fromX = fromComp.position.x + 20;
    const fromY = fromComp.position.y;
    const toX = toComp.position.x - 20;
    const toY = toComp.position.y;

    return `
      <path d="M ${fromX} ${fromY} L ${toX} ${toY}" 
            stroke="#3b82f6" stroke-width="3" fill="none" marker-end="url(#arrowhead)"/>`;
  }
}
