export const firecrawlToolNames = {
  scrape: 'firecrawl_scrape_url',
  search: 'firecrawl_search_web',
} as const;

export type FirecrawlSearchMode = 'web' | 'news' | 'web-and-news';

export type FirecrawlSearchTimeRange =
  | 'any'
  | 'past-hour'
  | 'past-day'
  | 'past-week'
  | 'past-month'
  | 'past-year'
  | 'newest';

export type FirecrawlResultItem = {
  category: string | null;
  date: string | null;
  position: number | null;
  snippet: string | null;
  source: 'web' | 'news';
  title: string;
  url: string;
};

export type FirecrawlSearchToolResult = {
  mode: FirecrawlSearchMode;
  query: string;
  results: FirecrawlResultItem[];
  searchedAt: string;
  timeRange: FirecrawlSearchTimeRange;
  tool: typeof firecrawlToolNames.search;
};

export type FirecrawlScrapeToolResult = {
  description: string | null;
  fetchedAt: string;
  markdown: string;
  sourceURL: string;
  statusCode: number | null;
  title: string | null;
  tool: typeof firecrawlToolNames.scrape;
  truncated: boolean;
  url: string;
};

export type FirecrawlBackgroundMessage =
  | {
      type: 'firecrawl:search';
      parameters: unknown;
    }
  | {
      type: 'firecrawl:scrape';
      parameters: unknown;
    };

export type FirecrawlBackgroundResponse =
  | {
      ok: true;
      result: FirecrawlSearchToolResult | FirecrawlScrapeToolResult;
    }
  | {
      ok: false;
      error: string;
    };

export const elevenLabsFirecrawlTools = [
  {
    description:
      'Search the live internet for current facts, recent changes, news, prices, or other information that may be outdated in the model. Use before answering when freshness matters.',
    expects_response: true,
    name: firecrawlToolNames.search,
    parameters: {
      properties: {
        limit: {
          description:
            'How many results to retrieve per source. Use 1 to 5. Default is 3.',
          maximum: 5,
          minimum: 1,
          type: 'integer',
        },
        mode: {
          description:
            "Which result source to use. 'web' is the default. 'news' is useful for the latest headlines and recent updates. 'web-and-news' returns both.",
          enum: ['web', 'news', 'web-and-news'],
          type: 'string',
        },
        query: {
          description: 'The web search query to run.',
          type: 'string',
        },
        timeRange: {
          description:
            "Optional freshness filter. This only applies to web results and is ignored for news-only searches. Use 'newest' to sort by date.",
          enum: [
            'any',
            'past-hour',
            'past-day',
            'past-week',
            'past-month',
            'past-year',
            'newest',
          ],
          type: 'string',
        },
      },
      required: ['query'],
      type: 'object',
    },
    type: 'client',
  },
  {
    description:
      'Fetch the current contents of a specific public web page URL. Use when the user gives a URL or asks you to inspect a specific page.',
    expects_response: true,
    name: firecrawlToolNames.scrape,
    parameters: {
      properties: {
        url: {
          description: 'The full public http or https URL to fetch.',
          type: 'string',
        },
      },
      required: ['url'],
      type: 'object',
    },
    type: 'client',
  },
] as const;
