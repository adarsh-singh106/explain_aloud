# Explain Aloud — Product and Implementation Audit

> Historical first-pass report. Its application findings refer to `0da6770`; use the [second audit](AUDIT_REPORT.md) for the current reassessment at `fbb3db3`.

Date: 2026-10-04. Reviewed commit: `0da6770` (`docs: finalize Milestone M9 demo guide, README, and full acceptance verification`).

**Verdict: the repository is a fixture-oriented prototype with useful architecture, but it is not an acceptance-complete MVP.** The highest risks are inaccurate narration marked as verified, unsafe fallback behavior, and a disconnected ChatGPT-to-player flow. Complete and harden the current MVP before adding features.

This audit changes no production implementation. It covers the product contracts, application source, existing tests, generated manifest, build output, and selected installed TTS dependency code. Findings below distinguish executed reproductions, direct code findings, and unverified browser behavior.

## Verification performed

| Check | Result | What it establishes |
|---|---|---|
| `npm test` | 58 tests pass in 10 files | Existing automated expectations pass |
| `npm run compile` | Pass | TypeScript accepts the implementation |
| `npm run build` | Pass, with large-chunk warning | Chrome MV3 bundle generated; reported total 24.04 MB, including 2.42 MB popup JS and 21.60 MB WASM |
| Temporary targeted audit probes | 19 defect reproductions confirmed | Tests deliberately asserted current unsafe behavior; these are not 19 correctness passes |
| Source and manifest inspection | Completed | Architecture, permissions, missing integrations, and control flow reviewed |
| Live Chrome/ChatGPT, audible Kokoro playback, cold/offline model loading | Not performed | No end-to-end browser or listening acceptance claim is made |
| Latency, network capture, memory profiling | Not performed | Product performance and runtime privacy guarantees remain unmeasured |

Temporary probes used Vitest and happy-dom with mocked Ollama/audio boundaries and were removed after execution. No response content was sent to a cloud service. Generic external documentation and community research were used only for supporting context.

## What is worth preserving

- The product promise and bounded MVP are clear: screenless understanding, with local inference and safe fallback.
- Parser, table facts, narration, validation, orchestration, and audio have separate modules. That makes focused repairs practical.
- Table fact extraction happens before the LLM prompt, and generated segments carry source references.
- The audio adapter and injectable synthesizer support deterministic control tests without real audio hardware.
- Permissions are limited to ChatGPT content scripts and loopback Ollama access. No application telemetry, conversation persistence, cloud narration client, or cloud TTS client was found in the reviewed source.
- Dependencies broadly match the agreed stack. A backend, database, authentication system, or extra provider is unnecessary for these repairs.

## Prioritized findings

P0 means a release blocker: a violation of the truth/fallback contract or a broken primary user flow. P1 means a required MVP correction. P2 means polish or maintainability after the core flow works. These priorities are release priorities, not security vulnerability scores.

### A01 — P0: Natural code fallback invents behavior

**Evidence:** `extension/src/narrator/llmNarrator.ts:106`.

On any local-model error, Natural mode returns a hard-coded explanation about iterating over active users and sending email. A probe supplied `print(42)` and a rejected model request; the result still described email processing and had `verified: true`.

**Impact:** An unavailable model produces confidently false audio. The fallback only happens to resemble the curated fixture.

**Recommended change:** Remove the fixture-specific sentence immediately. Generate fallback only from the supplied source. For Natural mode, acknowledge that a verified explanation is unavailable and use an explicitly identified literal rendering when necessary. Preserve exact code in Literal mode. Never infer what an unseen function implementation does from its name alone.

**Acceptance:** Unrelated code examples and every model-error path produce no invented actions, identifiers, numbers, or conditions.

### A02 — P0: “Verified” does not establish factual faithfulness

**Evidence:** `extension/src/validator/segmentValidator.ts:34`, `:48`, `:86`, `:117`; `extension/src/pipeline/pipeline.ts:96`.

The validator checks whether source IDs are nonempty, whether digit sequences occur somewhere in the supplied facts, and a narrow selection of comparison phrases. It does not validate source-ID existence, fact-ID existence/ownership, entity–metric–value relationships, unsupported entities/causality, critical negations, or code behavior. The pipeline supplies facts from every table, allowing unrelated blocks to contribute allowed numbers.

Executed probes accepted all of these as valid against A=92%, B=88%:

- “Model B has 92% accuracy.”
- “Model Z has 92% accuracy.”
- “Model B has ninety-nine percent accuracy.”
- “Model B outperforms Model A on accuracy.”
- “Model A has 92% accuracy because it uses a larger training set.”

Additional probes accepted nonexistent source/fact IDs and an explanation that `print(42)` calls `delete_database` and uploads records. Code narration currently carries empty `factIds`.

**Recommended change:** Resolve every referenced source and fact; constrain facts to the segment's sources; require factual mappings; validate quantities together with entity, metric, unit, and qualifier. Treat missing coverage and uncertainty as fallback conditions. Add explicit handling for negation and conditions such as “only,” “unless,” and “at least.”

Do not attempt to guarantee arbitrary free-form semantics with a longer regex list. A small, safer MVP approach is to let the model select supported facts and approved wording patterns, then render the factual clauses deterministically. For code, limit semantic claims to behaviors that can actually be established from the supported source patterns; otherwise fall back. A second model's agreement alone would not prove correctness.

**Acceptance:** Every counterexample above is rejected or rendered from correct source facts. Tests cover multiple tables, missing IDs, changed units, reversed relations, negation, and omitted critical facts.

### A03 — P0: Rejected text can be returned unchanged as a verified fallback

**Evidence:** `extension/src/validator/segmentValidator.ts:123`.

Fallback starts with the rejected candidate text and replaces it only for tables, paragraphs, or headings. Code, lists, unknown blocks, and missing sources can retain the rejected text. A probe containing “Open brace, uploads all records” failed code validation but returned exactly that text with `verified: true`. Paragraph/heading fallback also restores raw text without resolving visual references.

**Recommended change:** Provide a source-derived fallback for every supported block. A missing source must produce a safe unavailable-content notice, not repeat the candidate. Validate the fallback's structural invariants and preserve rejection reasons. Never set verification merely because fallback dispatch completed.

**Acceptance:** Rejected content cannot reach speech unchanged; fallback remains safe across all block types and playback continues.

### A04 — P0: The main ChatGPT flow is disconnected

**Evidence:** `extension/entrypoints/content.ts:20`; `extension/entrypoints/background.ts:1`; `extension/entrypoints/popup/App.tsx:53`.

The injected button sends `EXPLAIN_ALOUD_EXTRACTED`, but no runtime message listener handles it. The background script only logs its startup. The popup builds a plan only from `MIXED_RESPONSE_FIXTURE_HTML`. Messaging errors are swallowed. Therefore the documented “click it to listen” path cannot run the selected response through the existing player.

**Recommended change:** Add a typed request/acknowledgment path from the selected response to the playback UI and `buildNarrationPlanFromIR`. Validate the message shape and sender; maintain only the current session in memory; expose actionable errors. Use the already-planned side panel as the primary player. Keep the fixture as a clearly labelled demonstration path.

**Acceptance:** With the player initially closed, click an older completed answer among multiple turns. Exactly that answer opens in the player and plays; no other response is extracted for narration.

### A05 — P1: Popup ownership conflicts with sustained listening

**Evidence:** `extension/entrypoints/popup/App.tsx:20` and `:25`; generated manifest has `action.default_popup`, with no side panel.

The audio queue and Kokoro lifetime belong to the toolbar popup. Chrome closes a popup when focus moves elsewhere. The application also cancels its queue during React cleanup. Browser listening behavior was not exercised here, but this ownership cannot provide a durable player when the popup closes. Chrome documents [popup closure behavior](https://developer.chrome.com/docs/extensions/develop/ui/add-popup).

**Recommended change:** Move playback ownership to the planned side panel, with explicit behavior when it closes. Chrome's [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) supports a UI alongside the page. Do not assume the service worker can directly replace a DOM audio host.

**Acceptance:** Playback continues while the user interacts with ChatGPT or switches focus according to the documented lifecycle; closing the player has predictable behavior.

### A06 — P1: Pause, skip, and cancellation race with synthesis

**Evidence:** `extension/src/audio/audioQueue.ts:117`, `:152`, `:162`, `:197`, `:204`, `:221`.

Executed probes confirm:

- Pause during pending synthesis leaves state “paused,” but synthesis completion still starts audio.
- Cancel, load a new plan, and start it; the old pending synthesis can then complete and play stale audio because the shared cancellation boolean was reset.
- Pause, skip, and resume advances the index but never loads the next audio. The real player's stopped audio element is null, so resuming it cannot progress.

Code inspection also finds uncancelled inter-segment timers, no pause check before automatic advancement, and a prefetched promise without immediate rejection handling.

**Recommended change:** Introduce a monotonically increasing playback/session token and segment token. Check both after every await and timer. Track whether resume has actual paused audio or needs to load a segment. Invalidate delayed work on skip/cancel/load. Handle prefetch rejection promptly and release completed buffers instead of retaining the whole response's audio.

**Acceptance:** Deferred promises and fake timers cover pause during synthesis/gaps, rapid skips, cancel/restart, load during synthesis, and synthesis failure. No superseded audio plays.

### A07 — P1: Ollama has no timeout, cancellation, or bounded fallback policy

**Evidence:** `extension/src/services/ollama.ts:21`; `extension/src/pipeline/pipeline.ts:59` and `:66`; `extension/entrypoints/popup/App.tsx:85`.

Requests use plain `fetch`, without an abort signal or deadline. Complex blocks are narrated sequentially, and the full plan is built before audio is loaded. Cancel only touches the audio queue. A responsive server with stalled generation can leave “Analyzing & Narrating...” indefinitely. The tests' simulated timeout is a mocked rejection, not a real timeout mechanism. There is no implemented E2B fallback.

**Recommended change:** Propagate an abort signal and a total generation budget through the UI, pipeline, and client. On deadline, produce safe fallback. Begin speech from validated leading segments while preparing later ones in a bounded sequence. Implement the specified E2B selection/fallback policy within the same budget; do not double the user's wait with unbounded retries.

**Acceptance:** A never-resolving generation request reaches fallback within the configured budget; cancellation prevents late plan installation; measured warm first-audio latency and segment gaps meet the PRD targets or are explicitly recorded as unmet.

### A08 — P0: Deterministic table fallback can make false comparisons

**Evidence:** `extension/src/table/tableEngine.ts:101` and `:113`.

The table engine compares numeric magnitudes without checking units. With A=`900 ms` and B=`2 sec`, a probe generated “A is highest at 900 ms,” although A has lower latency. Mixed currencies or other incompatible units have the same structural problem. Ties are not represented as shared extrema.

**Recommended change:** Require compatible units before comparison. Either normalize an explicitly supported set or preserve raw cell narration and omit the comparison. Represent ties and absent values explicitly. Keep raw and normalized quantities separately.

**Acceptance:** Mixed units never create unsupported rankings; ties are spoken accurately; unknown units use safe cell-level fallback.

### A09 — P1: Table summaries discard source information

**Evidence:** `extension/src/table/tableEngine.ts:156`; `extension/src/narrator/llmNarrator.ts:126`.

The deterministic fallback speaks a table introduction and min/max facts only. It omits intermediate values, nonnumeric cells, and single-row values. A probe with license values `MIT` and `Apache` lost both. The curated fixture's middle row can disappear from audio; all numeric cells are marked critical, but no completeness check requires their preservation. Numeric parsing is intentionally narrow and does not handle common grouped values or ranges.

**Recommended change:** Add a faithful row/cell rendering that always preserves otherwise omitted facts. Natural mode may introduce comparisons, but must retain required critical values; Literal mode should deterministically render all cells with headers. Preserve unparsed text instead of treating it as absent. Clarify the existing critical-fact policy rather than silently weakening it.

**Acceptance:** Nonnumeric, single-row, tied, mixed, and three-or-more-row tables remain understandable without the screen; every required critical fact is accounted for.

### A10 — P1: Parser drops text and loses nested structure

**Evidence:** `extension/src/parser/htmlParser.ts:74`, `:89`, `:169`.

Executed probes confirm that direct text nodes disappear, wrapped tables become unknown blocks, and a table containing inline `<code>` is misclassified as a code block. The broad descendant-code condition runs before table handling and extracts only the first code descendant. Lists flatten nested content into strings. Header-row exclusion also depends on whether a tbody exists, which requires coverage for browser-inserted tbody elements.

**Recommended change:** Traverse text and element nodes in document order. Unwrap presentation-only containers, preserve semantic blocks, and distinguish inline code from preformatted code. Handle tables before descendant-code heuristics. Avoid double-reading nested structures and exclude action/UI chrome.

**Acceptance:** Realistic nested fixtures preserve content, ordering, headers, inline identifiers, nested list meaning, and code whitespace without duplicate blocks.

### A11 — P1: Adapter can attach duplicate controls and mishandle completion

**Evidence:** `extension/src/adapter/chatgptAdapter.ts:4`, `:24`, `:51`, `:93`; `extension/entrypoints/content.ts:34`.

A probe with an article containing an assistant message matched both ancestors and descendants and received two Explain Aloud buttons. A page-global stop button makes every response appear streaming, including older completed answers. The observer scans the full document for every child mutation and ignores attribute-only streaming changes. Broad action-container selectors can select unrelated content containers.

**Recommended change:** Canonicalize one assistant response per turn; deduplicate before injection; determine completion per response; observe relevant added nodes and streaming attributes; batch scans; recheck completion at click time. Use a deliberate button mount that is excluded from extraction and tear down observers with the content-script lifecycle.

**Acceptance:** One control per answer, older answers remain usable while a new answer streams, regenerated content is handled correctly, and the injected label never becomes narrated source text.

### A12 — P1: Literal mode does not reliably mean literal

**Evidence:** `extension/src/narrator/llmNarrator.ts:46`; `extension/src/pipeline/pipeline.ts:66`; `extension/entrypoints/popup/App.tsx:111`.

Tables ignore the mode entirely. Literal code still goes through model rewriting, and the validator's punctuation rule has no mode input. Switching the UI mode does not invalidate an existing plan, so the selected mode can disagree with the audio being played.

**Recommended change:** Make Literal mode deterministic for code and tables, preserving identifiers and important syntax. Bind each plan to its response and mode; cancel/rebuild or clearly defer mode changes. Apply Natural-only validation rules only to Natural narration.

**Acceptance:** Switching modes changes the next plan consistently; Literal mode works without Ollama and retains all source values and identifiers.

### A13 — P1: TTS initialization and offline readiness are unproven

**Evidence:** `extension/src/services/tts.ts:3`; `extension/src/audio/audioQueue.ts:197`; `extension/src/kokoro.test.ts:1`.

The singleton caches only a completed instance. The queue starts next-segment synthesis before current-segment synthesis, so a cold start can launch two concurrent `from_pretrained` calls. The Kokoro test proves only that an import exists. Installed Transformers code defaults model downloads to Hugging Face and WASM paths to a CDN in this context; no application override was found. The build includes WASM, but that alone does not prove the runtime uses the packaged asset successfully under MV3 CSP.

**Recommended change:** Cache the initialization promise with retry after failure. Prioritize current audio and bound lookahead/concurrency. Explicitly configure packaged runtime assets and intentional model-download/cache behavior. Show loading progress and failure recovery. Measure responsiveness before deciding whether inference needs a dedicated worker.

**Acceptance:** One initialization under concurrent requests; actual speech in a production-loaded extension; cold installation succeeds; after provisioning, restarting with external networking disabled still produces speech. Inspect the network trace to verify response text never leaves loopback/device boundaries.

This is a runtime verification gap, not evidence that response text is currently uploaded. Model downloads and cloud processing are different operations.

### A14 — P1: Malformed model output and special entity text are not safely contained

**Evidence:** `extension/src/narrator/llmNarrator.ts:89` and `:195`; `extension/src/validator/segmentValidator.ts:86`.

JSON is parsed and cast to TypeScript interfaces without runtime schema enforcement. Empty text and wrongly typed fact IDs can pass mapping and fail later. Source entity strings are interpolated into regular expressions without escaping; an entity named `(` reproduced a validation exception, which can stop the full pipeline.

**Recommended change:** Enforce a small runtime schema for segment count, bounded nonempty text, ID arrays, and allowed fields; use supported Ollama schema output as an additional constraint. Schema output does not prove factual correctness. Escape dynamic regex terms or replace them with structured comparisons. Contain errors per block and fall back safely. These checks can be implemented without adding a dependency. See [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

**Acceptance:** Empty/wrong-shaped output, unexpected IDs, large responses, and punctuation-bearing entity names never crash narration or bypass the validation boundary.

### A15 — P1: UI and documentation overstate readiness

**Evidence:** `extension/entrypoints/popup/App.tsx:103`, `:172`; `BUILD_PROGRESS.md`; `docs/DEMO.md`; `README.md`.

An HTTP-successful `/api/tags` check is displayed as “Gemma 4 Ready,” without checking model presence. “Verified” is unconditional in the active segment card. Earlier LLM-error fallbacks can be counted as validator passes, making the fallback total misleading. Documentation claims completed M9, safe timeout fallback, live playback, full verification, and a side panel more strongly than the code supports. The demo comparison attributes specific speech behavior to native tools without recorded evidence. Its fixture button builds the plan but does not itself start audio.

**Recommended change:** Distinguish server connectivity, model availability, TTS readiness, preparing, speaking, and fallback states. Derive labels from actual results. Count generation and validation fallbacks explicitly. Revise progress status to “implemented / unit-tested / browser-verified / acceptance-passed” per milestone. Record the actual native comparison rather than assuming its wording. Reconcile final-demo CORS instructions with SETUP's exact-extension-origin guidance.

**Acceptance:** Status labels are truthful when Ollama is online with no requested model, when generation fails, and when validation falls back. Every completion claim links to a reproducible check.

## Acceptance assessment

| Contract | Current assessment |
|---|---|
| Five required block types on curated fixture | Automated pass |
| No content silently disappears | Fails targeted parser/table cases |
| No invented numbers/entities/causes or reversed comparisons | Fails targeted validator/table cases |
| No unsupported code behavior | Fails fallback and validator cases |
| Valid source/fact references for factual segments | Partial metadata present; integrity not enforced |
| Validation failure falls back safely | Fails for several block types |
| Play/pause/skip/cancel | Basic mocks pass; asynchronous sequences fail |
| Selected ChatGPT answer reaches speech | Integration missing |
| Natural/Literal | Partial and inconsistent |
| Local Kokoro voice end-to-end | Browser/audio acceptance unverified |
| No telemetry/cloud processing/all-URLs permission | Source/manifest support intent; runtime capture pending |
| Latency targets | Unmeasured; current full-plan wait and absent timeout are obstacles |
| Demonstrable native comparison | Script exists; reproducible recorded result missing |

## Recommended implementation order

1. **Restore truth and fallback integrity — A01–A03, A08, A14.** Remove invented fallback text, contain validation exceptions, reject unsupported references/claims, and prevent unsafe unit comparisons. Add acceptance tests that fail on the reproduced defects.
2. **Complete the selected-response flow — A04, A05, A11.** Wire the button to a persistent side-panel player, deduplicate turns, and verify the selected answer with a real browser.
3. **Make generation and playback interruptible — A06, A07, A13.** Add request/session tokens, deadlines, cancellation, single-flight TTS initialization, and production asset checks.
4. **Preserve the actual response in both modes — A09, A10, A12.** Repair parsing, table completeness, and deterministic Literal mode. Expand fixture diversity beyond the email example.
5. **Demonstrate and document acceptance — A15.** Record one real mixed-answer run, one rejected narration falling back, an offline-after-provisioning run, and the measured latency/control checks. Update completion claims only after those pass.

Use small changes with dedicated acceptance checks. Do not add providers, backend services, accounts, persistence, charts, equations, or other excluded features to address these issues.

## Enhancements within the existing MVP

These follow the required corrections; they are not prerequisites for starting repairs.

- Make “Explain selected response” the primary action and move fixture loading into a demo/debug area.
- Add a compact preparation indicator with Cancel available before audio starts; distinguish downloading, preparing narration, and synthesizing.
- Keep a concise user-facing fallback notice, with technical reasons and source/fact mappings in an expandable inspector.
- Add `aria-pressed` to mode controls, live announcements for status/errors, visible keyboard focus, and full keyboard control verification.
- Improve spoken fallback wording, pluralization, acronym handling, and sentence chunking without changing facts or adding a new narration mode.
- Remove full ResponseIR console logging from the normal content-script path; it is unnecessary exposure of response content in local diagnostics.
- Replace template title/icons/README and remove unused React/WXT assets and Firefox scripts if they imply unsupported release targets.
- Keep one canonical mixed fixture to avoid drift between the HTML fixture and duplicated TypeScript fixture.
- Strengthen `Block`/`Fact` types with discriminated structures; `BlockStructured | unknown` currently removes useful narrowing, and repeated `any` casts hide malformed states.

## Required test additions and manual release gate

Automated coverage should assert expected safe behavior, not simply nonempty output or `verified === true`. The 19 audit probes established bugs; permanent regression tests should reverse those unsafe expectations.

| Area | Minimum additional cases |
|---|---|
| Faithfulness | Wrong entity/value association, invented entity, spelled-out number, changed unit, causal addition, negation/qualifier changes, paraphrased reverse comparison |
| References | Missing/foreign block IDs, nonexistent fact IDs, cross-table contamination, missing critical coverage |
| Fallback | Unrelated code, each source block type, absent source, malformed JSON, empty text, wrong field types, validation exception |
| Tables/parser | Wrappers, inline code in table cells, direct text nodes, nested lists, implicit tbody, single row, text cells, missing values, ties, mixed units |
| Audio | Deferred synthesis, pause in a gap, skip while paused, rapid skips, stale work after cancel/new plan, rejection in lookahead, replay after completion |
| Integration | Initially closed player, older selected answer, duplicate selector matches, generation completing via attribute changes, mode changes, model absent |

Manual production-extension release gate:

1. Load the production build in Chrome; use a completed mixed ChatGPT answer and verify only the selected answer is processed.
2. Listen without looking at the screen; verify identifiers, numbers, conditions, table facts, and intelligibility in both modes.
3. Exercise pause/skip/cancel during preparation, synthesis, speech, and gaps; interact with the page while listening.
4. Stop Ollama, test a missing model, and simulate slow generation. Verify bounded, truthful fallback and visible recovery.
5. Provision Kokoro, restart, disable external networking, and repeat playback. Capture network destinations without persisting conversation contents.
6. Measure extraction (<150 ms), warm click-to-first-audio (target <=3 s), segment gap (target <=1 s), pause (<100 ms), and cancel (<150 ms). Record hardware, browser, model, cache state, and actual measurements.
7. Record the real native Read Aloud comparison and Explain Aloud fallback demonstration; avoid claiming unmeasured superiority.

## Community Wisdom

### [Keeping a browser video and a locally processed audio track in sync — and the 0.2s leak that broke it](https://dev.to/smsmy/keeping-a-browser-video-and-a-locally-processed-audio-track-in-sync-and-the-02s-leak-that-broke-26fe)

> **Source:** [smsmy](https://dev.to/smsmy)  
> **Tags:** `browser`, `javascript`, `performance`, `webdev`
>
> This first-person implementation report describes asynchronous media state producing audible errors and recommends isolating the transition logic for direct tests. Two substantive comments reinforce the asynchronous-state/testing lesson; no substantive rebuttal appeared in the retrieved thread. This is one relevant case study, not evidence of a broad community consensus or proof of this repository's behavior. Here, the repository's own executed race probes justify the audio-state recommendations.
>
> [Read Full Discussion](https://dev.to/smsmy/keeping-a-browser-video-and-a-locally-processed-audio-track-in-sync-and-the-02s-leak-that-broke-26fe)
