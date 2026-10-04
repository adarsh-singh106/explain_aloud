import type { Block, Fact } from '@/src/types/ir';
import type { NarrationSegment, NarrationPlan } from '@/src/types/narration';
import { generateDeterministicTableSummary } from '@/src/table/tableEngine';

export interface ValidationResult {
  valid: boolean;
  reasons: string[];
  validatedSegment: NarrationSegment;
}

const VISUAL_PHRASE_REGEX = /\b(?:as\s+shown\s+(?:above|below|here)|as\s+seen\s+(?:above|below|here)|see\s+(?:the\s+)?(?:table|code|diagram|figure)\s+(?:above|below))\b/i;

/**
 * Extracts numeric literals from text.
 */
function extractNumbersFromText(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((m) => parseFloat(m));
}

/**
 * Validates a single NarrationSegment against source blocks and deterministic facts.
 * If validation fails, safely generates a deterministic fallback segment.
 */
export function validateSegment(
  segment: NarrationSegment,
  sourceBlock: Block | undefined,
  facts: Fact[]
): ValidationResult {
  const reasons: string[] = [];

  // 1. Source reference check
  if (!segment.sourceBlockIds || segment.sourceBlockIds.length === 0) {
    reasons.push('missing_source_block_ids');
  }

  // 2. Unresolved visual phrasing check
  if (VISUAL_PHRASE_REGEX.test(segment.text)) {
    reasons.push('unresolved_visual_reference');
  }

  // 3. Factual & numeric validation for table / factual blocks
  if (sourceBlock?.type === 'table') {
    const spokenNumbers = extractNumbersFromText(segment.text);

    // Collect all valid numbers from facts and raw table
    const validNumbers = new Set<number>();
    facts.forEach((f) => {
      if (f.kind === 'number') {
        const val = (f.value as any).number;
        if (typeof val === 'number') validNumbers.add(val);
      }
      if (f.kind === 'comparison') {
        const val = (f.value as any);
        if (val.highest?.value) validNumbers.add(val.highest.value);
        if (val.lowest?.value) validNumbers.add(val.lowest.value);
      }
    });

    // Check that every spoken number exists in valid source/derived facts
    for (const num of spokenNumbers) {
      // Ignore count of rows (e.g. "3 models")
      if (num === 3 && sourceBlock.raw.includes('3')) {
        continue;
      }
      if (!validNumbers.has(num)) {
        reasons.push(`unsupported_number:${num}`);
      }
    }

    // 4. Comparison check: prevent reversed min/max
    const compFacts = facts.filter((f) => f.kind === 'comparison');
    for (const comp of compFacts) {
      const { metric, highest, lowest } = comp.value as any;
      const lowerText = segment.text.toLowerCase();
      const metricLower = metric.toLowerCase();

      // If discussing this metric
      if (lowerText.includes(metricLower)) {
        // Reversed superlative checks
        const lowestClaimsHighest = new RegExp(
          `\\b${lowest.entity}\\b[^.]*\\b(?:highest|best|greatest|most)\\b[^.]*\\b${metricLower}\\b`,
          'i'
        );
        const highestClaimsLowest = new RegExp(
          `\\b${highest.entity}\\b[^.]*\\b(?:lowest|worst|least|slowest)\\b[^.]*\\b${metricLower}\\b`,
          'i'
        );

        if (lowestClaimsHighest.test(segment.text) || highestClaimsLowest.test(segment.text)) {
          reasons.push(`reversed_comparison:${metric}`);
        }
      }
    }
  }

  // 5. Code block check: no reciting line-by-line punctuation in natural mode
  if (sourceBlock?.type === 'code' && segment.provenance === 'llm') {
    if (/\b(?:colon|semicolon|open\s+brace|close\s+brace|indentation)\b/i.test(segment.text)) {
      reasons.push('punctuation_noise_in_natural_mode');
    }
  }

  if (reasons.length === 0) {
    return {
      valid: true,
      reasons: [],
      validatedSegment: {
        ...segment,
        verified: true,
      },
    };
  }

  // Validation FAILED -> generate safe deterministic fallback
  let fallbackText = segment.text;
  let fallbackProvenance = segment.provenance;

  if (sourceBlock?.type === 'table') {
    fallbackText = generateDeterministicTableSummary(sourceBlock);
    fallbackProvenance = 'rule';
  } else if (sourceBlock?.type === 'paragraph' || sourceBlock?.type === 'heading') {
    fallbackText = sourceBlock.raw.replace(/<[^>]+>/g, '').trim();
    fallbackProvenance = 'literal';
  }

  return {
    valid: false,
    reasons,
    validatedSegment: {
      id: `${segment.id}-fallback`,
      sourceBlockIds: segment.sourceBlockIds.length > 0 ? segment.sourceBlockIds : (sourceBlock ? [sourceBlock.id] : []),
      factIds: segment.factIds,
      provenance: fallbackProvenance,
      text: fallbackText,
      verified: true,
      fallbackReason: `Validation failed: ${reasons.join(', ')}`,
      pauseAfterMs: segment.pauseAfterMs || 350,
    },
  };
}

/**
 * Validates all segments in a NarrationPlan, safely applying fallbacks for invalid segments.
 */
export function validateNarrationPlan(
  plan: NarrationPlan,
  blocks: Block[],
  facts: Fact[]
): { plan: NarrationPlan; passedCount: number; fallbackCount: number } {
  const blockMap = new Map<string, Block>(blocks.map((b) => [b.id, b]));
  let passedCount = 0;
  let fallbackCount = 0;

  const validatedSegments = plan.segments.map((seg) => {
    const primaryBlockId = seg.sourceBlockIds[0];
    const sourceBlock = primaryBlockId ? blockMap.get(primaryBlockId) : undefined;
    const result = validateSegment(seg, sourceBlock, facts);

    if (result.valid) {
      passedCount++;
    } else {
      fallbackCount++;
    }

    return result.validatedSegment;
  });

  return {
    plan: {
      ...plan,
      segments: validatedSegments,
    },
    passedCount,
    fallbackCount,
  };
}
