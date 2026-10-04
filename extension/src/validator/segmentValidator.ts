import type { Block, Fact, CodeStructured, ListStructured } from '@/src/types/ir';
import type { NarrationSegment, NarrationPlan } from '@/src/types/narration';
import { generateDeterministicTableSummary } from '@/src/table/tableEngine';
import { cleanSpokenText } from '@/src/narrator/ruleNarrator';

export interface ValidationResult {
  valid: boolean;
  reasons: string[];
  validatedSegment: NarrationSegment;
}

const VISUAL_PHRASE_REGEX = /\b(?:as\s+(?:shown|seen|indicated|described)\s+(?:above|below|here)|see\s+(?:the\s+)?(?:table|code|diagram|figure|chart|image)\s+(?:above|below)|in\s+the\s+(?:table|figure|diagram)\s+(?:above|below))\b/i;

const CAUSAL_REGEX = /\b(?:because|due\s+to|since|as\s+a\s+result\s+of|caused\s+by|thanks\s+to|owing\s+to)\b/i;

const SPELLED_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts numeric literals from text.
 */
function extractNumbersFromText(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((m) => parseFloat(m));
}

/**
 * Parses written English number words (e.g. "ninety-nine", "eighty eight").
 */
function parseSpelledNumbers(text: string): number[] {
  const found: number[] = [];
  const words = text.toLowerCase().split(/[\s-]+/);
  for (let i = 0; i < words.length; i++) {
    const w1 = words[i]!;
    const v1 = SPELLED_NUMBERS[w1];
    if (v1 !== undefined && v1 >= 20 && i + 1 < words.length) {
      const w2 = words[i + 1]!;
      const v2 = SPELLED_NUMBERS[w2];
      if (v2 !== undefined && v2 > 0 && v2 < 10) {
        found.push(v1 + v2);
        i++;
        continue;
      }
    }
    if (v1 !== undefined && v1 >= 10) {
      found.push(v1);
    }
  }
  return found;
}

/**
 * Validates a single NarrationSegment against source blocks and deterministic facts.
 * If validation fails, safely generates a deterministic source-derived fallback segment.
 */
export function validateSegment(
  segment: NarrationSegment,
  sourceBlock: Block | undefined,
  allFacts: Fact[],
  allBlocks: Block[] = []
): ValidationResult {
  const reasons: string[] = [];

  // 1. Source reference existence check
  if (!segment.sourceBlockIds || segment.sourceBlockIds.length === 0) {
    reasons.push('missing_source_block_ids');
  } else if (allBlocks.length > 0) {
    const validBlockIds = new Set(allBlocks.map((b) => b.id));
    for (const sId of segment.sourceBlockIds) {
      if (!validBlockIds.has(sId)) {
        reasons.push(`invalid_source_block_id:${sId}`);
      }
    }
  }

  // 2. Unresolved visual phrasing check
  if (VISUAL_PHRASE_REGEX.test(segment.text)) {
    reasons.push('unresolved_visual_reference');
  }

  // Filter facts strictly to those originating from this segment's sourceBlockIds
  const scopedFacts = allFacts.filter((f) =>
    f.sourceBlockIds.some((sId) => segment.sourceBlockIds.includes(sId))
  );

  // 3. Fact ID validity check: segment.factIds must exist in scopedFacts
  if (segment.factIds && segment.factIds.length > 0) {
    const validFactIds = new Set(scopedFacts.map((f) => f.id));
    for (const fId of segment.factIds) {
      if (!validFactIds.has(fId)) {
        reasons.push(`invalid_fact_id:${fId}`);
      }
    }
  }

  // 4. Factual & numeric validation for table blocks
  if (sourceBlock?.type === 'table') {
    // 4A. Unsupported causality check: tables do not contain causal explanations
    if (CAUSAL_REGEX.test(segment.text)) {
      reasons.push('unsupported_causality');
    }

    // Collect valid numbers and valid entities from scoped table facts
    const validNumbers = new Set<number>();
    const validEntities = new Set<string>();
    const entityNumberMap: { entity: string; metric: string; number: number }[] = [];

    scopedFacts.forEach((f) => {
      if (f.kind === 'identifier') {
        const val = f.value as any;
        if (val.entity) validEntities.add(val.entity.trim());
      }
      if (f.kind === 'number') {
        const val = f.value as any;
        if (typeof val.number === 'number') {
          validNumbers.add(val.number);
          entityNumberMap.push({
            entity: val.entity,
            metric: val.metric,
            number: val.number,
          });
        }
      }
      if (f.kind === 'comparison') {
        const val = f.value as any;
        if (val.highest?.value !== undefined) validNumbers.add(val.highest.value);
        if (val.lowest?.value !== undefined) validNumbers.add(val.lowest.value);
        if (val.highest?.entity) validEntities.add(val.highest.entity.trim());
        if (val.lowest?.entity) validEntities.add(val.lowest.entity.trim());
      }
    });

    // 4B. Check numeric literals (digits and spelled-out words)
    const spokenNumbers = extractNumbersFromText(segment.text);
    const spelledNumbers = parseSpelledNumbers(segment.text);
    const allSpoken = [...spokenNumbers, ...spelledNumbers];

    for (const num of allSpoken) {
      // Allow row count mention (e.g. "3 models")
      if (num === (sourceBlock.structured as any)?.rows?.length) {
        continue;
      }
      if (!validNumbers.has(num)) {
        reasons.push(`unsupported_number:${num}`);
      }
    }

    // 4C. Unsupported entity check (e.g. "Model Z" when only A, B, C exist)
    const entityMatches = segment.text.matchAll(/\b(?:model|candidate|option|system|item)\s+([a-zA-Z0-9_-]+)\b/gi);
    for (const match of entityMatches) {
      const namedEntity = match[1]?.trim();
      const fullNamed = match[0]?.trim();
      if (namedEntity && !validEntities.has(namedEntity) && !validEntities.has(fullNamed || '')) {
        reasons.push(`unsupported_entity:${fullNamed}`);
      }
    }

    // 4D. Entity-metric-number binding check (prevent e.g. "Model B has 92% accuracy")
    // Split into clauses to check local entity-number pairings
    const clauses = segment.text.split(/(?:[.;]|\b(?:but|while|whereas|although|however)\b)/i);
    for (const clause of clauses) {
      const clauseNumbers = extractNumbersFromText(clause);
      for (const num of clauseNumbers) {
        // Find facts matching this number
        const matchingFacts = entityNumberMap.filter((m) => m.number === num);
        if (matchingFacts.length > 0) {
          const trueEntities = new Set(matchingFacts.map((m) => m.entity.toLowerCase()));
          // Check if another entity is falsely named in this clause
          for (const ent of validEntities) {
            const entEsc = escapeRegex(ent);
            const entRegex = new RegExp(`\\b(?:model\\s+)?${entEsc}\\b`, 'i');
            if (entRegex.test(clause) && !trueEntities.has(ent.toLowerCase())) {
              // Conflicting entity mentioned near this number!
              // Ensure the true entity is not also in this clause
              const hasTrueEntity = Array.from(trueEntities).some((te) =>
                new RegExp(`\\b(?:model\\s+)?${escapeRegex(te)}\\b`, 'i').test(clause)
              );
              if (!hasTrueEntity) {
                reasons.push(`falsified_entity_binding:${ent}_with_${num}`);
              }
            }
          }
        }
      }
    }

    // 4E. Comparison check: prevent reversed min/max and false superiority claims
    const compFacts = scopedFacts.filter((f) => f.kind === 'comparison');
    for (const comp of compFacts) {
      const { metric, highest, lowest, isTie } = comp.value as any;
      if (isTie) continue;

      const lowestEsc = escapeRegex(lowest.entity);
      const highestEsc = escapeRegex(highest.entity);
      const metricLower = metric.toLowerCase();

      // Check if lowest is claimed to outperform / beat highest on this metric
      const reversedPhrasing = new RegExp(
        `\\b(?:model\\s+)?${lowestEsc}\\b[^.;]*(?:outperforms|beats|exceeds|surpasses|better\\s+than|higher\\s+than)[^.;]*\\b(?:model\\s+)?${highestEsc}\\b`,
        'i'
      );
      if (reversedPhrasing.test(segment.text)) {
        reasons.push(`reversed_comparison:${metric}`);
      }

      for (const clause of clauses) {
        const lowerClause = clause.toLowerCase();
        if (!lowerClause.includes(metricLower)) continue;

        // Check if lowest entity is falsely claimed to be highest/best for this metric
        const lowestClaimsHighest = new RegExp(
          `\\b(?:model\\s+)?${lowestEsc}\\b[^,;]*\\b(?:highest|best|greatest|most)\\b`,
          'i'
        );
        // Check if highest entity is falsely claimed to be lowest/worst for this metric
        const highestClaimsLowest = new RegExp(
          `\\b(?:model\\s+)?${highestEsc}\\b[^,;]*\\b(?:lowest|worst|least|slowest)\\b`,
          'i'
        );

        if (lowestClaimsHighest.test(clause) || highestClaimsLowest.test(clause)) {
          reasons.push(`reversed_comparison:${metric}`);
          break;
        }
      }
    }
  }

  // 5. Code block check: no reciting line-by-line punctuation in natural mode & no unsupported claims
  if (sourceBlock?.type === 'code') {
    if (segment.provenance === 'llm') {
      if (/\b(?:colon|semicolon|open\s+brace|close\s+brace|indentation)\b/i.test(segment.text)) {
        reasons.push('punctuation_noise_in_natural_mode');
      }

      // Grounding check: verify that specific operations/calls mentioned exist in source code
      const codeRaw = ((sourceBlock.structured as CodeStructured)?.code || sourceBlock.raw || '').toLowerCase();
      const operationMatches = segment.text.matchAll(/\b(?:calls|invokes|executes|runs)\s+([a-zA-Z0-9_]+)\b/gi);
      for (const op of operationMatches) {
        const funcName = op[1]?.toLowerCase();
        if (funcName && !codeRaw.includes(funcName)) {
          reasons.push(`unsupported_code_claim:${op[1]}`);
        }
      }

      // Check for prominent destructive or external actions not in code
      const foreignTerms = ['delete_database', 'drop_table', 'upload', 'uploads', 'format_disk'];
      for (const term of foreignTerms) {
        if (new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(segment.text) && !codeRaw.includes(term)) {
          reasons.push(`unsupported_code_claim:${term}`);
        }
      }
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

  // Validation FAILED -> generate safe deterministic source-derived fallback
  let fallbackText: string;
  let fallbackProvenance: 'rule' | 'literal' = 'literal';

  if (!sourceBlock) {
    fallbackText = 'Content for this segment is unavailable.';
    fallbackProvenance = 'literal';
  } else if (sourceBlock.type === 'table') {
    fallbackText = generateDeterministicTableSummary(sourceBlock);
    fallbackProvenance = 'rule';
  } else if (sourceBlock.type === 'code') {
    const structured = sourceBlock.structured as CodeStructured | undefined;
    const code = (structured?.code || sourceBlock.raw || '').replace(/\s+/g, ' ').trim();
    const language = structured?.language || sourceBlock.language || 'code';
    fallbackText = `Code snippet in ${language}: ${code}`;
    fallbackProvenance = 'literal';
  } else if (sourceBlock.type === 'paragraph') {
    const rawNoHtml = sourceBlock.raw.replace(/<[^>]+>/g, '');
    const cleaned = cleanSpokenText(rawNoHtml).replace(VISUAL_PHRASE_REGEX, '').trim();
    fallbackText = cleaned || 'Paragraph content unavailable.';
    fallbackProvenance = 'literal';
  } else if (sourceBlock.type === 'heading') {
    const rawNoHtml = sourceBlock.raw.replace(/<[^>]+>/g, '');
    const cleaned = cleanSpokenText(rawNoHtml).replace(VISUAL_PHRASE_REGEX, '').trim();
    fallbackText = cleaned ? `Heading: ${cleaned}` : 'Heading unavailable.';
    fallbackProvenance = 'literal';
  } else if (sourceBlock.type === 'list') {
    const structured = sourceBlock.structured as ListStructured | undefined;
    const items = structured?.items || [];
    fallbackText = items.length > 0
      ? items.map((it, i) => `Item ${i + 1}: ${cleanSpokenText(it)}`).join('. ')
      : 'List content unavailable.';
    fallbackProvenance = 'literal';
  } else {
    const rawNoHtml = sourceBlock.raw.replace(/<[^>]+>/g, '');
    const cleaned = cleanSpokenText(rawNoHtml).replace(VISUAL_PHRASE_REGEX, '').trim();
    fallbackText = cleaned || 'Block content unavailable.';
    fallbackProvenance = 'literal';
  }

  return {
    valid: false,
    reasons,
    validatedSegment: {
      id: `${segment.id}-fallback`,
      sourceBlockIds: segment.sourceBlockIds.length > 0
        ? segment.sourceBlockIds
        : (sourceBlock ? [sourceBlock.id] : []),
      factIds: [],
      provenance: fallbackProvenance,
      text: fallbackText,
      verified: false, // Never set verification merely because fallback dispatch completed
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
    const result = validateSegment(seg, sourceBlock, facts, blocks);

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
