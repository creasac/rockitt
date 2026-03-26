import {
  CircleAlert,
  LoaderCircle,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  serviceCatalog,
  type ServiceId,
  type ServiceStatusMap,
} from '../lib/service-runtime';

type SettingsDetail = {
  label: string;
  value: string;
};

type SettingsSheetProps = {
  activityPanel?: ReactNode;
  details: SettingsDetail[];
  onClose: () => void;
  requestError: string | null;
  requestNotice: string | null;
  serviceState: ServiceStatusMap;
  usageOverridePanel?: ReactNode;
};

const services = Object.keys(serviceCatalog) as ServiceId[];

const statusChipCopy = {
  checking: 'Checking',
  degraded: 'Degraded',
  ready: 'Ready',
  unavailable: 'Unavailable',
} as const;

const statusTitleCopy = {
  checking: 'Rockitt is checking this managed service.',
  degraded: 'The service responded, but it is not fully ready.',
  ready: 'Managed access is available.',
  unavailable: 'Managed access is unavailable right now.',
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
  activityPanel,
  details,
  onClose,
  requestError,
  requestNotice,
  serviceState,
  usageOverridePanel,
}: SettingsSheetProps) {
  return (
    <aside aria-label="Settings" className="settings-sheet">
      <div className="settings-sheet__header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2 className="settings-sheet__title">Managed services</h2>
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
        Rockitt now uses app-managed provider credentials through your backend.
        Users no longer need to paste provider secrets into the extension.
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
        {services.map((service) => {
          const meta = serviceCatalog[service];
          const state = serviceState[service];
          const checkedAtLabel = formatTimestamp(state.checkedAt);

          return (
            <section key={service} className="provider-card">
              <div className="provider-card__top">
                <div>
                  <p className="provider-card__label">{meta.label}</p>
                  <p className="provider-card__description">{meta.description}</p>
                </div>

                <span
                  className={`provider-chip ${
                    state.status === 'ready' ? 'provider-chip--ready' : ''
                  }`}
                >
                  {statusChipCopy[state.status]}
                </span>
              </div>

              <div
                className={`provider-card__validation provider-card__validation--${
                  state.status === 'ready' ? 'success' : 'error'
                }`}
              >
                {state.status === 'checking' ? (
                  <LoaderCircle className="spin" size={15} />
                ) : state.status === 'ready' ? (
                  <ShieldCheck size={15} />
                ) : (
                  <CircleAlert size={15} />
                )}

                <div>
                  <p className="provider-card__validation-title">
                    {statusTitleCopy[state.status]}
                  </p>
                  <p className="provider-card__validation-copy">
                    {state.detail ?? state.summary}
                    {checkedAtLabel ? ` Checked ${checkedAtLabel}.` : ''}
                  </p>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {usageOverridePanel}

      <section className="settings-section">
        <div className="settings-section__header">
          <div>
            <p className="settings-section__title">Session details</p>
            <p className="settings-section__copy">
              Moved out of the main panel to keep the orb page clean.
            </p>
          </div>
        </div>

        <div className="settings-detail-grid">
          {details.map((detail) => (
            <article key={detail.label} className="settings-detail">
              <p className="settings-detail__label">{detail.label}</p>
              <p className="settings-detail__value">{detail.value}</p>
            </article>
          ))}
        </div>
      </section>

      {activityPanel ? (
        <section className="settings-section">
          <div className="settings-section__header">
            <div>
              <p className="settings-section__title">Tool activity</p>
              <p className="settings-section__copy">
                Recent tool calls and session events.
              </p>
            </div>
          </div>

          {activityPanel}
        </section>
      ) : null}

      <p className="settings-sheet__footnote">
        Keep provider secrets in Cloudflare Worker secrets, not in extension
        storage. Local extension state should stay limited to UI state, the
        temporary trial quota, transcripts, and device-level preferences.
      </p>
    </aside>
  );
}
