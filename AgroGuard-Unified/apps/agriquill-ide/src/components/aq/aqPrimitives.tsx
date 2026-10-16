import React from 'react';
import { percentWithin } from './format.ts';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface AqButtonProps extends React.ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  large?: boolean;
}

export const AqButton: React.FC<AqButtonProps> = ({ variant = 'secondary', large = false, className, type = 'button', ...rest }) => (
  <button
    type={type}
    className={['aq-btn', `aq-btn-${variant}`, large ? 'is-lg' : '', className ?? ''].filter(Boolean).join(' ')}
    {...rest}
  />
);

interface AqIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export const AqIconButton: React.FC<AqIconButtonProps> = ({ label, type = 'button', ...rest }) => (
  <button type={type} className="aq-icon-btn" aria-label={label} title={label} {...rest} />
);

type BadgeTone = 'accent' | 'neutral' | 'warning' | 'alert' | 'water';

export const AqBadge: React.FC<{ tone?: BadgeTone; children: React.ReactNode }> = ({ tone = 'neutral', children }) => (
  <span className={`aq-badge is-${tone}`}>{children}</span>
);

interface AqSliderProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueText: string;
  describedBy?: string;
  onChange: (value: number) => void;
}

export const AqSlider: React.FC<AqSliderProps> = ({ id, label, min, max, step, value, valueText, describedBy, onChange }) => {
  const clamped = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  const fill = { '--aq-fill': `${percentWithin(clamped, min, max)}%` } as React.CSSProperties;
  return (
    <input
      id={id}
      type="range"
      className="aq-slider"
      aria-label={label}
      aria-valuetext={valueText}
      aria-describedby={describedBy}
      min={min}
      max={max}
      step={step}
      value={clamped}
      style={fill}
      onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
    />
  );
};
