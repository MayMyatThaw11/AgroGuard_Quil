import React from 'react';
import { Clapperboard, Globe, LocateFixed, Minus, Mountain, Plus, Sprout } from 'lucide-react';
import type { FarmMapEngine } from '../../lib/farmmap/engine/engineTypes.ts';
import { useT } from '../../lib/i18n.ts';
import { AqIconButton } from '../aq/aqPrimitives.tsx';

interface MapControlsProps {
  engine: FarmMapEngine;
  bearing: number;
  pitch: number;
  terrain: boolean;
  cinematic: boolean;
  rightOffset: number;
  onTerrain: (on: boolean) => void;
  onCinematic: (on: boolean) => void;
  onLocate: () => void;
  onCheckLand: () => void;
}

export const MapControls: React.FC<MapControlsProps> = ({ engine, bearing, pitch, terrain, cinematic, rightOffset, onTerrain, onCinematic, onLocate, onCheckLand }) => {
  const t = useT();
  return (
  <div className="aq-fm-controls" style={{ '--aq-fm-controls-right': `${rightOffset}px` } as React.CSSProperties}>
    <div className="aq-fm-zoom">
      <AqIconButton label={t('farmMap.ctl.zoomIn')} onClick={() => engine.map().zoomIn({ duration: 400 })}><Plus size={15} aria-hidden="true" /></AqIconButton>
      <AqIconButton label={t('farmMap.ctl.zoomOut')} onClick={() => engine.map().zoomOut({ duration: 400 })}><Minus size={15} aria-hidden="true" /></AqIconButton>
    </div>
    <button type="button" className="aq-icon-btn aq-fm-compass" aria-label={t('farmMap.ctl.north')} title={t('farmMap.ctl.north')} onClick={() => engine.map().easeTo({ bearing: 0, pitch: 0, duration: 700 })}>
      <svg width="18" height="18" viewBox="0 0 18 18" style={{ transform: `rotate(${-bearing}deg)` }} aria-hidden="true">
        <path className="aq-fm-compass-n" d="M9 1.5 L12 9 H6 Z" />
        <path className="aq-fm-compass-s" d="M9 16.5 L6 9 H12 Z" />
      </svg>
    </button>
    <AqIconButton label={t('farmMap.ctl.locate')} onClick={onLocate}><LocateFixed size={15} aria-hidden="true" /></AqIconButton>
    <AqIconButton label={terrain ? t('farmMap.ctl.terrainOn') : t('farmMap.ctl.terrain')} aria-pressed={terrain} onClick={() => onTerrain(!terrain)}><Mountain size={15} aria-hidden="true" /></AqIconButton>
    <AqIconButton label={cinematic ? t('farmMap.ctl.cinematicOn') : t('farmMap.ctl.cinematicOff')} aria-pressed={cinematic} onClick={() => onCinematic(!cinematic)}><Clapperboard size={15} aria-hidden="true" /></AqIconButton>
    <AqIconButton label={t('farmMap.ctl.land')} onClick={onCheckLand}><Sprout size={15} aria-hidden="true" /></AqIconButton>
    <AqIconButton label={t('farmMap.ctl.overview')} onClick={() => engine.establishing()}><Globe size={15} aria-hidden="true" /></AqIconButton>
    {pitch > 1 ? <span className="aq-fm-pitch">{Math.round(pitch)}°</span> : null}
  </div>
  );
};
