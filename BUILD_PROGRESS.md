# Explain Aloud — Comprehensive Build & Progress Report

**Generated:** 2026-10-04  
**Current Milestone Completed:** M6 (Audio & End-to-End Fixture Pipeline)  
**Current Git Branch:** `feat/audio-pipeline`  
**Overall Test Suite Status:** 50 tests passed across 9 test files (100% pass rate)  
**TypeScript Typecheck:** 0 errors (`tsc --noEmit`)  
**WXT Build:** Clean production bundle (~760ms build time)  

---

## 1. Executive Summary & Architecture

Explain Aloud is a Chrome MV3 extension designed to convert structured AI responses (paragraphs, headings, lists, code, and tables) into natural audio explanations that a listener can follow without looking at their screen.

### Hard Architectural Invariants (Enforced Throughout):
1. **Privacy**: Zero cloud telemetry, zero remote TTS, zero external narration APIs. Everything executes on-device.
2. **Truth First**: No invented numbers, no inverted comparisons, no hallucinated code behavior.
3. **Deterministic Pre-Extraction**: Tables extract atomic facts and statistics before LLM wording.
4. **Validation & Fallback**: Every candidate LLM segment is verified against source facts. If validation fails, it safely falls back to a deterministic rule-based sentence without interrupting audio playback.
5. **Traceability**: Every narration segment is bound to `sourceBlockIds` and `factIds`.

---

## 2. Environment & Prerequisites Setup (M0)

### System Verification
- **Operating System**: Windows
- **Git**: `2.55.0.windows.3`
- **Node.js**: `v24.18.0`
- **npm**: `11.16.0`
- **Ollama**: Detected, configured, and verified (`v0.35.1` at `C:\Users\adars\AppData\Local\Programs\Ollama\ollama.exe`)
- **Narration Model**: `gemma4:e4b` (6.6 GB) pulled and verified locally via Ollama API.

### Git Branching Discipline
To protect `main` as a clean, deployable baseline and isolate each milestone for rigorous review, work is conducted on milestone-specific feature branches:
- `main`: Baseline contract (`a77f326 docs: define Explain Aloud MVP`)
- `feat/setup-m0`: Extension scaffolding, dependencies, M0 UI verification
- `feat/response-ir`: Milestone M1 ResponseIR parser
- `feat/rule-narrator`: Milestone M2 deterministic rule narrator
- `feat/table-engine`: Milestone M3 table fact extraction
- `feat/llm-narrator`: Milestone M4 local Gemma 4 narration
- `feat/validator`: Milestone M5 validation and fallback engine

---

## 3. Milestones Implemented in Detail

### Milestone M0 — Scaffolding & Foundation (`feat/setup-m0`)
- **Scaffolded WXT Extension**:
  - Initialized WXT with React 19 and TypeScript inside [`extension/`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension).
  - Installed dependencies: `react`, `react-dom`, `@wxt-dev/module-react`, `wxt`, `kokoro-js`, `vitest`, `happy-dom`.
- **Git Protections**:
  - Configured root [`.gitignore`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/.gitignore) and [`extension/.gitignore`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/.gitignore) to exclude `.output`, `.wxt`, `node_modules`, and OS cache files.
- **Manifest & CSP Configuration** ([`extension/wxt.config.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/wxt.config.ts)):
  - Configured Manifest V3 `content_security_policy` with `script-src 'self' 'wasm-unsafe-eval'` to permit ONNX Runtime WebAssembly execution.
  - Granted explicit host permissions for `http://127.0.0.1:11434/*` (local Ollama).
- **Core Service Wrappers**:
  - [`extension/src/services/ollama.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/services/ollama.ts): Connectivity health check (`/api/tags`) and model generation client (`/api/generate`).
  - [`extension/src/services/tts.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/services/tts.ts): Singleton loader for `KokoroTTS` (`onnx-community/Kokoro-82M-v1.0-ONNX`, WASM device, `af_heart` voice).
- **Interactive Verification Popup** ([`extension/entrypoints/popup/App.tsx`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/entrypoints/popup/App.tsx)):
  - Built an M0 verification dashboard with real-time Ollama status pill, Kokoro synthesis button (*"Explain Aloud is ready."*), audio player preview, and Gemma 4 comparison prompt trigger.
- **Gemma Standalone Verification**:
  - Tested Section 5 test prompt against `gemma4:e4b`. Model produced valid JSON and natural spoken comparison without hallucinating facts.
- **Commits**:
  - `1e0b71b`: `feat(setup): scaffold WXT React extension with kokoro-js and vitest`
  - `53481fa`: `feat(setup): add M0 verification services and UI for Kokoro TTS and Ollama`

---

### Milestone M1 — ResponseIR Fixture Parser (`feat/response-ir`)
- **Type Definitions** ([`extension/src/types/ir.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/types/ir.ts)):
  - Modeled `ResponseIR`, `Block`, `Fact`, and block structured representations:
    - `HeadingStructured`: `{ level: number, text: string }`
    - `ParagraphStructured`: `{ text: string }`
    - `ListStructured`: `{ ordered: boolean, items: string[] }`
    - `CodeStructured`: `{ language: string, code: string }`
    - `TableStructured`: `{ headers: string[], rows: string[][] }`
- **DOM & HTML Parser** ([`extension/src/parser/htmlParser.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/parser/htmlParser.ts)):
  - Converts HTML strings or DOM elements into typed `Block`s.
  - Detects assistant message container via `data-fixture="assistant-response"` or `data-message-author-role="assistant"`.
  - Supports heading level extraction, paragraph text, ordered/unordered list items, language tag detection on code blocks, and table header/row parsing.
  - Fallback preservation: Unknown or generic containers are preserved as `type: 'unknown'` so that **no content silently disappears**.
- **Unit & Fixture Tests** ([`extension/src/parser/htmlParser.test.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/parser/htmlParser.test.ts)):
  - 7 tests covering all 5 block types, fallback handling, and an end-to-end integration test against [`fixtures/mixed-response.html`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/fixtures/mixed-response.html) verifying all 6 blocks (`h2`, `p`, `ul`, `pre/code`, `table`, `p`).
- **Commit**:
  - `3e54ab3`: `feat: parse structured response into ResponseIR`

---

### Milestone M2 — Rule Narrator (`feat/rule-narrator`)
- **Narration Data Structures** ([`extension/src/types/narration.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/types/narration.ts)):
  - Defined `NarrationSegment` (`id`, `sourceBlockIds`, `factIds`, `provenance`, `text`, `verified`, `fallbackReason`, `pauseAfterMs`) and `NarrationPlan`.
- **Deterministic Rule Engine** ([`extension/src/narrator/ruleNarrator.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/narrator/ruleNarrator.ts)):
  - **Screen-Only Phrasing Scrub (`cleanSpokenText`)**: Strips visual artifacts like *"as shown above/below"*, *"as seen below"*, *"please see the table below"*, cleans surrounding commas, capitalizes sentence openings, and guarantees terminal punctuation.
  - **Headings (`narrateHeading`)**: Opening heading narrated cleanly (`"Choosing a model."`); subsequent headings converted to natural transitions (`"Next, why this matters."`) with 450ms pacing pauses.
  - **Paragraphs (`narrateParagraph`)**: Direct spoken flow with visual references stripped and 350ms sentence pauses.
  - **Lists (`narrateList`)**: Natural spoken cadence without ever saying the word *"bullet"*. Unordered items use natural phrasing ending with *"Finally, ..."*; ordered items use sequential markers (*"First, ..."*, *"Second, ..."*).
  - **Dispatcher (`narrateBlockWithRules`)**: Routes simple blocks to rules; returns `null` for blocks requiring complex/table/LLM processing (`code`, `table`).
- **Unit Tests** ([`extension/src/narrator/ruleNarrator.test.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/narrator/ruleNarrator.test.ts)):
  - 10 tests verifying visual phrase scrubbing, heading transitions, ordered/unordered lists, and dispatcher routing.
- **Commit**:
  - `b2b0a95`: `feat: rule-based narration for paragraph, heading, and list blocks`

---

### Milestone M3 — Table Engine & Deterministic Fact Extraction (`feat/table-engine`)
- **Table Engine** ([`extension/src/table/tableEngine.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/table/tableEngine.ts)):
  - **Numeric Cell Parser (`parseNumericCell`)**: Accurately parses values with units (`92%`, `4 sec`, `10.5 ms`, `$12.50`).
  - **Fact Extractor (`extractTableFacts`)**:
    - Entity identifiers: Maps Model `A`, `B`, `C` to `kind: 'identifier'`.
    - Cell numerical values: Creates atomic `kind: 'number'` facts bound to `sourceBlockIds`.
    - Safe min/max comparisons: Computes highest/lowest stats per column without inversion (e.g., Accuracy: highest Model A at 92%, lowest Model B at 88%; Latency: highest Model A at 4 sec, lowest Model B at 1 sec).
  - **Deterministic Spoken Summary (`generateDeterministicTableSummary`)**: Produces a 100% verified spoken fallback summary that describes row counts, metrics, and genuine extremes.
- **Unit Tests** ([`extension/src/table/tableEngine.test.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/table/tableEngine.test.ts)):
  - 8 tests verifying numeric cell parsing, entity identifier mapping, non-reversed min/max calculations, and deterministic fallback generation.
- **Commit**:
  - `bef7ef8`: `feat: deterministic table fact extraction and fallback engine`

---

### Milestone M4 — LLM Narrator (`feat/llm-narrator`)
- **LLM Narrator Engine** ([`extension/src/narrator/llmNarrator.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/narrator/llmNarrator.ts)):
  - **JSON Extractor (`extractJsonFromLlm`)**: Robust parsing of JSON responses, handling code fence wrappers and conversational model commentary.
  - **Code Block Narration (`narrateCodeBlock`)**:
    - *Natural mode*: Prompt instructs model to explain purpose, control flow, key operations, and conditions without reciting punctuation or syntax noise line-by-line.
    - *Literal mode*: Accurately describes code structure and identifiers plainly.
    - Fallback: Gracefully falls back to structured literal rendering if Gemma is unavailable.
  - **Table Block Narration (`narrateTableBlock`)**:
    - Passes pre-extracted facts from M3 into the prompt.
    - Restricts model to wording only, requiring each segment to declare referenced `factIds`.
    - Fallback: Reverts immediately to `generateDeterministicTableSummary` on error or timeout.
- **Unit & Mock Tests** ([`extension/src/narrator/llmNarrator.test.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/narrator/llmNarrator.test.ts)):
  - 10 tests covering prompt construction, JSON extraction edge cases, mocked LLM calls, and simulated timeout fallbacks.
- **Commit**:
  - `f57a4e3`: `feat: LLM narrator for code and table blocks with structured JSON and fallback`

---

### Milestone M5 — Validator & Fallback Engine (`feat/validator`)
- **Segment Validator** ([`extension/src/validator/segmentValidator.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/validator/segmentValidator.ts)):
  - **Critical Number Preservation**: Extracts all numbers from spoken text and confirms every number exists in verified source/derived facts. Rejects invented numbers (`unsupported_number:<n>`).
  - **Reversed Comparison Detection**: Checks metric comparisons against deterministic facts. Flags and rejects inverted superlatives (`reversed_comparison:<metric>`).
  - **Visual Phrasing Scrub**: Catches screen-only phrases (*"as shown above/below"*, *"see the table below"*) that might slip into LLM wording.
  - **Source Traceability**: Verifies every segment is anchored to at least one `sourceBlockId`.
  - **Deterministic Fallback Dispatch**: If any validation rule fails, the segment is replaced with a 100% verified deterministic fallback (e.g. `generateDeterministicTableSummary`), setting `provenance: 'rule'` and preserving the `fallbackReason` for debugging without breaking audio playback.
  - **Plan Validator (`validateNarrationPlan`)**: Validates entire `NarrationPlan` workflows, tracking passing vs. fallback segment metrics.
- **Unit Tests** ([`extension/src/validator/segmentValidator.test.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/validator/segmentValidator.test.ts)):
  - 6 unit tests asserting:
    - Truthful table segments pass with `verified: true`.
    - Hallucinated numbers (e.g. 99%, 15 sec) are rejected into fallback.
    - Inverted comparisons (claiming Model B has highest accuracy) are caught and routed to fallback.
    - Screen-only references (*"as shown below"*) are blocked.
    - Full plans replace faulty segments cleanly while preserving valid segments.
- **Commit**:
  - `9779654`: `feat: validator and deterministic fallback engine for narration segments`

---

### Milestone M6 — Audio Pipeline & End-to-End Fixture (`feat/audio-pipeline`)
- **Audio Queue Controller** ([`extension/src/audio/audioQueue.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/audio/audioQueue.ts)):
  - State machine: `idle` | `playing` | `paused` | `stopped` | `error`.
  - Immediate controls: `play()`, `pause()`, `skip()`, `cancel()`.
  - Pre-fetches subsequent segment audio synthesis in the background to ensure low latency between segments (target ≤ 1s).
  - Pacing: Respects `segment.pauseAfterMs` between segments.
  - Event hooks: `onSegmentStart`, `onSegmentEnd`, `onStateChange`, `onError`.
  - Standard browser playback adapter (`BrowserAudioPlayer`) using HTMLAudioElement and ObjectURLs.
- **End-to-End Pipeline Orchestrator** ([`extension/src/pipeline/pipeline.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/pipeline/pipeline.ts)):
  - Integrates the full system:
    `fixture / DOM Element` → `ResponseIR` → `rule/LLM narration` → `validator` → `NarrationPlan` → `AudioQueue`.
  - `executePipelineFromHtml` and `executePipelineFromElement`.
- **Unit & Integration Tests**:
  - [`extension/src/audio/audioQueue.test.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/audio/audioQueue.test.ts): 5 tests verifying queue state lifecycle, pause/resume, skip, and cancellation.
  - [`extension/src/pipeline/pipeline.test.ts`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/extension/src/pipeline/pipeline.test.ts): 2 integration tests verifying end-to-end execution on [`fixtures/mixed-response.html`](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/fixtures/mixed-response.html) in Natural mode, source coverage invariants, and simulated hallucination fallback handling.

---

## 4. Complete Test Results

All test suites execute via Vitest with Happy-DOM in ~1.2 seconds:

```text
 ✓ src/narrator/ruleNarrator.test.ts (10 tests) 15ms
 ✓ src/smoke.test.ts (1 test) 4ms
 ✓ src/table/tableEngine.test.ts (8 tests) 10ms
 ✓ src/validator/segmentValidator.test.ts (6 tests) 15ms
 ✓ src/parser/htmlParser.test.ts (7 tests) 37ms
 ✓ src/narrator/llmNarrator.test.ts (10 tests) 19ms
 ✓ src/pipeline/pipeline.test.ts (2 tests) 44ms
 ✓ src/kokoro.test.ts (1 test) 3ms
 ✓ src/audio/audioQueue.test.ts (5 tests) 80ms

 Test Files  9 passed (9)
      Tests  50 passed (50)
   Duration  1.20s
```

---

## 5. Git Commit History

```text
* (current) feat/audio-pipeline
* 144688e docs: document full build progress across milestones M0 through M5
* 9779654 feat: validator and deterministic fallback engine for narration segments (feat/validator)
* f57a4e3 feat: LLM narrator for code and table blocks with structured JSON and fallback (feat/llm-narrator)
* bef7ef8 feat: deterministic table fact extraction and fallback engine (feat/table-engine)
* b2b0a95 feat: rule-based narration for paragraph, heading, and list blocks (feat/rule-narrator)
* 3e54ab3 feat: parse structured response into ResponseIR (feat/response-ir)
* 53481fa feat(setup): add M0 verification services and UI for Kokoro TTS and Ollama (feat/setup-m0)
* 1e0b71b feat(setup): scaffold WXT React extension with kokoro-js and vitest
* a77f326 docs: define Explain Aloud MVP (main)
```

---

## 6. Remaining Milestones to MVP

According to [docs/BUILD_PLAN.md](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/docs/BUILD_PLAN.md):
- **M7 — ChatGPT Adapter**: Content script DOM observer that extracts completed assistant responses directly from ChatGPT web interface.
- **M8 — UI / Side Panel**: Floating "Explain Aloud" action button, side panel drawer, Natural vs. Literal mode toggle, and debug view showing block extraction and validation status.
- **M9 — Demo & Submission**: Curated demo recording comparing native screen-reader Read Aloud against Explain Aloud, documentation, and final acceptance checks.
