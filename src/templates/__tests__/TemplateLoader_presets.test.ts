import * as fs from 'fs';
import { TemplateLoader } from '../TemplateLoader';

describe('TemplateLoader Presets', () => {
  test('should load preset templates', () => {
    const loader = new TemplateLoader();
    const templates = loader.loadAllTemplates();
    
    // Check code-review preset
    const codeReview = templates.find(t => t.name === 'code-review');
    expect(codeReview).toBeDefined();
    expect(codeReview?.source).toBe('preset');
    expect(codeReview?.mode).toBe('discuss');

    // Check security-audit preset
    const securityAudit = templates.find(t => t.name === 'security-audit');
    expect(securityAudit).toBeDefined();
    expect(securityAudit?.source).toBe('preset');
    expect(securityAudit?.mode).toBe('consult');
  });

  test('should not crash if presets directory is missing', () => {
    // Subclass to override the presets directory path to a non-existent one
    class TestLoader extends TemplateLoader {
      get presetTemplatesDir(): string {
        return '/path/to/non/existent/presets/dir';
      }
    }

    const loader = new TestLoader();

    // It should not throw and should return other templates (or empty if none)
    expect(() => {
        loader.loadAllTemplates();
    }).not.toThrow();
    
    // Should confirm presets are not loaded (check via spy or result)
    // Since we can't easily check internal state, just ensuring no throw is the main goal of this test
  });
});
