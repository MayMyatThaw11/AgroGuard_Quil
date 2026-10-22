import React, { useEffect, useState } from 'react';
import { getSeasons, type FarmSeasons } from '../../lib/api.ts';
import { SEASON_NAME, monthName, seasonLine, span } from '../../lib/farmmap/seasonText.ts';
import { PROVENANCE_CLASS, PROVENANCE_LABEL } from '../../lib/provenance.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';

export const SeasonStrip: React.FC<{ farmId: string }> = ({ farmId }) => {
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
        <AqSectionLabel>Seasons here</AqSectionLabel>
        <p className="aq-fm-note">Loading the season calendar…</p>
      </DetailSection>
    );
  }
  const line = data === 'error' ? null : seasonLine(data);
  if (data === 'error' || !data.months || !line) {
    return (
      <DetailSection>
        <AqSectionLabel>Seasons here</AqSectionLabel>
        <p className="aq-fm-note">{data === 'error' ? 'The season calendar is unavailable right now.' : data.reason ?? 'No season calendar for this place.'}</p>
      </DetailSection>
    );
  }
  return (
    <DetailSection>
      <AqSectionLabel aside="monthly normals">Seasons here</AqSectionLabel>
      <div className="aq-fm-badges">
        <span className={PROVENANCE_CLASS.inferred}>{PROVENANCE_LABEL.inferred}</span>
      </div>
      <p className="aq-fm-season-now">{line}</p>
      <ol className="aq-fm-season-strip" aria-label="Season of each month">
        {data.months.map((m) => (
          <li key={m.month} className={`aq-fm-season is-${m.season}${m.month === data.month ? ' is-now' : ''}`} aria-current={m.month === data.month ? 'date' : undefined} title={`${monthName(m.month)}: ${SEASON_NAME[m.season]}, ${m.rain_mm} mm`}>
            <span className="aq-fm-season-month">{monthName(m.month).slice(0, 1)}</span>
            <span className="aq-fm-season-tag">{SEASON_NAME[m.season].slice(0, 1)}</span>
          </li>
        ))}
      </ol>
      <p className="aq-fm-note">{data.runs.map((r) => `${SEASON_NAME[r.season]} ${span(r)}`).join(' · ')}</p>
      <More label="How the seasons are worked out">
        <KV k="Rule" v="60 mm a month" sub={data.rule} />
        {data.period ? <KV k="Normals" v={data.period} /> : null}
        {data.note ? <p className="aq-fm-note">{data.note}</p> : null}
        {data.source ? <p className="aq-fm-note">Source: {data.source.provider} · {data.source.sha256.slice(0, 19)}</p> : null}
      </More>
    </DetailSection>
  );
};
