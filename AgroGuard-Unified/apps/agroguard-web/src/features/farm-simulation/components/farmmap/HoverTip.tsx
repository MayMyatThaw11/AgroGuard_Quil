import React from 'react';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { cropLabel, machineStateLabel, stageLabel, statusLabel } from '../../lib/farmmap/farmMapText.ts';
import { activeLocale, tr, useT } from '../../lib/i18n.ts';
import type { Poi } from '../../lib/farmmap/farmMapTypes.ts';
import { agoLabel } from '../../lib/farmmap/farmMapWeather.ts';
import type { HoverInfo } from '../../lib/farmmap/engine/engineTypes.ts';

function poiLine(poi: Poi): string {
  switch (poi.type) {
    case 'market':
      return tr('farmMap.tip.market', { crop: cropLabel(poi.crop), hours: poi.hours });
    case 'storage':
      return tr('farmMap.tip.storage', { used: poi.used, capacity: poi.capacity.toLocaleString(activeLocale()) });
    case 'mill':
      return tr('farmMap.tip.mill', { n: poi.queue });
    case 'machine':
      return poi.battery !== null ? tr('farmMap.tip.battery', { state: machineStateLabel(poi.state), n: poi.battery }) : tr('farmMap.tip.fuel', { state: machineStateLabel(poi.state), n: poi.fuel ?? '?' });
    case 'livestock':
      return poi.head ? tr('farmMap.tip.head', { n: poi.head }) : tr('farmMap.tip.pond');
    case 'water':
      return tr('farmMap.tip.level', { n: poi.level });
    case 'station':
      return tr('farmMap.tip.station');
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
      return { title: `${f.id} · ${f.name}`, sub: tr('farmMap.tip.farmSub', { crop: cropLabel(f.crop), area: f.area, n: f.fieldsN }), extra: tr('farmMap.tip.updated', { status: statusLabel(f.status), ago: agoLabel(f.updMin) }) };
    }
    case 'field':
      return { title: tr('farmMap.tip.field', { id: info.id.split('-').pop() ?? '', farm: info.farm }), sub: `${info.stage ? stageLabel(info.stage) : cropLabel(info.crop)} · ${info.area} ha`, extra: tr('farmMap.tip.openFarm') };
    case 'cluster':
      return { title: tr('farmMap.tip.farms', { n: info.n }), sub: tr('farmMap.tip.zoomIn'), extra: null };
    case 'region':
      return { title: info.country, sub: tr('farmMap.tip.flyIn', { n: info.n }), extra: null };
    case 'chunk': {
      const title = info.st === 'error' ? tr('farmMap.tip.regionFailed') : info.st === 'offline' ? tr('farmMap.tip.notCached') : tr('farmMap.tip.regionLoading');
      const extra = info.st === 'error' ? tr('farmMap.tip.retry') : info.st === 'offline' ? tr('farmMap.tip.goOnline') : null;
      return { title, sub: tr('farmMap.tip.cell', { cell: `${info.key.replace(':', '° N, ')}° E` }), extra, error: info.st === 'error' };
    }
    case 'poi': {
      const p = data.poiById[info.id];
      return { title: p.label, sub: poiLine(p), extra: `${p.town}, ${p.country}` };
    }
    case 'mill':
      return { title: info.name, sub: tr('farmMap.site.kind'), extra: tr('farmMap.tip.open') };
    case 'own':
      return { title: `${info.label} · ${info.name}`, sub: info.parcel ? tr('farmMap.tip.parcel', { id: info.parcel, status: info.status }) : info.status, extra: tr('farmMap.tip.open') };
  }
}

export const HoverTip: React.FC<{ info: HoverInfo | null; width: number }> = ({ info, width }) => {
  useT();
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
