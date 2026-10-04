import { describe, expect, it, vi } from 'vitest';
import { AudioQueue, type AudioPlayerAdapter } from './audioQueue';
import type { NarrationPlan } from '@/src/types/narration';

class MockAudioPlayer implements AudioPlayerAdapter {
  public isPlaying = false;
  public isPaused = false;
  public playCount = 0;
  public onEnded?: () => void;

  async playBlob(blob: Blob): Promise<void> {
    this.isPlaying = true;
    this.isPaused = false;
    this.playCount++;
  }

  pause(): void {
    this.isPlaying = false;
    this.isPaused = true;
  }

  async resume(): Promise<void> {
    this.isPlaying = true;
    this.isPaused = false;
  }

  stop(): void {
    this.isPlaying = false;
    this.isPaused = false;
  }

  hasPausedAudio(): boolean {
    return this.isPaused;
  }

  simulateTrackEnd(): void {
    this.isPlaying = false;
    this.onEnded?.();
  }
}

describe('Milestone M6 — AudioQueue Controller', () => {
  const dummyPlan: NarrationPlan = {
    responseId: 'plan-1',
    segments: [
      {
        id: 'seg-1',
        sourceBlockIds: ['b-1'],
        factIds: [],
        provenance: 'rule',
        text: 'First segment.',
        verified: true,
        pauseAfterMs: 50,
      },
      {
        id: 'seg-2',
        sourceBlockIds: ['b-2'],
        factIds: [],
        provenance: 'rule',
        text: 'Second segment.',
        verified: true,
        pauseAfterMs: 50,
      },
      {
        id: 'seg-3',
        sourceBlockIds: ['b-3'],
        factIds: [],
        provenance: 'rule',
        text: 'Third segment.',
        verified: true,
        pauseAfterMs: 50,
      },
    ],
  };

  it('initializes in idle state and transitions to playing on play()', async () => {
    const mockPlayer = new MockAudioPlayer();
    const mockSynthesizer = vi.fn().mockResolvedValue(new Blob(['fake audio']));
    const onStart = vi.fn();

    const queue = new AudioQueue({
      player: mockPlayer,
      synthesizer: mockSynthesizer,
      onSegmentStart: onStart,
    });

    queue.loadPlan(dummyPlan);
    expect(queue.getState()).toBe('idle');

    await queue.play();

    expect(queue.getState()).toBe('playing');
    expect(mockPlayer.isPlaying).toBe(true);
    expect(mockSynthesizer).toHaveBeenCalledWith('First segment.');
    expect(onStart).toHaveBeenCalledWith(dummyPlan.segments[0], 0);
  });

  it('pauses and resumes playback', async () => {
    const mockPlayer = new MockAudioPlayer();
    const mockSynthesizer = vi.fn().mockResolvedValue(new Blob(['fake audio']));

    const queue = new AudioQueue({
      player: mockPlayer,
      synthesizer: mockSynthesizer,
    });

    queue.loadPlan(dummyPlan);
    await queue.play();

    queue.pause();
    expect(queue.getState()).toBe('paused');
    expect(mockPlayer.isPaused).toBe(true);

    await queue.play();
    expect(queue.getState()).toBe('playing');
    expect(mockPlayer.isPlaying).toBe(true);
  });

  it('skips to the next segment immediately', async () => {
    const mockPlayer = new MockAudioPlayer();
    const mockSynthesizer = vi.fn().mockResolvedValue(new Blob(['fake audio']));
    const onStart = vi.fn();

    const queue = new AudioQueue({
      player: mockPlayer,
      synthesizer: mockSynthesizer,
      onSegmentStart: onStart,
    });

    queue.loadPlan(dummyPlan);
    await queue.play();

    expect(queue.getCurrentIndex()).toBe(0);

    await queue.skip();

    expect(queue.getCurrentIndex()).toBe(1);
    expect(onStart).toHaveBeenCalledWith(dummyPlan.segments[1], 1);
  });

  it('cancels playback immediately and resets index to 0', async () => {
    const mockPlayer = new MockAudioPlayer();
    const mockSynthesizer = vi.fn().mockResolvedValue(new Blob(['fake audio']));

    const queue = new AudioQueue({
      player: mockPlayer,
      synthesizer: mockSynthesizer,
    });

    queue.loadPlan(dummyPlan);
    await queue.play();

    queue.cancel();

    expect(queue.getState()).toBe('stopped');
    expect(queue.getCurrentIndex()).toBe(0);
    expect(mockPlayer.isPlaying).toBe(false);
  });

  it('automatically advances through segments when each finishes', async () => {
    const mockPlayer = new MockAudioPlayer();
    const mockSynthesizer = vi.fn().mockResolvedValue(new Blob(['fake audio']));
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const queue = new AudioQueue({
      player: mockPlayer,
      synthesizer: mockSynthesizer,
      onSegmentStart: onStart,
      onSegmentEnd: onEnd,
    });

    queue.loadPlan(dummyPlan);
    await queue.play();

    expect(queue.getCurrentIndex()).toBe(0);

    // Track 0 finishes
    mockPlayer.simulateTrackEnd();
    await new Promise((r) => setTimeout(r, 60));

    expect(queue.getCurrentIndex()).toBe(1);
    expect(onEnd).toHaveBeenCalledWith(dummyPlan.segments[0], 0);
    expect(onStart).toHaveBeenCalledWith(dummyPlan.segments[1], 1);
  });

  // --- Audit Reproductions & Acceptance Assertions (A06) ---

  it('prevents audio playback when paused during pending synthesis (A06 probe 1)', async () => {
    let resolveSynth: ((blob: Blob) => void) | null = null;
    const slowSynthesizer = vi.fn().mockImplementation(() => {
      return new Promise<Blob>((resolve) => {
        resolveSynth = resolve;
      });
    });

    const mockPlayer = new MockAudioPlayer();
    const queue = new AudioQueue({
      player: mockPlayer,
      synthesizer: slowSynthesizer,
    });

    queue.loadPlan(dummyPlan);
    const playPromise = queue.play();

    // User pauses while synthesis is still running
    queue.pause();
    expect(queue.getState()).toBe('paused');

    // Synthesis now completes
    resolveSynth!(new Blob(['late audio']));
    await playPromise;

    // Must NOT start playing audio while in paused state!
    expect(queue.getState()).toBe('paused');
    expect(mockPlayer.isPlaying).toBe(false);
  });

  it('cancels stale synthesis when cancel + load new plan occurs (A06 probe 2)', async () => {
    let resolveOldSynth: any = null;
    const mockSynthesizer = vi.fn().mockImplementation((text: string) => {
      if (text === 'Old Plan Segment') {
        return new Promise<Blob>((resolve) => {
          resolveOldSynth = resolve;
        });
      }
      return Promise.resolve(new Blob(['new audio']));
    });

    const mockPlayer = new MockAudioPlayer();
    const queue = new AudioQueue({
      player: mockPlayer,
      synthesizer: mockSynthesizer,
    });

    // Start old plan
    queue.loadPlan({
      responseId: 'old-plan',
      segments: [{ id: 's-old', sourceBlockIds: ['b-old'], factIds: [], provenance: 'literal', text: 'Old Plan Segment', verified: true, pauseAfterMs: 0 }],
    });
    queue.play();

    // Cancel old plan, load new plan, and start playing new plan
    queue.cancel();
    queue.loadPlan({
      responseId: 'new-plan',
      segments: [{ id: 's-new', sourceBlockIds: ['b-new'], factIds: [], provenance: 'literal', text: 'New Plan Segment', verified: true, pauseAfterMs: 0 }],
    });
    await queue.play();

    // Now old synthesis finally resolves
    if (resolveOldSynth) {
      resolveOldSynth(new Blob(['stale audio']));
    }

    // Play count should only reflect the new plan, not the cancelled old plan
    expect(mockPlayer.playCount).toBe(1);
  });

  it('properly advances and resumes when skipped while paused (A06 probe 3)', async () => {
    const mockPlayer = new MockAudioPlayer();
    const mockSynthesizer = vi.fn().mockResolvedValue(new Blob(['fake audio']));
    const onStart = vi.fn();

    const queue = new AudioQueue({
      player: mockPlayer,
      synthesizer: mockSynthesizer,
      onSegmentStart: onStart,
    });

    queue.loadPlan(dummyPlan);
    await queue.play();

    // Pause first segment
    queue.pause();
    expect(queue.getState()).toBe('paused');

    // Skip to next segment while paused
    await queue.skip();
    expect(queue.getCurrentIndex()).toBe(1);
    expect(queue.getState()).toBe('paused');

    // Now resume
    await queue.play();
    expect(queue.getState()).toBe('playing');
    expect(mockPlayer.isPlaying).toBe(true);
    expect(onStart).toHaveBeenCalledWith(dummyPlan.segments[1], 1);
  });
});
