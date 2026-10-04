import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResponseHtml } from './htmlParser';
import type {
  HeadingStructured,
  ParagraphStructured,
  ListStructured,
  CodeStructured,
  TableStructured,
} from '@/src/types/ir';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Milestone M1 — ResponseIR Parser', () => {
  describe('Unit tests for individual block types', () => {
    it('parses heading blocks with correct level and text', () => {
      const html = '<article><h2>Choosing a model</h2><h3>Secondary heading</h3></article>';
      const ir = parseResponseHtml(html);

      expect(ir.blocks).toHaveLength(2);
      expect(ir.blocks[0]?.type).toBe('heading');
      expect((ir.blocks[0]?.structured as HeadingStructured).level).toBe(2);
      expect((ir.blocks[0]?.structured as HeadingStructured).text).toBe('Choosing a model');

      expect(ir.blocks[1]?.type).toBe('heading');
      expect((ir.blocks[1]?.structured as HeadingStructured).level).toBe(3);
      expect((ir.blocks[1]?.structured as HeadingStructured).text).toBe('Secondary heading');
    });

    it('parses paragraph blocks preserving text', () => {
      const html = '<article><p>Suppose we need to choose between accuracy and latency.</p></article>';
      const ir = parseResponseHtml(html);

      expect(ir.blocks).toHaveLength(1);
      expect(ir.blocks[0]?.type).toBe('paragraph');
      expect((ir.blocks[0]?.structured as ParagraphStructured).text).toBe(
        'Suppose we need to choose between accuracy and latency.'
      );
    });

    it('parses unordered and ordered lists preserving items', () => {
      const html = `
        <article>
          <ul>
            <li>Accuracy matters.</li>
            <li>Latency matters.</li>
          </ul>
          <ol>
            <li>Step one</li>
            <li>Step two</li>
          </ol>
        </article>
      `;
      const ir = parseResponseHtml(html);

      expect(ir.blocks).toHaveLength(2);
      expect(ir.blocks[0]?.type).toBe('list');
      const ul = ir.blocks[0]?.structured as ListStructured;
      expect(ul.ordered).toBe(false);
      expect(ul.items).toEqual(['Accuracy matters.', 'Latency matters.']);

      expect(ir.blocks[1]?.type).toBe('list');
      const ol = ir.blocks[1]?.structured as ListStructured;
      expect(ol.ordered).toBe(true);
      expect(ol.items).toEqual(['Step one', 'Step two']);
    });

    it('parses code blocks preserving language and raw code', () => {
      const html = `
        <article>
          <pre><code class="language-python">for user in users:
    if user.active:
        send_email(user)</code></pre>
        </article>
      `;
      const ir = parseResponseHtml(html);

      expect(ir.blocks).toHaveLength(1);
      expect(ir.blocks[0]?.type).toBe('code');
      expect(ir.blocks[0]?.language).toBe('python');
      const codeBlock = ir.blocks[0]?.structured as CodeStructured;
      expect(codeBlock.language).toBe('python');
      expect(codeBlock.code).toContain('for user in users:');
      expect(codeBlock.code).toContain('send_email(user)');
    });

    it('parses tables extracting headers and data rows deterministically', () => {
      const html = `
        <article>
          <table>
            <thead><tr><th>Model</th><th>Accuracy</th><th>Latency</th></tr></thead>
            <tbody>
              <tr><td>A</td><td>92%</td><td>4 sec</td></tr>
              <tr><td>B</td><td>88%</td><td>1 sec</td></tr>
            </tbody>
          </table>
        </article>
      `;
      const ir = parseResponseHtml(html);

      expect(ir.blocks).toHaveLength(1);
      expect(ir.blocks[0]?.type).toBe('table');
      const table = ir.blocks[0]?.structured as TableStructured;
      expect(table.headers).toEqual(['Model', 'Accuracy', 'Latency']);
      expect(table.rows).toEqual([
        ['A', '92%', '4 sec'],
        ['B', '88%', '1 sec'],
      ]);
    });

    it('ensures no content silently disappears (unknown / custom element fallback)', () => {
      const html = '<article><blockquote>Important note here</blockquote></article>';
      const ir = parseResponseHtml(html);

      expect(ir.blocks).toHaveLength(1);
      expect(ir.blocks[0]?.type).toBe('unknown');
      expect(ir.blocks[0]?.raw).toContain('Important note here');
    });
  });

  describe('End-to-end fixture: fixtures/mixed-response.html', () => {
    const fixturePath = path.resolve(__dirname, '../../../fixtures/mixed-response.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

    it('loads and correctly parses mixed-response.html into all 6 blocks', () => {
      const ir = parseResponseHtml(fixtureHtml, 'fixture-mixed-001');

      expect(ir.schemaVersion).toBe('1.0');
      expect(ir.site).toBe('chatgpt');
      expect(ir.responseId).toBe('fixture-mixed-001');

      // The fixture contains:
      // 0: h2
      // 1: p
      // 2: ul
      // 3: pre/code
      // 4: table
      // 5: p
      expect(ir.blocks).toHaveLength(6);

      // Block 0: heading
      expect(ir.blocks[0]?.type).toBe('heading');
      expect((ir.blocks[0]?.structured as HeadingStructured).text).toBe('Choosing a model');
      expect((ir.blocks[0]?.structured as HeadingStructured).level).toBe(2);

      // Block 1: paragraph
      expect(ir.blocks[1]?.type).toBe('paragraph');
      expect((ir.blocks[1]?.structured as ParagraphStructured).text).toBe(
        'Suppose we need to choose between accuracy and latency for a small API.'
      );

      // Block 2: list
      expect(ir.blocks[2]?.type).toBe('list');
      const list = ir.blocks[2]?.structured as ListStructured;
      expect(list.ordered).toBe(false);
      expect(list.items).toEqual([
        'Accuracy matters for final predictions.',
        'Latency matters for interactive use.',
        'The best choice depends on the product constraint.',
      ]);

      // Block 3: code
      expect(ir.blocks[3]?.type).toBe('code');
      expect(ir.blocks[3]?.language).toBe('python');
      const code = ir.blocks[3]?.structured as CodeStructured;
      expect(code.language).toBe('python');
      expect(code.code.trim()).toBe(
        'for user in users:\n    if user.active:\n        send_email(user)'
      );

      // Block 4: table
      expect(ir.blocks[4]?.type).toBe('table');
      const table = ir.blocks[4]?.structured as TableStructured;
      expect(table.headers).toEqual(['Model', 'Accuracy', 'Latency']);
      expect(table.rows).toEqual([
        ['A', '92%', '4 sec'],
        ['B', '88%', '1 sec'],
        ['C', '90%', '2 sec'],
      ]);

      // Block 5: paragraph
      expect(ir.blocks[5]?.type).toBe('paragraph');
      expect((ir.blocks[5]?.structured as ParagraphStructured).text).toBe(
        'For an interactive product, the tradeoff between speed and accuracy should be explicit.'
      );
    });
  });
});
