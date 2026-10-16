/**
 * Provenance vocabulary for every number shown in the IDE.
 * Ruling 12 of bombplan.md: every metric carries a badge saying where it
 * came from. The badge transitions fixture -> uncalibrated -> validated as
 * real models land, so the transition is additive rather than a rewrite.
 */
export type ProvenanceLevel =
  | 'measured'
  | 'modelled'
  | 'inferred'
  | 'fixture'
  | 'unavailable';

export const PROVENANCE_LABEL: Record<ProvenanceLevel, string> = {
  measured: 'Measured',
  modelled: 'Modelled',
  inferred: 'Inferred',
  fixture: 'Fixture',
  unavailable: 'Unavailable',
};

export const PROVENANCE_CLASS: Record<ProvenanceLevel, string> = {
  measured: 'provenance-badge provenance-measured',
  modelled: 'provenance-badge provenance-modelled',
  inferred: 'provenance-badge provenance-inferred',
  fixture: 'provenance-badge provenance-fixture',
  unavailable: 'provenance-badge provenance-unavailable',
};

export function provenanceLabel(level: ProvenanceLevel): string {
  return PROVENANCE_LABEL[level];
}
