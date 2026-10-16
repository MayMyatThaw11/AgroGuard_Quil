import React from 'react';
import { Sprout, Plane, Droplets, TrendingUp } from 'lucide-react';
import { useFarmStore } from '../../store/farmStore.ts';
import { getFarm, getParcelsByFarm, getRobotsByFarm } from '../../data/farm/index.ts';

export const TopKpiCards: React.FC = React.memo(() => {
  const activeFarmId = useFarmStore((s) => s.activeFarmId);
  const farm = React.useMemo(() => getFarm(activeFarmId), [activeFarmId]);
  const parcels = React.useMemo(() => getParcelsByFarm(activeFarmId), [activeFarmId]);
  const robots = React.useMemo(() => getRobotsByFarm(activeFarmId), [activeFarmId]);

  if (!farm) return null;

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-2.5 pointer-events-auto select-none">
      {/* Card 1: Biomass on Field */}
      <div className="bg-[#121915]/90 hover:bg-[#121915]/95 transition-all backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2.5 shadow-lg flex items-center gap-3 min-w-[160px]">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
          <Sprout size={18} />
        </div>
        <div>
          <span className="text-[10px] font-mono text-slate-400 block tracking-tight">Biomass on field</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-base font-bold text-white font-mono leading-none">1,412 t</span>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center font-semibold">
              <TrendingUp size={10} className="inline mr-0.5" />+15 t
            </span>
          </div>
          <span className="text-[9px] font-mono text-slate-400 block mt-0.5">{parcels.length} parcels · {farm.presetId.toUpperCase()}</span>
        </div>
      </div>

      {/* Card 2: Fleet on Site */}
      <div className="bg-[#121915]/90 hover:bg-[#121915]/95 transition-all backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2.5 shadow-lg flex items-center gap-3 min-w-[160px]">
        <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
          <Plane size={18} />
        </div>
        <div>
          <span className="text-[10px] font-mono text-slate-400 block tracking-tight">Fleet on site</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-base font-bold text-white font-mono leading-none">{robots.length} bots</span>
            <span className="text-[10px] font-mono text-cyan-400 flex items-center font-semibold">
              +1 sortie
            </span>
          </div>
          <span className="text-[9px] font-mono text-slate-400 block mt-0.5">
            {robots.filter((r) => r.type === 'drone').length} drone · {robots.filter((r) => r.type === 'ground_rover').length} rover active
          </span>
        </div>
      </div>

      {/* Card 3: Water Stress Mitigation */}
      <div className="bg-[#121915]/90 hover:bg-[#121915]/95 transition-all backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2.5 shadow-lg flex items-center gap-3 min-w-[170px]">
        <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
          <Droplets size={18} />
        </div>
        <div>
          <span className="text-[10px] font-mono text-slate-400 block tracking-tight">AWD water stress</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-base font-bold text-white font-mono leading-none">96.6%</span>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center font-semibold">
              <TrendingUp size={10} className="inline mr-0.5" />+0.4%
            </span>
          </div>
          <span className="text-[9px] font-mono text-slate-400 block mt-0.5">last 30 days · AWD active</span>
        </div>
      </div>
    </div>
  );
});

TopKpiCards.displayName = 'TopKpiCards';
