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
| **Code** | "for user in users colon newline if user dot active colon newline send underscore email open paren user close paren" | **Natural Mode**: *"This Python snippet iterates through each user and sends an email if the user is currently active."*<br>**Literal Mode**: *"Python code: for user in users, if user is active, call send_email with user."* |
| **Table** | Cell-by-cell robotic read: "Table with 3 rows. Model, Accuracy, Latency. A, 92 percent, 4 sec. B, 88 percent, 1 sec. C, 90 percent, 2 sec." | **Deterministic Semantic Narration**: *"The table compares 3 models across Accuracy and Latency. For accuracy, Model A is highest at 92%, while Model B is lowest at 88%. For latency, Model A has the highest latency at 4 seconds, whereas Model B is fastest at 1 second."* |
| **Safety** | If an LLM hallucinates an invalid metric (e.g. 99%), standard tools read the hallucination. | **Validator & Fallback**: Catches unsupported numbers, reversed comparisons, or hallucinations, and replaces the segment with a 100% verified deterministic summary without interrupting playback. |

---

## 3. How to Run the Demo in Chrome / Edge

### Step 1: Start Ollama (Local LLM)
Ensure Ollama is running with CORS enabled for browser extensions:
```powershell
$env:OLLAMA_ORIGINS="chrome-extension://*"
ollama serve
```
Model used: `gemma4:e4b` (verified and pulled).

### Step 2: Build or Run the Extension
From repo root:
```powershell
cd extension
npm run dev
# OR for production build:
npm run build
```

### Step 3: Load the Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `.output/chrome-mv3` folder inside `explain_aloud/extension/`.

### Step 4: Run the Demo
1. Click the **Explain Aloud** puzzle icon in the Chrome toolbar.
2. Select **Natural Mode** or **Literal Mode**.
3. Click **Load & Narrate Fixture**.
4. Watch the pipeline parse all blocks, extract table facts, generate narration, validate every claim, and stream local Kokoro-82M speech.
5. Test playback controls: **Play**, **Pause**, **Skip**, and **Cancel**.

### Step 5: Test on ChatGPT (Live)
1. Open [ChatGPT](https://chatgpt.com).
2. Ask any prompt that produces a mixed response (code + table + explanation).
3. As soon as the response finishes generating, observe the **Explain Aloud** action button injected into the turn footer.
4. Click it to listen to the explanation.

---

## 4. Honest Limitations (MVP Scope)

Per [docs/MVP.md](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/docs/MVP.md) and [docs/PRD.md](file:///C:/Users/adars/Desktop/One%20ML/Hacktoberfest/Week%200/explain_aloud/docs/PRD.md):
1. **Target Site**: Focused exclusively on ChatGPT completed responses for MVP. Claude, Gemini, and general webpages are planned for subsequent milestones.
2. **Unsupported Block Types**: Complex math equations (LaTeX), charts (SVG/canvas), and Mermaid diagrams fall back to literal or summary descriptions.
3. **Local Hardware Dependency**: Local LLM speed is bounded by the host GPU/CPU running Ollama. If Ollama takes too long or is busy, Explain Aloud falls back gracefully to rule-based deterministic summaries.
4. **Voice Profile**: Uses local Kokoro-82M (`af_heart`) running entirely in WebAssembly/WebGPU. No cloud TTS API is used.
