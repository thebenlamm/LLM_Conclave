import { ZodError, ZodIssueCode } from 'zod';
import { TemplateSchema } from './schemas/TemplateSchema';
import { Template } from './types';

export function formatValidationError(error: ZodError, sourceName?: string): string {
  return error.issues.map((err) => {
    const path = err.path.join('.') || 'root';
    const location = sourceName ? ` in '${sourceName}'` : '';
    let detail = err.message;
    if (detail.startsWith('Invalid enum value. ')) {
      detail = detail.replace(/^Invalid enum value\. /, '');
    }
    const message = `Validation error: Invalid value at '${path}': ${detail}${location}`;
    
    // NFR16: Suggested fix generation
    let suggestion = '';
    if (err.code === ZodIssueCode.invalid_value && path === 'mode') {
      suggestion = ' (Allowed modes: consensus, orchestrated, iterative, consult, discuss)';
    } else if (err.code === ZodIssueCode.invalid_format && path === 'name') {
      suggestion = ' (Use kebab-case: lowercase letters, numbers, and hyphens only)';
    } else if (path === 'agents') {
      suggestion = ' (Ensure at least one agent or persona is defined)';
    }

    return `${message}${suggestion}`;
  }).join('\n');
}

export function validateTemplate(data: unknown, sourceName?: string): Template {
  const result = TemplateSchema.safeParse(data);
  
  if (!result.success) {
    throw new Error(`Template validation failed:\n${formatValidationError(result.error, sourceName)}`);
  }
  
  return result.data as Template;
}

export function validateTemplateSafe(data: unknown) {
  return TemplateSchema.safeParse(data);
}
