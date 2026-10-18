import React from 'react';
import { ChevronRight, Loader } from 'lucide-react';
import type { Datum, FactId, SiteFacts } from '../../lib/site/siteFacts.ts';
import { BASIS_NOTE, type FitResult } from '../../lib/site/techniqueFit.ts';
import { AGRIQILL_SCOPE, CATALOGUE_SOURCE } from '../../lib/site/techniqueCatalog.ts';
import { useSiteFit } from '../../lib/site/useSiteFit.ts';
import { AqBadge } from '../aq/aqPrimitives.tsx';
import { AqSectionLabel } from '../aq/aqLayout.tsx';

interface TechniqueFitProps {
  lat: number;
  lon: number;
  shown?: number;
}

const SIGN_CLASS = { '+': 'is-plus', '−': 'is-minus', '!': 'is-cond', '?': 'is-open' } as const;
const SIGN_LABEL = { '+': 'Supports', '−': 'Rules out', '!': 'Condition', '?': 'Unknown' } as const;

const Chevron = () => <ChevronRight size={14} className="aq-site-chev" aria-hidden="true" />;

const valueText = (d: Datum) => (d.value == null ? '—' : `${d.value.toLocaleString('en-US')}${d.unit ? ` ${d.unit}` : ''}`);

function factLine(site: SiteFacts, ids: readonly FactId[]): string {
  return ids.map((id) => `${site.facts[id].label}: ${valueText(site.facts[id])}`).join(' · ');
}

const summaryOf = (r: FitResult) => (r.reasons.find((x) => x.sign === '+') ?? r.reasons.find((x) => x.sign === '!') ?? r.reasons[0])?.text ?? r.missing[0] ?? r.family.what;

const Row: React.FC<{ result: FitResult; site: SiteFacts }> = ({ result, site }) => (
  <details className="aq-site-row">
    <summary>
      <span className="aq-site-row-name">
        <Chevron />
        <span className="aq-site-num">#{result.family.id}</span> {result.family.name}
      </span>
      <span className="aq-site-row-why">{summaryOf(result)}</span>
    </summary>
    <ul className="aq-site-reasons">
      {result.reasons.map((reason, i) => (
        <li key={i} className={SIGN_CLASS[reason.sign]} title={BASIS_NOTE[reason.basis]}>
          <span role="img" aria-label={SIGN_LABEL[reason.sign]}>{reason.sign}</span> {reason.text}
          <span className="aq-site-basis">
            {' '}
            · {reason.basis}
            {reason.facts.length ? ` · ${factLine(site, reason.facts)}` : ''}
          </span>
        </li>
      ))}
      {result.missing.map((m) => (
        <li key={m} className="is-open">
          <span role="img" aria-label={SIGN_LABEL['?']}>?</span> Missing: {m}
        </li>
      ))}
    </ul>
    {result.alsoNeeds.length ? <p className="aq-site-note">Also needs, not known here: {result.alsoNeeds.join(', ')}.</p> : null}
    <p className="aq-site-note">Leads to check, not recommendations: {result.family.leads.join(', ')}.</p>
  </details>
);

const inScope = (r: FitResult) => AGRIQILL_SCOPE.has(r.family.id);

const Group: React.FC<{ title: string; items: readonly FitResult[]; site: SiteFacts; open?: boolean }> = ({ title, items, site, open = false }) =>
  items.length ? (
    <details className="aq-site-group" open={open}>
      <summary>
        <Chevron />
        {title} <span className="aq-site-count">{items.length}</span>
      </summary>
      {items.map((r) => (
        <Row key={r.family.id} result={r} site={site} />
      ))}
    </details>
  ) : null;

export const TechniqueFit: React.FC<TechniqueFitProps> = ({ lat, lon, shown = 5 }) => {
  const { loading, site, groups: all, character, error } = useSiteFit(lat, lon);
  const groups = all && {
    fits: all.fits.filter(inScope),
    conditional: all.conditional.filter(inScope),
    notHere: all.notHere.filter(inScope),
    needsData: all.needsData.filter(inScope),
    onTop: all.onTop.filter(inScope),
  };
  if (loading) {
    return (
      <div className="aq-site">
        <AqSectionLabel>What fits this land</AqSectionLabel>
        <p className="aq-site-note">
          <Loader size={12} className="aq-tw-spin" aria-hidden="true" /> Reading 10 years of climate, terrain and surroundings…
        </p>
      </div>
    );
  }
  if (!site || !groups) {
    return (
      <div className="aq-site">
        <AqSectionLabel>What fits this land</AqSectionLabel>
        <p className="aq-site-note">Site data did not load ({error ?? 'unknown error'}). Nothing is shown in its place.</p>
      </div>
    );
  }
  const top = groups.fits.slice(0, shown);
  const facts = Object.values(site.facts);
  return (
    <div className="aq-site">
      <AqSectionLabel aside="site screen">What fits this land</AqSectionLabel>
      {character.length ? (
        <div className="aq-site-chips">
          {character.map((c) => (
            <AqBadge key={c.label}>
              <span title={`${factLine(site, c.facts)} · ${c.basis}`}>{c.label}</span>
            </AqBadge>
          ))}
        </div>
      ) : null}
      {top.length ? (
        top.map((r) => <Row key={r.family.id} result={r} site={site} />)
      ) : (
        <p className="aq-site-note">Nothing fits on site data alone. See the conditional list.</p>
      )}
      <Group title="More that fit" items={groups.fits.slice(shown)} site={site} />
      <Group title="With conditions" items={groups.conditional} site={site} open={!top.length} />
      <Group title="Not for this land" items={groups.notHere} site={site} />
      <Group title="Needs data first" items={groups.needsData} site={site} />
      <p className="aq-site-note">
        Apply on top: {groups.onTop.map((r) => r.family.name).join(' · ')}.
      </p>
      <details className="aq-site-group">
        <summary>
          <Chevron />
          Sources and missing data
        </summary>
        <ul className="aq-site-facts">
          {facts.map((d) => (
            <li key={d.id}>
              <span className="aq-site-fact-label">{d.label}</span>
              <span>
                {valueText(d)}
                {d.value == null && d.reason ? ` · ${d.reason}` : ''}
              </span>
              <span className="aq-site-basis">
                {d.sourceClass} · {d.provider}
                {d.period ? ` · ${d.period}` : ''}
                {d.resolution ? ` · ${d.resolution}` : ''}
              </span>
            </li>
          ))}
        </ul>
        <p className="aq-site-note">Families from {CATALOGUE_SOURCE}, limited to the {AGRIQILL_SCOPE.size} Farm Simulation plans and monitors: field crops, fish and shrimp mixing, integrated and ecological systems. Soil texture is a 250 m SoilGrids estimate, not a soil test. Buyer, capital, power and skills are not known here. Distances and slope bands are screening assumptions, TO VERIFY.</p>
      </details>
    </div>
  );
};
