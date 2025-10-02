// DXF generator for converting diagram components to DXF format
import Drawing from 'dxf-writer';
import { DiagramComponent, DiagramConnection, GeneratedDiagram } from './types';

export class DXFGenerator {
  private dxf: Drawing;

  constructor() {
    this.dxf = new Drawing();
  }

  generateDXF(diagram: GeneratedDiagram): Buffer {
    // Set up the DXF file
    this.dxf.setUnits(4); // Millimeters
    
    // Add layers for different component types
    this.addLayers();
    
    // Add title block
    this.addTitleBlock(diagram.title, diagram.metadata.prompt);
    
    // Add components
    diagram.components.forEach(component => {
      this.addComponent(component);
    });
    
    // Add connections
    diagram.connections.forEach(connection => {
      this.addConnection(connection, diagram.components);
    });
    
    // Add dimensions and annotations
    this.addDimensions(diagram.components);
    
    return Buffer.from(this.dxf.toDxfString(), 'utf8');
  }

  private addLayers(): void {
    // Define layers for different types of components
    this.dxf.addLayer('EQUIPMENT', 1, 'CONTINUOUS'); // Red for equipment
    this.dxf.addLayer('PIPING', 2, 'CONTINUOUS');    // Yellow for piping
    this.dxf.addLayer('INSTRUMENTS', 3, 'CONTINUOUS'); // Green for instruments
    this.dxf.addLayer('TEXT', 7, 'CONTINUOUS');      // White for text
    this.dxf.addLayer('DIMENSIONS', 4, 'CONTINUOUS'); // Cyan for dimensions
    this.dxf.addLayer('TITLE_BLOCK', 7, 'CONTINUOUS'); // White for title block
  }

  private addTitleBlock(title: string, prompt: string): void {
    this.dxf.setActiveLayer('TITLE_BLOCK');
    
    // Title block border
    this.dxf.drawRect(0, 0, 210, 297); // A4 size in mm
    
    // Title
    this.dxf.drawText(280, 5, 0, title, 20);
    
    // Prompt/description
    this.dxf.drawText(270, 3, 0, `Generated from: ${prompt}`, 20);
    
    // Generation info
    this.dxf.drawText(20, 260, 2.5, 0, `Generated: ${new Date().toLocaleString()}`);
    this.dxf.drawText(250, 2.5, 0, 'ScaleApp - AI Generated Drawing', 20);
    
    // Scale and units
    this.dxf.drawText(240, 2.5, 0, 'Scale: 1:100', 20);
    this.dxf.drawText(235, 2.5, 0, 'Units: mm', 20);
  }

  private addComponent(component: DiagramComponent): void {
    const { x, y } = component.position;
    const { type, properties } = component;
    
    // Convert SVG coordinates to DXF coordinates (scale and offset)
    const dxfX = (x * 0.5) + 50; // Scale and offset
    const dxfY = 200 - (y * 0.5); // Flip Y axis and offset
    
    switch (type) {
      case 'boiler':
        this.addBoiler(dxfX, dxfY, properties);
        break;
      case 'turbine':
        this.addTurbine(dxfX, dxfY, properties);
        break;
      case 'condenser':
        this.addCondenser(dxfX, dxfY, properties);
        break;
      case 'pump':
        this.addPump(dxfX, dxfY, properties);
        break;
      case 'heat_exchanger':
        this.addHeatExchanger(dxfX, dxfY, properties);
        break;
      case 'valve':
        this.addValve(dxfX, dxfY, properties);
        break;
      case 'tank':
        this.addTank(dxfX, dxfY, properties);
        break;
      case 'compressor':
        this.addCompressor(dxfX, dxfY, properties);
        break;
      case 'air_intake':
        this.addAirIntake(dxfX, dxfY, properties);
        break;
      case 'instrument':
        this.addInstrument(dxfX, dxfY, properties);
        break;
      default:
        this.addGenericComponent(dxfX, dxfY, type, properties);
    }
  }

  private addBoiler(x: number, y: number, properties: any): void {
    this.dxf.setActiveLayer('EQUIPMENT');
    
    // Boiler rectangle
    this.dxf.drawRect(x - 20, y - 15, x + 20, y + 15);
    
    // Boiler symbol (steam lines)
    this.dxf.drawLine(x - 10, y + 15, x - 5, y + 20);
    this.dxf.drawLine(x, y + 15, x + 5, y + 20);
    this.dxf.drawLine(x + 10, y + 15, x + 15, y + 20);
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(y - 25, 3, 0, properties.tag || 'BOILER', x);
    this.dxf.drawText(y - 30, 2.5, 0, properties.pressure || '100 bar', x);
  }

  private addTurbine(x: number, y: number, properties: any): void {
    this.dxf.setActiveLayer('EQUIPMENT');
    
    // Turbine circle
    this.dxf.drawCircle(x, y, 12.5);
    
    // Turbine blades
    for (let i = 0; i < 8; i++) {
      const angle = (i * 45) * Math.PI / 180;
      const x1 = x + Math.cos(angle) * 8;
      const y1 = y + Math.sin(angle) * 8;
      const x2 = x + Math.cos(angle) * 12.5;
      const y2 = y + Math.sin(angle) * 12.5;
      this.dxf.drawLine(x1, y1, x2, y2);
    }
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(x, y - 20, 3, 0, properties.tag || 'TURBINE');
    this.dxf.drawText(x, y - 25, 2.5, 0, properties.power || '10 MW');
  }

  private addCondenser(x: number, y: number, properties: any): void {
    this.dxf.setActiveLayer('EQUIPMENT');
    
    // Condenser rectangle
    this.dxf.drawRect(x - 20, y - 10, x + 20, y + 10);
    
    // Cooling tubes
    for (let i = -15; i <= 15; i += 5) {
      this.dxf.drawLine(x + i, y - 10, x + i, y + 10);
    }
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(x, y - 20, 3, 0, properties.tag || 'CONDENSER');
    this.dxf.drawText(x, y - 25, 2.5, 0, properties.pressure || '0.1 bar');
  }

  private addPump(x: number, y: number, properties: any): void {
    this.dxf.setActiveLayer('EQUIPMENT');
    
    // Pump circle
    this.dxf.drawCircle(x, y, 10);
    
    // Pump inlet/outlet arrows
    this.dxf.drawLine(x - 15, y, x - 10, y);
    this.dxf.drawLine(x + 10, y, x + 15, y);
    this.dxf.drawLine(x - 12, y - 2, x - 10, y);
    this.dxf.drawLine(x - 12, y + 2, x - 10, y);
    this.dxf.drawLine(x + 12, y - 2, x + 10, y);
    this.dxf.drawLine(x + 12, y + 2, x + 10, y);
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(x, y - 18, 3, 0, properties.tag || 'P-101');
    this.dxf.drawText(x, y - 23, 2.5, 0, properties.flow_rate || '500 L/min');
  }

  private addHeatExchanger(x: number, y: number, properties: any): void {
    this.dxf.setActiveLayer('EQUIPMENT');
    
    // Heat exchanger rectangle
    this.dxf.drawRect(x - 20, y - 10, x + 20, y + 10);
    
    // Heat exchanger symbol (cross flow)
    this.dxf.drawLine(x - 20, y, x + 20, y);
    this.dxf.drawLine(x, y - 10, x, y + 10);
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(x, y - 20, 3, 0, properties.tag || 'E-201');
    this.dxf.drawText(x, y - 25, 2.5, 0, properties.area || '100 m²');
  }

  private addValve(x: number, y: number, properties: any): void {
    this.dxf.setActiveLayer('EQUIPMENT');
    
    const valveType = properties.type || 'gate_valve';
    
    if (valveType === 'gate_valve' || valveType === 'ball_valve') {
      // Gate/Ball valve rectangle
      this.dxf.drawRect(x - 4, y - 7.5, x + 4, y + 7.5);
    } else if (valveType === 'check_valve') {
      // Check valve triangle
      this.dxf.drawLine(x - 7.5, y - 7.5, x + 7.5, y);
      this.dxf.drawLine(x - 7.5, y + 7.5, x + 7.5, y);
    } else if (valveType === 'relief_valve' || valveType === 'safety_valve') {
      // Relief/Safety valve diamond
      this.dxf.drawLine(x, y - 7.5, x + 7.5, y);
      this.dxf.drawLine(x + 7.5, y, x, y + 7.5);
      this.dxf.drawLine(x, y + 7.5, x - 7.5, y);
      this.dxf.drawLine(x - 7.5, y, x, y - 7.5);
    }
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(' ').toUpperCase() || 'VALVE', x, y - 15, 2.5, 0, properties.type?.replace('_');
  }

  private addTank(x: number, y: number, properties: any): void {
    this.dxf.setActiveLayer('EQUIPMENT');
    
    // Tank rectangle
    this.dxf.drawRect(x - 15, y - 12.5, x + 15, y + 12.5);
    
    // Tank top and bottom lines
    this.dxf.drawLine(x - 15, y - 12.5, x + 15, y - 12.5);
    this.dxf.drawLine(x - 15, y + 12.5, x + 15, y + 12.5);
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(x, y - 20, 3, 0, properties.tag || 'T-101');
    this.dxf.drawText(x, y - 25, 2.5, 0, properties.volume || '10 m³');
  }

  private addCompressor(x: number, y: number, properties: any): void {
    this.dxf.setActiveLayer('EQUIPMENT');
    
    // Compressor rectangle
    this.dxf.drawRect(x - 17.5, y - 10, x + 17.5, y + 10);
    
    // Compressor symbol (fan blades)
    this.dxf.drawCircle(x, y, 8);
    for (let i = 0; i < 6; i++) {
      const angle = (i * 60) * Math.PI / 180;
      const x1 = x + Math.cos(angle) * 4;
      const y1 = y + Math.sin(angle) * 4;
      const x2 = x + Math.cos(angle) * 8;
      const y2 = y + Math.sin(angle) * 8;
      this.dxf.drawLine(x1, y1, x2, y2);
    }
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(x, y - 18, 3, 0, properties.tag || 'C-301');
    this.dxf.drawText(x, y - 23, 2.5, 0, properties.power || '50 kW');
  }

  private addAirIntake(x: number, y: number, properties: any): void {
    this.dxf.setActiveLayer('EQUIPMENT');
    
    // Air intake rectangle
    this.dxf.drawRect(x - 12.5, y - 7.5, x + 12.5, y + 7.5);
    
    // Air flow arrows
    this.dxf.drawLine(x - 20, y, x - 12.5, y);
    this.dxf.drawLine(x - 17, y - 2, x - 12.5, y);
    this.dxf.drawLine(x - 17, y + 2, x - 12.5, y);
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(x, y - 15, 2.5, 0, 'AIR INTAKE');
  }

  private addInstrument(x: number, y: number, properties: any): void {
    this.dxf.setActiveLayer('INSTRUMENTS');
    
    // Instrument circle
    this.dxf.drawCircle(x, y, 6);
    
    // Instrument symbol (cross)
    this.dxf.drawLine(x - 4, y, x + 4, y);
    this.dxf.drawLine(x, y - 4, x, y + 4);
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(x, y - 12, 2.5, 0, properties.tag || 'I-101');
  }

  private addGenericComponent(x: number, y: number, type: string, properties: any): void {
    this.dxf.setActiveLayer('EQUIPMENT');
    
    // Generic rectangle
    this.dxf.drawRect(x - 10, y - 7.5, x + 10, y + 7.5);
    
    // Tag
    this.dxf.setActiveLayer('TEXT');
    this.dxf.drawText(x, y - 15, 2.5, 0, type.toUpperCase());
  }

  private addConnection(connection: DiagramConnection, components: DiagramComponent[]): void {
    const fromComp = components.find(c => c.id === connection.from);
    const toComp = components.find(c => c.id === connection.to);
    
    if (!fromComp || !toComp) return;
    
    // Convert coordinates
    const fromX = (fromComp.position.x * 0.5) + 50;
    const fromY = 200 - (fromComp.position.y * 0.5);
    const toX = (toComp.position.x * 0.5) + 50;
    const toY = 200 - (toComp.position.y * 0.5);
    
    // Set layer based on connection type
    if (connection.type === 'piping') {
      this.dxf.setActiveLayer('PIPING');
    } else {
      this.dxf.setActiveLayer('EQUIPMENT');
    }
    
    // Add connection line
    this.dxf.drawLine(fromX + 15, fromY, toX - 15, toY);
    
    // Add flow arrow
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const arrowLength = 5;
    const arrowX = toX - 15 - arrowLength * Math.cos(angle);
    const arrowY = toY - arrowLength * Math.sin(angle);
    
    this.dxf.drawLine(arrowX, arrowY, toX - 15, toY);
    this.dxf.drawLine(arrowX + 2 * Math.cos(angle + Math.PI/6), arrowY + 2 * Math.sin(angle + Math.PI/6), toX - 15, toY);
    this.dxf.drawLine(arrowX + 2 * Math.cos(angle - Math.PI/6), arrowY + 2 * Math.sin(angle - Math.PI/6), toX - 15, toY);
  }

  private addDimensions(components: DiagramComponent[]): void {
    if (components.length === 0) return;
    
    this.dxf.setActiveLayer('DIMENSIONS');
    
    // Find bounding box
    const xs = components.map(c => (c.position.x * 0.5) + 50);
    const ys = components.map(c => 200 - (c.position.y * 0.5));
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    // Add overall dimensions
    const dimY = minY - 30;
    this.dxf.drawLine(minX, dimY, maxX, dimY);
    this.dxf.drawLine(minX, dimY - 5, minX, dimY + 5);
    this.dxf.drawLine(maxX, dimY - 5, maxX, dimY + 5);
    
    // Dimension text
    this.dxf.setActiveLayer('TEXT');
    const width = Math.round(maxX - minX);
    this.dxf.drawText((minX + maxX) / 2, dimY - 10, 2.5, 0, `${width} mm`);
  }
}
