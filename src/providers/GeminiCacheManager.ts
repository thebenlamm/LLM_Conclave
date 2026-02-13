/**
 * GeminiCacheManager - Manages Gemini explicit context caching within a session.
 *
 * Creates cached content for system instructions + tools when the context is large enough
 * to justify the storage cost. Reuses the same cache across multiple calls (e.g., Round 1
 * and Round 3 of a consultation), then cleans up on session end.
 *
 * Break-even analysis:
 *   - Gemini 2.5 Pro input: $1.25/MTok, cached reads: $0.3125/MTok (75% cheaper)
 *   - Storage: $4.50/MTok/hour
 *   - Only worthwhile at ~50K+ tokens (below that, storage cost exceeds read savings)
 */

import { GoogleGenAI } from '@google/genai';
import { createHash } from 'crypto';

export interface GeminiCacheEntry {
  name: string;
  model: string;
  createdAt: number;
}

export class GeminiCacheManager {
  private client: GoogleGenAI;
  private caches: Map<string, GeminiCacheEntry> = new Map();
  private tokenThreshold: number;
  private ttlSeconds: number;

  constructor(client: GoogleGenAI, options?: { tokenThreshold?: number; ttlSeconds?: number }) {
    this.client = client;
    this.tokenThreshold = options?.tokenThreshold ?? 50000;
    this.ttlSeconds = options?.ttlSeconds ?? 300; // 5 minutes (consultations typically complete in <2 min)
  }

  /**
   * Get or create a cache for the given model + system instruction.
   * Returns the cache name if caching is worthwhile, null otherwise.
   *
   * @param model - Gemini model name (e.g., "gemini-2.5-pro")
   * @param systemInstruction - The system prompt to cache
   * @param tools - Optional tool declarations to include in cache
   */
  async getOrCreateCache(
    model: string,
    systemInstruction: string,
    tools?: any[]
  ): Promise<string | null> {
    // Estimate tokens (~4 chars per token)
    const estimatedTokens = Math.ceil(systemInstruction.length / 4);
    if (estimatedTokens < this.tokenThreshold) {
      return null;
    }

    // Check if we already have a cache for this model + content
    const contentHash = createHash('sha256').update(systemInstruction).digest('hex').substring(0, 16);
    const cacheKey = `${model}:${contentHash}`;
    const existing = this.caches.get(cacheKey);
    if (existing) {
      return existing.name;
    }

    // Create new cache
    try {
      const cacheConfig: any = {
        systemInstruction,
        ttl: `${this.ttlSeconds}s`,
      };

      if (tools && tools.length > 0) {
        cacheConfig.tools = tools;
      }

      const cache = await this.client.caches.create({
        model,
        config: cacheConfig,
      });

      if (cache.name) {
        this.caches.set(cacheKey, {
          name: cache.name,
          model,
          createdAt: Date.now(),
        });
        console.log(`      💾 Gemini cache created: ~${estimatedTokens} tokens cached for ${this.ttlSeconds}s`);
        return cache.name;
      }

      return null;
    } catch (error: any) {
      console.warn(`      ⚠️  Gemini cache creation failed: ${error.message}`);
      return null; // Graceful fallback — proceed without caching
    }
  }

  /**
   * Delete all active caches. Call this on session end.
   */
  async cleanup(): Promise<void> {
    for (const [key, entry] of this.caches) {
      try {
        await this.client.caches.delete({ name: entry.name });
      } catch {
        // Ignore cleanup errors (cache may have already expired)
      }
    }
    this.caches.clear();
  }

  /**
   * Get the number of active caches (for testing/monitoring).
   */
  get activeCacheCount(): number {
    return this.caches.size;
  }
}
