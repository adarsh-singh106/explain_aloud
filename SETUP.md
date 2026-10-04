# Explain Aloud — Setup Guide (Windows)

## 0. Prerequisites

Install/verify:
- Git
- Node.js LTS
- npm
- Chrome or Edge
- Ollama
- Codex
- Antigravity

```powershell
git --version
node --version
npm --version
ollama --version
```

## 1. Create the repo

```powershell
mkdir explain-aloud
cd explain-aloud
git init
```

Copy this starter pack into the repo and commit the product contract:

```powershell
git add .
git commit -m "docs: define Explain Aloud MVP"
```

## 2. Pull the narration model now

```powershell
ollama pull gemma4:e4b
```

If E4B is too slow/heavy:

```powershell
ollama pull gemma4:e2b
```

Do not pull a model zoo.

## 3. Scaffold the WXT extension

From repo root:

```powershell
npx wxt@latest init extension
```

Choose:
- React
- TypeScript

Then:

```powershell
cd extension
npm install
npm install kokoro-js
npm run dev
```

## 4. Prove Kokoro alone first

Use `kokoro-js` with WASM first:

```ts
import { KokoroTTS } from "kokoro-js";

const tts = await KokoroTTS.from_pretrained(
  "onnx-community/Kokoro-82M-v1.0-ONNX",
  {
    dtype: "q8",
    device: "wasm",
  },
);

const audio = await tts.generate(
  "Explain Aloud is ready.",
  { voice: "af_heart" },
);
```

Only after WASM works, try WebGPU.

## 5. Prove Gemma alone

```powershell
ollama run gemma4:e4b
```

Test:

```text
Return JSON only.

Facts:
- Model A accuracy: 92%
- Model B accuracy: 88%
- Model A latency: 4 seconds
- Model B latency: 1 second

Write one natural spoken comparison.
Do not add facts.
```

If too slow, repeat with E2B.

## 6. Allow extension → Ollama during development

Browser extensions need their origin allowed by Ollama.

For **development only**:

1. close the existing Ollama tray/server process if necessary,
2. run:

```powershell
$env:OLLAMA_ORIGINS="chrome-extension://*"
ollama serve
```

Before the final demo, restrict this to the actual extension ID from:

```text
chrome://extensions
```

Do **not** use `OLLAMA_ORIGINS="*"`.

## 7. Repo structure

```text
explain-aloud/
├── AGENTS.md
├── README.md
├── SETUP.md
├── docs/
│   ├── PRD.md
│   ├── MVP.md
│   ├── NARRATION_SPEC.md
│   ├── ACCEPTANCE.md
│   └── BUILD_PLAN.md
├── fixtures/
│   └── mixed-response.html
└── extension/
```

Do not add:
- FastAPI
- database
- auth
- MCP servers
- Graphify
- extra TTS engines

unless a real blocker appears.

## 8. Build order

### M0
- WXT boots
- Kokoro says one sentence
- Ollama returns Gemma output

### M1
Parse `fixtures/mixed-response.html` into ResponseIR.

### M2
Rule narration:
- paragraph
- heading
- list

### M3
Table facts:
- rows/headers
- numeric extraction
- safe comparisons

### M4
Gemma:
- code explanation
- table wording from verified facts
- strict NarrationSegment JSON

### M5
Validator:
- number preservation
- comparison checks
- source refs
- fallback

### M6
End-to-end fixture:
`fixture → ResponseIR → narration → Kokoro → audio`

### M7
ChatGPT adapter.

### M8
UI:
- Explain Aloud
- Natural/Literal
- play/pause/skip/cancel

### M9
Demo + submission.

## 9. Codex role

Use Codex for planning and review.

First prompt:

```text
Read AGENTS.md and docs/PRD.md, docs/NARRATION_SPEC.md,
docs/ACCEPTANCE.md, and docs/BUILD_PLAN.md.

Do not implement.

Propose the smallest implementation for Milestone M1 only.

Return:
1. files to create/change,
2. data structures,
3. tests,
4. acceptance checks,
5. risks.

Reject scope creep.
```

Review prompt:

```text
Review the current diff against AGENTS.md and acceptance criteria.

Do not redesign the product.
Find only:
- scope creep,
- unsupported facts,
- brittle assumptions,
- missing tests,
- privacy mistakes.

Give blocking and high-value fixes only.
```

## 10. Antigravity role

Antigravity is the primary builder.

First prompt:

```text
Read AGENTS.md and the relevant docs.

Implement Milestone M1 only:
parse fixtures/mixed-response.html into ResponseIR blocks.

Do not add Ollama, TTS, ChatGPT DOM integration, or UI yet.

Add tests for:
- paragraph
- heading
- list
- code
- table

Run tests and report exact results.
```

## 11. Git discipline

```powershell
git checkout -b feat/response-ir
```

After each working milestone:

```powershell
git add .
git commit -m "feat: parse structured response into ResponseIR"
```

Do not let Codex and Antigravity edit the same branch simultaneously.

## 12. First thing to build

Do **not** begin with ChatGPT DOM scraping.

Make the full semantic/audio pipeline work on the local fixture first.

If the fixture audio is not compelling, browser integration will not save the project.
