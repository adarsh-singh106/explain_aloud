import { KokoroTTS } from 'kokoro-js';

let ttsInstance: KokoroTTS | null = null;
let ttsInitPromise: Promise<KokoroTTS> | null = null;

/**
 * Returns the singleton KokoroTTS instance.
 * Thread-safe single-flight promise lock prevents duplicate concurrent model downloads / initialization.
 */
export async function getKokoroInstance(): Promise<KokoroTTS> {
  if (ttsInstance) {
    return ttsInstance;
  }

  if (!ttsInitPromise) {
    ttsInitPromise = KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      {
        dtype: 'q8',
        device: 'wasm',
      }
    )
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
  const rawAudio = await tts.generate(text, { voice });
  return rawAudio.toBlob();
}
