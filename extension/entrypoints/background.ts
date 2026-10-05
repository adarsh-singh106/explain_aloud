import type { ResponseIR } from '@/src/types/ir';

let currentSessionIR: ResponseIR | null = null;
let currentClickedAt: number | undefined;

export default defineBackground(() => {
  console.log('[Explain Aloud] Background service worker initialized.');

  const chromeApi = (globalThis as any).chrome;

  // Set side panel behavior to open on action click if API exists
  if (chromeApi?.sidePanel?.setPanelBehavior) {
    chromeApi.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
    if (!message || typeof message !== 'object') return false;

    if (message.type === 'EXPLAIN_ALOUD_EXTRACTED') {
      currentSessionIR = message.ir;
      currentClickedAt = message.clickedAt;
      console.log('[Explain Aloud] Stored extracted ResponseIR:', currentSessionIR?.responseId);

      // Open side panel for the sender tab if available
      const tabId = sender.tab?.id;
      if (tabId && chromeApi?.sidePanel?.open) {
        chromeApi.sidePanel.open({ tabId }).catch((err: any) => {
          console.warn('[Explain Aloud] Could not open side panel:', err);
        });
      }

      // Broadcast to any already open popup or sidepanel
      browser.runtime.sendMessage({
        type: 'EXPLAIN_ALOUD_SESSION_UPDATED',
        ir: currentSessionIR,
        clickedAt: currentClickedAt,
      }).catch(() => {
        // No listener currently active
      });

      sendResponse({ ok: true, responseId: currentSessionIR?.responseId });
      return true;
    }

    if (message.type === 'GET_CURRENT_SESSION') {
      sendResponse({ ir: currentSessionIR, clickedAt: currentClickedAt });
      return true;
    }

    return false;
  });
});
