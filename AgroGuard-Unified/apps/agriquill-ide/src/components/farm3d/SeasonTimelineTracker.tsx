import React from 'react';
import { Sprout, CheckCircle2, Clock, Plane, ArrowRight } from 'lucide-react';
import { useFarmStore } from '../../store/farmStore.ts';

export const SeasonTimelineTracker: React.FC = React.memo(() => {
  const day = useFarmStore((s) => s.day);
  const isPlaying = useFarmStore((s) => s.isPlaying);
  const setPlaying = useFarmStore((s) => s.setPlaying);

  const steps = React.useMemo(() => [
    { id: 1, label: 'Seeding', dayNum: 1, time: 'Day 1 · 06:49', status: day >= 1 ? 'done' : 'pending' },
    { id: 2, label: 'AWD Tillering', dayNum: 35, time: 'Day 35 · 08:20', status: day >= 35 ? 'done' : 'pending' },
    { id: 3, label: 'Drone Sortie', dayNum: 48, time: 'Day 48 · ETA 09:53', status: day >= 48 ? (day < 75 ? 'active' : 'done') : 'pending' },
    { id: 4, label: 'Panicle', dayNum: 75, time: 'Day 75 · ETA 10:01', status: day >= 75 ? (day < 110 ? 'active' : 'done') : 'pending' },
    { id: 5, label: 'Harvest', dayNum: 120, time: 'Day 120 · ETA 10:33', status: day >= 120 ? 'done' : 'pending' }
  ], [day]);

  return (
    <div className="absolute bottom-3 left-3 z-10 bg-[#121915]/92 hover:bg-[#121915]/96 backdrop-blur-md border border-white/10 rounded-2xl p-3.5 shadow-2xl pointer-events-auto select-none min-w-[560px] max-w-[620px] transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Sprout size={13} />
          </div>
          <span className="text-xs font-semibold text-white font-mono">Season &amp; Agent Workflow</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-slate-400">CROP-CYCLE-2051 · AgroGuard Phenology</span>
          <button
            type="button"
            onClick={() => setPlaying(!isPlaying)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
              isPlaying
                ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
            }`}
          >
            {isPlaying ? 'Pause' : 'Replay'}
          </button>
        </div>
      </div>

      {/* Main Timeline Row & Sortie Card */}
      <div className="flex items-center justify-between gap-4 pt-2.5">
        {/* Step Nodes Track */}
        <div className="flex-1 flex items-center justify-between relative">
          {/* Connector Line */}
          <div className="absolute left-3 right-3 top-3 h-0.5 bg-white/10 -z-0" />

          {steps.map((s, idx) => {
            const isDone = s.status === 'done';
            const isActive = s.status === 'active';

            return (
              <div key={s.id} className="relative z-10 flex flex-col items-center text-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                    isDone
                      ? 'bg-emerald-600 text-white'
                      : isActive
                      ? 'bg-cyan-500 text-black ring-4 ring-cyan-500/25 animate-pulse'
                      : 'bg-[#1b2620] text-slate-400 border border-white/15'
                  }`}
                >
                  {isDone ? <CheckCircle2 size={13} /> : idx + 1}
                </div>
                <span className="text-[10px] font-medium text-slate-200 mt-1.5 leading-tight">{s.label}</span>
                <span className="text-[9px] font-mono text-slate-400 leading-none mt-0.5">{s.time.split('·')[1]}</span>
              </div>
            );
          })}
        </div>

        {/* Floating Active Task Card (like #SHP-78442 in WareTrack) */}
        <div className="bg-[#18231e] border border-white/10 rounded-xl p-2.5 flex items-center gap-2.5 shrink-0 shadow-md">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
            <Plane size={15} />
          </div>
          <div className="text-left leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-white font-mono">#TASK-78442</span>
              <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 text-[9px] font-mono font-bold">
                Scanning
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">Target: Parcel P-03 · North Sector</span>
            <span className="text-[9px] font-mono text-emerald-400 block mt-0.5">Sortie active · 13 min left</span>
          </div>
          <ArrowRight size={13} className="text-slate-400" />
        </div>
      </div>
    </div>
  );
});

SeasonTimelineTracker.displayName = 'SeasonTimelineTracker';
