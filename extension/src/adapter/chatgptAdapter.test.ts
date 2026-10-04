import { describe, expect, it, vi } from 'vitest';
import {
  isResponseStreaming,
  extractResponseContentElement,
  findCompletedAssistantResponses,
  extractResponseIRFromElement,
  injectExplainAloudButton,
} from './chatgptAdapter';

describe('Milestone M7 — ChatGPT Adapter', () => {
  describe('isResponseStreaming', () => {
    it('detects streaming when element has .result-streaming class', () => {
      const div = document.createElement('div');
      div.className = 'result-streaming';
      expect(isResponseStreaming(div)).toBe(true);
    });

    it('detects streaming when a child has .result-streaming class', () => {
      const parent = document.createElement('div');
      const child = document.createElement('div');
      child.className = 'result-streaming';
      parent.appendChild(child);
      expect(isResponseStreaming(parent)).toBe(true);
    });

    it('returns false when no streaming indicator or stop button exists', () => {
      const div = document.createElement('div');
      div.className = 'conversation-turn';
      expect(isResponseStreaming(div)).toBe(false);
    });
  });

  describe('extractResponseContentElement', () => {
    it('extracts the inner .markdown container', () => {
      const turn = document.createElement('article');
      const inner = document.createElement('div');
      inner.className = 'markdown prose';
      inner.innerHTML = '<p>Test answer</p>';
      turn.appendChild(inner);

      const content = extractResponseContentElement(turn);
      expect(content).toBe(inner);
    });

    it('returns the element itself if it matches markdown container selector', () => {
      const div = document.createElement('div');
      div.className = 'markdown';
      expect(extractResponseContentElement(div)).toBe(div);
    });
  });

  describe('findCompletedAssistantResponses', () => {
    it('finds completed assistant turns and filters out streaming turns', () => {
      const container = document.createElement('div');

      const completedTurn = document.createElement('div');
      completedTurn.setAttribute('data-message-author-role', 'assistant');
      completedTurn.innerHTML = '<div class="markdown"><p>Completed response</p></div>';

      const streamingTurn = document.createElement('div');
      streamingTurn.setAttribute('data-message-author-role', 'assistant');
      streamingTurn.classList.add('result-streaming');
      streamingTurn.innerHTML = '<div class="markdown"><p>Still streaming...</p></div>';

      container.appendChild(completedTurn);
      container.appendChild(streamingTurn);

      const found = findCompletedAssistantResponses(container);
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(completedTurn);
    });
  });

  describe('extractResponseIRFromElement', () => {
    it('converts ChatGPT assistant DOM to ResponseIR', () => {
      const assistantEl = document.createElement('div');
      assistantEl.setAttribute('data-message-author-role', 'assistant');
      assistantEl.setAttribute('data-message-id', 'msg-123');
      assistantEl.innerHTML = `
        <div class="markdown">
          <h2>Summary</h2>
          <p>Here is the completed response.</p>
        </div>
      `;

      const ir = extractResponseIRFromElement(assistantEl);
      expect(ir.schemaVersion).toBe('1.0');
      expect(ir.site).toBe('chatgpt');
      expect(ir.responseId).toBe('msg-123');
      expect(ir.blocks).toHaveLength(2);
      expect(ir.blocks[0]?.type).toBe('heading');
      expect(ir.blocks[1]?.type).toBe('paragraph');
    });
  });

  describe('injectExplainAloudButton', () => {
    it('injects the Explain Aloud button and prevents duplicate injection', () => {
      const turn = document.createElement('div');
      turn.setAttribute('data-message-author-role', 'assistant');
      const onExplain = vi.fn();

      const btn1 = injectExplainAloudButton(turn, onExplain);
      expect(btn1).not.toBeNull();
      expect(turn.querySelector('.explain-aloud-action-btn')).toBe(btn1);
      expect(btn1?.textContent).toContain('Explain Aloud');

      // Second injection attempt should be a no-op
      const btn2 = injectExplainAloudButton(turn, onExplain);
      expect(btn2).toBeNull();
      expect(turn.querySelectorAll('.explain-aloud-action-btn')).toHaveLength(1);

      // Trigger click
      btn1?.click();
      expect(onExplain).toHaveBeenCalledWith(turn);
    });

    // --- Audit Reproductions & Acceptance Assertions (A11) ---

    it('deduplicates matches when article contains [data-message-author-role="assistant"] (A11 probe)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <article data-testid="conversation-turn-3">
          <div data-message-author-role="assistant" data-message-id="msg-turn-3">
            <div class="markdown"><p>Answer 3</p></div>
          </div>
        </article>
      `;

      const found = findCompletedAssistantResponses(container);
      // Must return exactly ONE canonical element, not both the article and the message div!
      expect(found).toHaveLength(1);
    });

    it('ensures older completed turns are NOT blocked when another turn streams (A11 probe)', () => {
      const completedTurn = document.createElement('div');
      completedTurn.setAttribute('data-message-author-role', 'assistant');
      completedTurn.innerHTML = '<p>Completed text</p>';

      const streamingTurn = document.createElement('div');
      streamingTurn.setAttribute('data-message-author-role', 'assistant');
      streamingTurn.classList.add('result-streaming');
      streamingTurn.innerHTML = '<p>Streaming text</p>';

      expect(isResponseStreaming(completedTurn)).toBe(false);
      expect(isResponseStreaming(streamingTurn)).toBe(true);
    });

    it('excludes injected Explain Aloud button from extracted ResponseIR blocks (A11 probe)', () => {
      const turn = document.createElement('div');
      turn.setAttribute('data-message-author-role', 'assistant');
      turn.innerHTML = `
        <div class="markdown">
          <p>Real content text.</p>
        </div>
      `;

      injectExplainAloudButton(turn, () => {});

      const ir = extractResponseIRFromElement(turn);
      expect(ir.blocks).toHaveLength(1);
      expect(ir.blocks[0]?.type).toBe('paragraph');
      // The button text "Explain Aloud" must NOT be parsed into ResponseIR!
      for (const b of ir.blocks) {
        expect(b.raw).not.toContain('Explain Aloud');
      }
    });
  });
});

