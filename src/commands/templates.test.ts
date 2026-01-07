import { createTemplatesCommand } from './templates';
import { Command } from 'commander';
import { TemplateLoader } from '../templates/TemplateLoader';
import { TemplateManager } from '../core/TemplateManager';
import chalk from 'chalk';

// Mock TemplateLoader
jest.mock('../templates/TemplateLoader');
const MockTemplateLoader = TemplateLoader as jest.MockedClass<typeof TemplateLoader>;

// Mock TemplateManager
jest.mock('../core/TemplateManager');
const MockTemplateManager = TemplateManager as jest.MockedClass<typeof TemplateManager>;

describe('Templates Command', () => {
  let command: Command;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    command = createTemplatesCommand();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('lists templates from both TemplateLoader and TemplateManager', async () => {
    // Setup TemplateLoader mock (Project & Global)
    MockTemplateLoader.prototype.loadAllTemplates.mockReturnValue([
      {
        name: 'project-template',
        description: 'A project template',
        mode: 'discuss',
        task: 'task',
        source: 'project',
        filePath: '/path/to/project/template.yaml'
      },
      {
        name: 'global-template',
        description: 'A global template',
        mode: 'consult',
        task: 'task',
        source: 'global',
        filePath: '/path/to/global/template.yaml'
      }
    ]);

    // Setup TemplateManager mock (Preset)
    MockTemplateManager.prototype.listTemplates.mockReturnValue([
      {
        name: 'preset-template',
        description: 'A preset template',
        mode: 'iterative',
        taskTemplate: 'task',
        agents: {}
      } as any
    ]);

    // Execute command
    await command.parseAsync(['node', 'test']);

    // Verify output contains all templates
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('project-template');
    expect(output).toContain('global-template');
    expect(output).toContain('preset-template');
  });

  it('displays source badges correctly', async () => {
    MockTemplateLoader.prototype.loadAllTemplates.mockReturnValue([
      {
        name: 'project-template',
        description: 'desc',
        mode: 'discuss',
        task: 'task',
        source: 'project',
        filePath: 'path'
      },
      {
        name: 'global-template',
        description: 'desc',
        mode: 'discuss',
        task: 'task',
        source: 'global',
        filePath: 'path'
      }
    ]);

    MockTemplateManager.prototype.listTemplates.mockReturnValue([
       {
        name: 'preset-template',
        description: 'desc',
        mode: 'iterative',
        taskTemplate: 'task',
        agents: {}
      } as any
    ]);

    await command.parseAsync(['node', 'test']);

    // Check for source badges
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('project');
    expect(output).toContain('global');
    expect(output).toContain('preset');
  });

  it('user templates override preset templates with same name', async () => {
     MockTemplateLoader.prototype.loadAllTemplates.mockReturnValue([
      {
        name: 'code-review', // Same as a common preset
        description: 'My custom code review',
        mode: 'discuss',
        task: 'task',
        source: 'project',
        filePath: 'path'
      }
    ]);

    MockTemplateManager.prototype.listTemplates.mockReturnValue([
       {
        name: 'code-review',
        description: 'Built-in code review',
        mode: 'iterative', // Different mode
        taskTemplate: 'task',
        agents: {}
      } as any
    ]);

    await command.parseAsync(['node', 'test']);

    const output = consoleSpy.mock.calls.flat().join(' ');

    // Should show the project version description, not the preset one
    expect(output).toContain('My custom code review');
    expect(output).not.toContain('Built-in code review');
    // Should show project source
    expect(output).toContain('project');
  });

  it('handles empty user templates state (while showing presets)', async () => {
    MockTemplateLoader.prototype.loadAllTemplates.mockReturnValue([]);
    MockTemplateManager.prototype.listTemplates.mockReturnValue([
        {
        name: 'preset-template',
        description: 'A preset',
        mode: 'iterative',
        taskTemplate: 'task',
        agents: {}
      } as any
    ]);

    await command.parseAsync(['node', 'test']);

    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('No user templates found');
    expect(output).toContain('.conclave/templates/');
    expect(output).toContain('name: code-review'); // Example YAML
    expect(output).toContain('Docs:'); // Docs link
    expect(output).toContain('preset-template'); // Presets still shown
  });

  it('handles absolute empty state (no user OR presets)', async () => {
      MockTemplateLoader.prototype.loadAllTemplates.mockReturnValue([]);
      MockTemplateManager.prototype.listTemplates.mockReturnValue([]);
  
      await command.parseAsync(['node', 'test']);
  
      const output = consoleSpy.mock.calls.flat().join(' ');
      expect(output).toContain('No templates found'); // Different message
      expect(output).toContain('.conclave/templates/');
  });

  it('shows verbose information when -v flag is used', async () => {
    MockTemplateLoader.prototype.loadAllTemplates.mockReturnValue([
      {
        name: 'complex-template',
        description: 'Complex one',
        mode: 'discuss',
        task: 'task',
        source: 'project',
        filePath: 'path',
        personas: ['developer', 'tester'],
        agents: ['coder', 'reviewer']
      }
    ]);

    MockTemplateManager.prototype.listTemplates.mockReturnValue([]);

    await command.parseAsync(['node', 'test', '-v']);

    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Personas: developer, tester');
    expect(output).toContain('Agents: coder, reviewer');
  });

  it('shows invalid name indicator', async () => {
      MockTemplateLoader.prototype.loadAllTemplates.mockReturnValue([
      {
        name: 'Invalid Name', // Spaces not allowed
        description: 'Bad name',
        mode: 'discuss',
        task: 'task',
        source: 'project',
        filePath: 'path'
      }
    ]);
    MockTemplateManager.prototype.listTemplates.mockReturnValue([]);

    await command.parseAsync(['node', 'test']);

    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('invalid name');
  });
});