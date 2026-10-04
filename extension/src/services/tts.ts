import { KokoroTTS } from 'kokoro-js';

let ttsInstance: KokoroTTS | null = null;

export async function getKokoroInstance(): Promise<KokoroTTS> {
  if (!ttsInstance) {
    ttsInstance = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      {
        dtype: 'q8',
        device: 'wasm',
      }
    );
  }
  return ttsInstance;
}

export async function synthesizeSpeech(
  text: string,
  voice: 'af_heart' = 'af_heart'
): Promise<Blob> {
  const tts = await getKokoroInstance();
  const rawAudio = await tts.generate(text, { voice });
  return rawAudio.toBlob();
}
