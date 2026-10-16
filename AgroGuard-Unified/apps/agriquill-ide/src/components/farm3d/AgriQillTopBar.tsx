import React from 'react';
import {
  Sprout,
  Search,
  ChevronDown,
  Bell,
  Cpu,
  Layers,
  Wrench
} from 'lucide-react';
import { useFarmStore } from '../../store/farmStore.ts';
import { ASEAN_PRESETS } from '../../data/presets.ts';

interface AgriQillTopBarProps {
  onOpenMlBrain: () => void;
}

export const AgriQillTopBar: React.FC<AgriQillTopBarProps> = ({ onOpenMlBrain }) => {
  const { activeFarmId, setActiveFarmId } = useFarmStore();

  return (
    <header className="h-12 w-full bg-[#101713] border-b border-white/10 px-4 flex items-center justify-between z-20 select-none text-slate-200">
      {/* Left: AgriQill Brand & Agricultural Search Bar */}
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        {/* Brand Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-md">
            <Sprout size={16} />
          </div>
          <span className="font-bold text-white tracking-wide text-sm font-sans flex items-center gap-1.5">
            AgriQill <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30">Ag IDE</span>
          </span>
        </div>

        {/* Agricultural Query Bar */}
        <div className="relative flex-1 max-w-md hidden sm:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search paddies, soil horizons, sluices, drones, rovers, sensors..."
            className="w-full bg-[#18231d] border border-white/10 rounded-xl pl-9 pr-12 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono text-slate-400">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Center / Right: Farm Territory Selector, Live Telemetry, MCP Tools & Agronomist Profile */}
      <div className="flex items-center gap-2.5">
        {/* Farm Territory Selector */}
        <div className="relative">
          <select
            value={activeFarmId.replace(/^farm_/, '')}
            onChange={(e) => setActiveFarmId(e.target.value)}
            className="bg-[#18231d] hover:bg-[#202e26] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white appearance-none pr-8 cursor-pointer font-medium transition-colors"
          >
            {ASEAN_PRESETS.map((p) => (
              <option key={p.id} value={p.id} className="bg-[#101713] text-white">
                {p.flag} {p.country} · {p.region}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Live LoRaWAN Mesh Status Chip */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/40 border border-white/10 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 font-semibold text-[11px]">AgroGuard Live 09:40</span>
        </div>

        {/* ML Brain & Agentic Tools Button */}
        <button
          type="button"
          onClick={onOpenMlBrain}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shadow transition-all cursor-pointer"
          title="Open AgriQill ML Brain & FastMCP Tool Console"
        >
          <Cpu size={14} className="text-emerald-400" />
          <span className="hidden sm:inline">AgriQill ML Brain</span>
        </button>

        {/* Notification Bell */}
        <button
          type="button"
          className="relative p-2 rounded-xl bg-[#18231d] hover:bg-[#202e26] border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Field alerts & agent notices"
        >
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400" />
        </button>

        {/* Lead Field Agronomist Profile */}
        <div className="flex items-center gap-2 pl-1 border-l border-white/10">
          <div className="w-8 h-8 rounded-full bg-emerald-800 border border-emerald-500/30 flex items-center justify-center text-white font-bold text-xs">
            AC
          </div>
          <div className="hidden lg:block text-left leading-tight">
            <span className="text-xs font-semibold text-white block">Dr. Alex Chen</span>
            <span className="text-[10px] text-slate-400 block font-mono">Lead Agronomist</span>
          </div>
        </div>
      </div>
    </header>
  );
};
