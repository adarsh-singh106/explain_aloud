# AGENTS.md — Explain Aloud

## Product

Explain Aloud turns structured AI responses into explanations a user can follow without looking at the screen.

It is not ordinary text-to-speech.

## Read first

- Product: `docs/PRD.md`
- Scope: `docs/MVP.md`
- Narration: `docs/NARRATION_SPEC.md`
- Completion: `docs/ACCEPTANCE.md`
- Order: `docs/BUILD_PLAN.md`

## Hard rules

1. Do not add features outside `docs/MVP.md`.
2. Prefer small, testable changes.
3. Do not add dependencies without a concrete need.
4. Do not add FastAPI, a database, auth, MCP, Graphify, cloud APIs, or extra providers unless explicitly required.
5. Never send response content to a cloud service.
6. Never invent numbers or comparisons.
7. Every LLM narration segment must reference source blocks.
8. Tables extract facts deterministically before LLM wording.
9. Validation failure must fall back safely.
10. A feature is not done because it compiles; run acceptance checks.
11. Never modify files outside this repo.

## Stack

- WXT
- React
- TypeScript
- Ollama
- Gemma 4 E4B, E2B fallback
- Kokoro.js
- Vitest

## Architecture

`ChatGPT/fixture → ResponseIR → rules/facts → optional local LLM → validator → NarrationPlan → Kokoro → audio`

## MVP

- ChatGPT only
- prose
- headings
- lists
- code
- tables
- Natural / Literal
- playback controls

## Definition of done

Working implementation + relevant tests + acceptance criteria + no scope creep + demonstrable user-visible behavior.
