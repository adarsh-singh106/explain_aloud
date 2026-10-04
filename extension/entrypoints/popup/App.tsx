import { useState, useEffect, useRef } from 'react';
import './App.css';
import { checkOllamaServer, isModelAvailable } from '@/src/services/ollama';
import {
  executePipelineFromHtml,
  buildNarrationPlanFromIR,
  type PipelineResult,
} from '@/src/pipeline/pipeline';
import { MIXED_RESPONSE_FIXTURE_HTML } from '@/src/pipeline/fixtureData';
import { AudioQueue, type AudioQueueState } from '@/src/audio/audioQueue';
import type { NarrationMode } from '@/src/narrator/llmNarrator';
import type { NarrationSegment } from '@/src/types/narration';
import type { ResponseIR } from '@/src/types/ir';

export default function App() {
  const [statusText, setStatusText] = useState('Checking Ollama...');
  const [statusClass, setStatusClass] = useState<'online' | 'offline' | 'checking'>('checking');
  const [mode, setMode] = useState<NarrationMode>('natural');
  const [loading, setLoading] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [playbackState, setPlaybackState] = useState<AudioQueueState>('idle');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [currentSegment, setCurrentSegment] = useState<NarrationSegment | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioQueueRef = useRef<AudioQueue | null>(null);
  const activeIRRef = useRef<ResponseIR | null>(null);

  const runPipelineOnIR = async (ir: ResponseIR, targetMode: NarrationMode) => {
    setLoading(true);
    setErrorMessage(null);
    audioQueueRef.current?.cancel();

    try {
      const result = await buildNarrationPlanFromIR(ir, {
        mode: targetMode,
        responseId: ir.responseId,
      });

      setPipelineResult(result);
      audioQueueRef.current?.loadPlan(result.plan);
      setCurrentSegmentIndex(0);
      setCurrentSegment(result.plan.segments[0] || null);

      // Auto-start playback on newly extracted response
      await audioQueueRef.current?.play();
    } catch (err: any) {
      console.error('Pipeline error:', err);
      setErrorMessage(`Pipeline Error: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check model presence truthfully (A15)
    async function checkModelStatus() {
      const online = await checkOllamaServer();
      if (!online) {
        setStatusText('Ollama Offline');
        setStatusClass('offline');
        return;
      }
      const hasE4B = await isModelAvailable('gemma4:e4b');
      if (hasE4B) {
        setStatusText('Gemma 4 (E4B) Ready');
        setStatusClass('online');
        return;
      }
      const hasE2B = await isModelAvailable('gemma4:e2b');
      if (hasE2B) {
        setStatusText('Gemma 4 (E2B) Ready');
        setStatusClass('online');
        return;
      }
      setStatusText('Ollama Online (No Gemma 4)');
      setStatusClass('offline');
    }

    checkModelStatus();

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

    // Check if background service worker has an active extracted turn from ChatGPT (A04)
    browser.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' })
      .then((res: any) => {
        if (res?.ir) {
          activeIRRef.current = res.ir;
          runPipelineOnIR(res.ir, mode);
        }
      })
      .catch(() => {});

    // Listen for live turn selection events
    const handleMessage = (msg: any) => {
      if ((msg?.type === 'EXPLAIN_ALOUD_EXTRACTED' || msg?.type === 'EXPLAIN_ALOUD_SESSION_UPDATED') && msg.ir) {
        activeIRRef.current = msg.ir;
        runPipelineOnIR(msg.ir, mode);
      }
    };

    browser.runtime.onMessage.addListener(handleMessage);

    return () => {
      browser.runtime.onMessage.removeListener(handleMessage);
      queue.cancel();
    };
  }, []);

  const handleLoadFixture = async (targetMode = mode) => {
    setLoading(true);
    setErrorMessage(null);
    audioQueueRef.current?.cancel();

    try {
      const result = await executePipelineFromHtml(MIXED_RESPONSE_FIXTURE_HTML, {
        mode: targetMode,
        responseId: `fixture-${Date.now()}`,
      });

      activeIRRef.current = result.ir;
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

  const handleModeToggle = async (newMode: NarrationMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    if (activeIRRef.current) {
      await runPipelineOnIR(activeIRRef.current, newMode);
    } else if (pipelineResult) {
      await handleLoadFixture(newMode);
    }
  };

  const handlePlay = async () => {
    if (!pipelineResult) {
      await handleLoadFixture();
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
          <svg className="brand-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
          <h2>Explain Aloud</h2>
        </div>
        <span className={`status-pill ${statusClass}`}>
          {statusText}
        </span>
      </header>

      {/* Mode Selector */}
      <div className="mode-toggle-group">
        <button
          className={`mode-btn ${mode === 'natural' ? 'active' : ''}`}
          onClick={() => handleModeToggle('natural')}
          aria-pressed={mode === 'natural'}
        >
          Natural Mode
        </button>
        <button
          className={`mode-btn ${mode === 'literal' ? 'active' : ''}`}
          onClick={() => handleModeToggle('literal')}
          aria-pressed={mode === 'literal'}
        >
          Literal Mode
        </button>
      </div>

      {/* Action Area */}
      <div className="action-row">
        <button
          className="btn demo-fixture-btn"
          onClick={() => handleLoadFixture(mode)}
          disabled={loading}
        >
          {loading ? 'Analyzing & Narrating...' : 'Demo: Load Mixed Response Fixture'}
        </button>
      </div>

      {pipelineResult && (
        <div className="source-info-bar">
          <span className="source-id-label">Source: <strong>{pipelineResult.ir.responseId}</strong></span>
          <span className="block-count-label">{pipelineResult.ir.blocks.length} blocks detected</span>
        </div>
      )}

      {errorMessage && (
        <div className="error-banner">{errorMessage}</div>
      )}

      {/* Playback Controls */}
      {pipelineResult && (
        <section className="playback-panel">
          <div className="controls-row">
            {playbackState === 'playing' ? (
              <button className="ctrl-btn pause" onClick={handlePause} title="Pause playback">
                ⏸ Pause
              </button>
            ) : (
              <button className="ctrl-btn play" onClick={handlePlay} title="Start / Resume playback">
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
                {currentSegment.fallbackReason ? (
                  <span className="fallback-badge" title={currentSegment.fallbackReason}>⚠️ Fallback</span>
                ) : currentSegment.verified ? (
                  <span className="verified-badge">✓ Verified</span>
                ) : (
                  <span className="unverified-badge">⚠️ Unverified</span>
                )}
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
