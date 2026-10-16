import React, { useEffect, useState } from 'react';
import type { FarmCheck } from '../../data/ops/types.ts';
import { getFarmCheck } from '../../lib/api.ts';
import { farmCheckLines, type FarmCheckTone } from '../../lib/farmCheck.ts';
import { farmLoadProblem } from '../../lib/contractFarm.ts';

type CheckState = { farmId: string; check: FarmCheck | null; error: string | null };

const TONE_WORD: Record<FarmCheckTone, string> = { ok: 'OK', warn: 'Check', missing: 'No data' };
const TONE_CLASS: Record<FarmCheckTone, string> = { ok: ' is-green', warn: ' is-amber', missing: '' };

export function FarmCheckCard({ farmId }: { farmId: string }) {
  const [state, setState] = useState<CheckState | null>(null);

  useEffect(() => {
    let live = true;
    getFarmCheck(farmId)
      .then((check) => live && setState({ farmId, check, error: null }))
      .catch((err: unknown) =>
        live && setState({ farmId, check: null, error: farmLoadProblem(farmId, err) })
      );
    return () => {
      live = false;
    };
  }, [farmId]);

  const current = state?.farmId === farmId ? state : null;

  return (
    <section className="ops-section">
      <h3 className="ops-eyebrow mb-2">Checked against this farm's records</h3>
      {!current && (
        <p className="text-[12px] text-(--ops-ink-2)" role="status">
          Checking the farm's records
        </p>
      )}
      {current?.error && (
        <p className="text-[11px] text-(--ops-red)" role="alert">
          Farm check unavailable: {current.error}
        </p>
      )}
      {current?.check && (
        <ul className="ops-options">
          {farmCheckLines(current.check).map((line, index) => (
            <li key={`${line.label}-${line.text}-${index}`}>
              <span className={`ops-chip${TONE_CLASS[line.tone]}`}>{TONE_WORD[line.tone]}</span>
              <span>
                <strong>{line.label}</strong> {line.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
