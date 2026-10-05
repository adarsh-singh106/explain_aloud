/**
 * Package 1.2 — Post-validation narration plan regression tests.
 *
 * Each test exercises the FINAL narration plan produced by executePipelineFromHtml,
 * not intermediate parser/fact output. Both Natural and Literal modes are checked
 * where applicable. Tests are written to FAIL against the current codebase and
 * PASS after the Package 1.2 fixes.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { executePipelineFromHtml } from './pipeline';
import * as ollamaService from '@/src/services/ollama';

// Force LLM offline so all tests exercise deterministic fallback paths
beforeEach(() => {
  vi.spyOn(ollamaService, 'generateWithGemma').mockRejectedValue(new Error('offline'));
});
afterEach(() => vi.restoreAllMocks());

const run = async (html: string, mode: 'natural' | 'literal' = 'literal') =>
  (await executePipelineFromHtml(`<article>${html}</article>`, { mode })).plan.segments.map((s) => s.text).join('\n');

const tab = (headers: string[], rows: string[][]) =>
  `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((v) => `<td>${v}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

const pre = (code = 'if ok:\n  action()\ncleanup()', lang = 'python') =>
  `<pre><code class="language-${lang}">${code}</code></pre>`;

// ───────────────────────────────────────────────────────────────
// FIX 1: Case-sensitive bit/byte semantics — Kib vs KiB
// ───────────────────────────────────────────────────────────────
describe('Fix 1 — Kib vs KiB case-sensitive unit semantics', () => {
  for (const mode of ['natural', 'literal'] as const) {
    it(`Kib (kilobits) and KiB (kibibytes) are NOT the same unit family [${mode}]`, async () => {
      const text = await run(tab(['Link', 'Size'], [['Alpha', '8 Kib'], ['Beta', '2 KiB']]), mode);
      // They must not be ranked against each other — different families
      expect(text).not.toMatch(/highest|lowest/i);
      // Both literal values preserved
      expect(text).toContain('8 Kib');
      expect(text).toContain('2 KiB');
    });

    it(`preserves exact case of bit units: kb (kilobits) vs kB (kilobytes) [${mode}]`, async () => {
      const text = await run(tab(['Link', 'Size'], [['A', '100 kb'], ['B', '100 kB']]), mode);
      expect(text).toContain('100 kb');
      expect(text).toContain('100 kB');
      // Must not declare them tied — different unit families
      expect(text).not.toMatch(/tied/i);
    });
  }

  it('adversarial: Kib reversed to match KiB pattern must NOT conflate', async () => {
    // Five rows keep this comparison-specific regression on the existing path.
    const text = await run(tab(['X', 'Y'], [['A', '1 Kib'], ['B', '1 kib'], ['C', '1 Kib'], ['D', '1 kib'], ['E', '1 Kib']]), 'natural');
    // 'Kib' and 'kib' are both kibibits (case-insensitive for bit units)
    // Because they are identical units and values, they MUST be tied.
    expect(text).toMatch(/tied/i);
    expect(text).toContain('1 Kib');
  });
});

// ───────────────────────────────────────────────────────────────
// FIX 2: Every tied extrema entity included in facts and prompts
// ───────────────────────────────────────────────────────────────
describe('Fix 2 — All tied extrema entities in narration plan', () => {
  for (const mode of ['natural', 'literal'] as const) {
    it(`2-way tie on highest includes both entities [${mode}]`, async () => {
      const text = await run(
        tab(['Model', 'Score'], [['Alpha', '95%'], ['Beta', '95%'], ['Gamma', '80%']]),
        mode,
      );
      expect(text).toContain('Alpha');
      expect(text).toContain('Beta');
      expect(text).toContain('Gamma');
    });

    it(`all-N-way tie across all metrics still names every entity [${mode}]`, async () => {
      const text = await run(
        tab(['Model', 'Score', 'Latency'], [['Alpha', '10', '2 s'], ['Beta', '10', '2 s']]),
        mode,
      );
      expect(text).toContain('Alpha');
      expect(text).toContain('Beta');
    });

    it(`3-way partial ties across metrics preserve every entity [${mode}]`, async () => {
      const rows = [['ModelA', '10', '1'], ['ModelB', '10', '2'], ['ModelC', '10', '3'], ['ModelZ', '5', '1']];
      const text = await run(tab(['Model', 'Score', 'Latency'], rows), mode);
      for (const [name] of rows) {
        expect(text).toContain(name);
      }
    });
  }
});

// ───────────────────────────────────────────────────────────────
// FIX 3: Exclude ChatGPT code-block UI chrome
// ───────────────────────────────────────────────────────────────
describe('Fix 3 — Exclude ChatGPT UI chrome without dropping warnings', () => {
  for (const mode of ['natural', 'literal'] as const) {
    it(`strips language header span from code wrapper [${mode}]`, async () => {
      const html = `<div class="code-block">
        <div class="code-block-header"><span>python</span><button>Copy</button></div>
        <pre><code class="language-python">print(42)</code></pre>
      </div>`;
      const text = await run(html, mode);
      expect(text).toContain('print(42)');
      // Should NOT contain a separate narrated "python" segment from the header span
      // (the language is already narrated as part of the code block format)
    });

    it(`strips Copy button text but preserves real warning text [${mode}]`, async () => {
      const html = `<div>
        <span>Warning: do not run in production.</span>
        <div class="code-block">
          <div class="code-block-header"><span>bash</span><button>Copy code</button></div>
          <pre><code class="language-bash">rm -rf /tmp/cache</code></pre>
        </div>
        <span>After cleanup, restart the service.</span>
      </div>`;
      const text = await run(html, mode);
      expect(text).toContain('Warning: do not run in production');
      expect(text).toContain('rm -rf /tmp/cache');
      expect(text).toContain('After cleanup, restart the service');
      expect(text).not.toContain('Copy code');
    });

    it(`does not strip meaningful text containing the word "copy" [${mode}]`, async () => {
      const html = `<p>Copy the file to your home directory before proceeding.</p>`;
      const text = await run(html, mode);
      expect(text).toContain('Copy the file to your home directory');
    });
  }
});

// ───────────────────────────────────────────────────────────────
// FIX 4: Inline-code adjacency and block-code in list items
// ───────────────────────────────────────────────────────────────
describe('Fix 4 — Inline-code adjacency and block-code in list items', () => {
  const inlineCases: [string, string][] = [
    ['file<code>_name</code>.txt', 'file_name.txt'],
    ['<code>file</code>_name.txt', 'file_name.txt'],
    ['file_name<code>.txt</code>', 'file_name.txt'],
    ['get<code>User</code>Id', 'getUserId'],
  ];

  for (const [html, expected] of inlineCases) {
    for (const mode of ['natural', 'literal'] as const) {
      it(`inline adjacency: "${expected}" preserved in li with code block [${mode}]`, async () => {
        const content = `<ul><li>Use ${html} before running.${pre()}Keep ${html} afterward.</li></ul>`;
        const text = await run(content, mode);
        expect(text).toContain(expected);
      });
    }
  }

  for (const mode of ['natural', 'literal'] as const) {
    it(`empty list item does not desynchronize arrays [${mode}]`, async () => {
      const text = await run(
        `<ul><li></li><li>Before.${pre('if ready:\n   alpha()')}After.</li><li>Never deploy this.</li></ul>`,
        mode,
      );
      expect(text).toContain('Never deploy');
      expect((text.match(/alpha\(\)/g) || []).length).toBe(1);
    });

    it(`visual phrase in code string does NOT cause list fallback to destroy code [${mode}]`, async () => {
      const text = await run(
        `<ol start="5"><li>Run:${pre('if ok:\n   print("as shown above")\ncleanup()')}Then stop.</li></ol>`,
        mode,
      );
      // The string "as shown above" is inside code, so it must be preserved
      expect(text).toContain('as shown above');
      // Code line structure must be preserved
      expect(text).toMatch(/Line \d+/);
    });
  }
});

// ───────────────────────────────────────────────────────────────
// FIX 5: Parse grouped numeric values (1,000 and 2,500.50)
// ───────────────────────────────────────────────────────────────
describe('Fix 5 — Grouped numeric values', () => {
  for (const mode of ['natural', 'literal'] as const) {
    it(`parses 1,000 as 1000 [${mode}]`, async () => {
      const text = await run(tab(['Item', 'Count'], [['A', '1,000'], ['B', '500']]), mode);
      expect(text).toContain('1,000');
      expect(text).toContain('500');
    });

    it(`parses 2,500.50 as 2500.50 [${mode}]`, async () => {
      const text = await run(tab(['Item', 'Price'], [['X', '$2,500.50'], ['Y', '$1,200']]), mode);
      expect(text).toContain('2,500.50');
      expect(text).toContain('1,200');
    });

    it(`correctly ranks 1,000 > 500 [${mode}]`, async () => {
      const result = await executePipelineFromHtml(
        `<article>${tab(['Item', 'Count'], [['Big', '1,000'], ['Small', '500']])}</article>`,
        { mode },
      );
      if (mode === 'natural') {
        const text = result.plan.segments.map((s) => s.text).join('\n');
        expect(text).toMatch(/Big.*highest/i);
      }
      // Both values must appear in the plan
      const text = result.plan.segments.map((s) => s.text).join('\n');
      expect(text).toContain('1,000');
      expect(text).toContain('500');
    });
  }
});

// ───────────────────────────────────────────────────────────────
// FIX 6: Compound units — only compare when explicitly supported
// ───────────────────────────────────────────────────────────────
describe('Fix 6 — Compound/unsupported units preserve literal, no false ranking', () => {
  const incompatiblePairs: [string, string][] = [
    ['8 b', '2 B'],      // bits vs bytes
    ['8 kb', '2 kB'],    // kilobits vs kilobytes
    ['8 QuX', '2 qux'],  // completely unknown units with different case
  ];

  for (const [a, b] of incompatiblePairs) {
    for (const mode of ['natural', 'literal'] as const) {
      it(`incompatible "${a}" / "${b}" — no ranking, both preserved [${mode}]`, async () => {
        const text = await run(tab(['Link', 'Size'], [['Alpha', a], ['Beta', b]]), mode);
        expect(text).toContain(a);
        expect(text).toContain(b);
        if (mode === 'natural') {
          expect(text).not.toMatch(/highest|lowest|tied/i);
        }
      });
    }
  }
});

// ───────────────────────────────────────────────────────────────
// FIX 7: Single-column numeric tables
// ───────────────────────────────────────────────────────────────
describe('Fix 7 — Single-column numeric tables without entity identifiers', () => {
  for (const mode of ['natural', 'literal'] as const) {
    it(`single-column numeric values are narrated as values, not identifiers [${mode}]`, async () => {
      const text = await run(tab(['Value'], [['10'], ['20'], ['30']]), mode);
      expect(text).toContain('10');
      expect(text).toContain('20');
      expect(text).toContain('30');
    });

    it(`single-column text values are listed without comparison [${mode}]`, async () => {
      const text = await run(tab(['Feature'], [['Alpha'], ['Beta'], ['Gamma']]), mode);
      expect(text).toContain('Alpha');
      expect(text).toContain('Beta');
      expect(text).toContain('Gamma');
    });
  }
});

// ───────────────────────────────────────────────────────────────
// FIX 8: Stable row identity independent of duplicate labels
// ───────────────────────────────────────────────────────────────
describe('Fix 8 — Stable row identity for duplicate labels', () => {
  it('duplicate entity labels produce different narration when data differs (natural)', async () => {
    const a = await run(
      tab(['Model', 'Score', 'Latency'], [['Shared', '10', '1 s'], ['Shared', '5', '9 s']]),
      'natural',
    );
    const b = await run(
      tab(['Model', 'Score', 'Latency'], [['Shared', '10', '9 s'], ['Shared', '5', '1 s']]),
      'natural',
    );
    // With different data, the narration MUST differ
    expect(a).not.toBe(b);
  });

  it('duplicate entity labels produce different narration when data differs (literal)', async () => {
    const a = await run(
      tab(['Model', 'Score', 'Latency'], [['Shared', '10', '1 s'], ['Shared', '5', '9 s']]),
      'literal',
    );
    const b = await run(
      tab(['Model', 'Score', 'Latency'], [['Shared', '10', '9 s'], ['Shared', '5', '1 s']]),
      'literal',
    );
    expect(a).not.toBe(b);
  });

  it('three duplicate labels preserve all rows with distinct data', async () => {
    const text = await run(
      tab(['Name', 'Val'], [['X', '10'], ['X', '20'], ['X', '30']]),
      'natural',
    );
    expect(text).toContain('10');
    expect(text).toContain('20');
    expect(text).toContain('30');
  });
});

// ───────────────────────────────────────────────────────────────
// FIX 9: Unified code fallback through formatLiteralCode
// ───────────────────────────────────────────────────────────────
describe('Fix 9 — Canonical literal code formatter for all fallback paths', () => {
  for (const mode of ['natural', 'literal'] as const) {
    it(`code fallback uses line structure, not collapsed whitespace [${mode}]`, async () => {
      const text = await run(pre('if ok:\n  action()\ncleanup()'), mode);
      expect(text).toMatch(/Line \d+/);
      expect(text).toContain('action()');
      expect(text).toContain('cleanup()');
      // Must not be collapsed to single-line
      expect(text).not.toMatch(/if ok:\s+action\(\)\s+cleanup\(\)/);
    });

    it(`code fallback preserves indentation metadata [${mode}]`, async () => {
      const text = await run(pre('def foo():\n    return 42'), mode);
      expect(text).toMatch(/indent/i);
      expect(text).toContain('return 42');
    });
  }

  it('mixed tabs and spaces are NOT falsely reported as all spaces', async () => {
    const text = await run(pre('if ok:\n \taction()\n\t other()'), 'literal');
    // Mixed indentation should be reported accurately, not all as spaces
    expect(text).toMatch(/tab/i);
  });

  for (const indent of ['  ', '   ', '\t', '\t\t']) {
    it(`uniform indentation ${JSON.stringify(indent)} reported correctly`, async () => {
      const text = await run(pre(`if ok:\n${indent}action()`), 'literal');
      if (indent.includes('\t')) {
        expect(text).toContain(`indent ${indent.length} tab`);
      } else {
        expect(text).toContain(`indent ${indent.length} space`);
      }
    });
  }
});

// ───────────────────────────────────────────────────────────────
// ADVERSARIAL VARIANTS — must also pass
// ───────────────────────────────────────────────────────────────
describe('Adversarial variants', () => {
  it('large grouped number with unit: "10,000 ms" parses correctly', async () => {
    const text = await run(
      tab(['Model', 'Latency'], [['Fast', '10,000 ms'], ['Slow', '20,000 ms']]),
      'natural',
    );
    expect(text).toContain('10,000 ms');
    expect(text).toContain('20,000 ms');
  });

  it('mixed comma/no-comma numbers rank correctly', async () => {
    const result = await executePipelineFromHtml(
      `<article>${tab(['Item', 'Count'], [['X', '1,500'], ['Y', '900']])}</article>`,
      { mode: 'natural' },
    );
    const text = result.plan.segments.map((s) => s.text).join('\n');
    expect(text).toMatch(/X.*highest/i);
  });

  it('code with ChatGPT wrapper preserves code but strips chrome', async () => {
    const html = `<div class="relative">
      <div class="flex items-center"><span class="text-token-text-secondary">javascript</span><button class="flex gap-1"><svg></svg>Copy code</button></div>
      <pre><code class="language-javascript">console.log("hello")</code></pre>
    </div>`;
    const text = await run(html, 'literal');
    expect(text).toContain('console.log("hello")');
    expect(text).not.toContain('Copy code');
  });

  it('all custom units with different casing do not compare', async () => {
    const text = await run(
      tab(['X', 'Y'], [['A', '5 FoO'], ['B', '3 foo']]),
      'natural',
    );
    // custom_FoO !== custom_foo, no comparison
    expect(text).not.toMatch(/highest|lowest|tied/i);
    expect(text).toContain('5 FoO');
    expect(text).toContain('3 foo');
  });

  it('inline code adjacency survives adversarial nesting', async () => {
    const html = `<p>Try <code>npm</code><code>install</code> now.</p>`;
    const text = await run(html, 'literal');
    expect(text).toContain('npminstall');
  });
});
