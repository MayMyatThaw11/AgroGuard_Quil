import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bot, MessageSquare, Plane, Send, ShieldAlert, Tractor, X } from 'lucide-react';
import { MACHINES, MACHINE_IDS, inferAction, type MachineId } from '../../lib/fieldMissions.ts';
import { WIND_CEILING_MS } from '../../lib/safety.ts';
import { useFieldMissionStore, type ComposerDraft } from '../../store/fieldMissionStore.ts';
import type { AgronomyContext } from '../../lib/agronomist.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';

interface FieldComposerModalProps {
  draft: ComposerDraft;
  context: AgronomyContext;
  onClose: () => void;
}

export const FieldComposerModal: React.FC<FieldComposerModalProps> = ({ draft, context, onClose }) => {
  const dispatchCommand = useFieldMissionStore((s) => s.dispatchCommand);
  const addNote = useFieldMissionStore((s) => s.addNote);

  const [kind, setKind] = useState<'command' | 'note'>('command');
  const [selectedMachine, setSelectedMachine] = useState<MachineId | 'auto'>('auto');
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [pin, setPin] = useState('1234');
  const [confirmed, setConfirmed] = useState(true);

  const inferred = useMemo(
    () => inferAction(text, selectedMachine === 'auto' ? null : selectedMachine),
    [text, selectedMachine]
  );

  const effMachine: MachineId = selectedMachine === 'auto' ? inferred.machine : selectedMachine;
  const effAction: string = selectedAction ?? inferred.action;

  const isDrone = effMachine === 'D-01';
  const windExceeded = isDrone && context.windMs > WIND_CEILING_MS;

  const actions = useMemo(() => {
    if (selectedMachine === 'auto') {
      return ['Scout & NDVI scan', 'Spot-spray', 'Weed between rows', 'Soil & leaf sample', 'Repair dike'];
    }
    return MACHINES[selectedMachine].actions;
  }, [selectedMachine]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === 'note') {
      addNote({
        text: text.trim() || 'Field observation note',
        target: { x: draft.x, z: draft.z },
        paddyId: draft.paddyId,
        context,
      });
      onClose();
      return;
    }

    const mission = dispatchCommand({
      kind: 'command',
      machine: effMachine,
      action: effAction,
      text: text.trim() || effAction,
      target: { x: draft.x, z: draft.z },
      paddyId: draft.paddyId,
      windMs: context.windMs,
      standard: context.standard,
    });

    if (mission.phase === 'proposed' && confirmed && pin.length >= 4) {
      useFieldMissionStore.getState().approve(mission.id, pin);
    }
    onClose();
  };

  return (
    <div className="aq-scrim" role="dialog" aria-modal="true" aria-labelledby="fc-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="aq-dialog" style={{ width: 'min(440px, calc(100vw - 32px))' }}>
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--aq-border-subtle)]">
          <div className="flex items-center gap-2">
            <h2 id="fc-title" className="aq-title text-sm font-semibold">
              {kind === 'command' ? 'Dispatch field command' : 'Field note & agronomist advice'}
            </h2>
            <span className="aq-badge is-water text-[10px]">
              {draft.paddyId ? draft.paddyId : 'Field coordinates'}
            </span>
          </div>
          <button type="button" className="aq-icon-btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          <div className="aq-tabs">
            <button
              type="button"
              className={`aq-tab ${kind === 'command' ? 'is-active' : ''}`}
              onClick={() => setKind('command')}
            >
              <Tractor size={14} /> Command machine
            </button>
            <button
              type="button"
              className={`aq-tab ${kind === 'note' ? 'is-active' : ''}`}
              onClick={() => setKind('note')}
            >
              <MessageSquare size={14} /> Agronomist note
            </button>
          </div>

          {kind === 'command' && (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] text-[var(--aq-stone-500)] mr-1">Machine:</span>
                <button
                  type="button"
                  className={`aq-chip ${selectedMachine === 'auto' ? 'is-selected' : ''}`}
                  onClick={() => setSelectedMachine('auto')}
                >
                  Auto ({effMachine})
                </button>
                {MACHINE_IDS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`aq-chip ${selectedMachine === m ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedMachine(m);
                      setSelectedAction(null);
                    }}
                  >
                    {m === 'D-01' ? <Plane size={11} /> : m === 'R-02' ? <Bot size={11} /> : <Tractor size={11} />}
                    {m} {MACHINES[m].type}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] text-[var(--aq-stone-500)] mr-1">Action:</span>
                {actions.map((act) => (
                  <button
                    key={act}
                    type="button"
                    className={`aq-chip is-compact ${effAction === act ? 'is-selected' : ''}`}
                    onClick={() => setSelectedAction(act)}
                  >
                    {act}
                  </button>
                ))}
              </div>

              {windExceeded && (
                <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                  <ShieldAlert size={14} />
                  <span>
                    Wind speed {context.windMs.toFixed(1)} m/s exceeds the {WIND_CEILING_MS} m/s ceiling. Drone flight blocked.
                  </span>
                </div>
              )}

              <div className="p-2 rounded bg-[var(--aq-surface-app)] border border-[var(--aq-border-subtle)] text-xs flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="rounded"
                  />
                  <span>Two-phase operator approval</span>
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[var(--aq-stone-500)]">PIN:</span>
                  <input
                    type="password"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-14 px-1 py-0.5 text-center text-xs border rounded bg-[var(--aq-surface-card)]"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                kind === 'command'
                  ? 'Mission instructions (e.g. Spot-spray neem oil along southern border)'
                  : 'Observation note (e.g. Pale yellow leaves near dike; check nitrogen)'
              }
              className="aq-input w-full p-2 text-xs rounded border resize-none"
            />
          </div>

          <footer className="flex justify-end gap-2 pt-2 border-t border-[var(--aq-border-subtle)]">
            <AqButton variant="ghost" onClick={onClose}>
              Cancel
            </AqButton>
            <AqButton variant="primary" type="submit" disabled={kind === 'command' && windExceeded}>
              <Send size={13} />
              {kind === 'command' ? 'Dispatch mission' : 'Submit note'}
            </AqButton>
          </footer>
        </form>
      </div>
    </div>
  );
};
