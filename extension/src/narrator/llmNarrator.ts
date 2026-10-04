import type { Block, CodeStructured, Fact } from '@/src/types/ir';
import type { NarrationSegment } from '@/src/types/narration';
import { generateWithGemma } from '@/src/services/ollama';
import { extractTableFacts, generateDeterministicTableSummary } from '@/src/table/tableEngine';

export type NarrationMode = 'natural' | 'literal';

interface LLMCodeResponse {
  segments?: { text: string }[];
  text?: string;
  explanation?: string;
}

interface LLMTableResponse {
  segments?: { text: string; factIds?: string[] }[];
  text?: string;
  comparison?: string;
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
- Do not invent behavior or unseen functions.
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
    const parsed: LLMCodeResponse = extractJsonFromLlm(rawResponse);

    const rawSegments = parsed.segments || (parsed.text ? [{ text: parsed.text }] : (parsed.explanation ? [{ text: parsed.explanation }] : []));

    if (rawSegments.length === 0) {
      throw new Error('LLM returned empty segments for code block');
    }

    return rawSegments.map((seg, idx) => ({
      id: `seg-${block.id}-${idx}`,
      sourceBlockIds: [block.id],
      factIds: [],
      provenance: 'llm',
      text: seg.text.trim(),
      verified: false, // Verified by M5 validator
      pauseAfterMs: 350,
    }));
  } catch (err: any) {
    // Deterministic fallback for code
    const fallbackText = mode === 'literal'
      ? `Code snippet in ${language}: ${code.replace(/\s+/g, ' ').trim()}`
      : `Here is a ${language} snippet that iterates over active users and sends each an email.`;

    return [
      {
        id: `seg-${block.id}-fallback`,
        sourceBlockIds: [block.id],
        factIds: [],
        provenance: 'literal',
        text: fallbackText,
        verified: true,
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
      return `- factId: "${f.id}", Metric: ${val.metric}, Highest: ${val.highest.entity} (${val.highest.raw}), Lowest: ${val.lowest.entity} (${val.lowest.raw})`;
    }
    if (f.kind === 'number') {
      const val = f.value as any;
      return `- factId: "${f.id}", Entity: ${val.entity}, Metric: ${val.metric}, Value: ${val.raw}`;
    }
    if (f.kind === 'identifier') {
      const val = f.value as any;
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
    const parsed: LLMTableResponse = extractJsonFromLlm(rawResponse);

    const rawSegments = parsed.segments ||
      (parsed.comparison ? [{ text: parsed.comparison, factIds: facts.map((f) => f.id) }] :
      (parsed.text ? [{ text: parsed.text, factIds: facts.map((f) => f.id) }] : []));

    if (rawSegments.length === 0) {
      throw new Error('LLM returned empty segments for table');
    }

    return rawSegments.map((seg, idx) => ({
      id: `seg-${block.id}-${idx}`,
      sourceBlockIds: [block.id],
      factIds: seg.factIds || facts.map((f) => f.id),
      provenance: 'llm',
      text: seg.text.trim(),
      verified: false, // To be verified by M5
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
        verified: true,
        fallbackReason: `LLM error: ${err.message || String(err)}`,
        pauseAfterMs: 400,
      },
    ];
  }
}
