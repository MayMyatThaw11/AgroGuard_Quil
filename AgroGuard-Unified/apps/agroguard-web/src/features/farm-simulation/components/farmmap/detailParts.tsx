import React, { useState } from 'react';
import { ChevronDown, Clock } from 'lucide-react';
import { AqButton } from '../aq/aqPrimitives.tsx';

export const KV: React.FC<{ k: string; v: React.ReactNode; sub?: string }> = ({ k, v, sub }) => (
  <div className="aq-fm-kv">
    <span className="aq-fm-kv-key">{k}</span>
    <span className="aq-fm-kv-value">
      {v}
      {sub ? <span className="aq-fm-kv-sub"> {sub}</span> : null}
    </span>
  </div>
);

export const DetailSection: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <section className={`aq-fm-sec ${className}`}>{children}</section>
);

export const UpdatedLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="aq-fm-updated">
    <Clock size={11} aria-hidden="true" />
    {children}
  </p>
);

interface BarRowProps {
  label: string;
  percent: number;
  children: React.ReactNode;
}

export const BarRow: React.FC<BarRowProps> = ({ label, percent, children }) => (
  <div className="aq-fm-bar-row">
    <span className="aq-fm-kv-key">{label}</span>
    {children}
    <span className="aq-fm-bar-value">{percent}%</span>
  </div>
);

export const More: React.FC<{ label: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ label, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <AqButton variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronDown size={14} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        {label}
      </AqButton>
      {open ? <div>{children}</div> : null}
    </div>
  );
};
