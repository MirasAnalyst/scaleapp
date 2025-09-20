export type Discipline = 'mechanical' | 'electrical' | 'civil';

export interface DisciplineCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  bullets: string[];
  href: string;
}

export interface PromptExample {
  title: string;
  prompt: string;
  discipline: Discipline;
}

export interface GenerationRequest {
  discipline: Discipline;
  prompt: string;
}

export interface GenerationResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: any;
}
