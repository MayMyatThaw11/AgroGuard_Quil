import React, { useId, useRef } from 'react';
import { angleFor, arcPath, dayFromAngle, dialKey, pointerAngle, settleDay } from '../../lib/inputs/dialMath.ts';
import { reducedMotion } from '../../lib/inputs/motion.ts';

const C = 102;
const R_STAGE = 72;
const R_WINDOW = 84;
const R_RAIN = 90;
const R_EVENT = 58;
const R_WELL = 46;
const RAIN_LEN = 12;
const TRAIL_STEPS = 6;
const TRAIL_DAYS = 2;
const RAYS = 8;

export interface DialStage {
  from: number;
  to: number;
  cls: string;
}

export interface DialWindow {
  from: number;
  to: number;
  kind: string;
}

export interface DialMark {
  day: number;
  kind: string;
}

export interface SeasonDialProps {
  label: string;
  valueText: string;
  day: number;
  last: number;
  playing: boolean;
  stages: readonly DialStage[];
  windows: readonly DialWindow[];
  events: readonly DialMark[];
  rain: readonly number[];
  water: number | null;
  canopy: number | null;
  hazy: boolean;
  centre: { caption: string; big: string; date: string; stage: string };
  onDay: (day: number) => void;
}

const point = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};

export const SeasonDial: React.FC<SeasonDialProps> = ({ label, valueText, day, last, playing, stages, windows, events, rain, water, canopy, hazy, centre, onDay }) => {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastDay = useRef(day);
  lastDay.current = day;
  const sun = angleFor(day, last);
  const still = reducedMotion();

  const at = (e: React.PointerEvent, first: boolean) => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    const next = dayFromAngle(pointerAngle(box.left + box.width / 2, box.top + box.height / 2, e.clientX, e.clientY), last);
    onDay(first ? next : settleDay(lastDay.current, next, last));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = dialKey(day, e.key, last);
    if (next !== day || e.key.startsWith('Arrow') || e.key.startsWith('Page') || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      if (next !== day) onDay(next);
    }
  };

  return (
    <div
      ref={root}
      className="aq-dial"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={day}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus();
        dragging.current = true;
        at(e, true);
      }}
      onPointerMove={(e) => dragging.current && at(e, false)}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <svg viewBox="0 0 204 204" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={`${id}-well`}>
            <circle cx={C} cy={C} r={R_WELL} />
          </clipPath>
          <filter id={`${id}-haze`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves="2" seed="3">
              {still ? null : <animate attributeName="baseFrequency" dur="3s" values="0.02 0.06;0.03 0.09;0.02 0.06" repeatCount="indefinite" />}
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="3" />
          </filter>
        </defs>
        <g className={hazy ? 'fx-heat-haze is-hazy' : 'fx-heat-haze'} filter={hazy ? `url(#${id}-haze)` : undefined}>
          <path className="aq-dial-track" d={arcPath(C, C, R_STAGE, angleFor(0, last), angleFor(last, last))} />
          {stages.map((s, i) => (
            <path key={`${s.from}-${s.cls}`} className={`aq-dial-stage ${s.cls} fx-arc-sweep-in`} style={{ '--i': i } as React.CSSProperties} pathLength={1} d={arcPath(C, C, R_STAGE, angleFor(s.from, last), angleFor(s.to, last))} />
          ))}
          {windows.map((w, i) => (
            <path key={`${w.kind}-${i}`} className={`aq-dial-window is-${w.kind}${day >= w.from && day <= w.to ? ' is-active fx-window-breathe' : ''}`} d={arcPath(C, C, R_WINDOW, angleFor(w.from, last), angleFor(Math.max(w.to, w.from + 0.4), last))} />
          ))}
        </g>
        <g className="aq-dial-rain fx-rain-tick-fall">
          {rain.map((intensity, d) => {
            if (intensity <= 0) return null;
            const a = angleFor(d, last);
            const from = point(R_RAIN, a);
            const to = point(R_RAIN + RAIN_LEN * Math.min(1, intensity), a);
            return <line key={d} style={{ '--i': d } as React.CSSProperties} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
          })}
        </g>
        {events.map((m, i) => {
          const p = point(R_EVENT, angleFor(m.day, last));
          return <circle key={`${m.kind}-${m.day}-${i}`} className={`aq-dial-event is-${m.kind}${m.day === day ? ' is-hit fx-event-pop' : ''}`} cx={p.x} cy={p.y} r={4} />;
        })}
        <g className={`fx-comet-trail${playing ? ' is-playing' : ''}`}>
          {Array.from({ length: TRAIL_STEPS }, (_, k) => {
            const from = Math.max(0, day - (k + 1) * TRAIL_DAYS);
            const to = Math.max(0, day - k * TRAIL_DAYS);
            return from === to ? null : <path key={k} className="aq-dial-trail" style={{ '--k': k } as React.CSSProperties} d={arcPath(C, C, R_STAGE, angleFor(from, last), angleFor(to, last))} />;
          })}
        </g>
        <circle className="aq-dial-well" cx={C} cy={C} r={R_WELL} />
        <g clipPath={`url(#${id}-well)`}>
          {canopy !== null ? <circle className="aq-dial-canopy fx-canopy-fill" cx={C} cy={C} r={R_WELL} style={{ transform: `scale(${Math.sqrt(Math.min(1, Math.max(0, canopy)))})` }} /> : null}
          {water !== null ? <rect className="aq-dial-water fx-water-fill" x={C - R_WELL} y={C + R_WELL - 2 * R_WELL * Math.min(1, Math.max(0, water))} width={2 * R_WELL} height={2 * R_WELL} /> : null}
        </g>
        <text className="aq-dial-caption" x={C} y={C - 26}>{centre.caption}</text>
        <text key={centre.big} className="aq-dial-big is-flip fx-day-flip" x={C} y={C + 2}>{centre.big}</text>
        <text className="aq-dial-date" x={C} y={C + 16}>{centre.date}</text>
        <text className="aq-dial-stage-name" x={C} y={C + 30}>{centre.stage}</text>
        <g className="aq-dial-sun fx-sun-marker" style={{ transform: `rotate(${sun}deg)`, transformOrigin: `${C}px ${C}px` }}>
          {Array.from({ length: RAYS }, (_, k) => {
            const a = (k / RAYS) * Math.PI * 2;
            return <line key={k} className="ray" x1={C + Math.sin(a) * 10} y1={C - R_STAGE + Math.cos(a) * 10} x2={C + Math.sin(a) * 13.5} y2={C - R_STAGE + Math.cos(a) * 13.5} />;
          })}
          <circle className="core" cx={C} cy={C - R_STAGE} r={7.5} />
        </g>
      </svg>
    </div>
  );
};
