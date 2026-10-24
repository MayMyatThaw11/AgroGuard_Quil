import React from 'react';
import { CalendarClock, CircleCheck, CloudRain, Droplets, Eye, Leaf, Sprout, Sun, TriangleAlert, Truck, Waves, Wheat, type LucideIcon } from 'lucide-react';
import { decisionFacts, decisionKeys, decisionVars, type Decision, type DecisionId, type DecisionLevel } from '../../lib/farmmap/farmDecisions.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { DetailSection, UpdatedLine } from './detailParts.tsx';

const LEVEL: Record<DecisionLevel, readonly [LucideIcon, Key]> = {
  act: [TriangleAlert, 'farmMap.decide.level.act'],
  watch: [Eye, 'farmMap.decide.level.watch'],
  ok: [CircleCheck, 'farmMap.decide.level.ok'],
  info: [CalendarClock, 'farmMap.decide.level.info'],
};

const ICON: Partial<Record<DecisionId, LucideIcon>> = {
  'water-refill': Droplets,
  'water-drying': Droplets,
  'water-keep': Waves,
  'rain-hold': CloudRain,
  'rain-clear': Sun,
  'dry-soil': Droplets,
  'weak-crop': Leaf,
  'harvest-tonnes': Wheat,
  'market-haul': Truck,
  stage: Sprout,
};

const order = (index: number, chip?: number) => ({ '--i': index, ...(chip === undefined ? {} : { '--j': chip }) }) as React.CSSProperties;

interface FarmDecisionsProps {
  decisions: readonly Decision[];
  forecastReady: boolean;
}

export const FarmDecisions: React.FC<FarmDecisionsProps> = ({ decisions, forecastReady }) => {
  const t = useT();
  if (!decisions.length) return null;
  return (
    <DetailSection className="is-decisions">
      <AqSectionLabel>{t('farmMap.decide.heading')}</AqSectionLabel>
      <ul className="aq-fm-decisions">
        {decisions.map((decision, index) => {
          const [LevelIcon, levelKey] = LEVEL[decision.level];
          const Icon = ICON[decision.id] ?? LevelIcon;
          const { title, why } = decisionKeys(decision);
          const vars = decisionVars(decision.params, activeLocale());
          const facts = decisionFacts(decision, vars);
          return (
            <li key={`${decision.id}-${decision.level}`} className={`aq-fm-decision is-${decision.level} fx-decision-${decision.id}`} style={order(index)}>
              <span className="aq-fm-decision-icon"><Icon size={20} strokeWidth={2.1} aria-hidden="true" /></span>
              <div className="aq-fm-decision-body">
                <span className="aq-fm-decision-level">{t(levelKey)}</span>
                <strong className="aq-fm-decision-title">{t(title, vars)}</strong>
                <p className="aq-fm-decision-why">{t(why, vars)}</p>
                {facts.length || decision.verify ? (
                  <ul className="aq-fm-decision-facts">
                    {facts.map((fact, j) => (
                      <li key={fact.label} className="aq-fm-fact" style={order(index, j)}><span>{t(fact.label)}</span><b>{fact.value}</b></li>
                    ))}
                    {decision.verify ? <li className="aq-fm-fact is-verify" style={order(index, facts.length)}>{t('farmMap.decide.verify')}</li> : null}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {forecastReady ? null : <p className="aq-fm-note" role="status">{t('farmMap.decide.noForecast')}</p>}
      <UpdatedLine>{t('farmMap.decide.note')}</UpdatedLine>
    </DetailSection>
  );
};
