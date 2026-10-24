import React from 'react';
import { Cloud, CloudFog, CloudLightning, CloudRain, Moon, Radio, Sun } from 'lucide-react';
import type { Fx, PreviewKind, WeatherKey } from '../../lib/farmview/weatherFx.ts';
import type { Loaded } from '../../lib/farmmap/farmLive.ts';
import type { WeatherNowEnvelope } from '../../lib/api.ts';
import { useT } from '../../lib/i18n.ts';
import { ChoiceTiles, type TileOption } from '../inputs/ChoiceTiles.tsx';

export type WeatherChoice = 'now' | PreviewKind;

interface WeatherPanelProps {
  fx: Fx;
  live: Loaded<WeatherNowEnvelope>;
  condition: WeatherKey | null;
  temperatureC: number | null;
  choice: WeatherChoice;
  onChoice: (choice: WeatherChoice) => void;
}

export const WeatherPanel: React.FC<WeatherPanelProps> = ({ fx, live, condition, temperatureC, choice, onChoice }) => {
  const t = useT();
  const options: TileOption<WeatherChoice>[] = [
    { value: 'now', label: t('farmMap.farmView.wx.optNow'), icon: <Radio size={16} /> },
    { value: 'clear', label: t('farmMap.farmView.wx.clear'), icon: <Sun size={16} /> },
    { value: 'rain', label: t('farmMap.farmView.wx.rain'), icon: <CloudRain size={16} /> },
    { value: 'storm', label: t('farmMap.farmView.wx.storm'), icon: <CloudLightning size={16} /> },
    { value: 'fog', label: t('farmMap.farmView.wx.fog'), icon: <CloudFog size={16} /> },
    { value: 'night', label: t('farmMap.farmView.wx.night'), icon: <Moon size={16} /> },
  ];
  const envelope = live.status === 'ready' ? live.value : null;
  return (
    <details className="aq-fm-replica-weather">
      <summary><Cloud size={13} aria-hidden="true" /> {t('farmMap.farmView.wx.title')}</summary>
      <div>
        {fx.preview ? <p className="aq-fm-note is-strong">{t('farmMap.farmView.wx.preview')}</p> : null}
        {!fx.preview && condition ? <p className="aq-fm-note is-strong">{t('farmMap.farmView.wx.line', { condition: t(condition) })}{temperatureC === null ? '' : ` · ${Math.round(temperatureC)}°C`}</p> : null}
        {!fx.preview && live.status === 'error' ? <p className="aq-fm-note">{t('farmMap.farmView.wx.unavailable')}</p> : null}
        {!fx.preview && envelope?.stale ? <p className="aq-fm-note">{t('farmMap.farmView.wx.stale')}</p> : null}
        {!fx.preview && envelope?.time ? <p className="aq-fm-note">{t('farmMap.farmView.wx.source', { provider: envelope.provider, time: envelope.time })}</p> : null}
        <ChoiceTiles label={t('farmMap.farmView.wx.pick')} value={choice} options={options} onChange={onChoice} />
      </div>
    </details>
  );
};
