# Explain Aloud: If the Screen Disappears, Does the Answer Still Make Sense?

My girlfriend already has a listening workflow. She uses Read Aloud in both ChatGPT and Claude while doing other things — cooking, commuting, winding down after a long day. It works fine for ordinary prose. Then ChatGPT answers a question with a table, or a code block, or a bulleted list with sub-items, and the whole thing falls apart. A three-column table about people, ages, and roles starts sounding like a leaderboard. A Python snippet becomes a stream of colons and underscores. A heading that says "Next Steps" arrives as "Next, small List."

She would skip those answers, or glance at her phone to reconstruct the layout, which defeats the point entirely.

That problem is the reason for Explain Aloud. Not the voice output — she already had that. The missing piece was the structure-aware step that happens before speech.

## What I Built

Explain Aloud is a Chrome MV3 extension that attaches to completed ChatGPT responses, extracts their structure into typed semantic blocks, builds a narration plan segment by segment, and sends each segment to Kokoro for in-browser speech synthesis.

It handles five block types: paragraphs, headings, lists, code blocks, and tables. Two modes are available: Literal Mode takes the deterministic path for everything; Natural Mode can route code and table blocks through a local Gemma model running in Ollama for listening-oriented phrasing. The side panel shows playback controls, the narration segments in sequence, and each segment's provenance — whether it came from a rule, from the model, or from a fallback.

The core question guiding every design decision was: *if the screen disappears, does the answer still make sense?*

## Demo

https://youtu.be/sPxWW-xJ0Eg

> Demo voiceover generated with ElevenLabs. The Explain Aloud narration heard inside the product is Kokoro.

![A real ChatGPT response shows a three-model table and an Explain Aloud action beneath the completed answer.](submission-assets/01-chatgpt-table-button.png)

*The extension attaches to a completed response. These model figures are example response content, not measurements of Explain Aloud.*

![The real Explain Aloud side panel showing Natural Mode selected, a Gemma 4 E4B Ready badge, playback controls, and rule-generated narration segments linked to source blocks.](submission-assets/02-natural-mode-panel.png)

*Panel captured in stopped state with a rule-generated segment selected. The "Verified" label is the application's own validation result, not an independent semantic proof. The response identifier has been redacted.*

## Code

https://github.com/adarsh-singh106/explain_aloud

## How I Built It

### From DOM to typed blocks

The first step is extraction. When the extension detects a completed ChatGPT response, the content script runs the semantic DOM extractor over it and builds a `ResponseIR` — a structured representation of the response as a typed block sequence. Paragraphs, headings, list items, code blocks, and tables each carry their own fields. A code block knows its language. A table block knows its headers and cell values. A list item knows its nesting depth.

The extraction is deterministic. No model is involved yet, and no interpretation is made. A Python code block that ChatGPT explicitly labels as Python is extracted with `language: "python"`. An unmarked `print(...)` is not guessed — it arrives as generic code. Seven regression fixture variants cover this explicitly, including the case where a Python header appears alongside a generic plaintext class. That conservatism matters when the language label will eventually reach a prompt.

### What Gemma's job actually is

In Natural Mode, code and table blocks are handed to a local Gemma call through Ollama. The boundary I wanted was specific: Gemma receives the pre-extracted facts, not the raw HTML. For a table, the deterministic parser has already produced the headers, row entities, numeric values, and unit-normalized metrics before the model sees anything. Gemma's task is to choose phrasing, not to read the table.

The model's output is a candidate narration. Every candidate must then pass through the segment validator before reaching the narration plan. Validation checks entity–metric bindings, code grounding, and causality. If a candidate fails, the system discards it and substitutes a source-derived deterministic fallback. The fallback is always a rule-based transformation of what was already extracted — never an invented summary.

The configured default is `gemma4:e4b`, with `gemma4:e2b` as the model-not-found fallback. Which model actually ran in a given browser session was not separately recorded.

### The test suite was green. The contract wasn't.

This is where the real engineering tension lives.

The test suite grew substantially during a source-fidelity hardening pass. Parsers were correctly extracting table data. The UI was rendering the right buttons. The pipeline was moving blocks from extraction through to the plan. Green across the board. But none of that guaranteed the listening contract.

The contract is more specific: a table with three people and their ages and roles should arrive as three separate row descriptions, not as a comparative ranking of who is oldest. A code block explained by Gemma should not reverse a comparison or invent behavior. A heading like "Next Steps" should smooth into speech without the word "Steps" collapsing into a list signal.

Passing the fixtures did not prove those things automatically. It took deliberate adversarial review — asking what happens when Gemma returns something plausible-but-wrong — to see where the boundary was missing. That review produced the segment validator and its strict fallback contract:

```ts
export interface NarrationSegment {
  id: string;
  sourceBlockIds: string[];
  factIds: string[];
  provenance: Provenance;
  text: string;
  verified: boolean;
  fallbackReason?: string;
  pauseAfterMs: number;
}
```

`Provenance` is `rule`, `llm`, or `literal`. Every segment declares where it came from. The inspector in the side panel shows this per segment. If you want to know whether the model touched a narration or a rule produced it, you can see that without digging into logs.

Conservative validation and fallback paths reduce unsupported narration. They do not eliminate it entirely — the current validator is a heuristic safety net, not a formal semantic proof — but they establish a checked path from extraction to voice.

### A small table should not become a leaderboard

One concrete example: a table with three rows — Name, Age, Role — for Alex, Sam, and John. The earlier deterministic summary path would lead with comparison framing, emphasizing who was oldest. That preserved the numbers correctly, but it invented a ranking the original response did not contain.

The final patch adds a row-wise path for complete rectangular tables with two to four rows and two to four columns. It ignores relationships between rows and speaks each one directly:

> The table has three entries. Name: Alex, Age: 20, and Role: Student. Name: Sam, Age: 21, and Role: Developer. Name: John, Age: 22, and Role: Engineer.

That exact output is what the regression test asserts, character for character. Gemma is not called on this path. Validation does not fall back. The facts are preserved in the order they appear.

Larger or irregular tables stay on the existing path. Merged-cell tables stay on the existing path. The row-wise route applies only where the structure is simple enough to be safe.

![Automated fixture before and after: Name, Age, Role rows become three spoken row descriptions, preserving each cell.](submission-assets/04-table-before-after.png)

*This is a test-evidence graphic, not a browser screenshot. The narration is copied directly from the passing regression assertion.*

### The production WASM failure

Before those listening improvements, there was a more basic failure that showed up only in the production Chrome extension — not in tests, not in the TypeScript check, not in the build.

```text
no available backend found
[wasm] TypeError: Failed to fetch dynamically imported module
```

Kokoro's underlying ONNX Runtime was trying to import its JavaScript module from a CDN at runtime. The extension build had succeeded. The bundle was present. But Chrome's extension sandbox blocked the external module fetch, and the speech backend could not initialize.

The fix was to bundle the matching ONNX Runtime `.mjs` and `.wasm` files as local extension assets, then configure their URLs explicitly before the model loads:

```ts
env.wasmPaths = {
  mjs: new URL(ortModuleUrl, globalThis.location.href).href,
  wasm: new URL(ortWasmUrl, globalThis.location.href).href,
};
```

The packaged files were verified against the installed runtime files by SHA-256. After reloading the extension, actual Kokoro speech was confirmed in Chrome. That confirmation was a browser result, separate from the green build that had preceded it.

This is the distinction the project kept surfacing: a passing test or a successful build is evidence that a specific thing worked correctly, not that the user's experience works. The Kokoro WASM failure would not have appeared in any automated check.

### CI, testing, and what the evidence covers

The CI pipeline runs on push to `main` and on pull requests. It installs dependencies, runs tests, typechecks, and builds the extension — in that order, under `permissions: contents: read` after a final hardening step.

The verified counts: 191 tests passed across 14 test files. TypeScript compilation passed. The Chrome MV3 production build passed at 24.11 MB. A chunk-size warning remains but is non-blocking.

What those numbers establish and do not establish is worth being direct about:

| Check | Recorded result | Boundary |
|---|---|---|
| Test suite | 191/191, 14/14 files | Fixture and regression coverage. Not a universal faithfulness guarantee. |
| TypeScript | `tsc --noEmit` passed | Static type checking. |
| Production build | Chrome MV3, 24.11 MB | Packaging. A large-chunk warning remains. |
| Real Chrome | Production extension manually tested; Kokoro speech confirmed | Developer-reported browser result. |

The narration pipeline uses local Ollama/Gemma and in-browser Kokoro WASM. Complete offline operation was not separately verified. The original ChatGPT conversation also remains a ChatGPT conversation — this extension does not change that service's privacy boundary.

## Why Does Open Innovation Matter?

Explain Aloud exists because local models and open browser APIs make the stack possible without a backend. No transcripts are sent to a cloud service. The narration pipeline runs on the user's machine. Kokoro runs inside the browser as WASM.

That matters for a use case like this, where the content being narrated is personal conversations. The extension attaches to ChatGPT, which already has its own privacy boundary. Inside the extension's own pipeline, the path stays local. Open models and open runtimes make that design available without infrastructure.

## My Agent Session

The finalization phase of Explain Aloud — the source-fidelity hardening, the production WASM fix, CI setup, and submission preparation — was developed with Antigravity (AI-assisted coding) and checkpointed using Entire.

Entire runs alongside git to capture AI-assisted development sessions as shadow branch checkpoints, without polluting the main branch history. The finalization-phase checkpoint is:

- **Checkpoint ID:** `2d9f0c278df4`
- **Linked commit:** `3aa189b`

These checkpoints cover the finalization work: the segment validator hardening, the row-wise table narration path, the WASM fix, CI configuration, and the Codex review of the CI workflow.

The Codex review found no shipping blockers. Its only recommendation was adding `permissions: contents: read` to the CI workflow for least-privilege hardening. That was applied before submission.

Entire was introduced during the finalization phase. It does not capture earlier development history prior to that setup.

## Prize Categories

### Best Use of Gemma

Gemma's role in Explain Aloud is bounded by design. It does not read raw HTML or receive an open-ended instruction to "explain this." The deterministic pipeline extracts facts first — table headers and cell values, code structure and language — and then provides those pre-extracted facts to the model with a specific wording task.

The candidate Gemma produces must pass the segment validator before it reaches the narration plan. If it fails, the system falls back to a source-derived deterministic summary and records the fallback reason in the segment's `fallbackReason` field. The model's output is a phrasing candidate, not the source of truth.

This bounded role — where open local inference contributes without being trusted unconditionally — is the core design argument for using Gemma rather than a simpler rule expansion.

### Best Use of Entire

Entire provided session provenance during the finalization phase. The checkpoint `2d9f0c278df4`, linked to commit `3aa189b`, captures the AI-assisted development that produced the production-ready build: WASM fix, table narration improvements, validator hardening, CI configuration, and the Codex review.

When Codex independently reviewed the CI workflow and returned `BLOCKERS: None` and `SAFE TO SHIP: YES`, that review is part of the checkpointed session record — not a separate process. The `permissions: contents: read` hardening that followed is reflected in the current CI file.

### Best Use of GitHub Copilot

The GitHub Actions CI workflow was configured and hardened as part of this project. The workflow runs tests, typecheck, and the production build on every push to `main` and pull request, under least-privilege `contents: read` permissions. To the extent that GitHub Actions and Copilot automation share that track, the CI configuration represents that contribution.

### Best Use of ElevenLabs

ElevenLabs generated the voiceover for the demo video. It was not used in any part of the running extension. The Explain Aloud application's speech synthesis is Kokoro.js running as WASM inside the Chrome extension, with locally bundled ONNX Runtime assets. ElevenLabs touches only the recorded demonstration.

---

The problem that started this was small and specific. My girlfriend wanted to listen to ChatGPT answers while doing something else. The built-in Read Aloud features mostly worked — until the answer had structure. Then it stopped making sense.

Explain Aloud's answer to that is to treat structure seriously before it reaches the voice. A table is not a paragraph read aloud. A code block is not a prose sentence with odd punctuation. A heading is a transition, not an item.

The test suite reaching 191 passing tests was a milestone. Hearing actual Kokoro speech in the running Chrome extension — after fixing the WASM module failure that a green build had concealed — was a different kind of milestone. And deciding to speak a three-person table one row at a time, rather than as a ranking exercise, was the kind of decision that only matters if you are actually trying to answer the question:

*If the screen disappears, does the answer still make sense?*

That question does not have a final answer yet. But it has a more honest one than before.
