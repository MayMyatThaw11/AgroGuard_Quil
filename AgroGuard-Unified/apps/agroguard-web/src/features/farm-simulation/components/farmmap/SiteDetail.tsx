import React, { useRef, useState } from 'react';
import { Factory, Upload } from 'lucide-react';
import { linkParcelSite, uploadSites, type ProcessingSite } from '../../lib/api.ts';
import { SIGN_IN_TO_WRITE, writeErrorText } from '../../lib/apiError.ts';
import { precisionKey } from '../../lib/farmmap/sites.ts';
import { activeSession } from '../../lib/session.ts';
import { activeLocale, useT } from '../../lib/i18n.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection, KV } from './detailParts.tsx';

const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null);

export const SiteDetail: React.FC<{ site: ProcessingSite; onFocus: () => void }> = ({ site, onFocus }) => {
  const t = useT();
  const p = site.properties;
  const place = [text(p.village), text(p.village_tract), text(p.township), text(p.district)].filter(Boolean).join(', ');
  const fields: [string, string | null][] = [
    [t('farmMap.site.capacity'), text(p.capacity_tons) ? `${text(p.capacity_tons)} t` : null],
    [t('farmMap.site.area'), `${site.area_ha.toLocaleString(activeLocale(), { maximumFractionDigits: 2 })} ha`],
    [t('farmMap.site.declaredArea'), text(p.area_acres) ? `${text(p.area_acres)} ac` : null],
    [t('farmMap.site.tenure'), text(p.land_type)],
  ];
  return (
    <>
      <DetailSection className="is-head">
        <h2 className="aq-title">{site.name}</h2>
        <p className="aq-meta">{t('farmMap.site.kind')}{place ? ` · ${place}` : ''}</p>
        <div className="aq-fm-badges">
          <AqBadge tone="warning">{t(precisionKey(site.precision_level))}</AqBadge>
        </div>
        <AqButton onClick={onFocus}><Factory size={14} aria-hidden="true" />{t('farmMap.site.show')}</AqButton>
      </DetailSection>
      <DetailSection>
        {fields.map(([k, v]) => (v ? <KV key={k} k={k} v={v} /> : null))}
        <KV k={t('farmMap.site.precision')} v={site.precision_level.replace(/_/g, ' ')} sub={t('farmMap.site.areaBasis')} />
        <p className="aq-fm-note">{t('farmMap.site.noCrop')}</p>
      </DetailSection>
      <DetailSection>
        <AqSectionLabel>{t('farmMap.site.suppliers')}</AqSectionLabel>
        {site.suppliers.length ? (
          site.suppliers.map((s) => <KV key={`${s.farm_id}-${s.parcel_id}`} k={s.parcel_id} v={s.farm_id} />)
        ) : (
          <p className="aq-fm-note">{t('farmMap.site.noSuppliers')}</p>
        )}
      </DetailSection>
    </>
  );
};

export const SitesUpload: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const t = useT();
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pick = async (file: File) => {
    const who = activeSession()?.name ?? '';
    if (!who) return setNote({ error: true, text: SIGN_IN_TO_WRITE });
    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const out = await uploadSites(parsed, who);
      setNote({ error: false, text: t('farmMap.site.uploaded', { n: out.sites.length }) });
      onDone();
    } catch (err) {
      setNote({ error: true, text: err instanceof SyntaxError ? t('farmMap.site.notJson') : writeErrorText(err, t('farmMap.site.uploadFailed')) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <AqButton disabled={busy} aria-describedby="aq-sites-hint" onClick={() => input.current?.click()}>
        <Upload size={14} aria-hidden="true" />{busy ? t('farmMap.common.saving') : t('farmMap.site.upload')}
      </AqButton>
      <input
        ref={input}
        type="file"
        hidden
        accept=".geojson,.json,application/geo+json,application/json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void pick(file);
        }}
      />
      <p id="aq-sites-hint" className="aq-fm-note">{t('farmMap.site.uploadHint')}</p>
      {note ? <div className={`aq-alert ${note.error ? 'is-error' : 'is-success'}`} role={note.error ? 'alert' : 'status'}>{note.text}</div> : null}
    </>
  );
};

export const DeliversTo: React.FC<{ farmId: string; parcels: string[]; sites: ProcessingSite[]; onChanged: () => void }> = ({ farmId, parcels, sites, onChanged }) => {
  const t = useT();
  const [note, setNote] = useState<string | null>(null);
  if (!sites.length) return null;
  const current = (parcel: string) => sites.find((s) => s.suppliers.some((x) => x.farm_id === farmId && x.parcel_id === parcel))?.id ?? '';
  const change = async (parcel: string, value: string) => {
    const who = activeSession()?.name ?? '';
    if (!who) return setNote(SIGN_IN_TO_WRITE);
    try {
      await linkParcelSite(farmId, parcel, value || null, who);
      setNote(null);
      onChanged();
    } catch (err) {
      setNote(writeErrorText(err, t('farmMap.site.linkFailed')));
    }
  };
  return (
    <DetailSection>
      <AqSectionLabel>{t('farmMap.site.deliversTo')}</AqSectionLabel>
      {parcels.map((parcel) => (
        <label key={parcel} className="aq-fm-trace-field">
          <span className="aq-fm-kv-key">{parcel}</span>
          <span className="aq-input-wrap">
            <select className="aq-input" value={current(parcel)} onChange={(e) => void change(parcel, e.target.value)}>
              <option value="">{t('farmMap.site.none')}</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </span>
        </label>
      ))}
      {note ? <div className="aq-alert is-error" role="alert">{note}</div> : null}
    </DetailSection>
  );
};
