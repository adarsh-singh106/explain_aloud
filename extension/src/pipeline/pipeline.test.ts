import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executePipelineFromHtml } from './pipeline';
import * as ollamaService from '@/src/services/ollama';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Milestone M6 — End-to-End Fixture Pipeline', () => {
  const fixturePath = path.resolve(__dirname, '../../../fixtures/mixed-response.html');
  const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

  it('executes full pipeline on fixtures/mixed-response.html in Natural mode', async () => {
    // Mock Gemma responses for deterministic unit testing
    vi.spyOn(ollamaService, 'generateWithGemma').mockImplementation(async (prompt: string) => {
      if (prompt.includes('language-python') || prompt.includes('for user in users:')) {
        return JSON.stringify({
          segments: [
            {
              text: 'This Python snippet iterates through each user and sends an email if the user is currently active.',
            },
          ],
        });
      }
      if (prompt.includes('Verified Facts:')) {
        return JSON.stringify({
          segments: [
            {
              text: 'Model A achieves the highest accuracy at 92%, but Model B provides the lowest latency at just 1 sec.',
              factIds: ['fact-block-4-comp-accuracy', 'fact-block-4-comp-latency'],
            },
          ],
        });
      }
      return JSON.stringify({ segments: [{ text: 'Generic explanation.' }] });
    });

    const result = await executePipelineFromHtml(fixtureHtml, {
      mode: 'natural',
      responseId: 'test-mixed-fixture',
    });

    // 1. Verify ResponseIR extraction
    expect(result.ir.blocks).toHaveLength(6);
    expect(result.ir.responseId).toBe('test-mixed-fixture');

    // 2. Verify deterministic facts extraction (Table facts from block-4)
    expect(result.facts.length).toBeGreaterThan(0);
    const comparisonFacts = result.facts.filter((f) => f.kind === 'comparison');
    expect(comparisonFacts).toHaveLength(2); // Accuracy and Latency

    // 3. Verify NarrationPlan generation
    expect(result.plan.segments.length).toBeGreaterThanOrEqual(6);

    // 4. Invariant: 100% of segments must reference source blocks
    for (const segment of result.plan.segments) {
      expect(segment.sourceBlockIds.length).toBeGreaterThan(0);
      expect(segment.verified).toBe(true);

      // Invariant: no visual-only artifacts
      expect(segment.text).not.toMatch(/\bas\s+shown\s+(?:above|below)\b/i);
      expect(segment.text.toLowerCase()).not.toContain('bullet');
    }

    // 5. Verify individual segment contents
    // Heading
    expect(result.plan.segments[0]?.text).toBe('Choosing a model.');
    // Paragraph 1
    expect(result.plan.segments[1]?.text).toContain('Suppose we need to choose between accuracy and latency');
    // List items
    expect(result.plan.segments[2]?.text).toContain('Accuracy matters for final predictions.');
    expect(result.plan.segments[4]?.text).toContain('Finally, The best choice depends');
    // Code block
    const codeSeg = result.plan.segments.find((s) => s.sourceBlockIds.includes('block-3'));
    expect(codeSeg?.text).toContain('iterates through each user and sends an email');
    // Table block
    const tableSeg = result.plan.segments.find((s) => s.sourceBlockIds.includes('block-4'));
    expect(tableSeg?.text).toContain('92%');
    expect(tableSeg?.text).toContain('1 sec');

    // 6. Validation stats
    expect(result.validationStats.passedCount).toBeGreaterThan(0);
    expect(result.validationStats.fallbackCount).toBe(0);
  });

  it('safely falls back to deterministic summary when LLM returns invalid numbers', async () => {
    // Simulate LLM hallucination on table
    vi.spyOn(ollamaService, 'generateWithGemma').mockImplementation(async (prompt: string) => {
      if (prompt.includes('Verified Facts:')) {
        return JSON.stringify({
          segments: [
            {
              text: 'Model A reached an incredible 99% accuracy with 25 sec latency.',
              factIds: [],
            },
          ],
        });
      }
      return JSON.stringify({ segments: [{ text: 'Code explanation.' }] });
    });

    const result = await executePipelineFromHtml(fixtureHtml, {
      mode: 'natural',
      responseId: 'test-fallback-fixture',
    });

    // The hallucinated 99% table segment should be rejected by the validator
    // and replaced by the deterministic table summary
    expect(result.validationStats.fallbackCount).toBe(1);

    const tableSeg = result.plan.segments.find((s) => s.sourceBlockIds.includes('block-4'));
    expect(tableSeg?.provenance).toBe('rule');
    expect(tableSeg?.text).toContain('The table compares 3 models');
    expect(tableSeg?.fallbackReason).toContain('unsupported_number:99');
    expect(tableSeg?.verified).toBe(true);
  });
});
