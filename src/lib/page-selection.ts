export type PageSelectionSource = 'document' | 'input' | 'textarea';

export type PageSelectionSnapshot = {
  source: PageSelectionSource;
  text: string;
  truncated: boolean;
};

export type PageSelectionUpdateMessage = {
  selection: PageSelectionSnapshot | null;
  type: 'page-context:selection-updated';
  url: string;
};

const maxPageSelectionChars = 1_500;

const normalizeWhitespace = (value: string) =>
  value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

const toSelectionSnapshot = (
  value: string,
  source: PageSelectionSource,
): PageSelectionSnapshot | null => {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxPageSelectionChars) {
    return {
      source,
      text: normalized,
      truncated: false,
    };
  }

  return {
    source,
    text: `${normalized.slice(0, maxPageSelectionChars).trimEnd()}...`,
    truncated: true,
  };
};

const readInputSelection = (
  element: Element | null,
): PageSelectionSnapshot | null => {
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement)
  ) {
    return null;
  }

  if (
    element instanceof HTMLInputElement &&
    /^(hidden|password)$/i.test(element.type)
  ) {
    return null;
  }

  const selectionStart = element.selectionStart;
  const selectionEnd = element.selectionEnd;

  if (
    selectionStart == null ||
    selectionEnd == null ||
    selectionEnd <= selectionStart
  ) {
    return null;
  }

  return toSelectionSnapshot(
    element.value.slice(selectionStart, selectionEnd),
    element instanceof HTMLTextAreaElement ? 'textarea' : 'input',
  );
};

export const readPageSelectionFromDocument = (
  doc: Document = document,
): PageSelectionSnapshot | null => {
  const inputSelection = readInputSelection(doc.activeElement);

  if (inputSelection) {
    return inputSelection;
  }

  const selection = doc.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount < 1) {
    return null;
  }

  return toSelectionSnapshot(selection.toString(), 'document');
};
