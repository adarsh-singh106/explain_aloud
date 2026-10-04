# Explain Aloud — Comprehensive Build & Audit Hardening Report

**Generated:** 2026-10-04  
**Current Status:** All Milestones (M0–M9) Implemented & Audit Hardened (Findings A01–A15 Fully Remediated)  
**Overall Test Suite Status:** 90 tests passed across 11 test files (100% pass rate)  
**TypeScript Typecheck:** 0 errors (`tsc --noEmit`)  
**WXT Build:** Clean production bundle with Chrome MV3 Side Panel & Content Script support  

---

## 1. Executive Summary & Hard Architecture Invariants

Explain Aloud is a Chrome MV3 extension designed to convert structured AI responses (paragraphs, headings, lists, code, and tables) into natural audio explanations that a listener can follow without looking at their screen.

### Core Architectural Invariants:
1. **Privacy**: Zero cloud telemetry, zero remote TTS, zero external narration APIs. Everything executes on-device via loopback Ollama and local Kokoro WASM.
2. **Truth First**: No invented numbers, no inverted comparisons, no hallucinated code behavior, no unsupported causality.
3. **Deterministic Pre-Extraction**: Tables extract atomic facts, normalized units, and extrema before LLM wording.
4. **Validation & Safe Fallbacks**: Every candidate LLM segment is verified against source facts. If validation fails, it safely falls back to a deterministic source-derived sentence without interrupting audio playback or regurgitating candidate hallucinations.
5. **Deterministic Literal Mode**: Functions 100% offline without Ollama; preserves exact syntax, identifiers, and table cells.
6. **Interruptible Playback**: Monotonically tokenized audio queue prevents races during pause, skip, and cancellation.
7. **Traceability**: Every narration segment is bound to `sourceBlockIds` and `factIds`.

---

## 2. Audit Findings (A01–A15) Remediation Inventory

Following the comprehensive product and implementation audit, the repository was systematically hardened across 5 distinct phases:

### Phase 1: Truth & Fallback Integrity (A01, A02, A03, A08, A14)
- **A01 (P0 - Code Fallback)**:
  - Removed the fixture-specific email iteration sentence in `llmNarrator.ts`.
  - Replaced with source-derived honest fallback acknowledging when verified explanation is unavailable while providing the literal code.
  - Regression verified with `print(42)` probe.
- **A02 (P0 - Factual Faithfulness & Validation)**:
  - Enforced source-block ID resolution and scoped facts strictly to `segment.sourceBlockIds`.
  - Validated entity-metric-number triples together rather than checking loose digits.
  - Added detection and rejection of:
    - Falsified entity-metric bindings (`"Model B has 92% accuracy"`)
    - Invented entities (`"Model Z has 92% accuracy"`)
    - Spelled-out numbers (`"ninety-nine percent"`)
    - Paraphrased reversed comparisons (`"Model B outperforms Model A on accuracy"`)
    - Unsupported causality (`"Model A has 92% accuracy because it uses a larger training set"`)
    - Ungrounded code actions (`"calls delete_database and uploads records"`).
- **A03 (P0 - Fallback Passthrough)**:
  - Fixed `segmentValidator.ts` where candidate text was returned on code/list validation failures.
  - Implemented safe source-derived fallbacks for every block type (`code`, `table`, `paragraph`, `heading`, `list`, and missing source).
  - Explicitly mark `verified: false` on fallback segments with recorded `fallbackReason`.
- **A08 (P0 - Table Unit Comparisons)**:
  - Implemented unit normalization across duration (`ms`, `sec`, `min`, `hr`), size (`bytes`, `KB`, `MB`, `GB`), percentages, and currencies in `tableEngine.ts`.
  - Prohibited comparisons across incompatible unit families (e.g. `$10` vs `€10`).
  - Correctly ranks normalized quantities (e.g. `2 sec` is highest duration, `900 ms` is lowest duration).
  - Explicitly represents ties across entities.
- **A14 (P1 - Regex Escaping & Schema Guards)**:
  - Added `escapeRegex` to prevent dynamic regex crashes when entity names contain characters like `(`, `[`, `+`.
  - Added `validateLlmSegments` runtime schema validation to safely contain malformed LLM outputs.

### Phase 2: Interruptible Playback & Ollama Deadlines (A06, A07, A13)
- **A06 (P1 - Audio Queue Races)**:
  - Added monotonically increasing `playbackSessionId` and `activeSegmentToken` to `audioQueue.ts`.
  - Validated tokens after every `await` to eliminate stale audio playback from cancelled plans.
  - Fixed pause-during-synthesis bug by caching loaded blobs without starting audio playback.
  - Fixed pause-skip-resume bug by detecting when `BrowserAudioPlayer` has no active audio element and starting the next segment cleanly.
  - Converted inter-segment delay to cancelable timer that invalidates on pause, skip, or cancel.
  - Added memory cleanup releasing completed audio buffers from the cache.
- **A07 (P1 - Ollama Deadlines & Fallback)**:
  - Added `AbortSignal` and per-block timeout budget (8000ms default) to `generateWithGemma`.
  - Added model fallback to `gemma4:e2b` if `gemma4:e4b` returns 404.
  - Gracefully triggers safe deterministic fallback when timeout deadline expires.
- **A13 (P1 - TTS Concurrency)**:
  - Implemented thread-safe single-flight promise locking in `getKokoroInstance()` to serialize concurrent cold-start initialization requests to `KokoroTTS.from_pretrained`.

### Phase 3: Response Fidelity & Modes (A09, A10, A12)
- **A09 (P1 - Table Completeness)**:
  - Enhanced `generateDeterministicTableSummary` to preserve intermediate rows (e.g. Model C) and non-numeric columns (e.g. License) without dropping data.
  - Added `generateLiteralTableSummary` for cell-by-cell readout with column headers.
- **A10 (P1 - Nested HTML Parser)**:
  - Prioritized table parsing before code block heuristics so tables containing inline `<code>` cells are not misclassified as code blocks.
  - Traversed `childNodes` to preserve direct text nodes as paragraph blocks.
  - Unwrapped presentation-only containers (`div.table-wrapper`).
- **A12 (P1 - Deterministic Literal Mode)**:
  - Made Literal mode 100% deterministic for code and tables, bypassing Ollama entirely.
  - Mode toggle dynamically invalidates existing plan and rebuilds with the chosen mode.

### Phase 4: ChatGPT Integration & Side Panel (A04, A05, A11)
- **A04 (P0 - Disconnected Flow)**:
  - Wired typed `EXPLAIN_ALOUD_EXTRACTED` message passing from content script to background service worker and player UI.
  - Maintained current session IR in background memory with `GET_CURRENT_SESSION` request handler.
  - Auto-starts narration plan upon selecting a ChatGPT response turn.
- **A05 (P1 - Persistent Side Panel Player)**:
  - Added Chrome MV3 Side Panel entrypoint (`entrypoints/sidepanel/index.html` & `main.tsx`).
  - Configured `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` and automated opening on turn selection.
  - Playback continues seamlessly even when focus moves away from the extension.
- **A11 (P1 - Turn Deduplication & Completion)**:
  - Canonicalized assistant message detection to one element per turn without duplicate matches.
  - Made streaming checks per-response (`.result-streaming`), preventing newly streaming turns from locking out older completed answers.
  - Excluded the injected button container from extracted `ResponseIR`.

### Phase 5: Truthful Status & Acceptance (A15)
- **A15 (P1 - Status & Claims)**:
  - Verified local model presence using `isModelAvailable` rather than simple `/api/tags` HTTP success.
  - Status labels truthfully reflect: `Gemma 4 (E4B) Ready`, `Gemma 4 (E2B) Ready`, `Ollama Online (No Gemma 4)`, or `Ollama Offline`.
  - Active segment cards distinguish `✓ Verified`, `⚠️ Fallback`, and `Unverified`.

---

## 3. Complete Test Results

All 90 unit and integration tests pass across 11 test suites:

```text
 ✓ src/smoke.test.ts (1 test)
 ✓ src/narrator/ruleNarrator.test.ts (10 tests)
 ✓ src/narrator/llmNarrator.test.ts (11 tests)
 ✓ src/adapter/chatgptAdapter.test.ts (11 tests)
 ✓ src/table/tableEngine.test.ts (12 tests)
 ✓ src/parser/htmlParser.test.ts (10 tests)
 ✓ src/services/ollama.test.ts (8 tests)
 ✓ src/validator/segmentValidator.test.ts (14 tests)
 ✓ src/pipeline/pipeline.test.ts (3 tests)
 ✓ src/kokoro.test.ts (2 tests)
 ✓ src/audio/audioQueue.test.ts (8 tests)

 Test Files  11 passed (11)
      Tests  90 passed (90)
```

---

## 4. Acceptance Criteria Verification Matrix

| Area | Requirement | Status | Verification Reference |
| :--- | :--- | :---: | :--- |
| **Parser** | Identifies paragraph, heading, list, code, table | **PASS** | `htmlParser.test.ts` |
| **Parser** | Inline `<code>` in table does not misclassify as code | **PASS** | `htmlParser.test.ts` (A10 probe) |
| **Parser** | Direct text nodes and presentation wrappers preserved | **PASS** | `htmlParser.test.ts` (A10 probe) |
| **Table** | Normalized units across duration, size, percent, currency | **PASS** | `tableEngine.test.ts` (A08 probe) |
| **Table** | Incompatible units never ranked | **PASS** | `tableEngine.test.ts` (A08 probe) |
| **Table** | Ties accurately identified | **PASS** | `tableEngine.test.ts` (A08 probe) |
| **Table** | Intermediate rows & text columns preserved in summary | **PASS** | `tableEngine.test.ts` (A09 probe) |
| **Validation**| Scopes facts strictly to segment's source blocks | **PASS** | `segmentValidator.test.ts` (A02 probe) |
| **Validation**| Rejects falsified entity-metric binding | **PASS** | `segmentValidator.test.ts` (A02 probe) |
| **Validation**| Rejects invented entities and causality | **PASS** | `segmentValidator.test.ts` (A02 probe) |
| **Validation**| Rejects spelled-out invalid numbers | **PASS** | `segmentValidator.test.ts` (A02 probe) |
| **Validation**| Rejects ungrounded code behavior claims | **PASS** | `segmentValidator.test.ts` (A02/A03 probe) |
| **Validation**| Validation failure never returns candidate text | **PASS** | `segmentValidator.test.ts` (A03 probe) |
| **Validation**| Special regex characters do not throw exceptions | **PASS** | `segmentValidator.test.ts` (A14 probe) |
| **Audio** | Monotonically tokenized session and segment execution | **PASS** | `audioQueue.test.ts` (A06 probe) |
| **Audio** | Pause during synthesis does not play on resolution | **PASS** | `audioQueue.test.ts` (A06 probe) |
| **Audio** | Cancel and new plan drops stale synthesis | **PASS** | `audioQueue.test.ts` (A06 probe) |
| **Audio** | Skip while paused advances and resumes accurately | **PASS** | `audioQueue.test.ts` (A06 probe) |
| **Services**| Single-flight Kokoro initialization | **PASS** | `kokoro.test.ts` (A13 probe) |
| **Services**| Ollama deadline budget and timeout abort | **PASS** | `ollama.test.ts` (A07 probe) |
| **Services**| E2B fallback on E4B 404 | **PASS** | `ollama.test.ts` (A07 probe) |
| **Modes** | Literal mode deterministic without Ollama | **PASS** | `pipeline.test.ts` (A12 probe) |
| **Adapter** | Deduplicated turn injection | **PASS** | `chatgptAdapter.test.ts` (A11 probe) |
| **Adapter** | Older completed answers remain playable during streaming | **PASS** | `chatgptAdapter.test.ts` (A11 probe) |
| **UI** | Side Panel persistent audio playback | **PASS** | MV3 manifest verified |
| **UI** | Truthful model availability status badges | **PASS** | `App.tsx` & `ollama.test.ts` (A15 probe) |
