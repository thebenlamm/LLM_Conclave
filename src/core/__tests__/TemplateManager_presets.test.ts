import { TemplateManager } from '../TemplateManager';

describe('TemplateManager Presets', () => {
  test('should NOT include code-review in built-in templates', () => {
    const manager = new TemplateManager();
    const templates = manager.listTemplates();
    
    const codeReview = templates.find(t => t.name === 'code-review');
    expect(codeReview).toBeUndefined();
  });

  test('should include architecture-design', () => {
    const manager = new TemplateManager();
    const template = manager.getTemplate('architecture-design');
    expect(template).toBeDefined();
  });
});
