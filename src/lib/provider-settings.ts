export const providerCatalog = {
  elevenlabs: {
    label: 'ElevenLabs',
    description: 'Used for voice generation and live voice sessions.',
    inputLabel: 'ElevenLabs API key',
    placeholder: 'Paste your xi-api-key value',
  },
  firecrawl: {
    label: 'Firecrawl',
    description: 'Used for grounded page fetches and web extraction.',
    inputLabel: 'Firecrawl API key',
    placeholder: 'Paste your Firecrawl bearer key',
  },
} as const;

export type ProviderId = keyof typeof providerCatalog;

export type ProviderValidationStatus = 'untested' | 'success' | 'error';

export type ProviderStatus = {
  hasKey: boolean;
  maskedKey: string | null;
  updatedAt: string | null;
  validationStatus: ProviderValidationStatus;
  validationMessage: string | null;
  lastCheckedAt: string | null;
};

export type ProviderStatusMap = Record<ProviderId, ProviderStatus>;

export type BackgroundMessage =
  | { type: 'provider-settings:get-state' }
  | {
      type: 'provider-settings:save-key';
      provider: ProviderId;
      apiKey: string;
    }
  | {
      type: 'provider-settings:delete-key';
      provider: ProviderId;
    }
  | {
      type: 'provider-settings:test-key';
      provider: ProviderId;
    };

export type BackgroundResponse =
  | {
      ok: true;
      state: ProviderStatusMap;
    }
  | {
      ok: false;
      error: string;
      state?: ProviderStatusMap;
    };

type StoredProviderSecret = {
  apiKey: string;
  updatedAt: string;
};

type StoredProviderMeta = {
  validationStatus: ProviderValidationStatus;
  validationMessage: string | null;
  lastCheckedAt: string | null;
};

export type StoredProviderSecrets = Partial<Record<ProviderId, StoredProviderSecret>>;
export type StoredProviderMetadata = Partial<Record<ProviderId, StoredProviderMeta>>;

export const storageKeys = {
  secrets: 'providerSecrets',
  metadata: 'providerMetadata',
} as const;

const defaultProviderStatus: ProviderStatus = {
  hasKey: false,
  maskedKey: null,
  updatedAt: null,
  validationStatus: 'untested',
  validationMessage: null,
  lastCheckedAt: null,
};

export const createEmptyProviderState = (): ProviderStatusMap => ({
  elevenlabs: { ...defaultProviderStatus },
  firecrawl: { ...defaultProviderStatus },
});

export const maskApiKey = (apiKey: string) => {
  const trimmedKey = apiKey.trim();

  if (trimmedKey.length <= 8) {
    return `${'•'.repeat(Math.max(trimmedKey.length - 2, 0))}${trimmedKey.slice(-2)}`;
  }

  return `${trimmedKey.slice(0, 4)}••••${trimmedKey.slice(-4)}`;
};

export const toProviderState = (
  secrets: StoredProviderSecrets,
  metadata: StoredProviderMetadata,
): ProviderStatusMap => {
  const baseState = createEmptyProviderState();

  (Object.keys(providerCatalog) as ProviderId[]).forEach((provider) => {
    const storedSecret = secrets[provider];
    const storedMeta = metadata[provider];

    if (!storedSecret) {
      return;
    }

    baseState[provider] = {
      hasKey: true,
      maskedKey: maskApiKey(storedSecret.apiKey),
      updatedAt: storedSecret.updatedAt,
      validationStatus: storedMeta?.validationStatus ?? 'untested',
      validationMessage: storedMeta?.validationMessage ?? null,
      lastCheckedAt: storedMeta?.lastCheckedAt ?? null,
    };
  });

  return baseState;
};
