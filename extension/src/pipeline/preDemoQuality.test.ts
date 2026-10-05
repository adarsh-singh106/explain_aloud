import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/src/parser/fixtures/chatgptPython.html?raw';
import { parseResponseHtml } from '@/src/parser/htmlParser';
import { narrateHeading } from '@/src/narrator/ruleNarrator';
import { buildNarrationPlanFromIR, executePipelineFromHtml } from './pipeline';
import { generateSmallTableSummary } from '@/src/table/tableEngine';
import * as ollama from '@/src/services/ollama';
import type { Block } from '@/src/types/ir';

afterEach(() => vi.restoreAllMocks());

describe('Pre-demo quality patch', () => {
  it.each([
    ['class and header', fixture],
    ['header only', fixture.replace('language-python', '')],
    ['Python header with generic syntax class', fixture.replace('language-python', 'language-plaintext')],
    ['pre class', fixture.replace('language-python', '').replace('overflow-visible', 'language-python')],
    ['data attribute', fixture.replace('language-python', '').replace('<code ', '<code data-language="python" ')],
    ['separate header', '<div class="markdown"><div><div>Python<button>Copy code</button></div><pre><code>name = "Adarsh"\nprint("Hello", name)</code></pre></div></div>'],
    ['standalone label', '<div class="markdown"><div><div>Python</div><pre><code>name = "Adarsh"\nprint("Hello", name)</code></pre></div></div>'],
  ])('preserves explicit Python from %s without UI chrome', async (_, html) => {
    const ir = parseResponseHtml(html);
    const code = ir.blocks.find(block => block.type === 'code')!;
    expect(code.language).toBe('python');
    expect(code.structured).toEqual({ language: 'python', code: 'name = "Adarsh"\nprint("Hello", name)' });
    const generate = vi.spyOn(ollama, 'generateWithGemma').mockResolvedValue('{"segments":[{"text":"The code prints a greeting."}]}');
    const result = await buildNarrationPlanFromIR(ir);
    expect(generate.mock.calls[0]?.[0]).toContain('Code (python)');
    expect(result.plan.segments.map(segment => segment.text).join(' ')).not.toMatch(/Copy code|plaintext/);
    expect(ir.blocks.filter(block => block.type !== 'code').some(block => (block.structured as any)?.text === 'Python')).toBe(false);
  });

  it('does not infer Python from source contents or unrelated prose', () => {
    const ir = parseResponseHtml('<div class="markdown"><p>Python</p><pre><code>print("Hello")</code></pre></div>');
    expect(ir.blocks.find(block => block.type === 'code')?.language).toBe('plaintext');
    expect(ir.blocks[0]?.structured).toEqual({ text: 'Python' });
  });

  it('narrates every small-table cell by row without Gemma or comparisons', async () => {
    const generate = vi.spyOn(ollama, 'generateWithGemma');
    const result = await executePipelineFromHtml('<table><tr><th>Name</th><th>Age</th><th>Role</th></tr><tr><td>Alex</td><td>20</td><td>Student</td></tr><tr><td>Sam</td><td>21</td><td>Developer</td></tr><tr><td>John</td><td>22</td><td>Engineer</td></tr></table>');
    expect(result.plan.segments[0]?.text).toBe('The table has three entries. Name: Alex, Age: 20, and Role: Student. Name: Sam, Age: 21, and Role: Developer. Name: John, Age: 22, and Role: Engineer.');
    expect(result.validationStats.fallbackCount).toBe(0);
    expect(result.plan.segments[0]?.factIds.length).toBeGreaterThan(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ['Small List', 'Next, small list.'],
    ['API Overview', 'Next, API overview.'],
    ['Gemma 4 E4B', 'Next, Gemma 4 E4B.'],
    ['getUser API', 'Next, getUser API.'],
    ['SQL and JSON', 'Next, SQL and JSON.'],
  ])('polishes heading %s conservatively', (text, expected) => {
    expect(narrateHeading({ id: 'h', order: 1, type: 'heading', raw: `<h2>${text}</h2>`, structured: { level: 2, text } }).text).toBe(expected);
  });

  it('keeps explicitly marked identifiers unchanged', () => {
    const block: Block = { id: 'h', order: 1, type: 'heading', raw: '<h2><code>List</code> API</h2>', structured: { level: 2, text: 'List API' } };
    expect(narrateHeading(block).text).toBe('Next, List API.');
  });

  it('leaves large and irregular tables on the existing path', () => {
    const block: Block = { id: 't', order: 0, type: 'table', raw: '<table></table>', structured: { headers: ['Name', 'Value'], rows: [['A', '1'], ['B', '2'], ['C', '3'], ['D', '4'], ['E', '5']] } };
    expect(generateSmallTableSummary(block)).toBeUndefined();
    block.structured = { headers: ['Name', 'Value'], rows: [['A', '1', 'extra'], ['B', '2']] };
    expect(generateSmallTableSummary(block)).toBeUndefined();
  });
});
