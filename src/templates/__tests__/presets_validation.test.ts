import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { TemplateSchema } from '../schemas/TemplateSchema';

describe('Preset Templates Validation', () => {
  const presetsDir = path.join(__dirname, '../presets');

  test('code-review.yaml should exist and be valid', () => {
    const filePath = path.join(presetsDir, 'code-review.yaml');
    expect(fs.existsSync(filePath)).toBe(true);
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = yaml.load(content);
    
    const result = TemplateSchema.safeParse(data);
    if (!result.success) {
      console.error('Validation error for code-review:', JSON.stringify(result.error.format(), null, 2));
    }
    expect(result.success).toBe(true);
    // @ts-ignore
    expect(data.name).toBe('code-review');
    // @ts-ignore
    expect(data.mode).toBe('discuss');
  });

  test('security-audit.yaml should exist and be valid', () => {
    const filePath = path.join(presetsDir, 'security-audit.yaml');
    expect(fs.existsSync(filePath)).toBe(true);
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = yaml.load(content);
    
    const result = TemplateSchema.safeParse(data);
    if (!result.success) {
      console.error('Validation error for security-audit:', JSON.stringify(result.error.format(), null, 2));
    }
    expect(result.success).toBe(true);
    // @ts-ignore
    expect(data.name).toBe('security-audit');
    // @ts-ignore
    expect(data.mode).toBe('consult');
  });
});
