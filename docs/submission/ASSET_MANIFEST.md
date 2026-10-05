# Submission assets and evidence

Created for the local article draft on 2026-10-05. Application source snapshot: `0c0b33d4acfedab591b099f15ae98d18d5734d66`; repository HEAD before this editorial work: `a5280c0`. The running browser's loaded revision was not independently established.

Four visuals are used, placed next to the paragraphs they support. No generated mock application screenshot, benchmark graph, or decorative cover image is included.

| Asset | Question answered / article placement | Evidence and editing |
|---|---|---|
| `assets/01-chatgpt-table-button.png` | Where does the product enter the workflow? After the opening problem. | Real Windows capture of Chrome displaying the demo model-selection response. Pixel crop only, removing browser toolbar, conversation URL/history, account details, and unrelated screen area. Values shown belong to the example response, not a benchmark. |
| `assets/02-natural-mode-panel.png` | What does the product actually expose to the listener? After the product introduction. | Same real Chrome capture. Natural Mode, E4B Ready badge, stopped state, rule provenance, and source block labels are visible. Pixel crop plus clearly labeled redaction of the unique response identifier. No status or narration text reconstructed. |
| `assets/03-architecture.png` | Where do rules, Gemma, validation, and speech participate? In the implementation explanation. | Authored implementation diagram, traced to parser, pipeline, narrator, validator, queue, and TTS source. Correctly shows that the queue requests Kokoro synthesis; the side panel hosts the inspector and controls. SVG and Mermaid source also provided. |
| `assets/04-table-before-after.png` | What changes when a visual table becomes narration? In the small-table discussion. | Authored evidence graphic, explicitly labeled as an automated fixture. Exact narration is extracted by the generator from `preDemoQuality.test.ts`; all nine data cells are shown. SVG source also provided. |

## Source references

- [Selected-response extraction](../../extension/src/adapter/chatgptAdapter.ts)
- [Parser and explicit language detection](../../extension/src/parser/htmlParser.ts)
- [Pipeline orchestration](../../extension/src/pipeline/pipeline.ts)
- [Gemma calls and deterministic small-table branch](../../extension/src/narrator/llmNarrator.ts)
- [Validation and fallback](../../extension/src/validator/segmentValidator.ts)
- [Narration segment contract](../../extension/src/types/narration.ts)
- [Audio queue](../../extension/src/audio/audioQueue.ts)
- [Bundled Kokoro runtime configuration](../../extension/src/services/tts.ts)
- [Exact before/after regression assertion](../../extension/src/pipeline/preDemoQuality.test.ts)
- [Recorded final verification](../../FINAL_STATUS.md)

## Caption and claim boundaries

- A still image does not prove sound was audible; that claim comes from the user's explicit browser confirmation.
- The captured panel is **STOPPED**, not playing. Its state has not been altered in the image.
- “Gemma 4 (E4B) Ready” is an availability check, not inference provenance. No captured LLM segment or model-used record is claimed.
- The panel's “Verified” and passed count are application labels. They are not independently established factual accuracy.
- The table illustration is test evidence, not a screenshot of a live browser result.
- No final browser timing values were supplied or captured. No graph was made.
- A separate trust-boundary diagram was omitted: the architecture and short segment-type excerpt already explain it.
- A test-output screenshot was omitted: the concise verification table cites the actual last runs without manufacturing a terminal image.
- No demo video was recorded or invented.

## Reproduction and privacy

`build_visuals.py` renders PNG and SVG versions of the diagrams using the already-installed Pillow package. It adds no extension dependency. Run `python docs/submission/build_visuals.py` from the repository root.

Original full-window captures are private working material under `.git/media/`, outside tracked article assets. Only reviewed crops are included. The optional `--raw-capture` argument reproduces those crops when the matching 1938×1098 source capture is available. Do not upload raw captures: they contain browser history/account context outside the demo crop.

All four public PNG assets were visually inspected after export for text readability, cropping, evidence labels, and private information.

## Editorial reference

The author's requested principles guided the structure: concrete problem first, then implementation decisions, a real failure, and evidence limits. A retrieved DEV example, [I Built My Wife a Patient English Idiom Coach That Runs on Our Laptop](https://dev.to/gusanchedev/i-built-my-wife-a-patient-english-idiom-coach-that-runs-on-our-laptop-2m0h), reinforced placing real-app captures beside the behavior they explain and separating measured claims from planned tests. Its anecdotes, wording, code, results, and architecture were not used in this project's article. It is an editorial reference, not evidence about Explain Aloud or a verified winning entry.
