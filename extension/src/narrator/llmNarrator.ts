import type { Block, CodeStructured, Fact } from '@/src/types/ir';
import type { NarrationSegment } from '@/src/types/narration';
import { generateWithGemma } from '@/src/services/ollama';
import { extractTableFacts, generateDeterministicTableSummary, generateSmallTableSummary } from '@/src/table/tableEngine';
import { formatLiteralCode } from '@/src/narrator/ruleNarrator';

export type NarrationMode = 'natural' | 'literal';

export interface ValidatedLlmSegment {
  text: string;
  factIds?: string[];
}

/**
 * Extracts and parses a JSON object from an LLM response string.
 */
export function extractJsonFromLlm(raw: string): any {
  let cleaned = raw.trim();
  // Strip markdown code fence if wrapped
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    cleaned = match[1].trim();
  }

  // Find opening and closing braces
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

/**
 * Validates and enforces runtime schema on parsed LLM output.
 * Prevents type errors, malformed structures, or empty strings from proceeding.
 */
export function validateLlmSegments(data: any): ValidatedLlmSegment[] {
  if (!data || typeof data !== 'object') {
    throw new Error('LLM output is not a valid JSON object');
  }

  let rawList: any[] = [];
  if (Array.isArray(data.segments)) {
    rawList = data.segments;
  } else if (typeof data.text === 'string' && data.text.trim()) {
    rawList = [{ text: data.text, factIds: Array.isArray(data.factIds) ? data.factIds : undefined }];
  } else if (typeof data.comparison === 'string' && data.comparison.trim()) {
    rawList = [{ text: data.comparison, factIds: Array.isArray(data.factIds) ? data.factIds : undefined }];
  } else if (typeof data.explanation === 'string' && data.explanation.trim()) {
    rawList = [{ text: data.explanation, factIds: undefined }];
  } else {
    throw new Error('LLM output missing text or segments array');
  }

  const validated: ValidatedLlmSegment[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.text !== 'string' || !item.text.trim()) continue;

    const factIds = Array.isArray(item.factIds)
      ? item.factIds.filter((id: any) => typeof id === 'string' && id.trim())
      : undefined;

    validated.push({
      text: item.text.trim(),
      factIds,
    });
  }

  if (validated.length === 0) {
    throw new Error('No non-empty text segments found in LLM output');
  }

  return validated;
}

/**
 * Generates prompt for Code block narration.
 */
export function buildCodePrompt(code: string, language: string, mode: NarrationMode): string {
  if (mode === 'literal') {
    return `Return JSON only matching {"segments": [{"text": string}]}.

Code (${language}):
\`\`\`${language}
${code}
\`\`\`

Read this code accurately and literally for a listener. State identifiers and logic plainly without fluff.`;
  }

  return `Return JSON only matching {"segments": [{"text": string}]}.

Code (${language}):
\`\`\`${language}
${code}
\`\`\`

Explain the purpose, control flow, conditions, and actions of this code for someone listening without a screen.
Rules:
- Do not read punctuation (colons, braces, indentations) line by line.
- Do not invent behavior, unseen functions, or actions not present in the code.
- State only what the code does directly.
- Return 1 to 2 spoken sentences.`;
}

/**
 * Narrates a code block using local Gemma with safe fallback.
 */
export async function narrateCodeBlock(
  block: Block,
  mode: NarrationMode = 'natural',
  model = 'gemma4:e4b'
): Promise<NarrationSegment[]> {
  const structured = block.structured as CodeStructured | undefined;
  const code = structured?.code || block.raw;
  const language = structured?.language || block.language || 'code';

  const prompt = buildCodePrompt(code, language, mode);

  try {
    const rawResponse = await generateWithGemma(prompt, model);
    const parsed = extractJsonFromLlm(rawResponse);
    const validatedSegments = validateLlmSegments(parsed);

    return validatedSegments.map((seg, idx) => ({
      id: `seg-${block.id}-${idx}`,
      sourceBlockIds: [block.id],
      factIds: [],
      provenance: 'llm',
      text: seg.text,
      verified: false, // Must be verified by validator
      pauseAfterMs: 350,
    }));
  } catch (err: any) {
    // Source-derived safe fallback for code: NEVER invent unseen behavior
    const fallbackText = mode === 'literal'
      ? formatLiteralCode(code, language)
      : `Verified explanation is unavailable for this ${language} code block.\n${formatLiteralCode(code, language)}`;

    return [
      {
        id: `seg-${block.id}-fallback`,
        sourceBlockIds: [block.id],
        factIds: [],
        provenance: 'literal',
        text: fallbackText,
        verified: false,
        fallbackReason: `LLM error: ${err.message || String(err)}`,
        pauseAfterMs: 350,
      },
    ];
  }
}

/**
 * Generates prompt for Table block narration using only pre-extracted deterministic facts.
 */
export function buildTablePrompt(facts: Fact[]): string {
  const factDescriptions = facts.map((f) => {
    if (f.kind === 'comparison') {
      const val = f.value as any;
      if (val.isTie) {
        return `- factId: "${f.id}", Metric: ${val.metric}, All entities tied at: ${val.highest.raw}`;
      }
      const highestNames = Array.isArray(val.highest.entities) ? val.highest.entities.join(', ') : val.highest.entity;
      const lowestNames = Array.isArray(val.lowest.entities) ? val.lowest.entities.join(', ') : val.lowest.entity;
      return `- factId: "${f.id}", Metric: ${val.metric}, Highest: ${highestNames} (${val.highest.raw}), Lowest: ${lowestNames} (${val.lowest.raw})`;
    }
    if (f.kind === 'number') {
      const val = f.value as any;
      return `- factId: "${f.id}", Entity: ${val.entity}, Metric: ${val.metric}, Value: ${val.raw}`;
    }
    if (f.kind === 'identifier') {
      const val = f.value as any;
      if (val.text) {
        return `- factId: "${f.id}", Entity: ${val.entity}, Metric: ${val.metric}, Value: ${val.text}`;
      }
      return `- factId: "${f.id}", Identifier: ${val.entity} (${val.entityType})`;
    }
    return `- factId: "${f.id}", Value: ${JSON.stringify(f.value)}`;
  }).join('\n');

  return `Return JSON only matching {"segments": [{"text": string, "factIds": string[]}]}.

Verified Facts:
${factDescriptions}

Write 1 or 2 natural spoken sentences summarizing these comparison facts for a listener.
Rules:
- Use only facts from the list.
- Do NOT add numbers or entities not present in the facts.
- Do NOT reverse min and max.
- In each segment, list the exact factIds used.`;
}

/**
 * Narrates a table block using local Gemma guided by deterministic facts with safe fallback.
 */
export async function narrateTableBlock(
  block: Block,
  model = 'gemma4:e4b'
): Promise<NarrationSegment[]> {
  const facts = extractTableFacts(block);
  const smallTable = generateSmallTableSummary(block);
  if (smallTable) {
    return [{
      id: `seg-${block.id}-rows`, sourceBlockIds: [block.id],
      factIds: facts.filter(fact => fact.kind !== 'comparison').map(fact => fact.id),
      provenance: 'rule', text: smallTable, verified: true, pauseAfterMs: 350,
    }];
  }

  if (facts.length === 0) {
    return [
      {
        id: `seg-${block.id}-fallback`,
        sourceBlockIds: [block.id],
        factIds: [],
        provenance: 'rule',
        text: generateDeterministicTableSummary(block),
        verified: true,
        pauseAfterMs: 350,
      },
    ];
  }

  const prompt = buildTablePrompt(facts);

  try {
    const rawResponse = await generateWithGemma(prompt, model);
    const parsed = extractJsonFromLlm(rawResponse);
    const validatedSegments = validateLlmSegments(parsed);

    return validatedSegments.map((seg, idx) => ({
      id: `seg-${block.id}-${idx}`,
      sourceBlockIds: [block.id],
      factIds: seg.factIds || facts.map((f) => f.id),
      provenance: 'llm',
      text: seg.text,
      verified: false, // To be verified by M5 validator
      pauseAfterMs: 350,
    }));
  } catch (err: any) {
    // Fall back safely to deterministic summary
    return [
      {
        id: `seg-${block.id}-fallback`,
        sourceBlockIds: [block.id],
        factIds: facts.map((f) => f.id),
        provenance: 'rule',
        text: generateDeterministicTableSummary(block),
        verified: false,
        fallbackReason: `LLM error: ${err.message || String(err)}`,
        pauseAfterMs: 400,
      },
    ];
  }
}
