import React, { useEffect, useRef } from 'react';
import { AqButton } from '../aq/aqPrimitives.tsx';

interface ResetAllDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export const ResetAllDialog: React.FC<ResetAllDialogProps> = ({ onCancel, onConfirm }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const handleKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const first = cancelRef.current;
    const last = confirmRef.current;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="aq-scrim" onKeyDown={handleKey}>
      <div className="aq-dialog" role="dialog" aria-modal="true" aria-labelledby="aq-reset-title" aria-describedby="aq-reset-body">
        <div className="aq-dialog-body">
          <h2 className="aq-title" id="aq-reset-title">
            Reset all thresholds
          </h2>
          <p className="aq-meta" id="aq-reset-body">
            Every value in the draft returns to the planner default. Nothing is applied until you choose Apply.
          </p>
        </div>
        <div className="aq-dialog-footer">
          <AqButton ref={cancelRef} variant="ghost" onClick={onCancel}>
            Cancel
          </AqButton>
          <AqButton ref={confirmRef} variant="primary" onClick={onConfirm}>
            Reset all
          </AqButton>
        </div>
      </div>
    </div>
  );
};
