import React, { useEffect, useState } from 'react';
import { getSeasons, type FarmSeasons } from '../../lib/api.ts';
import { monthName, seasonLine, seasonName, span } from '../../lib/farmmap/seasonText.ts';
import { useT } from '../../lib/i18n.ts';
import { PROVENANCE_CLASS, PROVENANCE_LABEL } from '../../lib/provenance.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';

export const SeasonStrip: React.FC<{ farmId: string }> = ({ farmId }) => {
  const t = useT();
  const [data, setData] = useState<FarmSeasons | 'error' | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    getSeasons(farmId).then((d) => alive && setData(d), () => alive && setData('error'));
    return () => {
      alive = false;
    };
  }, [farmId]);

  if (data === null) {
    return (
      <DetailSection>
        <AqSectionLabel>{t('farmMap.season.title')}</AqSectionLabel>
        <p className="aq-fm-note">{t('farmMap.season.loading')}</p>
      </DetailSection>
    );
  }
  const line = data === 'error' ? null : seasonLine(data);
  if (data === 'error' || !data.months || !line) {
    return (
      <DetailSection>
        <AqSectionLabel>{t('farmMap.season.title')}</AqSectionLabel>
        <p className="aq-fm-note">{data === 'error' ? t('farmMap.season.unavailable') : data.reason ?? t('farmMap.season.none')}</p>
      </DetailSection>
    );
  }
  return (
    <DetailSection>
      <AqSectionLabel aside={t('farmMap.season.normals')}>{t('farmMap.season.title')}</AqSectionLabel>
      <div className="aq-fm-badges">
        <span className={PROVENANCE_CLASS.inferred}>{PROVENANCE_LABEL.inferred}</span>
      </div>
      <p className="aq-fm-season-now">{line}</p>
      <ol className="aq-fm-season-strip" aria-label={t('farmMap.season.strip')}>
        {data.months.map((m) => (
          <li key={m.month} className={`aq-fm-season is-${m.season}${m.month === data.month ? ' is-now' : ''}`} aria-current={m.month === data.month ? 'date' : undefined} title={`${monthName(m.month)}: ${seasonName(m.season)}, ${m.rain_mm} mm`}>
            <span className="aq-fm-season-month">{monthName(m.month).slice(0, 1)}</span>
            <span className="aq-fm-season-tag">{seasonName(m.season).slice(0, 1)}</span>
          </li>
        ))}
      </ol>
      <p className="aq-fm-note">{data.runs.map((r) => `${seasonName(r.season)} ${span(r)}`).join(' · ')}</p>
      <More label={t('farmMap.season.how')}>
        <KV k={t('farmMap.season.rule')} v={t('farmMap.season.ruleValue')} sub={data.rule} />
        {data.period ? <KV k={t('farmMap.season.period')} v={data.period} /> : null}
        {data.note ? <p className="aq-fm-note">{data.note}</p> : null}
        {data.source ? <p className="aq-fm-note">{t('farmMap.common.source', { src: `${data.source.provider} · ${data.source.sha256.slice(0, 19)}` })}</p> : null}
      </More>
    </DetailSection>
  );
};
