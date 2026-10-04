import type { NarrationSegment, NarrationPlan } from '@/src/types/narration';
import { synthesizeSpeech } from '@/src/services/tts';

export type AudioQueueState = 'idle' | 'playing' | 'paused' | 'stopped' | 'error';

export interface AudioPlayerAdapter {
  playBlob(blob: Blob): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  stop(): void;
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
  private isCancelled = false;
  private audioCache = new Map<number, Promise<Blob>>();

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

  public loadPlan(plan: NarrationPlan): void {
    this.cancel();
    this.segments = [...plan.segments];
    this.currentIndex = 0;
    this.audioCache.clear();
    this.setState('idle');
  }

  public async play(): Promise<void> {
    if (this.state === 'paused') {
      this.setState('playing');
      await this.player.resume();
      return;
    }

    if (this.segments.length === 0) {
      this.setState('idle');
      return;
    }

    this.isCancelled = false;
    this.setState('playing');
    await this.playCurrentSegment();
  }

  public pause(): void {
    if (this.state === 'playing') {
      this.player.pause();
      this.setState('paused');
    }
  }

  public async skip(): Promise<void> {
    if (this.state === 'idle' || this.state === 'stopped') {
      return;
    }

    this.player.stop();
    const current = this.segments[this.currentIndex];
    if (current) {
      this.options.onSegmentEnd?.(current, this.currentIndex);
    }

    if (this.currentIndex < this.segments.length - 1) {
      this.currentIndex++;
      if (this.state === 'playing') {
        await this.playCurrentSegment();
      }
    } else {
      this.cancel();
    }
  }

  public cancel(): void {
    this.isCancelled = true;
    this.player.stop();
    this.currentIndex = 0;
    this.audioCache.clear();
    this.setState('stopped');
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
    this.audioCache.set(index, promise);
    return promise;
  }

  private async playCurrentSegment(): Promise<void> {
    if (this.isCancelled || this.currentIndex >= this.segments.length) {
      this.setState('stopped');
      return;
    }

    const segment = this.segments[this.currentIndex]!;
    this.options.onSegmentStart?.(segment, this.currentIndex);

    // Prefetch the subsequent segment while current starts
    this.prefetch(this.currentIndex + 1);

    try {
      // Get or synthesize current audio
      const audioPromise = this.prefetch(this.currentIndex) || this.synthesizer(segment.text);
      const audioBlob = await audioPromise;

      if (this.isCancelled) return;

      await this.player.playBlob(audioBlob);
    } catch (err: any) {
      this.setState('error');
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async handleCurrentSegmentFinished(): Promise<void> {
    if (this.isCancelled) return;

    const current = this.segments[this.currentIndex];
    if (current) {
      this.options.onSegmentEnd?.(current, this.currentIndex);

      // Handle pauseAfterMs spacing
      if (current.pauseAfterMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, current.pauseAfterMs));
      }
    }

    if (this.isCancelled) return;

    if (this.currentIndex < this.segments.length - 1) {
      this.currentIndex++;
      await this.playCurrentSegment();
    } else {
      this.setState('stopped');
      this.currentIndex = 0;
    }
  }
}
