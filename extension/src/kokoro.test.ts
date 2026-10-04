import { describe, expect, it } from 'vitest';
import { KokoroTTS } from 'kokoro-js';

describe('KokoroTTS module import', () => {
  it('exports KokoroTTS constructor/object', () => {
    expect(KokoroTTS).toBeDefined();
    expect(typeof KokoroTTS.from_pretrained).toBe('function');
  });
});
