type ImportMetaEnvRecord = Record<string, string | undefined>;

const env =
  ((import.meta as ImportMeta & { env?: ImportMetaEnvRecord }).env ?? {});

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

export const appBackendBaseUrl = trimTrailingSlashes(
  env.WXT_BACKEND_BASE_URL?.trim() ?? '',
);

export const appBackendEndpoints = {
  firecrawlScrape: '/firecrawl/scrape',
  firecrawlSearch: '/firecrawl/search',
  health: '/health',
  voiceSession: '/voice/session',
} as const;

export const isAppBackendConfigured = appBackendBaseUrl.length > 0;

export const getAppBackendBaseUrl = () => {
  if (!isAppBackendConfigured) {
    throw new Error(
      'Set WXT_BACKEND_BASE_URL to your deployed Rockitt backend before using managed voice or live web lookup.',
    );
  }

  return appBackendBaseUrl;
};

export const getAppBackendUrl = (
  endpoint: (typeof appBackendEndpoints)[keyof typeof appBackendEndpoints],
) => `${getAppBackendBaseUrl()}${endpoint}`;
