import { formatValidationError } from '../TemplateValidator';
import { TemplateLoader } from '../TemplateLoader';
import { ZodError, ZodIssueCode } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs
jest.mock('fs');

describe('Review Verification', () => {
  
  describe('Validation Error Formatting', () => {
    test('matches required format: "Validation error: Invalid value at \'path\': detail"', () => {
      const error = new ZodError([
        {
          code: 'invalid_enum_value' as any,
          path: ['mode'],
          message: "Invalid enum value. Expected 'a' | 'b', received 'c'",
          expected: ['a', 'b'],
          received: 'c',
          options: ['a', 'b']
        } as any
      ]);
      
      const formatted = formatValidationError(error);
      expect(formatted).toContain("Validation error: Invalid value at 'mode': Expected 'a' | 'b', received 'c'");
      // Also checks that "Invalid enum value. " was stripped
      expect(formatted).not.toContain("Invalid enum value.");
    });
  });

  describe('TemplateLoader', () => {
    const loader = new TemplateLoader();
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(() => {
      jest.clearAllMocks();
      // Default behavior
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);
      mockFs.mkdirSync.mockImplementation(() => undefined);
    });

    test('ensureDir is called for both directories', () => {
      loader.discoverTemplates();
      
      const globalDir = loader.globalTemplatesDir;
      const projectDir = loader.projectTemplatesDir;

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(globalDir, { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(projectDir, { recursive: true });
    });

    test('files are sorted deterministically', () => {
      mockFs.existsSync.mockReturnValue(true);
      // Mock readdirSync to return unsorted list
      const unsorted = ['b.yaml', 'a.yaml', 'c.yaml'] as any;
      // We need to mock the return value such that .sort() is called on it
      // Since fs.readdirSync returns an array, and we want to spy on sort, it's tricky with simple mockReturnValue.
      // However, we can check if the code *calls* sort on the result of readdirSync?
      // Or we can rely on the fact that if we Mock implementation to return an array, the code calls .sort().
      // But we want to VERIFY it calls sort.
      
      // Let's mock readdirSync to return an array that we can spy on?
      // Easier: The code does `fs.readdirSync(dir).sort()`.
      // If we mock readdirSync to return an array, the code WILL call sort on it.
      // We can verify the side effect (the array is sorted) OR we can inspect the code (which we did).
      
      // Let's just mock readdirSync to return a mock object with a sort method
      const mockSort = jest.fn().mockReturnValue([]);
      mockFs.readdirSync.mockReturnValue({ sort: mockSort } as any);
      
      loader.discoverTemplates();
      expect(mockSort).toHaveBeenCalled();
    });
  });
});
