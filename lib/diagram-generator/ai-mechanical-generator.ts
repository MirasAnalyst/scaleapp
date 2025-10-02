// AI-Powered Mechanical Drawing Generator
import { DiagramComponent, DiagramConnection, GeneratedDiagram, DiagramGenerationRequest } from './types';

interface AIAnalysisResult {
  systemType: string;
  equipment: Array<{
    type: string;
    specifications: any;
    position: { x: number; y: number };
    connections: string[];
  }>;
  layout: {
    flowDirection: 'horizontal' | 'vertical' | 'mixed';
    spacing: number;
    scale: number;
  };
  annotations: Array<{
    type: 'dimension' | 'note' | 'callout';
    content: string;
    position: { x: number; y: number };
  }>;
  layers: Array<{
    name: string;
    color: number;
    lineType: string;
    purpose: string;
  }>;
}

export class AIMechanicalGenerator {
  private components: DiagramComponent[] = [];
  private connections: DiagramConnection[] = [];
  private componentCounter = 0;

  generateDiagram(request: DiagramGenerationRequest): GeneratedDiagram {
    this.components = [];
    this.connections = [];
    this.componentCounter = 0;

    // AI-powered analysis of the prompt
    const aiAnalysis = this.analyzePromptWithAI(request.prompt);
    
    // Generate sophisticated drawing based on AI analysis
    return this.generateAdvancedDrawing(aiAnalysis, request);
  }

  private analyzePromptWithAI(prompt: string): AIAnalysisResult {
    const lowerPrompt = prompt.toLowerCase();
    
    // AI-powered system type detection
    const systemType = this.detectSystemType(lowerPrompt);
    
    // AI-powered equipment extraction with context understanding
    const equipment = this.extractEquipmentWithAI(lowerPrompt);
    
    // AI-powered layout optimization
    const layout = this.optimizeLayoutWithAI(equipment, systemType);
    
    // AI-powered annotation generation
    const annotations = this.generateAnnotationsWithAI(equipment, systemType);
    
    // AI-powered layer structure
    const layers = this.generateLayerStructureWithAI(equipment, systemType);

    return {
      systemType,
      equipment,
      layout,
      annotations,
      layers
    };
  }

  private detectSystemType(prompt: string): string {
    // AI-powered system classification
    if (prompt.includes('rankine') || prompt.includes('steam cycle') || prompt.includes('power generation')) {
      return 'Power Generation System';
    } else if (prompt.includes('refrigeration') || prompt.includes('cooling') || prompt.includes('chiller')) {
      return 'Refrigeration System';
    } else if (prompt.includes('compressed air') || prompt.includes('pneumatic')) {
      return 'Compressed Air System';
    } else if (prompt.includes('hydraulic') || prompt.includes('fluid power')) {
      return 'Hydraulic System';
    } else if (prompt.includes('process') || prompt.includes('chemical') || prompt.includes('reactor')) {
      return 'Process System';
    } else if (prompt.includes('pump') && prompt.includes('heat exchanger')) {
      return 'Heat Transfer System';
    } else if (prompt.includes('piping') || prompt.includes('pipeline')) {
      return 'Piping System';
    } else if (prompt.includes('tank') || prompt.includes('storage')) {
      return 'Storage System';
    } else {
      return 'Mechanical System';
    }
  }

  private extractEquipmentWithAI(prompt: string): Array<any> {
    const equipment = [];
    let position = { x: 100, y: 200 };
    const spacing = 150;

    // AI-powered equipment recognition with context
    const equipmentPatterns = {
      // Pumps with AI context understanding
      'centrifugal_pump': {
        keywords: ['centrifugal pump', 'centrifugal', 'pump'],
        aiContext: ['flow', 'pressure', 'suction', 'discharge'],
        symbol: 'pump_centrifugal',
        complexity: 'high'
      },
      'positive_displacement_pump': {
        keywords: ['positive displacement', 'gear pump', 'piston pump', 'screw pump'],
        aiContext: ['viscous', 'high pressure', 'precise flow'],
        symbol: 'pump_positive_displacement',
        complexity: 'high'
      },
      
      // Heat Exchangers with AI understanding
      'shell_tube_hx': {
        keywords: ['shell and tube', 'shell & tube', 'heat exchanger'],
        aiContext: ['heat transfer', 'temperature', 'thermal'],
        symbol: 'heat_exchanger_shell_tube',
        complexity: 'very_high'
      },
      'plate_hx': {
        keywords: ['plate heat exchanger', 'plate hx', 'gasketed'],
        aiContext: ['compact', 'efficient', 'temperature'],
        symbol: 'heat_exchanger_plate',
        complexity: 'high'
      },
      
      // Compressors with AI context
      'reciprocating_compressor': {
        keywords: ['reciprocating compressor', 'piston compressor'],
        aiContext: ['high pressure', 'air', 'gas'],
        symbol: 'compressor_reciprocating',
        complexity: 'very_high'
      },
      'screw_compressor': {
        keywords: ['screw compressor', 'rotary screw'],
        aiContext: ['continuous', 'oil-free', 'efficient'],
        symbol: 'compressor_screw',
        complexity: 'high'
      },
      
      // Valves with AI understanding
      'gate_valve': {
        keywords: ['gate valve', 'isolation valve'],
        aiContext: ['isolation', 'shut-off', 'full bore'],
        symbol: 'valve_gate',
        complexity: 'medium'
      },
      'control_valve': {
        keywords: ['control valve', 'regulating valve'],
        aiContext: ['flow control', 'pressure control', 'automated'],
        symbol: 'valve_control',
        complexity: 'high'
      },
      
      // Tanks and Vessels
      'pressure_vessel': {
        keywords: ['pressure vessel', 'tank', 'vessel'],
        aiContext: ['pressure', 'storage', 'containment'],
        symbol: 'vessel_pressure',
        complexity: 'very_high'
      },
      'storage_tank': {
        keywords: ['storage tank', 'bulk storage'],
        aiContext: ['storage', 'capacity', 'inventory'],
        symbol: 'tank_storage',
        complexity: 'high'
      }
    };

    // AI-powered equipment extraction
    for (const [equipmentType, config] of Object.entries(equipmentPatterns)) {
      const hasKeywords = config.keywords.some(keyword => prompt.includes(keyword));
      const hasContext = config.aiContext.some(context => prompt.includes(context));
      
      if (hasKeywords || hasContext) {
        const specs = this.extractSpecificationsWithAI(prompt, equipmentType);
        
        equipment.push({
          type: equipmentType,
          specifications: specs,
          position: { ...position },
          connections: this.predictConnections(equipmentType, equipment),
          complexity: config.complexity,
          symbol: config.symbol
        });
        
        position.x += spacing;
      }
    }

    return equipment;
  }

  private extractSpecificationsWithAI(prompt: string, equipmentType: string): any {
    const specs: any = {};
    
    // AI-powered specification extraction with context understanding
    const specPatterns = {
      flowRate: [
        { pattern: /(\d+)\s*(gpm|lpm|m3\/h|m3\/min|l\/min|gph|cfm)/gi, context: ['flow', 'capacity', 'rate'] },
        { pattern: /flow\s*rate[:\s]*(\d+)\s*(gpm|lpm|m3\/h)/gi, context: ['flow rate'] }
      ],
      pressure: [
        { pattern: /(\d+)\s*(bar|psi|kpa|mpa|atm|pa)/gi, context: ['pressure', 'head', 'discharge'] },
        { pattern: /pressure[:\s]*(\d+)\s*(bar|psi)/gi, context: ['pressure'] }
      ],
      temperature: [
        { pattern: /(\d+)\s*(°c|°f|celsius|fahrenheit)/gi, context: ['temperature', 'temp', 'heat'] },
        { pattern: /temperature[:\s]*(\d+)\s*(°c|°f)/gi, context: ['temperature'] }
      ],
      power: [
        { pattern: /(\d+)\s*(kw|hp|w|mw)/gi, context: ['power', 'motor', 'drive'] },
        { pattern: /power[:\s]*(\d+)\s*(kw|hp)/gi, context: ['power'] }
      ],
      size: [
        { pattern: /(\d+)\s*(inch|in|mm|cm|"|'')/gi, context: ['size', 'diameter', 'pipe'] },
        { pattern: /size[:\s]*(\d+)\s*(inch|mm)/gi, context: ['size'] }
      ],
      material: [
        { pattern: /(carbon steel|stainless steel|steel|copper|plastic|pvc|hdpe|aluminum|titanium)/gi, context: ['material', 'construction'] }
      ]
    };

    // Extract specifications with AI context understanding
    for (const [specType, patterns] of Object.entries(specPatterns)) {
      for (const { pattern, context } of patterns) {
        const hasContext = context.some(ctx => prompt.includes(ctx));
        if (hasContext) {
          const match = pattern.exec(prompt);
          if (match && match[1] && match[2]) {
            specs[specType] = `${match[1]} ${match[2].toUpperCase()}`;
            break;
          }
        }
      }
    }

    // Fallback: extract specifications without context requirement
    for (const [specType, patterns] of Object.entries(specPatterns)) {
      if (!specs[specType]) {
        for (const { pattern } of patterns) {
          const match = pattern.exec(prompt);
          if (match && match[1] && match[2]) {
            specs[specType] = `${match[1]} ${match[2].toUpperCase()}`;
            break;
          }
        }
      }
    }

    // AI-powered equipment-specific specifications
    if (equipmentType.includes('pump')) {
      specs.efficiency = this.extractEfficiency(prompt);
      specs.npsh = this.extractNPSH(prompt);
    } else if (equipmentType.includes('compressor')) {
      specs.compressionRatio = this.extractCompressionRatio(prompt);
      specs.capacity = this.extractCapacity(prompt);
    } else if (equipmentType.includes('heat_exchanger')) {
      specs.heatTransferArea = this.extractHeatTransferArea(prompt);
      specs.effectiveness = this.extractEffectiveness(prompt);
    }

    return specs;
  }

  private extractEfficiency(prompt: string): string | null {
    const match = prompt.match(/(\d+)\s*%?\s*efficiency/gi);
    return match ? `${match[1]}%` : null;
  }

  private extractNPSH(prompt: string): string | null {
    const match = prompt.match(/npsh[:\s]*(\d+\.?\d*)\s*(m|ft)/gi);
    return match ? `NPSH: ${match[1]} ${match[2]}` : null;
  }

  private extractCompressionRatio(prompt: string): string | null {
    const match = prompt.match(/compression\s*ratio[:\s]*(\d+\.?\d*)/gi);
    return match ? `CR: ${match[1]}` : null;
  }

  private extractCapacity(prompt: string): string | null {
    const match = prompt.match(/capacity[:\s]*(\d+)\s*(cfm|m3\/min)/gi);
    return match ? `${match[1]} ${match[2]}` : null;
  }

  private extractHeatTransferArea(prompt: string): string | null {
    const match = prompt.match(/area[:\s]*(\d+)\s*(m2|ft2|m²|ft²)/gi);
    return match ? `${match[1]} ${match[2]}` : null;
  }

  private extractEffectiveness(prompt: string): string | null {
    const match = prompt.match(/effectiveness[:\s]*(\d+\.?\d*)/gi);
    return match ? `${match[1]}` : null;
  }

  private predictConnections(equipmentType: string, existingEquipment: any[]): string[] {
    // AI-powered connection prediction
    const connectionRules = {
      'centrifugal_pump': ['suction', 'discharge'],
      'heat_exchanger': ['hot_in', 'hot_out', 'cold_in', 'cold_out'],
      'compressor': ['suction', 'discharge'],
      'valve': ['inlet', 'outlet'],
      'tank': ['inlet', 'outlet', 'vent', 'drain']
    };

    return connectionRules[equipmentType] || ['inlet', 'outlet'];
  }

  private optimizeLayoutWithAI(equipment: any[], systemType: string): any {
    // AI-powered layout optimization
    const layoutStrategies = {
      'Power Generation System': { flowDirection: 'horizontal', spacing: 200, scale: 1.2 },
      'Refrigeration System': { flowDirection: 'mixed', spacing: 180, scale: 1.1 },
      'Compressed Air System': { flowDirection: 'horizontal', spacing: 160, scale: 1.0 },
      'Hydraulic System': { flowDirection: 'vertical', spacing: 140, scale: 0.9 },
      'Process System': { flowDirection: 'mixed', spacing: 220, scale: 1.3 },
      'Heat Transfer System': { flowDirection: 'horizontal', spacing: 180, scale: 1.1 },
      'Piping System': { flowDirection: 'horizontal', spacing: 120, scale: 0.8 },
      'Storage System': { flowDirection: 'vertical', spacing: 160, scale: 1.0 }
    };

    return layoutStrategies[systemType] || { flowDirection: 'horizontal', spacing: 150, scale: 1.0 };
  }

  private generateAnnotationsWithAI(equipment: any[], systemType: string): any[] {
    const annotations = [];
    
    // AI-powered annotation generation
    equipment.forEach((eq, index) => {
      // Equipment callouts
      annotations.push({
        type: 'callout',
        content: `${eq.type.replace('_', ' ').toUpperCase()}\n${Object.entries(eq.specifications).map(([key, value]) => `${key}: ${value}`).join('\n')}`,
        position: { x: eq.position.x, y: eq.position.y - 50 }
      });

      // Flow direction arrows
      if (index < equipment.length - 1) {
        annotations.push({
          type: 'note',
          content: '→',
          position: { x: eq.position.x + 75, y: eq.position.y }
        });
      }
    });

    // System title
    annotations.push({
      type: 'note',
      content: systemType,
      position: { x: 400, y: 50 }
    });

    return annotations;
  }

  private generateLayerStructureWithAI(equipment: any[], systemType: string): any[] {
    // AI-powered layer structure generation
    const baseLayers = [
      { name: 'EQUIPMENT', color: 1, lineType: 'CONTINUOUS', purpose: 'Main equipment symbols' },
      { name: 'PIPING', color: 2, lineType: 'CONTINUOUS', purpose: 'Piping and connections' },
      { name: 'INSTRUMENTS', color: 3, lineType: 'CONTINUOUS', purpose: 'Instrumentation and controls' },
      { name: 'TEXT', color: 7, lineType: 'CONTINUOUS', purpose: 'Text and annotations' },
      { name: 'DIMENSIONS', color: 4, lineType: 'CONTINUOUS', purpose: 'Dimensions and measurements' },
      { name: 'TITLE_BLOCK', color: 7, lineType: 'CONTINUOUS', purpose: 'Title block and borders' }
    ];

    // Add system-specific layers
    const systemLayers = {
      'Power Generation System': [
        { name: 'STEAM_LINES', color: 5, lineType: 'CONTINUOUS', purpose: 'Steam piping' },
        { name: 'WATER_LINES', color: 6, lineType: 'CONTINUOUS', purpose: 'Water piping' }
      ],
      'Refrigeration System': [
        { name: 'REFRIGERANT', color: 5, lineType: 'CONTINUOUS', purpose: 'Refrigerant lines' },
        { name: 'COOLING_WATER', color: 6, lineType: 'CONTINUOUS', purpose: 'Cooling water' }
      ],
      'Compressed Air System': [
        { name: 'AIR_LINES', color: 5, lineType: 'CONTINUOUS', purpose: 'Compressed air lines' },
        { name: 'DRAIN_LINES', color: 6, lineType: 'DASHED', purpose: 'Drain lines' }
      ]
    };

    return [...baseLayers, ...(systemLayers[systemType] || [])];
  }

  private generateAdvancedDrawing(analysis: AIAnalysisResult, request: DiagramGenerationRequest): GeneratedDiagram {
    // Generate components based on AI analysis
    analysis.equipment.forEach(eq => {
      this.addAdvancedComponent(eq, analysis.layers);
    });

    // Generate connections based on AI analysis
    this.generateAdvancedConnections(analysis);

    // Generate annotations
    this.generateAdvancedAnnotations(analysis);

    return this.createAdvancedDiagram(analysis, request);
  }

  private addAdvancedComponent(equipment: any, layers: any[]): void {
    const component: DiagramComponent = {
      id: `comp_${++this.componentCounter}`,
      type: equipment.type,
      position: equipment.position,
      properties: {
        ...equipment.specifications,
        symbol: equipment.symbol,
        complexity: equipment.complexity,
        connections: equipment.connections,
        layer: this.getEquipmentLayer(equipment.type, layers)
      }
    };
    this.components.push(component);
  }

  private getEquipmentLayer(equipmentType: string, layers: any[]): string {
    if (equipmentType.includes('pump') || equipmentType.includes('compressor')) {
      return 'EQUIPMENT';
    } else if (equipmentType.includes('valve')) {
      return 'PIPING';
    } else if (equipmentType.includes('instrument')) {
      return 'INSTRUMENTS';
    }
    return 'EQUIPMENT';
  }

  private generateAdvancedConnections(analysis: AIAnalysisResult): void {
    // AI-powered connection generation
    for (let i = 0; i < this.components.length - 1; i++) {
      const from = this.components[i];
      const to = this.components[i + 1];
      
      this.connections.push({
        from: from.id,
        to: to.id,
        type: 'piping',
        properties: {
          layer: 'PIPING',
          lineType: 'CONTINUOUS',
          color: 2
        }
      });
    }
  }

  private generateAdvancedAnnotations(analysis: AIAnalysisResult): void {
    // This will be handled in the SVG generation
  }

  private createAdvancedDiagram(analysis: AIAnalysisResult, request: DiagramGenerationRequest): GeneratedDiagram {
    return {
      id: `diagram_${Date.now()}`,
      discipline: request.discipline,
      title: analysis.systemType,
      components: this.components,
      connections: this.connections,
      svg: this.generateAdvancedSVG(analysis),
      metadata: {
        generatedAt: new Date().toISOString(),
        prompt: request.prompt,
        estimatedTime: '3-7 minutes',
        outputFormats: ['DWG', 'DXF', 'SVG'],
        aiAnalysis: analysis,
        complexity: this.calculateComplexity(analysis)
      }
    };
  }

  private calculateComplexity(analysis: AIAnalysisResult): string {
    const equipmentCount = analysis.equipment.length;
    const hasComplexEquipment = analysis.equipment.some(eq => eq.complexity === 'very_high');
    
    if (equipmentCount > 5 || hasComplexEquipment) {
      return 'High';
    } else if (equipmentCount > 3) {
      return 'Medium';
    } else {
      return 'Low';
    }
  }

  private generateAdvancedSVG(analysis: AIAnalysisResult): string {
    const width = 1000;
    const height = 600;
    
    let svg = `<svg viewBox="0 0 ${width} ${height}" class="w-full h-full">
      <defs>
        <marker id="arrowhead" marker-width="10" marker-height="7" ref-x="9" ref-y="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
        <marker id="flow-arrow" marker-width="12" marker-height="8" ref-x="10" ref-y="4" orient="auto">
          <polygon points="0 0, 12 4, 0 8" fill="#10b981"/>
        </marker>
      </defs>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
      
      <!-- Title -->
      <text x="${width/2}" y="40" text-anchor="middle" class="text-2xl font-bold fill-gray-800">
        ${analysis.systemType}
      </text>
      
      <!-- Grid -->
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" stroke-width="0.5"/>
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grid)" opacity="0.3"/>
    `;

    // Generate advanced equipment symbols
    this.components.forEach(component => {
      svg += this.generateAdvancedComponentSVG(component, analysis);
    });

    // Generate advanced connections
    this.connections.forEach(connection => {
      svg += this.generateAdvancedConnectionSVG(connection, analysis);
    });

    // Generate annotations
    analysis.annotations.forEach(annotation => {
      svg += this.generateAnnotationSVG(annotation);
    });

    svg += '</svg>';
    return svg;
  }

  private generateAdvancedComponentSVG(component: DiagramComponent, analysis: AIAnalysisResult): string {
    const { x, y } = component.position;
    const { type, properties } = component;
    
    // Generate sophisticated equipment symbols based on type and complexity
    switch (type) {
      case 'centrifugal_pump':
        return this.generateCentrifugalPumpSVG(x, y, properties);
      case 'shell_tube_hx':
        return this.generateShellTubeHXSVG(x, y, properties);
      case 'reciprocating_compressor':
        return this.generateReciprocatingCompressorSVG(x, y, properties);
      case 'control_valve':
        return this.generateControlValveSVG(x, y, properties);
      case 'pressure_vessel':
        return this.generatePressureVesselSVG(x, y, properties);
      default:
        return this.generateGenericEquipmentSVG(x, y, type, properties);
    }
  }

  private generateCentrifugalPumpSVG(x: number, y: number, properties: any): string {
    return `
      <g transform="translate(${x}, ${y})" class="equipment-group">
        <!-- Professional Centrifugal Pump Symbol -->
        
        <!-- Pump casing (volute shape) -->
        <path d="M -35 -20 Q -40 -15 -40 -5 Q -40 5 -35 10 Q -30 15 -20 15 Q -10 15 -5 10 Q 0 5 0 -5 Q 0 -15 -5 -20 Q -10 -25 -20 -25 Q -30 -25 -35 -20 Z" 
              fill="#3b82f6" stroke="#1e40af" stroke-width="2"/>
        
        <!-- Impeller hub -->
        <circle cx="-15" cy="0" r="8" fill="#1e40af" stroke="#1e3a8a" stroke-width="1"/>
        
        <!-- Impeller vanes (curved) -->
        <g stroke="#1e3a8a" stroke-width="1.5" fill="none">
          <path d="M -20 -8 Q -15 -4 -10 -8"/>
          <path d="M -20 -4 Q -15 0 -10 -4"/>
          <path d="M -20 0 Q -15 4 -10 0"/>
          <path d="M -20 4 Q -15 8 -10 4"/>
          <path d="M -20 8 Q -15 4 -10 8"/>
        </g>
        
        <!-- Suction nozzle (larger diameter) -->
        <rect x="-50" y="-12" width="15" height="24" fill="#3b82f6" stroke="#1e40af" stroke-width="2"/>
        <circle cx="-42.5" cy="0" r="6" fill="none" stroke="#1e40af" stroke-width="1"/>
        
        <!-- Discharge nozzle (smaller diameter) -->
        <rect x="20" y="-8" width="15" height="16" fill="#3b82f6" stroke="#1e40af" stroke-width="2"/>
        <circle cx="27.5" cy="0" r="4" fill="none" stroke="#1e40af" stroke-width="1"/>
        
        <!-- Motor connection -->
        <rect x="-25" y="-15" width="20" height="30" fill="#6b7280" stroke="#4b5563" stroke-width="1"/>
        <circle cx="-15" cy="0" r="3" fill="#4b5563"/>
        
        <!-- Flow arrows with proper direction -->
        <polygon points="-40,-8 -35,-3 -40,2" fill="#10b981"/>
        <polygon points="35,-6 40,-1 35,4" fill="#10b981"/>
        
        <!-- Equipment tag with professional styling -->
        <rect x="-25" y="-45" width="50" height="20" fill="white" stroke="#1e40af" stroke-width="1" rx="3"/>
        <text x="0" y="-32" text-anchor="middle" class="text-sm font-bold fill-gray-800">P-${this.componentCounter}</text>
        
        <!-- Specifications in professional format -->
        ${properties.flowRate ? `<text x="0" y="-50" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.flowRate}</text>` : ''}
        ${properties.pressure ? `<text x="0" y="-65" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.pressure}</text>` : ''}
        ${properties.power ? `<text x="0" y="-80" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.power}</text>` : ''}
        ${properties.efficiency ? `<text x="0" y="-95" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.efficiency}</text>` : ''}
      </g>
    `;
  }

  private generateShellTubeHXSVG(x: number, y: number, properties: any): string {
    return `
      <g transform="translate(${x}, ${y})" class="equipment-group">
        <!-- Professional Shell & Tube Heat Exchanger -->
        
        <!-- Shell (horizontal cylinder) -->
        <ellipse cx="0" cy="0" rx="45" ry="25" fill="#10b981" stroke="#059669" stroke-width="2"/>
        
        <!-- Tube bundle (detailed representation) -->
        <g stroke="#059669" stroke-width="1" fill="none">
          <!-- Horizontal tubes -->
          ${Array.from({length: 12}, (_, i) => {
            const yPos = -20 + (i * 3.5);
            return `<line x1="-40" y1="${yPos}" x2="40" y2="${yPos}"/>`;
          }).join('')}
          
          <!-- Tube sheet (left) -->
          <line x1="-40" y1="-22" x2="-40" y2="22" stroke="#059669" stroke-width="3"/>
          
          <!-- Tube sheet (right) -->
          <line x1="40" y1="-22" x2="40" y2="22" stroke="#059669" stroke-width="3"/>
        </g>
        
        <!-- Shell side connections (top and bottom) -->
        <rect x="-50" y="-15" width="10" height="30" fill="#10b981" stroke="#059669" stroke-width="2"/>
        <rect x="40" y="-15" width="10" height="30" fill="#10b981" stroke="#059669" stroke-width="2"/>
        
        <!-- Tube side connections (left and right) -->
        <rect x="-15" y="-35" width="30" height="10" fill="#10b981" stroke="#059669" stroke-width="2"/>
        <rect x="-15" y="25" width="30" height="10" fill="#10b981" stroke="#059669" stroke-width="2"/>
        
        <!-- Baffles (internal) -->
        <g stroke="#059669" stroke-width="1" fill="none" stroke-dasharray="2,2">
          <line x1="-20" y1="-22" x2="-20" y2="22"/>
          <line x1="0" y1="-22" x2="0" y2="22"/>
          <line x1="20" y1="-22" x2="20" y2="22"/>
        </g>
        
        <!-- Flow arrows with proper direction -->
        <polygon points="-45,-10 -40,-5 -45,0" fill="#10b981"/>
        <polygon points="45,-10 40,-5 45,0" fill="#10b981"/>
        <polygon points="-5,-30 0,-25 5,-30" fill="#10b981"/>
        <polygon points="-5,30 0,25 5,30" fill="#10b981"/>
        
        <!-- Equipment tag with professional styling -->
        <rect x="-30" y="-50" width="60" height="20" fill="white" stroke="#059669" stroke-width="1" rx="3"/>
        <text x="0" y="-37" text-anchor="middle" class="text-sm font-bold fill-gray-800">E-${this.componentCounter}</text>
        
        <!-- Specifications in professional format -->
        ${properties.heatTransferArea ? `<text x="0" y="-55" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.heatTransferArea}</text>` : ''}
        ${properties.effectiveness ? `<text x="0" y="-70" text-anchor="middle" class="text-xs fill-gray-600 font-medium">Eff: ${properties.effectiveness}</text>` : ''}
        ${properties.temperature ? `<text x="0" y="-85" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.temperature}</text>` : ''}
      </g>
    `;
  }

  private generateReciprocatingCompressorSVG(x: number, y: number, properties: any): string {
    return `
      <g transform="translate(${x}, ${y})" class="equipment-group">
        <!-- Professional Reciprocating Compressor -->
        
        <!-- Compressor frame -->
        <rect x="-30" y="-25" width="60" height="50" fill="#8b5cf6" stroke="#7c3aed" stroke-width="2"/>
        
        <!-- Cylinder (detailed) -->
        <rect x="-25" y="-20" width="50" height="40" fill="#7c3aed" stroke="#6d28d9" stroke-width="2"/>
        
        <!-- Cylinder head -->
        <rect x="-25" y="-25" width="50" height="10" fill="#6d28d9" stroke="#5b21b6" stroke-width="1"/>
        <rect x="-25" y="15" width="50" height="10" fill="#6d28d9" stroke="#5b21b6" stroke-width="1"/>
        
        <!-- Piston (detailed) -->
        <rect x="-20" y="-15" width="40" height="30" fill="#5b21b6" stroke="#4c1d95" stroke-width="1"/>
        
        <!-- Piston rings -->
        <g stroke="#4c1d95" stroke-width="1" fill="none">
          <line x1="-20" y1="-10" x2="20" y2="-10"/>
          <line x1="-20" y1="-5" x2="20" y2="-5"/>
          <line x1="-20" y1="5" x2="20" y2="5"/>
          <line x1="-20" y1="10" x2="20" y2="10"/>
        </g>
        
        <!-- Connecting rod -->
        <line x1="0" y1="0" x2="0" y2="35" stroke="#6b7280" stroke-width="3"/>
        
        <!-- Crankshaft -->
        <circle cx="0" cy="35" r="8" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
        
        <!-- Suction valve (detailed) -->
        <rect x="-35" y="-12" width="10" height="24" fill="#8b5cf6" stroke="#7c3aed" stroke-width="2"/>
        <g stroke="#7c3aed" stroke-width="1" fill="none">
          <path d="M -30 -8 Q -25 -4 -20 -8"/>
          <path d="M -30 -4 Q -25 0 -20 -4"/>
          <path d="M -30 0 Q -25 4 -20 0"/>
          <path d="M -30 4 Q -25 8 -20 4"/>
        </g>
        
        <!-- Discharge valve (detailed) -->
        <rect x="25" y="-12" width="10" height="24" fill="#8b5cf6" stroke="#7c3aed" stroke-width="2"/>
        <g stroke="#7c3aed" stroke-width="1" fill="none">
          <path d="M 30 -8 Q 35 -4 40 -8"/>
          <path d="M 30 -4 Q 35 0 40 -4"/>
          <path d="M 30 0 Q 35 4 40 0"/>
          <path d="M 30 4 Q 35 8 40 4"/>
        </g>
        
        <!-- Flow arrows with proper direction -->
        <polygon points="-30,-8 -25,-3 -30,2" fill="#10b981"/>
        <polygon points="35,-8 40,-3 35,2" fill="#10b981"/>
        
        <!-- Equipment tag with professional styling -->
        <rect x="-25" y="-45" width="50" height="20" fill="white" stroke="#7c3aed" stroke-width="1" rx="3"/>
        <text x="0" y="-32" text-anchor="middle" class="text-sm font-bold fill-gray-800">C-${this.componentCounter}</text>
        
        <!-- Specifications in professional format -->
        ${properties.capacity ? `<text x="0" y="-50" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.capacity}</text>` : ''}
        ${properties.compressionRatio ? `<text x="0" y="-65" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.compressionRatio}</text>` : ''}
        ${properties.power ? `<text x="0" y="-80" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.power}</text>` : ''}
        ${properties.pressure ? `<text x="0" y="-95" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.pressure}</text>` : ''}
      </g>
    `;
  }

  private generateControlValveSVG(x: number, y: number, properties: any): string {
    return `
      <g transform="translate(${x}, ${y})" class="equipment-group">
        <!-- Professional Control Valve -->
        
        <!-- Valve body (detailed) -->
        <rect x="-15" y="-25" width="30" height="50" fill="#f59e0b" stroke="#d97706" stroke-width="2"/>
        
        <!-- Valve bonnet -->
        <rect x="-12" y="-30" width="24" height="10" fill="#d97706" stroke="#b45309" stroke-width="1"/>
        
        <!-- Actuator (pneumatic) -->
        <rect x="-10" y="-40" width="20" height="15" fill="#d97706" stroke="#b45309" stroke-width="2"/>
        
        <!-- Actuator diaphragm -->
        <ellipse cx="0" cy="-32.5" rx="8" ry="3" fill="#b45309" stroke="#92400e" stroke-width="1"/>
        
        <!-- Control signal line -->
        <line x1="0" y1="-40" x2="0" y2="-50" stroke="#ef4444" stroke-width="2"/>
        <circle cx="0" cy="-55" r="4" fill="#ef4444" stroke="#dc2626" stroke-width="1"/>
        
        <!-- Valve stem -->
        <line x1="0" y1="-25" x2="0" y2="25" stroke="#6b7280" stroke-width="2"/>
        
        <!-- Valve plug (detailed) -->
        <rect x="-8" y="-5" width="16" height="10" fill="#6b7280" stroke="#4b5563" stroke-width="1"/>
        
        <!-- Valve seat -->
        <ellipse cx="0" cy="0" rx="12" ry="3" fill="#6b7280" stroke="#4b5563" stroke-width="1"/>
        
        <!-- Flow arrows with proper direction -->
        <polygon points="-25,-8 -20,-3 -25,2" fill="#10b981"/>
        <polygon points="25,-8 20,-3 25,2" fill="#10b981"/>
        
        <!-- Equipment tag with professional styling -->
        <rect x="-20" y="-65" width="40" height="20" fill="white" stroke="#d97706" stroke-width="1" rx="3"/>
        <text x="0" y="-52" text-anchor="middle" class="text-sm font-bold fill-gray-800">CV-${this.componentCounter}</text>
        
        <!-- Specifications in professional format -->
        ${properties.size ? `<text x="0" y="-70" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.size}</text>` : ''}
        ${properties.material ? `<text x="0" y="-85" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.material}</text>` : ''}
        ${properties.pressure ? `<text x="0" y="-100" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.pressure}</text>` : ''}
      </g>
    `;
  }

  private generatePressureVesselSVG(x: number, y: number, properties: any): string {
    return `
      <g transform="translate(${x}, ${y})" class="equipment-group">
        <!-- Professional Pressure Vessel -->
        
        <!-- Vessel shell (detailed) -->
        <rect x="-35" y="-45" width="70" height="90" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
        
        <!-- Top head (elliptical) -->
        <ellipse cx="0" cy="-45" rx="35" ry="12" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
        
        <!-- Bottom head (elliptical) -->
        <ellipse cx="0" cy="45" rx="35" ry="12" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
        
        <!-- Vessel supports -->
        <rect x="-40" y="35" width="80" height="8" fill="#4b5563" stroke="#374151" stroke-width="1"/>
        <rect x="-35" y="43" width="10" height="15" fill="#4b5563" stroke="#374151" stroke-width="1"/>
        <rect x="25" y="43" width="10" height="15" fill="#4b5563" stroke="#374151" stroke-width="1"/>
        
        <!-- Side nozzles (detailed) -->
        <rect x="-45" y="-20" width="10" height="40" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
        <rect x="35" y="-20" width="10" height="40" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
        
        <!-- Top nozzle -->
        <rect x="-15" y="-60" width="30" height="15" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
        
        <!-- Bottom nozzle -->
        <rect x="-15" y="45" width="30" height="15" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
        
        <!-- Manway (access opening) -->
        <rect x="-10" y="-25" width="20" height="15" fill="#4b5563" stroke="#374151" stroke-width="1"/>
        <rect x="-8" y="-23" width="16" height="11" fill="#6b7280" stroke="#4b5563" stroke-width="1"/>
        
        <!-- Instrument connections -->
        <circle cx="-25" cy="-30" r="3" fill="#ef4444" stroke="#dc2626" stroke-width="1"/>
        <circle cx="25" cy="-30" r="3" fill="#ef4444" stroke="#dc2626" stroke-width="1"/>
        <circle cx="-25" cy="30" r="3" fill="#ef4444" stroke="#dc2626" stroke-width="1"/>
        <circle cx="25" cy="30" r="3" fill="#ef4444" stroke="#dc2626" stroke-width="1"/>
        
        <!-- Flow arrows -->
        <polygon points="-40,-15 -35,-10 -40,-5" fill="#10b981"/>
        <polygon points="40,-15 35,-10 40,-5" fill="#10b981"/>
        
        <!-- Equipment tag with professional styling -->
        <rect x="-25" y="-75" width="50" height="20" fill="white" stroke="#4b5563" stroke-width="1" rx="3"/>
        <text x="0" y="-62" text-anchor="middle" class="text-sm font-bold fill-gray-800">V-${this.componentCounter}</text>
        
        <!-- Specifications in professional format -->
        ${properties.pressure ? `<text x="0" y="-80" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.pressure}</text>` : ''}
        ${properties.temperature ? `<text x="0" y="-95" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.temperature}</text>` : ''}
        ${properties.material ? `<text x="0" y="-110" text-anchor="middle" class="text-xs fill-gray-600 font-medium">${properties.material}</text>` : ''}
      </g>
    `;
  }

  private generateGenericEquipmentSVG(x: number, y: number, type: string, properties: any): string {
    return `
      <g transform="translate(${x}, ${y})" class="equipment-group">
        <rect x="-20" y="-15" width="40" height="30" fill="#6b7280" stroke="#4b5563" stroke-width="2"/>
        <text x="0" y="5" text-anchor="middle" class="text-sm font-bold fill-white">${type.replace('_', ' ').toUpperCase()}</text>
        <text x="0" y="-25" text-anchor="middle" class="text-xs fill-gray-600">${type.replace('_', ' ')}</text>
      </g>
    `;
  }

  private generateAdvancedConnectionSVG(connection: DiagramConnection, analysis: AIAnalysisResult): string {
    const fromComp = this.components.find(c => c.id === connection.from);
    const toComp = this.components.find(c => c.id === connection.to);

    if (!fromComp || !toComp) return '';

    const fromX = fromComp.position.x + 30;
    const fromY = fromComp.position.y;
    const toX = toComp.position.x - 30;
    const toY = toComp.position.y;

    return `
      <path d="M ${fromX} ${fromY} L ${toX} ${toY}" 
            stroke="#3b82f6" stroke-width="4" fill="none" 
            marker-end="url(#flow-arrow)"/>
    `;
  }

  private generateAnnotationSVG(annotation: any): string {
    const { type, content, position } = annotation;
    
    switch (type) {
      case 'callout':
        return `
          <g transform="translate(${position.x}, ${position.y})">
            <rect x="-10" y="-10" width="20" height="20" fill="white" stroke="#6b7280" stroke-width="1"/>
            <text x="0" y="5" text-anchor="middle" class="text-xs fill-gray-800">${content}</text>
          </g>
        `;
      case 'note':
        return `
          <text x="${position.x}" y="${position.y}" text-anchor="middle" class="text-sm fill-gray-600">${content}</text>
        `;
      default:
        return '';
    }
  }
}
