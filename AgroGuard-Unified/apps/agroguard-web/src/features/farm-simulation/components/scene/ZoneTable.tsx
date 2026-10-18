import { useMemo } from 'react';

import type { ZonePresentation } from '../../lib/agriquill/snapshotAdapter.ts';
import type { Zone } from '../../types.ts';

/**
 * Keyboard- and no-WebGL-accessible equivalent of the 3D zone selection.
 *
 * A canvas is a single tab stop at best, so zone selection would otherwise be
 * unreachable without a pointer. Every value here comes from the same
 * `ZonePresentation` the scene renders, so the two views cannot disagree.
 *
 * Colour is never the only signal: each row carries a text status and a
 * `SIMULATED` badge, because the stress tint alone reads as measured.
 */

interface ZoneTableProps {
  readonly zones: readonly Zone[];
  readonly presentation: readonly ZonePresentation[];
  readonly selectedZoneId: string | null;
  readonly onSelect: (zoneId: string | null) => void;
}

interface ZoneRow {
  readonly id: string;
  readonly name: string;
  readonly crop: string;
  readonly canopyPercent: number | null;
  readonly stressPercent: number | null;
  readonly status: 'simulated' | 'no-evidence';
}

export function ZoneTable({ zones, presentation, selectedZoneId, onSelect }: ZoneTableProps) {
  const rows = useMemo<readonly ZoneRow[]>(() => {
    const byZone = new Map(presentation.map((p) => [p.zoneId, p]));
    return zones.map((zone) => {
      const state = byZone.get(zone.id);
      return {
        id: zone.id,
        name: zone.name,
        crop: zone.crop,
        canopyPercent: state ? Math.round(state.canopyFraction * 100) : null,
        stressPercent:
          state && state.stressIndex !== null ? Math.round(state.stressIndex * 100) : null,
        status: state && state.stressIndex === null ? 'no-evidence' : 'simulated'
      };
    });
  }, [zones, presentation]);

  const selectedIndex = rows.findIndex((row) => row.id === selectedZoneId);

  /**
   * Roving arrow-key navigation with a single tab stop, which is the standard
   * pattern for a toolbar-like list and keeps the whole table out of the tab
   * order.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (rows.length === 0) return;
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') nextIndex = Math.min(rows.length - 1, selectedIndex + 1);
    else if (event.key === 'ArrowUp') nextIndex = Math.max(0, selectedIndex - 1);
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = rows.length - 1;
    else if (event.key === 'Escape') {
      onSelect(null);
      return;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const next = rows[nextIndex];
    if (!next) return;
    onSelect(next.id);
    document.getElementById(`zone-row-${next.id}`)?.focus();
  };

  return (
    <div className="absolute left-3 bottom-3 z-10 max-w-md">
      <details className="group rounded border border-[var(--border-default)] bg-[var(--surface-overlay)]">
        <summary className="cursor-pointer list-none px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-[var(--text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          Zones ({rows.length}) — keyboard equivalent
        </summary>
        <table className="w-full border-collapse text-[11px]">
          <caption className="sr-only">
            Management zones with canopy and water-stress state from the current simulation snapshot.
            Use arrow keys to move between zones and Enter to select.
          </caption>
          <thead>
            <tr className="text-left text-[var(--text-tertiary)]">
              <th scope="col" className="px-3 py-1 font-normal">
                Zone
              </th>
              <th scope="col" className="px-2 py-1 font-normal">
                Canopy
              </th>
              <th scope="col" className="px-2 py-1 font-normal">
                Water stress
              </th>
              <th scope="col" className="px-2 py-1 font-normal">
                Status
              </th>
            </tr>
          </thead>
          <tbody onKeyDown={onKeyDown}>
            {rows.map((row, index) => {
              const isSelected = row.id === selectedZoneId;
              return (
                <tr
                  key={row.id}
                  id={`zone-row-${row.id}`}
                  tabIndex={isSelected || (selectedIndex === -1 && index === 0) ? 0 : -1}
                  aria-selected={isSelected}
                  onClick={() => onSelect(isSelected ? null : row.id)}
                  onFocus={() => onSelect(row.id)}
                  className={`cursor-pointer border-t border-[var(--border-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    isSelected
                      ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <td className="px-3 py-1">{row.name}</td>
                  <td className="numeric px-2 py-1">
                    {row.canopyPercent === null ? 'n/a' : `${row.canopyPercent}%`}
                  </td>
                  <td className="numeric px-2 py-1">
                    {row.stressPercent === null ? (
                      <span className="text-[var(--status-warning)]">no data</span>
                    ) : (
                      `${row.stressPercent}%`
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <span
                      className={
                        row.status === 'no-evidence'
                          ? 'provenance-badge provenance-unavailable'
                          : 'provenance-badge provenance-fixture'
                      }
                    >
                      {row.status === 'no-evidence' ? 'No evidence' : 'Simulated'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}