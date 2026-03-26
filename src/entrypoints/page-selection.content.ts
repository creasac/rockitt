import {
  readPageSelectionFromDocument,
  type PageSelectionUpdateMessage,
} from '../lib/page-selection';

export default defineContentScript({
  allFrames: true,
  matches: ['http://*/*', 'https://*/*'],
  main(ctx) {
    let lastSelectionText: string | null = null;
    let lastSelectionSource: string | null = null;
    let publishTimer: number | null = null;

    const publishSelection = () => {
      publishTimer = null;

      const selection = readPageSelectionFromDocument(document);
      const nextSelectionText = selection?.text ?? null;
      const nextSelectionSource = selection?.source ?? null;

      if (!selection && !document.hasFocus()) {
        return;
      }

      if (
        nextSelectionText === lastSelectionText &&
        nextSelectionSource === lastSelectionSource
      ) {
        return;
      }

      lastSelectionText = nextSelectionText;
      lastSelectionSource = nextSelectionSource;

      const message: PageSelectionUpdateMessage = {
        selection,
        type: 'page-context:selection-updated',
        url: window.location.href,
      };

      void chrome.runtime.sendMessage(message).catch(() => undefined);
    };

    const schedulePublish = () => {
      if (publishTimer != null) {
        return;
      }

      publishTimer = ctx.setTimeout(publishSelection, 50);
    };

    ctx.addEventListener(document, 'selectionchange', schedulePublish, true);
    ctx.addEventListener(document, 'mouseup', schedulePublish, true);
    ctx.addEventListener(document, 'keyup', schedulePublish, true);
    ctx.addEventListener(document, 'selectstart', schedulePublish, true);
    ctx.addEventListener(window, 'wxt:locationchange', schedulePublish);

    schedulePublish();
  },
});
