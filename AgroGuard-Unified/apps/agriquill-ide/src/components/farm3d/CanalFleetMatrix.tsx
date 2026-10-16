import React, { useState } from 'react';
import { Droplets, Plane, Wifi, ChevronRight } from 'lucide-react';
import { useFarmStore } from '../../store/farmStore.ts';

export const CanalFleetMatrix: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'canals' | 'fleet' | 'sensors'>('canals');
  const { selectTarget } = useFarmStore();

  return (
    <div className="absolute bottom-3 right-3 z-10 bg-[#121915]/92 hover:bg-[#121915]/96 backdrop-blur-md border border-white/10 rounded-2xl p-3 shadow-2xl pointer-events-auto select-none w-80 text-xs transition-all font-sans">
      {/* Tab Switcher */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-1 bg-[#0c1410] border border-white/15 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('canals')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
              activeTab === 'canals'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Sluices 2/2
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fleet')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
              activeTab === 'fleet'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Fleet 2/2
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sensors')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
              activeTab === 'sensors'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            LoRa 8/8
          </button>
        </div>
        <span className="text-[10px] font-mono text-slate-400">Canal Network</span>
      </div>

      {/* Rows Matrix */}
      <div className="pt-2 space-y-1.5">
        {activeTab === 'canals' && (
          <>
            <div 
              onClick={() => selectTarget({ kind: 'canal', id: 'canal_01' })}
              className="flex items-center justify-between p-1.5 rounded-lg bg-black/30 hover:bg-white/5 border border-white/5 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-emerald-400 font-bold">SL-01</span>
                <div>
                  <span className="text-[11px] font-semibold text-white block">AWD Sluice Gate 01</span>
                  <span className="text-[9px] font-mono text-slate-400">Paddy P-01..P-06 Feeder Canal</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[9px] font-mono font-bold">
                  Irrigating
                </span>
                <span className="text-[10px] font-mono text-slate-400">2/4h</span>
                <ChevronRight size={12} className="text-slate-500" />
              </div>
            </div>

            <div 
              onClick={() => selectTarget({ kind: 'canal', id: 'canal_02' })}
              className="flex items-center justify-between p-1.5 rounded-lg bg-black/30 hover:bg-white/5 border border-white/5 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-400 font-bold">SL-02</span>
                <div>
                  <span className="text-[11px] font-semibold text-white block">Monsoon Runoff Spillway</span>
                  <span className="text-[9px] font-mono text-slate-400">Drainage canal to river arm</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[9px] font-mono">
                  Standby
                </span>
                <ChevronRight size={12} className="text-slate-500" />
              </div>
            </div>

            <div 
              onClick={() => selectTarget({ kind: 'pond', id: 'pond_01' })}
              className="flex items-center justify-between p-1.5 rounded-lg bg-black/30 hover:bg-white/5 border border-white/5 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-sky-400 font-bold">POND</span>
                <div>
                  <span className="text-[11px] font-semibold text-white block">Polyculture Aquapond Aerator</span>
                  <span className="text-[9px] font-mono text-slate-400">DO 6.8 mg/L · pH 7.4</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className="px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-500/30 text-[9px] font-mono font-bold">
                  Active
                </span>
                <ChevronRight size={12} className="text-slate-500" />
              </div>
            </div>
          </>
        )}

        {activeTab === 'fleet' && (
          <>
            <div 
              onClick={() => selectTarget({ kind: 'robot', id: 'drone_01' })}
              className="flex items-center justify-between p-1.5 rounded-lg bg-black/30 hover:bg-white/5 border border-white/5 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Plane size={14} className="text-cyan-400" />
                <div>
                  <span className="text-[11px] font-semibold text-white block">DJI Agras T40 Drone</span>
                  <span className="text-[9px] font-mono text-slate-400">Multispectral Scan on P-03</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 text-[9px] font-mono font-bold">
                  Airborne
                </span>
                <span className="text-[10px] font-mono text-slate-400">2 min</span>
                <ChevronRight size={12} className="text-slate-500" />
              </div>
            </div>

            <div 
              onClick={() => selectTarget({ kind: 'robot', id: 'rover_01' })}
              className="flex items-center justify-between p-1.5 rounded-lg bg-black/30 hover:bg-white/5 border border-white/5 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Droplets size={14} className="text-amber-400" />
                <div>
                  <span className="text-[11px] font-semibold text-white block">Farm-ng Amiga Rover</span>
                  <span className="text-[9px] font-mono text-slate-400">Soil EC/Moisture Penetrometer</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 text-[9px] font-mono font-bold">
                  Patrol
                </span>
                <ChevronRight size={12} className="text-slate-500" />
              </div>
            </div>
          </>
        )}

        {activeTab === 'sensors' && (
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
            {['SN-01 (Soil VWC 38%)', 'SN-02 (Canal Depth +12cm)', 'SN-03 (East Parcels NDVI)', 'SN-04 (Pond O2 6.8mg/L)'].map((s, i) => (
              <div key={i} className="flex justify-between items-center p-1 rounded bg-black/20 text-[10px] font-mono">
                <span className="text-slate-300">{s}</span>
                <span className="text-emerald-400 font-bold">LoRa Online</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
