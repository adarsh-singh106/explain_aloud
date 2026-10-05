import { KokoroTTS, env } from 'kokoro-js';
import { measureAsync, reportTiming } from '@/src/services/timing';
import ortModuleUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';

let ttsInstance: KokoroTTS | null = null;
let ttsInitPromise: Promise<KokoroTTS> | null = null;

/**
 * Returns the singleton KokoroTTS instance.
 * Thread-safe single-flight promise lock prevents duplicate concurrent model downloads / initialization.
 */
export async function getKokoroInstance(): Promise<KokoroTTS> {
  const started = performance.now();
  if (ttsInstance) {
    reportTiming('Kokoro initialization (reuse)', started);
    return ttsInstance;
  }

  if (!ttsInitPromise) {
    // MV3 cannot import remote executable code. Bundle both matching runtime
    // assets and override the Transformers.js CDN default before model loading.
    env.wasmPaths = {
      mjs: new URL(ortModuleUrl, globalThis.location.href).href,
      wasm: new URL(ortWasmUrl, globalThis.location.href).href,
    };
    ttsInitPromise = measureAsync('Kokoro initialization (cold)', () => KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      {
        dtype: 'q8',
        device: 'wasm',
      }
    ))
      .then((instance) => {
        ttsInstance = instance;
        return instance;
      })
      .catch((err) => {
        // Clear cached promise on failure so next attempt can retry
        ttsInitPromise = null;
        throw err;
      });
  }

  return ttsInitPromise;
}

export async function synthesizeSpeech(
  text: string,
  voice: 'af_heart' = 'af_heart'
): Promise<Blob> {
  const tts = await getKokoroInstance();
  const rawAudio = await measureAsync('Kokoro synthesis (per segment)', () => tts.generate(text, { voice }));
  return rawAudio.toBlob();
}
