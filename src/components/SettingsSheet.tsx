import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { type ServiceId, type ServiceStatusMap } from '../lib/service-runtime';

type SettingsDetail = {
  label: string;
  value: string;
};

type SettingsSheetProps = {
  details: SettingsDetail[];
  onClose: () => void;
  requestError: string | null;
  requestNotice: string | null;
  serviceState: ServiceStatusMap;
  usageOverridePanel?: ReactNode;
};

const services: ServiceId[] = ['elevenlabs', 'firecrawl'];

const serviceLabelCopy: Record<ServiceId, string> = {
  backend: 'Rockitt',
  elevenlabs: 'Voice',
  firecrawl: 'Live web',
};

const statusChipCopy = {
  checking: 'Checking',
  degraded: 'Degraded',
  ready: 'Ready',
  unavailable: 'Unavailable',
} as const;

export function SettingsSheet({
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
        <h2 className="settings-sheet__title">Settings</h2>

        <button
          aria-label="Close settings"
          className="icon-button"
          type="button"
          onClick={onClose}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

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

      <section className="settings-section">
        <p className="settings-section__title">Services</p>

        <div className="settings-group">
          {services.map((service) => {
            const state = serviceState[service];

            return (
              <div key={service} className="settings-row">
                <p className="settings-row__label">{serviceLabelCopy[service]}</p>
                <span
                  className={`provider-chip ${
                    state.status === 'ready' ? 'provider-chip--ready' : ''
                  }`}
                >
                  {statusChipCopy[state.status]}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {usageOverridePanel}

      <section className="settings-section">
        <p className="settings-section__title">This browser</p>

        <div className="settings-group">
          {details.map((detail) => (
            <div key={detail.label} className="settings-row">
              <p className="settings-row__label">{detail.label}</p>
              <p className="settings-row__value">{detail.value}</p>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
