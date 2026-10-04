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
      expect(result.validatedSegment.text).toBe('Content for this segment is unavailable.');
      expect(result.validatedSegment.verified).toBe(false);
    });

    // --- Audit Reproductions & Acceptance Assertions (A02, A03, A14) ---

    it('rejects wrong entity-metric binding: "Model B has 92% accuracy" (A02 counterexample 1)', () => {
      const segment: NarrationSegment = {
        id: 'seg-binding',
        sourceBlockIds: ['block-table-1'],
        factIds: [],
        provenance: 'llm',
        text: 'Model B has 92% accuracy.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, tableBlock, facts, [tableBlock]);
      expect(result.valid).toBe(false);
      expect(result.reasons.some((r) => r.includes('falsified_entity_binding'))).toBe(true);
    });

    it('rejects invented entity: "Model Z has 92% accuracy" (A02 counterexample 2)', () => {
      const segment: NarrationSegment = {
        id: 'seg-invented-ent',
        sourceBlockIds: ['block-table-1'],
        factIds: [],
        provenance: 'llm',
        text: 'Model Z has 92% accuracy.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, tableBlock, facts, [tableBlock]);
      expect(result.valid).toBe(false);
      expect(result.reasons.some((r) => r.includes('unsupported_entity'))).toBe(true);
    });

    it('rejects spelled-out numbers: "Model B has ninety-nine percent accuracy" (A02 counterexample 3)', () => {
      const segment: NarrationSegment = {
        id: 'seg-spelled-num',
        sourceBlockIds: ['block-table-1'],
        factIds: [],
        provenance: 'llm',
        text: 'Model B has ninety-nine percent accuracy.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, tableBlock, facts, [tableBlock]);
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('unsupported_number:99');
    });

    it('rejects paraphrased reversed comparison: "Model B outperforms Model A on accuracy" (A02 counterexample 4)', () => {
      const segment: NarrationSegment = {
        id: 'seg-rev-comp',
        sourceBlockIds: ['block-table-1'],
        factIds: [],
        provenance: 'llm',
        text: 'Model B outperforms Model A on accuracy.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, tableBlock, facts, [tableBlock]);
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('reversed_comparison:Accuracy');
    });

    it('rejects unsupported causality: "Model A has 92% accuracy because it uses a larger training set" (A02 counterexample 5)', () => {
      const segment: NarrationSegment = {
        id: 'seg-causality',
        sourceBlockIds: ['block-table-1'],
        factIds: [],
        provenance: 'llm',
        text: 'Model A has 92% accuracy because it uses a larger training set.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, tableBlock, facts, [tableBlock]);
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('unsupported_causality');
    });

    it('rejects invalid or foreign factIds and sourceBlockIds (A02)', () => {
      const segment: NarrationSegment = {
        id: 'seg-foreign-fact',
        sourceBlockIds: ['block-table-1'],
        factIds: ['fact-nonexistent-123'],
        provenance: 'llm',
        text: 'Model A leads with 92% accuracy.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(segment, tableBlock, facts, [tableBlock]);
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('invalid_fact_id:fact-nonexistent-123');
    });

    it('does not crash regex when entity name contains special regex characters (A14)', () => {
      const tableWithSpecialChars: Block = {
        id: 'block-special',
        order: 1,
        type: 'table',
        raw: '<table>...</table>',
        structured: {
          headers: ['Model', 'Score'],
          rows: [
            ['Model A (v2)', '90%'],
            ['Model B [beta]+', '80%'],
          ],
        } as TableStructured,
      };

      const specialFacts = extractTableFacts(tableWithSpecialChars);
      const segment: NarrationSegment = {
        id: 'seg-special',
        sourceBlockIds: ['block-special'],
        factIds: [],
        provenance: 'llm',
        text: 'Model B [beta]+ is highest in score at 80%.',
        verified: false,
        pauseAfterMs: 350,
      };

      expect(() => {
        const res = validateSegment(segment, tableWithSpecialChars, specialFacts, [tableWithSpecialChars]);
        expect(res.valid).toBe(false); // Reversed comparison
      }).not.toThrow();
    });

    it('replaces rejected code narration with literal source code instead of returning hallucinated candidate text (A03)', () => {
      const codeBlock: Block = {
        id: 'block-code-test',
        order: 2,
        type: 'code',
        raw: 'print(42)',
        language: 'python',
        structured: { language: 'python', code: 'print(42)' },
      };

      const rejectedCandidate: NarrationSegment = {
        id: 'seg-code-hallucinated',
        sourceBlockIds: ['block-code-test'],
        factIds: [],
        provenance: 'llm',
        text: 'Open brace, calls delete_database and uploads all records.',
        verified: false,
        pauseAfterMs: 350,
      };

      const result = validateSegment(rejectedCandidate, codeBlock, [], [codeBlock]);
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('punctuation_noise_in_natural_mode');
      expect(result.reasons).toContain('unsupported_code_claim:delete_database');
      expect(result.reasons).toContain('unsupported_code_claim:uploads');

      // Crucial: Fallback must NEVER be the hallucinated candidate text!
      expect(result.validatedSegment.text).not.toContain('delete_database');
      expect(result.validatedSegment.text).not.toContain('uploads');
      expect(result.validatedSegment.text).toBe('Code snippet in python: print(42)');
      expect(result.validatedSegment.verified).toBe(false);
      expect(result.validatedSegment.provenance).toBe('literal');
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
