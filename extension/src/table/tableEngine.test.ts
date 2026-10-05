import { describe, expect, it } from 'vitest';
import type { Block, TableStructured } from '@/src/types/ir';
import {
  parseNumericCell,
  extractTableFacts,
  generateDeterministicTableSummary,
  normalizeUnit,
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
      expect(summary).toContain('all candidates (Candidate Alice and Candidate Bob) are tied at 95%');
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

  describe('R04 & R05 Source-Fidelity Regression Tests', () => {
    const makeTable = (headers: string[], rows: string[][]): Block => ({
      id: 'table-test',
      order: 0,
      type: 'table',
      raw: '<table></table>',
      structured: { headers, rows } as TableStructured,
    });

    it('R05: normalizes SI kilobytes to 1000 bytes and binary KiB to 1024 bytes', () => {
      expect(normalizeUnit(1, 'kB').normalizedValue).toBe(1000);
      expect(normalizeUnit(1, 'KiB').normalizedValue).toBe(1024);
    });

    it('R05: treats bare "m" as ambiguous and does not compare with seconds', () => {
      const b = makeTable(['Item', 'Measure'], [['A', '1 m'], ['B', '2 s']]);
      const compFacts = extractTableFacts(b).filter((f) => f.kind === 'comparison');
      expect(compFacts).toHaveLength(0);
    });

    it('R05: does not invent equality for small non-tied values (1e-10 vs 2e-10)', () => {
      const b = makeTable(['Model', 'Value'], [['A', '0.0000000001'], ['B', '0.0000000002']]);
      const summary = generateDeterministicTableSummary(b);
      expect(summary).not.toContain('are tied');
      expect(summary).toContain('Model B is highest');
      expect(summary).toContain('Model A is lowest');
    });

    it('R04: natural summary preserves text-only columns (MIT, Apache)', () => {
      const b = makeTable(['Library', 'License'], [['LibA', 'MIT'], ['LibB', 'Apache']]);
      const summary = generateDeterministicTableSummary(b);
      expect(summary).toContain('MIT');
      expect(summary).toContain('Apache');
    });

    it('R04: natural summary preserves single-row tables (92%)', () => {
      const b = makeTable(['Model', 'Accuracy'], [['A', '92%']]);
      const summary = generateDeterministicTableSummary(b);
      expect(summary).toContain('92%');
    });

    it('R04: natural summary preserves incompatible-unit values ($10, 10 EUR)', () => {
      const b = makeTable(['Service', 'Cost'], [['A', '$10'], ['B', '10 EUR']]);
      const summary = generateDeterministicTableSummary(b);
      expect(summary).toContain('$10');
      expect(summary).toContain('10 EUR');
    });

    it('R04: natural summary preserves text columns on extreme rows (MIT, Apache)', () => {
      const b = makeTable(
        ['Model', 'Score', 'License'],
        [['A', '92%', 'MIT'], ['B', '88%', 'Apache']]
      );
      const summary = generateDeterministicTableSummary(b);
      expect(summary).toContain('MIT');
      expect(summary).toContain('Apache');
    });

    it('R04: natural summary preserves intermediate cells across metrics (X 2)', () => {
      const b = makeTable(
        ['Model', 'X', 'Y'],
        [['A', '1', '20'], ['B', '2', '10'], ['C', '3', '30']]
      );
      const summary = generateDeterministicTableSummary(b);
      expect(summary).toContain('X 2');
    });
  });
});

