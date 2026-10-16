import React, { useState } from 'react';
import {
  Cpu,
  X
} from 'lucide-react';

interface MlBrainModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MlBrainModal: React.FC<MlBrainModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'forecasting' | 'classification' | 'eda' | 'architecture'>('forecasting');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-4xl bg-[#101713] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-200 font-sans">
        
        {/* Header */}
        <div className="h-14 border-b border-white/10 px-5 flex items-center justify-between bg-[#15201a]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Cpu size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                AgriQill Machine Learning Brain
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  ML Best Practices Spec
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                What each model is, and what has not been measured
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="h-11 border-b border-white/10 px-5 flex items-center gap-2 bg-[#121915]">
          <button
            type="button"
            onClick={() => setActiveTab('forecasting')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
              activeTab === 'forecasting'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            1. Season simulation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('classification')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
              activeTab === 'classification'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            2. Leaf photos and crop suggestion
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('eda')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
              activeTab === 'eda'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            3. Anomaly EDA &amp; Gaps
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('architecture')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
              activeTab === 'architecture'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            4. Agentic Cognitive Architecture
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">

          {/* TAB 1: Time Series Forecasting */}
          {activeTab === 'forecasting' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-black/40 border border-amber-500/30 space-y-2">
                <span className="text-xs font-bold text-amber-300 font-mono uppercase tracking-wider block">
                  Simulation: analytic fixture model, not AquaCrop
                </span>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  The season simulation is an analytic logistic fixture. AquaCrop is not installed, and no AquaCrop baseline or
                  neural surrogate has been run or scored, so no error or speed figures are shown. A 120-day run under 250 ms and
                  harvest variance within about 1.8% of AquaCrop are design targets only.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: Classification */}
          {activeTab === 'classification' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-black/40 border border-amber-500/30 space-y-2">
                <span className="text-xs font-bold text-amber-300 uppercase font-mono tracking-wider block">
                  Leaf-disease photo check is off
                </span>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Model weights not installed. The ResNet18 leaf-disease classifier has no trained weights on this server, so
                  AgriQill does not accept leaf photos and shows no accuracy figures.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                <span className="text-xs font-bold text-white uppercase font-mono tracking-wider block">
                  Crop suggestion model
                </span>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  The crop suggestion model is trained on synthetic data. Its accuracy is measured only on its own synthetic split,
                  not on farm records.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Anomaly Detection */}
          {activeTab === 'eda' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                <span className="text-xs font-bold text-emerald-400 uppercase font-mono tracking-wider block">
                  Soil Stratigraphy Anomaly Detection &amp; Data Gap Policy
                </span>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Per strict <code className="text-emerald-300">/ml-best-practices</code> rules: absence of evidence is NEVER replaced with fabricated zeros.
                  If a LoRa node packet is dropped, AgriQill flags <code className="text-amber-400 font-mono">INSUFFICIENT_EVIDENCE</code> to prevent erroneous irrigation actuation.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-black/50 border border-white/5 space-y-1 text-[11px]">
                    <span className="font-bold text-white block">Salinity Intrusion Anomaly (Z &gt; 2.5)</span>
                    <p className="text-slate-400 text-[10px]">
                      Triggered when coastal delta backflow drives root EC &gt; 2.2 dS/m. Directs irrigation sluice gate to flush root-zone with fresh canal water.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-black/50 border border-white/5 space-y-1 text-[11px]">
                    <span className="font-bold text-white block">Uncertainty Bounds Ordering</span>
                    <p className="text-slate-400 text-[10px]">
                      Monte Carlo ensemble outputs ordered bounds <code className="text-cyan-300">[lower, median, upper]</code>. Inverted bounds are rejected by schema verification.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Architecture */}
          {activeTab === 'architecture' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                <span className="text-xs font-bold text-emerald-400 uppercase font-mono tracking-wider block">
                  AgriQill as the Cognitive Brain of Agentic Agriculture
                </span>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  AgriQill replaces fragmented human trial-and-error with a coherent cyber-physical agent loop:
                </p>
                <div className="p-3 rounded-lg bg-black/60 border border-white/10 font-mono text-[10px] space-y-1.5 text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">1. PERCEPTION:</span>
                    <span>Sentinel-2 NDVI + Sentinel-1 SAR + LoRaWAN Soil &amp; Weather telemetry</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">2. COGNITION:</span>
                    <span>Analytic fixture model, not AquaCrop, gives an illustrative 120-day season</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400">3. SAFETY GATE:</span>
                    <span>Deterministic wind cutoff (&le;5.5 m/s) + ASOA organic standard linter + PIN auth</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sky-400">4. PHYSICAL ACTION:</span>
                    <span>Autonomous drone sortie + AWD canal sluice gate + soil rover deployment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">5. AUDIT:</span>
                    <span>Immutable SHA-256 Merkle chain commit logs every decision receipt</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="h-12 border-t border-white/10 px-5 flex items-center justify-between bg-[#15201a] text-[11px] font-mono text-slate-400">
          <span>AgriQill Decision Support System · Model Council Spec 5.1</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium cursor-pointer transition"
          >
            Close Brain View
          </button>
        </div>

      </div>
    </div>
  );
};
