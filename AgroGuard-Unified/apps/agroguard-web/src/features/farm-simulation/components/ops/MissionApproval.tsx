import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { approvalReady } from '../../lib/fieldMissions.ts';
import { useFieldMissionStore } from '../../store/fieldMissionStore.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';

// The separate, deliberate approval step for a proposed field command. Nothing is
// pre-filled or pre-ticked: a named person ticks the confirmation and types the PIN.
// This screen only simulates dispatch. A real machine command goes through the server
// flow in OpsTaskCard (phase A token, then phase B with PIN).
export const MissionApproval: React.FC<{ missionId: string }> = ({ missionId }) => {
  const approve = useFieldMissionStore((s) => s.approve);
  const [confirmed, setConfirmed] = useState(false);
  const [pin, setPin] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const ready = approvalReady(confirmed, pin);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setFailure(approve(missionId, pin, confirmed));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="px-3 py-2.5 border-b border-[var(--aq-border-subtle)] flex flex-col gap-2 text-xs"
      aria-label="Approve this command"
    >
      <p className="text-[var(--aq-stone-500)]">
        Simulated dispatch. Approving queues a practice mission on this screen. Nothing is sent to a real machine.
      </p>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="rounded" />
        <span>I confirm this command</span>
      </label>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2">
          <span className="text-[var(--aq-stone-500)]">PIN</span>
          <span className="aq-input-wrap" style={{ width: 96 }}>
            <input
              className="aq-input"
              type="password"
              autoComplete="off"
              inputMode="numeric"
              maxLength={12}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              style={{ textAlign: 'center' }}
            />
          </span>
        </label>
        <AqButton variant="primary" type="submit" disabled={!ready}>
          <ShieldCheck size={13} />
          Approve (simulated)
        </AqButton>
      </div>
      {failure && (
        <p role="alert" className="text-[var(--aq-clay-700)]">
          {failure}
        </p>
      )}
    </form>
  );
};
