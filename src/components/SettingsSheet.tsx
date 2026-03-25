import {
  CircleAlert,
  KeyRound,
  LoaderCircle,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

import {
  providerCatalog,
  type ProviderId,
  type ProviderStatusMap,
} from '../lib/provider-settings';

type SettingsSheetProps = {
  drafts: Record<ProviderId, string>;
  onChangeDraft: (provider: ProviderId, value: string) => void;
  onClose: () => void;
  onDeleteProviderKey: (provider: ProviderId) => void;
  onSaveProviderKey: (provider: ProviderId) => void;
  onTestProviderKey: (provider: ProviderId) => void;
  pendingAction: string | null;
  providerState: ProviderStatusMap;
  requestError: string | null;
  requestNotice: string | null;
};

const providers = Object.keys(providerCatalog) as ProviderId[];

const statusCopy = {
  untested: 'Saved locally. Not checked yet.',
  success: 'Stored key passed the last check.',
  error: 'The last check failed.',
} as const;

const formatTimestamp = (value: string | null) => {
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

export function SettingsSheet({
  drafts,
  onChangeDraft,
  onClose,
  onDeleteProviderKey,
  onSaveProviderKey,
  onTestProviderKey,
  pendingAction,
  providerState,
  requestError,
  requestNotice,
}: SettingsSheetProps) {
  return (
    <aside aria-label="Settings" className="settings-sheet">
      <div className="settings-sheet__header">
        <div>
          <p className="eyebrow">Privacy</p>
          <h2 className="settings-sheet__title">Provider keys</h2>
        </div>

        <button
          aria-label="Close settings"
          className="icon-button"
          type="button"
          onClick={onClose}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <p className="settings-sheet__intro">
        Keys stay on this browser profile and are used from the extension
        background worker. The panel only sees masked metadata after save.
      </p>

      {requestNotice ? (
        <div className="settings-banner settings-banner--notice" role="status">
          {requestNotice}
        </div>
      ) : null}

      {requestError ? (
        <div className="settings-banner settings-banner--error" role="alert">
          {requestError}
        </div>
      ) : null}

      <div className="settings-list">
        {providers.map((provider) => {
          const meta = providerCatalog[provider];
          const state = providerState[provider];
          const isSaving = pendingAction === `save:${provider}`;
          const isChecking = pendingAction === `test:${provider}`;
          const isDeleting = pendingAction === `delete:${provider}`;
          const hasPendingAction = isSaving || isChecking || isDeleting;
          const lastCheckedLabel = formatTimestamp(state.lastCheckedAt);

          return (
            <section key={provider} className="provider-card">
              <div className="provider-card__top">
                <div>
                  <p className="provider-card__label">{meta.label}</p>
                  <p className="provider-card__description">{meta.description}</p>
                </div>

                <span
                  className={`provider-chip ${
                    state.hasKey ? 'provider-chip--ready' : ''
                  }`}
                >
                  {state.hasKey ? 'Stored locally' : 'No key'}
                </span>
              </div>

              <div className="provider-card__meta">
                <span className="provider-card__meta-label">Saved secret</span>
                <span className="provider-card__meta-value">
                  {state.maskedKey ?? 'Nothing stored yet'}
                </span>
              </div>

              <label
                className="provider-card__input-label"
                htmlFor={`provider-key-${provider}`}
              >
                {meta.inputLabel}
              </label>

              <div className="provider-card__input-wrap">
                <KeyRound className="provider-card__input-icon" size={16} />
                <input
                  autoComplete="off"
                  className="provider-card__input"
                  id={`provider-key-${provider}`}
                  placeholder={meta.placeholder}
                  spellCheck={false}
                  type="password"
                  value={drafts[provider]}
                  onChange={(event) =>
                    onChangeDraft(provider, event.target.value)
                  }
                />
              </div>

              <div className="provider-card__actions">
                <button
                  className="action-button"
                  disabled={hasPendingAction || !drafts[provider].trim()}
                  type="button"
                  onClick={() => onSaveProviderKey(provider)}
                >
                  {isSaving ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Save size={15} />
                  )}
                  Save key
                </button>

                <button
                  className="action-button action-button--ghost"
                  disabled={hasPendingAction || !state.hasKey}
                  type="button"
                  onClick={() => onTestProviderKey(provider)}
                >
                  {isChecking ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <ShieldCheck size={15} />
                  )}
                  Check key
                </button>

                <button
                  className="action-button action-button--danger"
                  disabled={hasPendingAction || !state.hasKey}
                  type="button"
                  onClick={() => onDeleteProviderKey(provider)}
                >
                  {isDeleting ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  Remove
                </button>
              </div>

              <div
                className={`provider-card__validation provider-card__validation--${state.validationStatus}`}
              >
                {state.validationStatus === 'success' ? (
                  <ShieldCheck size={15} />
                ) : (
                  <CircleAlert size={15} />
                )}

                <div>
                  <p className="provider-card__validation-title">
                    {statusCopy[state.validationStatus]}
                  </p>
                  <p className="provider-card__validation-copy">
                    {state.validationMessage
                      ? lastCheckedLabel
                        ? `${state.validationMessage} Checked ${lastCheckedLabel}.`
                        : state.validationMessage
                      : lastCheckedLabel
                        ? `Last checked ${lastCheckedLabel}.`
                        : 'No check has been run yet.'}
                  </p>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <p className="settings-sheet__footnote">
        Store history and transcripts separately from provider secrets. Those can
        live in normal extension storage or IndexedDB without needing the same
        treatment.
      </p>
    </aside>
  );
}
