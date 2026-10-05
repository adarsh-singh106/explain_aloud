# Explain Aloud — Final release checkpoint

Date: 2026-10-05. Evidence: latest completed verification commands in this session, repository inspection, and the user's browser-test reports. No source code changed for this checkpoint.

Labels: **IMPLEMENTED** = present in code; **AUTOMATED-TESTED** = checked automatically; **BROWSER-VERIFIED** = explicitly confirmed by the user in Chrome; **UNVERIFIED** = no specific result supplied or observed.

## Git and automated verification

| Item | Evidence | Result |
|---|---|---|
| Branch / source snapshot | IMPLEMENTED | `main` / `0c0b33d4acfedab591b099f15ae98d18d5734d66` contains the tested source. Later commits record audit evidence and this status document. |
| Commit checkpoint | IMPLEMENTED | Original HEAD was `fbb3db3686bba36741dd9dc3a6e15ceebe24e5aa` with uncommitted changes. Those changes were subsequently grouped into separate narration, Kokoro, timing, and audit-evidence commits without changing source-file contents. |
| Latest `npm test` | AUTOMATED-TESTED | **191/191 tests passed; 14/14 test files passed**, exit 0. Reported duration: 11.14 seconds. |
| Latest `npm run compile` | AUTOMATED-TESTED | `tsc --noEmit` passed, exit 0. |
| Latest `npm run build` | AUTOMATED-TESTED | Chrome MV3 production build passed, exit 0; 24.11 MB. Nonblocking warning: a minified chunk exceeds 500 kB. |
| Bundle | AUTOMATED-TESTED | `extension/.output/chrome-mv3/`; manifest exists. |

These are the actual latest runs from the preceding patch, not estimates based on the expected test count. Commands were run from `extension/` and were not repeated for this documentation-only checkpoint.

## Browser and narration results

| Item | Evidence | Verified result / boundary |
|---|---|---|
| Production Chrome extension | BROWSER-VERIFIED | User states the production extension works and has now been manually tested. Detailed per-feature outcomes from the final test were not supplied. |
| Actual Kokoro speech | BROWSER-VERIFIED | User explicitly confirmed actual Kokoro speech works in the production Chrome extension. |
| Selected response / side panel | IMPLEMENTED; UNVERIFIED | Flow is implemented; separate final browser assertions about selection accuracy and panel behavior were not supplied. |
| Natural mode | AUTOMATED-TESTED; UNVERIFIED | Fixture pipeline and new small-table/heading cases pass. Tests mock Gemma; specific final browser narration outcome was not supplied. |
| Literal mode | AUTOMATED-TESTED; UNVERIFIED | Tests pass for deterministic narration without Ollama, code structure, and table values. Specific final browser outcome was not supplied. |
| Python language detection | AUTOMATED-TESTED; UNVERIFIED | Seven explicit-marker fixture variants pass, including a Python header with a generic plaintext class. Language reaches the code prompt; header UI is excluded. Unmarked code is not guessed. Final live DOM result was not supplied. |
| Small-table narration | AUTOMATED-TESTED; UNVERIFIED | Sample produces row-wise narration with every cell, without Gemma and without validation fallback. Final browser listening result was not supplied. |
| Pause | AUTOMATED-TESTED; UNVERIFIED | Queue tests pass; final browser result not supplied. |
| Resume | AUTOMATED-TESTED; UNVERIFIED | Queue tests pass; final browser result not supplied. |
| Skip | AUTOMATED-TESTED; UNVERIFIED | Queue tests pass; final browser result not supplied. |
| Cancel | AUTOMATED-TESTED; UNVERIFIED | Queue tests pass, including stale synthesis cancellation; final browser result not supplied. |
| Gemma model actually used | UNVERIFIED | Final browser model identity was not supplied. Code defaults to `gemma4:e4b`, with `gemma4:e2b` fallback on an E4B model-not-found response. Configuration does not prove which model ran. |

AUTOMATED-TESTED sample output:

> The table has three entries. Name: Alex, Age: 20, and Role: Student. Name: Sam, Age: 21, and Role: Developer. Name: John, Age: 22, and Role: Engineer.

AUTOMATED-TESTED heading output: `Small List` becomes `Next, small list.` in a subsequent heading.

## Browser timing values

IMPLEMENTED: local `performance.now()` diagnostics use the console prefix `[Explain Aloud timing]`. No telemetry or external reporting was added.

| Measurement | Evidence | Actual browser value |
|---|---|---|
| Extraction | UNVERIFIED | Not supplied / not observed |
| Narration-plan construction | UNVERIFIED | Not supplied / not observed |
| Gemma generation | UNVERIFIED | Not supplied / not observed |
| Validation | UNVERIFIED | Not supplied / not observed |
| Kokoro initialization | UNVERIFIED | Not supplied / not observed |
| Kokoro synthesis | UNVERIFIED | Not supplied / not observed |
| Click-to-first-audio | UNVERIFIED | Not supplied / not observed |

Plan construction includes Gemma time and excludes validation; do not add Gemma time to it again. Synthesis is measured per segment. Click-to-first-audio ends when the audio play promise resolves, not when a microphone detects sound. Initial-load and reuse measurements must be distinguished. Failed operations also record elapsed time.

The older `docs/audit-live-result.json` explicitly covers a synthetic local Ollama plan without TTS/browser. Its 16020 ms value and model field are not evidence of final browser timing or model use.

## Known limitations and remaining evidence

- IMPLEMENTED: MVP targets completed ChatGPT responses; language labels are recognized conservatively and depend on DOM markers.
- IMPLEMENTED: New row-wise wording applies to complete rectangular tables with 2–4 rows and 2–4 columns; merged-cell tables stay on the existing path.
- IMPLEMENTED: Heading normalization uses a limited ordinary-word vocabulary, not general linguistic analysis.
- IMPLEMENTED: Gemma calls have an 8000 ms default timeout per request; timeout/error paths can fall back. No latency improvement has been measured in the browser here.
- IMPLEMENTED: Kokoro runtime executable assets are bundled locally. Model/voice asset availability and initial downloads remain separate concerns.
- UNVERIFIED: Complete offline operation, exact final browser Gemma identity, numeric latency, and feature-specific final browser outcomes listed above.
- AUTOMATED-TESTED: Passing fixtures establish only the tested behavior; they do not establish universal faithfulness or absence of unsupported narration.

## DEMO_FACTS

1. IMPLEMENTED — Explain Aloud turns structured ChatGPT responses into spoken explanations.
2. BROWSER-VERIFIED — The production Chrome extension has been manually tested by its developer.
3. BROWSER-VERIFIED — Actual Kokoro speech works in the production Chrome extension.
4. AUTOMATED-TESTED — The latest run passed 191 tests across 14 test files.
5. AUTOMATED-TESTED — TypeScript checking and the Chrome MV3 production build passed.
6. AUTOMATED-TESTED — Natural and Literal narration paths pass fixture tests; Gemma is mocked in those tests.
7. AUTOMATED-TESTED — Explicit Python language markers are preserved in seven regression-fixture variants.
8. AUTOMATED-TESTED — The sample small table retains every cell in deterministic row-wise narration without Gemma.
9. AUTOMATED-TESTED — Playback queue tests cover pause, resume, skip, and cancel.
10. UNVERIFIED — Numeric final browser timings and the Gemma model actually used have not been recorded in this checkpoint.
