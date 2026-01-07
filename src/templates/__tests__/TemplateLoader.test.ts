import { TemplateLoader } from '../TemplateLoader';
import path from 'path';
import os from 'os';
import * as fs from 'fs';

describe('TemplateLoader', () => {
  let loader: TemplateLoader;

  beforeEach(() => {
    loader = new TemplateLoader();
  });

  describe('Path Resolution', () => {
    it('should resolve global templates directory', () => {
        const expected = path.join(os.tmpdir(), 'llm-conclave-test-templates');
        // @ts-ignore
        expect(loader.globalTemplatesDir).toBe(expected);
    });

    it('should resolve project templates directory', () => {
        const expected = path.join(os.tmpdir(), 'llm-conclave-test-project-templates');
        // @ts-ignore
        expect(loader.projectTemplatesDir).toBe(expected);
    });
  });

  describe('discoverTemplates', () => {
      const globalDir = path.join(os.tmpdir(), 'llm-conclave-test-templates');
      const projectDir = path.join(os.tmpdir(), 'llm-conclave-test-project-templates');

      beforeEach(() => {
          if (fs.existsSync(globalDir)) {
              fs.rmSync(globalDir, { recursive: true, force: true });
          }
          fs.mkdirSync(globalDir, { recursive: true });
          
          if (fs.existsSync(projectDir)) {
              fs.rmSync(projectDir, { recursive: true, force: true });
          }
          fs.mkdirSync(projectDir, { recursive: true });
      });

      afterEach(() => {
          if (fs.existsSync(globalDir)) {
              fs.rmSync(globalDir, { recursive: true, force: true });
          }
          if (fs.existsSync(projectDir)) {
              fs.rmSync(projectDir, { recursive: true, force: true });
          }
      });

      it('should return a Map', () => {
          // @ts-ignore
          const templates = loader.discoverTemplates();
          expect(templates).toBeInstanceOf(Map);
      });

      it('should discover global templates', () => {
          fs.writeFileSync(path.join(globalDir, 'global-1.yaml'), 'content');
          
          // @ts-ignore
          const templates = loader.discoverTemplates();
          expect(templates.has('global-1')).toBe(true);
          expect(templates.get('global-1')?.source).toBe('global');
      });

      it('should discover project templates', () => {
          fs.writeFileSync(path.join(projectDir, 'project-1.yaml'), 'content');

          // @ts-ignore
          const templates = loader.discoverTemplates();
          expect(templates.has('project-1')).toBe(true);
          expect(templates.get('project-1')?.source).toBe('project');
      });
      
      it('should prioritize project templates over global', () => {
          fs.writeFileSync(path.join(globalDir, 'override.yaml'), 'global content');
          fs.writeFileSync(path.join(projectDir, 'override.yaml'), 'project content');
          
          // @ts-ignore
          const templates = loader.discoverTemplates();
          expect(templates.has('override')).toBe(true);
          expect(templates.get('override')?.source).toBe('project');
      });
  });

  describe('loadTemplate', () => {
      const globalDir = path.join(os.tmpdir(), 'llm-conclave-test-templates');
      
      beforeEach(() => {
           if (fs.existsSync(globalDir)) {
              fs.rmSync(globalDir, { recursive: true, force: true });
          }
          fs.mkdirSync(globalDir, { recursive: true });
      });
      
      afterEach(() => {
          if (fs.existsSync(globalDir)) {
              fs.rmSync(globalDir, { recursive: true, force: true });
          }
      });

      it('should load a valid template', () => {
          const content = `
name: test-template
description: A test template
mode: consensus
agents:
  - name: Agent1
    systemPrompt: You are an agent.
task: Do something.
`;
          fs.writeFileSync(path.join(globalDir, 'test-template.yaml'), content);
          
          // @ts-ignore
          const template = loader.loadTemplate('test-template');
          expect(template.name).toBe('test-template');
          expect(template.mode).toBe('consensus');
          expect(template.source).toBe('global');
      });

      it('should throw if template not found', () => {
          // @ts-ignore
          expect(() => loader.loadTemplate('non-existent')).toThrow(/Template 'non-existent' not found/);
      });

      it('should throw on invalid YAML', () => {
           const content = `
name: test-template
description: : : : invalid yaml
`;
          fs.writeFileSync(path.join(globalDir, 'invalid-yaml.yaml'), content);
          // @ts-ignore
          expect(() => loader.loadTemplate('invalid-yaml')).toThrow(/Parse error/);
      });

      it('should throw on validation error', () => {
           const content = `
name: test-template
description: A test template
mode: invalid-mode
task: Do something.
`;
          fs.writeFileSync(path.join(globalDir, 'invalid-schema.yaml'), content);
          // @ts-ignore
          expect(() => loader.loadTemplate('invalid-schema')).toThrow(/Validation error:/);
      });
  });

  describe('loadAllTemplates', () => {
       const globalDir = path.join(os.tmpdir(), 'llm-conclave-test-templates');
       const projectDir = path.join(os.tmpdir(), 'llm-conclave-test-project-templates');

      beforeEach(() => {
           if (fs.existsSync(globalDir)) {
              fs.rmSync(globalDir, { recursive: true, force: true });
          }
          fs.mkdirSync(globalDir, { recursive: true });
          
          if (fs.existsSync(projectDir)) {
              fs.rmSync(projectDir, { recursive: true, force: true });
          }
          fs.mkdirSync(projectDir, { recursive: true });
      });
      
      afterEach(() => {
           if (fs.existsSync(globalDir)) {
              fs.rmSync(globalDir, { recursive: true, force: true });
          }
           if (fs.existsSync(projectDir)) {
              fs.rmSync(projectDir, { recursive: true, force: true });
          }
      });

      it('should load all templates', () => {
          fs.writeFileSync(path.join(globalDir, 't1.yaml'), 'name: t1\ndescription: d1\nmode: consensus\ntask: t\nagents:\n  - name: a1\n    systemPrompt: p');
          fs.writeFileSync(path.join(projectDir, 't2.yaml'), 'name: t2\ndescription: d2\nmode: consensus\ntask: t\nagents:\n  - name: a1\n    systemPrompt: p');
          
          // @ts-ignore
          const templates: any[] = loader.loadAllTemplates();
          expect(templates.length).toBe(2);
          expect(templates.find((t: any) => t.name === 't1')?.source).toBe('global');
          expect(templates.find((t: any) => t.name === 't2')?.source).toBe('project');
      });

      it('should respect precedence', () => {
           fs.writeFileSync(path.join(globalDir, 'override.yaml'), 'name: override\ndescription: global\nmode: consensus\ntask: t\nagents:\n  - name: a1\n    systemPrompt: p');
           fs.writeFileSync(path.join(projectDir, 'override.yaml'), 'name: override\ndescription: project\nmode: consensus\ntask: t\nagents:\n  - name: a1\n    systemPrompt: p');
           
           // @ts-ignore
           const templates: any[] = loader.loadAllTemplates();
           expect(templates.length).toBe(1);
           const t = templates.find((t: any) => t.name === 'override');
           expect(t?.description).toBe('project');
           expect(t?.source).toBe('project');
      });
  });

  describe('Empty State', () => {
       const globalDir = path.join(os.tmpdir(), 'llm-conclave-test-templates');
       const projectDir = path.join(os.tmpdir(), 'llm-conclave-test-project-templates');
       
       beforeEach(() => {
           if (fs.existsSync(globalDir)) fs.rmSync(globalDir, { recursive: true, force: true });
           if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
       });
       
       afterEach(() => {
            if (fs.existsSync(globalDir)) fs.rmSync(globalDir, { recursive: true, force: true });
            if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
       });

      it('should return empty list when no templates exist', () => {
           // @ts-ignore
           const templates: any[] = loader.loadAllTemplates();
           expect(templates).toEqual([]);
      });
      
      it('should not throw when directories are missing', () => {
          // @ts-ignore
          expect(() => loader.discoverTemplates()).not.toThrow();
      });
  });

  describe('Performance', () => {
       const globalDir = path.join(os.tmpdir(), 'llm-conclave-test-templates');
       
       beforeEach(() => {
           if (fs.existsSync(globalDir)) fs.rmSync(globalDir, { recursive: true, force: true });
           fs.mkdirSync(globalDir, { recursive: true });
           
           for (let i = 0; i < 20; i++) {
               fs.writeFileSync(path.join(globalDir, `perf-${i}.yaml`), `
name: perf-${i}
description: Performance test template
mode: consensus
agents:
  - name: Agent1
    systemPrompt: You are an agent.
task: Do something.
`);
           }
       });
       
       afterEach(() => {
            if (fs.existsSync(globalDir)) fs.rmSync(globalDir, { recursive: true, force: true });
       });

      it('should load 20 templates in under 100ms', () => {
          const start = Date.now();
          // @ts-ignore
          loader.loadAllTemplates();
          const duration = Date.now() - start;
          expect(duration).toBeLessThan(100);
      });
  });
});