import React, { useState } from 'react';
import { Bot, CheckCircle, Clock, Navigation, Send, ShieldAlert, Sprout, X } from 'lucide-react';
import type { Mission } from '../../lib/fieldMissions.ts';
import type { AgronomyContext } from '../../lib/agronomist.ts';
import { useFieldMissionStore } from '../../store/fieldMissionStore.ts';
import { AqButton, AqBadge } from '../aq/aqPrimitives.tsx';

interface FieldThreadModalProps {
  mission: Mission;
  context: AgronomyContext;
  onClose: () => void;
}

export const FieldThreadModal: React.FC<FieldThreadModalProps> = ({ mission, context, onClose }) => {
  const replyToThread = useFieldMissionStore((s) => s.replyToThread);
  const [replyText, setReplyText] = useState('');

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    replyToThread(mission.id, replyText.trim(), context);
    setReplyText('');
  };

  const getRiskTone = (risk: string) => {
    if (risk === 'high') return 'alert';
    if (risk === 'medium') return 'warning';
    return 'neutral';
  };

  return (
    <div className="aq-scrim" role="dialog" aria-modal="true" aria-labelledby="ft-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="aq-dialog flex flex-col" style={{ width: 'min(440px, calc(100vw - 32px))' }}>
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--aq-border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="aq-badge is-water font-mono">{mission.label}</span>
            <h2 id="ft-title" className="aq-title text-sm font-semibold">
              {mission.kind === 'command' ? `${mission.machine} · ${mission.action}` : 'Agronomist Field Thread'}
            </h2>
            {mission.paddyId && <span className="text-xs text-[var(--aq-stone-500)]">{mission.paddyId}</span>}
          </div>
          <button type="button" className="aq-icon-btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </header>

        {mission.kind === 'command' && (
          <div className="bg-[var(--aq-surface-app)] px-3 py-2 border-b border-[var(--aq-border-subtle)] text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              {mission.phase === 'enroute' ? (
                <Navigation size={13} className="text-blue-500 animate-pulse" />
              ) : mission.phase === 'working' ? (
                <Clock size={13} className="text-amber-500 animate-spin" />
              ) : mission.phase === 'done' ? (
                <CheckCircle size={13} className="text-emerald-500" />
              ) : (
                <Bot size={13} className="text-stone-400" />
              )}
              <span className="capitalize font-medium">Phase: {mission.phase}</span>
            </div>
            {mission.blockedReason && (
              <span className="text-red-500 flex items-center gap-1">
                <ShieldAlert size={12} /> {mission.blockedReason}
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 max-h-72">
          {mission.thread.map((item, idx) => {
            if (item.role === 'user') {
              return (
                <div key={idx} className="self-end max-w-[85%] bg-[var(--aq-mint-200)] text-[var(--aq-stone-900)] p-2 rounded-lg text-xs">
                  {item.text}
                </div>
              );
            }
            if (item.role === 'event') {
              return (
                <div key={idx} className="text-[11px] text-[var(--aq-stone-500)] italic flex items-center gap-1.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--aq-leaf-400)]" />
                  {item.text}
                </div>
              );
            }
            if (item.role === 'agronomist') {
              return (
                <div key={idx} className="self-start max-w-[92%] bg-[var(--aq-surface-card)] border border-[var(--aq-border-subtle)] p-2.5 rounded-lg text-xs flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--aq-leaf-800)] flex items-center gap-1">
                      <Sprout size={13} /> Agronomist advice
                    </span>
                    <AqBadge tone={getRiskTone(item.risk)}>{item.risk} risk</AqBadge>
                  </div>
                  <p className="text-[var(--aq-stone-700)] leading-relaxed">{item.text}</p>
                  {item.facts && item.facts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.facts.map(([k, v], fIdx) => (
                        <span key={fIdx} className="bg-[var(--aq-surface-tile)] px-1.5 py-0.5 rounded text-[10px] text-[var(--aq-stone-600)]">
                          {k}: <b>{v}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>

        <form onSubmit={handleSendReply} className="border-t border-[var(--aq-border-subtle)] p-2 flex gap-1.5">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Reply to thread or ask agronomist…"
            className="aq-input flex-1 px-2.5 py-1 text-xs rounded border"
          />
          <AqButton variant="primary" type="submit" disabled={!replyText.trim()}>
            <Send size={13} />
          </AqButton>
        </form>
      </div>
    </div>
  );
};
