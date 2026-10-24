import React, { useEffect, useRef, useState } from 'react';
import { bandState, chillOf, heatOf, snapToStep, wheelKey, type Band } from '../../lib/inputs/dialMath.ts';
import { decimalsOf, reducedMotion, tick } from '../../lib/inputs/motion.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { Odometer } from './Odometer.tsx';

const ITEM_PX = 26;
const SHOWN = 2;
const OVERSHOOT_PX = 18;
const WHEEL_STEP_PX = 40;
const BLOOM_MS = 700;
const FLING_MIN = 0.35;
const FLING_STOP = 0.02;
const FLING_FRICTION = 0.94;
const FRAME_MS = 16;

export interface Limit {
  at: number;
  span: number;
}

export interface RollerPickerProps {
  label: string;
  unit: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  big?: number;
  band?: Band;
  ceiling?: Limit;
  floor?: Limit;
  start?: number;
  hint?: string;
  onChange: (value: number) => void;
  onClear?: () => void;
}

type Zone = 'none' | 'below' | 'in' | 'above';

const ZONE_NOTE: Record<Exclude<Zone, 'none'>, Key> = { below: 'farmMap.input.zoneBelow', in: 'farmMap.input.zoneIn', above: 'farmMap.input.zoneAbove' };

const resist = (px: number) => OVERSHOOT_PX * (1 - Math.exp(-px / OVERSHOOT_PX));

export const RollerPicker: React.FC<RollerPickerProps> = ({ label, unit, value, min, max, step, big, band, ceiling, floor, start, hint, onChange, onClear }) => {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef<HTMLInputElement>(null);
  const drag = useRef<{ y: number; base: number; last: number; at: number; v: number; prevY?: number } | null>(null);
  const fling = useRef(0);
  const latest = useRef({ value: null as number | null, current: 0 });
  const wheel = useRef(0);
  const [offset, setOffset] = useState(0);
  const [typing, setTyping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState('');
  const [bloom, setBloom] = useState(false);
  const digits = decimalsOf(step);
  const current = value ?? start ?? min;
  const snapped = snapToStep(current, step, min, max);
  const upper: Limit | undefined = ceiling ?? (band?.max !== undefined ? { at: band.max, span: Math.max(step * 4, (band.max - (band.min ?? min)) * 0.5) } : undefined);
  const lower: Limit | undefined = floor ?? (band?.min !== undefined ? { at: band.min, span: Math.max(step * 4, ((band.max ?? max) - band.min) * 0.5) } : undefined);
  const zone: Zone = value === null ? 'none' : upper && value > upper.at ? 'above' : lower && value < lower.at ? 'below' : bandState(value, { min: lower?.at, max: upper?.at }) === 'in' ? 'in' : 'none';
  const heat = value !== null && upper ? heatOf(value, upper.at, upper.span) : 0;
  const chill = value !== null && lower ? chillOf(value, lower.at, lower.span) : 0;
  const show = (v: number) => v.toFixed(digits);
  const exact = (v: number) => String(Number(v.toFixed(Math.max(digits, 2))));

  latest.current = { value, current };
  useEffect(() => () => cancelAnimationFrame(fling.current), []);
  useEffect(() => {
    if (!typing) return;
    typed.current?.focus();
    typed.current?.select();
  }, [typing]);

  const commit = (next: number) => {
    const clean = snapToStep(next, step, min, max);
    if (clean !== value) {
      tick();
      onChange(clean);
    }
  };

  useEffect(() => {
    if (zone !== 'in') return undefined;
    setBloom(true);
    const timer = window.setTimeout(() => setBloom(false), BLOOM_MS);
    return () => window.clearTimeout(timer);
  }, [zone]);

  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el && !el.matches(':hover')) return;
      e.preventDefault();
      wheel.current += e.deltaY;
      const steps = Math.trunc(wheel.current / WHEEL_STEP_PX);
      if (steps === 0) return;
      wheel.current -= steps * WHEEL_STEP_PX;
      commit(current - steps * step);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (typing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    cancelAnimationFrame(fling.current);
    drag.current = { y: e.clientY, base: current, last: snapped, at: e.timeStamp, v: 0 };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const raw = d.base + ((d.y - e.clientY) / ITEM_PX) * step;
    const dt = Math.max(1, e.timeStamp - d.at);
    d.v = 0.6 * d.v + 0.4 * ((d.prevY ?? e.clientY) - e.clientY) / dt;
    d.prevY = e.clientY;
    d.at = e.timeStamp;
    const next = snapToStep(raw, step, min, max);
    const px = ((raw - next) / step) * ITEM_PX;
    const out = raw > max || raw < min;
    setOffset(out ? -Math.sign(px) * resist(Math.abs(px)) : -px);
    if (next !== d.last) {
      d.last = next;
      commit(next);
    }
  };

  const release = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    setOffset(0);
    if (!d || reducedMotion() || Math.abs(d.v) < FLING_MIN) return;
    let v = d.v;
    let at = performance.now();
    let pos = latest.current.current;
    const run = (now: number) => {
      const dt = now - at;
      at = now;
      pos += ((v * dt) / ITEM_PX) * step;
      v *= FLING_FRICTION ** (dt / FRAME_MS);
      const next = snapToStep(pos, step, min, max);
      if (next !== latest.current.value) commit(next);
      if (Math.abs(v) > FLING_STOP && next > min && next < max) fling.current = requestAnimationFrame(run);
    };
    fling.current = requestAnimationFrame(run);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setDraft(value === null ? '' : exact(value));
      setTyping(true);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && onClear) {
      e.preventDefault();
      e.stopPropagation();
      onClear();
      return;
    }
    const next = wheelKey(current, e.key, { step, big: big ?? step * 5, min, max });
    if (next !== current || e.key.startsWith('Arrow') || e.key.startsWith('Page')) {
      e.preventDefault();
      e.stopPropagation();
      commit(next);
    }
  };

  const finishTyping = (accept: boolean) => {
    setTyping(false);
    const parsed = Number(draft);
    if (accept && draft.trim() !== '' && Number.isFinite(parsed)) {
      const typed = Math.min(max, Math.max(min, Number(parsed.toFixed(Math.max(digits, 2)))));
      if (typed !== value) onChange(typed);
    }
    root.current?.focus();
  };

  const items = [];
  for (let k = -SHOWN; k <= SHOWN; k += 1) {
    const v = Number((snapped + k * step).toFixed(digits));
    if (v < min - 1e-9 || v > max + 1e-9) continue;
    const away = Math.abs(k);
    const hot = upper !== undefined && v > upper.at;
    const cold = lower !== undefined && v < lower.at;
    items.push(
      <button
        key={k}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={`aq-roll-item${k === 0 ? ' is-centre' : ''}${hot ? ' is-hot' : ''}${cold ? ' is-cold' : ''}`}
        style={{ transform: `translateY(${-k * ITEM_PX + offset}px) scale(${1 - 0.1 * away})`, opacity: 1 - 0.3 * away }}
        onClick={() => k !== 0 && commit(v)}
      >
        {k === 0 && value !== null ? <Odometer text={exact(value)} /> : k === 0 ? '—' : show(v)}
      </button>,
    );
  }

  return (
    <div
      className={`aq-roll-field${typing ? ' is-typing' : ''}`}
      data-zone={zone}
      style={{ '--fx-heat': heat, '--fx-chill': chill } as React.CSSProperties}
    >
      <span className="aq-fm-kv-key">{label}</span>
      {typing ? (
        <span className="aq-roll aq-roll-typed">
          <input
            className="aq-input"
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={draft}
            aria-label={label}
            ref={typed}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => finishTyping(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishTyping(true);
              if (e.key === 'Escape') {
                e.stopPropagation();
                finishTyping(false);
              }
            }}
          />
          <span className="aq-roll-unit">{unit}</span>
        </span>
      ) : (
        <div
          ref={root}
          role="spinbutton"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value ?? undefined}
          aria-valuetext={value === null ? undefined : `${show(value)} ${unit}`}
          className={`aq-roll fx-heat-glow fx-limit-pulse fx-frost-edge fx-band-glow fx-magnetic-snap fx-elastic-stop${bloom ? ' is-bloom fx-band-bloom' : ''}${dragging ? ' is-dragging' : ''}${reducedMotion() ? ' is-still' : ''}`}
          style={{ '--roll-pos': (current - min) / step - offset / ITEM_PX } as React.CSSProperties}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={onKeyDown}
          onDoubleClick={() => {
            setDraft(value === null ? '' : exact(value));
            setTyping(true);
          }}
        >
          <span className="aq-roll-window">{items}</span>
          <span className="aq-roll-unit" aria-hidden="true">{unit}</span>
          <span className="aq-roll-ticks fx-detent-tick" aria-hidden="true" />
        </div>
      )}
      {hint ? <span className="aq-fm-note">{hint}</span> : null}
      {zone !== 'none' ? <span className="aq-fm-note aq-roll-zone">{t(ZONE_NOTE[zone])}</span> : null}
      {value === null ? <span className="aq-fm-note">{t('farmMap.input.unset')}</span> : null}
    </div>
  );
};
