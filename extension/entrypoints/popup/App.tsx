import { useState, useEffect, useRef } from 'react';
import './App.css';
import { checkOllamaServer } from '@/src/services/ollama';
import { executePipelineFromHtml, type PipelineResult } from '@/src/pipeline/pipeline';
import { MIXED_RESPONSE_FIXTURE_HTML } from '@/src/pipeline/fixtureData';
import { AudioQueue, type AudioQueueState } from '@/src/audio/audioQueue';
import type { NarrationMode } from '@/src/narrator/llmNarrator';
import type { NarrationSegment } from '@/src/types/narration';

export default function App() {
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [mode, setMode] = useState<NarrationMode>('natural');
  const [loading, setLoading] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [playbackState, setPlaybackState] = useState<AudioQueueState>('idle');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [currentSegment, setCurrentSegment] = useState<NarrationSegment | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioQueueRef = useRef<AudioQueue | null>(null);

  useEffect(() => {
    checkOllamaServer().then((online) => setOllamaOnline(online));

    // Initialize AudioQueue
    const queue = new AudioQueue({
      onStateChange: (state) => setPlaybackState(state),
      onSegmentStart: (seg, idx) => {
        setCurrentSegment(seg);
        setCurrentSegmentIndex(idx);
      },
      onSegmentEnd: () => {
        // Handled automatically
      },
      onError: (err) => {
        setErrorMessage(err.message || String(err));
      },
    });

    audioQueueRef.current = queue;

    return () => {
      queue.cancel();
    };
  }, []);

  const handleGeneratePlan = async () => {
    setLoading(true);
    setErrorMessage(null);
    audioQueueRef.current?.cancel();

    try {
      const result = await executePipelineFromHtml(MIXED_RESPONSE_FIXTURE_HTML, {
        mode,
        responseId: `fixture-${Date.now()}`,
      });

      setPipelineResult(result);
      audioQueueRef.current?.loadPlan(result.plan);
      setCurrentSegmentIndex(0);
      setCurrentSegment(result.plan.segments[0] || null);
    } catch (err: any) {
      console.error('Pipeline error:', err);
      setErrorMessage(`Pipeline Error: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async () => {
    if (!pipelineResult) {
      await handleGeneratePlan();
    }
    audioQueueRef.current?.play();
  };

  const handlePause = () => {
    audioQueueRef.current?.pause();
  };

  const handleSkip = () => {
    audioQueueRef.current?.skip();
  };

  const handleCancel = () => {
    audioQueueRef.current?.cancel();
    setCurrentSegment(null);
    setCurrentSegmentIndex(0);
  };

  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="brand">
          <svg className="brand-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
          <h2>Explain Aloud</h2>
        </div>
        <span className={`status-pill ${ollamaOnline ? 'online' : 'offline'}`}>
          Ollama: {ollamaOnline === null ? '...' : ollamaOnline ? 'Gemma 4 Ready' : 'Offline'}
        </span>
      </header>

      {/* Mode Selector */}
      <div className="mode-toggle-group">
        <button
          className={`mode-btn ${mode === 'natural' ? 'active' : ''}`}
          onClick={() => setMode('natural')}
        >
          Natural Mode
        </button>
        <button
          className={`mode-btn ${mode === 'literal' ? 'active' : ''}`}
          onClick={() => setMode('literal')}
        >
          Literal Mode
        </button>
      </div>

      {/* Primary Action Button */}
      <div className="action-row">
        <button
          className="btn primary-action-btn"
          onClick={handleGeneratePlan}
          disabled={loading}
        >
          {loading ? 'Analyzing & Narrating...' : 'Load & Narrate Fixture'}
        </button>
      </div>

      {errorMessage && (
        <div className="error-banner">{errorMessage}</div>
      )}

      {/* Playback Controls */}
      {pipelineResult && (
        <section className="playback-panel">
          <div className="playback-controls">
            {playbackState === 'playing' ? (
              <button className="ctrl-btn pause" onClick={handlePause} title="Pause">
                ⏸ Pause
              </button>
            ) : (
              <button className="ctrl-btn play" onClick={handlePlay} title="Play">
                ▶ Play
              </button>
            )}
            <button className="ctrl-btn skip" onClick={handleSkip} title="Skip to next segment">
              ⏭ Skip
            </button>
            <button className="ctrl-btn cancel" onClick={handleCancel} title="Cancel playback">
              ⏹ Cancel
            </button>
          </div>

          <div className="playback-meta">
            <span className="state-label">State: <strong>{playbackState.toUpperCase()}</strong></span>
            <span className="segment-counter">
              Segment {currentSegmentIndex + 1} of {pipelineResult.plan.segments.length}
            </span>
          </div>

          {currentSegment && (
            <div className="active-segment-card">
              <div className="card-badge-row">
                <span className={`provenance-badge ${currentSegment.provenance}`}>
                  {currentSegment.provenance.toUpperCase()}
                </span>
                <span className="verified-badge">✓ Verified</span>
              </div>
              <p className="active-segment-text">"{currentSegment.text}"</p>
            </div>
          )}
        </section>
      )}

      {/* Segments Inspector */}
      {pipelineResult && (
        <section className="inspection-section">
          <h3>
            Narration Plan Segments
            <span className="stats-badge">
              {pipelineResult.validationStats.passedCount} passed
              {pipelineResult.validationStats.fallbackCount > 0 && ` • ${pipelineResult.validationStats.fallbackCount} fallback`}
            </span>
          </h3>

          <div className="segments-scroll-list">
            {pipelineResult.plan.segments.map((seg, idx) => {
              const isActive = idx === currentSegmentIndex && playbackState === 'playing';
              return (
                <div
                  key={seg.id}
                  className={`segment-item ${isActive ? 'active' : ''}`}
                >
                  <div className="segment-item-header">
                    <span className="segment-number">#{idx + 1}</span>
                    <span className={`provenance-badge small ${seg.provenance}`}>
                      {seg.provenance}
                    </span>
                    {seg.fallbackReason && (
                      <span className="fallback-badge" title={seg.fallbackReason}>
                        Fallback
                      </span>
                    )}
                    <span className="source-ref">
                      Blocks: {seg.sourceBlockIds.join(', ')}
                    </span>
                  </div>
                  <p className="segment-item-text">{seg.text}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
