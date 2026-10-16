import React, { useState } from 'react';
import {
  Sprout,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Plane,
  Droplets,
  Layers,
  ShieldCheck,
  Cpu,
  Wind,
  Send,
  X,
  Database,
  CloudSun,
  Radio
} from 'lucide-react';
import { useFarmStore } from '../../store/farmStore.ts';
import {
  getFarm,
  getParcelsByFarm,
  getSensorsByFarm,
  getRobotsByFarm,
  getAquaPondsByFarm,
  getReadingsBySensor
} from '../../data/farm/index.ts';
import { WIND_CEILING_MS, checkWindCeiling } from '../../lib/safety.ts';

const NOTHING_SENT = 'Nothing was sent. Machines move only after approval and the PIN step in Farm Operations.';

export const AgronomistInspector: React.FC = () => {
  const { activeFarmId, selectedTarget, selectTarget, day } = useFarmStore();

  const [expanded, setExpanded] = useState(true);
  const [activeMcpTool, setActiveMcpTool] = useState<'soil_query' | 'weather_forecast' | 'drone_spray_guard' | 'lorawan_actuate' | null>(null);

  const [windSpeed, setWindSpeed] = useState<number>(3.8);
  const [mcpVerdict, setMcpVerdict] = useState<{ type: 'ok' | 'error'; message: string } | null>(null);
  const [valveMinutes, setValveMinutes] = useState<number>(90);
  const [valveReceipt, setValveReceipt] = useState<string | null>(null);

  const farm = getFarm(activeFarmId);
  const parcels = getParcelsByFarm(activeFarmId);
  const sensors = getSensorsByFarm(activeFarmId);
  const robots = getRobotsByFarm(activeFarmId);
  const ponds = getAquaPondsByFarm(activeFarmId);

  if (!farm) return null;

  const parcel =
    selectedTarget?.kind === 'parcel'
      ? parcels.find((p) => p.id === selectedTarget.id)
      : undefined;

  const robot =
    selectedTarget?.kind === 'robot'
      ? robots.find((r) => r.id === selectedTarget.id)
      : undefined;

  const pond =
    selectedTarget?.kind === 'pond'
      ? ponds.find((p) => p.id === selectedTarget.id)
      : undefined;

  const sensor =
    selectedTarget?.kind === 'sensor'
      ? sensors.find((s) => s.id === selectedTarget.id)
      : undefined;

  const handleMcpDroneGuard = () => {
    const wind = checkWindCeiling(windSpeed);
    setMcpVerdict(
      wind.permitted
        ? { type: 'ok', message: `Wind ${windSpeed.toFixed(1)} m/s is under the ${WIND_CEILING_MS} m/s halt. ${NOTHING_SENT}` }
        : { type: 'error', message: `${wind.rejection.detail}. ${NOTHING_SENT}` }
    );
  };

  const handleMcpLorawanActuate = () => {
    const clamped = Math.min(180, Math.max(1, valveMinutes));
    setValveReceipt(`Practice pulse of ${clamped} min. ${NOTHING_SENT}`);
  };

  return (
    <aside className="absolute top-3 right-3 z-10 w-80 bg-[#121915]/94 hover:bg-[#121915]/98 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl pointer-events-auto select-none text-slate-200 transition-all max-h-[calc(100%-24px)] overflow-y-auto font-sans">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Sprout size={16} />
          </div>
          <div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider block">
              {parcel ? `PADDY PLOT · ${parcel.id.toUpperCase()}` : `FARM STATION · ${farm.presetId.toUpperCase()}`}
            </span>
            <h2 className="text-sm font-bold text-white leading-tight">
              {parcel ? parcel.name : farm.name}
            </h2>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Ayeyarwady Delta Agricultural Center
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {selectedTarget && (
            <button
              type="button"
              onClick={() => selectTarget(null)}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
          >
            {expanded ? <Minus size={14} /> : <Plus size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="pt-3 space-y-3.5">
          {/* Status Badge & Summary */}
          <div className="flex items-center justify-between text-xs">
            <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Operational
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {parcels.length} paddies · 1 drone · 1 rover · 8 LoRa nodes
            </span>
          </div>

          {/* Progress Bars (Canopy Cover & Soil Water Reserve) */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-xl bg-black/30 border border-white/5 space-y-1">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Canopy Cover</span>
                <span className="text-white font-mono font-bold">78%</span>
              </div>
              <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '78%' }} />
              </div>
            </div>

            <div className="p-2 rounded-xl bg-black/30 border border-white/5 space-y-1">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Water Reserve</span>
                <span className="text-sky-400 font-mono font-bold">82%</span>
              </div>
              <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full" style={{ width: '82%' }} />
              </div>
            </div>
          </div>

          {/* Daily Agricultural Operations */}
          <div className="flex items-center justify-between text-xs px-1 text-slate-300">
            <div>
              <span className="text-slate-400 text-[10px] block">Drone Sorties</span>
              <span className="font-bold text-cyan-300 font-mono text-sm">4 flights executed</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 text-[10px] block">AWD Sluice Cycles</span>
              <span className="font-bold text-sky-400 font-mono text-sm">3 pulses logged</span>
            </div>
          </div>

          {/* Field Grain Stocks & Organic Biocontrol Reserves */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span className="uppercase tracking-wider">Field Crop Reserves</span>
              <span>units</span>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/25 border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🌾</span>
                  <span className="text-[11px] font-medium text-white">Paw San Hmwe Rice</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white font-bold text-[11px]">1,906 kg</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 text-[9px] font-mono">
                    In Season
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/25 border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🌱</span>
                  <span className="text-[11px] font-medium text-white">IR64 High Yield</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white font-bold text-[11px]">297 kg</span>
                  <span className="px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 text-[9px] font-mono">
                    Vegetative
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/25 border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🦐</span>
                  <span className="text-[11px] font-medium text-white">Black Tiger Shrimp</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white font-bold text-[11px]">212 kg</span>
                  <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 text-[9px] font-mono">
                    Polyculture
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/25 border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🧪</span>
                  <span className="text-[11px] font-medium text-white">Trichoderma Biocontrol</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white font-bold text-[11px]">4,448 L</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 text-[9px] font-mono">
                    ASOA Cert
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Autonomous Fleet Telemetry */}
          <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span className="uppercase">Autonomous Fleet</span>
              <span className="text-emerald-400 font-bold">2/2 operational</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <Plane size={13} className="text-cyan-400" />
                <span className="text-white font-medium">DJI Agras T40</span>
              </div>
              <span className="text-slate-400 text-[10px]">Scanning Parcel P-03 (75% battery)</span>
            </div>
            <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full" style={{ width: '75%' }} />
            </div>
          </div>

          {parcel && (
            <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 space-y-2">
              <span className="text-[10px] font-mono uppercase text-emerald-400 font-semibold flex items-center gap-1">
                <Cpu size={12} /> Season simulation
              </span>
              <p className="text-[10px] text-amber-300 leading-relaxed">
                Analytic fixture model, not AquaCrop. Run the season from the replay controls; this panel shows no harvest forecast.
              </p>
            </div>
          )}

          {/* ROBOT INSPECTION: FastMCP drone_spray_guard */}
          {robot && (
            <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-cyan-400 font-semibold flex items-center gap-1">
                  <ShieldCheck size={12} /> Drone wind gate
                </span>
                <span className="text-[9px] font-mono text-slate-400">Wind ceiling &le; 5.5 m/s</span>
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-white/5 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <Wind size={12} /> Field Wind:
                </span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-bold ${windSpeed > 5.5 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {windSpeed.toFixed(1)} m/s
                  </span>
                  <button
                    type="button"
                    onClick={() => setWindSpeed((prev) => (prev > 5.5 ? 3.8 : 6.2))}
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-300 cursor-pointer"
                  >
                    Simulate {windSpeed > 5.5 ? 'Calm' : 'Gust'}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={handleMcpDroneGuard}
                  className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow transition ${
                    windSpeed > 5.5
                      ? 'bg-rose-900/60 text-rose-300 border border-rose-500/40 hover:bg-rose-900'
                      : 'bg-cyan-700 hover:bg-cyan-600 text-white'
                  }`}
                >
                  <Send size={12} />
                  Check wind gate
                </button>
                {mcpVerdict && (
                  <div
                    className={`p-2 rounded text-[10px] font-mono leading-relaxed border ${
                      mcpVerdict.type === 'error'
                        ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                        : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    }`}
                  >
                    <p>{mcpVerdict.message}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* POND/CANAL INSPECTION: FastMCP lorawan_actuate */}
          {pond && (
            <div className="p-2.5 rounded-xl bg-sky-950/40 border border-sky-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-sky-400 font-semibold flex items-center gap-1">
                  <Droplets size={12} /> Sluice gate
                </span>
                <span className="text-[9px] font-mono text-slate-400">Max 180 min</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-slate-300">
                  <span>Pulse Duration:</span>
                  <span className="text-white font-bold">{valveMinutes} min</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="240"
                  step="15"
                  value={valveMinutes}
                  onChange={(e) => setValveMinutes(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer h-1"
                />
                {valveMinutes > 180 && (
                  <span className="text-[9px] text-amber-400 font-mono block">
                    Notice: Safety policy clamps valve execution to 180 minutes.
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleMcpLorawanActuate}
                className="w-full py-1.5 px-3 rounded-lg bg-sky-800 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer shadow transition"
              >
                Check sluice pulse
              </button>
              {valveReceipt && (
                <div className="p-1.5 rounded bg-black/60 border border-sky-500/30 text-[9px] font-mono text-sky-300">
                  {valveReceipt}
                </div>
              )}
            </div>
          )}

          {/* SENSOR INSPECTION */}
          {sensor && (
            <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase">LoRaWAN Node Telemetry</span>
                <span className="text-[9px] font-mono text-emerald-400 font-bold">Online</span>
              </div>
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-slate-400">Current Reading:</span>
                <span className="text-white font-bold">{sensor.latestValue} {sensor.unit}</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Battery Level:</span>
                <span className="text-emerald-400">{sensor.batteryPct}%</span>
              </div>
            </div>
          )}

        </div>
      )}
    </aside>
  );
};
