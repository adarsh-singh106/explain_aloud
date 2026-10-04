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
      // Model C is also preserved
      expect(summary).toContain('Model C has Accuracy 90%, Latency 2 sec');
    });

    it('correctly normalizes duration units (e.g., 900 ms vs 2 sec)', () => {
      const durationTable: Block = {
        id: 'block-dur',
        order: 1,
        type: 'table',
        raw: '<table>...</table>',
        structured: {
          headers: ['Model', 'Latency'],
          rows: [
            ['Model A', '900 ms'],
            ['Model B', '2 sec'],
          ],
        } as TableStructured,
      };

      const facts = extractTableFacts(durationTable);
      const compFacts = facts.filter((f) => f.kind === 'comparison');
      expect(compFacts).toHaveLength(1);

      const latComp = compFacts[0]!.value as any;
      // 2 sec (2.0s) > 900 ms (0.9s), so Model B is highest and Model A is lowest!
      expect(latComp.highest.entity).toBe('Model B');
      expect(latComp.highest.raw).toBe('2 sec');
      expect(latComp.lowest.entity).toBe('Model A');
      expect(latComp.lowest.raw).toBe('900 ms');
    });

    it('does not generate false comparisons when units are incompatible (e.g. $ vs €)', () => {
      const mixedCurrencyTable: Block = {
        id: 'block-curr',
        order: 1,
        type: 'table',
        raw: '<table>...</table>',
        structured: {
          headers: ['Service', 'Cost'],
          rows: [
            ['Service A', '$10'],
            ['Service B', '€10'],
          ],
        } as TableStructured,
      };

      const facts = extractTableFacts(mixedCurrencyTable);
      const compFacts = facts.filter((f) => f.kind === 'comparison');
      // Must NOT compare $ with €
      expect(compFacts).toHaveLength(0);
    });

    it('accurately represents ties in comparisons', () => {
      const tiedTable: Block = {
        id: 'block-tied',
        order: 1,
        type: 'table',
        raw: '<table>...</table>',
        structured: {
          headers: ['Candidate', 'Score'],
          rows: [
            ['Alice', '95%'],
            ['Bob', '95%'],
          ],
        } as TableStructured,
      };

      const facts = extractTableFacts(tiedTable);
      const compFacts = facts.filter((f) => f.kind === 'comparison');
      expect(compFacts).toHaveLength(1);
      const scoreComp = compFacts[0]!.value as any;
      expect(scoreComp.isTie).toBe(true);

      const summary = generateDeterministicTableSummary(tiedTable);
      expect(summary).toContain('all candidates are tied at 95%');
    });

    it('preserves non-numeric text columns like License', () => {
      const textColTable: Block = {
        id: 'block-lic',
        order: 1,
        type: 'table',
        raw: '<table>...</table>',
        structured: {
          headers: ['Library', 'License'],
          rows: [
            ['LibA', 'MIT'],
            ['LibB', 'Apache-2.0'],
          ],
        } as TableStructured,
      };

      const facts = extractTableFacts(textColTable);
      const textFacts = facts.filter((f) => f.kind === 'identifier' && (f.value as any).text);
      expect(textFacts).toHaveLength(2);
      expect((textFacts[0]!.value as any).text).toBe('MIT');
      expect((textFacts[1]!.value as any).text).toBe('Apache-2.0');
    });
  });
});
