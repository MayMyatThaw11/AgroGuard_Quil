import React, { useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg } from '@fullcalendar/interaction';
import type { EventClickArg, EventInput } from '@fullcalendar/core';
import { DateTime } from 'luxon';
import { getGrowthStage, SEASON_DAYS } from '../lib/metrics';

interface SeasonCalendarProps {
  readonly currentDay: number;
  readonly onSelectDay: (day: number) => void;
  readonly presetCountry: string;
}

/**
 * Illustrative season-start anchor. This is a fixed preview convenience, not
 * a verified planting date: Day 1 of the replay has no recorded calendar
 * date, so the grid states its anchor openly instead of implying one.
 */
const ILLUSTRATIVE_SEASON_START = DateTime.fromISO('2026-06-01');

interface TaskTemplate {
  readonly title: string;
  readonly startDay: number;
  readonly endDayExclusive: number;
  readonly detail: string;
}

const TASK_TEMPLATES: TaskTemplate[] = [
  { title: 'Example: transplanting window', startDay: 1, endDayExclusive: 11, detail: 'Illustrative planting window. No nursery record or labour plan exists.' },
  { title: 'Example: AWD valve check', startDay: 30, endDayExclusive: 31, detail: 'Illustrative inspection reminder. No device is registered and no telemetry is read.' },
  { title: 'Example: sensor maintenance', startDay: 45, endDayExclusive: 46, detail: 'Illustrative upkeep slot. No sensor inventory or service log exists.' },
  { title: 'Example: panicle scouting', startDay: 70, endDayExclusive: 73, detail: 'Illustrative scouting window. No field observation is recorded.' },
  { title: 'Example: drainage and harvest planning', startDay: 110, endDayExclusive: 121, detail: 'Illustrative planning window. No harvest record, buyer or price is implied.' }
];

const STAGE_BANDS = [
  { startDay: 1, endDayExclusive: 25 },
  { startDay: 25, endDayExclusive: 55 },
  { startDay: 55, endDayExclusive: 85 },
  { startDay: 85, endDayExclusive: 110 },
  { startDay: 110, endDayExclusive: 121 }
];

function dayToDate(day: number): string {
  return ILLUSTRATIVE_SEASON_START.plus({ days: day - 1 }).toISODate() ?? '';
}

/**
 * Season task calendar (local preview only).
 *
 * A month grid over the illustrative 120-day season. Stage bands and example
 * tasks are static templates: nothing is persisted, nothing is scheduled
 * against a real farm, and dragging is disabled because there is no backend
 * to accept a move. Selecting a day mirrors the replay scrubber through the
 * shared day state; the calendar never advances simulation time itself.
 */
export const SeasonCalendar: React.FC<SeasonCalendarProps> = ({
  currentDay,
  onSelectDay,
  presetCountry
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const events: EventInput[] = useMemo(() => {
    const bands: EventInput[] = STAGE_BANDS.map((band, index) => ({
      id: `stage-${index}`,
      start: dayToDate(band.startDay),
      end: dayToDate(band.endDayExclusive),
      display: 'background',
      extendedProps: { kind: 'stage' }
    }));
    const tasks: EventInput[] = TASK_TEMPLATES.map((task, index) => ({
      id: `task-${index}`,
      title: task.title,
      start: dayToDate(task.startDay),
      end: dayToDate(task.endDayExclusive),
      allDay: true,
      extendedProps: { kind: 'example-task', detail: task.detail }
    }));
    return [...bands, ...tasks];
  }, []);

  const selected = useMemo(
    () => TASK_TEMPLATES.find((_, index) => `task-${index}` === selectedId) ?? null,
    [selectedId]
  );

  const handleDateClick = (arg: DateClickArg) => {
    const clicked = DateTime.fromISO(arg.dateStr);
    const offset = Math.round(clicked.diff(ILLUSTRATIVE_SEASON_START, 'days').days) + 1;
    if (offset >= 1 && offset <= SEASON_DAYS) onSelectDay(offset);
  };

  const handleEventClick = (arg: EventClickArg) => {
    if (arg.event.display === 'background') return;
    setSelectedId(arg.event.id);
  };

  const anchorLabel = ILLUSTRATIVE_SEASON_START.toFormat('dd LLL yyyy');
  const selectedRange = selected
    ? `${DateTime.fromISO(dayToDate(selected.startDay)).toFormat('dd LLL')} – ${DateTime.fromISO(dayToDate(selected.endDayExclusive - 1)).toFormat('dd LLL yyyy')}`
    : null;

  return (
    <section className="season-calendar" aria-label="Season task calendar">
      <div className="season-calendar-head">
        <div>
          <h3>Season task calendar</h3>
          <p>
            Local preview over an illustrative 120-day season starting {anchorLabel}.
            Day 1 has no verified planting date; tasks are unsaved templates for {presetCountry}.
            Dates shown in browser-local time — the farm timezone is unverified.
          </p>
        </div>
        <span className="season-calendar-day">
          Replay day {currentDay}/{SEASON_DAYS} · {getGrowthStage(currentDay)}
        </span>
      </div>

      <ul className="season-calendar-tasks" aria-label="Example tasks">
        {TASK_TEMPLATES.map((task, index) => {
          const id = `task-${index}`;
          const range = `${DateTime.fromISO(dayToDate(task.startDay)).toFormat('dd LLL')}–${DateTime.fromISO(dayToDate(task.endDayExclusive - 1)).toFormat('dd LLL')}`;
          return (
            <li key={id}>
              <button
                type="button"
                className="btn"
                aria-pressed={selectedId === id}
                onClick={() => setSelectedId(id)}
                title={`${task.title}, ${range}`}
              >
                {task.title} · {range}
              </button>
            </li>
          );
        })}
      </ul>

      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        initialDate={dayToDate(currentDay)}
        validRange={{ start: dayToDate(1), end: dayToDate(SEASON_DAYS + 1) }}
        events={events}
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        dayCellClassNames={arg => {
          const cellDay = DateTime.fromJSDate(arg.date).startOf('day');
          const offset = Math.round(cellDay.diff(ILLUSTRATIVE_SEASON_START.startOf('day'), 'days').days) + 1;
          return offset === currentDay ? ['season-calendar-selected-day'] : [];
        }}
        headerToolbar={{ left: 'prev,next', center: 'title', right: '' }}
        height={540}
        timeZone="local"
        editable={false}
        selectable={false}
        dayMaxEvents={3}
      />

      <div className="season-calendar-detail" aria-live="polite">
        {selected && selectedRange ? (
          <>
            <strong>{selected.title}</strong>
            <span>{selectedRange} · status: unscheduled template · source: local preview, not saved</span>
            <span>{selected.detail}</span>
          </>
        ) : (
          <span>Select an example task to inspect its timing, status and source. Selecting a day moves the shared replay day.</span>
        )}
      </div>
    </section>
  );
};
