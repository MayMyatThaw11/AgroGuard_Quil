import React, { useEffect, useRef } from 'react';

interface AqDialogProps {
  title: string;
  description?: string;
  width?: number;
  onClose: () => void;
  footer: React.ReactNode;
  children?: React.ReactNode;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export const AqDialog: React.FC<AqDialogProps> = ({ title, description, width = 420, onClose, footer, children }) => {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previous?.focus();
  }, []);

  const handleKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="aq-scrim" onKeyDown={handleKey} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialog} className="aq-dialog" style={{ width: `min(${width}px, calc(100vw - 32px))` }} role="dialog" aria-modal="true" aria-labelledby="aq-dialog-title">
        <div className="aq-dialog-body">
          <h2 className="aq-title" id="aq-dialog-title">
            {title}
          </h2>
          {description ? <p className="aq-meta">{description}</p> : null}
          {children}
        </div>
        <div className="aq-dialog-footer">{footer}</div>
      </div>
    </div>
  );
};
