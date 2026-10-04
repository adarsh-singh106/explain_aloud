import type { Block, Fact, TableStructured } from '@/src/types/ir';

export interface ParsedNumber {
  value: number;
  raw: string;
  unit?: string;
}

export interface MinMaxStat {
  column: string;
  unit?: string;
  max: { entity: string; value: number; raw: string };
  min: { entity: string; value: number; raw: string };
}

/**
 * Extracts numeric value and optional unit from a table cell string (e.g., "92%", "4 sec", "$12.50").
 */
export function parseNumericCell(raw: string): ParsedNumber | null {
  const trimmed = raw.trim();
  // Match numbers with optional decimal, negative, percentage, or units like ms, sec, s, MB, GB, etc.
  const match = trimmed.match(/^([$€£])?\s*(-?\d+(?:\.\d+)?)\s*(%|[a-zA-Z]+)?$/);
  if (!match) return null;

  const prefix = match[1] || '';
  const numStr = match[2];
  const suffix = match[3] || '';

  if (!numStr) return null;

  const value = parseFloat(numStr);
  if (isNaN(value)) return null;

  const unit = (prefix + suffix).trim() || undefined;
  return { value, raw: trimmed, unit };
}

/**
 * Deterministically analyzes a table block and extracts all verifiable facts:
 * - individual cell values
 * - column min/max stats
 * - entity identifiers
 */
export function extractTableFacts(block: Block): Fact[] {
  const structured = block.structured as TableStructured | undefined;
  if (!structured || !structured.headers || !structured.rows || structured.rows.length === 0) {
    return [];
  }

  const { headers, rows } = structured;
  const facts: Fact[] = [];
  let factCounter = 0;

  const entityColIndex = 0; // First column is assumed to be the entity identifier by default
  const entityNameHeader = headers[entityColIndex] || 'Entity';

  // 1. Extract entity identifiers
  rows.forEach((row, rowIdx) => {
    const entity = row[entityColIndex]?.trim() || `Row ${rowIdx + 1}`;
    facts.push({
      id: `fact-${block.id}-ent-${rowIdx}`,
      sourceBlockIds: [block.id],
      kind: 'identifier',
      value: { entity, entityType: entityNameHeader },
      critical: true,
    });
  });

  // 2. Parse numbers per cell and per numeric column
  const numericColumns: Map<number, { header: string; values: { entity: string; num: ParsedNumber }[] }> = new Map();

  for (let c = 1; c < headers.length; c++) {
    const header = headers[c] || `Column ${c}`;
    const colValues: { entity: string; num: ParsedNumber }[] = [];

    rows.forEach((row, r) => {
      const entity = row[entityColIndex]?.trim() || `Row ${r + 1}`;
      const cellText = row[c] || '';
      const parsed = parseNumericCell(cellText);

      if (parsed) {
        colValues.push({ entity, num: parsed });

        // Add number fact
        facts.push({
          id: `fact-${block.id}-num-${factCounter++}`,
          sourceBlockIds: [block.id],
          kind: 'number',
          value: {
            entity,
            metric: header,
            number: parsed.value,
            raw: parsed.raw,
            unit: parsed.unit,
          },
          critical: true,
        });
      }
    });

    if (colValues.length === rows.length && colValues.length > 1) {
      numericColumns.set(c, { header, values: colValues });
    }
  }

  // 3. Extract safe, deterministic min/max comparisons
  numericColumns.forEach(({ header, values }) => {
    let max = values[0]!;
    let min = values[0]!;

    for (let i = 1; i < values.length; i++) {
      const item = values[i]!;
      if (item.num.value > max.num.value) {
        max = item;
      }
      if (item.num.value < min.num.value) {
        min = item;
      }
    }

    if (max.entity !== min.entity) {
      facts.push({
        id: `fact-${block.id}-comp-${header.toLowerCase().replace(/\s+/g, '-')}`,
        sourceBlockIds: [block.id],
        kind: 'comparison',
        value: {
          metric: header,
          unit: max.num.unit,
          highest: { entity: max.entity, value: max.num.value, raw: max.num.raw },
          lowest: { entity: min.entity, value: min.num.value, raw: min.num.raw },
        },
        critical: true,
      });
    }
  });

  return facts;
}

/**
 * Builds a 100% verified, deterministic fallback spoken summary of the table.
 * Used whenever LLM wording fails validation or is unavailable.
 */
export function generateDeterministicTableSummary(block: Block): string {
  const structured = block.structured as TableStructured | undefined;
  if (!structured || !structured.headers || !structured.rows || structured.rows.length === 0) {
    return 'The table contains no data.';
  }

  const { headers, rows } = structured;
  const entityHeader = headers[0] || 'Item';
  const metricHeaders = headers.slice(1);
  const rowCount = rows.length;

  const facts = extractTableFacts(block);
  const comparisonFacts = facts.filter((f) => f.kind === 'comparison');

  const lines: string[] = [
    `The table compares ${rowCount} ${entityHeader.toLowerCase()}s across ${metricHeaders.join(' and ')}.`
  ];

  // Mention the key comparisons (max and min)
  comparisonFacts.forEach((cf) => {
    const { metric, highest, lowest } = cf.value as {
      metric: string;
      highest: { entity: string; raw: string };
      lowest: { entity: string; raw: string };
    };
    lines.push(
      `For ${metric.toLowerCase()}, ${entityHeader} ${highest.entity} is highest at ${highest.raw}, while ${entityHeader} ${lowest.entity} is lowest at ${lowest.raw}.`
    );
  });

  return lines.join(' ');
}
