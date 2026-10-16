import React, { useState } from 'react';
import {
  AlertCircle,
  FlaskConical,
  List,
  FileCheck2,
  Terminal as TerminalIcon,
  ChevronDown,
  Maximize2,
  Minimize2,
  X,
  ExternalLink,
  Code,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Play
} from 'lucide-react';
import type { ToolReceipt } from '../types';

export type OutputDrawerTab = 'problems' | 'tests' | 'logs' | 'receipts' | 'terminal';

export interface OutputDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: OutputDrawerTab;
  onSelectTab: (tab: OutputDrawerTab) => void;
  hasLintError: boolean;
  onApplyFix: () => void;
  onGoToCode?: () => void;
  onViewRuleSource?: () => void;
  receipts: ToolReceipt[];
  height?: number;
  onHeightChange?: (h: number) => void;
}

export const OutputDrawer: React.FC<OutputDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  hasLintError,
  onApplyFix,
  onGoToCode,
  onViewRuleSource,
  receipts,
  height = 240,
  onHeightChange
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [reviewCandidateOpen, setReviewCandidateOpen] = useState(false);
  const [fixConfirmed, setFixConfirmed] = useState(false);

  if (!isOpen) return null;

  const problemCount = hasLintError ? 1 : 0;
  const testCount = 5;

  return (
    <div
      style={{ height: isMaximized ? '80vh' : `${height}px` }}
      className="w-full bg-[var(--surface-base)] border-t border-[var(--border-default)] flex flex-col text-xs select-none z-20 shrink-0 transition-all duration-200"
      role="region"
      aria-label="Output Drawer"
    >
      {/* 1. Header with Labelled Tabs & Window Controls */}
      <div className="h-8 px-2 bg-[var(--surface-sunken)] border-b border-[var(--border-default)] flex items-center justify-between">
        {/* Tabs */}
        <div className="flex items-center space-x-1" role="tablist">
          {[
            { id: 'problems' as OutputDrawerTab, label: 'Problems', count: problemCount, icon: AlertCircle, error: problemCount > 0 },
            { id: 'tests' as OutputDrawerTab, label: 'Tests', count: testCount, icon: FlaskConical },
            { id: 'logs' as OutputDrawerTab, label: 'Logs', icon: List },
            { id: 'receipts' as OutputDrawerTab, label: 'Tool Receipts', count: receipts.length, icon: FileCheck2 },
            { id: 'terminal' as OutputDrawerTab, label: 'Terminal', icon: TerminalIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-[11px] transition ${
                  isSelected
                    ? 'bg-[var(--surface-base)] text-[var(--text-primary)] font-semibold shadow-2xs'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${tab.error ? 'text-rose-500' : ''}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1 rounded-full font-mono text-[9px] ${
                    tab.error
                      ? 'bg-rose-500/10 text-rose-500 font-bold'
                      : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Drawer Window Actions */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition"
            title={isMaximized ? 'Restore height' : 'Maximize output drawer'}
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition"
            title="Collapse output drawer (⌘J)"
            aria-label="Collapse output drawer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Tab Content Panels */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* PROBLEMS PANEL */}
        {activeTab === 'problems' && (
          <div className="space-y-3">
            {hasLintError ? (
              <div className="p-3 rounded-lg bg-[var(--surface-sunken)] border border-rose-500/30 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-500 text-[10px] font-mono font-bold border border-rose-500/20">
                        BLOCKING
                      </span>
                      <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                        ASOA-RULE-3.2.1-BIO
                      </span>
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                        parcels/field_01_paddy.agri:14:3
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                      Prohibited synthetic input <code className="px-1 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono">synthetic_urea</code> violates the active ASEAN Organic Standard (ASOA 2026, Section 3.2.1).
                    </p>
                  </div>
                </div>

                {/* Structured Diagnostic Actions */}
                <div className="flex items-center space-x-2 pt-1 border-t border-[var(--border-subtle)] text-[11px]">
                  {onViewRuleSource && (
                    <button
                      type="button"
                      onClick={onViewRuleSource}
                      className="px-2 py-1 rounded bg-[var(--surface-base)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center space-x-1"
                    >
                      <ExternalLink className="w-3 h-3 text-purple-500" />
                      <span>View Rule Citation</span>
                    </button>
                  )}

                  {onGoToCode && (
                    <button
                      type="button"
                      onClick={onGoToCode}
                      className="px-2 py-1 rounded bg-[var(--surface-base)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center space-x-1"
                    >
                      <Code className="w-3 h-3 text-cyan-500" />
                      <span>Go to Code (Line 14)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setReviewCandidateOpen(!reviewCandidateOpen)}
                    className="px-2.5 py-1 rounded bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] border border-[var(--border-strong)] text-[var(--accent)] font-medium flex items-center space-x-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Review Safe Alternatives…</span>
                  </button>
                </div>

                {/* Candidate Alternatives Modal / Drawer Overlay */}
                {reviewCandidateOpen && (
                  <div className="mt-2 p-2.5 rounded bg-[var(--surface-base)] border border-[var(--border-default)] space-y-2">
                    <span className="font-semibold text-[11px] text-[var(--text-primary)] block">
                      Approved Biological Nitrogen Candidates (ASOA Annex II):
                    </span>
                    <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                      <label className="flex items-center space-x-2 p-1.5 rounded hover:bg-[var(--surface-sunken)] cursor-pointer">
                        <input
                          type="radio"
                          name="candidate"
                          defaultChecked
                          className="accent-[var(--accent)]"
                        />
                        <div>
                          <span className="font-medium text-[var(--text-primary)]">AzollaBioCompost</span>
                          <span className="text-[10px] text-[var(--text-tertiary)] block">
                            Biological cyanobacteria fixation (3.2% N, safe under ASOA)
                          </span>
                        </div>
                      </label>
                      <label className="flex items-center space-x-2 p-1.5 rounded hover:bg-[var(--surface-sunken)] cursor-pointer">
                        <input
                          type="radio"
                          name="candidate"
                          className="accent-[var(--accent)]"
                        />
                        <div>
                          <span className="font-medium text-[var(--text-primary)]">SesbaniaGreenManure</span>
                          <span className="text-[10px] text-[var(--text-tertiary)] block">
                            In-situ leguminous biomass incorporation (2.8% N)
                          </span>
                        </div>
                      </label>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onApplyFix();
                          setReviewCandidateOpen(false);
                        }}
                        className="px-3 py-1 rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] font-semibold text-xs"
                      >
                        Confirm &amp; Apply Candidate Fix
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewCandidateOpen(false)}
                        className="px-2.5 py-1 rounded hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-[var(--text-tertiary)] flex flex-col items-center justify-center space-y-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span className="text-xs font-medium text-[var(--text-primary)]">No diagnostics found</span>
                <span className="text-[11px]">Active .agri script compiles clean against ASOA standard</span>
              </div>
            )}
          </div>
        )}

        {/* TESTS PANEL */}
        {activeTab === 'tests' && (
          <div className="space-y-2 font-mono text-[11px]">
            <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)] text-[var(--text-tertiary)]">
              <span>AgriQuill Verification Suite (5/5 PASS)</span>
              <span>Design Target: Simulation &lt; 250ms</span>
            </div>
            {[
              { name: 'lint_rules.test: Prohibits synthetic_urea under ASOA', dur: '3.2 ms', status: 'PASS' },
              { name: 'sim_stepping.test: 120 days completed in 6.9 ms with AWD breakpoint', dur: '6.9 ms', status: 'PASS' },
              { name: 'safety_interlock.test: Foliar spray aborted if wind > 5.5 m/s', dur: '0.4 ms', status: 'PASS' },
              { name: 'territory_profile.test: ISRIC 6-layer stratigraphy & Open-Meteo', dur: '25.8 ms', status: 'PASS' },
              { name: 'deterministic_replay.test: Ledger hash bit-exact audit verification', dur: '2.3 ms', status: 'PASS' },
            ].map((t, idx) => (
              <div key={idx} className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-[var(--surface-sunken)]">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-[var(--text-primary)]">{t.name}</span>
                </div>
                <div className="flex items-center space-x-3 text-[10px]">
                  <span className="text-[var(--text-tertiary)]">{t.dur}</span>
                  <span className="text-emerald-500 font-bold">{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LOGS PANEL */}
        {activeTab === 'logs' && (
          <div className="space-y-1 font-mono text-[11px] text-[var(--text-secondary)]">
            <div className="text-[var(--text-tertiary)]">Season simulation: analytic fixture model, not AquaCrop</div>
            <div className="text-[var(--text-tertiary)]">[08:30:01] Loaded ISRIC SoilGrids 2.0 depth profile for Ayeyarwady Delta (16.9825° N, 95.8812° E)</div>
            <div className="text-emerald-500">Agents read the selected farm from the backend in Agent Studio</div>
            <div className="text-cyan-500">[08:30:03] Replay trajectory loaded: AWD wetting threshold 0.15m, drainage scheduled day 85</div>
          </div>
        )}

        {/* TOOL RECEIPTS PANEL */}
        {activeTab === 'receipts' && (
          <div className="space-y-2 font-mono text-[11px]">
            {receipts.map((r, i) => (
              <div key={i} className="p-2 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-[var(--text-primary)]">{r.toolName}</span>
                  <span className="text-emerald-500 font-bold">{r.status}</span>
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                  Inputs: {JSON.stringify(r.parameters)}
                </div>
                <div className="text-[9px] text-[var(--accent)] truncate">
                  Signature: {r.signature}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TERMINAL PANEL */}
        {activeTab === 'terminal' && (
          <div className="font-mono text-xs text-[var(--text-primary)] space-y-1 p-1">
            <div className="text-[var(--text-tertiary)]">$ agriqill lint parcels/field_01_paddy.agri --profile ASOA</div>
            <div className={hasLintError ? 'text-rose-500' : 'text-emerald-500'}>
              {hasLintError
                ? 'FAIL: Diagnostic ASOA-RULE-3.2.1-BIO: prohibited synthetic_urea at line 14'
                : 'SUCCESS: All 14 AST nodes verified. Certified under ASOA Organic Profile.'}
            </div>
            <div className="text-[var(--text-tertiary)]">$ agriqill simulate --parcel field_01_paddy --steps 120</div>
            <div className="text-cyan-500">Runs the analytic fixture model, not AquaCrop. No harvest figure is shown here.</div>
          </div>
        )}
      </div>
    </div>
  );
};
