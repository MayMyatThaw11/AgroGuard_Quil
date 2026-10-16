import React from 'react';
import { AqButton } from '../aq/aqPrimitives.tsx';

interface PaddySaveBarProps {
  dirtyCount: number;
  errorCount: number;
  applying: boolean;
  onDiscard: () => void;
  onResetAll: () => void;
  onApply: () => void;
}

export const PaddySaveBar: React.FC<PaddySaveBarProps> = ({ dirtyCount, errorCount, applying, onDiscard, onResetAll, onApply }) => (
  <div className="aq-card aq-savebar" role="region" aria-label="Unsaved changes">
    <span>
      {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}
      {errorCount > 0 ? ` · ${errorCount} to fix` : ''}
    </span>
    <span className="aq-spacer" />
    <AqButton variant="ghost" onClick={onDiscard} disabled={applying}>
      Discard
    </AqButton>
    <AqButton variant="ghost" onClick={onResetAll} disabled={applying}>
      Reset all to defaults
    </AqButton>
    <AqButton variant="primary" onClick={onApply} disabled={applying || errorCount > 0}>
      {applying ? 'Applying' : 'Apply'}
    </AqButton>
  </div>
);
