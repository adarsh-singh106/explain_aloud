import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  checkOllamaServer,
  listOllamaModels,
  isModelAvailable,
  generateWithGemma,
} from './ollama';

describe('Milestone M2/M4 — Ollama Service Hardening', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkOllamaServer & listOllamaModels', () => {
    it('returns true when /api/tags responds ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
      } as Response);

      const status = await checkOllamaServer('http://127.0.0.1:11434');
      expect(status).toBe(true);
    });

    it('returns false when /api/tags throws or returns non-ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

      const status = await checkOllamaServer('http://127.0.0.1:11434');
      expect(status).toBe(false);
    });

    it('lists installed models from /api/tags response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'gemma4:e4b' }, { name: 'llama3:8b' }],
        }),
      } as Response);

      const models = await listOllamaModels('http://127.0.0.1:11434');
      expect(models).toEqual(['gemma4:e4b', 'llama3:8b']);
    });

    it('truthfully verifies whether a specific model is installed locally (A15)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3:8b' }],
        }),
      } as Response);

      // gemma4:e4b is NOT in the list!
      const available = await isModelAvailable('gemma4:e4b', 'http://127.0.0.1:11434');
      expect(available).toBe(false);
    });
  });

  describe('generateWithGemma deadlines and fallback (A07)', () => {
    it('successfully extracts response text from Ollama', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'gemma4:e4b',
          response: '{"segments": [{"text": "Hello"}]}',
          done: true,
        }),
      } as Response);

      const res = await generateWithGemma('Explain this', 'gemma4:e4b');
      expect(res).toBe('{"segments": [{"text": "Hello"}]}');
    });

    it('times out and throws when generation exceeds timeout budget', async () => {
      // Mock fetch that hangs until aborted
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          const signal = (init as any)?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new Error('Ollama generation timed out after 50ms'));
            });
          }
        });
      });

      await expect(
        generateWithGemma('prompt', 'gemma4:e4b', { timeoutMs: 50 })
      ).rejects.toThrow(/timed out/i);
    });

    it('aborts when external AbortSignal is cancelled', async () => {
      const controller = new AbortController();

      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          const signal = (init as any)?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new Error('Operation aborted'));
            });
          }
        });
      });

      const genPromise = generateWithGemma('prompt', 'gemma4:e4b', {
        signal: controller.signal,
        timeoutMs: 5000,
      });

      controller.abort();

      await expect(genPromise).rejects.toThrow(/aborted/i);
    });

    it('falls back to gemma4:e2b when gemma4:e4b returns 404 not found', async () => {
      // First call for e4b returns 404
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => 'model not found',
        } as Response)
        // Second call for e2b succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            model: 'gemma4:e2b',
            response: '{"segments": [{"text": "E2B fallback explanation"}]}',
            done: true,
          }),
        } as Response);

      const res = await generateWithGemma('prompt', 'gemma4:e4b', {
        fallbackModel: 'gemma4:e2b',
      });

      expect(res).toContain('E2B fallback explanation');
    });
  });
});
