import { describe, expect, it, vi } from 'vitest';
import { KokoroTTS, env } from 'kokoro-js';

describe('KokoroTTS module import', () => {
  it('exports KokoroTTS constructor/object', () => {
    expect(KokoroTTS).toBeDefined();
    expect(typeof KokoroTTS.from_pretrained).toBe('function');
  });

  it('guarantees single-flight initialization under concurrent getKokoroInstance calls (A13)', async () => {
    const { getKokoroInstance } = await import('./services/tts');
    let callCount = 0;

    vi.spyOn(KokoroTTS, 'from_pretrained').mockImplementation(async () => {
      // Runtime overrides must already be local when initialization starts.
      const paths = env.wasmPaths as { mjs: string; wasm: string };
      expect(new URL(paths.mjs).origin).toBe(globalThis.location.origin);
      expect(new URL(paths.wasm).origin).toBe(globalThis.location.origin);
      expect(new URL(paths.mjs).pathname).toContain('ort-wasm-simd-threaded.jsep.mjs');
      expect(new URL(paths.wasm).pathname).toContain('ort-wasm-simd-threaded.jsep.wasm');
      callCount++;
      // Simulate slow model loading
      await new Promise((r) => setTimeout(r, 20));
      return {
        generate: vi.fn(),
      } as any;
    });

    // Fire 3 concurrent initialization calls
    const [inst1, inst2, inst3] = await Promise.all([
      getKokoroInstance(),
      getKokoroInstance(),
      getKokoroInstance(),
    ]);

    expect(callCount).toBe(1);
    expect(inst1).toBe(inst2);
    expect(inst2).toBe(inst3);
  });
});

