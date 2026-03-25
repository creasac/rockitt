import { X } from 'lucide-react';

type SettingsSheetProps = {
  onClose: () => void;
};

const rows = [
  {
    label: 'Default view',
    value: 'Voice animation',
  },
  {
    label: 'Transcript',
    value: 'Hidden at start',
  },
  {
    label: 'Page context',
    value: 'Automatic when needed',
  },
  {
    label: 'Voice session',
    value: 'Tap to start',
  },
];

export function SettingsSheet({ onClose }: SettingsSheetProps) {
  return (
    <aside aria-label="Settings" className="settings-sheet">
      <div className="settings-sheet__header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2 className="settings-sheet__title">Preview</h2>
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

      <div className="settings-list">
        {rows.map((row) => (
          <div key={row.label} className="settings-row">
            <span className="settings-row__label">{row.label}</span>
            <span className="settings-row__value">{row.value}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
