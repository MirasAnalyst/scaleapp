// Types for dynamic diagram generation
export interface DiagramComponent {
  id: string;
  type: string;
  position: { x: number; y: number };
  properties: Record<string, any>;
  connections?: string[];
}

export interface DiagramConnection {
  from: string;
  to: string;
  type: 'power' | 'signal' | 'piping' | 'structural';
  properties: Record<string, any>;
}

export interface GeneratedDiagram {
  id: string;
  discipline: 'mechanical' | 'electrical' | 'civil';
  title: string;
  components: DiagramComponent[];
  connections: DiagramConnection[];
  svg: string;
  metadata: {
    generatedAt: string;
    prompt: string;
    estimatedTime: string;
    outputFormats: string[];
  };
}

export interface DiagramGenerationRequest {
  discipline: 'mechanical' | 'electrical' | 'civil';
  prompt: string;
  options?: {
    includeDimensions?: boolean;
    includeLabels?: boolean;
    style?: 'minimal' | 'detailed' | 'professional';
  };
}

export interface DiagramGenerationResponse {
  success: boolean;
  diagram?: GeneratedDiagram;
  error?: string;
  message: string;
}
