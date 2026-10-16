import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { WIND_CEILING_MS } from '../../lib/safety.ts';
import type { ThresholdMeta, ValidationIssue } from '../../lib/paddySettings.ts';
import { AqIconButton, AqSlider } from '../aq/aqPrimitives.tsx';
import { formatNumber, formatWithUnit } from '../aq/format.ts';

interface ThresholdFieldProps {
  meta: ThresholdMeta;
  value: number;
  issues: readonly ValidationIssue[];
  onChange: (value: number) => void;
  onReset: () => void;
}

export const ThresholdField: React.FC<ThresholdFieldProps> = ({ meta, value, issues, onChange, onReset }) => {
  const [text, setText] = useState(() => String(value));
  const inputId = `aq-${meta.key}`;
  const hintId = `${inputId}-hint`;
  const issueId = `${inputId}-issue`;
  const error = issues.find((entry) => entry.level === 'error');
  const warning = issues.find((entry) => entry.level === 'warning');
  const modified = Number.isFinite(value) && value !== meta.defaultValue;
  const isAdvisory = meta.key === 'spray_wind_advisory_ms';

  useEffect(() => {
    if (Number.isFinite(value) && Number(text) !== value) setText(String(value));
  }, [value, text]);

  const handleText = (next: string) => {
    setText(next);
    onChange(next.trim() === '' ? Number.NaN : Number(next));
  };

  const describedBy = [hintId, error || warning ? issueId : ''].filter(Boolean).join(' ');

  return (
    <div className="aq-field">
      <div className="aq-field-head">
        <label className="aq-field-label" htmlFor={inputId}>
          {meta.label}
          {modified ? <span className="aq-dot" role="img" aria-label="Changed from default" /> : null}
        </label>
        <AqIconButton label={`Reset ${meta.label} to default`} disabled={!modified} onClick={onReset}>
          <RotateCcw size={14} strokeWidth={1.9} aria-hidden="true" />
        </AqIconButton>
      </div>
      <div className="aq-field-controls">
        <div className={`aq-input-wrap ${error ? 'is-error' : ''}`}>
          <input
            id={inputId}
            className="aq-input"
            type="number"
            inputMode="decimal"
            min={meta.min}
            max={meta.max}
            step={meta.step}
            value={text}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => handleText(event.currentTarget.value)}
          />
          <span className="aq-suffix">{meta.unit}</span>
        </div>
        <AqSlider
          id={`${inputId}-slider`}
          label={`${meta.label} slider`}
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={value}
          valueText={formatWithUnit(value, meta.unit)}
          describedBy={hintId}
          onChange={(next) => {
            setText(String(next));
            onChange(next);
          }}
        />
      </div>
      <p className="aq-hint" id={hintId}>
        {meta.description} Default {formatWithUnit(meta.defaultValue, meta.unit)} · range {formatNumber(meta.min)} to{' '}
        {formatWithUnit(meta.max, meta.unit)}.
        {isAdvisory ? ` Hard ceiling ${formatWithUnit(WIND_CEILING_MS, 'm/s')}, not editable.` : ''}
      </p>
      {error || warning ? (
        <p className={`aq-hint ${error ? 'is-error' : 'is-warning'}`} id={issueId} role={error ? 'alert' : undefined}>
          {(error ?? warning)?.message}
        </p>
      ) : null}
    </div>
  );
};
