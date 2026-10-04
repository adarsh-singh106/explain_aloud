export type Provenance = 'rule' | 'llm' | 'literal';

export interface NarrationSegment {
  id: string;
  sourceBlockIds: string[];
  factIds: string[];
  provenance: Provenance;
  text: string;
  verified: boolean;
  fallbackReason?: string;
  pauseAfterMs: number;
}

export interface NarrationPlan {
  responseId: string;
  segments: NarrationSegment[];
}
