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
 * Preserves unit case so bits (e.g. 'kb') and bytes (e.g. 'kB') are never conflated.
 */
export function normalizeUnit(value: number, rawUnit?: string): { unitFamily: string; normalizedValue: number } {
  if (!rawUnit) {
    return { unitFamily: 'dimensionless', normalizedValue: value };
  }
  const trimmed = rawUnit.trim();
  const lower = trimmed.toLowerCase();

  // Time / Duration -> normalized to seconds
  // Bare 'm' is ambiguous (meters vs minutes) and remains literal without normalizing to time.
  if (/^(?:ms|msec|millisecond|milliseconds)$/.test(lower)) {
    return { unitFamily: 'time', normalizedValue: value * 0.001 };
  }
  if (/^(?:s|sec|secs|second|seconds)$/.test(lower)) {
    return { unitFamily: 'time', normalizedValue: value };
  }
  if (/^(?:min|mins|minute|minutes)$/.test(lower)) {
    return { unitFamily: 'time', normalizedValue: value * 60 };
  }
  if (/^(?:h|hr|hrs|hour|hours)$/.test(lower)) {
    return { unitFamily: 'time', normalizedValue: value * 3600 };
  }

  // Size / Bits -> normalized to bits (unitFamily: 'bits')
  // Bits must preserve case to avoid conflating with bytes (e.g. 'kb' vs 'kB', 'b' vs 'B')
  if (trimmed === 'b' || /^(?:bit|bits)$/i.test(trimmed)) {
    return { unitFamily: 'bits', normalizedValue: value };
  }
  if (/^(?:kb|kbit|kilobit|kilobits)$/.test(trimmed)) {
    return { unitFamily: 'bits', normalizedValue: value * 1000 };
  }
  if (/^(?:mb|mbit|megabit|megabits)$/.test(trimmed)) {
    return { unitFamily: 'bits', normalizedValue: value * 1000 * 1000 };
  }
  if (/^(?:gb|gbit|gigabit|gigabits)$/.test(trimmed)) {
    return { unitFamily: 'bits', normalizedValue: value * 1000 * 1000 * 1000 };
  }
  if (/^(?:tb|tbit|terabit|terabits)$/.test(trimmed)) {
    return { unitFamily: 'bits', normalizedValue: value * 1000 * 1000 * 1000 * 1000 };
  }
  if (/^(?:kibit|Kib|kib)$/.test(trimmed)) {
    return { unitFamily: 'bits', normalizedValue: value * 1024 };
  }
  if (/^(?:mibit)$/i.test(trimmed)) {
    return { unitFamily: 'bits', normalizedValue: value * 1024 * 1024 };
  }
  if (/^(?:gibit)$/i.test(trimmed)) {
    return { unitFamily: 'bits', normalizedValue: value * 1024 * 1024 * 1024 };
  }
  if (/^(?:tibit)$/i.test(trimmed)) {
    return { unitFamily: 'bits', normalizedValue: value * 1024 * 1024 * 1024 * 1024 };
  }

  // Size / Bytes -> normalized to bytes (unitFamily: 'bytes')
  // Distinguish IEC binary (KiB, MiB, etc.) from SI decimal (kB, MB, etc.) per NIST
  if (trimmed === 'B' || /^(?:byte|bytes)$/i.test(trimmed)) {
    return { unitFamily: 'bytes', normalizedValue: value };
  }
  if (/^(?:KiB|kibibyte|kibibytes)$/.test(trimmed)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1024 };
  }
  if (/^(?:kB|KB|kilobyte|kilobytes)$/.test(trimmed)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1000 };
  }
  if (/^(?:mib|mebibyte|mebibytes)$/i.test(trimmed)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1024 * 1024 };
  }
  if (/^(?:MB|megabyte|megabytes)$/.test(trimmed)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1000 * 1000 };
  }
  if (/^(?:gib|gibibyte|gibibytes)$/i.test(trimmed)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1024 * 1024 * 1024 };
  }
  if (/^(?:GB|gigabyte|gigabytes)$/.test(trimmed)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1000 * 1000 * 1000 };
  }
  if (/^(?:tib|tebibyte|tebibytes)$/i.test(trimmed)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1024 * 1024 * 1024 * 1024 };
  }
  if (/^(?:TB|terabyte|terabytes)$/.test(trimmed)) {
    return { unitFamily: 'bytes', normalizedValue: value * 1000 * 1000 * 1000 * 1000 };
  }

  // Percentage -> normalized to ratio percentage
  if (/^(?:%|pct|percent|percentage)$/i.test(trimmed)) {
    return { unitFamily: 'percent', normalizedValue: value };
  }

  // Currencies -> distinct families so different currencies are never ranked against each other
  if (lower === '$' || lower === 'usd') {
    return { unitFamily: 'currency_usd', normalizedValue: value };
  }
  if (lower === '€' || lower === 'eur') {
    return { unitFamily: 'currency_eur', normalizedValue: value };
  }
  if (lower === '£' || lower === 'gbp') {
    return { unitFamily: 'currency_gbp', normalizedValue: value };
  }

  // Custom / unknown / ambiguous unit: safe exact match family
  return { unitFamily: `custom_${trimmed}`, normalizedValue: value };
}

/**
 * Extracts numeric value and optional unit from a table cell string (e.g., "92%", "4 sec", "$12.50", "1,000", "$2,500.50").
 */
export function parseNumericCell(raw: string): ParsedNumber | null {
  const trimmed = raw.trim();
  // Match numbers with optional comma grouping, decimal, negative, prefix currency, or suffix unit
  const match = trimmed.match(/^([$€£])?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)\s*(%|[a-zA-Z]+)?$/);
  if (!match) return null;

  const prefix = match[1] || '';
  const numStr = match[2];
  const suffix = match[3] || '';

  if (!numStr) return null;

  // Strip commas for parsing but keep original in raw
  const value = parseFloat(numStr.replace(/,/g, ''));
  if (isNaN(value)) return null;

  const unit = (prefix + suffix).trim() || undefined;
  const { unitFamily, normalizedValue } = normalizeUnit(value, unit);

  return { value, raw: trimmed, unit, unitFamily, normalizedValue };
}

function areNumbersEqual(a: number, b: number): boolean {
  if (a === b) return true;
  const diff = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return diff <= Number.EPSILON * 4 * scale;
}

function formatEntityName(entity: string, entityHeader: string): string {
  if (entity.toLowerCase().startsWith(entityHeader.toLowerCase())) {
    return entity;
  }
  return `${entityHeader} ${entity}`;
}

function formatEntitiesList(entities: string[], entityHeader: string): string {
  const formatted = entities.map((e) => formatEntityName(e, entityHeader));
  if (formatted.length === 1) return formatted[0]!;
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(', ')}, and ${formatted[formatted.length - 1]}`;
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

  const entityColIndex = headers.length === 1 ? -1 : 0;
  const entityNameHeader = entityColIndex >= 0 && headers[entityColIndex] ? headers[entityColIndex]! : 'Row';

  // Pre-calculate label counts to disambiguate duplicates
  const labelCounts = new Map<string, number>();
  if (entityColIndex >= 0) {
    rows.forEach(row => {
      const raw = row[entityColIndex]?.trim();
      if (raw) {
        labelCounts.set(raw, (labelCounts.get(raw) || 0) + 1);
      }
    });
  }

  // 1. Extract entity identifiers
  rows.forEach((row, rowIdx) => {
    let rawEntity = entityColIndex >= 0 ? row[entityColIndex]?.trim() : '';
    if (rawEntity && labelCounts.get(rawEntity)! > 1) {
      rawEntity = `${rawEntity} (Row ${rowIdx + 1})`;
    }
    const entity = rawEntity || `Row ${rowIdx + 1}`;
    facts.push({
      id: `fact-${block.id}-ent-${rowIdx}`,
      sourceBlockIds: [block.id],
      kind: 'identifier',
      value: {
        entity,
        entityType: entityNameHeader,
        rowIndex: rowIdx,
        columnIndex: entityColIndex >= 0 ? entityColIndex : 0,
      },
      critical: true,
    });
  });

  // 2. Parse numbers and text per cell and per column
  const numericColumns: Map<number, { header: string; values: { entity: string; rowIndex: number; num: ParsedNumber }[] }> = new Map();

  const startCol = headers.length === 1 ? 0 : 1;

  for (let c = startCol; c < headers.length; c++) {
    const header = headers[c] || `Column ${c + 1}`;
    const colValues: { entity: string; rowIndex: number; num: ParsedNumber }[] = [];

    rows.forEach((row, r) => {
      let rawEntity = entityColIndex >= 0 ? row[entityColIndex]?.trim() : '';
      if (rawEntity && labelCounts.get(rawEntity)! > 1) {
        rawEntity = `${rawEntity} (Row ${r + 1})`;
      }
      const entity = rawEntity || `Row ${r + 1}`;
      const cellText = row[c] || '';
      const parsed = parseNumericCell(cellText);

      if (parsed) {
        colValues.push({ entity, rowIndex: r, num: parsed });

        // Add number fact
        facts.push({
          id: `fact-${block.id}-num-${factCounter++}`,
          sourceBlockIds: [block.id],
          kind: 'number',
          value: {
            entity,
            metric: header,
            rowIndex: r,
            columnIndex: c,
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
            rowIndex: r,
            columnIndex: c,
            text: cellText.trim(),
          },
          critical: true,
        });
      }
    });

    if (colValues.length === rows.length && colValues.length > 1 && headers.length > 1) {
      numericColumns.set(c, { header, values: colValues });
    }
  }

  // 3. Extract safe, deterministic min/max comparisons only if units are compatible
  numericColumns.forEach(({ header, values }, colIndex) => {
    const firstFamily = values[0]!.num.unitFamily;
    const compatible = values.every((v) => v.num.unitFamily === firstFamily);

    // If units are mixed/incompatible, or if they are an unsupported custom unit,
    // omit comparison fact to prevent false rankings
    if (!compatible || firstFamily.startsWith('custom_')) {
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

    const firstVal = values[0]!.num.normalizedValue;
    const isTie = values.every((v) => areNumbersEqual(v.num.normalizedValue, firstVal));
    const highestItems = values.filter((v) => areNumbersEqual(v.num.normalizedValue, max.num.normalizedValue));
    const lowestItems = values.filter((v) => areNumbersEqual(v.num.normalizedValue, min.num.normalizedValue));
    const highestEntities = highestItems.map((h) => h.entity);
    const lowestEntities = lowestItems.map((l) => l.entity);

    facts.push({
      id: `fact-${block.id}-comp-${header.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      sourceBlockIds: [block.id],
      kind: 'comparison',
      value: {
        metric: header,
        columnIndex: colIndex,
        unit: max.num.unit,
        isTie,
        highest: {
          entity: max.entity,
          entities: highestEntities,
          rowIndex: max.rowIndex,
          rowIndices: highestItems.map((h) => h.rowIndex),
          value: max.num.value,
          normalizedValue: max.num.normalizedValue,
          raw: max.num.raw,
        },
        lowest: {
          entity: min.entity,
          entities: lowestEntities,
          rowIndex: min.rowIndex,
          rowIndices: lowestItems.map((l) => l.rowIndex),
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
export function generateSmallTableSummary(block: Block): string | undefined {
  const table = block.structured as TableStructured | undefined;
  if (!table || table.rows.length < 2 || table.rows.length > 4 ||
      table.headers.length < 2 || table.headers.length > 4 ||
      /\b(?:rowspan|colspan)\s*=/i.test(block.raw) ||
      table.headers.some(header => !header.trim()) ||
      table.rows.some(row => row.length !== table.headers.length || row.some(cell => !cell.trim()))) return undefined;
  const count = ['', '', 'two', 'three', 'four'][table.rows.length];
  const rows = table.rows.map(row => {
    const cells = row.map((cell, index) => `${table.headers[index]}: ${cell}`);
    return `${cells.slice(0, -1).join(', ')}, and ${cells.at(-1)}.`;
  });
  return `The table has ${count} entries. ${rows.join(' ')}`;
}

export function generateDeterministicTableSummary(block: Block): string {
  const structured = block.structured as TableStructured | undefined;
  if (!structured || !structured.headers || !structured.rows || structured.rows.length === 0) {
    return 'The table contains no data.';
  }

  const { headers, rows } = structured;
  const entityHeader = headers[0] || 'Item';
  const rowCount = rows.length;

  // Single-column tables: narrate every row value directly
  if (headers.length === 1) {
    const listLines = [
      rowCount === 1
        ? `The table lists 1 ${entityHeader.toLowerCase()}.`
        : `The table lists ${rowCount} ${entityHeader.toLowerCase()}s.`
    ];
    rows.forEach((row, r) => {
      const val = (row[0] || '').trim();
      listLines.push(`${entityHeader} ${r + 1}: ${val}.`);
    });
    return listLines.join(' ');
  }

  const metricHeaders = headers.slice(1);
  const facts = extractTableFacts(block);
  const comparisonFacts = facts.filter((f) => f.kind === 'comparison');

  const lines: string[] = [
    rowCount === 1
      ? `The table compares 1 ${entityHeader.toLowerCase()} across ${metricHeaders.join(' and ')}.`
      : `The table compares ${rowCount} ${entityHeader.toLowerCase()}s across ${metricHeaders.join(' and ')}.`
  ];

  // Track covered cells by "rowIndex:colIndex"
  const coveredCells = new Set<string>();

  // Mention the key comparisons (max, min, or ties)
  comparisonFacts.forEach((cf) => {
    const val = cf.value as any;
    const { metric, isTie, highest, lowest, columnIndex } = val;

    // Determine the column index for this metric
    const cIdx = typeof columnIndex === 'number'
      ? columnIndex
      : headers.findIndex((h) => h.toLowerCase() === metric.toLowerCase());

    if (isTie) {
      if (cIdx >= 1) {
        for (let r = 0; r < rowCount; r++) {
          coveredCells.add(`${r}:${cIdx}`);
        }
      }
      const tiedNames = Array.isArray(highest.entities) ? highest.entities : [highest.entity];
      const formattedNames = formatEntitiesList(tiedNames, entityHeader);
      lines.push(`For ${metric.toLowerCase()}, all ${entityHeader.toLowerCase()}s (${formattedNames}) are tied at ${highest.raw}.`);
    } else {
      const highestEntities: string[] = Array.isArray(highest.entities) && highest.entities.length > 0
        ? highest.entities
        : [highest.entity];
      const lowestEntities: string[] = Array.isArray(lowest.entities) && lowest.entities.length > 0
        ? lowest.entities
        : [lowest.entity];

      // Mark metric cells as covered
      if (cIdx >= 1) {
        if (Array.isArray(highest.rowIndices)) {
          highest.rowIndices.forEach((r: number) => coveredCells.add(`${r}:${cIdx}`));
        } else if (typeof highest.rowIndex === 'number') {
          coveredCells.add(`${highest.rowIndex}:${cIdx}`);
        }
        if (Array.isArray(lowest.rowIndices)) {
          lowest.rowIndices.forEach((r: number) => coveredCells.add(`${r}:${cIdx}`));
        } else if (typeof lowest.rowIndex === 'number') {
          coveredCells.add(`${lowest.rowIndex}:${cIdx}`);
        }
      }

      // Format tied entities or single entity for highest
      const highestClause = highestEntities.length > 1
        ? `${formatEntitiesList(highestEntities, entityHeader)} are tied for highest at ${highest.raw}`
        : `${formatEntityName(highest.entity, entityHeader)} is highest at ${highest.raw}`;

      // Format tied entities or single entity for lowest
      const lowestClause = lowestEntities.length > 1
        ? `${formatEntitiesList(lowestEntities, entityHeader)} are tied for lowest at ${lowest.raw}`
        : `${formatEntityName(lowest.entity, entityHeader)} is lowest at ${lowest.raw}`;

      lines.push(`For ${metric.toLowerCase()}, ${highestClause}, while ${lowestClause}.`);
    }
  });

  // Preserve all uncovered cells grouped by row
  for (let r = 0; r < rowCount; r++) {
    const uncoveredCols: number[] = [];
    for (let c = 1; c < headers.length; c++) {
      if (!coveredCells.has(`${r}:${c}`)) {
        uncoveredCols.push(c);
      }
    }

    if (uncoveredCols.length > 0) {
      const row = rows[r];
      const rawEntity = (row?.[0] || '').trim() || `Row ${r + 1}`;
      const entity = formatEntityName(rawEntity, entityHeader);
      const details = uncoveredCols
        .map((c) => `${headers[c]} ${row?.[c] || ''}`.trim())
        .join(', ');
      lines.push(`${entity} has ${details}.`);
    }
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

  // Single-column tables: render rows directly
  if (headers.length === 1) {
    const listLines = [
      `Table with ${rows.length} rows and column: ${headers[0]}.`
    ];
    rows.forEach((row, r) => {
      const val = (row[0] || '').trim();
      listLines.push(`${entityHeader} ${r + 1}: ${val}.`);
    });
    return listLines.join(' ');
  }

  const metricHeaders = headers.slice(1);

  const lines: string[] = [
    `Table with ${rows.length} rows and columns: ${headers.join(', ')}.`
  ];

  rows.forEach((row) => {
    const rawEntity = (row[0] || '').trim();
    const entity = formatEntityName(rawEntity, entityHeader);
    const cellReadouts = metricHeaders.map((header, idx) => {
      const cellVal = (row[idx + 1] || 'empty').trim();
      return `${header}: ${cellVal}`;
    });
    lines.push(`${entity}: ${cellReadouts.join(', ')}.`);
  });

  return lines.join(' ');
}

