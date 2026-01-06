import { validateTemplate } from '../TemplateValidator';
import { Template } from '../types';

describe('Template Validation', () => {
  const validTemplate: any = {
    name: 'test-template',
    description: 'A valid test template',
    mode: 'consensus',
    agents: ['security', 'architecture'],
    task: 'Review the code',
    outputFormat: 'markdown'
  };

  test('validates a correct template', () => {
    const result = validateTemplate(validTemplate);
    expect(result).toMatchObject(validTemplate);
  });

  test('validates template with inline agent config', () => {
    const templateWithConfig = {
      ...validTemplate,
      agents: [
        {
          name: 'custom-agent',
          systemPrompt: 'You are a custom agent'
        }
      ]
    };
    const result = validateTemplate(templateWithConfig);
    expect(result.agents![0]).toHaveProperty('name', 'custom-agent');
  });

  test('throws error for missing required fields', () => {
    const invalidTemplate: any = { ...validTemplate };
    delete invalidTemplate.name;

    expect(() => validateTemplate(invalidTemplate)).toThrow(/Validation error: .* at 'name'/);
  });

  test('throws error for invalid mode', () => {
    const invalidTemplate = { ...validTemplate, mode: 'invalid-mode' };
    expect(() => validateTemplate(invalidTemplate)).toThrow(/Validation error: .* at 'mode'/);
    expect(() => validateTemplate(invalidTemplate)).toThrow(/Allowed modes: consensus/); // Check suggestion
  });

  test('throws specific error for invalid agent', () => {
     const invalidTemplate = {
       ...validTemplate,
       agents: [123] // Invalid type
     };
     expect(() => validateTemplate(invalidTemplate)).toThrow(/Validation error: .* at 'agents.0'/);
  });
  
  test('throws error for empty persona string', () => {
      const invalidTemplate = {
          ...validTemplate,
          agents: ['']
      };
      expect(() => validateTemplate(invalidTemplate)).toThrow(/Persona reference cannot be empty/);
  });

  test('allows unknown fields (passthrough)', () => {
    const templateWithExtras = {
      ...validTemplate,
      extraField: 'some value',
      metadata: { version: 1 }
    };
    const result = validateTemplate(templateWithExtras);
    expect(result).toHaveProperty('extraField', 'some value');
    expect(result).toHaveProperty('metadata');
  });

  test('validates kebab-case name', () => {
    const invalidName = { ...validTemplate, name: 'Invalid Name' };
    expect(() => validateTemplate(invalidName)).toThrow(/Name must be kebab-case/);
    expect(() => validateTemplate(invalidName)).toThrow(/lowercase letters, numbers, and hyphens only/);
  });

  test('validates discuss mode', () => {
      const discussTemplate = { ...validTemplate, mode: 'discuss' };
      const result = validateTemplate(discussTemplate);
      expect(result.mode).toBe('discuss');
  });
  
  test('validates personas field instead of agents', () => {
      const personaTemplate = {
          name: 'persona-template',
          description: 'Using personas',
          mode: 'discuss',
          personas: ['security'],
          task: 'Task',
          outputFormat: 'markdown'
      };
      const result = validateTemplate(personaTemplate);
      expect(result.personas).toContain('security');
  });
  
  test('throws if neither agents nor personas are provided', () => {
      const invalidTemplate = { ...validTemplate };
      delete invalidTemplate.agents;
      delete invalidTemplate.personas;
      expect(() => validateTemplate(invalidTemplate)).toThrow(/At least one agent or persona must be specified/);
  });
});
