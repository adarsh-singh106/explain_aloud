# Explain Aloud — PRD v2

**Status:** Hackathon MVP  
**Primary user:** One real person who regularly listens to AI responses and finds structured answers awkward or useless when read aloud.  
**Product promise:** **Understand an AI answer without needing to look at the screen.**

## 1. Problem

AI answers are written for screens. They contain paragraphs, headings, lists, code blocks, tables, diagrams, citations, and visual references.

A normal Read Aloud path often treats these as text to pronounce. That can create poor listening experiences:
- code becomes syntax noise,
- tables become cell-by-cell dumping,
- visual references such as “as shown above” become meaningless,
- important comparisons are hard to follow,
- the listener has to look back at the screen.

The problem is **not bad voice quality alone**. It is that screen-native structure is not automatically audio-native structure.

## 2. Job To Be Done

> When I want to listen to a ChatGPT answer instead of reading it, help me understand the same answer naturally without forcing me to look at the screen.

## 3. Product Thesis

Explain Aloud is a **structure-aware listening layer**.

It:
1. detects the structure of the selected AI response,
2. preserves source facts and structure,
3. uses deterministic rules where rules are sufficient,
4. uses a local open model only where semantic explanation adds value,
5. validates risky claims,
6. falls back to a literal or rule-based rendering when it cannot verify the semantic version,
7. synthesizes narration locally.

### Core principle

**Truth first. Explanation second. Voice third.**

## 4. Positioning

### Say

> Explain Aloud turns structured AI answers into explanations you can follow with your eyes off the screen.

### Do not say

- “first semantic TTS”
- “screen reader replacement”
- “accessibility compliance tool”
- “better voice for ChatGPT”
- “AI that summarizes everything”

The product is about **screenless understanding**.

## 5. MVP Scope

### Supported

1. ChatGPT completed assistant responses
2. Paragraphs
3. Headings
4. Lists
5. Code blocks
6. Tables
7. Natural mode
8. Literal mode
9. Play / pause / skip / cancel
10. Local narration model
11. Local TTS
12. Visible fallback / verification status in debug UI

### Out of scope

- Claude
- Gemini
- arbitrary webpages
- images
- rendered charts
- equations
- PDFs
- voice cloning
- podcasts
- user accounts
- cloud sync
- analytics
- mobile app
- Firefox release
- ElevenLabs integration
- model marketplace
- Quick / Detailed modes

## 6. Core User Flow

1. User opens a completed ChatGPT response.
2. User clicks **Explain Aloud**.
3. Extension extracts the selected response into typed blocks.
4. Simple blocks use deterministic rules.
5. Complex blocks such as code and tables may use the local narration model.
6. Risky semantic claims are checked against source facts.
7. PASS → semantic narration.
8. FAIL → rule/literal fallback.
9. Kokoro synthesizes the narration locally.
10. Audio starts segment-by-segment.

## 7. Block Behavior

### Paragraph
Preserve meaning closely; improve spoken flow only when needed.

### Heading
Convert into a transition.

`## Why this matters`
→ `Next, why this matters.`

### List
Group naturally. Do not announce Markdown bullets.

### Code — Natural
Explain:
- purpose,
- control flow,
- important actions,
- important conditions.

Do not:
- read punctuation,
- invent function behavior,
- explain unseen context.

### Code — Literal
Preserve exact identifiers and important syntax as closely as practical.

### Table
1. Parse deterministically.
2. Extract headers, rows, numeric values, min/max, simple ranks/deltas.
3. Give only verified facts to the LLM.
4. LLM chooses wording, not truth.
5. Validate output.
6. On failure, use a deterministic sentence.

### Unknown / unsafe block
Fall back safely.

## 8. ResponseIR

```ts
type BlockType =
  | "paragraph"
  | "heading"
  | "list"
  | "code"
  | "table"
  | "unknown";

interface ResponseIR {
  schemaVersion: "1.0";
  site: "chatgpt";
  responseId: string;
  blocks: Block[];
  facts: Fact[];
}

interface Block {
  id: string;
  order: number;
  type: BlockType;
  raw: string;
  language?: string;
  structured?: unknown;
}

interface Fact {
  id: string;
  sourceBlockIds: string[];
  kind: "number" | "comparison" | "identifier" | "negation" | "relation";
  value: unknown;
  critical: boolean;
}
```

## 9. NarrationPlan

```ts
interface NarrationSegment {
  id: string;
  sourceBlockIds: string[];
  factIds: string[];
  provenance: "rule" | "llm" | "literal";
  text: string;
  verified: boolean;
  fallbackReason?: string;
  pauseAfterMs: number;
}
```

**Hard rule:** no semantic spoken claim without source references.

## 10. Faithfulness Rules

Reject narration that:
- invents or changes a number,
- reverses a comparison,
- adds unsupported named entities,
- removes critical negation,
- changes “only”, “unless”, “at least”, or “except”,
- invents code behavior,
- contains unresolved “as shown above/below”.

For curated acceptance fixtures:
- 100% critical-number preservation
- 100% source mapping coverage
- 0 unsupported factual claims
- 0 reversed comparisons
- 0 critical-negation flips

Fallback is a valid success path.

## 11. Technical Architecture

```text
ChatGPT page
    ↓
WXT content script
    ↓
Semantic DOM extractor
    ↓
ResponseIR + deterministic facts
    ↓
 ┌───────────────┐
 │               │
rules        Ollama + Gemma
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
     Kokoro.js
         ↓
     Audio queue
```

### Hackathon decision

**No FastAPI backend initially.**

Use:
- WXT extension
- Ollama locally
- Kokoro.js in the extension

If direct Ollama access becomes a blocker, add a tiny localhost bridge later.

## 12. Model Policy

Default candidate: `gemma4:e4b`  
Fallback: `gemma4:e2b`

Pick the smallest model that:
- reliably returns the schema,
- preserves facts,
- produces natural narration,
- meets usable latency.

## 13. TTS Policy

MVP: **Kokoro.js**

Requirements:
- local execution,
- segmented/streamed generation,
- one fixed demo voice,
- no cloud fallback.

## 14. Latency Targets

- click → extraction: <150 ms
- warm click → first audio: target ≤3 s
- next segment gap: target ≤1 s
- pause: <100 ms
- cancel: <150 ms

If LLM misses its budget, use rule/literal fallback.

## 15. Privacy

- no telemetry
- no conversation storage
- no cloud TTS
- no cloud narration API
- only selected response is processed
- no `<all_urls>`
- narrow host permissions
- do not claim the original ChatGPT conversation is private from OpenAI

## 16. Success Criteria

The MVP succeeds if:
1. a selected ChatGPT response renders end-to-end,
2. code/tables are meaningfully better than naive literal reading,
3. critical facts are preserved,
4. the demo works without looking at the screen,
5. value is obvious in <60 seconds,
6. narration/TTS run locally after models are available.

## 17. Kill / Pivot Criterion

Reconsider if:

> “Rewrite this answer for listening, preserve every important number, do not refer to the screen.”

plus native Read Aloud produces essentially the same value with acceptable friction.

## 18. Hackathon Demo

Use one mixed response with:
- prose,
- list,
- code,
- table.

Demo:
1. show response,
2. play native Read Aloud,
3. click Explain Aloud,
4. show block detection,
5. play natural table/code narration,
6. show one invalid narration rejected into fallback,
7. end with local model + local TTS.

Suggested line:

> **Don't read the screen to me. Explain it to me.**

## 19. Future Expansion

Later:
- Claude / Gemini adapters
- diagrams
- equations
- chart narration
- code policy: explain / skip / literal / deep-dive
- adaptive detail
- interactive follow-up
- multilingual narration
- alternative local TTS
- SDK/API
