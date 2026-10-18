import React from 'react';
import { BookOpen, Link, ShieldCheck, Tag, FileText } from 'lucide-react';
import type { AseanPreset } from '../types';
import { organicPremiumPerHa } from '../data/presets';

interface BrainVaultProps {
  activePreset: AseanPreset;
}

// Renders an illustrative Markdown dossier. No file on disk is read or
// written, and nothing here constitutes a compliance record.
export const BrainVault: React.FC<BrainVaultProps> = ({ activePreset }) => {
  const frontmatter: Array<[string, string]> = [
    ['parcel_id', `"${activePreset.id}_block_04"`],
    ['crop_variety', `"${activePreset.variety}"`],
    ['target_standard', `"${activePreset.standard}"`],
    ['example_export_premium', `+$${Math.round(organicPremiumPerHa(activePreset))}/ha`],
    ['example_water_reduction', `-${activePreset.waterReduction}%`],
    ['example_ch4_reduction', `-${activePreset.ch4Reduction}%`],
    ['biophysical_engine', '"None. Illustrative values only"']
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--surface-base)] text-[var(--text-primary)] p-6 overflow-y-auto select-text font-sans">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Document Header */}
        <div className="border-b border-[var(--border-default)] pb-4">
          <div className="flex items-center space-x-2 text-[var(--status-simulated)] font-mono text-xs mb-1.5">
            <BookOpen className="w-4 h-4 shrink-0" />
            <span className="px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
              asoa_compliance_{activePreset.id}.md
            </span>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            {activePreset.country}: Example Export Compliance Dossier
          </h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 font-mono">
            Illustrative Markdown view · no knowledge vault file is read or written
          </p>
        </div>

        {/* YAML Frontmatter Card */}
        <div className="rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-default)] overflow-hidden shadow-sm">
          <div className="px-3.5 py-2 bg-[var(--surface-base)] border-b border-[var(--border-subtle)] flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-[var(--text-tertiary)] flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-[var(--status-simulated)]" />
              <span>YAML Frontmatter</span>
            </span>
            <span className="text-[11px] font-mono text-[var(--text-disabled)]">read-only</span>
          </div>
          <div className="p-3.5 font-mono text-xs text-[var(--text-secondary)] leading-relaxed space-y-1">
            <div className="text-[var(--status-simulated)] font-bold">---</div>
            {frontmatter.map(([key, value]) => (
              <div key={key} className="flex flex-wrap items-baseline gap-2">
                <span className="text-[var(--text-primary)] font-semibold min-w-44">{key}:</span>
                <span className="text-[var(--text-secondary)]">{value}</span>
              </div>
            ))}
            <div className="text-[var(--status-simulated)] font-bold">---</div>
          </div>
        </div>

        {/* Section Cards */}
        <div className="space-y-4">
          {/* Section 1 */}
          <div className="p-4 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] space-y-2.5 shadow-sm">
            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-[var(--status-valid)] shrink-0" />
              <span>1. Example Regulatory Invariants</span>
            </h2>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              This dossier references an example rule set at{' '}
              <span className="inline-flex items-center text-[var(--status-simulated)] bg-[var(--status-simulated-bg)] border border-[var(--status-simulated)]/30 px-1.5 py-0.5 rounded font-mono text-[11px]">
                [[standards/asoa_rules]]
              </span>{' '}
              and an example parcel at{' '}
              <span className="inline-flex items-center text-[var(--accent)] bg-[var(--accent-subtle)] border border-[var(--accent)]/30 px-1.5 py-0.5 rounded font-mono text-[11px]">
                [[parcels/{activePreset.id}_field_01]]
              </span>
              . Neither link resolves to a file. Organic certification requires an authorised certifier and
              dated, jurisdiction-specific evidence.
            </p>
          </div>

          {/* Section 2 */}
          <div className="p-4 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] space-y-2.5 shadow-sm">
            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <Tag className="w-4 h-4 text-[var(--status-simulated)] shrink-0" />
              <span>2. Example Circular Bio-Nutrient Figures</span>
            </h2>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              The 65.0 kg N/ha figure shown in the editor template is a static example value. No nutrient
              budget has been calculated, and no input record exists at{' '}
              <span className="inline-flex items-center text-[var(--status-simulated)] bg-[var(--status-simulated-bg)] border border-[var(--status-simulated)]/30 px-1.5 py-0.5 rounded font-mono text-[11px]">
                [[receipts/soil_lab_tests_2026]]
              </span>
              .
            </p>
          </div>

          {/* Section 3 */}
          <div className="p-4 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] space-y-2.5 shadow-sm">
            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <Link className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
              <span>3. Example Audit Trail</span>
            </h2>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              The illustrative yield figure of {activePreset.targetYield} t/ha is a preset fixture, not a
              projection or a measurement. Records shown in the ledger are in-memory demo state and are
              cleared on reload.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};