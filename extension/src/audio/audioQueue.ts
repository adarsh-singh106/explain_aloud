import type { NarrationSegment, NarrationPlan } from '@/src/types/narration';
import { synthesizeSpeech } from '@/src/services/tts';

export type AudioQueueState = 'idle' | 'playing' | 'paused' | 'stopped' | 'error';

export interface AudioPlayerAdapter {
  playBlob(blob: Blob): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  stop(): void;
  hasPausedAudio?(): boolean;
  onEnded?: () => void;
}

/**
 * Standard browser audio player using HTMLAudioElement and ObjectURLs.
 */
export class BrowserAudioPlayer implements AudioPlayerAdapter {
  private audioElement: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  public onEnded?: () => void;

  async playBlob(blob: Blob): Promise<void> {
    this.stop();
    this.currentUrl = URL.createObjectURL(blob);
    this.audioElement = new Audio(this.currentUrl);

    this.audioElement.onended = () => {
      this.cleanup();
      this.onEnded?.();
    };

    await this.audioElement.play();
  }

  pause(): void {
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
    }
  }

  async resume(): Promise<void> {
    if (this.audioElement && this.audioElement.paused) {
      await this.audioElement.play();
    }
  }

  stop(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement.onended = null;
      this.audioElement = null;
    }
    this.cleanup();
  }

  hasPausedAudio(): boolean {
    return this.audioElement !== null && this.audioElement.paused;
  }

  private cleanup(): void {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }
}

export type SynthesizerFn = (text: string) => Promise<Blob>;

export interface AudioQueueOptions {
  player?: AudioPlayerAdapter;
  synthesizer?: SynthesizerFn;
  onStateChange?: (state: AudioQueueState) => void;
  onSegmentStart?: (segment: NarrationSegment, index: number) => void;
  onSegmentEnd?: (segment: NarrationSegment, index: number) => void;
  onError?: (error: Error) => void;
}

export class AudioQueue {
  private segments: NarrationSegment[] = [];
  private currentIndex = 0;
  private state: AudioQueueState = 'idle';
  private player: AudioPlayerAdapter;
  private synthesizer: SynthesizerFn;
  private options: AudioQueueOptions;
  private clickedAt: number | undefined;

  // Race-prevention tokens
  private playbackSessionId = 0;
  private activeSegmentToken = 0;

  // Timers and caches
  private interSegmentTimer: any = null;
  private audioCache = new Map<number, Promise<Blob>>();
  private loadedBlobs = new Map<number, Blob>();

  constructor(options: AudioQueueOptions = {}) {
    this.options = options;
    this.player = options.player || new BrowserAudioPlayer();
    this.synthesizer = options.synthesizer || ((text: string) => synthesizeSpeech(text, 'af_heart'));

    this.player.onEnded = () => {
      this.handleCurrentSegmentFinished();
    };
  }

  public getState(): AudioQueueState {
    return this.state;
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public getSegments(): NarrationSegment[] {
    return this.segments;
  }

  public loadPlan(plan: NarrationPlan, clickedAt?: number): void {
    this.clickedAt = clickedAt;
    this.clearInterSegmentTimer();
    this.playbackSessionId++;
    this.activeSegmentToken++;
    this.player.stop();

    this.segments = [...plan.segments];
    this.currentIndex = 0;
    this.audioCache.clear();
    this.loadedBlobs.clear();
    this.setState('idle');
  }

  public async play(): Promise<void> {
    if (this.state === 'paused') {
      const hasActualPausedAudio = this.player.hasPausedAudio ? this.player.hasPausedAudio() : false;
      this.setState('playing');

      if (hasActualPausedAudio) {
        await this.player.resume();
      } else {
        // Paused while synthesizing or skipped while paused: load & start segment
        await this.playCurrentSegment();
      }
      return;
    }

    if (this.segments.length === 0) {
      this.setState('idle');
      return;
    }

    this.playbackSessionId++;
    this.setState('playing');
    await this.playCurrentSegment();
  }

  public pause(): void {
    if (this.state === 'playing') {
      this.clearInterSegmentTimer();
      this.player.pause();
      this.setState('paused');
    }
  }

  public async skip(): Promise<void> {
    if (this.state === 'idle' || this.state === 'stopped') {
      return;
    }

    this.clearInterSegmentTimer();
    this.player.stop();
    this.activeSegmentToken++;

    const current = this.segments[this.currentIndex];
    if (current) {
      this.options.onSegmentEnd?.(current, this.currentIndex);
    }

    // Release finished segment audio
    this.audioCache.delete(this.currentIndex);
    this.loadedBlobs.delete(this.currentIndex);

    if (this.currentIndex < this.segments.length - 1) {
      this.currentIndex++;
      if (this.state === 'playing') {
        await this.playCurrentSegment();
      }
      // If paused, stay paused at the next segment index
    } else {
      this.cancel();
    }
  }

  public cancel(): void {
    this.clickedAt = undefined;
    this.clearInterSegmentTimer();
    this.playbackSessionId++;
    this.activeSegmentToken++;
    this.player.stop();
    this.currentIndex = 0;
    this.audioCache.clear();
    this.loadedBlobs.clear();
    this.setState('stopped');
  }

  private clearInterSegmentTimer(): void {
    if (this.interSegmentTimer) {
      clearTimeout(this.interSegmentTimer);
      this.interSegmentTimer = null;
    }
  }

  private setState(newState: AudioQueueState): void {
    this.state = newState;
    this.options.onStateChange?.(newState);
  }

  private prefetch(index: number): Promise<Blob> | null {
    if (index >= this.segments.length) return null;
    const existing = this.audioCache.get(index);
    if (existing) return existing;

    const segment = this.segments[index];
    if (!segment) return null;

    const promise = this.synthesizer(segment.text);
    // Attach error handler to prevent unhandled rejections
    promise.catch(() => {});
    this.audioCache.set(index, promise);
    return promise;
  }

  private async playCurrentSegment(): Promise<void> {
    const sessionId = this.playbackSessionId;
    const segmentToken = ++this.activeSegmentToken;
    const targetIndex = this.currentIndex;

    if (targetIndex >= this.segments.length) {
      this.setState('stopped');
      return;
    }

    const segment = this.segments[targetIndex]!;
    this.options.onSegmentStart?.(segment, targetIndex);

    // Prefetch next segment
    this.prefetch(targetIndex + 1);

    try {
      let audioBlob = this.loadedBlobs.get(targetIndex);
      if (!audioBlob) {
        const audioPromise = this.prefetch(targetIndex) || this.synthesizer(segment.text);
        audioBlob = await audioPromise;
      }

      // Stale check after await
      if (this.playbackSessionId !== sessionId || this.activeSegmentToken !== segmentToken) {
        return;
      }

      // If user paused while synthesis was pending, cache the blob and do not play audio
      if (this.state === 'paused') {
        this.loadedBlobs.set(targetIndex, audioBlob);
        return;
      }

      if (this.state === 'stopped' || this.state === 'idle') {
        return;
      }

      await this.player.playBlob(audioBlob);
      if (this.playbackSessionId === sessionId && this.activeSegmentToken === segmentToken &&
          typeof this.clickedAt === 'number' && Number.isFinite(this.clickedAt)) {
        console.info('[Explain Aloud timing]', {
          phase: 'click-to-first-audio (play promise resolved)',
          durationMs: Number((performance.timeOrigin + performance.now() - this.clickedAt).toFixed(2)),
        });
        this.clickedAt = undefined;
      }
    } catch (err: any) {
      if (this.playbackSessionId !== sessionId || this.activeSegmentToken !== segmentToken) {
        return;
      }
      this.setState('error');
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async handleCurrentSegmentFinished(): Promise<void> {
    const currentSession = this.playbackSessionId;
    const currentToken = this.activeSegmentToken;
    const finishedIndex = this.currentIndex;

    const current = this.segments[finishedIndex];
    if (current) {
      this.options.onSegmentEnd?.(current, finishedIndex);
      // Release finished audio buffer from memory
      this.audioCache.delete(finishedIndex);
      this.loadedBlobs.delete(finishedIndex);

      // Handle pauseAfterMs spacing with cancelable timer
      if (current.pauseAfterMs > 0) {
        await new Promise<void>((resolve) => {
          this.interSegmentTimer = setTimeout(() => {
            this.interSegmentTimer = null;
            resolve();
          }, current.pauseAfterMs);
        });
      }
    }

    // Check if session or state invalidated during inter-segment pause
    if (this.playbackSessionId !== currentSession || this.activeSegmentToken !== currentToken) {
      return;
    }
    if (this.state !== 'playing') {
      return;
    }

    if (this.currentIndex < this.segments.length - 1) {
      this.currentIndex++;
      await this.playCurrentSegment();
    } else {
      this.setState('stopped');
      this.currentIndex = 0;
    }
  }
}
