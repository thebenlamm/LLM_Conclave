import { ContextLoader } from '../ContextLoader';
import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';

// Mock fs/promises
jest.mock('fs/promises');

// Mock inquirer
jest.mock('inquirer');

// Mock dependencies
const mockProjectContextInstance = {
  load: jest.fn(),
  formatContext: jest.fn(),
};
jest.mock('../../../utils/ProjectContext', () => {
  return jest.fn().mockImplementation(() => mockProjectContextInstance);
});

const mockBrownfieldDetectorInstance = {
  detectBrownfield: jest.fn(),
};
jest.mock('../BrownfieldDetector', () => {
  return {
    BrownfieldDetector: jest.fn().mockImplementation(() => mockBrownfieldDetectorInstance)
  };
});

describe('ContextLoader', () => {
  let loader: ContextLoader;
  
  beforeEach(() => {
    loader = new ContextLoader();
    jest.clearAllMocks();
  });

  describe('loadFileContext', () => {
    it('loads single file successfully', async () => {
      const filePath = 'test-file.ts';
      const content = 'console.log("hello");';
      
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(content);
      (fs.stat as jest.Mock).mockResolvedValue({ isFile: () => true });

      const result = await loader.loadFileContext([filePath]);
      
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].path).toContain(filePath);
      expect(result.sources[0].content).toBe(content);
      expect(result.formattedContent).toContain(`### File: ${filePath}`);
    });

    it('loads multiple files', async () => {
      const files = ['file1.ts', 'file2.md'];
      
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue('content');
      (fs.stat as jest.Mock).mockResolvedValue({ isFile: () => true });

      const result = await loader.loadFileContext(files);
      
      expect(result.sources).toHaveLength(2);
      expect(result.fileCount).toBe(2);
    });

    it('throws error for missing file', async () => {
      const filePath = 'missing.ts';
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(loader.loadFileContext([filePath]))
        .rejects.toThrow(/Context file not found/);
    });

    it('throws error for empty file paths array', async () => {
      await expect(loader.loadFileContext([]))
        .rejects.toThrow(/No valid file paths provided/);
    });

    it('throws error for array with only empty strings', async () => {
      await expect(loader.loadFileContext(['', '  ']))
        .rejects.toThrow(/No valid file paths provided/);
    });

    it('rejects directory paths', async () => {
      const dirPath = 'some-directory';
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.stat as jest.Mock).mockResolvedValue({ isFile: () => false });

      await expect(loader.loadFileContext([dirPath]))
        .rejects.toThrow(/Path is not a file/);
    });
  });

  describe('loadProjectContext', () => {
    it('loads project context and detects framework', async () => {
      const projectPath = '/test/project';
      const summary = '# Project Summary';
      
      mockProjectContextInstance.load.mockResolvedValue({ success: true });
      mockProjectContextInstance.formatContext.mockReturnValue(summary);
      
      mockBrownfieldDetectorInstance.detectBrownfield.mockResolvedValue({
        techStack: { framework: 'React' }
      });

      // @ts-ignore
      const result = await loader.loadProjectContext(projectPath);

      expect(result.projectIncluded).toBe(true);
      expect(result.formattedContent).toContain(summary);
      expect(result.sources[0].metadata?.framework).toBe('React');
    });
  });

  describe('combineContexts', () => {
    it('orders project context before file context', () => {
      const project: any = {
        sources: [{ type: 'project', path: '/project', content: 'proj', tokenEstimate: 100 }],
        formattedContent: '### Project Context\n\nproj',
        totalTokens: 100,
        fileCount: 0,
        projectIncluded: true
      };
      const files: any = {
        sources: [{ type: 'file', path: '/file.ts', content: 'file', tokenEstimate: 50 }],
        formattedContent: '### File: file.ts\n\nfile',
        totalTokens: 50,
        fileCount: 1,
        projectIncluded: false
      };

      // @ts-ignore
      const result = loader.combineContexts(project, files);
      
      expect(result.formattedContent).toMatch(/### Project Context[\s\S]*### File: file.ts/);
      expect(result.totalTokens).toBe(150);
      expect(result.projectIncluded).toBe(true);
      expect(result.fileCount).toBe(1);
      expect(result.sources).toHaveLength(2);
    });

    it('handles null project context', () => {
      const files: any = {
        sources: [{ type: 'file', path: '/file.ts', content: 'file', tokenEstimate: 50 }],
        formattedContent: '### File: file.ts\n\nfile',
        totalTokens: 50,
        fileCount: 1,
        projectIncluded: false
      };

      // @ts-ignore
      const result = loader.combineContexts(null, files);
      
      expect(result.formattedContent).toBe(files.formattedContent);
      expect(result.totalTokens).toBe(50);
      expect(result.projectIncluded).toBe(false);
    });
  });

  describe('checkSizeWarning', () => {
    it('returns true without prompt if tokens under threshold', async () => {
      const context: any = { totalTokens: 5000 };
      // @ts-ignore
      const result = await loader.checkSizeWarning(context);
      expect(result).toBe(true);
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it('prompts user if tokens over threshold', async () => {
      const context: any = { totalTokens: 15000 };
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ proceed: true });

      // @ts-ignore
      const result = await loader.checkSizeWarning(context);
      
      expect(result).toBe(true);
      expect(inquirer.prompt).toHaveBeenCalled();
    });

    it('returns false if user declines prompt', async () => {
      const context: any = { totalTokens: 15000 };
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ proceed: false });

      // @ts-ignore
      const result = await loader.checkSizeWarning(context);
      
      expect(result).toBe(false);
    });
  });

  describe('estimateTokens', () => {

    it('estimates tokens based on character count', () => {
      // 100 characters should be approx 25 tokens (chars / 4)
      const content = 'a'.repeat(100);
      expect(loader.estimateTokens(content)).toBe(25);
    });
    
    it('rounds up to nearest integer', () => {
      const content = 'abc'; // 3 chars => 0.75 tokens => 1
      expect(loader.estimateTokens(content)).toBe(1);
    });
  });
});
