# Explain Aloud

> **"Don't read the screen to me. Explain it to me."**

A local-first, structure-aware listening layer for structured AI answers.

Explain Aloud turns structured ChatGPT responses (paragraphs, headings, lists, code blocks, and comparison tables) into spoken explanations that you can follow effortlessly without looking at your screen.

---

## Architecture

```text
ChatGPT / Fixture HTML
         ↓
  WXT Content Script (turn deduplicated, completion-checked)
         ↓
  Semantic DOM Extractor (preserves text nodes, unwraps tables)
         ↓
ResponseIR + Deterministic Facts (unit-normalized, tie-aware)
         ↓
 ┌───────────────┐
 │               │
Rules        Ollama + Gemma 4 (bounded timeout, E2B fallback)
 │               │
 └───────┬───────┘
         ↓
   NarrationPlan
         ↓
     Validator (entity-metric bindings, code grounding, causality checks)
     ↓       ↓
   PASS     FAIL
     ↓       ↓
     └── source-derived fallback
         ↓
     Kokoro.js (WASM singleton, single-flight lock)
         ↓
  AudioQueue Controller (monotonically tokenized, interruptible)
         ↓
  Side Panel / Popup Player UI (persistent listening)
```

---

## Core Invariants

1. **Truth First**: No invented numbers, no reversed comparisons, no hallucinated code behavior, no unsupported causality.
2. **Deterministic Pre-Extraction**: Tables extract facts, units, and metrics before LLM wording.
3. **Safe Fallbacks**: Validation failure triggers a 100% verified deterministic source-derived fallback without breaking audio playback or returning candidate hallucinations.
4. **Deterministic Literal Mode**: Works completely offline without Ollama; preserves exact syntax, identifiers, and table cells.
5. **Interruptible Playback**: Monotonically tokenized playback queue prevents audio races during pause, skip, or cancel.
6. **100% Local & Private**: Runs entirely in the browser and on local Ollama. Zero telemetry, zero cloud TTS, zero cloud APIs, no `<all_urls>` permission.

---

## Quick Start

### 1. Prerequisites
- Node.js LTS & npm
- [Ollama](https://ollama.com) installed and running:
  ```powershell
  $env:OLLAMA_ORIGINS="chrome-extension://*"
  ollama serve
  ollama pull gemma4:e4b
  ```

### 2. Install & Test
```powershell
cd extension
npm install
npm test     # Runs all 90 Vitest unit & integration tests across 11 files
npm run compile  # Verifies strict TypeScript compilation (0 errors)
npm run build    # Builds production Chrome MV3 extension (.output/chrome-mv3)
```

### 3. Load in Browser
1. Open Chrome/Edge and go to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `extension/.output/chrome-mv3`.
4. Click the **Explain Aloud** toolbar icon to launch the player or Side Panel. Run the demo on the bundled fixture or directly on [ChatGPT](https://chatgpt.com).

---

## Documentation

- [docs/PRD.md](docs/PRD.md): Product Requirements Document
- [docs/MVP.md](docs/MVP.md): MVP Scope & Non-Goals
- [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md): Build Order & Milestones (M0–M9)
- [docs/NARRATION_SPEC.md](docs/NARRATION_SPEC.md): Spoken Narration Rules
- [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md): Acceptance & Verification Criteria
- [docs/DEMO.md](docs/DEMO.md): Live Demo Walkthrough & Read Aloud Comparison
- [docs/AUDIT_REPORT.md](docs/AUDIT_REPORT.md): Comprehensive Product & Implementation Audit
- [BUILD_PROGRESS.md](BUILD_PROGRESS.md): Complete Build History, Milestone Logs & Audit Hardening
