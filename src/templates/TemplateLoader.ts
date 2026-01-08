import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { validateTemplate } from './TemplateValidator';
import { Template } from './types';

export interface TemplatePath {
  source: 'global' | 'project' | 'preset';
  filePath: string;
}

export interface LoadedTemplate extends Template {
  source: 'global' | 'project' | 'preset';
  filePath: string;
}

export class TemplateLoader {
  
  get globalTemplatesDir(): string {
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    return isTestEnv
      ? path.join(os.tmpdir(), 'llm-conclave-test-templates')
      : path.join(os.homedir(), '.llm-conclave', 'templates');
  }

  get projectTemplatesDir(): string {
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
     return isTestEnv
       ? path.join(os.tmpdir(), 'llm-conclave-test-project-templates')
       : path.join(process.cwd(), '.conclave', 'templates');
  }

  get presetTemplatesDir(): string {
     return path.join(__dirname, 'presets');
  }

  discoverTemplates(): Map<string, TemplatePath> {
    const templates = new Map<string, TemplatePath>();
    
    const ensureDir = (dir: string) => {
      if (fs.existsSync(dir)) return;
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // Optional and silent by requirement.
      }
    };

    const scanDir = (dir: string, source: 'global' | 'project' | 'preset') => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir).sort();
        for (const file of files) {
            if (file.endsWith('.yaml') || file.endsWith('.yml')) {
                const name = path.basename(file, path.extname(file));
                templates.set(name, {
                    source,
                    filePath: path.join(dir, file)
                });
            }
        }
    };

    // Ensure user directories exist
    ensureDir(this.globalTemplatesDir);
    ensureDir(this.projectTemplatesDir);

    // Scan in order of priority (lowest first)
    // 1. Presets
    scanDir(this.presetTemplatesDir, 'preset');
    // 2. Global (overrides presets)
    scanDir(this.globalTemplatesDir, 'global');
    // 3. Project (overrides all)
    scanDir(this.projectTemplatesDir, 'project');

    return templates;
  }

  private loadTemplateFromPath(name: string, templatePath: TemplatePath): LoadedTemplate {
    let content: string;
    try {
      content = fs.readFileSync(templatePath.filePath, 'utf-8');
    } catch (error: any) {
       throw new Error(`Error loading template '${name}':\n  File: ${templatePath.filePath}\n  ${error.message}`);
    }

    let data: unknown;
    try {
      data = yaml.load(content);
    } catch (error: any) {
      let msg = error.message;
      if (error.mark) {
        msg = `YAML syntax error at line ${error.mark.line + 1}, column ${error.mark.column + 1}`;
      }
      throw new Error(`Error loading template '${name}':\n  File: ${templatePath.filePath}\n  Parse error: ${msg}`);
    }

    try {
      const validated = validateTemplate(data);
      return {
        ...validated,
        source: templatePath.source,
        filePath: templatePath.filePath
      };
    } catch (error: any) {
       // Strip the "Template validation failed:\n" prefix if present
       const msg = error.message.replace(/^Template validation failed:\n/, '');
       throw new Error(`Error loading template '${name}':\n  File: ${templatePath.filePath}\n  ${msg}`);
    }
  }

  loadTemplate(name: string): LoadedTemplate {
    const templates = this.discoverTemplates();
    const templatePath = templates.get(name);

    if (!templatePath) {
      throw new Error(`Template '${name}' not found`);
    }

    return this.loadTemplateFromPath(name, templatePath);
  }

  loadAllTemplates(): LoadedTemplate[] {
    const templates = this.discoverTemplates();
    const loadedTemplates: LoadedTemplate[] = [];

    for (const [name, path] of templates) {
        loadedTemplates.push(this.loadTemplateFromPath(name, path));
    }
    
    return loadedTemplates;
  }
}
