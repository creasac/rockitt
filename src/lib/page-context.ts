import type { PageSelectionSnapshot, PageSelectionUpdateMessage } from './page-selection';

export const pageContextToolNames = {
  readable: 'get_readable_page_context',
  visible: 'get_visible_page_context',
} as const;

export type PageContextToolName =
  (typeof pageContextToolNames)[keyof typeof pageContextToolNames];

export type PageContextViewport = {
  scrollX: number;
  scrollY: number;
  viewportHeight: number;
  viewportWidth: number;
};

export type PageContextLink = {
  text: string;
  url: string;
};

export type PageContextTablePreview = {
  caption: string | null;
  headers: string[];
  rows: string[][];
};

export type PageContextImagePreview = {
  alt: string;
  caption: string | null;
};

export type VisiblePageContextSnapshot = {
  mainHeading: string | null;
  pageType:
    | 'app'
    | 'article'
    | 'docs'
    | 'generic'
    | 'product'
    | 'search-results';
  sectionHeadings: string[];
  selection: PageSelectionSnapshot | null;
  title: string;
  truncated: boolean;
  url: string;
  viewport: PageContextViewport;
  visibleButtonsAndInputs: string[];
  visibleImages: PageContextImagePreview[];
  visibleLinks: PageContextLink[];
  visibleTables: PageContextTablePreview[];
  visibleTextBlocks: string[];
};

export type ReadablePageContextSection = {
  heading: string;
  index: number;
  score: number;
  text: string;
};

export type ReadablePageContextSnapshot = {
  mainHeading: string | null;
  matchedSections: ReadablePageContextSection[];
  pageType: VisiblePageContextSnapshot['pageType'];
  question: string | null;
  selection: PageSelectionSnapshot | null;
  summary: string;
  title: string;
  truncated: boolean;
  url: string;
};

export type VisiblePageContextToolResult = VisiblePageContextSnapshot & {
  capturedAt: string;
  tool: typeof pageContextToolNames.visible;
};

export type ReadablePageContextToolResult = ReadablePageContextSnapshot & {
  capturedAt: string;
  tool: typeof pageContextToolNames.readable;
};

export type PageContextBackgroundMessage =
  | {
      type: 'page-context:get-readable';
      parameters?: unknown;
    }
  | {
      type: 'page-context:get-visible';
      parameters?: unknown;
    };

export type AnyPageContextMessage =
  | PageContextBackgroundMessage
  | PageSelectionUpdateMessage;

export type PageContextBackgroundResponse =
  | {
      ok: true;
      result: ReadablePageContextToolResult | VisiblePageContextToolResult;
    }
  | {
      ok: false;
      error: string;
    };

export type PageContextExtractionInput = {
  kind: 'readable' | 'visible';
  maxSections?: number;
  question?: string | null;
};

export const elevenLabsPageContextTools = [
  {
    description:
      'Read a compact summary of what is visible in the active browser tab right now. Include the user\'s current page selection when available. Use only when the user is asking about the current page, screen, tab, highlighted text, or an ambiguous "this" or "here" reference.',
    expects_response: true,
    name: pageContextToolNames.visible,
    parameters: {
      properties: {},
      type: 'object',
    },
    type: 'client',
  },
  {
    description:
      'Read more of the current page locally for text-heavy pages such as articles or docs. Include the user\'s current page selection when available. Use after the visible page tool when you need deeper context, and pass a short question so the tool can return only the most relevant sections.',
    expects_response: true,
    name: pageContextToolNames.readable,
    parameters: {
      properties: {
        maxSections: {
          description:
            'How many relevant sections to return. Use 1 to 4. Default is 3.',
          maximum: 4,
          minimum: 1,
          type: 'integer',
        },
        question: {
          description:
            'A short description of what you need from the page, based on the user request.',
          type: 'string',
        },
      },
      type: 'object',
    },
    type: 'client',
  },
] as const;
