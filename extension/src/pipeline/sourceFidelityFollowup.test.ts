import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executePipelineFromHtml } from './pipeline';
import * as ollamaService from '@/src/services/ollama';

describe('Follow-up Package 1 — Final Narration Plan Source-Fidelity Regressions', () => {
  beforeEach(() => {
    vi.spyOn(ollamaService, 'generateWithGemma').mockRejectedValue(new Error('Ollama offline'));
  });

  // Case 1: Wrapper with meaningful sibling content surviving in document order
  it('Case 1: preserves meaningful sibling content (spans/warnings) in wrappers in document order', async () => {
    const html = `
      <article>
        <div>
          <span>Important notice: check settings before running.</span>
          <pre><code class="language-python">print(42)</code></pre>
        </div>
      </article>
    `;
    const result = await executePipelineFromHtml(html, { mode: 'literal' });
    const texts = result.plan.segments.map((s) => s.text);
    const combined = texts.join(' ');
    expect(combined).toContain('Important notice: check settings before running');
    expect(combined).toContain('print(42)');

    // Verify document order: notice appears before code
    const noticeIdx = texts.findIndex((t) => t.includes('Important notice'));
    const codeIdx = texts.findIndex((t) => t.includes('print(42)'));
    expect(noticeIdx).toBeGreaterThanOrEqual(0);
    expect(codeIdx).toBeGreaterThan(noticeIdx);
  });

  // Case 2: Inline adjacency without artificial spaces
  it('Case 2: preserves inline adjacency (file<code>_name</code>.txt remains file_name.txt)', async () => {
    const html = '<article><p>Download file<code>_name</code>.txt now.</p></article>';
    const result = await executePipelineFromHtml(html);
    const text = result.plan.segments[0]?.text || '';
    expect(text).toContain('file_name.txt');
    expect(text).not.toContain('file _name');
    expect(text).not.toContain('_name .txt');
  });

  // Case 3: Block-level code inside list items retains line and indentation structure
  it('Case 3: preserves block-level code indentation inside list items in final narration', async () => {
    const html = `
      <article>
        <ul>
          <li>
            Step one instructions:
            <pre><code class="language-python">if ok:
  action()
cleanup()</code></pre>
            Proceed to step two.
          </li>
        </ul>
      </article>
    `;
    const result = await executePipelineFromHtml(html, { mode: 'literal' });
    const combined = result.plan.segments.map((s) => s.text).join('\n');
    expect(combined).toContain('Step one instructions');
    expect(combined).toContain('Proceed to step two');
    expect(combined).toContain('action()');
    expect(combined).toContain('cleanup()');
    expect(combined).toMatch(/Line \d+/);
    expect(combined).toMatch(/indent/i);
    expect(combined).not.toContain('if ok: action() cleanup()');
  });

  // Case 4: Single-column table narrating every row value
  it('Case 4: single-column tables narrate every row value in post-validation plan', async () => {
    const html = `
      <article>
        <table>
          <thead><tr><th>Feature</th></tr></thead>
          <tbody>
            <tr><td>Streaming audio</td></tr>
            <tr><td>Offline synthesis</td></tr>
            <tr><td>Local inference</td></tr>
          </tbody>
        </table>
      </article>
    `;
    const naturalResult = await executePipelineFromHtml(html, { mode: 'natural' });
    const naturalText = naturalResult.plan.segments.map((s) => s.text).join(' ');
    expect(naturalText).toContain('Streaming audio');
    expect(naturalText).toContain('Offline synthesis');
    expect(naturalText).toContain('Local inference');

    const literalResult = await executePipelineFromHtml(html, { mode: 'literal' });
    const literalText = literalResult.plan.segments.map((s) => s.text).join(' ');
    expect(literalText).toContain('Streaming audio');
    expect(literalText).toContain('Offline synthesis');
    expect(literalText).toContain('Local inference');
  });

  // Case 5: Tied extrema narrate every tied entity before marking cells covered
  it('Case 5: tied extrema narrate every tied entity in final post-validation plan', async () => {
    const html = `
      <article>
        <table>
          <thead><tr><th>Model</th><th>Accuracy</th></tr></thead>
          <tbody>
            <tr><td>Model A</td><td>95%</td></tr>
            <tr><td>Model B</td><td>95%</td></tr>
            <tr><td>Model C</td><td>80%</td></tr>
          </tbody>
        </table>
      </article>
    `;
    const result = await executePipelineFromHtml(html, { mode: 'natural' });
    const text = result.plan.segments.map((s) => s.text).join(' ');
    // Both Model A and Model B must be explicitly named in the narration
    expect(text).toContain('Model A');
    expect(text).toContain('Model B');
    expect(text).toContain('95%');
    expect(text).toContain('Model C');
    expect(text).toContain('80%');
    // Small tables preserve each tied value in its own row, without rankings.
    expect(text).toMatch(/Model A[^.]*95%/);
    expect(text).toMatch(/Model B[^.]*95%/);
    expect(text).not.toMatch(/highest|lowest/i);
  });

  // Case 6: Preserve unit case and do not conflate bits vs bytes
  it('Case 6: preserves unit case and does not conflate bits (kb) and bytes (kB)', async () => {
    const html = `
      <article>
        <table>
          <thead><tr><th>Link</th><th>Bandwidth</th></tr></thead>
          <tbody>
            <tr><td>Link A</td><td>100 kb</td></tr>
            <tr><td>Link B</td><td>100 kB</td></tr>
          </tbody>
        </table>
      </article>
    `;
    const result = await executePipelineFromHtml(html, { mode: 'natural' });
    const text = result.plan.segments.map((s) => s.text).join(' ');
    // 100 kb != 100 kB, so they must NOT be declared tied
    expect(text).not.toContain('are tied');
    // Both literal values must be preserved
    expect(text).toContain('100 kb');
    expect(text).toContain('100 kB');
  });

  // Case 7: Literal code formatting preserves actual indentation widths
  it('Case 7: literal code preserves actual indentation widths (2 spaces vs 4 spaces)', async () => {
    const html = `
      <article>
        <pre><code class="language-python">if condition:
  two_spaces()
    four_spaces()</code></pre>
      </article>
    `;
    const result = await executePipelineFromHtml(html, { mode: 'literal' });
    const text = result.plan.segments[0]?.text || '';
    expect(text).toContain('2 spaces');
    expect(text).toContain('4 spaces');
    expect(text).toContain('two_spaces()');
    expect(text).toContain('four_spaces()');
  });
});
