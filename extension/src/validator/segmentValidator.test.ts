import { describe, expect, it } from 'vitest';
import type { Block, Fact, TableStructured } from '@/src/types/ir';
import type { NarrationSegment, NarrationPlan } from '@/src/types/narration';
import { validateSegment, validateNarrationPlan } from './segmentValidator';
import { extractTableFacts } from '@/src/table/tableEngine';

describe('Milestone M5 — Validator & Fallback Engine', () => {
  const tableBlock: Block = {
    id: 'block-table-1',
    order: 4,
    type: 'table',
    raw: '<table>...</table>',
    structured: {
      headers: ['Model', 'Accuracy', 'Latency'],
      rows: [
        ['A', '92%', '4 sec'],
        ['B', '88%', '1 sec'],
        ['C', '90%', '2 sec'],
      ],
    } as TableStructured,
  };

  const facts: Fact[] = extractTableFacts(tableBlock);

  describe('validateSegment', () => {
    it('passes truthful table segment matching extracted facts', () => {
      const segment: NarrationSegment = {
        id: 'seg-1',
        sourceBlockIds: ['block-table-1'],
        factIds: ['fact-block-table-1-num-0'],
        provenance: 'llm',
        text: 'Model A leads with 92% accuracy, while Model B has a latency of 1 sec.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, tableBlock, facts);
      expect(result.valid).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.validatedSegment.verified).toBe(true);
      expect(result.validatedSegment.text).toBe(segment.text);
    });

    it('rejects hallucinated numbers not present in source facts and falls back safely', () => {
      const segment: NarrationSegment = {
        id: 'seg-2',
        sourceBlockIds: ['block-table-1'],
        factIds: [],
        provenance: 'llm',
        text: 'Model A reached a record 99% accuracy with 15 sec latency.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, tableBlock, facts);
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('unsupported_number:99');
      expect(result.reasons).toContain('unsupported_number:15');

      // Check fallback
      expect(result.validatedSegment.provenance).toBe('rule');
      expect(result.validatedSegment.text).toContain('The table compares 3 models');
      expect(result.validatedSegment.fallbackReason).toContain('unsupported_number:99');
    });

    it('rejects reversed comparisons and triggers deterministic fallback', () => {
      const segment: NarrationSegment = {
        id: 'seg-3',
        sourceBlockIds: ['block-table-1'],
        factIds: [],
        provenance: 'llm',
        text: 'Model B boasts the highest accuracy among the group.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, tableBlock, facts);
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('reversed_comparison:Accuracy');
      expect(result.validatedSegment.text).toContain('The table compares 3 models');
    });

    it('rejects unresolved visual references like "as shown below"', () => {
      const segment: NarrationSegment = {
        id: 'seg-4',
        sourceBlockIds: ['block-table-1'],
        factIds: [],
        provenance: 'llm',
        text: 'As shown below, Model A has 92% accuracy.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, tableBlock, facts);
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('unresolved_visual_reference');
    });

    it('rejects segments lacking sourceBlockIds', () => {
      const segment: NarrationSegment = {
        id: 'seg-5',
        sourceBlockIds: [],
        factIds: [],
        provenance: 'llm',
        text: 'General AI comparison.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, undefined, facts);
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('missing_source_block_ids');
    });
  });

  describe('validateNarrationPlan', () => {
    it('validates a full plan replacing invalid segments while keeping valid segments', () => {
      const plan: NarrationPlan = {
        responseId: 'test-resp',
        segments: [
          {
            id: 'seg-valid-1',
            sourceBlockIds: ['block-table-1'],
            factIds: [],
            provenance: 'rule',
            text: 'Here is the summary of results.',
            verified: true,
            pauseAfterMs: 300,
          },
          {
            id: 'seg-hallucinated-2',
            sourceBlockIds: ['block-table-1'],
            factIds: [],
            provenance: 'llm',
            text: 'Model B is highest in accuracy at 99%.',
            verified: false,
            pauseAfterMs: 300,
          },
        ],
      };

      const result = validateNarrationPlan(plan, [tableBlock], facts);
      expect(result.passedCount).toBe(1);
      expect(result.fallbackCount).toBe(1);
      expect(result.plan.segments).toHaveLength(2);

      // Segment 1 kept as is
      expect(result.plan.segments[0]?.text).toBe('Here is the summary of results.');

      // Segment 2 replaced by safe fallback
      expect(result.plan.segments[1]?.provenance).toBe('rule');
      expect(result.plan.segments[1]?.text).toContain('The table compares 3 models');
      expect(result.plan.segments[1]?.fallbackReason).toBeDefined();
    });
  });
});
