import { GeminiCacheManager } from '../GeminiCacheManager';

// Mock the GoogleGenAI client
function createMockClient(overrides?: {
  createResult?: any;
  createError?: Error;
  deleteError?: Error;
}) {
  return {
    caches: {
      create: jest.fn().mockImplementation(async () => {
        if (overrides?.createError) throw overrides.createError;
        return overrides?.createResult ?? { name: 'caches/abc123' };
      }),
      delete: jest.fn().mockImplementation(async () => {
        if (overrides?.deleteError) throw overrides.deleteError;
      }),
    },
  } as any;
}

// Helper: generate a string of ~N tokens (4 chars per token)
function textOfTokens(n: number): string {
  return 'x'.repeat(n * 4);
}

describe('GeminiCacheManager', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getOrCreateCache', () => {
    it('returns null when context is below token threshold', async () => {
      const client = createMockClient();
      const manager = new GeminiCacheManager(client);

      // 10K tokens = 40K chars — well below 50K threshold
      const result = await manager.getOrCreateCache('gemini-2.5-pro', textOfTokens(10000));

      expect(result).toBeNull();
      expect(client.caches.create).not.toHaveBeenCalled();
      expect(manager.activeCacheCount).toBe(0);
    });

    it('creates cache when context exceeds token threshold', async () => {
      const client = createMockClient({ createResult: { name: 'caches/test-cache' } });
      const manager = new GeminiCacheManager(client);

      const result = await manager.getOrCreateCache('gemini-2.5-pro', textOfTokens(60000));

      expect(result).toBe('caches/test-cache');
      expect(client.caches.create).toHaveBeenCalledTimes(1);
      expect(client.caches.create).toHaveBeenCalledWith({
        model: 'gemini-2.5-pro',
        config: expect.objectContaining({
          systemInstruction: expect.any(String),
          ttl: '300s',
        }),
      });
      expect(manager.activeCacheCount).toBe(1);
    });

    it('includes tools in cache config when provided', async () => {
      const client = createMockClient({ createResult: { name: 'caches/with-tools' } });
      const manager = new GeminiCacheManager(client);

      const tools = [{ functionDeclarations: [{ name: 'read_file' }] }];
      await manager.getOrCreateCache('gemini-2.5-pro', textOfTokens(60000), tools);

      expect(client.caches.create).toHaveBeenCalledWith({
        model: 'gemini-2.5-pro',
        config: expect.objectContaining({
          tools,
        }),
      });
    });

    it('reuses existing cache on second call with same content', async () => {
      const client = createMockClient({ createResult: { name: 'caches/reused' } });
      const manager = new GeminiCacheManager(client);

      const content = textOfTokens(60000);
      const result1 = await manager.getOrCreateCache('gemini-2.5-pro', content);
      const result2 = await manager.getOrCreateCache('gemini-2.5-pro', content);

      expect(result1).toBe('caches/reused');
      expect(result2).toBe('caches/reused');
      expect(client.caches.create).toHaveBeenCalledTimes(1); // Only created once
      expect(manager.activeCacheCount).toBe(1);
    });

    it('creates separate caches for different content with same length', async () => {
      let callCount = 0;
      const client = {
        caches: {
          create: jest.fn().mockImplementation(async () => {
            callCount++;
            return { name: `caches/cache-${callCount}` };
          }),
          delete: jest.fn(),
        },
      } as any;
      const manager = new GeminiCacheManager(client);

      // Same length but different content — hash-based keys prevent false cache hits
      const text1 = 'A'.repeat(200001);
      const text2 = 'B'.repeat(200001);
      const result1 = await manager.getOrCreateCache('gemini-2.5-pro', text1);
      const result2 = await manager.getOrCreateCache('gemini-2.5-pro', text2);

      expect(result1).toBe('caches/cache-1');
      expect(result2).toBe('caches/cache-2');
      expect(client.caches.create).toHaveBeenCalledTimes(2);
      expect(manager.activeCacheCount).toBe(2);
    });

    it('creates separate caches for different models', async () => {
      let callCount = 0;
      const client = {
        caches: {
          create: jest.fn().mockImplementation(async () => {
            callCount++;
            return { name: `caches/cache-${callCount}` };
          }),
          delete: jest.fn(),
        },
      } as any;
      const manager = new GeminiCacheManager(client);

      const content = textOfTokens(60000);
      const result1 = await manager.getOrCreateCache('gemini-2.5-pro', content);
      const result2 = await manager.getOrCreateCache('gemini-2.0-flash', content);

      expect(result1).toBe('caches/cache-1');
      expect(result2).toBe('caches/cache-2');
      expect(client.caches.create).toHaveBeenCalledTimes(2);
      expect(manager.activeCacheCount).toBe(2);
    });

    it('returns null gracefully on cache creation failure', async () => {
      const client = createMockClient({
        createError: new Error('Quota exceeded'),
      });
      const manager = new GeminiCacheManager(client);

      const result = await manager.getOrCreateCache('gemini-2.5-pro', textOfTokens(60000));

      expect(result).toBeNull();
      expect(manager.activeCacheCount).toBe(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Gemini cache creation failed: Quota exceeded')
      );
    });

    it('returns null when cache creation returns no name', async () => {
      const client = createMockClient({ createResult: {} }); // No name field
      const manager = new GeminiCacheManager(client);

      const result = await manager.getOrCreateCache('gemini-2.5-pro', textOfTokens(60000));

      expect(result).toBeNull();
      expect(manager.activeCacheCount).toBe(0);
    });

    it('respects custom token threshold', async () => {
      const client = createMockClient();
      const manager = new GeminiCacheManager(client, { tokenThreshold: 100000 });

      // 60K tokens — above default 50K but below custom 100K
      const result = await manager.getOrCreateCache('gemini-2.5-pro', textOfTokens(60000));

      expect(result).toBeNull();
      expect(client.caches.create).not.toHaveBeenCalled();
    });

    it('uses custom TTL in cache config', async () => {
      const client = createMockClient();
      const manager = new GeminiCacheManager(client, { ttlSeconds: 600 });

      await manager.getOrCreateCache('gemini-2.5-pro', textOfTokens(60000));

      expect(client.caches.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            ttl: '600s',
          }),
        })
      );
    });
  });

  describe('cleanup', () => {
    it('deletes all active caches', async () => {
      const client = createMockClient({ createResult: { name: 'caches/to-delete' } });
      const manager = new GeminiCacheManager(client);

      await manager.getOrCreateCache('gemini-2.5-pro', textOfTokens(60000));
      expect(manager.activeCacheCount).toBe(1);

      await manager.cleanup();

      expect(client.caches.delete).toHaveBeenCalledWith({ name: 'caches/to-delete' });
      expect(manager.activeCacheCount).toBe(0);
    });

    it('ignores errors during cleanup (cache may have expired)', async () => {
      const client = createMockClient({
        createResult: { name: 'caches/expired' },
        deleteError: new Error('Cache not found'),
      });
      const manager = new GeminiCacheManager(client);

      await manager.getOrCreateCache('gemini-2.5-pro', textOfTokens(60000));

      // Should not throw
      await expect(manager.cleanup()).resolves.toBeUndefined();
      expect(manager.activeCacheCount).toBe(0);
    });

    it('is safe to call when no caches exist', async () => {
      const client = createMockClient();
      const manager = new GeminiCacheManager(client);

      await expect(manager.cleanup()).resolves.toBeUndefined();
      expect(client.caches.delete).not.toHaveBeenCalled();
    });
  });
});
