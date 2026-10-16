import React from 'react';
import { useFarmWeather } from '../../lib/farmmap/farmLive.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { DetailSection } from './detailParts.tsx';
import { Glyph } from './Glyph.tsx';

function dayName(date: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

export const WeatherBlock: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const live = useFarmWeather(lat, lon);
  if (live.status !== 'ready') {
    return (
      <DetailSection>
        <AqSectionLabel aside="Open-Meteo">Weather</AqSectionLabel>
        <p className="aq-fm-note" role="status">
          {live.status === 'loading' ? 'Loading live weather' : `Live weather unavailable: ${live.error}`}
        </p>
      </DetailSection>
    );
  }
  const w = live.value;
  const wet = (w.rainMmH ?? 0) > 0;
  return (
    <DetailSection>
      <AqSectionLabel aside="Open-Meteo · live">Weather</AqSectionLabel>
      <div className="aq-fm-wx">
        <span className={`aq-fm-wx-icon ${wet ? 'is-wet' : 'is-dry'}`}><Glyph name={w.icon} size={20} /></span>
        <div>
          <p className="aq-fm-wx-main">{w.tempC ?? '—'} °C · {w.code}</p>
          <p className="aq-fm-wx-sub">
            {wet ? `${w.rainMmH} mm/h · ` : ''}wind {w.windMs ?? '—'} m/s · humidity {w.humidityPct ?? '—'}%
          </p>
        </div>
      </div>
      <div className="aq-fm-wx-days">
        {w.days.map((day, i) => (
          <div key={day.date} className="aq-fm-wx-day">
            <p className="aq-fm-wx-day-name">{dayName(day.date, i)}</p>
            <p className="aq-fm-wx-day-temp">{day.hi}° / {day.lo}°</p>
            <p className={`aq-fm-wx-day-rain ${(day.rainP ?? 0) > 60 ? 'is-wet' : ''}`}>
              {day.rainP === null ? '' : `${day.rainP}% · `}{day.mm} mm
            </p>
          </div>
        ))}
      </div>
    </DetailSection>
  );
};
