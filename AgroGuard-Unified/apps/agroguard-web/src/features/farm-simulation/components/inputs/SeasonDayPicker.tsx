import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, inSpan, monthGrid, shiftDate } from '../../lib/inputs/calendar.ts';
import { activeLocale, useT } from '../../lib/i18n.ts';

interface SeasonDayPickerProps {
  label: string;
  value: string;
  onChange: (date: string) => void;
  spanDays?: number | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const format = (options: Intl.DateTimeFormatOptions, date: Date) => new Intl.DateTimeFormat(activeLocale(), { ...options, timeZone: 'UTC' }).format(date);
const parts = (date: string) => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 });

export const SeasonDayPicker: React.FC<SeasonDayPickerProps> = ({ label, value, onChange, spanDays = null }) => {
  const t = useT();
  const anchor = value || today();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => parts(anchor));
  const [focus, setFocus] = useState(anchor);
  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);
  const gridRef = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const monthName = format({ month: 'long', year: 'numeric' }, new Date(Date.UTC(view.year, view.month, 1)));
  const weekdays = Array.from({ length: 7 }, (_, i) => format({ weekday: 'narrow' }, new Date(Date.UTC(2026, 5, 1 + i))));
  const shown = value ? format({ dateStyle: 'medium' }, new Date(`${value}T00:00:00Z`)) : t('farmMap.input.pickDate');
  const lastDay = spanDays && value ? addDays(value, spanDays - 1) : null;

  useEffect(() => {
    if (!open) return;
    const next = parts(focus);
    setView((v) => (v.year === next.year && v.month === next.month ? v : next));
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();
  }, [focus, open]);

  const choose = (date: string) => {
    onChange(date);
    setOpen(false);
    toggle.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => shiftDate(focus, -1),
      PageDown: () => shiftDate(focus, 1),
    };
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      toggle.current?.focus();
      return;
    }
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      e.stopPropagation();
      setFocus(move());
    }
  };

  return (
    <div className="aq-day-picker fx-day-picker">
      <span className="aq-fm-kv-key">{label}</span>
      <button
        ref={toggle}
        type="button"
        className="aq-btn aq-btn-secondary aq-day-toggle"
        aria-expanded={open}
        onClick={() => {
          setFocus(anchor);
          setView(parts(anchor));
          setOpen((o) => !o);
        }}
      >
        <CalendarDays size={14} aria-hidden="true" />
        {shown}
      </button>
      {open ? (
        <div className="aq-day-panel" role="group" aria-label={label} onKeyDown={onKeyDown}>
          <div className="aq-day-head">
            <button type="button" className="aq-icon-btn" aria-label={t('farmMap.input.prevMonth')} onClick={() => setFocus(shiftDate(focus, -1))}><ChevronLeft size={14} aria-hidden="true" /></button>
            <b>{monthName}</b>
            <button type="button" className="aq-icon-btn" aria-label={t('farmMap.input.nextMonth')} onClick={() => setFocus(shiftDate(focus, 1))}><ChevronRight size={14} aria-hidden="true" /></button>
          </div>
          <div ref={gridRef} className="aq-day-grid">
            {weekdays.map((w, i) => <span key={i} className="aq-day-dow" aria-hidden="true">{w}</span>)}
            {grid.map((d) => (
              <button
                key={d.date}
                type="button"
                data-date={d.date}
                tabIndex={d.date === focus ? 0 : -1}
                aria-pressed={d.date === value}
                aria-label={format({ dateStyle: 'full' }, new Date(`${d.date}T00:00:00Z`))}
                className={`aq-day${d.outside ? ' is-outside' : ''}${spanDays && inSpan(d.date, value, spanDays) ? ' is-span' : ''}${d.date === lastDay ? ' is-span-end' : ''}`}
                onClick={() => choose(d.date)}
              >
                {Number(d.date.slice(8, 10))}
              </button>
            ))}
          </div>
          {spanDays ? <p className="aq-fm-note">{t('farmMap.input.seasonSpan', { days: spanDays })}</p> : null}
        </div>
      ) : null}
    </div>
  );
};
