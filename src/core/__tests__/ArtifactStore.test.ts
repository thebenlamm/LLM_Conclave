import { ArtifactStore } from '../ArtifactStore';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ArtifactStore', () => {
  const testSessionId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  let store: ArtifactStore;
  const storePath = path.join(os.homedir(), '.llm-conclave', 'artifacts', testSessionId);

  beforeEach(async () => {
    store = new ArtifactStore(testSessionId);
    await store.init();
  });

  afterEach(async () => {
    await store.cleanup();
  });

  describe('shouldOffload', () => {
    it('should return false for small content', () => {
      expect(store.shouldOffload('hello')).toBe(false);
    });

    it('should return false for content exactly at threshold', () => {
      // Default threshold is 2048 bytes
      const content = 'a'.repeat(2048);
      expect(store.shouldOffload(content)).toBe(false);
    });

    it('should return true for content exceeding threshold', () => {
      const content = 'a'.repeat(2049);
      expect(store.shouldOffload(content)).toBe(true);
    });

    it('should respect custom threshold', async () => {
      const customStore = new ArtifactStore(`custom-${Date.now()}`, { thresholdBytes: 100 });
      await customStore.init();
      try {
        expect(customStore.shouldOffload('a'.repeat(101))).toBe(true);
        expect(customStore.shouldOffload('a'.repeat(99))).toBe(false);
      } finally {
        await customStore.cleanup();
      }
    });
  });

  describe('store and get', () => {
    it('should store content and return a stub', async () => {
      const content = 'line1\nline2\nline3\nline4\nline5\nline6\nline7';
      const artifact = await store.store('read_file', { file_path: '/test/file.ts' }, content);

      expect(artifact.id).toBe('tool-1');
      expect(artifact.toolName).toBe('read_file');
      expect(artifact.lineCount).toBe(7);
      expect(artifact.sizeBytes).toBeGreaterThan(0);
      expect(artifact.stub).toContain('Artifact tool-1');
      expect(artifact.stub).toContain('file.ts');
      expect(artifact.stub).toContain('expand_artifact');
    });

    it('should retrieve stored content by ID', async () => {
      const content = 'hello world\nsecond line';
      const artifact = await store.store('read_file', { file_path: '/test.txt' }, content);
      const retrieved = await store.get(artifact.id);

      expect(retrieved).toBe(content);
    });

    it('should return null for unknown artifact ID', async () => {
      const result = await store.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should increment IDs for multiple stores', async () => {
      const a1 = await store.store('read_file', {}, 'content1');
      const a2 = await store.store('read_file', {}, 'content2');
      const a3 = await store.store('read_file', {}, 'content3');

      expect(a1.id).toBe('tool-1');
      expect(a2.id).toBe('tool-2');
      expect(a3.id).toBe('tool-3');
    });
  });

  describe('stub format', () => {
    it('should include preview with head and tail for long content', async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
      const content = lines.join('\n');
      const artifact = await store.store('read_file', { file_path: '/test/big.ts' }, content);

      // Stub should contain first 3 lines and last 2 lines
      expect(artifact.stub).toContain('line 1');
      expect(artifact.stub).toContain('line 2');
      expect(artifact.stub).toContain('line 3');
      expect(artifact.stub).toContain('...');
      expect(artifact.stub).toContain('line 19');
      expect(artifact.stub).toContain('line 20');
    });

    it('should include full content for short content (<=5 lines)', async () => {
      const content = 'line1\nline2\nline3\nline4';
      const artifact = await store.store('read_file', {}, content);

      expect(artifact.stub).toContain('line1');
      expect(artifact.stub).toContain('line4');
      expect(artifact.stub).not.toContain('...');
    });

    it('should use filename label for file_path input', async () => {
      const artifact = await store.store('read_file', { file_path: '/src/core/MyClass.ts' }, 'content');
      expect(artifact.stub).toContain('MyClass.ts');
    });

    it('should use glob pattern label for pattern input', async () => {
      const artifact = await store.store('list_files', { pattern: '**/*.ts' }, 'content');
      expect(artifact.stub).toContain('glob:**/*.ts');
    });

    it('should use command label for command input', async () => {
      const artifact = await store.store('run_command', { command: 'git status --short' }, 'content');
      expect(artifact.stub).toContain('cmd:git status --short');
    });

    it('should show size in KB for large content', async () => {
      const content = 'a'.repeat(3000);
      const artifact = await store.store('read_file', {}, content);
      expect(artifact.stub).toMatch(/\d+\.\d+KB/);
    });
  });

  describe('cleanup', () => {
    it('should remove the session directory', async () => {
      await store.store('read_file', {}, 'test content');
      // Verify directory exists
      await expect(fs.access(storePath)).resolves.toBeUndefined();

      await store.cleanup();
      // Verify directory is removed
      await expect(fs.access(storePath)).rejects.toThrow();
    });
  });

  describe('stale directory cleanup', () => {
    it('should clean directories older than 24 hours', async () => {
      const parentDir = path.join(os.homedir(), '.llm-conclave', 'artifacts');
      const staleDir = path.join(parentDir, 'stale-session-test');

      // Create a stale directory
      await fs.mkdir(staleDir, { recursive: true });
      await fs.writeFile(path.join(staleDir, 'dummy.txt'), 'old');

      // Set mtime to 25 hours ago
      const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await fs.utimes(staleDir, staleTime, staleTime);

      // Creating a new store should trigger stale cleanup
      const freshStore = new ArtifactStore(`fresh-${Date.now()}`);
      await freshStore.init();

      // Stale directory should be cleaned
      await expect(fs.access(staleDir)).rejects.toThrow();

      await freshStore.cleanup();
    });
  });
});
