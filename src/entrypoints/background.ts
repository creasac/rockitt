import {
  createEmptyProviderState,
  isEncryptedProviderSecret,
  providerCatalog,
  storageKeys,
  toProviderState,
  type BackgroundMessage,
  type BackgroundResponse,
  type ProviderSecretSnapshot,
  type ProviderId,
  type StoredProviderMetadata,
  type StoredProviderSecret,
  type StoredProviderSecrets,
} from '../lib/provider-settings';
import { decryptSecret, encryptSecret } from '../lib/secure-storage';
import {
  createEmptyVoiceRuntimeState,
  elevenLabsVoiceDefaults,
  voiceStorageKeys,
  type ElevenLabsBackgroundMessage,
  type ElevenLabsBackgroundResponse,
  type StoredElevenLabsVoiceAgent,
} from '../lib/voice-agent';

const elevenLabsApiBaseUrl = 'https://api.elevenlabs.io/v1';

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

const loadProviderData = async () => {
  const stored = await chrome.storage.local.get([
    storageKeys.secrets,
    storageKeys.metadata,
  ]);

  const secrets =
    (stored[storageKeys.secrets] as StoredProviderSecrets | undefined) ?? {};
  const metadata =
    (stored[storageKeys.metadata] as StoredProviderMetadata | undefined) ?? {};

  const migratedSecrets = await migrateLegacySecrets(secrets, metadata);

  return {
    secrets: migratedSecrets,
    metadata,
  };
};

const decryptStoredProviderSecret = async (storedSecret: StoredProviderSecret) => {
  if (!isEncryptedProviderSecret(storedSecret)) {
    return storedSecret.apiKey;
  }

  return decryptSecret(storedSecret.encrypted);
};

const getDecryptedProviderSecrets = async (secrets: StoredProviderSecrets) => {
  const decryptedSecrets: Partial<Record<ProviderId, ProviderSecretSnapshot>> =
    {};

  await Promise.all(
    (Object.keys(secrets) as ProviderId[]).map(async (provider) => {
      const storedSecret = secrets[provider];

      if (!storedSecret) {
        return;
      }

      decryptedSecrets[provider] = {
        apiKey: await decryptStoredProviderSecret(storedSecret),
        updatedAt: storedSecret.updatedAt,
      };
    }),
  );

  return decryptedSecrets;
};

const migrateLegacySecrets = async (
  secrets: StoredProviderSecrets,
  metadata: StoredProviderMetadata,
) => {
  let didMigrate = false;
  const nextSecrets: StoredProviderSecrets = { ...secrets };

  await Promise.all(
    (Object.keys(secrets) as ProviderId[]).map(async (provider) => {
      const storedSecret = secrets[provider];

      if (!storedSecret || isEncryptedProviderSecret(storedSecret)) {
        return;
      }

      nextSecrets[provider] = {
        encrypted: await encryptSecret(storedSecret.apiKey),
        updatedAt: storedSecret.updatedAt,
      };
      didMigrate = true;
    }),
  );

  if (didMigrate) {
    await persistProviderData(nextSecrets, metadata);
  }

  return nextSecrets;
};

const getPublicProviderState = async () => {
  const { secrets, metadata } = await loadProviderData();
  return toProviderState(await getDecryptedProviderSecrets(secrets), metadata);
};

const persistProviderData = async (
  secrets: StoredProviderSecrets,
  metadata: StoredProviderMetadata,
) => {
  await chrome.storage.local.set({
    [storageKeys.secrets]: secrets,
    [storageKeys.metadata]: metadata,
  });
};

const loadStoredVoiceAgent = async () => {
  const stored = await chrome.storage.local.get(voiceStorageKeys.agent);

  return (
    (stored[voiceStorageKeys.agent] as StoredElevenLabsVoiceAgent | undefined) ??
    null
  );
};

const persistVoiceAgent = async (
  agent: StoredElevenLabsVoiceAgent | null,
) => {
  if (!agent) {
    await chrome.storage.local.remove(voiceStorageKeys.agent);
    return;
  }

  await chrome.storage.local.set({
    [voiceStorageKeys.agent]: agent,
  });
};

const getVoiceRuntimeState = async (): Promise<{
  agent: StoredElevenLabsVoiceAgent | null;
  costProfile: 'aggressive';
  ready: boolean;
}> => {
  const storedAgent = await loadStoredVoiceAgent();

  if (!storedAgent) {
    return createEmptyVoiceRuntimeState();
  }

  return {
    agent: storedAgent,
    costProfile: 'aggressive',
    ready: true,
  };
};

const getStoredProviderApiKey = async (provider: ProviderId) => {
  const { secrets } = await loadProviderData();
  const storedSecret = secrets[provider];

  if (!storedSecret) {
    throw new Error(`No ${providerCatalog[provider].label} key is stored.`);
  }

  return decryptStoredProviderSecret(storedSecret);
};

const saveProviderKey = async (provider: ProviderId, apiKey: string) => {
  const trimmedKey = apiKey.trim();

  if (!trimmedKey) {
    throw new Error(`${providerCatalog[provider].label} key cannot be empty.`);
  }

  const { secrets, metadata } = await loadProviderData();
  const now = new Date().toISOString();

  await persistProviderData(
    {
      ...secrets,
      [provider]: {
        encrypted: await encryptSecret(trimmedKey),
        updatedAt: now,
      },
    },
    {
      ...metadata,
      [provider]: {
        validationStatus: 'untested',
        validationMessage: 'Saved locally. Run a check to verify access.',
        lastCheckedAt: null,
      },
    },
  );

  if (provider === 'elevenlabs') {
    await persistVoiceAgent(null);
  }

  return getPublicProviderState();
};

const deleteProviderKey = async (provider: ProviderId) => {
  const { secrets, metadata } = await loadProviderData();

  if (!secrets[provider]) {
    return getPublicProviderState();
  }

  const nextSecrets = { ...secrets };
  const nextMetadata = { ...metadata };

  delete nextSecrets[provider];
  delete nextMetadata[provider];

  await persistProviderData(nextSecrets, nextMetadata);

  if (provider === 'elevenlabs') {
    await persistVoiceAgent(null);
  }

  return getPublicProviderState();
};

const updateProviderMetadata = async (
  provider: ProviderId,
  nextMeta: StoredProviderMetadata[ProviderId],
) => {
  const { secrets, metadata } = await loadProviderData();
  const nextMetadata = {
    ...metadata,
    [provider]: nextMeta,
  };

  await persistProviderData(secrets, {
    ...nextMetadata,
  });

  return toProviderState(
    await getDecryptedProviderSecrets(secrets),
    nextMetadata,
  );
};

const readResponseMessage = async (response: Response) => {
  try {
    const data = (await response.json()) as unknown;

    return normalizeResponseMessage(data);
  } catch {
    return null;
  }
};

const verifyFirecrawlKey = async (apiKey: string) => {
  const response = await fetch('https://api.firecrawl.dev/v1/team/credit-usage', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      (await readResponseMessage(response)) ??
        `Firecrawl rejected the key (${response.status}).`,
    );
  }
};

const verifyElevenLabsKey = async (apiKey: string) => {
  const response = await fetch(`${elevenLabsApiBaseUrl}/models`, {
    headers: {
      'xi-api-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(
      (await readResponseMessage(response)) ??
        `ElevenLabs rejected the key (${response.status}).`,
    );
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

const extractAgentId = (value: unknown) =>
  readStringField(value, 'agent_id') ??
  readStringField(value, 'agentId') ??
  (isObject(value) ? extractAgentId(value.agent) : null);

const extractConversationToken = (value: unknown) =>
  readStringField(value, 'token') ??
  readStringField(value, 'conversation_token') ??
  readStringField(value, 'conversationToken');

const createElevenLabsAgent = async (
  apiKey: string,
): Promise<StoredElevenLabsVoiceAgent> => {
  const response = await fetch(`${elevenLabsApiBaseUrl}/convai/agents/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      name: elevenLabsVoiceDefaults.agentName,
      conversation_config: {
        agent: {
          first_message: "Hi, I'm Rockitt. Ask me anything and I'll keep it brief.",
          language: 'en',
          prompt: {
            prompt: elevenLabsVoiceDefaults.prompt,
            llm: elevenLabsVoiceDefaults.llm,
            max_tokens: elevenLabsVoiceDefaults.maxTokens,
            temperature: elevenLabsVoiceDefaults.temperature,
          },
        },
        conversation: {
          max_duration_seconds: elevenLabsVoiceDefaults.maxDurationSeconds,
        },
        tts: {
          model_id: elevenLabsVoiceDefaults.ttsModelId,
          voice_id: elevenLabsVoiceDefaults.voiceId,
        },
        turn: {
          turn_eagerness: elevenLabsVoiceDefaults.turnEagerness,
          turn_timeout: elevenLabsVoiceDefaults.turnTimeout,
        },
      },
      platform_settings: {
        auth: {
          enable_auth: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const responseMessage = await readResponseMessage(response);
    throw new Error(
      responseMessage ??
        `Unable to create the ElevenLabs voice agent (${response.status}).`,
    );
  }

  const payload = (await response.json()) as unknown;
  const agentId = extractAgentId(payload);

  if (!agentId) {
    throw new Error('ElevenLabs did not return an agent ID for the voice agent.');
  }

  return {
    agentId,
    agentName: elevenLabsVoiceDefaults.agentName,
    configVersion: elevenLabsVoiceDefaults.configVersion,
    createdAt: new Date().toISOString(),
    llm: elevenLabsVoiceDefaults.llm,
    maxDurationSeconds: elevenLabsVoiceDefaults.maxDurationSeconds,
    maxTokens: elevenLabsVoiceDefaults.maxTokens,
    ttsModelId: elevenLabsVoiceDefaults.ttsModelId,
    turnEagerness: elevenLabsVoiceDefaults.turnEagerness,
    turnTimeout: elevenLabsVoiceDefaults.turnTimeout,
    voiceId: elevenLabsVoiceDefaults.voiceId,
    voiceLabel: elevenLabsVoiceDefaults.voiceLabel,
  };
};

const requestConversationToken = async (apiKey: string, agentId: string) => {
  const search = new URLSearchParams({
    agent_id: agentId,
  });
  const response = await fetch(
    `${elevenLabsApiBaseUrl}/convai/conversation/token?${search.toString()}`,
    {
      headers: {
        'xi-api-key': apiKey,
      },
    },
  );

  if (!response.ok) {
    const responseMessage = await readResponseMessage(response);
    throw new Error(
      responseMessage ??
        `Unable to start the ElevenLabs voice session (${response.status}).`,
    );
  }

  const payload = (await response.json()) as unknown;
  const conversationToken = extractConversationToken(payload);

  if (!conversationToken) {
    throw new Error(
      'ElevenLabs did not return a conversation token for the voice session.',
    );
  }

  return conversationToken;
};

const ensureVoiceAgent = async (apiKey: string) => {
  const storedAgent = await loadStoredVoiceAgent();

  if (
    storedAgent &&
    storedAgent.configVersion === elevenLabsVoiceDefaults.configVersion
  ) {
    return storedAgent;
  }

  const nextAgent = await createElevenLabsAgent(apiKey);
  await persistVoiceAgent(nextAgent);

  return nextAgent;
};

const shouldRecreateVoiceAgent = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return /(401|403|404|not found|unknown agent|agent not)/i.test(error.message);
};

const startVoiceSession = async (): Promise<ElevenLabsBackgroundResponse> => {
  const apiKey = await getStoredProviderApiKey('elevenlabs');
  let agent = await ensureVoiceAgent(apiKey);

  try {
    const conversationToken = await requestConversationToken(apiKey, agent.agentId);

    return {
      ok: true,
      conversationToken,
      runtime: await getVoiceRuntimeState(),
    };
  } catch (error) {
    if (!shouldRecreateVoiceAgent(error)) {
      throw error;
    }

    const nextAgent = await createElevenLabsAgent(apiKey);
    await persistVoiceAgent(nextAgent);
    agent = nextAgent;

    return {
      ok: true,
      conversationToken: await requestConversationToken(apiKey, agent.agentId),
      runtime: await getVoiceRuntimeState(),
    };
  }
};

const testProviderKey = async (provider: ProviderId) => {
  const { secrets } = await loadProviderData();
  const storedSecret = secrets[provider];

  if (!storedSecret) {
    throw new Error(`No ${providerCatalog[provider].label} key is stored.`);
  }

  const apiKey = await decryptStoredProviderSecret(storedSecret);

  try {
    if (provider === 'firecrawl') {
      await verifyFirecrawlKey(apiKey);
    } else {
      await verifyElevenLabsKey(apiKey);
    }

    return updateProviderMetadata(provider, {
      validationStatus: 'success',
      validationMessage: 'Last check succeeded.',
      lastCheckedAt: new Date().toISOString(),
    });
  } catch (error) {
    return updateProviderMetadata(provider, {
      validationStatus: 'error',
      validationMessage:
        error instanceof Error ? error.message : 'Unable to verify stored key.',
      lastCheckedAt: new Date().toISOString(),
    });
  }
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

const toErrorResponse = async (error: unknown): Promise<BackgroundResponse> => ({
  ok: false,
  error:
    error instanceof Error ? error.message : 'Unknown extension error occurred.',
  state: await getPublicProviderState().catch(() => createEmptyProviderState()),
});

const handleBackgroundMessage = async (
  message: BackgroundMessage,
): Promise<BackgroundResponse> => {
  switch (message.type) {
    case 'provider-settings:get-state':
      return {
        ok: true,
        state: await getPublicProviderState(),
      };
    case 'provider-settings:save-key':
      return {
        ok: true,
        state: await saveProviderKey(message.provider, message.apiKey),
      };
    case 'provider-settings:delete-key':
      return {
        ok: true,
        state: await deleteProviderKey(message.provider),
      };
    case 'provider-settings:test-key':
      return {
        ok: true,
        state: await testProviderKey(message.provider),
      };
    default:
      return {
        ok: false,
        error: 'Unsupported background message.',
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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      !message ||
      typeof message !== 'object' ||
      !('type' in message) ||
      typeof message.type !== 'string'
    ) {
      return false;
    }

    if (message.type.startsWith('provider-settings:')) {
      void handleBackgroundMessage(message as BackgroundMessage)
        .then(sendResponse)
        .catch(async (error) => {
          sendResponse(await toErrorResponse(error));
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

    return false;
  });
});
