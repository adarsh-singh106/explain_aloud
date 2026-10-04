import type { ResponseIR } from '@/src/types/ir';
import { parseResponseElement } from '@/src/parser/htmlParser';

export const CHATGPT_ASSISTANT_SELECTOR = [
  '[data-message-author-role="assistant"]',
  'article[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
  '[data-fixture="assistant-response"]',
].join(', ');

export const MARKDOWN_CONTAINER_SELECTOR = '.markdown, .prose';

/**
 * Checks if a ChatGPT response is still actively streaming.
 */
export function isResponseStreaming(responseEl: Element): boolean {
  if (responseEl.classList.contains('result-streaming')) {
    return true;
  }
  if (responseEl.querySelector('.result-streaming')) {
    return true;
  }
  // Check global stop button in ChatGPT DOM
  const root = responseEl.ownerDocument || document;
  const stopBtn = root.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]');
  return stopBtn !== null;
}

/**
 * Extracts the inner markdown content container from an assistant message element.
 */
export function extractResponseContentElement(responseEl: Element): Element {
  // If the element itself is the fixture or markdown container
  if (responseEl.matches?.(MARKDOWN_CONTAINER_SELECTOR) || responseEl.getAttribute('data-fixture') === 'assistant-response') {
    return responseEl;
  }

  // Look for inner markdown / prose container
  const markdownContainer = responseEl.querySelector('.markdown, .prose');
  if (markdownContainer) {
    return markdownContainer;
  }

  // Fallback to assistant element itself
  return responseEl;
}

/**
 * Finds all completed assistant response elements on the page.
 */
export function findCompletedAssistantResponses(root: Document | Element = document): Element[] {
  const elements = Array.from(root.querySelectorAll(CHATGPT_ASSISTANT_SELECTOR));

  return elements.filter((el) => {
    // Only completed responses
    return !isResponseStreaming(el);
  });
}

/**
 * Finds the latest completed assistant response on the page.
 */
export function findLatestAssistantResponse(root: Document | Element = document): Element | null {
  const responses = findCompletedAssistantResponses(root);
  if (responses.length === 0) return null;
  return responses[responses.length - 1] || null;
}

/**
 * Extracts ResponseIR directly from a ChatGPT assistant DOM element.
 */
export function extractResponseIRFromElement(
  responseEl: Element,
  responseId?: string
): ResponseIR {
  const contentEl = extractResponseContentElement(responseEl);
  const id = responseId || responseEl.getAttribute('data-message-id') || `chatgpt-${Date.now()}`;
  return parseResponseElement(contentEl, id);
}

/**
 * Injects a small "Explain Aloud" action button onto a ChatGPT assistant response turn.
 */
export function injectExplainAloudButton(
  turnEl: Element,
  onExplain: (turnEl: Element) => void
): HTMLElement | null {
  // Prevent duplicate injection
  if (turnEl.querySelector('.explain-aloud-action-btn')) {
    return null;
  }

  // Find action bar area (usually sibling of message or inside turn actions)
  const actionContainer = turnEl.querySelector('.empty\\:hidden, [class*="action"], [class*="button"]') || turnEl;

  const btn = document.createElement('button');
  btn.className = 'explain-aloud-action-btn';
  btn.setAttribute('type', 'button');
  btn.setAttribute('aria-label', 'Explain Aloud');
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    </svg>
    <span>Explain Aloud</span>
  `;
  btn.style.cssText = `
    display: inline-flex;
    align-items: center;
    background: transparent;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 12px;
    color: inherit;
    cursor: pointer;
    margin: 4px;
    transition: background 0.15s ease;
  `;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onExplain(turnEl);
  });

  actionContainer.appendChild(btn);
  return btn;
}
