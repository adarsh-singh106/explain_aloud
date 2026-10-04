import { describe, expect, it } from 'vitest';
import type { Block } from '@/src/types/ir';
import {
  cleanSpokenText,
  narrateHeading,
  narrateParagraph,
  narrateList,
  narrateBlockWithRules,
} from './ruleNarrator';

describe('Milestone M2 — Rule Narrator', () => {
  describe('cleanSpokenText', () => {
    it('strips visual-only phrases like "as shown above/below"', () => {
      expect(cleanSpokenText('The results, as shown above, are promising.')).toBe(
        'The results are promising.'
      );
      expect(cleanSpokenText('As shown below, performance is steady.')).toBe(
        'Performance is steady.'
      );
      expect(cleanSpokenText('Please see the table below for numbers')).toBe(
        'For numbers.'
      );
    });

    it('ensures terminal punctuation is added when missing', () => {
      expect(cleanSpokenText('This is a test')).toBe('This is a test.');
      expect(cleanSpokenText('Already has punctuation!')).toBe('Already has punctuation!');
    });
  });

  describe('narrateHeading', () => {
    it('narrates opening heading directly', () => {
      const block: Block = {
        id: 'block-0',
        order: 0,
        type: 'heading',
        raw: '<h2>Choosing a model</h2>',
        structured: { level: 2, text: 'Choosing a model' },
      };

      const seg = narrateHeading(block);
      expect(seg.id).toBe('seg-block-0');
      expect(seg.sourceBlockIds).toEqual(['block-0']);
      expect(seg.provenance).toBe('rule');
      expect(seg.text).toBe('Choosing a model.');
      expect(seg.pauseAfterMs).toBeGreaterThanOrEqual(400);
    });

    it('narrates subsequent headings with a natural transition', () => {
      const block: Block = {
        id: 'block-3',
        order: 3,
        type: 'heading',
        raw: '<h2>Why this matters</h2>',
        structured: { level: 2, text: 'Why this matters' },
      };

      const seg = narrateHeading(block);
      expect(seg.text).toBe('Next, why this matters.');
      expect(seg.sourceBlockIds).toEqual(['block-3']);
      expect(seg.provenance).toBe('rule');
    });
  });

  describe('narrateParagraph', () => {
    it('preserves paragraph text and attaches source block IDs', () => {
      const block: Block = {
        id: 'block-1',
        order: 1,
        type: 'paragraph',
        raw: '<p>Suppose we need to choose between accuracy and latency for a small API.</p>',
        structured: {
          text: 'Suppose we need to choose between accuracy and latency for a small API.',
        },
      };

      const seg = narrateParagraph(block);
      expect(seg.id).toBe('seg-block-1');
      expect(seg.sourceBlockIds).toEqual(['block-1']);
      expect(seg.provenance).toBe('rule');
      expect(seg.text).toBe(
        'Suppose we need to choose between accuracy and latency for a small API.'
      );
    });

    it('cleans visual-only references inside paragraphs', () => {
      const block: Block = {
        id: 'block-5',
        order: 5,
        type: 'paragraph',
        raw: '<p>As seen below, the tradeoff between speed and accuracy should be explicit.</p>',
        structured: {
          text: 'As seen below, the tradeoff between speed and accuracy should be explicit.',
        },
      };

      const seg = narrateParagraph(block);
      expect(seg.text).toBe('The tradeoff between speed and accuracy should be explicit.');
      expect(seg.text).not.toContain('below');
    });
  });

  describe('narrateList', () => {
    it('narrates unordered list naturally without saying "bullet"', () => {
      const block: Block = {
        id: 'block-2',
        order: 2,
        type: 'list',
        raw: '<ul><li>Accuracy matters.</li><li>Latency matters.</li><li>The best choice depends.</li></ul>',
        structured: {
          ordered: false,
          items: [
            'Accuracy matters for final predictions.',
            'Latency matters for interactive use.',
            'The best choice depends on the product constraint.',
          ],
        },
      };

      const segments = narrateList(block);
      expect(segments).toHaveLength(3);

      for (const seg of segments) {
        expect(seg.sourceBlockIds).toEqual(['block-2']);
        expect(seg.provenance).toBe('rule');
        expect(seg.text.toLowerCase()).not.toContain('bullet');
      }

      expect(segments[0]?.text).toBe('Accuracy matters for final predictions.');
      expect(segments[1]?.text).toBe('Latency matters for interactive use.');
      expect(segments[2]?.text).toBe('Finally, The best choice depends on the product constraint.');
    });

    it('narrates ordered list with sequential step markers', () => {
      const block: Block = {
        id: 'block-4',
        order: 4,
        type: 'list',
        raw: '<ol><li>First step</li><li>Second step</li></ol>',
        structured: {
          ordered: true,
          items: ['Configure the model', 'Run evaluation'],
        },
      };

      const segments = narrateList(block);
      expect(segments).toHaveLength(2);
      expect(segments[0]?.text).toBe('First, Configure the model.');
      expect(segments[1]?.text).toBe('Second, Run evaluation.');
    });
  });

  describe('narrateBlockWithRules dispatcher', () => {
    it('dispatches paragraph, heading, and list to rules', () => {
      const heading: Block = {
        id: 'h-1',
        order: 0,
        type: 'heading',
        raw: '<h1>Title</h1>',
        structured: { level: 1, text: 'Title' },
      };
      expect(narrateBlockWithRules(heading)).not.toBeNull();

      const para: Block = {
        id: 'p-1',
        order: 1,
        type: 'paragraph',
        raw: '<p>Text</p>',
        structured: { text: 'Text' },
      };
      expect(narrateBlockWithRules(para)).not.toBeNull();

      const list: Block = {
        id: 'l-1',
        order: 2,
        type: 'list',
        raw: '<ul><li>Item</li></ul>',
        structured: { ordered: false, items: ['Item'] },
      };
      expect(narrateBlockWithRules(list)).not.toBeNull();
    });

    it('returns null for code and table blocks requiring complex/LLM narration', () => {
      const code: Block = {
        id: 'c-1',
        order: 3,
        type: 'code',
        raw: '<pre><code>code</code></pre>',
      };
      expect(narrateBlockWithRules(code)).toBeNull();

      const table: Block = {
        id: 't-1',
        order: 4,
        type: 'table',
        raw: '<table></table>',
      };
      expect(narrateBlockWithRules(table)).toBeNull();
    });
  });
});
