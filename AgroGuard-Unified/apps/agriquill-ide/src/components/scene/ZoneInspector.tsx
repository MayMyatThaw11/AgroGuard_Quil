import { Droplets, Layers, ShieldAlert, Sprout, Crosshair, Wind } from 'lucide-react';

import { isGap, type Evidence, type SimulationSnapshot } from '../../lib/agriquill/contracts.ts';
import { PROVENANCE_CLASS, PROVENANCE_LABEL, type ProvenanceLevel } from '../../lib/provenance.ts';
import { buildDemoSnapshot } from '../../lib/agriquill/snapshotAdapter.ts';
import { useParcel3DStore } from '../../store/parcel3dStore.ts';
import type { Parcel } from '../../types.ts';

/**
 * Zone inspector.
 *
 * Renders what the snapshot says, including when the snapshot says nothing.
 *
 * What was removed and why
 * ------------------------
 * The previous revision of this component computed `canopyHeightCm` as
 * `day / 120 * 115` and cover fraction as `day / 120 * 88`. Neither 115 cm nor
 * 88% is sourced anywhere in the repository, and multiplying a day counter by a
 * maturity height produces a number that looks like a measurement of rice while
 * being neither modelled nor observed. It also had fallback values
 * (`6.9 ha`, `4.8 t/ha`) that fired when zone data was missing, which is the
 * opposite of abstaining.
 *
 * It also had a "Simulate AWD Irrigation Gate (-0.3m)" button that wrote
 * straight into the zone's stress value. That made selection itself an
 * actuation path with no safety gate, no receipt and no human approval.
 * Selection here is read-only. Actuation runs through `lib/safety.ts`.
 *
 * Every value below carries a unit and a provenance badge. A missing value is
 * shown as INSUFFICIENT_EVIDENCE with what would close the gap, never as a
 * substituted number.
 */

interface ZoneInspectorProps {
  readonly parcel: Parcel;
  readonly day: number;
  readonly seasonDays: number;
  readonly selectedZoneId: string | null;
  readonly onClearSelection: () => void;
  readonly windSpeedMs: number;
}

export function ZoneInspector({
  parcel,
  day,
  seasonDays,
  selectedZoneId,
  onClearSelection,
  windSpeedMs
}: ZoneInspectorProps) {
  const snapshot: SimulationSnapshot = buildDemoSnapshot(parcel, day, seasonDays);
  const zone = snapshot.zoneStates.find((state) => state.zoneId === selectedZoneId) ?? null;

  return (
    <aside
      className="flex h-full flex-col overflow-y-auto border-l border-[var(--border-default)] bg-[var(--surface-base)] p-4"
      aria-label="Zone inspector"
    >
      <header className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
          <Crosshair size={12} aria-hidden="true" />
          Zone inspector
        </span>
        <span className="numeric text-[10px] text-[var(--text-tertiary)]">
          Day {snapshot.dayIndex} / {snapshot.seasonDays}
        </span>
      </header>

      <h2 className="mt-3 truncate text-sm font-semibold text-[var(--text-primary)]">
        {zone ? zone.zoneName : parcel.name}
      </h2>
      <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
        {parcel.region ?? 'Unknown region'}, {parcel.country ?? 'Unknown country'}
      </p>

      {/* Run identity. A snapshot without these cannot be compared to another. */}
      <dl className="mt-3 space-y-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-2 font-mono text-[10px] text-[var(--text-tertiary)]">
        <Row label="Model">
          <span className="text-[var(--text-secondary)]">{snapshot.modelVersion}</span>
        </Row>
        <Row label="Input hash">
          <span className="text-[var(--text-secondary)]">{snapshot.inputHash}</span>
        </Row>
        <Row label="Calibration">
          <span className="provenance-badge provenance-inferred">
            {snapshot.calibrationStatus.replace(/_/g, ' ').toLowerCase()}
          </span>
        </Row>
        <Row label="Scenario">
          <span className="text-[var(--text-secondary)]">{snapshot.scenarioLabel}</span>
        </Row>
      </dl>

      {zone === null ? (
        <div className="flex-1 py-10 text-center">
          <p className="text-xs text-[var(--text-secondary)]">No zone selected</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
            Select a zone in the 3D field, or use the zone table below the viewport, to inspect its
            crop state, evidence and constraints.
          </p>
          <p className="mt-3 font-mono text-[10px] text-[var(--text-tertiary)]">
            {parcel.zones.length} management zones loaded
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Card>
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                <Sprout size={11} aria-hidden="true" />
                Crop
              </span>
              <span className="mt-0.5 block truncate font-medium capitalize text-[var(--text-primary)]">
                {zone.crop}
              </span>
              {zone.variety && (
                <span className="block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                  {zone.variety}
                </span>
              )}
            </Card>
            <Card>
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                <Layers size={11} aria-hidden="true" />
                Area
              </span>
              <EvidenceReadout evidence={zone.areaHa} decimals={2} />
            </Card>
          </div>

          <section className="rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <Droplets size={13} aria-hidden="true" />
              Root-zone water stress
            </span>
            <EvidenceReadout evidence={zone.stressEvidence} decimals={3} />
          </section>

          <section className="space-y-1.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-xs">
            <span className="block font-medium text-[var(--text-secondary)]">
              Crop development (simulated)
            </span>
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div>
                <span className="block text-[10px] text-[var(--text-tertiary)]">Canopy fraction</span>
                <EvidenceReadout evidence={zone.canopyFraction} decimals={3} />
              </div>
              <div>
                <span className="block text-[10px] text-[var(--text-tertiary)]">Biomass</span>
                <EvidenceReadout evidence={zone.biomassTPerHa} decimals={2} />
              </div>
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)]">Stage: {zone.growthStage}</p>
          </section>

          <section className="rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
              <Wind size={13} aria-hidden="true" />
              Field wind
            </span>
            <span className="numeric mt-1 block text-[var(--text-primary)]">
              {windSpeedMs.toFixed(1)} m/s
            </span>
            <span className="mt-0.5 block text-[10px] text-[var(--text-tertiary)]">
              {windSpeedMs > 5.5
                ? 'Above the 5.5 m/s drift ceiling. Spraying is blocked.'
                : 'Within the 5.5 m/s drift ceiling.'}
            </span>
          </section>

          {/* Limitations are part of the state, not a footnote. A zone with
              missing evidence must not look complete. */}
          <section className="rounded border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 p-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--status-warning)]">
              <ShieldAlert size={13} aria-hidden="true" />
              Limitations
            </span>
            <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {zone.limitations.map((limitation) => (
                <li key={limitation} className="flex gap-1.5">
                  <span aria-hidden="true">·</span>
                  <span>{limitation}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <footer className="mt-auto flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-[11px]">
        {selectedZoneId ? (
          <button
            type="button"
            onClick={onClearSelection}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Clear selection
          </button>
        ) : (
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
            Drag to pan · wheel to zoom
          </span>
        )}
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">Read-only</span>
      </footer>
    </aside>
  );
}

function Card({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-2.5">
      {children}
    </div>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0">{label}</dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}

/**
 * Renders an evidence value with its unit and provenance, or the gap that
 * replaced it.
 */
function EvidenceReadout({
  evidence,
  decimals
}: {
  readonly evidence: Evidence<number>;
  readonly decimals: number;
}) {
  if (isGap(evidence)) {
    return (
      <div className="mt-1">
        <span className="provenance-badge provenance-unavailable">Insufficient evidence</span>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-tertiary)]">
          {evidence.reason} Required: {evidence.requestedMethod}
        </p>
      </div>
    );
  }

  const level: ProvenanceLevel =
    evidence.provenance === 'MEASURED' || evidence.provenance === 'LAB_ANALYZED'
      ? 'measured'
      : evidence.provenance === 'SIMULATED' || evidence.provenance === 'DERIVED'
        ? 'modelled'
        : 'fixture';

  return (
    <div className="mt-0.5">
      <span className="numeric block text-[var(--text-primary)]">
        {evidence.value.toFixed(decimals)}{' '}
        <span className="text-[10px] text-[var(--text-tertiary)]">{evidence.unit}</span>
      </span>
      {evidence.uncertainty && (
        <span className="numeric block text-[10px] text-[var(--text-tertiary)]">
          band {evidence.uncertainty.lower.toFixed(decimals)}–{evidence.uncertainty.upper.toFixed(decimals)}
        </span>
      )}
      <span
        className={PROVENANCE_CLASS[level]}
        title={`${PROVENANCE_LABEL[level]} · source ${evidence.sourceId}`}
      >
        {PROVENANCE_LABEL[level]}
      </span>
    </div>
  );
}