import {
  createEmptyVoiceRuntimeState,
  elevenLabsVoiceDefaults,
  type ElevenLabsBackgroundMessage,
  type ElevenLabsBackgroundResponse,
  type StoredElevenLabsVoiceAgent,
} from '../lib/voice-agent';
import {
  firecrawlToolNames,
  type FirecrawlBackgroundMessage,
  type FirecrawlBackgroundResponse,
  type FirecrawlScrapeToolResult,
  type FirecrawlSearchMode,
  type FirecrawlSearchTimeRange,
  type FirecrawlSearchToolResult,
} from '../lib/firecrawl';
import { extractPageContextFromDocument } from '../lib/page-context-extractor';
import type { PageSelectionSnapshot, PageSelectionUpdateMessage } from '../lib/page-selection';
import {
  type AnyPageContextMessage,
  pageContextToolNames,
  type PageContextBackgroundMessage,
  type PageContextBackgroundResponse,
  type PageContextExtractionInput,
  type ReadablePageContextSnapshot,
  type ReadablePageContextToolResult,
  type VisiblePageContextSnapshot,
  type VisiblePageContextToolResult,
} from '../lib/page-context';
import { appBackendBaseUrl, getAppBackendUrl, isAppBackendConfigured } from '../lib/app-backend';
import {
  createEmptyServiceState,
  type ServiceBackgroundMessage,
  type ServiceBackgroundResponse,
  type ServiceStatus,
  type ServiceStatusMap,
} from '../lib/service-runtime';

const maxFirecrawlResultCount = 5;
const maxFirecrawlScrapeMarkdownChars = 12_000;
const backendHealthCacheTtlMs = 30_000;
const backendInstallIdStorageKey = 'rockitt.install-id';
const firecrawlSearchModes: FirecrawlSearchMode[] = [
  'web',
  'news',
  'web-and-news',
];
const firecrawlTimeRanges: FirecrawlSearchTimeRange[] = [
  'any',
  'past-hour',
  'past-day',
  'past-week',
  'past-month',
  'past-year',
  'newest',
];
const maxReadablePageContextSections = 4;
const maxCachedPageSelectionAgeMs = 5 * 60 * 1000;
const pageSelectionByTabId = new Map<number, CachedPageSelection>();
let cachedServiceSnapshot:
  | {
      expiresAt: number;
      state: ServiceStatusMap;
      voiceRuntime: ReturnType<typeof createEmptyVoiceRuntimeState>;
    }
  | null = null;

type CachedPageSelection = PageSelectionSnapshot & {
  frameId: number;
  frameUrl: string;
  tabUrl: string;
  updatedAt: string;
};

const toDebugDetails = (details: unknown) => {
  if (details == null) {
    return null;
  }

  if (typeof details === 'string') {
    return details;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
};

const normalizeResponseMessage = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const nextValue = value
      .map((item) => normalizeResponseMessage(item))
      .filter((item): item is string => Boolean(item))
      .join(' | ');

    return nextValue || null;
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;

    return (
      normalizeResponseMessage(candidate.message) ??
      normalizeResponseMessage(candidate.detail) ??
      normalizeResponseMessage(candidate.error) ??
      toDebugDetails(candidate)
    );
  }

  return String(value);
};

const enableActionOpen = async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.error('Unable to enable side panel action behavior.', error);
  }
};

const restrictStorageAccess = async () => {
  try {
    if ('setAccessLevel' in chrome.storage.local) {
      await chrome.storage.local.setAccessLevel({
        accessLevel: 'TRUSTED_CONTEXTS',
      });
    }
  } catch (error) {
    console.error('Unable to restrict local storage access.', error);
  }
};

const readResponseMessage = async (response: Response) => {
  try {
    const data = (await response.json()) as unknown;

    return normalizeResponseMessage(data);
  } catch {
    return null;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readStringField = (value: unknown, key: string) => {
  if (!isObject(value)) {
    return null;
  }

  const nextValue = value[key];

  return typeof nextValue === 'string' ? nextValue : null;
};

const readNumberField = (value: unknown, key: string) => {
  if (!isObject(value)) {
    return null;
  }

  const nextValue = value[key];

  return typeof nextValue === 'number' && Number.isFinite(nextValue)
    ? nextValue
    : null;
};

const readBooleanField = (value: unknown, key: string) => {
  if (!isObject(value)) {
    return null;
  }

  const nextValue = value[key];

  return typeof nextValue === 'boolean' ? nextValue : null;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeToolText = (value: string, maxChars: number) => {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length <= maxChars) {
    return {
      text: normalized,
      truncated: false,
    };
  }

  return {
    text: `${normalized.slice(0, maxChars).trimEnd()}...`,
    truncated: true,
  };
};

const normalizePublicUrl = (value: string) => {
  const url = new URL(value.trim());

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Firecrawl can only fetch public http or https URLs.');
  }

  return url.toString();
};

const parseFirecrawlSearchParameters = (value: unknown) => {
  const query = readStringField(value, 'query')?.trim();

  if (!query) {
    throw new Error('Firecrawl search requires a query string.');
  }

  const modeValue = readStringField(value, 'mode');
  const timeRangeValue = readStringField(value, 'timeRange');
  const limitValue = readNumberField(value, 'limit');

  const mode = firecrawlSearchModes.includes(modeValue as FirecrawlSearchMode)
    ? (modeValue as FirecrawlSearchMode)
    : 'web';
  const timeRange = firecrawlTimeRanges.includes(
    timeRangeValue as FirecrawlSearchTimeRange,
  )
    ? (timeRangeValue as FirecrawlSearchTimeRange)
    : 'any';
  const limit = clamp(
    Math.trunc(limitValue ?? 3),
    1,
    maxFirecrawlResultCount,
  );

  return {
    limit,
    mode,
    query,
    timeRange,
  };
};

const parseFirecrawlScrapeParameters = (value: unknown) => {
  const url = readStringField(value, 'url')?.trim();

  if (!url) {
    throw new Error('Firecrawl scrape requires a URL.');
  }

  return {
    url: normalizePublicUrl(url),
  };
};

const parsePageContextReadableParameters = (
  value: unknown,
): Required<Pick<PageContextExtractionInput, 'maxSections'>> &
  Pick<PageContextExtractionInput, 'question'> => {
  const question = readStringField(value, 'question')?.trim() || undefined;
  const maxSections = clamp(
    Math.trunc(readNumberField(value, 'maxSections') ?? 3),
    1,
    maxReadablePageContextSections,
  );

  return {
    maxSections,
    question,
  };
};

const normalizeServiceStatus = (value: string | null): ServiceStatus => {
  if (
    value === 'checking' ||
    value === 'ready' ||
    value === 'degraded' ||
    value === 'unavailable'
  ) {
    return value;
  }

  return 'unavailable';
};

const toManagedVoiceAgent = (
  value: unknown,
): StoredElevenLabsVoiceAgent | null => {
  if (!isObject(value)) {
    return null;
  }

  const agentId =
    readStringField(value, 'agentId') ?? readStringField(value, 'agent_id');

  if (!agentId) {
    return null;
  }

  const turnEagernessValue = readStringField(value, 'turnEagerness');
  const turnEagerness =
    turnEagernessValue === 'patient' ||
    turnEagernessValue === 'normal' ||
    turnEagernessValue === 'eager'
      ? turnEagernessValue
      : elevenLabsVoiceDefaults.turnEagerness;

  return {
    agentId,
    agentName:
      readStringField(value, 'agentName') ?? elevenLabsVoiceDefaults.agentName,
    configVersion:
      readNumberField(value, 'configVersion') ??
      elevenLabsVoiceDefaults.configVersion,
    createdAt: readStringField(value, 'createdAt') ?? new Date().toISOString(),
    llm: readStringField(value, 'llm') ?? elevenLabsVoiceDefaults.llm,
    maxDurationSeconds:
      readNumberField(value, 'maxDurationSeconds') ??
      elevenLabsVoiceDefaults.maxDurationSeconds,
    maxTokens:
      readNumberField(value, 'maxTokens') ?? elevenLabsVoiceDefaults.maxTokens,
    ttsModelId:
      readStringField(value, 'ttsModelId') ?? elevenLabsVoiceDefaults.ttsModelId,
    turnEagerness,
    turnTimeout:
      readNumberField(value, 'turnTimeout') ?? elevenLabsVoiceDefaults.turnTimeout,
    voiceId: readStringField(value, 'voiceId') ?? elevenLabsVoiceDefaults.voiceId,
    voiceLabel:
      readStringField(value, 'voiceLabel') ?? elevenLabsVoiceDefaults.voiceLabel,
  };
};

const createUnavailableManagedServices = (message: string): ServiceStatusMap => {
  const checkedAt = new Date().toISOString();

  return {
    backend: {
      checkedAt,
      detail: message,
      status: 'unavailable',
      summary: 'Managed backend unavailable.',
    },
    elevenlabs: {
      checkedAt,
      detail: 'Managed voice depends on the Rockitt backend.',
      status: 'unavailable',
      summary: 'Managed ElevenLabs voice unavailable.',
    },
    firecrawl: {
      checkedAt,
      detail: 'Managed live web lookup depends on the Rockitt backend.',
      status: 'unavailable',
      summary: 'Managed Firecrawl lookup unavailable.',
    },
  };
};

const createManagedVoiceRuntime = (
  value: unknown,
  serviceState: ServiceStatusMap,
) => {
  const agent = toManagedVoiceAgent(value);
  const ready =
    serviceState.backend.status === 'ready' &&
    serviceState.elevenlabs.status === 'ready' &&
    (readBooleanField(value, 'ready') ?? Boolean(agent));

  if (!ready) {
    return createEmptyVoiceRuntimeState();
  }

  return {
    agent,
    costProfile: 'aggressive' as const,
    ready,
  };
};

const getOrCreateInstallId = async () => {
  const stored = await chrome.storage.local.get(backendInstallIdStorageKey);
  const existingId = stored[backendInstallIdStorageKey];

  if (typeof existingId === 'string' && existingId.trim()) {
    return existingId;
  }

  const nextId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `rockitt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  await chrome.storage.local.set({
    [backendInstallIdStorageKey]: nextId,
  });

  return nextId;
};

const fetchBackendJson = async (
  endpoint: string,
  options?: {
    body?: unknown;
    method?: 'GET' | 'POST';
    timeoutMs?: number;
  },
) => {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const installId = await getOrCreateInstallId();
    const requestHeaders = new Headers({
      'x-rockitt-install-id': installId,
    });

    if (options?.body !== undefined) {
      requestHeaders.set('Content-Type', 'application/json');
    }

    const response = await fetch(getAppBackendUrl(endpoint), {
      body:
        options?.body === undefined ? undefined : JSON.stringify(options.body),
      headers: requestHeaders,
      method: options?.method ?? 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        (await readResponseMessage(response)) ??
          `Rockitt backend request failed (${response.status}).`,
      );
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The Rockitt backend timed out.');
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

const loadManagedServiceSnapshot = async (force = false) => {
  if (!isAppBackendConfigured) {
    return {
      state: createUnavailableManagedServices(
        'Set WXT_BACKEND_BASE_URL before using managed providers.',
      ),
      voiceRuntime: createEmptyVoiceRuntimeState(),
    };
  }

  if (
    !force &&
    cachedServiceSnapshot &&
    cachedServiceSnapshot.expiresAt > Date.now()
  ) {
    return {
      state: cachedServiceSnapshot.state,
      voiceRuntime: cachedServiceSnapshot.voiceRuntime,
    };
  }

  try {
    const payload = await fetchBackendJson('/health', {
      timeoutMs: 4_000,
    });
    const checkedAt = readStringField(payload, 'checkedAt') ?? new Date().toISOString();
    const servicesPayload = isObject(payload) && isObject(payload.services)
      ? payload.services
      : {};
    const voicePayload =
      isObject(payload) && isObject(payload.voice) ? payload.voice : null;
    const state = createEmptyServiceState();

    (Object.keys(state) as (keyof ServiceStatusMap)[]).forEach((service) => {
      const nextValue = isObject(servicesPayload) ? servicesPayload[service] : null;

      if (!isObject(nextValue)) {
        state[service] = {
          checkedAt,
          detail:
            service === 'backend'
              ? `The backend responded from ${appBackendBaseUrl}.`
              : 'This managed service did not return health metadata.',
          status: service === 'backend' ? 'ready' : 'degraded',
          summary:
            service === 'backend'
              ? 'Managed backend reachable.'
              : 'Managed service missing health metadata.',
        };
        return;
      }

      state[service] = {
        checkedAt: readStringField(nextValue, 'checkedAt') ?? checkedAt,
        detail: readStringField(nextValue, 'detail'),
        status: normalizeServiceStatus(readStringField(nextValue, 'status')),
        summary:
          readStringField(nextValue, 'summary') ??
          (service === 'backend'
            ? 'Managed backend reachable.'
            : 'Managed service status updated.'),
      };
    });

    const voiceRuntime = createManagedVoiceRuntime(voicePayload, state);
    cachedServiceSnapshot = {
      expiresAt: Date.now() + backendHealthCacheTtlMs,
      state,
      voiceRuntime,
    };

    return {
      state,
      voiceRuntime,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to reach the Rockitt backend.';

    return {
      state: createUnavailableManagedServices(message),
      voiceRuntime: createEmptyVoiceRuntimeState(),
    };
  }
};

const getVoiceRuntimeState = async () => (await loadManagedServiceSnapshot()).voiceRuntime;

const extractConversationToken = (value: unknown) =>
  readStringField(value, 'token') ??
  readStringField(value, 'conversation_token') ??
  readStringField(value, 'conversationToken');

const executeFirecrawlSearch = async (
  parameters: unknown,
): Promise<FirecrawlSearchToolResult> => {
  const nextParameters = parseFirecrawlSearchParameters(parameters);
  const payload = await fetchBackendJson('/firecrawl/search', {
    body: nextParameters,
    method: 'POST',
    timeoutMs: 20_000,
  });

  if (!isObject(payload)) {
    throw new Error('The Rockitt backend returned an unexpected Firecrawl search response.');
  }

  return payload as FirecrawlSearchToolResult;
};

const executeFirecrawlScrape = async (
  parameters: unknown,
): Promise<FirecrawlScrapeToolResult> => {
  const nextParameters = parseFirecrawlScrapeParameters(parameters);
  const payload = await fetchBackendJson('/firecrawl/scrape', {
    body: nextParameters,
    method: 'POST',
    timeoutMs: 25_000,
  });

  if (!isObject(payload)) {
    throw new Error('The Rockitt backend returned an unexpected Firecrawl scrape response.');
  }

  return payload as FirecrawlScrapeToolResult;
};

const getActiveWebTab = async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  if (!tab?.id) {
    throw new Error('No active browser tab is available.');
  }

  if (!tab.url) {
    throw new Error('The active tab does not expose a readable URL yet.');
  }

  const protocol = new URL(tab.url).protocol;

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('Rockitt can only inspect normal http or https web pages.');
  }

  return tab;
};

const readInjectedResult = <T,>(value: unknown) => {
  if (!isObject(value)) {
    throw new Error('The current page returned an unexpected context payload.');
  }

  return value as T;
};

const clearCachedPageSelection = (tabId: number) => {
  pageSelectionByTabId.delete(tabId);
};

const getCachedPageSelection = (
  tabId: number,
  tabUrl: string,
): PageSelectionSnapshot | null => {
  const cachedSelection = pageSelectionByTabId.get(tabId);

  if (!cachedSelection) {
    return null;
  }

  if (cachedSelection.tabUrl !== tabUrl) {
    pageSelectionByTabId.delete(tabId);
    return null;
  }

  const ageMs = Date.now() - Date.parse(cachedSelection.updatedAt);

  if (!Number.isFinite(ageMs) || ageMs > maxCachedPageSelectionAgeMs) {
    pageSelectionByTabId.delete(tabId);
    return null;
  }

  return {
    source: cachedSelection.source,
    text: cachedSelection.text,
    truncated: cachedSelection.truncated,
  };
};

const executePageContextExtraction = async (
  input: PageContextExtractionInput,
): Promise<{
  snapshot: ReadablePageContextSnapshot | VisiblePageContextSnapshot;
  tab: chrome.tabs.Tab;
}> => {
  const tab = await getActiveWebTab();

  try {
    const [injectionResult] = await chrome.scripting.executeScript({
      args: [input],
      func: extractPageContextFromDocument,
      target: {
        tabId: tab.id,
      },
    });

    if (!injectionResult) {
      throw new Error('The current page did not return any context.');
    }

    return {
      snapshot: readInjectedResult<
        ReadablePageContextSnapshot | VisiblePageContextSnapshot
      >(injectionResult.result),
      tab,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      /Cannot access contents of url|cannot be scripted|Missing host permission|extensions gallery/i.test(
        message,
      )
    ) {
      throw new Error(
        'Rockitt cannot inspect this page. Open a normal website tab and try again.',
      );
    }

    if (/Frame with ID .* was removed/i.test(message)) {
      throw new Error('The page changed while Rockitt was reading it. Try again.');
    }

    throw error;
  }
};

const mergeCachedSelection = <T extends { selection: PageSelectionSnapshot | null }>(
  snapshot: T,
  tab: chrome.tabs.Tab,
): T => {
  if (snapshot.selection || !tab.id || !tab.url) {
    return snapshot;
  }

  const cachedSelection = getCachedPageSelection(tab.id, tab.url);

  if (!cachedSelection) {
    return snapshot;
  }

  return {
    ...snapshot,
    selection: cachedSelection,
  };
};

const cachePageSelectionUpdate = (
  message: PageSelectionUpdateMessage,
  sender: chrome.runtime.MessageSender,
) => {
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;

  if (!tabId || !tabUrl) {
    return;
  }

  if (!message.selection) {
    clearCachedPageSelection(tabId);
    return;
  }

  pageSelectionByTabId.set(tabId, {
    ...message.selection,
    frameId: sender.frameId ?? 0,
    frameUrl: message.url,
    tabUrl,
    updatedAt: new Date().toISOString(),
  });
};

const executeVisiblePageContext = async (
  _parameters: unknown,
): Promise<VisiblePageContextToolResult> => {
  const { snapshot, tab } = await executePageContextExtraction({
    kind: 'visible',
  });
  const mergedSnapshot = mergeCachedSelection(
    snapshot as VisiblePageContextSnapshot,
    tab,
  );

  return {
    ...mergedSnapshot,
    capturedAt: new Date().toISOString(),
    tool: pageContextToolNames.visible,
  };
};

const executeReadablePageContext = async (
  parameters: unknown,
): Promise<ReadablePageContextToolResult> => {
  const { snapshot, tab } = await executePageContextExtraction({
    kind: 'readable',
    ...parsePageContextReadableParameters(parameters),
  });
  const mergedSnapshot = mergeCachedSelection(
    snapshot as ReadablePageContextSnapshot,
    tab,
  );

  return {
    ...mergedSnapshot,
    capturedAt: new Date().toISOString(),
    tool: pageContextToolNames.readable,
  };
};

const startVoiceSession = async (): Promise<ElevenLabsBackgroundResponse> => {
  const snapshot = await loadManagedServiceSnapshot();

  if (
    snapshot.state.backend.status !== 'ready' ||
    snapshot.state.elevenlabs.status !== 'ready'
  ) {
    throw new Error(
      snapshot.state.elevenlabs.detail ??
        snapshot.state.backend.detail ??
        'Managed ElevenLabs voice is unavailable right now.',
    );
  }

  const payload = await fetchBackendJson('/voice/session', {
    body: {},
    method: 'POST',
    timeoutMs: 6_000,
  });
  const runtimePayload =
    isObject(payload) && isObject(payload.runtime) ? payload.runtime : null;
  const runtime = runtimePayload
    ? createManagedVoiceRuntime(
        isObject(runtimePayload) && isObject(runtimePayload.agent)
          ? runtimePayload.agent
          : runtimePayload,
        snapshot.state,
      )
    : snapshot.voiceRuntime;
  const conversationToken = extractConversationToken(payload);

  if (!conversationToken) {
    throw new Error(
      'The Rockitt backend did not return an ElevenLabs conversation token.',
    );
  }

  cachedServiceSnapshot = {
    expiresAt: Date.now() + backendHealthCacheTtlMs,
    state: snapshot.state,
    voiceRuntime: runtime,
  };

  return {
    ok: true,
    conversationToken,
    runtime,
  };
};

const toVoiceErrorResponse = async (
  error: unknown,
): Promise<ElevenLabsBackgroundResponse> => {
  return {
    ok: false,
    error:
      error instanceof Error ? error.message : 'Unknown ElevenLabs error occurred.',
    runtime: await getVoiceRuntimeState().catch(() => createEmptyVoiceRuntimeState()),
  };
};

const toServiceErrorResponse = async (
  error: unknown,
): Promise<ServiceBackgroundResponse> => {
  const snapshot = await loadManagedServiceSnapshot().catch(() => ({
    state: createUnavailableManagedServices(
      'Unable to load managed service state.',
    ),
    voiceRuntime: createEmptyVoiceRuntimeState(),
  }));

  return {
    ok: false,
    error:
      error instanceof Error ? error.message : 'Unknown extension error occurred.',
    state: snapshot.state,
    voiceRuntime: snapshot.voiceRuntime,
  };
};

const handleServiceMessage = async (
  message: ServiceBackgroundMessage,
): Promise<ServiceBackgroundResponse> => {
  switch (message.type) {
    case 'service-status:get-state': {
      const snapshot = await loadManagedServiceSnapshot();
      return {
        ok: true,
        state: snapshot.state,
        voiceRuntime: snapshot.voiceRuntime,
      };
    }
    default:
      return {
        ok: false,
        error: 'Unsupported managed service message.',
      };
  }
};

const handleVoiceMessage = async (
  message: ElevenLabsBackgroundMessage,
): Promise<ElevenLabsBackgroundResponse> => {
  switch (message.type) {
    case 'elevenlabs:get-runtime-state':
      return {
        ok: true,
        runtime: await getVoiceRuntimeState(),
      };
    case 'elevenlabs:start-session':
      return startVoiceSession();
    default:
      return {
        ok: false,
        error: 'Unsupported ElevenLabs message.',
      };
  }
};

const handleFirecrawlMessage = async (
  message: FirecrawlBackgroundMessage,
): Promise<FirecrawlBackgroundResponse> => {
  switch (message.type) {
    case 'firecrawl:search':
      return {
        ok: true,
        result: await executeFirecrawlSearch(message.parameters),
      };
    case 'firecrawl:scrape':
      return {
        ok: true,
        result: await executeFirecrawlScrape(message.parameters),
      };
    default:
      return {
        ok: false,
        error: 'Unsupported Firecrawl message.',
      };
  }
};

const handlePageContextMessage = async (
  message: AnyPageContextMessage,
  sender: chrome.runtime.MessageSender,
): Promise<PageContextBackgroundResponse | { ok: true }> => {
  switch (message.type) {
    case 'page-context:get-visible':
      return {
        ok: true,
        result: await executeVisiblePageContext(message.parameters),
      };
    case 'page-context:get-readable':
      return {
        ok: true,
        result: await executeReadablePageContext(message.parameters),
      };
    case 'page-context:selection-updated':
      cachePageSelectionUpdate(message, sender);
      return {
        ok: true,
      };
    default:
      return {
        ok: false,
        error: 'Unsupported page context message.',
      };
  }
};

const toFirecrawlErrorResponse = async (
  error: unknown,
): Promise<FirecrawlBackgroundResponse> => ({
  ok: false,
  error: error instanceof Error ? error.message : 'Unknown Firecrawl error occurred.',
});

const toPageContextErrorResponse = async (
  error: unknown,
): Promise<PageContextBackgroundResponse> => ({
  ok: false,
  error:
    error instanceof Error
      ? error.message
      : 'Unknown page context error occurred.',
});

export default defineBackground(() => {
  void enableActionOpen();
  void restrictStorageAccess();

  chrome.runtime.onInstalled.addListener(() => {
    void enableActionOpen();
    void restrictStorageAccess();
  });

  chrome.runtime.onStartup.addListener(() => {
    void enableActionOpen();
    void restrictStorageAccess();
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearCachedPageSelection(tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' || typeof changeInfo.url === 'string') {
      clearCachedPageSelection(tabId);
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      !message ||
      typeof message !== 'object' ||
      !('type' in message) ||
      typeof message.type !== 'string'
    ) {
      return false;
    }

    if (message.type.startsWith('service-status:')) {
      void handleServiceMessage(message as ServiceBackgroundMessage)
        .then(sendResponse)
        .catch(async (error) => {
          sendResponse(await toServiceErrorResponse(error));
        });

      return true;
    }

    if (message.type.startsWith('elevenlabs:')) {
      void handleVoiceMessage(message as ElevenLabsBackgroundMessage)
        .then(sendResponse)
        .catch(async (error) => {
          sendResponse(await toVoiceErrorResponse(error));
        });

      return true;
    }

    if (message.type.startsWith('firecrawl:')) {
      void handleFirecrawlMessage(message as FirecrawlBackgroundMessage)
        .then(sendResponse)
        .catch(async (error) => {
          sendResponse(await toFirecrawlErrorResponse(error));
        });

      return true;
    }

    if (message.type.startsWith('page-context:')) {
      void handlePageContextMessage(message as AnyPageContextMessage, sender)
        .then(sendResponse)
        .catch(async (error) => {
          sendResponse(await toPageContextErrorResponse(error));
        });

      return true;
    }

    return false;
  });
});
