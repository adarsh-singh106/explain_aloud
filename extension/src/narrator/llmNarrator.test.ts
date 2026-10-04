import { describe, expect, it, vi } from 'vitest';
import type { Block, CodeStructured, Fact, TableStructured } from '@/src/types/ir';
import {
  extractJsonFromLlm,
  buildCodePrompt,
  buildTablePrompt,
  narrateCodeBlock,
  narrateTableBlock,
} from './llmNarrator';
import * as ollamaService from '@/src/services/ollama';

describe('Milestone M4 — LLM Narrator', () => {
  describe('extractJsonFromLlm', () => {
    it('parses direct JSON', () => {
      const raw = '{"segments": [{"text": "Hello world"}]}';
      const parsed = extractJsonFromLlm(raw);
      expect(parsed.segments).toHaveLength(1);
      expect(parsed.segments[0].text).toBe('Hello world');
    });

    it('parses JSON wrapped in markdown code fence', () => {
      const raw = '```json\n{"segments": [{"text": "Spoken explanation"}]}\n```';
      const parsed = extractJsonFromLlm(raw);
      expect(parsed.segments[0].text).toBe('Spoken explanation');
    });

    it('extracts JSON when surrounded by leading and trailing commentary', () => {
      const raw = 'Here is the requested output:\n```json\n{"text": "Extracted text"}\n```\nHope that helps!';
      const parsed = extractJsonFromLlm(raw);
      expect(parsed.text).toBe('Extracted text');
    });
  });

  describe('Prompt Builders', () => {
    it('buildCodePrompt generates natural prompt forbidding punctuation recitation', () => {
      const prompt = buildCodePrompt('for x in list:\n  print(x)', 'python', 'natural');
      expect(prompt).toContain('for x in list:');
      expect(prompt).toContain('Do not read punctuation');
      expect(prompt).toContain('Return JSON only');
    });

    it('buildCodePrompt generates literal prompt', () => {
      const prompt = buildCodePrompt('const a = 1;', 'javascript', 'literal');
      expect(prompt).toContain('accurately and literally');
    });

    it('buildTablePrompt includes verified facts and demands factIds', () => {
      const facts: Fact[] = [
        {
          id: 'fact-1',
          sourceBlockIds: ['block-4'],
          kind: 'comparison',
          value: {
            metric: 'Accuracy',
            highest: { entity: 'A', raw: '92%' },
            lowest: { entity: 'B', raw: '88%' },
          },
          critical: true,
        },
      ];

      const prompt = buildTablePrompt(facts);
      expect(prompt).toContain('fact-1');
      expect(prompt).toContain('Metric: Accuracy');
      expect(prompt).toContain('Highest: A (92%)');
      expect(prompt).toContain('factIds');
    });
  });

  describe('narrateCodeBlock with mocked Gemma service', () => {
    const codeBlock: Block = {
      id: 'block-code-1',
      order: 3,
      type: 'code',
      raw: '<pre><code>...</code></pre>',
      language: 'python',
      structured: {
        language: 'python',
        code: 'for user in users:\n    if user.active:\n        send_email(user)',
      } as CodeStructured,
    };

    it('maps LLM response to typed NarrationSegments with sourceBlockIds', async () => {
      vi.spyOn(ollamaService, 'generateWithGemma').mockResolvedValueOnce(
        JSON.stringify({
          segments: [
            { text: 'This snippet loops through each user and sends an email if they are active.' },
          ],
        })
      );

      const segments = await narrateCodeBlock(codeBlock, 'natural');
      expect(segments).toHaveLength(1);
      expect(segments[0]?.sourceBlockIds).toEqual(['block-code-1']);
      expect(segments[0]?.provenance).toBe('llm');
      expect(segments[0]?.text).toContain('loops through each user');
    });

    it('falls back safely to literal rendering when LLM call fails', async () => {
      vi.spyOn(ollamaService, 'generateWithGemma').mockRejectedValueOnce(
        new Error('Ollama connection timeout')
      );

      const segments = await narrateCodeBlock(codeBlock, 'natural');
      expect(segments).toHaveLength(1);
      expect(segments[0]?.provenance).toBe('literal');
      expect(segments[0]?.fallbackReason).toContain('Ollama connection timeout');
      expect(segments[0]?.text).toBeTruthy();
    });
  });

  describe('narrateTableBlock with mocked Gemma service', () => {
    const tableBlock: Block = {
      id: 'block-table-1',
      order: 4,
      type: 'table',
      raw: '<table>...</table>',
      structured: {
        headers: ['Model', 'Accuracy', 'Latency'],
        rows: [
          ['A', '92%', '4 sec'],
          ['B', '88%', '1 sec'],
          ['C', '90%', '2 sec'],
        ],
      } as TableStructured,
    };

    it('returns segments with sourceBlockIds and factIds', async () => {
      vi.spyOn(ollamaService, 'generateWithGemma').mockResolvedValueOnce(
        JSON.stringify({
          segments: [
            {
              text: 'Model A achieves the highest accuracy at 92%, but Model B has the best latency at only 1 second.',
              factIds: ['fact-block-table-1-comp-accuracy', 'fact-block-table-1-comp-latency'],
            },
          ],
        })
      );

      const segments = await narrateTableBlock(tableBlock);
      expect(segments).toHaveLength(1);
      expect(segments[0]?.sourceBlockIds).toEqual(['block-table-1']);
      expect(segments[0]?.factIds).toContain('fact-block-table-1-comp-accuracy');
      expect(segments[0]?.provenance).toBe('llm');
    });

    it('falls back safely to deterministic table summary on error', async () => {
      vi.spyOn(ollamaService, 'generateWithGemma').mockRejectedValueOnce(
        new Error('Model busy')
      );

      const segments = await narrateTableBlock(tableBlock);
      expect(segments).toHaveLength(1);
      expect(segments[0]?.provenance).toBe('rule');
      expect(segments[0]?.fallbackReason).toContain('Model busy');
      expect(segments[0]?.text).toContain('The table compares 3 models');
    });
  });
});
