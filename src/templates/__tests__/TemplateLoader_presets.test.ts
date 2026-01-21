import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TemplateLoader } from '../TemplateLoader';

describe('TemplateLoader Presets', () => {
  const testPresetDir = path.join(os.tmpdir(), 'llm-conclave-test-preset-templates');
  const realPresetDir = path.join(__dirname, '..', 'presets');

  beforeEach(() => {
    // Copy real preset files to test preset directory
    if (fs.existsSync(testPresetDir)) {
      fs.rmSync(testPresetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testPresetDir, { recursive: true });

    // Copy each preset file
    if (fs.existsSync(realPresetDir)) {
      const files = fs.readdirSync(realPresetDir);
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          fs.copyFileSync(
            path.join(realPresetDir, file),
            path.join(testPresetDir, file)
          );
        }
      }
    }
  });

  afterEach(() => {
    if (fs.existsSync(testPresetDir)) {
      fs.rmSync(testPresetDir, { recursive: true, force: true });
    }
  });

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
