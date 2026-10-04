import type { ResponseIR } from '@/src/types/ir';
import { parseResponseElement } from '@/src/parser/htmlParser';

export const CHATGPT_ASSISTANT_SELECTOR = [
  '[data-message-author-role="assistant"]',
  'article[data-testid^="conversation-turn-"]',
  '[data-fixture="assistant-response"]',
].join(', ');

export const MARKDOWN_CONTAINER_SELECTOR = '.markdown, .prose';

/**
 * Checks if a specific ChatGPT response is still actively streaming.
 * Checks per-turn attributes and classes rather than page-global buttons,
 * so older completed answers are not blocked by a new streaming turn.
 */
export function isResponseStreaming(responseEl: Element): boolean {
  if (responseEl.classList.contains('result-streaming')) {
    return true;
  }
  if (responseEl.querySelector('.result-streaming')) {
    return true;
  }
  if (responseEl.getAttribute('data-is-streaming') === 'true') {
    return true;
  }
  return false;
}

/**
 * Extracts the inner markdown content container from an assistant message element.
 */
export function extractResponseContentElement(responseEl: Element): Element {
  // If the element itself is the fixture or markdown container
  if (
    responseEl.matches?.(MARKDOWN_CONTAINER_SELECTOR) ||
    responseEl.getAttribute('data-fixture') === 'assistant-response'
  ) {
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
 * Canonicalizes matches to one element per response turn without duplicates.
 */
export function findCompletedAssistantResponses(root: Document | Element = document): Element[] {
  // First, find all explicit assistant message author nodes
  const messageNodes = Array.from(root.querySelectorAll('[data-message-author-role="assistant"]'));

  let candidateElements: Element[] = [];
  if (messageNodes.length > 0) {
    candidateElements = messageNodes;
  } else {
    // Fall back to conversation turn articles or fixtures
    candidateElements = Array.from(
      root.querySelectorAll('[data-fixture="assistant-response"], article[data-testid^="conversation-turn-"]')
    );
  }

  // Filter out any element that is an ancestor or descendant of another in candidate list
  const canonical: Element[] = [];
  for (const el of candidateElements) {
    // If it's an article that contains a message-author-role child, prefer the inner message container
    const innerAssistant = el.querySelector('[data-message-author-role="assistant"]');
    const target = innerAssistant || el;

    if (!canonical.includes(target) && !isResponseStreaming(target)) {
      canonical.push(target);
    }
  }

  return canonical;
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
  if (turnEl.querySelector('.explain-aloud-action-btn') || turnEl.closest('.explain-aloud-btn-container')) {
    return null;
  }

  // Create container with class explain-aloud-btn-container so parser ignores it
  const container = document.createElement('div');
  container.className = 'explain-aloud-btn-container';

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
    if (isResponseStreaming(turnEl)) {
      alert('Please wait until this response finishes streaming.');
      return;
    }
    onExplain(turnEl);
  });

  container.appendChild(btn);

  // Find action bar area (usually sibling of message or inside turn actions)
  const actionContainer = turnEl.querySelector('.empty\\:hidden, [class*="action"], [class*="button"]');
  if (actionContainer && actionContainer !== turnEl) {
    actionContainer.appendChild(container);
  } else {
    turnEl.appendChild(container);
  }

  return btn;
}
