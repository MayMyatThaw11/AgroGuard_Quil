import React from 'react';
import { PanelLeftClose } from 'lucide-react';
import type { OpsFarm, OpsHistory } from '../../data/ops/types.ts';
import { effectiveFromPlan } from '../../lib/paddySettings.ts';
import { useOpsStore } from '../../store/opsStore.ts';
import { assetCaption } from './OpsMarkers.tsx';
import { depthForDay } from './crewMeta.ts';

interface OpsAssetRailProps {
  farm: OpsFarm;
  history: OpsHistory;
  onHide?: () => void;
}

const DEPTH_MIN = -20;
const DEPTH_MAX = 12;

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s === 'on' || s === 'open' || s === 'flying') return 'is-green';
  if (s === 'standby') return 'is-blue';
  if (s === 'idle' || s === 'off' || s === 'closed') return '';
  return 'is-amber';
}

function DepthBar({ depth, drained, safeDepth }: { depth: number; drained: boolean; safeDepth: number }) {
  const span = DEPTH_MAX - DEPTH_MIN;
  const zero = ((0 - DEPTH_MIN) / span) * 100;
  const at = ((Math.min(Math.max(depth, DEPTH_MIN), DEPTH_MAX) - DEPTH_MIN) / span) * 100;
  const left = Math.min(zero, at);
  const width = Math.abs(at - zero);
  const color = depth >= 0
    ? 'var(--ops-water)'
    : drained
      ? 'var(--ops-agent-harvest)'
      : depth <= safeDepth
        ? 'var(--ops-red)'
        : 'var(--ops-amber)';
  return (
    <div className="ops-depth" aria-hidden>
      <span className="ops-depth-fill" style={{ left: `${left}%`, width: `${Math.max(width, 2)}%`, background: color }} />
      <span className="ops-depth-zero" style={{ left: `${zero}%` }} />
    </div>
  );
}

export const OpsAssetRail: React.FC<OpsAssetRailProps> = ({ farm, history, onHide }) => {
  const selection = useOpsStore((s) => s.selection);
  const select = useOpsStore((s) => s.select);
  const plan = useOpsStore((s) => s.plan);
  const dayOffset = useOpsStore((s) => s.dayOffset);
  const safeDepth = effectiveFromPlan(plan?.thresholds).awd_safe_depth_cm;

  return (
    <aside className="ops-rail ops-panel" aria-label="Field assets and paddies">
      <div className="ops-scroll">
        <section className="ops-section">
          <div className="flex items-center justify-between mb-2">
            <h2 className="ops-eyebrow">Field assets</h2>
            {onHide ? (
              <button
                type="button"
                className="ops-btn is-icon"
                style={{ width: 24, height: 24 }}
                onClick={onHide}
                title="Hide field assets ([)"
                aria-label="Hide field assets"
              >
                <PanelLeftClose size={13} />
              </button>
            ) : null}
          </div>
          <ul>
            {farm.assets.map((asset) => {
              const selected = selection?.kind === 'asset' && selection.id === asset.id;
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={`ops-row ${selected ? 'is-selected' : ''}`}
                    onClick={() => select({ kind: 'asset', id: asset.id })}
                    aria-pressed={selected}
                  >
                    <span className="ops-pin">
                      <span>{asset.number}</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12px] font-bold leading-tight">{asset.id}</span>
                      <span className="block text-[11px] text-(--ops-ink-3) truncate">
                        {assetCaption(asset)}
                      </span>
                    </span>
                    <span className={`ops-dot ${statusTone(asset.status)}`} title={asset.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="ops-section">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="ops-eyebrow">Paddies</h2>
            <span className="text-[11px] text-(--ops-ink-3)">
              {dayOffset < 0 ? 'Water now' : `Forecast day ${dayOffset + 1}`}
            </span>
          </div>
          <ul>
            {farm.paddies.map((paddy) => {
              const selected = selection?.kind === 'paddy' && selection.id === paddy.id;
              const depth = depthForDay(plan, history, paddy.id, dayOffset);
              return (
                <li key={paddy.id}>
                  <button
                    type="button"
                    className={`ops-row ${selected ? 'is-selected' : ''}`}
                    onClick={() => select({ kind: 'paddy', id: paddy.id })}
                    aria-pressed={selected}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-bold">{paddy.id}</span>
                        <span className="text-[11px] font-semibold tabular-nums">
                          {depth === undefined ? 'no reading' : `${depth.toFixed(1)} cm`}
                        </span>
                      </span>
                      <span className="block text-[11px] text-(--ops-ink-3) truncate mb-1">
                        {paddy.cropName} · {paddy.stage}
                      </span>
                      {depth !== undefined && (
                        <DepthBar depth={depth} drained={paddy.stage === 'Ripening'} safeDepth={safeDepth} />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-(--ops-ink-3)">
            Field-tube depth relative to the soil surface. Red marks the {safeDepth} cm AWD re-flood level (TO VERIFY locally). Ripening paddies are drained on purpose.
          </p>
        </section>
      </div>
    </aside>
  );
};
