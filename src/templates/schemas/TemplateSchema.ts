import { z } from 'zod';

export const TemplateModeSchema = z.enum(['consensus', 'orchestrated', 'iterative', 'consult', 'discuss'] as const);

export const TemplateOutputFormatSchema = z.enum(['markdown', 'json', 'both'] as const);

export const TemplateAgentConfigSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  role: z.string().optional(),
  description: z.string().optional(),
  systemPrompt: z.string().min(1, "System prompt is required"),
  model: z.string().optional(),
  provider: z.string().optional(),
  temperature: z.number().optional()
});

export const TemplateAgentSchema = z.union([
  TemplateAgentConfigSchema,
  z.string().min(1, "Persona reference cannot be empty")
]);

export const TemplateSchema = z.object({
  name: z.string()
    .regex(/^[a-z0-9-]+$/, "Name must be kebab-case (lowercase letters, numbers, hyphens)"),
  description: z.string().min(1, "Description is required"),
  mode: TemplateModeSchema,
  agents: z.array(TemplateAgentSchema).optional(),
  personas: z.array(z.string().min(1, "Persona name cannot be empty")).optional(),
  task: z.string().min(1, "Task prompt is required"),
  outputFormat: TemplateOutputFormatSchema.optional(),
  chunkSize: z.number().optional(),
  maxRoundsPerChunk: z.number().optional()
}).passthrough().refine(data => {
  const hasAgents = data.agents && data.agents.length > 0;
  const hasPersonas = data.personas && data.personas.length > 0;
  return hasAgents || hasPersonas;
}, {
  message: "At least one agent or persona must be specified",
  path: ["agents"]
});
