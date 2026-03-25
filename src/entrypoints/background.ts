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
    const data = (await response.json()) as {
      detail?: string;
      error?: string;
      message?: string;
    };

    return data.detail ?? data.error ?? data.message ?? null;
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
  const response = await fetch('https://api.elevenlabs.io/v1/models', {
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
      typeof message.type !== 'string' ||
      !message.type.startsWith('provider-settings:')
    ) {
      return false;
    }

    void handleBackgroundMessage(message as BackgroundMessage)
      .then(sendResponse)
      .catch(async (error) => {
        sendResponse(await toErrorResponse(error));
      });

    return true;
  });
});
