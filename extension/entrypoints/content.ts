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
        injectExplainAloudButton(respEl, (targetEl) => {
          const ir = extractResponseIRFromElement(targetEl);
          console.log('[Explain Aloud] Extracted ResponseIR for selected message:', ir);

          // Broadcast to extension runtime (background / popup)
          browser.runtime.sendMessage({
            type: 'EXPLAIN_ALOUD_EXTRACTED',
            ir,
          }).catch(() => {
            // Popup or background may not have open listener yet
          });
        });
      });
    }

    // Initial scan
    scanAndAttachButtons();

    // Observe DOM mutations to attach buttons to new assistant responses as they complete
    const observer = new MutationObserver(() => {
      scanAndAttachButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  },
});
