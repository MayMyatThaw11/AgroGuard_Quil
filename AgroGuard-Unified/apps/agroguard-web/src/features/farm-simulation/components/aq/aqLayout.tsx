import React from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X } from 'lucide-react';

interface AqPanelProps {
  glass?: boolean;
  width?: number | string;
  side?: 'left' | 'right';
  hideLabel?: string;
  label: string;
  onHide?: () => void;
  children: React.ReactNode;
}

export const AqPanel: React.FC<AqPanelProps> = ({ glass = false, width, side = 'left', hideLabel, label, onHide, children }) => (
  <section className={`aq-panel ${glass ? 'is-glass' : ''}`} style={width === undefined ? undefined : { width }} aria-label={label}>
    {onHide ? (
      <button type="button" className="aq-panel-hide" aria-label={hideLabel ?? `Hide ${label.toLowerCase()}`} title={hideLabel} onClick={onHide}>
        {side === 'left' ? <PanelLeftClose size={15} aria-hidden="true" /> : <PanelRightClose size={15} aria-hidden="true" />}
      </button>
    ) : null}
    {children}
  </section>
);

export const AqReopen: React.FC<{ side: 'left' | 'right'; label: string; onClick: () => void }> = ({ side, label, onClick }) => (
  <button type="button" className="aq-reopen" aria-label={label} title={label} onClick={onClick}>
    {side === 'left' ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelRightOpen size={16} aria-hidden="true" />}
  </button>
);

export const AqSectionLabel: React.FC<{ aside?: string; children: React.ReactNode }> = ({ aside, children }) => (
  <div className="aq-section-head">
    <p className="aq-eyebrow">{children}</p>
    {aside ? <span className="aq-section-aside">{aside}</span> : null}
  </div>
);

interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
  tone?: 'default' | 'warning' | 'alert' | 'accent';
}

export const AqStatTile: React.FC<StatTileProps> = ({ label, value, unit, tone = 'default' }) => (
  <div className={`aq-stat ${tone === 'default' ? '' : `is-${tone}`}`}>
    <div className="aq-stat-label">{label}</div>
    <div className="aq-stat-value">
      {value}
      {unit ? <span className="aq-stat-unit">{unit}</span> : null}
    </div>
  </div>
);

interface AqTabsProps<T extends string> {
  value: T;
  items: readonly { value: T; label: string }[];
  label: string;
  onChange: (value: T) => void;
}

export function AqTabs<T extends string>({ value, items, label, onChange }: AqTabsProps<T>) {
  return (
    <div className="aq-tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          className="aq-seg"
          aria-selected={item.value === value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  selected: boolean;
  count?: number;
  tone?: 'ok' | 'watch' | 'alert' | 'offline';
  swatch?: string;
  compact?: boolean;
  onClick: () => void;
}

export const AqFilterChip: React.FC<FilterChipProps> = ({ label, selected, count, tone, swatch, compact = false, onClick }) => (
  <button type="button" className={`aq-chip ${compact ? 'is-compact' : ''}`} aria-pressed={selected} onClick={onClick}>
    {tone ? <span className={`aq-status-dot is-${tone}`} aria-hidden="true" /> : null}
    {swatch ? <span className="aq-chip-dot" style={{ '--aq-swatch': swatch } as React.CSSProperties} aria-hidden="true" /> : null}
    {label}
    {count === undefined ? null : <span className="aq-chip-count">{count.toLocaleString()}</span>}
  </button>
);

export const AqProgress: React.FC<{ value: number; tone?: 'accent' | 'warning' | 'water' | 'alert'; label: string }> = ({
  value,
  tone = 'accent',
  label,
}) => (
  <div className="aq-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
    <span className={`aq-progress-fill ${tone === 'accent' ? '' : `is-${tone}`}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
  </div>
);

export const AqSwitch: React.FC<{ checked: boolean; label: string; onChange: (next: boolean) => void }> = ({ checked, label, onChange }) => (
  <button type="button" role="switch" className="aq-switch" aria-checked={checked} onClick={() => onChange(!checked)}>
    <span className="aq-switch-track" aria-hidden="true" />
    {label}
  </button>
);

export const AqStatusDot: React.FC<{ status: string }> = ({ status }) => <span className={`aq-status-dot is-${status}`} aria-hidden="true" />;

export const AqToast: React.FC<{ title: string; message: string; onClose: () => void }> = ({ title, message, onClose }) => (
  <div className="aq-toast" role="status">
    <div className="aq-toast-copy">
      <p className="aq-toast-title">{title}</p>
      <p className="aq-toast-body">{message}</p>
    </div>
    <button type="button" className="aq-icon-btn" aria-label="Dismiss notification" onClick={onClose}>
      <X size={14} aria-hidden="true" />
    </button>
  </div>
);
