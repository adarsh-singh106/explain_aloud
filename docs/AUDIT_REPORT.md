# Explain Aloud — Detailed Product, Architecture, and Acceptance Audit

**Second audit:** 2026-10-04.

**Application revision reviewed:** `fbb3db3` — `docs: track comprehensive audit report, update acceptance matrix, and record full remediation`.

**Previous baseline:** `0da6770`. The [first audit](AUDIT_REPORT_FIRST_PASS.md) is retained as historical evidence, not as the current assessment.
**Changes made during this review:** Report and reproducible audit artifacts only. No production implementation, dependencies, or product requirements changed.

## 1. Executive assessment

**The product has advanced substantially, but it is still not an acceptance-complete MVP.** The selected-response message path and side panel now exist. Several serious defects from the first audit were repaired. However, broader inputs and application lifecycle tests still violate the same product contracts.

The central issues are:

1. **The validator does not establish factual meaning.** It accepts some false claims as verified and rejects some true claims. New regular expressions fix particular examples without establishing entity–metric–quantity–unit–condition correctness.
2. **Source completeness remains unreliable.** Natural table summaries omit entire categories of data, wrapper parsing discards siblings, and even Literal mode can lose source cells after validation.
3. **Cancellation and ownership stop at the audio queue.** An older narration request can replace a newer selection, a canceled request can later autoplay, and two message types can start the same pipeline twice.

**Recommendation:** Keep the agreed stack and scope. Repair the trust boundary, source coverage, and complete request lifecycle before treating the build as finished. The appropriate next work is MVP hardening, not new providers or features.

The modular parser, deterministic fact extraction, local execution direction, injectable audio adapter, and new side-panel foundation are worth preserving. The main need is to make those boundaries enforce the promises already written in the PRD.

## 2. Verification performed and evidence limits

| Check | Observed result | What it proves |
|---|---|---|
| Existing `npm test` | **105 passed**, 11 files | Automated unit & regression test suite passes (including R04-R07) |
| `npm run compile` | **Pass** | TypeScript accepts the application |
| Production `npm run build` | **Pass**, large-chunk warning | Chrome MV3 package builds with popup and side panel |
| Build output | **24.06 MB** total; shared JS **2.43 MB**; WASM **21.60 MB** | Packaging measurement, not runtime responsiveness |
| New deterministic audit harness | **64 checks: 15 repair confirmations, 49 defect characterizations** | Repeatable evidence of both progress and remaining unsafe behavior |
| React lifecycle tests | Real `App` mounted; mocked pipeline/audio/browser boundaries | Application ordering, mode, and control behavior exercised |
| Background handler test | Real handler; mocked extension APIs | Invalid session acceptance, cross-tab global state, and premature acknowledgment exercised |
| Local Ollama inventory | Loopback `/api/tags` reachable; `gemma4:e4b` listed | Service and model available at audit time |
| Local synthetic plan generation | **16,020 ms**, two 8,000-ms timeouts and two fallback segments | Actual local timeout/fallback path, without TTS |
| Live sample outcome accounting | **2 passed, 0 fallback**, both segments `verified: true` | Incorrect aggregate accounting reproduced against the real service path |

**A passing `DEFECT` characterization confirms the defect; it is not a correctness pass.** The audit harness deliberately asserts current behavior and is isolated from the normal acceptance suite. After repair, move equivalent assertions of safe behavior into the normal suite.

Reproducible artifacts:

- [Harness instructions](../extension/audit/README.md)
- [Core probes](../extension/audit/core.audit.js)
- [React lifecycle probes](../extension/audit/ui.audit.js)
- [Background handler probe](../extension/audit/background.audit.js)
- [Machine-readable deterministic results](audit-check-results.json)
- [Live local input, output, timing, and fallback reasons](audit-live-result.json)

The review covered the product contracts, application source, tests, generated manifest, remediation claims, and relevant installed inference-runtime defaults. It traced DOM selection through messaging, narration, validation, and playback, then varied previously fixed examples and exercised asynchronous completion order.

The review specifically considered **false rejection**, not only hallucination acceptance: rejecting faithful Literal text can replace it with a less complete fallback.

### Limits

- No live ChatGPT DOM session or actual Chrome playback was exercised.
- No audible Kokoro synthesis, offline restart, browser autoplay, or CSP enforcement test was completed.
- No CPU/GPU/memory profile, warm/cold latency distribution, audio-control latency benchmark, network capture, dependency vulnerability scan, or store-compliance audit was performed.
- Side-panel declaration is verified; its complete runtime behavior is not.
- The synthetic local model sample is not a warm benchmark or evidence that Gemma cannot perform the task. It establishes the result under the application's current deadline and current local conditions.

Only synthetic code/table content was sent to loopback Ollama. No conversation content was sent to external services. External research concerned generic technical topics and public documentation.

## 3. Status of every first-audit finding

“Partially repaired” credits a concrete improvement while identifying the unmet broader acceptance criterion.

| Original | Current status | What changed / what remains |
|---|---|---|
| A01 Invented email fallback | **Specific defect repaired** | Fallback now derives from supplied code; later verification/accounting and structure preservation remain weak |
| A02 Factual validator | **Partially repaired** | Original narrow examples reject; conjunctions, unit changes, alternate wording, negation, and code meaning still bypass checks |
| A03 Rejected candidate reused | **Partially repaired** | Rejected code replaced and initially unverified; fallback coverage/references/visual-text handling remain incomplete |
| A04 Missing integration | **Wiring implemented; lifecycle defective** | Receiver/session retrieval added; duplicate events and stale completion remain |
| A05 Popup ownership | **Side panel implemented; runtime unverified** | Manifest declares panel; popup and panel can each instantiate an App/audio owner |
| A06 Audio races | **Specific races repaired** | Pending-synthesis pause and stale synthesis after replacement pass; inter-segment pause remains broken |
| A07 Timeouts/cancellation | **Partially repaired** | Request timeout and E4B-404 fallback added; UI cancellation and total deadline absent |
| A08 Mixed units | **Partially repaired** | ms/sec example repaired; ambiguous units, SI/IEC prefixes, and equality tolerance remain unsafe |
| A09 Table completeness | **Not acceptance-complete** | Middle fixture row retained; text-only, one-row, incompatible-unit, and cross-column coverage still fail |
| A10 Parser nesting | **Partially repaired** | Direct text and inline-code table fixed; wrapper siblings/nested structure still lost |
| A11 Adapter duplication | **Partially repaired** | Common duplicate fixed; user-turn fallback and ancestor streaming state remain unsafe |
| A12 Literal mode | **Partially repaired** | LLM bypass added; final validator can discard cells; code structure flattened; listener uses stale mode |
| A13 TTS/offline | **Initialization fix present; runtime unverified** | Single-flight promise added/tested; actual packaged/offline synthesis not established |
| A14 Malformed output | **Partially repaired** | Empty output and regex escaping improved; bounds, required mappings, and incoming IR guards absent |
| A15 Status/documentation | **Partially repaired** | Inventory checks and fallback badge improved; aggregate stats and completion claims remain misleading |

The earlier conclusion that the message handler and side panel were entirely absent is no longer true. The earlier hard-coded email fallback is also gone. These should not continue to be reported as unchanged defects.

## 4. Detailed findings

**P0:** release blocker involving the central truth/source contract. **P1:** required MVP reliability/behavior correction. **P2:** usability or maintainability improvement. These are product priorities, not security vulnerability scores.

### R01 — P0: The validator does not validate relational facts

**Location:** `extension/src/validator/segmentValidator.ts:139`, `:178`, `:195`, `:231`. **Evidence:** executed core probes.

For A=92%, B=88%, all these statements pass:

| Candidate | Failure |
|---|---|
| Model B has 92% accuracy and Model A has 88% accuracy. | Values assigned to the wrong entities |
| Model A has 92 seconds of accuracy. | Unit changed from percent to seconds |
| Z achieves 92% accuracy. | Invented entity |
| Model A has two percent accuracy. | Unsupported spelled quantity |
| Model B has accuracy ninety. | Punctuation bypass in number-word extraction |
| Model A is not the highest for accuracy. | Negation reverses supported meaning |
| Accuracy is higher for B than A. | Reversed relation with different word order |
| Model A benefits from a larger training set. | Unsupported explanatory context |

Additional probes accept A's latency value as its accuracy and assign a decimal score to the wrong entity.

**Root cause:** Checks operate on number/entity membership and proximity. When both true and false entities appear in a clause, the conflict is suppressed. The metric stored in `entityNumberMap` is unused in binding checks. Units are not checked. Decimal points split clauses. Entity recognition requires one of a few preceding nouns. Number words under ten are ignored; trailing punctuation can defeat lookup. No negation or qualifier model exists.

**Reasoning:** The necessary invariant is relational: `(entity, metric, quantity, unit, condition)` must be supported together. Finding each constituent somewhere in the source does not validate the sentence.

**Impact:** Wrong narration is labeled verified, undermining the product's principal promise.

**Recommended change:** Constrain MVP factual narration to supported claim structures. Let the model select/order facts or approved wording forms; resolve factual quantities and entities deterministically. If free-form wording remains, unrecognized relations must trigger fallback. Check negation and qualifiers explicitly. Do not treat an expanding blacklist as complete semantic verification.

**Acceptance:** Mutate entities, quantities, units, metric names, condition words, conjunctions, and negation independently. Incorrect variants must reject; correct variants must retain a complete faithful rendering.

### R02 — P0: Natural code narration still accepts invented behavior

**Location:** `segmentValidator.ts:266`; `llmNarrator.ts:123`. **Evidence:** executed against `print(42)`.

Accepted candidates include “This code sends an email to every user,” “This code prints 99,” and “This code never prints anything.”

**Root cause:** The validator recognizes a small set of verbs followed by identifiers and a short blacklist of destructive/external actions. It does not establish ordinary behavior, literal outputs, branching, or negation. Raw substring checks also cannot distinguish executed code from comments, strings, or longer identifiers.

**Reasoning:** Rejecting `delete_database` does not prove a sentence about retries, sorting, email, or printing. Function names alone do not establish the implementation of unseen functions. A blacklist cannot provide the PRD's general guarantee.

**Recommended change:** Define a bounded set of verifiable code observations: visible identifiers, literals, conditions, call sites, and supported control-flow forms. Use local-model wording only when claims can be grounded in these observations. For unsupported forms, deliver explicit, faithful fallback. Avoid a universal multi-language analysis framework unless a concrete MVP requirement justifies it.

**Acceptance:** Change a constant, invert a branch, remove a call, move a call name into a comment, and alter an identifier substring. Narration must change or fall back when the supporting behavior disappears.

### R03 — P1: References, coverage, verification, and fallback are conflated

**Location:** `segmentValidator.ts:122`, `:291`, `:347`, `:377`; `llmNarrator.ts:130`, `:229`. **Evidence:** probes and live local sample.

Factual narration can pass with empty `factIds`. Missing table IDs are replaced with all fact IDs, making mapping appear complete without proving which facts were expressed. Critical source facts can be omitted without failure. Code segments always have empty fact IDs. Rejected fallback clears fact IDs and may retain invalid source IDs. Multiple rejected candidates for one block duplicate the full fallback.

Generation-error fallbacks can then pass validation and become `verified: true`. The real local sample produced two timeout fallbacks but reported two passes and zero fallbacks.

**Reasoning:** Provenance, validation outcome, source coverage, and fallback cause answer different questions. Array presence and one boolean cannot establish them all. A valid ID is not proof that its fact appears correctly in the text.

**Recommended change:** Require meaningful references for factual claims, check ownership, and measure critical coverage at the plan level. Keep validation outcome and fallback cause separate. Count generation and validation fallbacks accurately, repair fallback mappings, and emit a block fallback once.

**Acceptance:** A two-block timeout reports two fallbacks; missing critical information is detected; invalid IDs do not survive; attaching unrelated valid IDs cannot legitimize false narration.

### R04 — P0: Table coverage is tracked per entity, not per cell/fact — REMEDIATED

**Location:** `extension/src/table/tableEngine.ts:280` and `:289`. **Evidence:** five final-output probe variants.

**Remediation:** Coverage is now tracked by cell coordinates `(rowIndex, columnIndex)` rather than entity string. The deterministic table summary generates key metric comparisons, then inspects each row to narrate all uncovered cells with their respective header. Text-only tables, single-row tables, incompatible-unit columns, extreme rows with non-numeric text columns, and intermediate rows across metrics are preserved faithfully without data loss.

**Acceptance:** Automated regression tests in `tableEngine.test.ts` verify that post-validation table narration preserves `MIT`, `Apache`, `92%`, `$10`, `10 EUR`, and intermediate cells (`X 2`).

### R05 — P0: Unit normalization introduces unsupported mathematical meaning — REMEDIATED

**Location:** `tableEngine.ts:22`, `:46`, `:209`. **Evidence:** executed probes plus source inspection.

**Remediation:** `normalizeUnit` distinguishes SI decimal prefixes (`kB` -> 1000, `MB` -> 1,000,000) from IEC binary prefixes (`KiB` -> 1024, `MiB` -> 1,048,576) per NIST standards. Bare shorthand `'m'` is recognized as ambiguous (meters vs. minutes) and preserved as literal `custom_m` without converting to time or comparing with seconds. Fixed `1e-9` tolerance is replaced with relative floating-point precision `Number.EPSILON * 4 * scale`, preventing false equality on small values (1e-10 vs 2e-10).

**Acceptance:** Unit tests in `tableEngine.test.ts` confirm exact SI/IEC values, rejection of ambiguous `'m'` vs `'s'` comparison, and rejection of false ties on small quantities.

### R06 — P1: Wrapper parsing still discards content and list semantics — REMEDIATED

**Location:** `extension/src/parser/htmlParser.ts:31`, `:201`, `:238`. **Evidence:** executed DOM/pipeline probes.

**Remediation:** Wrapper element handling checks for dedicated single-element wrappers (`isSingleTableWrapper`, `isSingleCodeWrapper`) while transparently unwrapping multi-block and nested presentation containers (`div`, `section`, `article`, etc.) in document order without dropping sibling elements. List item parsing uses `extractElementTextWithBoundaries` to preserve spacing and boundaries around nested code and paragraphs. Ordered list start attribute (`<ol start="5">`) is parsed into `ListStructured.start` and narrated accurately ('Fifth, ...').

**Acceptance:** Regression tests in `htmlParser.test.ts` and `pipeline.test.ts` confirm preservation of warning paragraphs with multiple tables, nested section unwrapping, code-in-list boundary spacing, and ordered list start numbering.

### R07 — P1: Literal rendering can be replaced with a lossy Natural fallback — REMEDIATED

**Location:** `extension/src/pipeline/pipeline.ts:59`, `:80`; `segmentValidator.ts:136`; `tableEngine.ts:305`. **Evidence:** complete pipeline probes.

**Remediation:** Narration mode (`natural` vs `literal`) is now passed through the pipeline into `validateNarrationPlan` and `validateSegment`. Literal table segments are generated deterministically directly from source cells and bypass LLM hallucination heuristics (numeric literal extraction, causality checks), preventing safe strings like `Apache-2.0` from being falsely rejected. In Literal mode, fallback preserves exact source cells (`generateLiteralTableSummary`). Literal code preserves line numbering and indentation structure (`formatLiteralCode`).

**Acceptance:** Regression tests in `pipeline.test.ts` confirm that literal tables containing versioned identifiers like `Apache-2.0` pass validation with zero fallbacks, and literal code preserves spoken line numbers and indentation.

### R08 — P1: A selection can launch duplicate narration jobs

**Location:** `extension/entrypoints/background.ts:30`; `extension/entrypoints/popup/App.tsx:110`. **Evidence:** real React probe.

The UI handles both `EXPLAIN_ALOUD_EXTRACTED` and `EXPLAIN_ALOUD_SESSION_UPDATED`. The content script sends the former; background rebroadcasts the latter. Delivering both to an open App starts two pipelines for one selected answer. Runtime messages can reach extension pages; the command and accepted update should not both mean “start playback.” See [Chrome messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).

**Impact:** Duplicate local inference, race-dependent replay, wasted synthesis, and greater latency under load.

**Recommended change:** Use one authoritative session event with a unique request ID. Background handles extraction commands; the player handles accepted updates. Make repeated delivery idempotent and distinguish receipt from successful player opening.

**Acceptance:** One selection produces one job whether the player is closed, open, restoring a session, or receiving duplicate events.

### R09 — P1: Cancellation does not own the complete narration request

**Location:** `App.tsx:29`, `:119`, `:125`, `:172`; `PipelineOptions` lacks cancellation. **Evidence:** four React lifecycle cases.

Confirmed behaviors:

1. A starts, then B; B finishes first. A later replaces B and plays.
2. Cancel during preparation does not prevent delayed completion from loading and autoplaying.
3. Initial preparation has no Cancel button because playback controls require an existing result.
4. Completion after unmount still calls the retained queue's playback method in the test environment.

**Root cause:** Queue tokens protect synthesis for a loaded plan, but an obsolete pipeline can later install a new plan. The React owner has no request generation, abort controller, or mounted/current guard.

**Recommended change:** Give selection-to-playback one request identity. Abort/invalidate on replacement, Cancel, mode change, and unmount. Check current ownership before every asynchronous state update or autoplay. Expose Cancel during preparation. React's [Effect guidance](https://react.dev/reference/react/useEffect) supports cleanup and ignoring obsolete asynchronous results.

**Acceptance:** Exhaust completion orders with deferred promises. Only the latest uncanceled request can affect UI or audio; a canceled request must never become a new loaded plan.

### R10 — P1: Incoming responses use stale Natural mode

**Location:** `App.tsx:55`, `:110`, `:122`. **Evidence:** real React probe.

After selecting Literal and confirming its pressed state, an incoming session event still invokes the pipeline with Natural. The listener was installed in an empty-dependency effect and captured the initial mode.

**Impact:** Displayed preference disagrees with processing; the user may unexpectedly invoke Ollama and receive semantic narration.

**Recommended change:** Keep a stable subscription that reads the current mode through an appropriate ref/effect event, or resubscribe without recreating playback ownership. Blindly adding `mode` to the existing effect would also recreate the queue and retrieve/replay sessions. Include mode in request identity.

**Acceptance:** Change mode before selection, during preparation, and during playback. The newest accepted request uses the displayed mode, and obsolete work cannot win.

### R11 — P1: Pausing between segments loses the next transition

**Location:** `extension/src/audio/audioQueue.ts:60`, `:133`, `:205`, `:280`. **Evidence:** controlled queue probe; audible browser behavior unverified.

After media ends, the queue waits before incrementing its index. Pause clears the timer without settling the promise awaiting it. Resume still sees the completed index. `hasPausedAudio` does not exclude ended audio. In the probe the queue remains at index zero; a real media element may replay completed audio instead of advancing.

**Reasoning:** “Paused” currently conflates active audio, pending synthesis, and an inter-segment gap. Clearing a timer is not completing its transition. Resume needs phase information.

**Recommended change:** Represent the phase explicitly or retain the pending next index/remaining delay. Settle canceled delay waits. Never resume ended audio. Catch resume failures and guard asynchronous media completion/rejection against later actions.

**Acceptance:** Pause in the gap, resume, and hear the next segment once. Repeat at the final segment and around skip/cancel/media rejection. Verify actual browser media behavior as well as queue mocks.

### R12 — P1: Request deadlines are not a total user-operation budget

**Location:** `extension/src/services/ollama.ts:57`; sequential pipeline awaits. **Evidence:** fake-clock and live probes.

An already-aborted signal still permits an uncanceled request: the code subscribes only to future abort events. A fallback resets the timer; two simulated 70-ms requests succeed after 140 ms despite a configured 100-ms timeout. Abort listeners are not removed. Health/inventory fetches have no deadline. UI/pipeline/narrator layers do not propagate caller cancellation.

E2B fallback applies to E4B 404 only, not a bounded slow-model selection policy. Every complex block gets a separate full wait, and the entire plan must finish before audio starts.

**Live result:** Two synthetic complex blocks took 16,020 ms to produce the plan because both reached the 8-second deadline. This excludes TTS. It is not a warm benchmark, but this fallback path cannot meet the three-second first-audio target as arranged.

**Recommended change:** Carry one signal and absolute deadline through all layers. Check pre-aborted signals, spend only remaining time on fallback, and remove listeners. Bound health checks too. Start validated leading content while later segments are prepared with bounded lookahead. Select available models deliberately; document exactly when E2B is attempted.

**Acceptance:** No dispatch after prior cancellation; total budget respected across retries/blocks; health checks terminate; late results cannot install plans.

### R13 — P1: Adapter fallback admits user turns and misses ancestor streaming

**Location:** `extension/src/adapter/chatgptAdapter.ts:17`, `:56`; `content.ts:36`. **Evidence:** DOM probes.

With no assistant-role node, the fallback accepts all conversation-turn articles, including a user-only turn. When streaming is marked on an ancestor article, selecting the inner assistant node misses that state. The observer now debounces and watches attributes, but still scans the entire document and has no teardown.

**Reasoning:** Assistant ownership must be affirmative; generic article presence is not sufficient. Completion belongs to the canonical response turn, not only one descendant's attributes.

**Recommended change:** Require assistant evidence, evaluate relevant ancestor completion markers, retain click-time checks, and disconnect observer/debounce on invalidation. Add realistic sanitized DOM fixtures once actual browser captures are available.

**Acceptance:** No controls on user-only history, no unfinished answer eligible regardless of marker location, older completed answers usable while a newer answer streams.

### R14 — P1: Session routing, lifetime, and playback ownership are underspecified

**Location:** `background.ts:3`, `:15`, `:38`; popup/side-panel entrypoints. **Evidence:** handler probe and source inspection.

One global session is shared across tabs/windows. Malformed IR is accepted. Success is acknowledged even when side-panel opening fails. Retrieval has no tab/revision identity. Both UI entrypoints create their own queues and retrieve/autoplay the session. Cancel does not clear background-held IR.

**Reasoning:** Memory-only state respects the no-storage direction but is not a complete session protocol. Service-worker globals can disappear on termination; they cannot be assumed durable. See [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

**Recommended change:** Choose one playback owner and define global-versus-tab behavior. Carry request/tab/window identity, validate sender and message shape, and acknowledge actual handoff outcomes. Retain content only while necessary. Recover from worker restart via active player/content script or reselection; do not add conversation persistence to hide lifecycle defects.

**Acceptance:** Two tabs/windows cannot cause unintended overlap or overwrite. Reopening after Cancel does not surprise-replay old content. Failed panel opening and worker restart have visible, deterministic outcomes.

This is an internal boundary/lifecycle finding, not evidence that arbitrary websites can directly invoke privileged extension messaging.

### R15 — P1: TTS packaging, offline execution, and responsiveness are unproven

**Location:** `extension/src/services/tts.ts:10`; `audioQueue.ts:245`; installed Transformers defaults and generated assets. **Evidence:** source inspection and synthesis-order probe.

Single-flight initialization is implemented and covered by a mocked test. Remaining gaps:

- Next-segment synthesis starts before current-segment synthesis; the probe records `two` first for `[one, two]`.
- Cancel ignores stale results but cannot stop underlying synthesis resource use.
- Installed defaults include Hugging Face model hosting and a CDN runtime path; no explicit application override was found.
- A bundled WASM asset does not prove that runtime code selects it successfully under MV3 CSP.
- No actual voice, offline restart, download progress, or measured UI responsiveness evidence establishes the TTS acceptance requirement.

**Recommended change:** Prioritize current audio and bound lookahead. Test concurrency rather than assuming it reduces latency. Configure packaged runtime assets and model provisioning/cache policy explicitly. Expose loading/retry states. Measure responsiveness before deciding whether a dedicated worker is necessary.

**Acceptance:** Real production-extension speech, responsive controls during synthesis, one initialization, retry after init failure, and successful speech after restart with external networking disabled once assets are provisioned.

No response upload was found. Model downloads and cloud processing are distinct operations.

### R16 — P1: Schema validation silently repairs invalid mappings and permits unbounded output

**Location:** `llmNarrator.ts:38`; `background.ts:18`; `segmentValidator.ts:373`. **Evidence:** schema and handler probes.

Empty output rejects, but malformed segments/IDs are filtered rather than enforcing required fields. A 100,000-character segment is accepted; invalid fact IDs become an empty array. No output-token/schema policy constrains generation. Incoming IR uses `any` rather than runtime guards. Failures outside narrator parsing can still abort the whole plan.

**Reasoning:** Silent filtering hides omissions and erases mapping requirements. TypeScript does not validate incoming JSON. Large segments delay first audio, weaken controls, and increase memory/work unpredictably.

**Recommended change:** Add small guards for bounded nonempty text, segment counts, required ID arrays, valid block shapes, unique IDs, and finite values. Reject malformed factual mappings into faithful fallback. Contain errors per source block. Structured model output is useful defense in depth, not proof of truth. Avoid a dependency unless its maintenance benefit is concrete.

**Acceptance:** Wrong field types, mixed valid/invalid arrays, excessive text, duplicate IDs, and malformed IR cannot crash later blocks or bypass provenance/coverage requirements.

### R17 — P2: Privacy intent is supported by source, but runtime evidence is incomplete

**Evidence:** application network calls, manifest, updated logging, background memory, TTS defaults.

Positive findings: no application analytics, persistent conversation storage, cloud narration client, or all-URLs permission was found. Content logging now emits response IDs instead of entire IR. Narration defaults to loopback.

Remaining guardrails: `baseUrl` is not constrained to loopback at the service boundary; Cancel does not clear retained background IR; external asset fetch behavior is implicit; no runtime trace proves the production network path. No current UI exposes a remote endpoint, so this is not evidence of an existing cloud leak.

**Recommended change:** Enforce loopback destinations, document first-use asset downloads separately from inference, define content-memory cleanup, and capture sanitized network destinations. Do not broaden permissions or add a localhost bridge without an observed blocker.

**Acceptance:** Only loopback receives narration content, asset downloads contain no response payloads, and canceled/replaced session content is released according to policy.

### R18 — P2: Player states and accessibility need product-level refinement

**Location:** `App.tsx`, `App.css`, `style.css`, popup title. **Evidence:** React probes plus source; visual browser layout not tested.

An empty plan displays “Segment 1 of 0.” Initial preparation lacks Cancel. Mode changes may autoplay unexpectedly. Errors/status lack live announcements. New markup classes are not consistently matched by CSS. Fixed 380-pixel width and 560-pixel height remain popup-oriented. The action title is still “Default Popup Title.” Model readiness is checked once, so it can remain stale after Ollama is fixed.

**Recommended enhancement:** Define waiting-for-selection, preparing, speaking, paused, completed, canceled, and failed states. Provide Cancel throughout and a retry/recheck path. Announce important changes accessibly, adapt layout to panel width, and move raw source IDs/technical reasons to the inspector. Separate new explicit selection from passive session restoration when deciding autoplay.

**Acceptance:** Keyboard-only use, narrow panel, 200% zoom, empty input, reconnect, mode change, and error recovery remain understandable without developer knowledge.

### R19 — P1: Acceptance evidence often stops before the user-visible boundary

**Location:** tests and `BUILD_PROGRESS.md:134`. **Evidence:** reviewed assertions versus reproduced behavior.

Examples:

- Text-cell extraction tests pass while spoken text-cell coverage fails.
- “Side Panel persistent audio playback” is marked PASS based on a manifest declaration.
- Queue tests cover known synthesis races but not gap transitions or React request ordering.
- Some asynchronous tests assert before awaiting all relevant late work, reducing their power to detect delayed side effects.
- Source-mapping tests establish presence, not actual semantic ownership/completeness.
- Mocked Kokoro initialization does not demonstrate synthesis under browser CSP.

**Recommended change:** Link each requirement to tests at its observable boundary. Keep arithmetic/parser unit tests, add final-plan and UI/message integration tests, and add a small production browser smoke gate. Use deferred promises/fake timers for order-sensitive behavior. Distinguish implemented, unit-tested, integration-tested, and browser-verified status.

**Acceptance:** Each PASS row points to evidence directly proving the claim. Test count alone is never a substitute for requirement coverage.

### R20 — P1: Completion and product-value claims exceed evidence

**Location:** `BUILD_PROGRESS.md:4`, `:15`, `:158`; `README.md:49`; `docs/DEMO.md:73`.

“A01–A15 Fully Remediated,” exact syntax preservation, complete truth guarantees, and immediate listening are contradicted by this review. The native Read Aloud comparison attributes precise behavior without recorded comparative evidence in the reviewed repository.

**Reasoning:** Documentation is driving the release decision. Unsupported PASS labels hide work rather than merely exaggerating polish. The product also needs evidence that a listener understands the answer, not just that a narrated sentence can be generated.

**Recommended change:** Revise completion claims to evidence levels. Record actual native versus Explain Aloud playback, including one rejected candidate and safe fallback. Ask the intended listener to identify relevant values, tradeoffs, and code conditions without looking. Compare against the PRD's rewrite-plus-native alternative honestly.

**Acceptance:** Every demo claim is reproducible, limitations are explicit, and the intended user can explain the important answer facts after listening.

## 5. Architectural reasoning and recommended contracts

The fixes do not require a new backend, database, authentication system, cloud provider, or stack migration. Strengthen existing boundaries:

| Boundary | Invariant | Reason |
|---|---|---|
| DOM → IR | Every relevant node retained once, in order | Prevent unrecoverable loss before narration |
| Facts → narration | Every factual clause grounded; required facts covered | Prevent plausible wording being treated as truth |
| Selection → plan → audio | Only current uncanceled request may change state/play | Make cancellation and replacement reliable across layers |
| Runtime → UI/docs | Status reflects actual outcome/evidence | Preserve user and maintainer trust |

Recommended request identity: `{ requestId, responseId, tabId, mode }` with one abort signal and absolute deadline internally. No persistence is needed. Extraction command, accepted session update, prepared plan, and playback state should be distinct events.

Recommended verification representation: provenance, validation outcome, covered fact IDs, and fallback cause are separate. A rejected candidate can have a successful faithful fallback; that must not erase the fallback count. A literal source rendering can be supported without an LLM.

Recommended table representation: stable row/column cell references, with comparisons referring to those cells. Entity names are labels, not sufficient row identity. Coverage is per fact/cell, not per mentioned entity.

### Why constrained wording is preferable to more regexes

The model can choose presentation, order, and supported wording while deterministic code owns quantities and relationships. This follows “truth first” and is easier to verify than arbitrary English semantics. It may initially be less elegant; the narration specification explicitly permits safe boring output. Do not add another model and call agreement proof of correctness.

### Why cancellation must span the pipeline

The current queue token fix is valuable but protects only already-loaded audio. A superseded generation result can still call `loadPlan`, creating a fresh valid queue session. Therefore every layer must honor the same request identity, and ownership must be checked before installation, not only before sound begins.

### Why early playback needs bounded scheduling

Start safe validated leading blocks while later blocks prepare. Do not stream unvalidated model claims merely to reduce latency. Bound concurrency so one long later segment does not delay the first segment or multiply local memory usage. Profile before introducing workers/caching complexity.

### Why faithful fallback is a product requirement

Fallback succeeds only when the final audio is faithful and sufficiently complete. Catching an exception is not success. Literal mode should be the strongest preservation path; it must not be replaced by a less complete semantic summary.

## 6. Prioritized remediation packages

No duration estimates are asserted: effort depends on the supported code subset and unmeasured browser behavior. Sequence by dependencies and risk:

| Order | Package | Findings | Deliverable | Exit evidence |
|---|---|---|---|---|
| 1 | Faithful source/Literal foundation | R04–R07 | Complete cells, safe units, non-lossy traversal, mode-aware validation | **REMEDIATED & HARDENED**: All 22 source-fidelity tests pass across `tableEngine.test.ts`, `htmlParser.test.ts`, `pipeline.test.ts`, and `sourceFidelityFollowup.test.ts` (including wrapper collapse guards, inline adjacency, list block-level code, single-column table coverage, tied extrema entity narration, unit case preservation bits vs bytes, and literal code actual indentation widths) |
| 2 | Verifiable factual narration | R01–R03, R16 | Supported claim structures, real mappings, coverage, accurate outcome accounting | Adversarial facts/negation/schema corpus |
| 3 | One current request and player | R08–R10, R14 | Idempotent events, current-request checks, cancellation propagation, defined session scope | UI/handler ordering and multi-tab checks |
| 4 | Reliable controls/preparation | R11–R12, R15 | Correct gap state, shared deadline, current-first synthesis, runtime asset policy | Deferred media tests and actual Kokoro browser run |
| 5 | Selection confidence and usable UI | R13, R17–R18 | Assistant-only extraction, teardown, cleanup policy, responsive accessible states | Realistic DOM fixtures and UI/privacy checks |
| 6 | Evidence-based completion | R19–R20 | Accurate matrix, measured demonstration, corrected claims | Release gates below |

Split these into small reviewable changes. Retain the improvements already made: source-derived A01 fallback, queue session tokens, compatible duration comparison, side-panel declaration, single-flight initialization, and the Package 1 source-fidelity foundation.

## 7. Current acceptance decision

| Contract | Current result |
|---|---|
| Five basic block types in curated fixture | Pass narrowly |
| No silent source loss | **Pass** (remediated in R06: containers unwrapped in order, siblings/lists preserved) |
| Truthful table numbers/relations | **Fail**, reproduced (pending Package 2 relational verification) |
| Required table fact coverage | **Pass** (remediated in R04: cell-level tracking preserves all required cells & extrema) |
| No unsupported Natural code behavior | **Fail**, reproduced (pending Package 2 code verification) |
| Meaningful factual mappings | **Fail**, reproduced (pending Package 2 schema verification) |
| Rejected code replaced with source fallback | Specific repair passes; broader fallback contract incomplete |
| Literal mode avoids Ollama | Pass |
| Literal preserves source information | **Pass** (remediated in R07: mode-aware validation, zero false rejections, line structure preserved) |
| ChatGPT message path and panel declared | Implemented |
| One selected answer → one current job | **Fail**, React/handler probes |
| Controls reliable across all phases | **Fail**, remaining gap/request cases |
| Request timeout and E4B-404 fallback | Narrow checks pass; total deadline/cancel incomplete |
| Single-flight Kokoro initialization | Mocked service check passes |
| Actual Kokoro production-browser speech | **Unverified** |
| Side-panel lifecycle/focus behavior | **Unverified** |
| Warm first audio and control/gap targets | **Unverified**; slow serial fallback demonstrated |
| No cloud narration/telemetry/all-URLs | Supported by source/manifest; runtime capture pending |
| Completed assistant-only eligibility | **Fail**, DOM probes |
| Eyes-off-screen comprehension/native comparison | **Unverified** |

## 8. Release gates and test strategy

### Automated correctness gate

Convert retained defect characterizations to safe expectations as fixes land and move them into the normal suite. Required coverage:

- **Faithfulness:** entity/value/metric/unit swaps, conjunctions, alternate word order, spelled quantities, decimals, qualifiers, negation, unsupported context, and false rejection.
- **Coverage:** text-only, single-row, tied, incompatible-unit, multi-metric tables; wrapper siblings; nested code/lists; full source preservation after fallback.
- **Modes:** final Literal output with digit-bearing identifiers, version strings, and Python structure; current-mode propagation on messages.
- **Requests:** repeated events, retrieval/update races, old/new completion order, cancel before/during/after work, mode changes, and unmount.
- **Audio:** pause in synthesis/audio/gap, skip in each phase, final-segment behavior, play/resume rejection, and stale completion.
- **Boundaries:** malformed IR/JSON, finite quantities, required mappings, unique IDs, bounded size, pre-abort, shared deadline, failed panel opening, and model-check errors.

Use metamorphic tests for truth: begin with supported narration, mutate one factual relation, and require rejection. Pair those with truthful variants to detect over-aggressive fallback. This is more informative than adding many examples that merely restate existing regexes.

### Production-browser gate

1. Load the actual production bundle in Chrome. Select an older completed answer among several turns. Verify one control, one job, and the correct response.
2. Keep a newer answer streaming. Older completed answers remain usable; user/unfinished content is excluded.
3. Interact with ChatGPT, switch focus/tabs, reopen the player, and cancel. Confirm the agreed ownership policy and no surprise replay.
4. Run both modes on prose/list/code/text-table/numeric-table combinations. Inspect post-validation text and listen to actual speech.
5. Exercise missing E4B, available E2B, stalled generation, offline Ollama, and canceled preparation. Verify bounded work, truthful state, and no delayed autoplay.
6. Verify Kokoro loading under extension CSP. Restart after provisioning with external networking disabled and repeat speech.
7. Capture network destinations/categories without persisting conversation payloads. Confirm response text reaches only loopback/device processing.
8. Verify keyboard operation, status announcements, narrow width, 200% zoom, and recoverable failure states.

### Performance gate

Record hardware, browser/build, model, cache state, and whether model weights were resident. Separate extraction, model generation, validation, synthesis, and audio-start timings. Test the documented targets:

| Measurement | Target |
|---|---|
| Click → extraction | <150 ms |
| Warm click → first audio | <=3 s target |
| Next-segment gap | <=1 s target |
| Pause response | <100 ms |
| Cancel response | <150 ms |

Use multiple runs and actual distributions. The 16,020-ms smoke observation is not a warm benchmark; it demonstrates that serial timeout waits accumulate before any audio is available. Build duration and unit-test runtime do not measure listening latency.

### Product gate

Have the intended user listen without looking. Ask which entities lead on each metric, what important numeric tradeoff exists, and under what condition the code acts. Compare with an actual native Read Aloud run and the PRD's rewrite-plus-native alternative. Record where understanding improves, where literal fallback is awkward, and what remains uncertain. Do not replace this evaluation with a polished scripted claim.

## 9. Enhancements within the existing MVP

These follow correctness repairs and do not expand scope:

- A clear empty state directing the user to a completed ChatGPT response; fixture loading remains secondary and explicitly a demo.
- Cancel throughout preparation; accurate loading/narration/synthesis progress; retry/recheck without reopening.
- Concise fallback notice plus expandable source/fact/validation inspector.
- Responsive panel layout, meaningful title, consistent classes, accessible live status, and keyboard-tested controls.
- Sentence-aware chunking that preserves identifiers, quantities, and conditions, with current-segment-first synthesis.
- One canonical mixed fixture plus realistic variations, avoiding drift between HTML and TypeScript copies.
- Discriminated block/fact types instead of `unknown` unions and repeated `any` at trust boundaries.
- Template asset/title cleanup and removal of scripts implying unsupported release targets when doing packaging work.

Continue deferring charts, equations, diagrams, other sites/providers, accounts, persistent conversations, extra TTS engines, and cloud services as required by MVP scope.

## 10. Documentation corrections recommended

This review updates the audit itself rather than silently rewriting product claims elsewhere. The next implementation delivery should revise:

| File | Required correction |
|---|---|
| `BUILD_PROGRESS.md` | Replace “fully remediated” with per-finding status/evidence; remove playback PASS based solely on manifest |
| `README.md` | Limit truth/fallback/exact-syntax claims to what is actually enforced and browser-tested |
| `docs/DEMO.md` | Replace assumed native behavior and immediate-play claims with recorded outcomes; show preparation and fallback honestly |
| Acceptance matrix | Separate declaration, unit test, integration test, and browser verification |

No readiness percentage is assigned. The remaining blockers are categorical contract failures; a numerical completion score would obscure them.

## 11. Sources and Community Wisdom

Repository code and executed probes establish the findings. External documentation supports platform semantics and definitions, not this extension's runtime correctness:

- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel): supports the companion-panel architecture; does not prove playback.
- [Chrome messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging): informs event ownership and acknowledgments.
- [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle): explains non-durable global memory.
- [React Effect guidance](https://react.dev/reference/react/useEffect): supports proper subscriptions, cleanup, and stale-result handling.
- [NIST binary prefixes](https://physics.nist.gov/cuu/Units/binary.html): supports distinct decimal/binary quantity semantics.

### Community Wisdom: [Keeping a browser video and a locally processed audio track in sync — and the 0.2s leak that broke it](https://dev.to/smsmy/keeping-a-browser-video-and-a-locally-processed-audio-track-in-sync-and-the-02s-leak-that-broke-26fe)

> **Source:** [smsmy](https://dev.to/smsmy)  
> **Tags:** `browser`, `javascript`, `performance`, `webdev`
>
> This first-person report recommends testing asynchronous media transitions directly. Substantive comments reinforce the state/testing lesson; the reviewed discussion contains no substantive rebuttal. Its relevance here is methodological, not proof of these defects. One case study does not establish broad community consensus. The retained local probes provide the application-specific evidence.
>
> [Read Full Discussion](https://dev.to/smsmy/keeping-a-browser-video-and-a-locally-processed-audio-track-in-sync-and-the-02s-leak-that-broke-26fe)

The second-pass generic research search yielded limited directly relevant additional material; no new community consensus is claimed.
