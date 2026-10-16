import React from 'react';
import {
  THRESHOLDS,
  type ThresholdGroup,
  type ThresholdKey,
  type ThresholdValues,
  type ValidationIssue,
} from '../../lib/paddySettings.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { ThresholdField } from './ThresholdField.tsx';

interface ThresholdGroupFormProps {
  group: ThresholdGroup;
  values: ThresholdValues;
  issues: readonly ValidationIssue[];
  panelId: string;
  tabId: string;
  onChange: (key: ThresholdKey, value: number) => void;
  onReset: (key: ThresholdKey) => void;
  onResetGroup: () => void;
}

export const ThresholdGroupForm: React.FC<ThresholdGroupFormProps> = ({
  group,
  values,
  issues,
  panelId,
  tabId,
  onChange,
  onReset,
  onResetGroup,
}) => {
  const fields = THRESHOLDS.filter((entry) => entry.group === group.id);
  const modifiedCount = fields.filter((entry) => values[entry.key] !== entry.defaultValue).length;
  return (
    <section className="aq-card aq-form" role="tabpanel" id={panelId} aria-labelledby={tabId}>
      <div className="aq-header-actions">
        <div className="aq-header-copy">
          <p className="aq-eyebrow">{group.label}</p>
          <p className="aq-blurb">{group.blurb}</p>
        </div>
        <span className="aq-spacer" />
        <AqButton variant="ghost" disabled={modifiedCount === 0} onClick={onResetGroup}>
          Reset group
        </AqButton>
      </div>
      <div className="aq-fields">
        {fields.map((entry) => (
          <ThresholdField
            key={entry.key}
            meta={entry}
            value={values[entry.key]}
            issues={issues.filter((issue) => issue.key === entry.key)}
            onChange={(next) => onChange(entry.key, next)}
            onReset={() => onReset(entry.key)}
          />
        ))}
      </div>
    </section>
  );
};
