import React from 'react';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { useT, type Key } from '../../lib/i18n.ts';
import type { ToastItem, ToastTone } from './useToasts.ts';

interface FarmMapToastsProps {
  items: readonly ToastItem[];
  dismiss: (id: string) => void;
}

const TONE_ICON: Record<ToastTone, readonly [typeof Info, Key]> = {
  info: [Info, 'farmMap.common.note'],
  success: [CircleCheck, 'farmMap.common.done'],
  warning: [TriangleAlert, 'farmMap.common.warning'],
};

export const FarmMapToasts: React.FC<FarmMapToastsProps> = ({ items, dismiss }) => {
  const t = useT();
  return (
  <div className="aq-fm-toasts" role="status" aria-live="polite">
    {items.map((toast) => {
      const [Icon, tone] = TONE_ICON[toast.tone];
      return (
        <div key={toast.id} className={`aq-fm-toast is-${toast.tone} aq-fm-pop`}>
          <Icon className="aq-fm-toast-icon" size={16} aria-hidden="true" />
          <div className="aq-fm-toast-copy">
            <p className="aq-fm-toast-title">
              <span className="sr-only">{t(tone)}: </span>
              {toast.title}
            </p>
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
          <button type="button" className="aq-icon-btn" aria-label={t('farmMap.toast.dismiss')} onClick={() => dismiss(toast.id)}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      );
    })}
  </div>
  );
};
