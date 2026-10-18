import React from 'react';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { CROPS } from '../../lib/farmmap/farmMapTheme.ts';
import type { Poi } from '../../lib/farmmap/farmMapTypes.ts';
import { agoLabel } from '../../lib/farmmap/farmMapWeather.ts';
import type { HoverInfo } from '../../lib/farmmap/engine/engineTypes.ts';

const STATUS_WORD = { ok: 'Healthy', watch: 'Watch', risk: 'At risk' } as const;

function poiLine(poi: Poi): string {
  switch (poi.type) {
    case 'market':
      return `${CROPS[poi.crop].label} market · ${poi.hours}`;
    case 'storage':
      return `${poi.used}% full · ${poi.capacity.toLocaleString()} t`;
    case 'mill':
      return `${poi.queue} trucks queued`;
    case 'machine':
      return poi.state + (poi.battery !== null ? ` · battery ${poi.battery}%` : ` · fuel ${poi.fuel}%`);
    case 'livestock':
      return poi.head ? `${poi.head} head` : 'Pond';
    case 'water':
      return `Level ${poi.level}%`;
    case 'station':
      return 'Weather station';
  }
}

interface Copy {
  title: string;
  sub: string;
  extra: string | null;
  error?: boolean;
}

function describe(info: HoverInfo): Copy {
  const data = getFarmMap();
  switch (info.kind) {
    case 'farm': {
      const f = data.farmById[info.id];
      return { title: `${f.id} · ${f.name}`, sub: `${CROPS[f.crop].label} · ${f.area} ha · ${f.fieldsN} fields`, extra: `${STATUS_WORD[f.status]} · updated ${agoLabel(f.updMin)}` };
    }
    case 'field':
      return { title: `Field ${info.id.split('-').pop()} · ${info.farm}`, sub: `${info.stage ?? CROPS[info.crop].label} · ${info.area} ha`, extra: 'Click to open the farm' };
    case 'cluster':
      return { title: `${info.n} farms`, sub: 'Click to zoom in', extra: null };
    case 'region':
      return { title: info.country, sub: `${info.n} farms · click to fly in`, extra: null };
    case 'chunk': {
      const title = info.st === 'error' ? 'Region failed to load' : info.st === 'offline' ? 'Offline · not cached' : 'Loading region';
      const extra = info.st === 'error' ? 'Click to retry' : info.st === 'offline' ? 'Turn off offline to load' : null;
      return { title, sub: `${info.key.replace(':', '° N, ')}° E · 1° cell`, extra, error: info.st === 'error' };
    }
    case 'poi': {
      const p = data.poiById[info.id];
      return { title: p.label, sub: poiLine(p), extra: `${p.town}, ${p.country}` };
    }
  }
}

export const HoverTip: React.FC<{ info: HoverInfo | null; width: number }> = ({ info, width }) => {
  if (!info) return null;
  const copy = describe(info);
  return (
    <div className="aq-fm-tip aq-fm-pop" style={{ left: Math.min(info.x + 16, width - 300), top: info.y + 14 }} role="tooltip">
      <p className={`aq-fm-tip-title ${copy.error ? 'is-error' : ''}`}>{copy.title}</p>
      <p className="aq-fm-tip-sub">{copy.sub}</p>
      {copy.extra ? <p className="aq-fm-tip-extra">{copy.extra}</p> : null}
    </div>
  );
};
