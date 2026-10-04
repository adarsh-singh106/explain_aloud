import { useState, useEffect } from 'react';
import './App.css';
import { checkOllamaServer, generateWithGemma } from '@/src/services/ollama';
import { synthesizeSpeech } from '@/src/services/tts';

export default function App() {
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [ttsStatus, setTtsStatus] = useState<string>('Idle');
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [gemmaStatus, setGemmaStatus] = useState<string>('Idle');
  const [gemmaResponse, setGemmaResponse] = useState<string | null>(null);

  useEffect(() => {
    checkOllamaServer().then((online) => setOllamaOnline(online));
  }, []);

  const handleTestTts = async () => {
    try {
      setTtsStatus('Synthesizing with Kokoro TTS (WASM)...');
      const blob = await synthesizeSpeech('Explain Aloud is ready.', 'af_heart');
      const url = URL.createObjectURL(blob);
      setTtsAudioUrl(url);
      setTtsStatus('Playing audio');
      const audio = new Audio(url);
      audio.onended = () => setTtsStatus('Audio playback complete');
      await audio.play();
    } catch (err: any) {
      console.error('TTS error:', err);
      setTtsStatus(`TTS Error: ${err.message || String(err)}`);
    }
  };

  const handleTestGemma = async () => {
    try {
      setGemmaStatus('Querying Gemma 4 via Ollama...');
      setGemmaResponse(null);
      const prompt = `Return JSON only.

Facts:
- Model A accuracy: 92%
- Model B accuracy: 88%
- Model A latency: 4 seconds
- Model B latency: 1 second

Write one natural spoken comparison.
Do not add facts.`;

      const response = await generateWithGemma(prompt, 'gemma4:e4b');
      setGemmaResponse(response);
      setGemmaStatus('Completed');
    } catch (err: any) {
      console.error('Gemma error:', err);
      setGemmaStatus(`Gemma Error: ${err.message || String(err)}`);
    }
  };

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h2>Explain Aloud</h2>
        <span className={`status-pill ${ollamaOnline ? 'online' : 'offline'}`}>
          Ollama: {ollamaOnline === null ? 'Checking...' : ollamaOnline ? 'Online' : 'Offline'}
        </span>
      </header>

      <section className="card">
        <h3>1. Kokoro TTS (M0)</h3>
        <p className="description">Verify local text-to-speech with Kokoro-82M (WASM).</p>
        <button onClick={handleTestTts} className="btn primary">
          Speak: "Explain Aloud is ready."
        </button>
        <div className="status-box">{ttsStatus}</div>
        {ttsAudioUrl && (
          <audio controls src={ttsAudioUrl} className="audio-player" autoPlay />
        )}
      </section>

      <section className="card">
        <h3>2. Local Gemma 4 (M0)</h3>
        <p className="description">Verify local narration wording via Ollama Gemma 4.</p>
        <button onClick={handleTestGemma} className="btn secondary" disabled={!ollamaOnline}>
          Run Gemma Comparison Prompt
        </button>
        <div className="status-box">{gemmaStatus}</div>
        {gemmaResponse && (
          <pre className="output-box">{gemmaResponse}</pre>
        )}
      </section>
    </div>
  );
}
