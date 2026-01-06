export type TemplateMode = 'consensus' | 'orchestrated' | 'iterative' | 'consult' | 'discuss';

export type TemplateOutputFormat = 'markdown' | 'json' | 'both';

export interface TemplateAgentConfig {
  name: string;
  role?: string;
  description?: string;
  systemPrompt: string;
  model?: string;
  provider?: string;
  temperature?: number;
}

export interface Template {
  name: string;
  description: string;
  mode: TemplateMode;
  agents?: (TemplateAgentConfig | string)[];
  task: string;
  personas?: string[];
  outputFormat?: TemplateOutputFormat;
  chunkSize?: number;
  maxRoundsPerChunk?: number;
  [key: string]: any; // Allow unknown fields (AC #2 implies they are ignored, typescript should allow them if we type it loosely or just use the interface for knowns)
}
