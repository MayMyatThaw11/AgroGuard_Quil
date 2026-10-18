import React, { useMemo } from 'react';
import {
  getFarm,
  getParcelsByFarm,
  getSensorsByFarm,
  getRobotsByFarm,
  getTasksByFarm
} from '../../data/farm/index.ts';
import { useFarmStore } from '../../store/farmStore.ts';
import { Layers, Activity, Cpu, CheckSquare } from 'lucide-react';

export const TableView = React.memo(function TableView() {
  const activeFarmId = useFarmStore((s) => s.activeFarmId);
  const selectedTarget = useFarmStore((s) => s.selectedTarget);
  const selectTarget = useFarmStore((s) => s.selectTarget);

  const farm = useMemo(() => getFarm(activeFarmId), [activeFarmId]);
  const parcels = useMemo(() => getParcelsByFarm(activeFarmId), [activeFarmId]);
  const sensors = useMemo(() => getSensorsByFarm(activeFarmId), [activeFarmId]);
  const robots = useMemo(() => getRobotsByFarm(activeFarmId), [activeFarmId]);
  const tasks = useMemo(() => getTasksByFarm(activeFarmId), [activeFarmId]);

  if (!farm) return null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#0c100e] text-slate-200">
      {/* Farm Overview Banner */}
      <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">
            Accessible Agronomic Data Registry
          </span>
          <h2 className="text-base font-bold text-white">{farm.name}</h2>
          <p className="text-xs text-slate-400">
            {farm.region}, {farm.country} · {farm.areaHectares} ha Total Area · {farm.origin.lat.toFixed(4)}° N, {farm.origin.lon.toFixed(4)}° E
          </p>
        </div>
        <div className="flex gap-2">
          <span className="px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
            {parcels.length} Parcels
          </span>
          <span className="px-2.5 py-1 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
            {sensors.length} Sensors
          </span>
        </div>
      </div>

      {/* Parcels Table */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Layers size={14} className="text-emerald-400" />
          Field Plots &amp; Management Zones
        </h3>
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/30">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-[10px] font-mono text-slate-400 uppercase">
                <th className="p-2.5">ID / Name</th>
                <th className="p-2.5">Crop &amp; Variety</th>
                <th className="p-2.5">Area (ha)</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5">S2 NDVI</th>
                <th className="p-2.5">SAR Moisture</th>
                <th className="p-2.5">Water Depth</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-[11px]">
              {parcels.map((p) => {
                const isSelected = selectedTarget?.kind === 'parcel' && selectedTarget.id === p.id;
                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-white/5 transition-colors ${isSelected ? 'bg-emerald-950/40 text-emerald-300' : ''}`}
                  >
                    <td className="p-2.5 font-medium text-white font-sans">{p.name}</td>
                    <td className="p-2.5 text-slate-300">{p.crop} ({p.variety})</td>
                    <td className="p-2.5">{p.areaHa} ha</td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${
                          p.status === 'healthy'
                            ? 'text-emerald-400 bg-emerald-950/60'
                            : p.status === 'warning'
                            ? 'text-amber-400 bg-amber-950/60'
                            : 'text-rose-400 bg-rose-950/60'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-emerald-400">{p.ndvi.toFixed(2)}</td>
                    <td className="p-2.5 text-cyan-400">{p.sarMoisture.toFixed(2)}</td>
                    <td className="p-2.5 text-slate-300">{p.waterDepthCm > 0 ? `${p.waterDepthCm} cm` : 'Drained (AWD)'}</td>
                    <td className="p-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => selectTarget({ kind: 'parcel', id: p.id })}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-emerald-600 hover:text-white transition-colors text-[10px]"
                      >
                        {isSelected ? 'Selected' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sensors Table */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Activity size={14} className="text-cyan-400" />
          IoT Field Telemetry Sensors
        </h3>
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/30">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-[10px] font-mono text-slate-400 uppercase">
                <th className="p-2.5">Sensor Name</th>
                <th className="p-2.5">Type</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5">Live Value</th>
                <th className="p-2.5">Battery</th>
                <th className="p-2.5">Last Seen</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-[11px]">
              {sensors.map((s) => (
                <tr key={s.id} className="hover:bg-white/5">
                  <td className="p-2.5 font-medium text-white font-sans">{s.name}</td>
                  <td className="p-2.5 text-slate-400 capitalize">{s.type.replace('_', ' ')}</td>
                  <td className="p-2.5">
                    <span className="text-emerald-400 uppercase font-semibold text-[10px]">{s.status}</span>
                  </td>
                  <td className="p-2.5 text-cyan-300 font-bold">{s.latestValue} {s.unit}</td>
                  <td className="p-2.5">{s.batteryPct}%</td>
                  <td className="p-2.5 text-slate-400 text-[10px]">{s.lastSeen}</td>
                  <td className="p-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => selectTarget({ kind: 'sensor', id: s.id })}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-cyan-600 hover:text-white transition-colors text-[10px]"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

TableView.displayName = 'TableView';


