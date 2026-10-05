import {
  findCompletedAssistantResponses,
  injectExplainAloudButton,
  extractResponseIRFromElement,
} from '@/src/adapter/chatgptAdapter';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  main() {
    console.log('[Explain Aloud] Content script active on ChatGPT.');

    function scanAndAttachButtons() {
      const responses = findCompletedAssistantResponses();
      responses.forEach((respEl) => {
        injectExplainAloudButton(respEl, async (targetEl) => {
          const clickedAt = performance.timeOrigin + performance.now();
          const ir = extractResponseIRFromElement(targetEl);
          console.log('[Explain Aloud] Extracted ResponseIR for selected turn:', ir.responseId);

          try {
            await browser.runtime.sendMessage({
              type: 'EXPLAIN_ALOUD_EXTRACTED',
              ir,
              clickedAt,
            });
          } catch (err) {
            console.warn('[Explain Aloud] Message send failed:', err);
          }
        });
      });
    }

    // Initial scan
    scanAndAttachButtons();

    // Observe DOM mutations to attach buttons to new completed assistant responses
    let debounceTimer: any = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        scanAndAttachButtons();
      }, 250);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-is-streaming'],
    });
  },
});
