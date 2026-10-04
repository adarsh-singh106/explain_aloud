# Explain Aloud — Hackathon Demo & Acceptance Guide

> *"Don't read the screen to me. Explain it to me."*

---

## 1. The Core Demo Comparison

### Target Content: `fixtures/mixed-response.html`

```html
<h2>Choosing a model</h2>
<p>Suppose we need to choose between accuracy and latency for a small API.</p>
<ul>
  <li>Accuracy matters for final predictions.</li>
  <li>Latency matters for interactive use.</li>
  <li>The best choice depends on the product constraint.</li>
</ul>
<pre><code class="language-python">for user in users:
    if user.active:
        send_email(user)</code></pre>
<table>
  <thead><tr><th>Model</th><th>Accuracy</th><th>Latency</th></tr></thead>
  <tbody>
    <tr><td>A</td><td>92%</td><td>4 sec</td></tr>
    <tr><td>B</td><td>88%</td><td>1 sec</td></tr>
    <tr><td>C</td><td>90%</td><td>2 sec</td></tr>
  </tbody>
</table>
<p>For an interactive product, the tradeoff between speed and accuracy should be explicit.</p>
```

---

## 2. Side-by-Side Comparison

| Section | Standard Browser / ChatGPT Read Aloud | Explain Aloud (Structure-Aware) |
| :--- | :--- | :--- |
| **Heading** | "Heading two: Choosing a model." | *"Choosing a model."* (Opening) / *"Next, choosing a model."* (Transition) |
| **Prose** | Pronounces text verbatim, including visual artifacts like "as shown below". | Direct spoken prose with all visual-only artifacts (*"as shown above/below"*) scrubbed. |
| **List** | "Bullet. Accuracy matters for final predictions. Bullet. Latency matters..." | Natural group pacing: *"Accuracy matters for final predictions. Latency matters for interactive use. Finally, the best choice depends on the product constraint."* |
| **Code** | "for user in users colon newline if user dot active colon newline send underscore email open paren user close paren" | **Natural Mode**: *"This Python snippet iterates through each user and sends an email if the user is currently active."*<br>**Literal Mode**: *"Code snippet in python: for user in users: if user.active: send_email(user)"* (100% deterministic, offline) |
| **Table** | Cell-by-cell robotic read: "Table with 3 rows. Model, Accuracy, Latency. A, 92 percent, 4 sec. B, 88 percent, 1 sec. C, 90 percent, 2 sec." | **Deterministic Semantic Narration**: *"The table compares 3 models across Accuracy and Latency. For accuracy, Model A is highest at 92%, while Model B is lowest at 88%. For latency, Model A has the highest latency at 4 sec, while Model B is lowest at 1 sec. Model C has Accuracy 90%, Latency 2 sec."* (Zero dropped rows) |
| **Safety & Truth** | If an LLM hallucinates an invalid metric (e.g. 99%) or invents behavior, standard tools read the hallucination. | **Strict Validator & Fallback**: Catches unsupported numbers, reversed comparisons, entity misattributions, or ungrounded code claims, and produces a source-derived fallback without interrupting playback. |

---

## 3. How to Run the Demo in Chrome / Edge

### Step 1: Start Ollama (Local LLM)
Ensure Ollama is running with CORS enabled for browser extensions:
```powershell
$env:OLLAMA_ORIGINS="chrome-extension://*"
ollama serve
```
Model used: `gemma4:e4b` (with automatic fallback to `gemma4:e2b`).

### Step 2: Build the Extension
```powershell
cd extension
npm run compile
npm run build
```

### Step 3: Load the Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `.output/chrome-mv3` folder inside `explain_aloud/extension/`.

### Step 4: Run the Demo in Popup or Persistent Side Panel
1. Click the **Explain Aloud** icon in the Chrome toolbar.
2. The player opens in a dedicated Side Panel alongside the browser page (or popup).
3. Observe the live truthful status badge (e.g. `Gemma 4 (E4B) Ready`).
4. Select **Natural Mode** or **Literal Mode**.
5. Click **Demo: Load Mixed Response Fixture**.
6. Watch the pipeline parse all blocks, extract table facts, generate narration, validate every claim, and stream local Kokoro-82M speech.
7. Test playback controls: **Play**, **Pause**, **Skip**, and **Cancel**. Notice how pause, skip, and cancel respond instantly without race conditions.

### Step 5: Test on ChatGPT (Live)
1. Open [ChatGPT](https://chatgpt.com).
2. Ask any prompt that produces a mixed response (code + table + explanation).
3. As soon as the response finishes generating, observe the **Explain Aloud** action button injected into the turn footer.
4. Click it to listen to that exact selected response. The Side Panel opens and begins audio explanation immediately.
5. While one response plays, older answers remain independently playable and are never blocked by newly streaming turns.

---

## 4. Honest Limitations (MVP Scope)

Per [docs/MVP.md](docs/MVP.md) and [docs/PRD.md](docs/PRD.md):
1. **Target Site**: Focused exclusively on ChatGPT completed responses for MVP. Claude, Gemini, and general webpages are planned for subsequent milestones.
2. **Unsupported Block Types**: Complex math equations (LaTeX), charts (SVG/canvas), and Mermaid diagrams fall back to literal or summary descriptions.
3. **Local Hardware Dependency**: Local LLM speed is bounded by the host GPU/CPU running Ollama. If Ollama takes too long (>8s deadline), Explain Aloud falls back gracefully to rule-based deterministic summaries.
4. **Voice Profile**: Uses local Kokoro-82M (`af_heart`) running entirely in WebAssembly/WebGPU. No cloud TTS API is used.
