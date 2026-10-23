import React, { useEffect, useState } from 'react';
import { Download, ShieldAlert } from 'lucide-react';
import { VAULT_NOTE_LIMIT, addVaultNote, getVault, type FarmVault, type VaultNote, type VaultNoteKind } from '../../lib/api.ts';
import { ApiError, SIGN_IN_TO_WRITE, failedText, writeErrorText } from '../../lib/apiError.ts';
import { activeSession } from '../../lib/session.ts';
import { activeLocale, useT } from '../../lib/i18n.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';

const SHOWN = 3;
const bytes = (text: string) => new TextEncoder().encode(text).length;
const when = (iso: string) => new Date(iso).toLocaleString(activeLocale(), { dateStyle: 'medium', timeStyle: 'short' });

export const FieldNotesSection: React.FC<{ farmId: string }> = ({ farmId }) => {
  const t = useT();
  const [data, setData] = useState<FarmVault | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<VaultNoteKind>('scouting_notes');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const stop = new AbortController();
    setFailed(null);
    getVault(farmId, stop.signal).then(
      (vault) => alive && setData(vault),
      (err: unknown) => alive && setFailed(failedText(err, t('farmMap.vault.failed'))),
    );
    return () => {
      alive = false;
      stop.abort();
    };
  }, [farmId, tick]);

  const save = async () => {
    const who = activeSession()?.name ?? '';
    if (!who) return setNote({ error: true, text: SIGN_IN_TO_WRITE });
    const body = text.trim();
    if (!body) return setNote({ error: true, text: t('farmMap.vault.empty') });
    if (bytes(body) > VAULT_NOTE_LIMIT) return setNote({ error: true, text: t('farmMap.vault.tooLong') });
    setBusy(true);
    try {
      await addVaultNote(farmId, { text: body, kind, added_by: who });
      setText('');
      setNote({ error: false, text: t('farmMap.vault.saved') });
      setTick((n) => n + 1);
    } catch (err) {
      setNote({ error: true, text: `${writeErrorText(err, t('farmMap.vault.notSaved'))}${err instanceof ApiError && err.requestId ? ` · ${t('farmMap.rec.request', { id: err.requestId })}` : ''}` });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([data.markdown], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${farmId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kindLabel = (k: VaultNoteKind) => (k === 'scouting_notes' ? t('farmMap.vault.kindScout') : t('farmMap.vault.kindCheck'));
  const recent: VaultNote[] = data ? [...data.notes, ...data.checks].sort((a, b) => b.at.localeCompare(a.at)).slice(0, SHOWN) : [];
  const council = data?.councils[0];

  return (
    <DetailSection>
      <AqSectionLabel aside={t('farmMap.vault.aside')}>{t('farmMap.vault.title')}</AqSectionLabel>
      {!data && !failed ? <p className="aq-fm-note">{t('farmMap.vault.loading')}</p> : null}
      {failed ? <p className="aq-fm-note">{failed}</p> : null}
      {data ? (
        <>
          {recent.length ? (
            recent.map((n) => <KV key={n.path} k={kindLabel(n.kind)} v={n.text} sub={t('farmMap.vault.by', { at: when(n.at), who: n.by })} />)
          ) : (
            <p className="aq-fm-note">{t('farmMap.vault.none')}</p>
          )}
          {council ? (
            <KV
              k={t('farmMap.vault.council', { at: council.at.slice(0, 10) })}
              v={
                <span className="aq-fm-badges">
                  {Object.entries(council.verdicts).map(([agent, verdict]) => (
                    <AqBadge key={agent}>{`${agent}: ${verdict ?? '—'}`}</AqBadge>
                  ))}
                </span>
              }
              sub={council.intercepts.length ? t('farmMap.vault.intercepts', { n: council.intercepts.length }) : undefined}
            />
          ) : null}
          {council?.intercepts.length ? (
            <div className="aq-alert is-warning">
              <ShieldAlert size={14} aria-hidden="true" />
              <span>{council.intercepts[0]}</span>
            </div>
          ) : null}
          <More label={t('farmMap.vault.add')}>
            <label className="aq-fm-trace-field">
              <span className="aq-fm-kv-key">{t('farmMap.vault.kind')}</span>
              <span className="aq-input-wrap">
                <select className="aq-input" value={kind} onChange={(e) => setKind(e.target.value as VaultNoteKind)}>
                  <option value="scouting_notes">{t('farmMap.vault.kindScout')}</option>
                  <option value="verification_checks">{t('farmMap.vault.kindCheck')}</option>
                </select>
              </span>
            </label>
            <label className="aq-fm-trace-field">
              <span className="aq-fm-kv-key">{t('farmMap.vault.text')}</span>
              <span className="aq-input-wrap">
                <textarea className="aq-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
              </span>
            </label>
            {note ? <div className={`aq-alert ${note.error ? 'is-error' : 'is-success'}`} role={note.error ? 'alert' : 'status'}>{note.text}</div> : null}
            <AqButton variant="primary" disabled={busy} onClick={() => void save()}>{busy ? t('farmMap.common.saving') : t('farmMap.vault.save')}</AqButton>
          </More>
          <More label={t('farmMap.vault.unknown')}>
            {Object.entries(data.farm.missing).map(([field, reason]) => (
              <KV key={field} k={field} v="—" sub={reason} />
            ))}
            <p className="aq-fm-note">{t('farmMap.vault.source')}</p>
            <AqButton onClick={download}>
              <Download size={14} aria-hidden="true" /> {t('farmMap.vault.download')}
            </AqButton>
          </More>
        </>
      ) : null}
    </DetailSection>
  );
};
