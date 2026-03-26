import { useConversation } from '@elevenlabs/react';
import { Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ConversationView } from '../../components/ConversationView';
import { type DebugActivity } from '../../components/DebugActivityPanel';
import { RockittPageToggle } from '../../components/RockittPageToggle';
import { SettingsSheet } from '../../components/SettingsSheet';
import { VoiceOrb } from '../../components/VoiceOrb';
import { VoiceSessionControls } from '../../components/VoiceSessionControls';
import {
  sendFirecrawlMessage,
  sendPageContextMessage,
  sendServiceMessage,
  sendUsageMessage,
  sendVoiceMessage,
} from '../../lib/background-client';
import {
  firecrawlToolNames,
  type FirecrawlScrapeToolResult,
  type FirecrawlSearchToolResult,
} from '../../lib/firecrawl';
import {
  voiceStates,
  type PanelMode,
  type VoiceState,
} from '../../lib/mock-data';
import {
  pageContextToolNames,
  type ReadablePageContextToolResult,
  type VisiblePageContextToolResult,
} from '../../lib/page-context';
import {
  createEmptyVoiceRuntimeState,
  type ElevenLabsVoiceRuntimeState,
} from '../../lib/voice-agent';
import {
  microphonePermissionPagePath,
  type MicrophonePermissionResultMessage,
  type MicrophonePermissionState,
} from '../../lib/microphone-permission';
import {
  createEmptyServiceState,
  type ServiceStatusMap,
} from '../../lib/service-runtime';
import {
  createInitialUsageState,
  type UsageState,
} from '../../lib/usage-runtime';

type LiveChatMessage = {
  eventId?: number;
  id: string;
  meta?: string;
  role: 'assistant' | 'tool' | 'user';
  status?: 'error' | 'running' | 'success';
  text: string;
  toolCallId?: string;
};

const elevenLabsWorkletPaths = {
  audioConcatProcessor: chrome.runtime.getURL(
    'elevenlabs/audioConcatProcessor.js',
  ),
  rawAudioProcessor: chrome.runtime.getURL('elevenlabs/rawAudioProcessor.js'),
};

const pageContextToolStatusCopy = {
  [pageContextToolNames.readable]: 'Reading more from the current page.',
  [pageContextToolNames.visible]: 'Reading what is visible in the current page.',
} as const;

const firecrawlToolStatusCopy = {
  [firecrawlToolNames.scrape]: 'Fetching a live web page with Firecrawl.',
  [firecrawlToolNames.search]: 'Checking the live web with Firecrawl.',
} as const;

const knownToolTitleCopy = {
  end_call: 'End call',
  [firecrawlToolNames.scrape]: 'Firecrawl scrape',
  [firecrawlToolNames.search]: 'Firecrawl search',
  [pageContextToolNames.readable]: 'Page detail',
  [pageContextToolNames.visible]: 'Visible page',
} as const;

const compactToolStatusCopy = {
  end_call: 'ending',
  [firecrawlToolNames.scrape]: 'fetching',
  [firecrawlToolNames.search]: 'searching',
  [pageContextToolNames.readable]: 'reading',
  [pageContextToolNames.visible]: 'reading',
} as const;

const debugActivityStorageKey = 'rockitt.debug-activity.v1';
const maxDebugActivityCount = 24;
const clientToolErrorPrefix = 'Client tool execution failed with following error: ';

const isDomException = (value: unknown): value is DOMException =>
  value instanceof DOMException;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const createDebugActivityId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `debug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const readStoredDebugActivities = (): DebugActivity[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(debugActivityStorageKey);

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue);

    return Array.isArray(parsedValue)
      ? (parsedValue as DebugActivity[]).slice(0, maxDebugActivityCount)
      : [];
  } catch {
    return [];
  }
};

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  count === 1 ? singular : plural;

const normalizeUserMessageForQuota = (value: string) =>
  value.trim().replace(/\s+/g, ' ');

const formatUsageMoment = (value: string | null) => {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
};

const formatUsageResetAt = (value: string | null) =>
  formatUsageMoment(value) ?? 'when the current 24-hour window resets';

const getUsageBlockedMessage = (usage: UsageState) =>
  `This temporary trial allows ${String(usage.limit)} user ${pluralize(usage.limit, 'message')} per rolling 24 hours. Try again after ${formatUsageResetAt(usage.resetsAt)}.`;

const getUsageSettingsStatus = (usage: UsageState) => {
  if (usage.isOverrideUnlocked) {
    return 'Unlimited';
  }

  return `${String(Math.max(usage.remaining, 0))} left`;
};

const getMicrophoneSettingsStatus = (state: MicrophonePermissionState) => {
  switch (state) {
    case 'granted':
      return 'Allowed';
    case 'denied':
      return 'Blocked';
    case 'prompt':
      return 'Needs permission';
    case 'unsupported':
      return 'Unavailable';
    default:
      return 'Checking';
  }
};

const getFirecrawlSearchQuery = (parameters: unknown) => {
  if (!isRecord(parameters) || typeof parameters.query !== 'string') {
    return 'the requested query';
  }

  return `"${parameters.query}"`;
};

const getFirecrawlScrapeUrl = (parameters: unknown) => {
  if (!isRecord(parameters) || typeof parameters.url !== 'string') {
    return 'the requested URL';
  }

  return parameters.url;
};

const toTitleCase = (value: string) =>
  value.replace(/\b\w/g, (character) => character.toUpperCase());

const getToolTitle = (toolName: string) => {
  if (toolName in knownToolTitleCopy) {
    return knownToolTitleCopy[toolName as keyof typeof knownToolTitleCopy];
  }

  return toTitleCase(toolName.replace(/_/g, ' '));
};

const getToolSource = (
  toolName: string,
  toolType: string,
): DebugActivity['source'] => {
  if (
    toolName === pageContextToolNames.visible ||
    toolName === pageContextToolNames.readable
  ) {
    return 'browser';
  }

  if (
    toolName === firecrawlToolNames.search ||
    toolName === firecrawlToolNames.scrape
  ) {
    return 'firecrawl';
  }

  return toolType === 'client' ? 'browser' : 'agent';
};

const getToolRequestSummary = (toolName: string) => {
  if (toolName === pageContextToolNames.visible) {
    return 'Rockitt started reading what is visible in the active tab.';
  }

  if (toolName === pageContextToolNames.readable) {
    return 'Rockitt started reading more of the current page.';
  }

  if (toolName === firecrawlToolNames.search) {
    return 'Rockitt started a Firecrawl web search.';
  }

  if (toolName === firecrawlToolNames.scrape) {
    return 'Rockitt started a Firecrawl page scrape.';
  }

  return `${getToolTitle(toolName)} was requested by the agent.`;
};

const summarizeVisiblePageContextResult = (
  result: VisiblePageContextToolResult,
) => {
  const headingCopy = result.mainHeading ? ` Main heading: ${result.mainHeading}.` : '';
  const blockCount = result.visibleTextBlocks.length;
  const linkCount = result.visibleLinks.length;
  const selectionCopy = result.selection
    ? ` Selection captured from ${result.selection.source}.`
    : '';

  return `Read the visible ${result.pageType} view with ${String(blockCount)} text ${pluralize(blockCount, 'block')} and ${String(linkCount)} visible ${pluralize(linkCount, 'link')}.${headingCopy}${selectionCopy}`;
};

const summarizeReadablePageContextResult = (
  result: ReadablePageContextToolResult,
) => {
  const sectionCount = result.matchedSections.length;
  const questionCopy = result.question ? ` for "${result.question}"` : '';
  const selectionCopy = result.selection
    ? ` Selection captured from ${result.selection.source}.`
    : '';

  return `Read ${String(sectionCount)} relevant ${pluralize(sectionCount, 'section')}${questionCopy} from the current ${result.pageType} page.${selectionCopy}`;
};

const getFirecrawlSearchTarget = (result: FirecrawlSearchToolResult) =>
  result.mode === 'web-and-news'
    ? 'the live web and news'
    : result.mode === 'news'
      ? 'live news'
      : 'the live web';

const summarizeFirecrawlSearchResult = (result: FirecrawlSearchToolResult) => {
  if (!result.results.length) {
    return `Searched ${getFirecrawlSearchTarget(result)} for "${result.query}" and got 0 results.`;
  }

  const webCount = result.results.filter((item) => item.source === 'web').length;
  const newsCount = result.results.filter((item) => item.source === 'news').length;
  const sourceCounts = [
    webCount ? `${webCount} web ${pluralize(webCount, 'page')}` : null,
    newsCount ? `${newsCount} news ${pluralize(newsCount, 'result')}` : null,
  ].filter(Boolean);

  return `Searched ${getFirecrawlSearchTarget(result)} for "${result.query}" and returned ${sourceCounts.join(' and ')}.`;
};

const summarizeFirecrawlScrapeResult = (result: FirecrawlScrapeToolResult) => {
  const titleCopy = result.title?.trim() ? ` Title: ${result.title.trim()}.` : '';
  const statusCopy =
    result.statusCode != null ? ` with status ${String(result.statusCode)}` : '';
  const truncationCopy = result.truncated
    ? ' Markdown was truncated for the tool response.'
    : '';

  return `Fetched ${result.url}${statusCopy}.${titleCopy}${truncationCopy}`;
};

const getToolResponseSummary = (
  toolName: string,
  options: {
    isError: boolean;
    isCalled: boolean;
  },
) => {
  if (options.isError) {
    return `${getToolTitle(toolName)} failed.`;
  }

  if (!options.isCalled) {
    return `${getToolTitle(toolName)} was skipped by the agent.`;
  }

  return `${getToolTitle(toolName)} completed successfully.`;
};

const getCompactToolStatus = (
  toolName: string,
  status: NonNullable<LiveChatMessage['status']>,
) => {
  if (status === 'error') {
    if (toolName === firecrawlToolNames.search) {
      return 'search failed';
    }

    if (toolName === firecrawlToolNames.scrape) {
      return 'fetch failed';
    }

    if (
      toolName === pageContextToolNames.visible ||
      toolName === pageContextToolNames.readable
    ) {
      return 'read failed';
    }

    return 'failed';
  }

  if (toolName in compactToolStatusCopy) {
    return compactToolStatusCopy[toolName as keyof typeof compactToolStatusCopy];
  }

  return 'working';
};

const normalizeConversationError = (message: string) =>
  message.startsWith(clientToolErrorPrefix)
    ? message.slice(clientToolErrorPrefix.length)
    : message;

const createLiveMessage = (
  role: LiveChatMessage['role'],
  text: string,
  options?: {
    eventId?: number;
    meta?: string;
    status?: LiveChatMessage['status'];
    toolCallId?: string;
  },
): LiveChatMessage => ({
  eventId: options?.eventId,
  id:
    options?.eventId == null
      ? `${role}-${Date.now()}`
      : `${role}-${String(options.eventId)}`,
  meta: options?.meta,
  role,
  status: options?.status,
  text,
  toolCallId: options?.toolCallId,
});

type TentativeUserTranscriptDebugEvent = {
  tentative_user_transcription_event: {
    event_id: number;
    user_transcript: string;
  };
  type: 'tentative_user_transcript';
};

type AgentResponseCorrectionDebugEvent = {
  agent_response_correction_event: {
    corrected_agent_response: string;
    event_id: number;
  };
  type: 'agent_response_correction';
};

const isTentativeUserTranscriptDebugEvent = (
  value: unknown,
): value is TentativeUserTranscriptDebugEvent => {
  if (!isRecord(value) || value.type !== 'tentative_user_transcript') {
    return false;
  }

  const event = value.tentative_user_transcription_event;

  return (
    isRecord(event) &&
    typeof event.event_id === 'number' &&
    typeof event.user_transcript === 'string'
  );
};

const isAgentResponseCorrectionDebugEvent = (
  value: unknown,
): value is AgentResponseCorrectionDebugEvent => {
  if (!isRecord(value) || value.type !== 'agent_response_correction') {
    return false;
  }

  const event = value.agent_response_correction_event;

  return (
    isRecord(event) &&
    typeof event.event_id === 'number' &&
    typeof event.corrected_agent_response === 'string'
  );
};

const findLastMatchingMessageIndex = (
  messages: LiveChatMessage[],
  predicate: (message: LiveChatMessage) => boolean,
) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) {
      return index;
    }
  }

  return -1;
};

const getEventMessageInsertIndex = (
  messages: LiveChatMessage[],
  nextMessage: LiveChatMessage,
) => {
  if (nextMessage.eventId == null) {
    return messages.length;
  }

  const sameEventMessages = messages
    .map((message, index) => ({ index, message }))
    .filter(
      ({ message }) =>
        message.eventId === nextMessage.eventId && message.toolCallId == null,
    );

  if (!sameEventMessages.length) {
    return messages.length;
  }

  if (nextMessage.role === 'user') {
    const firstNonUserMessage = sameEventMessages.find(
      ({ message }) => message.role !== 'user',
    );

    if (firstNonUserMessage) {
      return firstNonUserMessage.index;
    }
  }

  return sameEventMessages[sameEventMessages.length - 1].index + 1;
};

const upsertLiveMessage = (
  messages: LiveChatMessage[],
  nextMessage: LiveChatMessage,
) => {
  if (nextMessage.toolCallId) {
    const existingIndex = messages.findIndex(
      (message) => message.toolCallId === nextMessage.toolCallId,
    );

    if (existingIndex === -1) {
      return [...messages, nextMessage];
    }

    const nextMessages = [...messages];
    nextMessages[existingIndex] = nextMessage;

    return nextMessages;
  }

  if (nextMessage.eventId == null) {
    return [...messages, nextMessage];
  }

  const existingIndex = messages.findIndex(
    (message) =>
      message.eventId === nextMessage.eventId &&
      message.role === nextMessage.role,
  );

  if (existingIndex === -1) {
    const insertIndex = getEventMessageInsertIndex(messages, nextMessage);

    if (insertIndex >= messages.length) {
      return [...messages, nextMessage];
    }

    return [
      ...messages.slice(0, insertIndex),
      nextMessage,
      ...messages.slice(insertIndex),
    ];
  }

  const nextMessages = [...messages];
  nextMessages[existingIndex] = nextMessage;

  return nextMessages;
};

const finalizeLiveMessage = (
  messages: LiveChatMessage[],
  nextMessage: LiveChatMessage,
) => {
  if (
    nextMessage.role === 'tool' ||
    nextMessage.meta ||
    nextMessage.eventId == null
  ) {
    return upsertLiveMessage(messages, nextMessage);
  }

  const existingIndex = messages.findIndex(
    (message) =>
      message.eventId === nextMessage.eventId &&
      message.role === nextMessage.role,
  );

  if (existingIndex !== -1) {
    return upsertLiveMessage(messages, nextMessage);
  }

  const liveMessageIndex = findLastMatchingMessageIndex(
    messages,
    (message) => message.role === nextMessage.role && message.meta === 'live',
  );

  if (liveMessageIndex === -1) {
    return upsertLiveMessage(messages, nextMessage);
  }

  const liveMessage = messages[liveMessageIndex];
  const nextMessages = [...messages];
  nextMessages[liveMessageIndex] = {
    ...liveMessage,
    ...nextMessage,
    id: liveMessage.id,
    meta: undefined,
  };

  return nextMessages;
};

const applyAssistantStreamPart = (
  messages: LiveChatMessage[],
  part: {
    eventId: number;
    text: string;
    type: 'delta' | 'start' | 'stop';
  },
) => {
  const existingMessage = messages.find(
    (message) =>
      message.eventId === part.eventId && message.role === 'assistant',
  );

  if (part.type === 'stop') {
    if (!existingMessage) {
      return messages;
    }

    return upsertLiveMessage(messages, {
      ...existingMessage,
      meta: undefined,
    });
  }

  const nextText =
    part.type === 'delta'
      ? `${existingMessage?.text ?? ''}${part.text}`
      : part.text || existingMessage?.text || '';

  if (!nextText.trim()) {
    return messages;
  }

  return upsertLiveMessage(
    messages,
    createLiveMessage('assistant', nextText, {
      eventId: part.eventId,
      meta: 'live',
    }),
  );
};

const toVoiceState = (
  status: 'disconnected' | 'connecting' | 'connected' | 'disconnecting',
  isSpeaking: boolean,
  isAwaitingReply: boolean,
): VoiceState => {
  if (status === 'disconnected' || status === 'disconnecting') {
    return 'idle';
  }

  if (status === 'connecting') {
    return 'thinking';
  }

  if (isSpeaking) {
    return 'speaking';
  }

  if (isAwaitingReply) {
    return 'thinking';
  }

  return 'listening';
};

const formatDisconnectError = (
  details:
    | {
        message?: string;
        reason: 'agent' | 'error' | 'user';
      }
    | undefined,
) => {
  if (!details || details.reason === 'user') {
    return null;
  }

  if (details.reason === 'agent') {
    return 'The voice session ended on the agent side.';
  }

  return details.message ?? 'The voice session ended unexpectedly.';
};

const formatDisconnectSummary = (
  details:
    | {
        message?: string;
        reason: 'agent' | 'error' | 'user';
      }
    | undefined,
) => {
  if (!details) {
    return 'Voice session disconnected.';
  }

  if (details.reason === 'user') {
    return 'Voice session ended locally.';
  }

  if (details.reason === 'agent') {
    return 'The agent ended the voice session.';
  }

  return details.message ?? 'Voice session ended with an unexpected error.';
};

export function App() {
  const [chatDraft, setChatDraft] = useState('');
  const [debugActivities, setDebugActivities] = useState<DebugActivity[]>(
    () => readStoredDebugActivities(),
  );
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStartingVoice, setIsStartingVoice] = useState(false);
  const [isRefreshingServices, setIsRefreshingServices] = useState(false);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [microphoneState, setMicrophoneState] =
    useState<MicrophonePermissionState>('unknown');
  const [panelMode, setPanelMode] = useState<PanelMode>('voice');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [serviceState, setServiceState] =
    useState<ServiceStatusMap>(createEmptyServiceState());
  const [usageOverrideCode, setUsageOverrideCode] = useState('');
  const [usageState, setUsageState] = useState<UsageState>(
    createInitialUsageState(),
  );
  const [voiceRuntime, setVoiceRuntime] = useState<ElevenLabsVoiceRuntimeState>(
    createEmptyVoiceRuntimeState(),
  );
  const [isClearingUsageOverride, setIsClearingUsageOverride] = useState(false);
  const [isUnlockingUsageOverride, setIsUnlockingUsageOverride] = useState(false);
  const pendingTypedUserMessagesRef = useRef<string[]>([]);
  const shouldEndSessionForUsageRef = useRef(false);
  const pendingClientToolIdsRef = useRef<Record<string, string[]>>({});
  const toolActivityIdsRef = useRef<Record<string, string>>({});
  const toolSourceRef = useRef<Record<string, DebugActivity['source']>>({});

  const appendDebugActivity = (
    activity: Omit<DebugActivity, 'createdAt' | 'id'> &
      Partial<Pick<DebugActivity, 'createdAt' | 'id'>>,
  ) => {
    const nextActivity: DebugActivity = {
      createdAt: new Date().toISOString(),
      id: createDebugActivityId(),
      ...activity,
    };

    setDebugActivities((currentActivities) =>
      [nextActivity, ...currentActivities].slice(0, maxDebugActivityCount),
    );

    return nextActivity.id;
  };

  const updateDebugActivity = (
    activityId: string,
    updater: (activity: DebugActivity) => DebugActivity,
  ) => {
    setDebugActivities((currentActivities) =>
      currentActivities.map((activity) =>
        activity.id === activityId ? updater(activity) : activity,
      ),
    );
  };

  const addSessionDebugActivity = (
    title: string,
    summary: string,
    status: DebugActivity['status'],
    raw?: unknown,
  ) => {
    appendDebugActivity({
      raw,
      source: 'session',
      status,
      summary,
      title,
    });
  };

  const loadUsageState = async () => {
    const response = await sendUsageMessage({
      type: 'usage:get-state',
    });

    if (response.usage) {
      setUsageState(response.usage);
    }

    if (!response.ok) {
      throw new Error(response.error);
    }

    return response.usage;
  };

  const consumeUsage = async (source: 'chat' | 'voice') => {
    const response = await sendUsageMessage({
      source,
      type: 'usage:consume-user-message',
    });

    if (response.usage) {
      setUsageState(response.usage);
    }

    if (!response.ok) {
      throw new Error(response.error);
    }

    return response.usage;
  };

  const unlockUsageOverride = async () => {
    setIsUnlockingUsageOverride(true);

    try {
      const response = await sendUsageMessage({
        code: usageOverrideCode,
        type: 'usage:unlock-override',
      });

      if (response.usage) {
        setUsageState(response.usage);
      }

      if (!response.ok) {
        throw new Error(response.error);
      }

      shouldEndSessionForUsageRef.current = false;
      pendingTypedUserMessagesRef.current = [];
      setUsageOverrideCode('');
      setRequestError(null);
      setRequestNotice('Unlimited access enabled on this browser profile.');
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Unable to unlock unlimited access on this browser profile.',
      );
    } finally {
      setIsUnlockingUsageOverride(false);
    }
  };

  const clearUsageOverride = async () => {
    setIsClearingUsageOverride(true);

    try {
      const response = await sendUsageMessage({
        type: 'usage:clear-override',
      });

      if (response.usage) {
        setUsageState(response.usage);
      }

      if (!response.ok) {
        throw new Error(response.error);
      }

      shouldEndSessionForUsageRef.current = false;
      pendingTypedUserMessagesRef.current = [];
      setUsageOverrideCode('');
      setRequestError(null);
      setRequestNotice(
        'Unlimited access removed. The local trial limit is active again.',
      );
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Unable to remove unlimited access on this browser profile.',
      );
    } finally {
      setIsClearingUsageOverride(false);
    }
  };

  const applyPostMessageUsage = (nextUsage: UsageState) => {
    if (!nextUsage.allowed) {
      shouldEndSessionForUsageRef.current = true;
      setRequestError(null);
      setRequestNotice(
        'Last trial message sent. Rockitt will end the live session after this reply.',
      );
      return;
    }

    if (nextUsage.remaining <= 2) {
      setRequestNotice(
        `${String(nextUsage.remaining)} trial ${pluralize(nextUsage.remaining, 'message')} left in the current 24-hour window.`,
      );
    }
  };

  const maybeConsumeVoiceUsage = (message: string) => {
    const normalizedMessage = normalizeUserMessageForQuota(message);
    const [nextTypedMessage, ...rest] = pendingTypedUserMessagesRef.current;

    if (nextTypedMessage === normalizedMessage) {
      pendingTypedUserMessagesRef.current = rest;
      return;
    }

    void consumeUsage('voice')
      .then((nextUsage) => {
        applyPostMessageUsage(nextUsage);
      })
      .catch((error) => {
        setRequestError(
          error instanceof Error
            ? error.message
            : 'Unable to update the local trial limit.',
        );
      });
  };

  const setToolMessage = (
    toolCallId: string,
    toolName: string,
    status: NonNullable<LiveChatMessage['status']>,
  ) => {
    setMessages((currentMessages) =>
      upsertLiveMessage(currentMessages, {
        id: `tool-${toolCallId}`,
        role: 'tool',
        status,
        text: getCompactToolStatus(toolName, status),
        toolCallId,
      }),
    );
  };

  const clearToolMessage = (toolCallId: string) => {
    setMessages((currentMessages) =>
      currentMessages.filter((message) => message.toolCallId !== toolCallId),
    );
  };

  const ensureToolActivity = (
    toolCallId: string,
    toolName: string,
    toolType: string,
  ) => {
    const existingActivityId = toolActivityIdsRef.current[toolCallId];

    if (existingActivityId) {
      return existingActivityId;
    }

    const source = getToolSource(toolName, toolType);
    const activityId = appendDebugActivity({
      source,
      status: 'running',
      summary: getToolRequestSummary(toolName),
      title: getToolTitle(toolName),
      toolCall: {
        name: toolName,
        toolCallId,
        type: toolType,
      },
    });

    toolActivityIdsRef.current[toolCallId] = activityId;
    toolSourceRef.current[toolCallId] = source;
    setToolMessage(toolCallId, toolName, 'running');

    return activityId;
  };

  const enqueuePendingClientTool = (toolName: string, toolCallId: string) => {
    const queue = pendingClientToolIdsRef.current[toolName] ?? [];
    pendingClientToolIdsRef.current[toolName] = [...queue, toolCallId];
  };

  const dequeuePendingClientTool = (toolName: string) => {
    const queue = pendingClientToolIdsRef.current[toolName] ?? [];

    if (!queue.length) {
      return null;
    }

    const [toolCallId, ...rest] = queue;
    pendingClientToolIdsRef.current[toolName] = rest;
    return toolCallId;
  };

  const registerToolRequest = (
    toolName: string,
    toolType: string,
    toolCallId: string,
  ) => {
    ensureToolActivity(toolCallId, toolName, toolType);

    if (toolType === 'client') {
      enqueuePendingClientTool(toolName, toolCallId);
    }
  };

  const executeFirecrawlTool = async (
    toolName:
      | typeof firecrawlToolNames.scrape
      | typeof firecrawlToolNames.search,
    parameters: unknown,
  ) => {
    setRequestError(null);
    setRequestNotice(firecrawlToolStatusCopy[toolName]);

    const toolCallId = dequeuePendingClientTool(toolName) ?? createDebugActivityId();
    const activityId = ensureToolActivity(toolCallId, toolName, 'client');
    const source = toolSourceRef.current[toolCallId] ?? 'firecrawl';

    updateDebugActivity(activityId, (activity) => ({
      ...activity,
      source,
      status: 'running',
      summary:
        toolName === firecrawlToolNames.search
          ? `Started a live web search for ${getFirecrawlSearchQuery(parameters)}.`
          : `Started fetching ${getFirecrawlScrapeUrl(parameters)} with Firecrawl.`,
      toolCall: {
        name: toolName,
        parameters,
        toolCallId,
        type: 'client',
      },
    }));
    setToolMessage(toolCallId, toolName, 'running');

    try {
      const response = await sendFirecrawlMessage(
        toolName === firecrawlToolNames.search
          ? {
              type: 'firecrawl:search',
              parameters,
            }
          : {
              type: 'firecrawl:scrape',
              parameters,
            },
      );

      if (!response.ok) {
        throw new Error(response.error);
      }

      const summary =
        toolName === firecrawlToolNames.search
          ? summarizeFirecrawlSearchResult(
              response.result as FirecrawlSearchToolResult,
            )
          : summarizeFirecrawlScrapeResult(
              response.result as FirecrawlScrapeToolResult,
            );

      updateDebugActivity(activityId, (activity) => ({
        ...activity,
        status: 'success',
        summary,
        toolCall: {
          name: toolName,
          parameters,
          result: response.result,
          toolCallId,
          type: 'client',
        },
      }));
      clearToolMessage(toolCallId);
      setRequestNotice('Live web lookup complete.');

      return JSON.stringify(response.result);
    } catch (error) {
      const nextError =
        error instanceof Error ? error.message : 'Unknown Firecrawl error.';

      updateDebugActivity(activityId, (activity) => ({
        ...activity,
        error: nextError,
        status: 'error',
        summary: `${getToolTitle(toolName)} failed: ${nextError}`,
        toolCall: {
          ...(activity.toolCall ?? {
            name: toolName,
            toolCallId,
            type: 'client',
          }),
          name: toolName,
          parameters,
          toolCallId,
          type: 'client',
        },
      }));
      setToolMessage(toolCallId, toolName, 'error');

      throw new Error(nextError);
    }
  };

  const executePageContextTool = async (
    toolName:
      | typeof pageContextToolNames.readable
      | typeof pageContextToolNames.visible,
    parameters: unknown,
  ) => {
    setRequestError(null);
    setRequestNotice(pageContextToolStatusCopy[toolName]);

    const toolCallId = dequeuePendingClientTool(toolName) ?? createDebugActivityId();
    const activityId = ensureToolActivity(toolCallId, toolName, 'client');
    const source = toolSourceRef.current[toolCallId] ?? 'browser';

    updateDebugActivity(activityId, (activity) => ({
      ...activity,
      source,
      status: 'running',
      summary: getToolRequestSummary(toolName),
      toolCall: {
        name: toolName,
        parameters,
        toolCallId,
        type: 'client',
      },
    }));
    setToolMessage(toolCallId, toolName, 'running');

    try {
      const response = await sendPageContextMessage(
        toolName === pageContextToolNames.visible
          ? {
              type: 'page-context:get-visible',
              parameters,
            }
          : {
              type: 'page-context:get-readable',
              parameters,
            },
      );

      if (!response.ok) {
        throw new Error(response.error);
      }

      const summary =
        toolName === pageContextToolNames.visible
          ? summarizeVisiblePageContextResult(
              response.result as VisiblePageContextToolResult,
            )
          : summarizeReadablePageContextResult(
              response.result as ReadablePageContextToolResult,
            );

      updateDebugActivity(activityId, (activity) => ({
        ...activity,
        status: 'success',
        summary,
        toolCall: {
          name: toolName,
          parameters,
          result: response.result,
          toolCallId,
          type: 'client',
        },
      }));
      clearToolMessage(toolCallId);
      setRequestNotice('Page context ready.');

      return JSON.stringify(response.result);
    } catch (error) {
      const nextError =
        error instanceof Error ? error.message : 'Unknown page context error.';

      updateDebugActivity(activityId, (activity) => ({
        ...activity,
        error: nextError,
        status: 'error',
        summary: `${getToolTitle(toolName)} failed: ${nextError}`,
        toolCall: {
          ...(activity.toolCall ?? {
            name: toolName,
            toolCallId,
            type: 'client',
          }),
          name: toolName,
          parameters,
          toolCallId,
          type: 'client',
        },
      }));
      setToolMessage(toolCallId, toolName, 'error');

      throw new Error(nextError);
    }
  };

  const conversation = useConversation({
    clientTools: {
      [firecrawlToolNames.scrape]: async (parameters) =>
        executeFirecrawlTool(firecrawlToolNames.scrape, parameters),
      [firecrawlToolNames.search]: async (parameters) =>
        executeFirecrawlTool(firecrawlToolNames.search, parameters),
      [pageContextToolNames.readable]: async (parameters) =>
        executePageContextTool(pageContextToolNames.readable, parameters),
      [pageContextToolNames.visible]: async (parameters) =>
        executePageContextTool(pageContextToolNames.visible, parameters),
    },
    connectionDelay: {
      android: 750,
      default: 0,
      ios: 0,
    },
    micMuted: isMicMuted,
    onConnect: () => {
      setRequestError(null);
      setRequestNotice('Voice session live.');
      shouldEndSessionForUsageRef.current = false;
      addSessionDebugActivity(
        'Voice session connected',
        'The live ElevenLabs session is active.',
        'success',
      );
    },
    onDisconnect: (details) => {
      setIsAwaitingReply(false);
      pendingTypedUserMessagesRef.current = [];
      shouldEndSessionForUsageRef.current = false;

      const nextError = formatDisconnectError(details);
      const summary = formatDisconnectSummary(details);

      addSessionDebugActivity(
        nextError ? 'Voice session ended with error' : 'Voice session ended',
        nextError ?? summary,
        nextError ? 'error' : 'info',
        details
          ? {
              message: details.message,
              reason: details.reason,
            }
          : undefined,
      );

      if (nextError) {
        setRequestError(nextError);
        return;
      }

      if (details?.reason === 'agent') {
        setRequestNotice('Voice session ended.');
      }
    },
    onError: (message) => {
      setIsAwaitingReply(false);
      const nextMessage = normalizeConversationError(message);

      setRequestError(nextMessage);

      if (!message.startsWith(clientToolErrorPrefix)) {
        addSessionDebugActivity(
          'Live session error',
          nextMessage,
          'error',
          {
            message,
          },
        );
      }
    },
    onAgentToolRequest: ({ tool_call_id, tool_name, tool_type }) => {
      registerToolRequest(tool_name, tool_type, tool_call_id);
    },
    onAgentToolResponse: ({
      is_called,
      is_error,
      tool_call_id,
      tool_name,
      tool_type,
    }) => {
      const activityId = ensureToolActivity(tool_call_id, tool_name, tool_type);
      const source =
        toolSourceRef.current[tool_call_id] ?? getToolSource(tool_name, tool_type);

      updateDebugActivity(activityId, (activity) => ({
        ...activity,
        source,
        status: is_error ? 'error' : 'success',
        summary:
          !is_error && activity.toolCall?.result
            ? activity.summary
            : getToolResponseSummary(tool_name, {
                isCalled: is_called,
                isError: is_error,
              }),
        toolCall: {
          ...(activity.toolCall ?? {
            name: tool_name,
            toolCallId: tool_call_id,
            type: tool_type,
          }),
          name: tool_name,
          toolCallId: tool_call_id,
          type: tool_type,
        },
      }));
      if (is_error) {
        setToolMessage(tool_call_id, tool_name, 'error');
      } else {
        clearToolMessage(tool_call_id);
      }

      if (!is_error && tool_name in firecrawlToolStatusCopy) {
        setRequestNotice('Live web lookup complete.');
      }

      if (!is_error && tool_name in pageContextToolStatusCopy) {
        setRequestNotice('Page context ready.');
      }
    },
    onAgentChatResponsePart: ({ event_id, text, type }) => {
      setMessages((currentMessages) =>
        applyAssistantStreamPart(currentMessages, {
          eventId: event_id,
          text,
          type,
        }),
      );

      if (type !== 'stop') {
        setIsAwaitingReply(false);
        return;
      }

      if (
        shouldEndSessionForUsageRef.current &&
        conversation.status === 'connected'
      ) {
        shouldEndSessionForUsageRef.current = false;
        setRequestNotice(
          `Trial limit reached. Voice resumes after ${formatUsageResetAt(usageState.resetsAt)}.`,
        );
        void conversation.endSession();
      }
    },
    onDebug: (info) => {
      if (isTentativeUserTranscriptDebugEvent(info)) {
        const { event_id, user_transcript } = info.tentative_user_transcription_event;

        setMessages((currentMessages) =>
          upsertLiveMessage(
            currentMessages,
            createLiveMessage('user', user_transcript, {
              eventId: event_id,
              meta: 'live',
            }),
          ),
        );
        setIsAwaitingReply(true);
        return;
      }

      if (isAgentResponseCorrectionDebugEvent(info)) {
        const { corrected_agent_response, event_id } =
          info.agent_response_correction_event;

        setMessages((currentMessages) =>
          upsertLiveMessage(
            currentMessages,
            createLiveMessage('assistant', corrected_agent_response, {
              eventId: event_id,
            }),
          ),
        );
      }
    },
    onMessage: ({ event_id, message, role }) => {
      setMessages((currentMessages) =>
        finalizeLiveMessage(
          currentMessages,
          createLiveMessage(role === 'agent' ? 'assistant' : 'user', message, {
            eventId: event_id,
          }),
        ),
      );

      setIsAwaitingReply(role === 'user');

      if (role === 'user') {
        maybeConsumeVoiceUsage(message);
      }
    },
    onModeChange: ({ mode }) => {
      if (mode === 'speaking') {
        setIsAwaitingReply(false);
      }
    },
    useWakeLock: false,
    workletPaths: elevenLabsWorkletPaths,
  });

  const applyServiceResponse = (
    nextState: ServiceStatusMap,
    nextUsage: UsageState,
    nextVoiceRuntime: ElevenLabsVoiceRuntimeState,
  ) => {
    setServiceState(nextState);
    setUsageState(nextUsage);
    setVoiceRuntime(nextVoiceRuntime);
  };

  const loadServiceState = async (
    preserveMessages = false,
  ): Promise<ServiceStatusMap | null> => {
    if (!preserveMessages) {
      setRequestError(null);
      setRequestNotice(null);
    }

    setIsRefreshingServices(true);

    try {
      const response = await sendServiceMessage({
        type: 'service-status:get-state',
      });

      if (!response.ok) {
        if (response.state && response.voiceRuntime && response.usage) {
          applyServiceResponse(
            response.state,
            response.usage,
            response.voiceRuntime,
          );
        } else if (response.state) {
          setServiceState(response.state);
        } else if (response.usage) {
          setUsageState(response.usage);
        } else if (response.voiceRuntime) {
          setVoiceRuntime(response.voiceRuntime);
        }

        setRequestError(response.error);
        return response.state ?? null;
      }

      applyServiceResponse(response.state, response.usage, response.voiceRuntime);
      return response.state;
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Unable to load managed service state.',
      );
      return null;
    } finally {
      setIsRefreshingServices(false);
    }
  };

  const getMicrophonePermissionState = async (): Promise<MicrophonePermissionState> => {
    if (!('permissions' in navigator) || !navigator.permissions?.query) {
      return 'unsupported';
    }

    try {
      const result = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });

      return result.state;
    } catch {
      return 'unsupported';
    }
  };

  const refreshMicrophonePermissionState = async () => {
    const nextState = await getMicrophonePermissionState();
    setMicrophoneState(nextState);
    return nextState;
  };

  const openMicrophonePermissionPage = async () => {
    setRequestError(null);
    setRequestNotice(
      'Opened a full extension tab to request microphone access. Allow it there, then return to Rockitt.',
    );

    const permissionPageUrl = chrome.runtime.getURL(microphonePermissionPagePath);
    const permissionPageWindow = window.open(
      permissionPageUrl,
      '_blank',
      'noopener,noreferrer',
    );

    if (permissionPageWindow) {
      return;
    }

    setRequestError(
      'Chrome blocked the microphone permission tab. Try again and make sure popups are allowed for Chrome extensions.',
    );
  };

  const ensureMicrophoneAccess = async () => {
    const beforeState = await refreshMicrophonePermissionState();

    if (beforeState === 'prompt') {
      setRequestNotice(
        'Chrome will ask for microphone access in the main browser toolbar. If no modal appears, look for the mic permission chip near the address bar.',
      );
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      stream.getTracks().forEach((track) => track.stop());

      setMicrophoneState('granted');
      setRequestNotice('Microphone ready. Connecting the live voice session.');
      return true;
    } catch (error) {
      const afterState = await refreshMicrophonePermissionState();
      let nextMessage =
        'Microphone access was dismissed or blocked. Accept the Chrome microphone prompt and try again.';

      if (isDomException(error) && error.name === 'NotFoundError') {
        nextMessage = 'No microphone was found on this device.';
      } else if (isDomException(error) && error.name === 'NotReadableError') {
        nextMessage =
          'Chrome could not access the microphone. It may already be in use by another app.';
      } else if (
        isDomException(error) &&
        error.name === 'NotAllowedError' &&
        afterState === 'prompt'
      ) {
        nextMessage =
          'Chrome could not show the microphone prompt inside the side panel. Open the microphone permission tab below, allow access there, then tap the orb again.';
      } else if (afterState === 'denied') {
        nextMessage =
          'Microphone access is blocked for this extension panel. Re-enable it in Chrome, then tap the orb again.';
      }

      setRequestError(nextMessage);

      return false;
    }
  };

  const startVoiceSession = async () => {
    setIsStartingVoice(true);
    setRequestError(null);
    setRequestNotice(null);

    try {
      const currentUsage = await loadUsageState();

      if (!currentUsage.allowed) {
        throw new Error(getUsageBlockedMessage(currentUsage));
      }

      const hasMicrophoneAccess = await ensureMicrophoneAccess();

      if (!hasMicrophoneAccess) {
        return;
      }

      const response = await sendVoiceMessage({
        type: 'elevenlabs:start-session',
      });

      if (!response.ok) {
        if (response.runtime) {
          setVoiceRuntime(response.runtime);
        }

        throw new Error(response.error);
      }

      if (!response.conversationToken) {
        throw new Error('Missing ElevenLabs conversation token.');
      }

      setVoiceRuntime(response.runtime);
      setMessages([]);
      setIsAwaitingReply(false);
      pendingTypedUserMessagesRef.current = [];
      shouldEndSessionForUsageRef.current = false;

      await conversation.startSession({
        connectionType: 'webrtc',
        conversationToken: response.conversationToken,
      });
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Unable to start the voice session.',
      );
    } finally {
      setIsStartingVoice(false);
    }
  };

  const handleLiveToggle = async () => {
    if (
      isStartingVoice ||
      isRefreshingServices ||
      conversation.status === 'connecting' ||
      conversation.status === 'disconnecting'
    ) {
      return;
    }

    let nextServiceState = serviceState;

    if (
      serviceState.backend.status === 'checking' ||
      serviceState.elevenlabs.status === 'checking'
    ) {
      const refreshedServiceState = await loadServiceState(true);

      if (!refreshedServiceState) {
        setPanelMode('voice');
        return;
      }

      nextServiceState = refreshedServiceState;
    } else if (
      serviceState.backend.status !== 'ready' ||
      serviceState.elevenlabs.status !== 'ready'
    ) {
      const refreshedServiceState = await loadServiceState(true);

      if (refreshedServiceState) {
        nextServiceState = refreshedServiceState;
      }
    }

    if (
      nextServiceState.backend.status !== 'ready' ||
      nextServiceState.elevenlabs.status !== 'ready'
    ) {
      const nextServiceError =
        nextServiceState.backend.status !== 'ready'
          ? (nextServiceState.backend.detail ??
              nextServiceState.backend.summary ??
              'The Rockitt backend is unavailable right now.')
          : (nextServiceState.elevenlabs.detail ??
              nextServiceState.elevenlabs.summary ??
              'Managed ElevenLabs voice is unavailable right now.');

      setRequestError(
        nextServiceError,
      );
      setPanelMode('voice');
      return;
    }

    if (conversation.status === 'connected') {
      setRequestNotice(null);
      await conversation.endSession();
      return;
    }

    try {
      const currentUsage = await loadUsageState();

      if (!currentUsage.allowed) {
        setRequestError(getUsageBlockedMessage(currentUsage));
        setPanelMode('voice');
        return;
      }
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Unable to read the local trial limit.',
      );
      setPanelMode('voice');
      return;
    }

    if (microphoneState !== 'granted') {
      await openMicrophonePermissionPage();
      return;
    }

    await startVoiceSession();
  };

  const handleMuteToggle = () => {
    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);
    setRequestError(null);

    if (conversation.status === 'connected') {
      setRequestNotice(nextMuted ? 'Microphone muted.' : 'Microphone live.');
      return;
    }

    setRequestNotice(
      nextMuted
        ? 'Microphone will start muted on the next live session.'
        : 'Microphone will be live on the next session.',
    );
  };

  const handleChatDraftChange = (value: string) => {
    setChatDraft(value);

    if (conversation.status === 'connected') {
      conversation.sendUserActivity();
    }
  };

  const handleChatSubmit = async () => {
    const trimmedDraft = chatDraft.trim();

    if (!trimmedDraft) {
      return;
    }

    if (conversation.status !== 'connected') {
      setRequestError('Start the live voice session before sending chat messages.');
      return;
    }

    setRequestError(null);

    try {
      const nextUsage = await consumeUsage('chat');
      const normalizedMessage = normalizeUserMessageForQuota(trimmedDraft);
      pendingTypedUserMessagesRef.current = [
        ...pendingTypedUserMessagesRef.current,
        normalizedMessage,
      ];

      try {
        conversation.sendUserMessage(trimmedDraft);
      } catch (error) {
        pendingTypedUserMessagesRef.current =
          pendingTypedUserMessagesRef.current.slice(0, -1);
        throw error;
      }

      setChatDraft('');
      setIsAwaitingReply(true);
      applyPostMessageUsage(nextUsage);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Unable to update the local trial limit.',
      );
    }
  };

  const toggleMode = () => {
    setPanelMode((currentMode) =>
      currentMode === 'voice' ? 'chat' : 'voice',
    );
  };

  useEffect(() => {
    void loadServiceState();
    void refreshMicrophonePermissionState();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (!debugActivities.length) {
        window.localStorage.removeItem(debugActivityStorageKey);
        return;
      }

      window.localStorage.setItem(
        debugActivityStorageKey,
        JSON.stringify(debugActivities),
      );
    } catch {
      // Ignore local persistence failures in the debug timeline.
    }
  }, [debugActivities]);

  useEffect(() => {
    const handleWindowFocus = () => {
      void refreshMicrophonePermissionState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshMicrophonePermissionState();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    void loadServiceState(true);
  }, [isSettingsOpen]);

  useEffect(() => {
    if (serviceState.backend.status === 'ready' && serviceState.elevenlabs.status === 'ready') {
      return;
    }

    setIsMicMuted(false);
    setIsAwaitingReply(false);
    if (conversation.status === 'disconnected') {
      setVoiceRuntime(createEmptyVoiceRuntimeState());
      setMessages([]);
    }
  }, [conversation.status, serviceState.backend.status, serviceState.elevenlabs.status]);

  useEffect(() => {
    const handleRuntimeMessage = (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) {
        return;
      }

      if (message.type === 'microphone:permission-result') {
        const nextMessage = message as MicrophonePermissionResultMessage;
        setMicrophoneState(nextMessage.state);

        if (nextMessage.state === 'granted') {
          setRequestError(null);
          setRequestNotice(
            'Microphone permission granted. Return to Rockitt and tap the orb again.',
          );
        } else {
          if (nextMessage.error) {
            setRequestError(nextMessage.error);
          }
        }

        return;
      }
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    };
  }, []);

  const voiceState = toVoiceState(
    conversation.status,
    conversation.isSpeaking,
    isAwaitingReply,
  );
  const stateCopy = voiceStates[voiceState];
  const activeToolMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'tool' && message.status === 'running');
  const isVoiceSessionLive = conversation.status === 'connected';
  const isManagedVoiceReady =
    serviceState.backend.status === 'ready' &&
    serviceState.elevenlabs.status === 'ready';
  const isManagedLiveWebReady =
    serviceState.backend.status === 'ready' &&
    serviceState.firecrawl.status === 'ready';
  const isVoiceControlPending =
    isRefreshingServices ||
    isStartingVoice ||
    conversation.status === 'connecting' ||
    conversation.status === 'disconnecting';
  const liveControlLabel =
    isRefreshingServices
      ? 'Checking'
      : isStartingVoice || conversation.status === 'connecting'
      ? 'Starting'
      : conversation.status === 'disconnecting'
        ? 'Ending'
        : isVoiceSessionLive
          ? 'End live'
          : 'Go live';
  const voiceHint =
    activeToolMessage?.text ??
    (isRefreshingServices
      ? 'checking'
      : isStartingVoice || conversation.status === 'connecting'
        ? 'starting'
      : stateCopy.hint);
  const settingsDetails = [
    {
      label: 'Microphone',
      value: getMicrophoneSettingsStatus(microphoneState),
    },
    {
      label: 'Messages',
      value: getUsageSettingsStatus(usageState),
    },
  ];
  const usageOverridePanel = (
    <section className="settings-section">
      <p className="settings-section__title">Access</p>

      <div className="settings-group">
        <div className="settings-row">
          <p className="settings-row__label">Unlimited access</p>
          <span
            className={`provider-chip${
              usageState.isOverrideUnlocked ? ' provider-chip--ready' : ''
            }`}
          >
            {usageState.isOverrideUnlocked ? 'Unlocked' : 'Locked'}
          </span>
        </div>
      </div>

      {usageState.isOverrideUnlocked ? (
        <div className="settings-actions">
          <button
            className="action-button action-button--ghost"
            disabled={isClearingUsageOverride}
            type="button"
            onClick={() => {
              void clearUsageOverride();
            }}
          >
            {isClearingUsageOverride ? 'Removing' : 'Remove'}
          </button>
        </div>
      ) : (
        <div className="settings-inline-form">
          <input
            aria-label="Access code"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="settings-inline-form__input"
            inputMode="text"
            placeholder="Access code"
            spellCheck={false}
            type="password"
            value={usageOverrideCode}
            onChange={(event) => {
              setUsageOverrideCode(event.target.value);
            }}
          />

          <button
            className="action-button"
            disabled={!usageOverrideCode.trim() || isUnlockingUsageOverride}
            type="button"
            onClick={() => {
              void unlockUsageOverride();
            }}
          >
            {isUnlockingUsageOverride ? 'Unlocking' : 'Unlock'}
          </button>
        </div>
      )}
    </section>
  );

  return (
    <div className="app-frame">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />

      <div className="panel">
        {panelMode === 'voice' ? (
          <div className="panel__toolbar">
            <button
              aria-label="Open settings"
              className="icon-button"
              type="button"
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings2 size={16} strokeWidth={2} />
            </button>
          </div>
        ) : null}

        <main className="panel__body">
          <div className="panel__viewport">
            <div
              className={`panel__pages${panelMode === 'chat' ? ' panel__pages--chat' : ''}`}
            >
              <section
                aria-hidden={panelMode !== 'voice'}
                className="panel__page voice-view"
                inert={panelMode !== 'voice'}
              >
                <VoiceOrb
                  disabled={isVoiceControlPending}
                  getInputByteFrequencyData={() =>
                    conversation.getInputByteFrequencyData()
                  }
                  getInputVolume={() => conversation.getInputVolume()}
                  getOutputByteFrequencyData={() =>
                    conversation.getOutputByteFrequencyData()
                  }
                  getOutputVolume={() => conversation.getOutputVolume()}
                  label={
                    conversation.status === 'connected'
                      ? 'End live voice session'
                      : 'Start live voice session'
                  }
                  state={voiceState}
                  onPress={() => {
                    void handleLiveToggle();
                  }}
                />

                <div className="voice-view__copy">
                  <p className="voice-view__hint">{voiceHint}</p>

                  <div className="voice-view__actions">
                    <VoiceSessionControls
                      isLive={isVoiceSessionLive}
                      isMuted={isMicMuted}
                      liveDisabled={isVoiceControlPending}
                      liveLabel={liveControlLabel}
                      muteDisabled={conversation.status === 'disconnecting'}
                      showLive={false}
                      onToggleLive={() => {
                        void handleLiveToggle();
                      }}
                      onToggleMute={handleMuteToggle}
                    />
                  </div>

                  {requestError ? (
                    <div className="inline-banner inline-banner--error" role="alert">
                      {requestError}
                    </div>
                  ) : null}

                  {isManagedVoiceReady && microphoneState !== 'granted' ? (
                    <div className="voice-view__actions">
                      <button
                        className="action-button action-button--ghost"
                        type="button"
                        onClick={() => {
                          void openMicrophonePermissionPage();
                        }}
                      >
                        Open mic permission tab
                      </button>
                    </div>
                  ) : null}

                  <RockittPageToggle
                    label="Open chat"
                    onPress={toggleMode}
                  />
                </div>
              </section>

              <section
                aria-hidden={panelMode !== 'chat'}
                className="panel__page"
                inert={panelMode !== 'chat'}
              >
                <ConversationView
                  canSend={
                    conversation.status === 'connected' && usageState.allowed
                  }
                  draft={chatDraft}
                  isAwaitingReply={isAwaitingReply}
                  isLive={isVoiceSessionLive}
                  isLiveControlDisabled={isVoiceControlPending}
                  isMuted={isMicMuted}
                  isMuteControlDisabled={conversation.status === 'disconnecting'}
                  liveLabel={liveControlLabel}
                  messages={messages}
                  onBackToVoice={toggleMode}
                  onChangeDraft={handleChatDraftChange}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onSubmit={() => {
                    void handleChatSubmit();
                  }}
                  onToggleLive={() => {
                    void handleLiveToggle();
                  }}
                  onToggleMute={handleMuteToggle}
                  statusText={voiceHint}
                />
              </section>
            </div>
          </div>
        </main>

        {isSettingsOpen ? (
          <>
            <button
              aria-label="Close settings"
              className="scrim"
              type="button"
              onClick={() => setIsSettingsOpen(false)}
            />

            <SettingsSheet
              details={settingsDetails}
              requestError={requestError}
              requestNotice={requestNotice}
              onClose={() => setIsSettingsOpen(false)}
              serviceState={serviceState}
              usageOverridePanel={usageOverridePanel}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
