import React, { useEffect, useRef } from 'react';
import { Box, Pause, Play, X } from 'lucide-react';
import type { SeasonReplay, SeasonVar } from '../../lib/api.ts';
import { ENGINE_LABEL, engineDays, keyStep, seasonLength, step, varAt, type Playback, type Speed, type TintVar } from '../../lib/farmmap/seasonPlayback.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';

const SPEEDS: Speed[] = [1, 4, 16];
const TINTS: TintVar[] = ['ponded_mm', 'canopy_cover', 'n_factor', 'weed_loss_pct', 'residue'];
const READOUT = ['ponded_mm', 'lai', 'biomass_kg_ha', 'yield_kg_ha', 'n_factor', 'weed_loss_pct'] as const;
const STAGE_CLASS: Record<string, string> = {
  nursery: 'is-nursery',
  vegetative: 'is-veg',
  'photoperiod-sensitive': 'is-pps',
  'panicle formation': 'is-pf',
  'grain filling': 'is-gf',
  mature: 'is-mat',
};

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function show(cell: SeasonVar): string {
  if (cell.value === null || cell.value === undefined) return '—';
  if (typeof cell.value === 'boolean') return cell.value ? '✓' : '·';
  const n = typeof cell.value === 'number' ? cell.value : Object.values(cell.value).reduce((a, b) => a + b, 0);
  const unit = cell.unit && cell.unit !== '-' ? ` ${cell.unit.replace(/m2/g, 'm²')}` : '';
  return `${n.toLocaleString(activeLocale(), { maximumFractionDigits: n < 10 ? 2 : 0 })}${unit}`;
}

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
  const windows = yr && 'windows' in (yr.engines.own ?? {}) ? (yr.engines.own as { windows: { kind: string; start: string | null; end: string | null }[] }).windows : [];
  const index = (date: string | null) => (date ? own.findIndex((r) => r.date === date) : -1);
  const pct = (i: number) => `${(Math.max(0, i) / Math.max(1, last)) * 100}%`;
  const events = yr?.plan.events ?? [];

  return (
    <section className="aq-fm-sim" aria-label={t('farmMap.sim.timeline')} onKeyDown={onKey}>
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
          <span>{t('farmMap.sim.das', { n: row?.das ?? 0 })} · {row?.stage ? t(`farmMap.sim.stage.${STAGE_CLASS[row.stage]?.slice(3) ?? 'veg'}` as Key) : '—'}</span>
        </div>
        <span className="aq-input-wrap aq-fm-sim-select">
          <select className="aq-input" aria-label={t('farmMap.sim.tintLabel')} value={tint} onChange={(e) => onTint(e.target.value as TintVar)}>
            {TINTS.map((k) => <option key={k} value={k}>{t(`farmMap.sim.tint.${k}` as Key)}</option>)}
          </select>
        </span>
        <span className="aq-input-wrap aq-fm-sim-select">
          <select className="aq-input" aria-label={t('farmMap.sim.engine')} value={engine} onChange={(e) => onEngine(e.target.value)}>
            {Object.keys(yr?.engines ?? {}).map((name) => <option key={name} value={name}>{ENGINE_LABEL[name] ?? name}</option>)}
          </select>
        </span>
        {run.years.length > 1 ? (
          <span className="aq-input-wrap aq-fm-sim-select">
            <select className="aq-input" aria-label={t('farmMap.sim.yearSel')} value={year} onChange={(e) => onYear(Number(e.target.value))}>
              {run.years.map((y, i) => <option key={y.year} value={i}>{t('farmMap.sim.weatherOf', { year: y.year })}</option>)}
            </select>
          </span>
        ) : null}
        {onReplica ? <button type="button" className="aq-icon-btn" aria-label={t('farmMap.sim.replica')} onClick={onReplica}><Box size={15} aria-hidden="true" /></button> : null}
        <button type="button" className="aq-icon-btn" aria-label={t('farmMap.sim.close')} onClick={onClose}><X size={15} aria-hidden="true" /></button>
      </div>
      <div className="aq-fm-sim-track">
        <div className="aq-fm-sim-stages" aria-hidden="true">
          {own.map((r, i) => <i key={r.date} className={STAGE_CLASS[r.stage ?? ''] ?? ''} style={{ left: pct(i), width: pct(1) }} />)}
        </div>
        <div className="aq-fm-sim-windows" aria-hidden="true">
          {windows.filter((w) => w.kind !== 'harvest').map((w, i) => {
            const a = index(w.start);
            const b = Math.max(a, index(w.end));
            return a < 0 ? null : <i key={`${w.kind}-${i}`} className={`is-${w.kind}`} style={{ left: pct(a), width: `max(3px, ${pct(b - a + 1)})` }} title={t(`farmMap.sim.window.${w.kind}` as Key)} />;
          })}
        </div>
        <div className="aq-fm-sim-events" aria-hidden="true">
          {events.map((e, i) => {
            const at = index(e.date);
            return at < 0 ? null : <i key={`${e.kind}-${i}`} className={`is-${e.kind}`} style={{ left: pct(at) }} title={t(`farmMap.sim.kind.${e.kind}` as Key)} />;
          })}
        </div>
        <div className="aq-fm-sim-rain" aria-hidden="true">
          {own.map((r, i) => {
            const irrigation = r.vars.irrigation_mm?.value;
            const mm = (r.balance?.in_mm ?? 0) - (typeof irrigation === 'number' ? irrigation : 0);
            return mm > 0 ? <i key={r.date} style={{ left: pct(i), height: `${Math.min(100, mm)}%` }} /> : null;
          })}
        </div>
        <input
          className="aq-fm-sim-scrub"
          type="range"
          min={0}
          max={last}
          value={playback.day}
          aria-label={t('farmMap.sim.scrub')}
          aria-valuetext={row ? `${row.date}, ${t('farmMap.sim.das', { n: row.das })}` : undefined}
          onChange={(e) => onPlayback((p) => ({ ...p, day: Number(e.target.value), playing: false }))}
        />
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
