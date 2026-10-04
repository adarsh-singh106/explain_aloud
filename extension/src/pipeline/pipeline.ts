import type { Block, Fact, ResponseIR } from '@/src/types/ir';
import type { NarrationPlan, NarrationSegment } from '@/src/types/narration';
import { parseResponseHtml, parseResponseElement } from '@/src/parser/htmlParser';
import { narrateBlockWithRules } from '@/src/narrator/ruleNarrator';
import { narrateCodeBlock, narrateTableBlock, type NarrationMode } from '@/src/narrator/llmNarrator';
import { extractTableFacts } from '@/src/table/tableEngine';
import { validateNarrationPlan } from '@/src/validator/segmentValidator';

export interface PipelineOptions {
  mode?: NarrationMode;
  model?: string;
  responseId?: string;
}

export interface PipelineResult {
  ir: ResponseIR;
  facts: Fact[];
  plan: NarrationPlan;
  validationStats: {
    passedCount: number;
    fallbackCount: number;
  };
}

/**
 * End-to-end pipeline: converts ResponseIR into a validated, audio-ready NarrationPlan.
 */
export async function buildNarrationPlanFromIR(
  ir: ResponseIR,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const mode = options.mode || 'natural';
  const model = options.model || 'gemma4:e4b';

  // 1. Pre-extract all deterministic facts
  const allFacts: Fact[] = [];
  for (const block of ir.blocks) {
    if (block.type === 'table') {
      const tableFacts = extractTableFacts(block);
      allFacts.push(...tableFacts);
    }
  }

  ir.facts = allFacts;

  // 2. Generate candidate narration segments per block
  const rawSegments: NarrationSegment[] = [];

  for (const block of ir.blocks) {
    // A. Check rule-based generation (paragraph, heading, list)
    const ruleSegments = narrateBlockWithRules(block);
    if (ruleSegments) {
      rawSegments.push(...ruleSegments);
      continue;
    }

    // B. Code block generation
    if (block.type === 'code') {
      const codeSegments = await narrateCodeBlock(block, mode, model);
      rawSegments.push(...codeSegments);
      continue;
    }

    // C. Table block generation
    if (block.type === 'table') {
      const tableSegments = await narrateTableBlock(block, model);
      rawSegments.push(...tableSegments);
      continue;
    }

    // D. Unknown / fallback element
    const fallbackText = (block.structured as any)?.text || block.raw.replace(/<[^>]+>/g, '').trim();
    if (fallbackText) {
      rawSegments.push({
        id: `seg-${block.id}-fallback`,
        sourceBlockIds: [block.id],
        factIds: [],
        provenance: 'literal',
        text: fallbackText,
        verified: true,
        pauseAfterMs: 300,
      });
    }
  }

  // 3. Assemble unvalidated plan
  const candidatePlan: NarrationPlan = {
    responseId: ir.responseId,
    segments: rawSegments,
  };

  // 4. Validate and apply safe fallbacks
  const { plan: validatedPlan, passedCount, fallbackCount } = validateNarrationPlan(
    candidatePlan,
    ir.blocks,
    allFacts
  );

  return {
    ir,
    facts: allFacts,
    plan: validatedPlan,
    validationStats: {
      passedCount,
      fallbackCount,
    },
  };
}

/**
 * End-to-end pipeline from HTML string.
 */
export async function executePipelineFromHtml(
  html: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const ir = parseResponseHtml(html, options.responseId || 'resp-fixture');
  return buildNarrationPlanFromIR(ir, options);
}

/**
 * End-to-end pipeline from DOM element.
 */
export async function executePipelineFromElement(
  container: Element,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const ir = parseResponseElement(container, options.responseId || 'resp-element');
  return buildNarrationPlanFromIR(ir, options);
}
