// Electrical diagram generator
import { DiagramComponent, DiagramConnection, GeneratedDiagram, DiagramGenerationRequest } from './types';

export class ElectricalDiagramGenerator {
  private components: DiagramComponent[] = [];
  private connections: DiagramConnection[] = [];
  private componentCounter = 0;

  generateDiagram(request: DiagramGenerationRequest): GeneratedDiagram {
    this.components = [];
    this.connections = [];
    this.componentCounter = 0;

    const prompt = request.prompt.toLowerCase();
    
    // Analyze prompt and generate appropriate diagram
    if (prompt.includes('series circuit') || prompt.includes('resistor') || prompt.includes('lamp')) {
      return this.generateSeriesCircuit(request);
    } else if (prompt.includes('single-line') || prompt.includes('switchboard') || prompt.includes('mcc')) {
      return this.generateSingleLineDiagram(request);
    } else if (prompt.includes('panel') || prompt.includes('schedule')) {
      return this.generatePanelSchedule(request);
    } else if (prompt.includes('cable tray') || prompt.includes('conduit')) {
      return this.generateCableTrayLayout(request);
    } else {
      return this.generateGenericElectrical(request);
    }
  }

  private generateSeriesCircuit(request: DiagramGenerationRequest): GeneratedDiagram {
    const title = "Series Circuit with Resistor and Lamp";
    
    // Power source
    const powerSource = this.addComponent('power_source', { x: 100, y: 200 }, {
      voltage: '220V',
      type: 'AC',
      frequency: '50Hz'
    });

    // Resistor
    const resistor = this.addComponent('resistor', { x: 300, y: 200 }, {
      resistance: '100Ω',
      power: '1W'
    });

    // Lamp
    const lamp = this.addComponent('lamp', { x: 500, y: 200 }, {
      voltage: '220V',
      power: '60W',
      type: 'LED'
    });

    // Connections
    this.addConnection(powerSource.id, resistor.id, 'power');
    this.addConnection(resistor.id, lamp.id, 'power');

    return this.createDiagram(request, title);
  }

  private generateSingleLineDiagram(request: DiagramGenerationRequest): GeneratedDiagram {
    const title = "Single-Line Diagram - 480V System";
    
    // Utility feed
    const utility = this.addComponent('utility', { x: 100, y: 200 }, {
      voltage: '480V',
      phase: '3-phase',
      frequency: '60Hz'
    });

    // Main switchboard
    const mainSwitchboard = this.addComponent('switchboard', { x: 300, y: 200 }, {
      voltage: '480V',
      type: 'main',
      rating: '1000A'
    });

    // MCCs
    const mcc1 = this.addComponent('mcc', { x: 500, y: 150 }, {
      voltage: '480V',
      type: 'motor_control',
      rating: '400A'
    });

    const mcc2 = this.addComponent('mcc', { x: 500, y: 250 }, {
      voltage: '480V',
      type: 'motor_control',
      rating: '400A'
    });

    // Protective devices
    const breaker1 = this.addComponent('circuit_breaker', { x: 200, y: 200 }, {
      rating: '1000A',
      type: 'main_breaker'
    });

    const breaker2 = this.addComponent('circuit_breaker', { x: 400, y: 150 }, {
      rating: '400A',
      type: 'feeder_breaker'
    });

    const breaker3 = this.addComponent('circuit_breaker', { x: 400, y: 250 }, {
      rating: '400A',
      type: 'feeder_breaker'
    });

    // Connections
    this.addConnection(utility.id, breaker1.id, 'power');
    this.addConnection(breaker1.id, mainSwitchboard.id, 'power');
    this.addConnection(mainSwitchboard.id, breaker2.id, 'power');
    this.addConnection(mainSwitchboard.id, breaker3.id, 'power');
    this.addConnection(breaker2.id, mcc1.id, 'power');
    this.addConnection(breaker3.id, mcc2.id, 'power');

    return this.createDiagram(request, title);
  }

  private generatePanelSchedule(request: DiagramGenerationRequest): GeneratedDiagram {
    const title = "Panel Schedule - 24 Circuit Panel";
    
    // Main panel
    const panel = this.addComponent('panel', { x: 400, y: 200 }, {
      type: 'distribution_panel',
      voltage: '480V',
      rating: '400A',
      circuits: 24
    });

    // Sample circuits
    for (let i = 0; i < 8; i++) {
      const circuit = this.addComponent('circuit', { x: 200 + i * 50, y: 100 }, {
        number: i + 1,
        breaker: '20A',
        load: 'Lighting',
        description: `Circuit ${i + 1}`
      });
      this.addConnection(panel.id, circuit.id, 'power');
    }

    return this.createDiagram(request, title);
  }

  private generateCableTrayLayout(request: DiagramGenerationRequest): GeneratedDiagram {
    const title = "Cable Tray Layout - Level 2";
    
    // Main cable tray
    const mainTray = this.addComponent('cable_tray', { x: 200, y: 200 }, {
      width: '300mm',
      height: '100mm',
      type: 'ladder',
      length: '50m'
    });

    // Drop points
    for (let i = 0; i < 6; i++) {
      const dropPoint = this.addComponent('drop_point', { x: 300 + i * 80, y: 200 }, {
        panel: `E-20${i + 1}`,
        cables: 3
      });
      this.addConnection(mainTray.id, dropPoint.id, 'structural');
    }

    return this.createDiagram(request, title);
  }

  private generateGenericElectrical(request: DiagramGenerationRequest): GeneratedDiagram {
    const title = "Electrical System Diagram";
    
    // Generic components
    const source = this.addComponent('power_source', { x: 100, y: 200 }, {
      voltage: '220V',
      type: 'AC'
    });

    const load = this.addComponent('load', { x: 500, y: 200 }, {
      type: 'general',
      power: '1kW'
    });

    this.addConnection(source.id, load.id, 'power');

    return this.createDiagram(request, title);
  }

  private addComponent(type: string, position: { x: number; y: number }, properties: Record<string, any>): DiagramComponent {
    const component: DiagramComponent = {
      id: `comp_${++this.componentCounter}`,
      type,
      position,
      properties
    };
    this.components.push(component);
    return component;
  }

  private addConnection(from: string, to: string, type: 'power' | 'signal' | 'piping' | 'structural'): void {
    const connection: DiagramConnection = {
      from,
      to,
      type,
      properties: {}
    };
    this.connections.push(connection);
  }

  private createDiagram(request: DiagramGenerationRequest, title: string): GeneratedDiagram {
    const svg = this.generateSVG(title);
    
    return {
      id: `diagram_${Date.now()}`,
      discipline: request.discipline,
      title,
      components: this.components,
      connections: this.connections,
      svg,
      metadata: {
        generatedAt: new Date().toISOString(),
        prompt: request.prompt,
        estimatedTime: '2-5 minutes',
        outputFormats: ['DWG', 'DXF', 'SVG']
      }
    };
  }

  private generateSVG(title: string): string {
    const width = 800;
    const height = 400;
    
    let svg = `<svg viewBox="0 0 ${width} ${height}" class="w-full h-full">`;
    
    // Background
    svg += `<rect width="${width}" height="${height}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>`;
    
    // Title
    svg += `<text x="${width/2}" y="30" text-anchor="middle" class="text-lg font-bold fill-gray-800">${title}</text>`;
    
    // Generate components
    this.components.forEach(component => {
      svg += this.generateComponentSVG(component);
    });
    
    // Generate connections
    this.connections.forEach(connection => {
      svg += this.generateConnectionSVG(connection);
    });
    
    // Add arrow markers
    svg += `<defs>
      <marker id="arrowhead" marker-width="10" marker-height="7" ref-x="9" ref-y="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280"/>
      </marker>
    </defs>`;
    
    svg += '</svg>';
    
    return svg;
  }

  private generateComponentSVG(component: DiagramComponent): string {
    const { x, y } = component.position;
    const { type, properties } = component;
    
    switch (type) {
      case 'power_source':
        return `<g transform="translate(${x}, ${y})">
          <rect x="-30" y="-20" width="60" height="40" fill="#f59e0b" stroke="#d97706" stroke-width="2"/>
          <text x="0" y="5" text-anchor="middle" class="text-xs font-semibold fill-white">${properties.voltage || '220V'}</text>
          <text x="0" y="50" text-anchor="middle" class="text-xs fill-gray-600">Power Source</text>
        </g>`;
        
      case 'resistor':
        return `<g transform="translate(${x}, ${y})">
          <rect x="-20" y="-10" width="40" height="20" fill="#ef4444" stroke="#dc2626" stroke-width="2"/>
          <text x="0" y="5" text-anchor="middle" class="text-xs font-semibold fill-white">R</text>
          <text x="0" y="40" text-anchor="middle" class="text-xs fill-gray-600">${properties.resistance || '100Ω'}</text>
        </g>`;
        
      case 'lamp':
        return `<g transform="translate(${x}, ${y})">
          <circle cx="0" cy="0" r="15" fill="#fbbf24" stroke="#f59e0b" stroke-width="2"/>
          <text x="0" y="5" text-anchor="middle" class="text-xs font-semibold fill-white">L</text>
          <text x="0" y="35" text-anchor="middle" class="text-xs fill-gray-600">Lamp</text>
        </g>`;
        
      case 'switchboard':
        return `<g transform="translate(${x}, ${y})">
          <rect x="-40" y="-30" width="80" height="60" fill="#3b82f6" stroke="#1e40af" stroke-width="2"/>
          <text x="0" y="-5" text-anchor="middle" class="text-xs font-semibold fill-white">MSB</text>
          <text x="0" y="10" text-anchor="middle" class="text-xs font-semibold fill-white">${properties.voltage || '480V'}</text>
          <text x="0" y="50" text-anchor="middle" class="text-xs fill-gray-600">Switchboard</text>
        </g>`;
        
      case 'mcc':
        return `<g transform="translate(${x}, ${y})">
          <rect x="-30" y="-20" width="60" height="40" fill="#10b981" stroke="#059669" stroke-width="2"/>
          <text x="0" y="5" text-anchor="middle" class="text-xs font-semibold fill-white">MCC</text>
          <text x="0" y="50" text-anchor="middle" class="text-xs fill-gray-600">Motor Control</text>
        </g>`;
        
      case 'circuit_breaker':
        return `<g transform="translate(${x}, ${y})">
          <circle cx="0" cy="0" r="8" fill="#ef4444" stroke="#dc2626" stroke-width="2"/>
          <text x="0" y="25" text-anchor="middle" class="text-xs fill-gray-600">CB</text>
        </g>`;
        
      default:
        return `<g transform="translate(${x}, ${y})">
          <rect x="-20" y="-15" width="40" height="30" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
          <text x="0" y="5" text-anchor="middle" class="text-xs font-semibold fill-white">${type.toUpperCase()}</text>
        </g>`;
    }
  }

  private generateConnectionSVG(connection: DiagramConnection): string {
    const fromComp = this.components.find(c => c.id === connection.from);
    const toComp = this.components.find(c => c.id === connection.to);
    
    if (!fromComp || !toComp) return '';
    
    const strokeColor = connection.type === 'power' ? '#f59e0b' : '#6b7280';
    const strokeWidth = connection.type === 'power' ? '4' : '2';
    
    return `<path d="M ${fromComp.position.x + 30} ${fromComp.position.y} L ${toComp.position.x - 30} ${toComp.position.y}" 
            stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none" marker-end="url(#arrowhead)"/>`;
  }
}
