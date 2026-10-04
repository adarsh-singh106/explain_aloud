import { describe, expect, it } from 'vitest';
import type { Block, TableStructured } from '@/src/types/ir';
import {
  parseNumericCell,
  extractTableFacts,
  generateDeterministicTableSummary,
} from './tableEngine';

describe('Milestone M3 — Table Engine', () => {
  describe('parseNumericCell', () => {
    it('parses percentage numbers', () => {
      const parsed = parseNumericCell('92%');
      expect(parsed).not.toBeNull();
      expect(parsed?.value).toBe(92);
      expect(parsed?.unit).toBe('%');
    });

    it('parses numbers with units', () => {
      const parsed = parseNumericCell('4 sec');
      expect(parsed).not.toBeNull();
      expect(parsed?.value).toBe(4);
      expect(parsed?.unit).toBe('sec');
    });

    it('parses floating point numbers and currency', () => {
      const parsed = parseNumericCell('$12.50');
      expect(parsed).not.toBeNull();
      expect(parsed?.value).toBe(12.5);
      expect(parsed?.unit).toBe('$');
    });

    it('returns null for non-numeric text', () => {
      expect(parseNumericCell('Model A')).toBeNull();
      expect(parseNumericCell('N/A')).toBeNull();
    });
  });

  describe('extractTableFacts on mixed-response fixture table', () => {
    const tableBlock: Block = {
      id: 'block-4',
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

    it('extracts all entity identifiers (A, B, C)', () => {
      const facts = extractTableFacts(tableBlock);
      const entityFacts = facts.filter((f) => f.kind === 'identifier');

      expect(entityFacts).toHaveLength(3);
      const entityNames = entityFacts.map((f) => (f.value as any).entity);
      expect(entityNames).toEqual(['A', 'B', 'C']);
    });

    it('extracts exact numbers for all cells', () => {
      const facts = extractTableFacts(tableBlock);
      const numFacts = facts.filter((f) => f.kind === 'number');

      expect(numFacts).toHaveLength(6);
      const values = numFacts.map((f) => (f.value as any).number);
      expect(values).toContain(92);
      expect(values).toContain(88);
      expect(values).toContain(90);
      expect(values).toContain(4);
      expect(values).toContain(1);
      expect(values).toContain(2);
    });

    it('correctly calculates min and max comparisons without reversal', () => {
      const facts = extractTableFacts(tableBlock);
      const compFacts = facts.filter((f) => f.kind === 'comparison');

      expect(compFacts).toHaveLength(2);

      const accuracyComp = compFacts.find((f) => (f.value as any).metric === 'Accuracy');
      expect(accuracyComp).toBeDefined();
      const accVal = (accuracyComp?.value as any);
      expect(accVal.highest.entity).toBe('A');
      expect(accVal.highest.value).toBe(92);
      expect(accVal.lowest.entity).toBe('B');
      expect(accVal.lowest.value).toBe(88);

      const latencyComp = compFacts.find((f) => (f.value as any).metric === 'Latency');
      expect(latencyComp).toBeDefined();
      const latVal = (latencyComp?.value as any);
      expect(latVal.highest.entity).toBe('A');
      expect(latVal.highest.value).toBe(4);
      expect(latVal.lowest.entity).toBe('B');
      expect(latVal.lowest.value).toBe(1);
    });
  });

  describe('generateDeterministicTableSummary', () => {
    it('produces a faithful fallback summary mentioning true metrics and extremes', () => {
      const tableBlock: Block = {
        id: 'block-4',
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

      const summary = generateDeterministicTableSummary(tableBlock);

      expect(summary).toContain('3 models');
      expect(summary).toContain('Accuracy and Latency');
      expect(summary).toContain('Model A is highest at 92%');
      expect(summary).toContain('Model B is lowest at 88%');
      expect(summary).toContain('Model A is highest at 4 sec');
      expect(summary).toContain('Model B is lowest at 1 sec');
    });
  });
});
