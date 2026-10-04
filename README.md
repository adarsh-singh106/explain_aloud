# Explain Aloud

> **"Don't read the screen to me. Explain it to me."**

A local-first, structure-aware listening layer for structured AI answers.

Explain Aloud turns structured ChatGPT responses (paragraphs, headings, lists, code blocks, and comparison tables) into spoken explanations that you can follow effortlessly without looking at your screen.

---

## Architecture

```text
ChatGPT / Fixture HTML
         ↓
  WXT Content Script
         ↓
 Semantic DOM Extractor
         ↓
ResponseIR + Deterministic Facts
         ↓
 ┌───────────────┐
 │               │
Rules        Ollama + Gemma 4
 │               │
 └───────┬───────┘
         ↓
   NarrationPlan
         ↓
     Validator
     ↓       ↓
   PASS     FAIL
     ↓       ↓
     └── fallback
         ↓
     Kokoro.js (WASM)
         ↓
  AudioQueue Controller (Play / Pause / Skip / Cancel)
```

---

## Core Invariants

1. **Truth First**: No invented numbers, no reversed comparisons, no hallucinated code behavior.
2. **Deterministic Pre-Extraction**: Tables extract facts and metrics before LLM wording.
3. **Safe Fallbacks**: Validation failure triggers a 100% verified deterministic fallback sentence without breaking audio playback.
4. **100% Local & Private**: Runs entirely in the browser and on local Ollama. Zero telemetry, zero cloud TTS, zero cloud APIs, no `<all_urls>` permission.

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
npm run test     # Runs all 58 Vitest unit & integration tests
npm run compile  # Verifies strict TypeScript compilation
npm run build    # Builds production Chrome MV3 extension (.output/chrome-mv3)
```

### 3. Load in Browser
1. Open Chrome/Edge and go to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `extension/.output/chrome-mv3`.
4. Click the **Explain Aloud** toolbar icon to launch the player and run the demo on the bundled fixture or on [ChatGPT](https://chatgpt.com).

---

## Documentation

- [docs/PRD.md](docs/PRD.md): Product Requirements Document
- [docs/MVP.md](docs/MVP.md): MVP Scope & Non-Goals
- [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md): Build Order & Milestones (M0–M9)
- [docs/NARRATION_SPEC.md](docs/NARRATION_SPEC.md): Spoken Narration Rules
- [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md): Acceptance & Verification Criteria
- [docs/DEMO.md](docs/DEMO.md): Live Demo Walkthrough & Read Aloud Comparison
- [BUILD_PROGRESS.md](BUILD_PROGRESS.md): Complete Build History & Milestone Logs
