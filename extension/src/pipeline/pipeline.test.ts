import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executePipelineFromHtml, buildNarrationPlanFromIR } from './pipeline';
import * as ollamaService from '@/src/services/ollama';
import type { Block, ResponseIR, TableStructured, CodeStructured } from '@/src/types/ir';

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

    // Small tables now use deterministic rows; keep this test on the LLM path.
    const largerFixture = fixtureHtml.replace('</tbody>', '<tr><td>D</td><td>89%</td><td>3 sec</td></tr><tr><td>E</td><td>91%</td><td>3 sec</td></tr></tbody>');
    const result = await executePipelineFromHtml(largerFixture, {
      mode: 'natural',
      responseId: 'test-fallback-fixture',
    });

    // The hallucinated 99% table segment should be rejected by the validator
    // and replaced by the deterministic table summary
    expect(result.validationStats.fallbackCount).toBe(1);

    const tableSeg = result.plan.segments.find((s) => s.sourceBlockIds.includes('block-4'));
    expect(tableSeg?.provenance).toBe('rule');
    expect(tableSeg?.text).toContain('The table compares 5 models');
    expect(tableSeg?.fallbackReason).toContain('unsupported_number:99');
    expect(tableSeg?.verified).toBe(false);
  });

  it('runs Literal mode fully deterministically without calling Ollama (A12)', async () => {
    const ollamaSpy = vi.spyOn(ollamaService, 'generateWithGemma');

    const result = await executePipelineFromHtml(fixtureHtml, {
      mode: 'literal',
      responseId: 'test-literal-fixture',
    });

    // In Literal mode, neither code nor table should call Ollama!
    expect(ollamaSpy).not.toHaveBeenCalled();

    // Code is literal
    const codeSeg = result.plan.segments.find((s) => s.sourceBlockIds.includes('block-3'));
    expect(codeSeg?.provenance).toBe('literal');
    expect(codeSeg?.text).toContain('for user in users:');
    expect(codeSeg?.text).toContain('send_email(user)');

    // Table is literal cell readout
    const tableSeg = result.plan.segments.find((s) => s.sourceBlockIds.includes('block-4'));
    expect(tableSeg?.provenance).toBe('literal');
    expect(tableSeg?.text).toContain('Model A: Accuracy: 92%, Latency: 4 sec');
    expect(tableSeg?.text).toContain('Model B: Accuracy: 88%, Latency: 1 sec');
    expect(tableSeg?.text).toContain('Model C: Accuracy: 90%, Latency: 2 sec');
  });

  describe('R06 & R07 Source-Fidelity Pipeline and Literal Mode Regression Tests', () => {
    it('R06: honors ordered list start value in narration', async () => {
      const html = '<article><ol start="5"><li>Continue</li></ol></article>';
      const result = await executePipelineFromHtml(html);
      expect(result.plan.segments[0]?.text).not.toContain('First');
      expect(result.plan.segments[0]?.text).toMatch(/^(?:Fifth|Step 5|Item 5)/);
      expect(result.plan.segments[0]?.text).toContain('Continue');
    });

    it('R07: literal table preserves digit-bearing string (Apache-2.0) with zero fallbacks', async () => {
      const tableBlock: Block = {
        id: 'block-table',
        order: 0,
        type: 'table',
        raw: '<table></table>',
        structured: {
          headers: ['Library', 'License'],
          rows: [
            ['LibA', 'MIT'],
            ['LibB', 'Apache-2.0'],
          ],
        } as TableStructured,
      };

      const testIr: ResponseIR = {
        schemaVersion: '1.0',
        site: 'chatgpt',
        responseId: 'test-literal-table',
        blocks: [tableBlock],
        facts: [],
      };

      const result = await buildNarrationPlanFromIR(testIr, { mode: 'literal' });
      expect(result.validationStats.fallbackCount).toBe(0);
      expect(result.plan.segments[0]?.text).toContain('Apache-2.0');
    });

    it('R07: literal code preserves line structure and indentation instead of collapsing', async () => {
      const codeBlock: Block = {
        id: 'block-code',
        order: 0,
        type: 'code',
        raw: '<pre><code>if ok:\n    action()\ncleanup()</code></pre>',
        structured: {
          language: 'python',
          code: 'if ok:\n    action()\ncleanup()',
        } as CodeStructured,
      };

      const testIr: ResponseIR = {
        schemaVersion: '1.0',
        site: 'chatgpt',
        responseId: 'test-literal-code',
        blocks: [codeBlock],
        facts: [],
      };

      const result = await buildNarrationPlanFromIR(testIr, { mode: 'literal' });
      const text = result.plan.segments[0]?.text || '';
      expect(text).not.toContain('if ok: action() cleanup()');
      expect(text).toContain('action()');
      expect(text).toContain('cleanup()');
      expect(text).toMatch(/(?:Line 1|indent|Line 2)/);
    });
  });
});


