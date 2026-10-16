import React from 'react';
import { Cpu, Leaf, LocateFixed, Map as MapIcon, Satellite, Maximize2, MessageSquarePlus, Minimize2, Radio, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import type { OpsFarm } from '../../data/ops/types.ts';
import { useOpsStore } from '../../store/opsStore.ts';
import { FIXTURE_LABEL } from '../../data/ops/fixture.ts';
import { methodLabel } from './crewMeta.ts';

interface OpsTopBarProps {
  farm: OpsFarm;
  onReplan: () => void;
  onOpenComposer?: () => void;
  onBack?: () => void;
  activeMissionCount?: number;
  hasFixture?: boolean;
}

export const OpsTopBar: React.FC<OpsTopBarProps> = ({
  farm,
  onReplan,
  onOpenComposer,
  onBack,
  activeMissionCount = 0,
  hasFixture = true,
}) => {
  const status = useOpsStore((s) => s.planStatus);
  const plan = useOpsStore((s) => s.plan);
  const source = useOpsStore((s) => s.source);
  const setSource = useOpsStore((s) => s.setSource);
  const liveLabel = useOpsStore((s) => s.liveLabel);
  const resetCamera = useOpsStore((s) => s.resetCamera);
  const immersive = useOpsStore((s) => s.immersive);
  const ground = useOpsStore((s) => s.ground);
  const toggleGround = useOpsStore((s) => s.toggleGround);
  const located = farm.lat !== undefined && farm.lon !== undefined;
  const toggleImmersive = useOpsStore((s) => s.toggleImmersive);
  const totalHa = farm.paddies.reduce((sum, p) => sum + p.areaHa, 0);
  const skill = plan?.forecast.backtest?.skill_vs_persistence;
  const organic = /ASOA|ORGANIC/i.test(farm.standard);

  return (
    <header className="ops-topbar ops-panel">
      {onBack ? (
        <button type="button" className="ops-btn" onClick={onBack} title="Back to the farm map">
          <MapIcon className="w-3.5 h-3.5" />
          Farm map
        </button>
      ) : null}
      <div className="ops-brand">
        <span className="ops-brand-mark" aria-hidden>
          <Leaf className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h1>{farm.name}</h1>
          <p>
            {farm.region} · {farm.paddies.length} paddies · {totalHa.toFixed(1)} ha
          </p>
        </div>
      </div>

      <div className="hidden lg:flex items-center gap-2 min-w-0">
        <span className={`ops-chip ${organic ? 'is-green' : ''}`} title={`Standard in the contract: ${farm.standard}`}>
          <ShieldCheck className="w-3 h-3" />{' '}
          {organic ? 'ASEAN organic (ASOA)' : farm.standard === 'none declared' ? 'No standard declared' : farm.standard.replace(/_/g, ' ')}
        </span>
        {source === 'live' ? (
          <span className="ops-chip is-blue" title={liveLabel ?? 'Live contract plan'}>
            <Radio className="w-3 h-3" /> Live: Open-Meteo + field readings
          </span>
        ) : (
          <span className="ops-chip" title={FIXTURE_LABEL}>
            Demo fixture
          </span>
        )}
        {hasFixture && (
          <button
            type="button"
            className="ops-btn"
            onClick={() => setSource(source === 'live' ? 'fixture' : 'live')}
            title={source === 'live' ? 'Show the synthetic demo fixture instead' : 'Plan from the contract with live data'}
          >
            {source === 'live' ? 'Use demo fixture' : 'Use live data'}
          </button>
        )}
      </div>

      <div className="flex-1" />

      <div className="ops-topbar-actions">
        {status === 'loading' && (
          <span className="ops-chip is-blue" role="status">
            <RefreshCw className="w-3 h-3 animate-spin" /> Crew is reading the fields
          </span>
        )}
        {status === 'ready' && plan && (
          <span
            className="ops-chip is-green"
            title={`${plan.forecast.method} · ${plan.forecast.compute_ms} ms`}
          >
            <Cpu className="w-3 h-3" />
            {methodLabel(plan.forecast.method)}
            {typeof skill === 'number' && ` · ${skill >= 0 ? '+' : ''}${Math.round(skill * 100)}% vs persistence`}
          </span>
        )}
        {status === 'offline' && (
          <span className="ops-chip is-amber" role="status">
            <WifiOff className="w-3 h-3" /> Planner offline
          </span>
        )}
        {onOpenComposer ? (
          <button
            type="button"
            className="ops-btn"
            onClick={onOpenComposer}
            title="Dispatch field mission or ask agronomist"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Field command
            {activeMissionCount > 0 ? (
              <span className="ops-mission-chip-tag ml-1">{activeMissionCount}</span>
            ) : null}
          </button>
        ) : null}
        {located ? (
          <button
            type="button"
            className="ops-btn"
            onClick={toggleGround}
            aria-pressed={ground === 'sat'}
            title={ground === 'sat' ? 'Show the map around the farm' : 'Show satellite imagery around the farm'}
          >
            {ground === 'sat' ? <MapIcon className="w-3.5 h-3.5" /> : <Satellite className="w-3.5 h-3.5" />}
            {ground === 'sat' ? 'Map' : 'Satellite'}
          </button>
        ) : null}
        <button
          type="button"
          className="ops-btn is-icon"
          onClick={resetCamera}
          title="Reset view"
          aria-label="Reset view"
        >
          <LocateFixed className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={`ops-btn ops-btn-view ${immersive ? 'is-active' : ''}`}
          onClick={toggleImmersive}
          aria-pressed={immersive}
          title={immersive ? 'Show panels' : 'Hide panels and view the 3D land'}
        >
          {immersive ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          {immersive ? 'Show panels' : '3D view'}
        </button>
        <button type="button" className="ops-btn is-primary" onClick={onReplan} disabled={status === 'loading'}>
          <RefreshCw className={`w-3.5 h-3.5 ${status === 'loading' ? 'animate-spin' : ''}`} />
          Re-plan
        </button>
      </div>
    </header>
  );
};
