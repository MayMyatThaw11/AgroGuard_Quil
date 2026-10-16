import React from 'react';
import { X } from 'lucide-react';
import { AqButton } from '../aq/aqPrimitives.tsx';
import type { ToastItem } from './useToasts.ts';

interface FarmMapToastsProps {
  items: readonly ToastItem[];
  dismiss: (id: string) => void;
}

export const FarmMapToasts: React.FC<FarmMapToastsProps> = ({ items, dismiss }) => (
  <div className="aq-fm-toasts" role="status" aria-live="polite">
    {items.map((toast) => (
      <div key={toast.id} className={`aq-fm-toast is-${toast.tone} aq-fm-pop`}>
        <div className="aq-fm-toast-copy">
          <p className="aq-fm-toast-title">{toast.title}</p>
          {toast.message ? <p className="aq-fm-toast-body">{toast.message}</p> : null}
        </div>
        {toast.action ? (
          <AqButton
            variant="secondary"
            onClick={() => {
              toast.action?.[1]();
              dismiss(toast.id);
            }}
          >
            {toast.action[0]}
          </AqButton>
        ) : null}
        <button type="button" className="aq-icon-btn" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    ))}
  </div>
);
