import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Droplets, FlaskConical, Leaf, Pause, Play, SprayCan, Sprout, X } from 'lucide-react';
import type { SeasonReplay, SeasonVar } from '../../lib/api.ts';
import { ENGINE_LABEL, engineDays, keyStep, seasonLength, step, varAt, type Playback, type Speed, type TintVar } from '../../lib/farmmap/seasonPlayback.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { ChoiceTiles } from '../inputs/ChoiceTiles.tsx';
import { SeasonDial, type DialMark, type DialStage, type DialWindow } from '../inputs/SeasonDial.tsx';

const SPEEDS: Speed[] = [1, 4, 16];
const TINTS: { value: TintVar; icon: React.ReactNode }[] = [
  { value: 'ponded_mm', icon: <Droplets size={15} /> },
  { value: 'canopy_cover', icon: <Leaf size={15} /> },
  { value: 'n_factor', icon: <FlaskConical size={15} /> },
  { value: 'weed_loss_pct', icon: <Sprout size={15} /> },
  { value: 'residue', icon: <SprayCan size={15} /> },
];
const READOUT = ['ponded_mm', 'lai', 'biomass_kg_ha', 'yield_kg_ha', 'n_factor', 'weed_loss_pct'] as const;
const STAGE_CLASS: Record<string, string> = {
  nursery: 'is-nursery',
  vegetative: 'is-veg',
  'photoperiod-sensitive': 'is-pps',
  'panicle formation': 'is-pf',
  'grain filling': 'is-gf',
  mature: 'is-mat',
};
const RAIN_FULL_MM = 30;

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function show(cell: SeasonVar): string {
  if (cell.value === null || cell.value === undefined) return '—';
  if (typeof cell.value === 'boolean') return cell.value ? '✓' : '·';
  const n = typeof cell.value === 'number' ? cell.value : Object.values(cell.value).reduce((a, b) => a + b, 0);
  const unit = cell.unit && cell.unit !== '-' ? ` ${cell.unit.replace(/m2/g, 'm²')}` : '';
  return `${n.toLocaleString(activeLocale(), { maximumFractionDigits: n < 10 ? 2 : 0 })}${unit}`;
}

const number = (cell: SeasonVar): number | null => (typeof cell.value === 'number' ? cell.value : null);

interface SeasonTimelineProps {
  run: SeasonReplay;
  parcelId: string;
  year: number;
  engine: string;
  tint: TintVar;
  playback: Playback;
  onYear: (year: number) => void;
  onEngine: (engine: string) => void;
  onTint: (tint: TintVar) => void;
  onPlayback: (next: Playback | ((p: Playback) => Playback)) => void;
  onReplica?: () => void;
  onClose: () => void;
}

export const SeasonTimeline: React.FC<SeasonTimelineProps> = ({ run, parcelId, year, engine, tint, playback, onYear, onEngine, onTint, onPlayback, onReplica, onClose }) => {
  const t = useT();
  const last = seasonLength(run, year);
  const own = engineDays(run, year, 'own');
  const row = own[playback.day];
  const frame = useRef(0);

  useEffect(() => {
    if (!playback.playing) return;
    let before = performance.now();
    const tick = (now: number) => {
      onPlayback((p) => step(p, now - before, last));
      before = now;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playback.playing, last, onPlayback]);

  useEffect(() => {
    if (reduced()) onPlayback((p) => ({ ...p, playing: false }));
  }, [onPlayback]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault();
      onPlayback((p) => ({ ...p, playing: !p.playing && p.day < last }));
      return;
    }
    const day = keyStep(playback.day, e.key, last);
    if (day !== playback.day) {
      e.preventDefault();
      onPlayback((p) => ({ ...p, day, playing: false }));
    }
  };

  const yr = run.years[year];
  const windowsRaw = yr && 'windows' in (yr.engines.own ?? {}) ? (yr.engines.own as { windows: { kind: string; start: string | null; end: string | null }[] }).windows : [];
  const events = yr?.plan.events ?? [];

  const dial = useMemo(() => {
    const index = (date: string | null) => (date ? own.findIndex((r) => r.date === date) : -1);
    const stages: DialStage[] = [];
    own.forEach((r, i) => {
      const cls = STAGE_CLASS[r.stage ?? ''] ?? '';
      const prev = stages.at(-1);
      if (prev && prev.cls === cls) prev.to = Math.min(last, i + 1);
      else stages.push({ from: i, to: Math.min(last, i + 1), cls });
    });
    const windows: DialWindow[] = windowsRaw
      .filter((w) => w.kind !== 'harvest')
      .flatMap((w) => {
        const from = index(w.start);
        return from < 0 ? [] : [{ from, to: Math.max(from, index(w.end)), kind: w.kind }];
      });
    const marks: DialMark[] = events.flatMap((e) => {
      const day = index(e.date);
      return day < 0 ? [] : [{ day, kind: e.kind }];
    });
    const rain = own.map((r) => {
      const irrigation = r.vars.irrigation_mm?.value;
      const mm = (r.balance?.in_mm ?? 0) - (typeof irrigation === 'number' ? irrigation : 0);
      return mm > 0 ? Math.min(1, mm / RAIN_FULL_MM) : 0;
    });
    return { stages, windows, marks, rain };
  }, [own, windowsRaw, events, last]);

  const bund = yr?.plan.bund_height_cm ? yr.plan.bund_height_cm * 10 : null;
  const ponded = number(varAt(run, year, 'own', playback.day, 'ponded_mm'));
  const canopy = number(varAt(run, year, 'own', playback.day, 'canopy_cover'));
  const stageKey = row?.stage ? STAGE_CLASS[row.stage]?.slice(3) ?? 'veg' : null;

  return (
    <section className="aq-fm-sim" aria-label={t('farmMap.sim.timeline')} onKeyDown={onKey}>
      <div className="aq-fm-sim-body">
        <SeasonDial
          label={t('farmMap.sim.scrub')}
          valueText={row ? `${row.date}, ${t('farmMap.sim.das', { n: row.das })}` : ''}
          day={playback.day}
          last={last}
          playing={playback.playing}
          stages={dial.stages}
          windows={dial.windows}
          events={dial.marks}
          rain={dial.rain}
          water={ponded !== null && bund ? ponded / bund : null}
          canopy={canopy}
          hazy={row?.vars.heat_day?.value === true}
          centre={{ caption: t('farmMap.sim.day'), big: String(row?.das ?? playback.day), date: row?.date ?? '—', stage: stageKey ? t(`farmMap.sim.stage.${stageKey}` as Key) : '—' }}
          onDay={(day) => onPlayback((p) => ({ ...p, day, playing: false }))}
        />
        <div className="aq-fm-sim-side">
          <div className="aq-fm-sim-row">
            <button type="button" className="aq-icon-btn aq-fm-sim-play" aria-label={playback.playing ? t('farmMap.sim.pause') : t('farmMap.sim.play')} onClick={() => onPlayback((p) => ({ ...p, playing: !p.playing && p.day < last, day: p.day >= last ? 0 : p.day }))}>
              {playback.playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            </button>
            <div className="aq-fm-sim-speed" role="group" aria-label={t('farmMap.sim.speed')}>
              {SPEEDS.map((s) => (
                <button key={s} type="button" className={`aq-fm-chip ${playback.speed === s ? 'is-on' : ''}`} aria-pressed={playback.speed === s} onClick={() => onPlayback((p) => ({ ...p, speed: s }))}>
                  {s}×
                </button>
              ))}
            </div>
            <div className="aq-fm-sim-when">
              <b>{row?.date ?? '—'}</b>
              <span>{t('farmMap.sim.das', { n: row?.das ?? 0 })} · {stageKey ? t(`farmMap.sim.stage.${stageKey}` as Key) : '—'}</span>
            </div>
            {onReplica ? <button type="button" className="aq-icon-btn" aria-label={t('farmMap.sim.replica')} onClick={onReplica}><Box size={15} aria-hidden="true" /></button> : null}
            <button type="button" className="aq-icon-btn" aria-label={t('farmMap.sim.close')} onClick={onClose}><X size={15} aria-hidden="true" /></button>
          </div>
          <ChoiceTiles label={t('farmMap.sim.tintLabel')} value={tint} options={TINTS.map((o) => ({ value: o.value, label: t(`farmMap.sim.tint.${o.value}` as Key), icon: o.icon }))} onChange={onTint} />
          <ChoiceTiles label={t('farmMap.sim.engine')} value={engine} options={Object.keys(yr?.engines ?? {}).map((name) => ({ value: name, label: ENGINE_LABEL[name] ?? name }))} onChange={onEngine} />
          {run.years.length > 1 ? (
            <ChoiceTiles label={t('farmMap.sim.yearSel')} value={String(year)} options={run.years.map((y, i) => ({ value: String(i), label: t('farmMap.sim.weatherOf', { year: y.year }) }))} onChange={(value) => onYear(Number(value))} />
          ) : null}
        </div>
      </div>
      <dl className="aq-fm-sim-readout">
        {READOUT.map((name) => {
          const cell = varAt(run, year, engine, playback.day, name);
          return (
            <div key={name} title={cell.reason ?? cell.bound}>
              <dt>{t(`farmMap.sim.var.${name}` as Key)}</dt>
              <dd>{show(cell)}{cell.bound ? '*' : ''}</dd>
            </div>
          );
        })}
      </dl>
      <p className="aq-fm-sim-note">{t('farmMap.sim.timelineNote', { parcel: parcelId })}</p>
    </section>
  );
};
