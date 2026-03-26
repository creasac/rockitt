import type {
  PageContextExtractionInput,
  ReadablePageContextSnapshot,
  VisiblePageContextSnapshot,
} from './page-context';

export const extractPageContextFromDocument = (
  input: PageContextExtractionInput,
): ReadablePageContextSnapshot | VisiblePageContextSnapshot => {
  type PageType = VisiblePageContextSnapshot['pageType'];

  const maxVisibleTextBlocks = 8;
  const maxVisibleLinks = 6;
  const maxVisibleControls = 6;
  const maxVisibleTables = 2;
  const maxVisibleImages = 4;
  const maxSectionTextChars = 700;
  const maxSummaryChars = 360;
  const defaultReadableSections = 3;
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'do',
    'for',
    'from',
    'how',
    'i',
    'in',
    'is',
    'it',
    'me',
    'of',
    'on',
    'or',
    'that',
    'the',
    'this',
    'to',
    'what',
    'when',
    'where',
    'which',
    'who',
    'why',
    'with',
    'you',
    'your',
  ]);

  const body = document.body;

  if (!body) {
    throw new Error('The current page does not expose a readable document body.');
  }

  let didTruncate = false;

  const normalizeWhitespace = (value: string) =>
    value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

  const trimText = (value: string, maxChars: number) => {
    const normalized = normalizeWhitespace(value);

    if (normalized.length <= maxChars) {
      return normalized;
    }

    didTruncate = true;

    return `${normalized.slice(0, maxChars).trimEnd()}...`;
  };

  const getElementText = (element: Element) => {
    const rawText =
      element instanceof HTMLElement
        ? element.innerText || element.textContent || ''
        : element.textContent || '';

    return normalizeWhitespace(rawText);
  };

  const isElementVisible = (element: Element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    const style = window.getComputedStyle(element);

    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();

    if (rect.width < 2 || rect.height < 2) {
      return false;
    }

    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  };

  const isLikelyChrome = (element: Element) =>
    Boolean(
      element.closest(
        'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="complementary"]',
      ),
    );

  const isLikelyReadableContainer = (element: Element) =>
    Boolean(
      element.closest(
        'article, main, [role="main"], .article, .post, .content, .entry-content, .markdown-body, .docs, .doc, .documentation, .prose',
      ),
    );

  const dedupeStrings = (values: string[]) => {
    const seen = new Set<string>();

    return values.filter((value) => {
      const key = value.toLowerCase();

      if (!value || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  };

  const dedupeBy = <T,>(values: T[], getKey: (value: T) => string) => {
    const seen = new Set<string>();

    return values.filter((value) => {
      const key = getKey(value);

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  };

  const getDocumentHeading = () => {
    const visibleHeading = Array.from(
      document.querySelectorAll('h1, h2, h3, [role="heading"]'),
    ).find((element) => isElementVisible(element));

    const fallbackHeading = document.querySelector('h1, h2, h3, [role="heading"]');

    return (
      (visibleHeading ? getElementText(visibleHeading) : '') ||
      (fallbackHeading ? getElementText(fallbackHeading) : '') ||
      null
    );
  };

  const mainHeading = getDocumentHeading();

  const countTextWords = (value: string) =>
    value ? normalizeWhitespace(value).split(/\s+/).filter(Boolean).length : 0;

  const guessPageType = (): PageType => {
    const fullText = getElementText(body);
    const wordCount = countTextWords(fullText);
    const paragraphCount = document.querySelectorAll('p').length;
    const codeBlockCount = document.querySelectorAll('pre, code').length;
    const controlCount = document.querySelectorAll(
      'button, input, textarea, select',
    ).length;
    const linkCount = document.querySelectorAll('a[href]').length;
    const path = window.location.pathname.toLowerCase();
    const query = window.location.search.toLowerCase();
    const hasSearchBox = Boolean(
      document.querySelector(
        'input[type="search"], input[aria-label*="search" i], form[role="search"]',
      ),
    );
    const hasProductMarkers = Boolean(
      document.querySelector(
        '[itemtype*="Product"], [data-testid*="price" i], [class*="price" i]',
      ),
    );

    if (hasSearchBox && (path.includes('search') || query.includes('q='))) {
      return 'search-results';
    }

    if (hasProductMarkers) {
      return 'product';
    }

    if (codeBlockCount >= 3 || path.includes('/docs') || path.includes('/reference')) {
      return 'docs';
    }

    if (controlCount >= 10 && paragraphCount <= 8) {
      return 'app';
    }

    if (wordCount >= 700 && paragraphCount >= 6 && linkCount < paragraphCount * 3) {
      return 'article';
    }

    return 'generic';
  };

  const pageType = guessPageType();

  const getControlLabel = (element: Element) => {
    if (!(element instanceof HTMLElement)) {
      return '';
    }

    const field =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
        ? element
        : null;
    const labelCandidate =
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      (field?.labels?.[0] ? getElementText(field.labels[0]) : '') ||
      (element instanceof HTMLButtonElement ? getElementText(element) : '') ||
      (element instanceof HTMLLabelElement ? getElementText(element) : '') ||
      field?.placeholder ||
      field?.value ||
      element.getAttribute('name') ||
      element.id;

    return normalizeWhitespace(labelCandidate || '');
  };

  const summarizeTable = (table: HTMLTableElement) => {
    const caption = normalizeWhitespace(
      table.caption ? getElementText(table.caption) : '',
    );
    const rows = Array.from(table.rows);

    if (!rows.length) {
      return null;
    }

    const headerCells = Array.from(
      table.querySelectorAll('thead th, tr:first-child th, tr:first-child td'),
    )
      .map((cell) => trimText(getElementText(cell), 120))
      .filter(Boolean)
      .slice(0, 5);
    const dataRows = rows
      .slice(headerCells.length ? 1 : 0)
      .map((row) =>
        Array.from(row.cells)
          .map((cell) => trimText(getElementText(cell), 120))
          .filter(Boolean)
          .slice(0, 5),
      )
      .filter((row) => row.length)
      .slice(0, 3);

    if (!caption && !headerCells.length && !dataRows.length) {
      return null;
    }

    return {
      caption: caption || null,
      headers: headerCells,
      rows: dataRows,
    };
  };

  const stringifyTable = (table: HTMLTableElement) => {
    const preview = summarizeTable(table);

    if (!preview) {
      return '';
    }

    const tableLines = [
      preview.caption ? `Table: ${preview.caption}` : 'Table',
      preview.headers.length ? `Headers: ${preview.headers.join(' | ')}` : '',
      ...preview.rows.map((row) => `Row: ${row.join(' | ')}`),
    ].filter(Boolean);

    return tableLines.join('\n');
  };

  const getVisibleTextBlocks = () => {
    const selectors = [
      'h1',
      'h2',
      'h3',
      'h4',
      'p',
      'li',
      'blockquote',
      'figcaption',
      'pre',
      'dt',
      'dd',
    ].join(', ');
    const candidates = Array.from(document.querySelectorAll(selectors));
    const preferred = [
      ...candidates.filter((element) => isLikelyReadableContainer(element)),
      ...candidates.filter((element) => !isLikelyReadableContainer(element)),
    ];
    const blocks: string[] = [];

    for (const element of preferred) {
      if (!isElementVisible(element)) {
        continue;
      }

      if (element.matches('pre') && getElementText(element).length < 20) {
        continue;
      }

      const text = getElementText(element);

      if (!text) {
        continue;
      }

      if (
        !element.matches('h1, h2, h3, h4') &&
        text.length < 35 &&
        !isLikelyChrome(element)
      ) {
        continue;
      }

      const normalized = trimText(text, element.matches('pre') ? 240 : 220);
      const duplicate = blocks.some(
        (existing) =>
          existing.toLowerCase() === normalized.toLowerCase() ||
          existing.toLowerCase().includes(normalized.toLowerCase()) ||
          normalized.toLowerCase().includes(existing.toLowerCase()),
      );

      if (duplicate) {
        continue;
      }

      blocks.push(normalized);

      if (blocks.length >= maxVisibleTextBlocks) {
        break;
      }
    }

    return blocks;
  };

  const getVisibleLinks = () =>
    dedupeBy(
      Array.from(document.querySelectorAll('a[href]'))
        .filter((element) => isElementVisible(element))
        .map((element) => {
          const url = element.getAttribute('href') || '';
          const absoluteUrl = (() => {
            try {
              return new URL(url, window.location.href).toString();
            } catch {
              return '';
            }
          })();

          return {
            text: trimText(getElementText(element), 100),
            url: absoluteUrl,
          };
        })
        .filter((item) => item.text && item.url && !item.url.startsWith('javascript:'))
        .slice(0, maxVisibleLinks * 2),
      (item) => `${item.text.toLowerCase()}|${item.url}`,
    ).slice(0, maxVisibleLinks);

  const getVisibleControls = () =>
    dedupeStrings(
      Array.from(
        document.querySelectorAll(
          'button, input:not([type="hidden"]), textarea, select, label',
        ),
      )
        .filter((element) => isElementVisible(element))
        .map((element) => trimText(getControlLabel(element), 100))
        .filter(Boolean),
    ).slice(0, maxVisibleControls);

  const getVisibleTables = () =>
    Array.from(document.querySelectorAll('table'))
      .filter((element): element is HTMLTableElement => element instanceof HTMLTableElement)
      .filter((table) => isElementVisible(table))
      .map((table) => summarizeTable(table))
      .filter((preview): preview is NonNullable<typeof preview> => Boolean(preview))
      .slice(0, maxVisibleTables);

  const getVisibleImages = () =>
    dedupeBy(
      Array.from(document.images)
        .filter((image) => isElementVisible(image))
        .map((image) => {
          const alt = normalizeWhitespace(
            image.alt ||
              image.getAttribute('aria-label') ||
              image.getAttribute('title') ||
              '',
          );
          const caption = normalizeWhitespace(
            image.closest('figure')
              ? getElementText(image.closest('figure') as Element)
              : '',
          );

          return {
            alt: trimText(alt || caption, 120),
            caption: caption ? trimText(caption, 160) : null,
          };
        })
        .filter((item) => item.alt),
      (item) => `${item.alt.toLowerCase()}|${item.caption ?? ''}`,
    ).slice(0, maxVisibleImages);

  const visibleSectionHeadings = dedupeStrings(
    Array.from(document.querySelectorAll('h2, h3, h4'))
      .filter((element) => isElementVisible(element))
      .map((element) => trimText(getElementText(element), 120))
      .filter(Boolean),
  ).slice(0, 4);

  const getCandidateRoots = () => {
    const preferredSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.article',
      '.post',
      '.entry-content',
      '.content',
      '.markdown-body',
      '.docs',
      '.doc',
      '.documentation',
      '.prose',
    ];
    const preferredRoots = dedupeBy(
      preferredSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .filter((element) => element instanceof HTMLElement),
      (element) => `${element.tagName}:${element.className}:${element.id}`,
    ) as HTMLElement[];

    if (preferredRoots.length) {
      return preferredRoots;
    }

    return Array.from(document.querySelectorAll('section, div'))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => getElementText(element).length >= 300)
      .slice(0, 250);
  };

  const scoreRoot = (element: HTMLElement) => {
    if (
      element.matches(
        'nav, header, footer, aside, form, dialog, [role="navigation"], [role="complementary"]',
      )
    ) {
      return Number.NEGATIVE_INFINITY;
    }

    const text = getElementText(element);
    const wordCount = countTextWords(text);
    const paragraphCount = element.querySelectorAll('p').length;
    const headingCount = element.querySelectorAll('h1, h2, h3').length;
    const linkCount = element.querySelectorAll('a[href]').length;
    const controlCount = element.querySelectorAll(
      'button, input, textarea, select',
    ).length;
    const codeCount = element.querySelectorAll('pre, code').length;
    const densityPenalty =
      linkCount / Math.max(Math.round(wordCount / 35), 1);

    return (
      Math.min(wordCount, 2600) +
      paragraphCount * 90 +
      headingCount * 120 +
      codeCount * 40 +
      (element.matches('article, main, [role="main"]') ? 500 : 0) -
      controlCount * 180 -
      densityPenalty * 120
    );
  };

  const getReadableRoot = () => {
    const roots = getCandidateRoots();

    if (!roots.length) {
      return body;
    }

    let bestRoot: HTMLElement = body;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const root of roots) {
      const score = scoreRoot(root);

      if (score > bestScore) {
        bestRoot = root;
        bestScore = score;
      }
    }

    return bestRoot;
  };

  const tokenize = (value: string) =>
    normalizeWhitespace(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length > 2 && !stopWords.has(token))
      .slice(0, 16);

  const countOccurrences = (haystack: string, needle: string) => {
    if (!needle) {
      return 0;
    }

    const matches = haystack.match(new RegExp(`\\b${needle}\\b`, 'gi'));
    return matches ? matches.length : 0;
  };

  const readableRoot = getReadableRoot();
  const readableNodes = Array.from(
    readableRoot.querySelectorAll(
      'h1, h2, h3, h4, p, li, blockquote, pre, figcaption, table',
    ),
  );
  const sections: Array<{ heading: string; index: number; text: string }> = [];
  let currentSection = {
    heading: mainHeading || 'Overview',
    index: 0,
    parts: [] as string[],
  };

  const pushCurrentSection = () => {
    const text = normalizeWhitespace(currentSection.parts.join('\n'));

    if (!text) {
      return;
    }

    sections.push({
      heading: currentSection.heading,
      index: currentSection.index,
      text: trimText(text, maxSectionTextChars),
    });
  };

  for (const node of readableNodes) {
    if (
      node.matches(
        'nav *, header *, footer *, aside *, [role="navigation"] *, [role="complementary"] *',
      )
    ) {
      continue;
    }

    if (node.matches('h1, h2, h3, h4')) {
      const heading = getElementText(node);

      if (!heading) {
        continue;
      }

      if (currentSection.parts.length) {
        pushCurrentSection();
      }

      currentSection = {
        heading: trimText(heading, 140),
        index: sections.length,
        parts: [],
      };
      continue;
    }

    const text = node instanceof HTMLTableElement
      ? stringifyTable(node)
      : getElementText(node);

    if (!text || text.length < 25) {
      continue;
    }

    currentSection.parts.push(text);
  }

  if (currentSection.parts.length) {
    pushCurrentSection();
  }

  const normalizedSections = sections.length
    ? sections
    : [
        {
          heading: mainHeading || 'Overview',
          index: 0,
          text: trimText(getElementText(readableRoot), maxSectionTextChars),
        },
      ];

  const question = normalizeWhitespace(input.question || '') || null;
  const questionTokens = question ? tokenize(question) : [];
  const maxSections = Math.min(Math.max(input.maxSections ?? defaultReadableSections, 1), 4);
  const scoredSections = normalizedSections.map((section) => {
    const headingLower = section.heading.toLowerCase();
    const textLower = section.text.toLowerCase();
    const score = questionTokens.reduce((total, token) => {
      return (
        total +
        countOccurrences(headingLower, token) * 5 +
        countOccurrences(textLower, token)
      );
    }, section.index === 0 ? 1 : 0);

    return {
      ...section,
      score,
    };
  });
  const topSections =
    questionTokens.length && scoredSections.some((section) => section.score > 0)
      ? [...scoredSections]
          .sort((left, right) => right.score - left.score || left.index - right.index)
          .slice(0, maxSections)
          .sort((left, right) => left.index - right.index)
      : scoredSections.slice(0, maxSections);
  const summary = trimText(
    topSections
      .slice(0, 2)
      .map((section) => section.text)
      .join(' '),
    maxSummaryChars,
  );

  if (input.kind === 'visible') {
    return {
      mainHeading,
      pageType,
      sectionHeadings: visibleSectionHeadings,
      title: document.title || window.location.hostname,
      truncated: didTruncate,
      url: window.location.href,
      viewport: {
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      },
      visibleButtonsAndInputs: getVisibleControls(),
      visibleImages: getVisibleImages(),
      visibleLinks: getVisibleLinks(),
      visibleTables: getVisibleTables(),
      visibleTextBlocks: getVisibleTextBlocks(),
    };
  }

  return {
    mainHeading,
    matchedSections: topSections.map((section) => ({
      heading: section.heading,
      index: section.index,
      score: section.score,
      text: section.text,
    })),
    pageType,
    question,
    summary,
    title: document.title || window.location.hostname,
    truncated: didTruncate,
    url: window.location.href,
  };
};
