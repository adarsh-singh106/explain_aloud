import type { Block, Fact, TableStructured } from '@/src/types/ir';

export interface ParsedNumber {
  value: number;
  raw: string;
  unit?: string;
  unitFamily: string;
  normalizedValue: number;
}

export interface MinMaxStat {
  column: string;
  unit?: string;
  isTie?: boolean;
  max: { entity: string; value: number; normalizedValue: number; raw: string };
  min: { entity: string; value: number; normalizedValue: number; raw: string };
}

/**
 * Normalizes units into standard families for mathematically sound comparison.
 */
export function normalizeUnit(value: number, rawUnit?: string): { unitFamily: string; normalizedValue: number } {
  if (!rawUnit) {
    return { unitFamily: 'dimensionless', normalizedValue: value };
  }
  const u = rawUnit.toLowerCase().trim();

  // Time / Duration -> normalized to seconds
  if (/^(?:ms|msec|millisecond|milliseconds)$/.test(u)) {
    return { unitFamily: 'time', normalizedValue: value * 0.001 };
  }
  if (/^(?:s|sec|secs|second|seconds)$/.test(u)) {
    return { unitFamily: 'time', normalizedValue: value };
  }
  if (/^(?:m|min|mins|minute|minutes)$/.test(u)) {
    return { unitFamily: 'time', normalizedValue: value * 60 };
  }
  if (/^(?:h|hr|hrs|hour|hours)$/.test(u)) {
    return { unitFamily: 'time', normalizedValue: value * 3600 };
  }

  // Size / Bytes -> normalized to bytes
  if (/^(?:b|byte|bytes)$/.test(u)) {
    return { unitFamily: 'bytes', normalizedValue: value };
  }
  if (/^(?:kb|kib|kilobyte|kilobytes)$/.test(u)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1024 };
  }
  if (/^(?:mb|mib|megabyte|megabytes)$/.test(u)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1024 * 1024 };
  }
  if (/^(?:gb|gib|gigabyte|gigabytes)$/.test(u)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1024 * 1024 * 1024 };
  }
  if (/^(?:tb|tib|terabyte|terabytes)$/.test(u)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1024 * 1024 * 1024 * 1024 };
  }

  // Percentage -> normalized to ratio percentage
  if (/^(?:%|pct|percent|percentage)$/.test(u)) {
    return { unitFamily: 'percent', normalizedValue: value };
  }

  // Currencies -> distinct families so different currencies are never ranked against each other
  if (u === '$' || u === 'usd') {
    return { unitFamily: 'currency_usd', normalizedValue: value };
  }
  if (u === '€' || u === 'eur') {
    return { unitFamily: 'currency_eur', normalizedValue: value };
  }
  if (u === '£' || u === 'gbp') {
    return { unitFamily: 'currency_gbp', normalizedValue: value };
  }

  // Custom / unknown unit: safe exact match family
  return { unitFamily: `custom_${u}`, normalizedValue: value };
}

/**
 * Extracts numeric value and optional unit from a table cell string (e.g., "92%", "4 sec", "$12.50").
 */
export function parseNumericCell(raw: string): ParsedNumber | null {
  const trimmed = raw.trim();
  // Match numbers with optional decimal, negative, prefix currency, or suffix unit
  const match = trimmed.match(/^([$€£])?\s*(-?\d+(?:\.\d+)?)\s*(%|[a-zA-Z]+)?$/);
  if (!match) return null;

  const prefix = match[1] || '';
  const numStr = match[2];
  const suffix = match[3] || '';

  if (!numStr) return null;

  const value = parseFloat(numStr);
  if (isNaN(value)) return null;

  const unit = (prefix + suffix).trim() || undefined;
  const { unitFamily, normalizedValue } = normalizeUnit(value, unit);

  return { value, raw: trimmed, unit, unitFamily, normalizedValue };
}

/**
 * Deterministically analyzes a table block and extracts all verifiable facts:
 * - individual cell values (numbers and text)
 * - column min/max stats (with unit normalization and tie handling)
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

  // 2. Parse numbers and text per cell and per column
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
            normalizedValue: parsed.normalizedValue,
            raw: parsed.raw,
            unit: parsed.unit,
            unitFamily: parsed.unitFamily,
          },
          critical: true,
        });
      } else if (cellText.trim()) {
        // Add non-numeric text fact so text information is preserved
        facts.push({
          id: `fact-${block.id}-text-${factCounter++}`,
          sourceBlockIds: [block.id],
          kind: 'identifier',
          value: {
            entity,
            metric: header,
            text: cellText.trim(),
          },
          critical: true,
        });
      }
    });

    if (colValues.length === rows.length && colValues.length > 1) {
      numericColumns.set(c, { header, values: colValues });
    }
  }

  // 3. Extract safe, deterministic min/max comparisons only if units are compatible
  numericColumns.forEach(({ header, values }) => {
    const firstFamily = values[0]!.num.unitFamily;
    const compatible = values.every((v) => v.num.unitFamily === firstFamily);

    // If units are mixed/incompatible, omit comparison fact to prevent false rankings
    if (!compatible) {
      return;
    }

    let max = values[0]!;
    let min = values[0]!;

    for (let i = 1; i < values.length; i++) {
      const item = values[i]!;
      if (item.num.normalizedValue > max.num.normalizedValue) {
        max = item;
      }
      if (item.num.normalizedValue < min.num.normalizedValue) {
        min = item;
      }
    }

    const isTie = values.every((v) => Math.abs(v.num.normalizedValue - values[0]!.num.normalizedValue) < 1e-9);

    facts.push({
      id: `fact-${block.id}-comp-${header.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      sourceBlockIds: [block.id],
      kind: 'comparison',
      value: {
        metric: header,
        unit: max.num.unit,
        isTie,
        highest: {
          entity: max.entity,
          value: max.num.value,
          normalizedValue: max.num.normalizedValue,
          raw: max.num.raw,
        },
        lowest: {
          entity: min.entity,
          value: min.num.value,
          normalizedValue: min.num.normalizedValue,
          raw: min.num.raw,
        },
      },
      critical: true,
    });
  });

  return facts;
}

/**
 * Builds a 100% verified, deterministic fallback spoken summary of the table.
 * Preserves all rows and non-numeric columns without dropping intermediate data.
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

  // Mention the key comparisons (max, min, or ties)
  comparisonFacts.forEach((cf) => {
    const { metric, isTie, highest, lowest } = cf.value as {
      metric: string;
      isTie?: boolean;
      highest: { entity: string; raw: string };
      lowest: { entity: string; raw: string };
    };

    if (isTie) {
      lines.push(`For ${metric.toLowerCase()}, all ${entityHeader.toLowerCase()}s are tied at ${highest.raw}.`);
    } else {
      lines.push(
        `For ${metric.toLowerCase()}, ${entityHeader} ${highest.entity} is highest at ${highest.raw}, while ${entityHeader} ${lowest.entity} is lowest at ${lowest.raw}.`
      );
    }
  });

  // Preserve intermediate rows or non-numeric details if any row was not in highest/lowest
  const mentionedEntities = new Set<string>();
  comparisonFacts.forEach((cf) => {
    const val = cf.value as any;
    if (!val.isTie) {
      mentionedEntities.add(val.highest?.entity);
      mentionedEntities.add(val.lowest?.entity);
    }
  });

  const omittedRows = rows.filter((r) => !mentionedEntities.has((r[0] || '').trim()));
  if (omittedRows.length > 0 && omittedRows.length < rows.length) {
    omittedRows.forEach((r) => {
      const entity = (r[0] || '').trim();
      const details = headers.slice(1).map((h, i) => `${h} ${r[i + 1] || ''}`.trim()).join(', ');
      lines.push(`${entityHeader} ${entity} has ${details}.`);
    });
  }

  return lines.join(' ');
}

/**
 * Deterministically renders all table cells with their headers for Literal mode.
 * Retains all source values, rows, and identifiers without LLM rewriting.
 */
export function generateLiteralTableSummary(block: Block): string {
  const structured = block.structured as TableStructured | undefined;
  if (!structured || !structured.headers || !structured.rows || structured.rows.length === 0) {
    return 'The table contains no data.';
  }

  const { headers, rows } = structured;
  const entityHeader = headers[0] || 'Item';
  const metricHeaders = headers.slice(1);

  const lines: string[] = [
    `Table with ${rows.length} rows and columns: ${headers.join(', ')}.`
  ];

  rows.forEach((row) => {
    const entity = (row[0] || '').trim();
    const cellReadouts = metricHeaders.map((header, idx) => {
      const cellVal = (row[idx + 1] || 'empty').trim();
      return `${header}: ${cellVal}`;
    });
    lines.push(`${entityHeader} ${entity}: ${cellReadouts.join(', ')}.`);
  });

  return lines.join(' ');
}

