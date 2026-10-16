import React, { useState } from 'react';
import { Bird, Fish, PawPrint, Plus, Shell } from 'lucide-react';
import type { Herd, HerdKind } from '../../data/ops/types.ts';
import { addHerd } from '../../lib/api.ts';
import { writeErrorText } from '../../lib/apiError.ts';
import { useT, type Key, type Translate } from '../../lib/i18n.ts';
import type { QueuedItem } from '../../lib/fieldQueue.ts';
import { newId } from '../../lib/useFieldQueue.ts';

const KINDS: { id: HerdKind; label: Key }[] = [
  { id: 'fish', label: 'herd.kind.fish' },
  { id: 'shrimp', label: 'herd.kind.shrimp' },
  { id: 'ducks', label: 'herd.kind.ducks' },
  { id: 'poultry', label: 'herd.kind.poultry' },
  { id: 'buffalo', label: 'herd.kind.buffalo' },
  { id: 'cattle', label: 'herd.kind.cattle' },
  { id: 'goats', label: 'herd.kind.goats' },
];

const ICON: Record<HerdKind, typeof Fish> = {
  fish: Fish,
  shrimp: Shell,
  ducks: Bird,
  poultry: Bird,
  buffalo: PawPrint,
  cattle: PawPrint,
  goats: PawPrint,
};

const METRICS = [
  { id: 'head_count', unit: 'head', max: 1_000_000 },
  { id: 'feed_kg', unit: 'kg', max: 100_000 },
  { id: 'mortality', unit: 'head', max: 1_000_000 },
  { id: 'dissolved_oxygen_mg_l', unit: 'mg/L', max: 20, aquatic: true },
  { id: 'water_temp_c', unit: '°C', max: 45, aquatic: true },
] as const;

type MetricId = (typeof METRICS)[number]['id'];

const metricLabel = (t: Translate, id: MetricId) => t(`herd.metric.${id}`);
const unitLabel = (t: Translate, unit: string) => (unit === 'head' ? t('herd.head') : unit);

function HerdLog({ herd, reporter, onQueue }: { herd: Herd; reporter: string; onQueue: (item: QueuedItem) => void }) {
  const t = useT();
  const aquatic = herd.kind === 'fish' || herd.kind === 'shrimp';
  const options = METRICS.filter((m) => !('aquatic' in m) || aquatic);
  const [metric, setMetric] = useState<MetricId>(options[0].id);
  const [value, setValue] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const spec = options.find((m) => m.id === metric) ?? options[0];
  const number = Number(value);
  const ok = value.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= spec.max && reporter.trim() !== '';

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ok) return;
    const observedAt = new Date().toISOString();
    onQueue({
      id: newId(),
      kind: 'reading',
      queuedAt: observedAt,
      body: { device_id: `herd:${herd.id}`, observed_at: observedAt, values: { [metric]: number }, reporter: reporter.trim() },
    });
    setNote(t('herd.saved', { metric: metricLabel(t, spec.id), value: number, unit: unitLabel(t, spec.unit) }));
    setValue('');
  };

  return (
    <form className="mt-2 space-y-2" onSubmit={submit} aria-label={t('herd.logFor', { id: herd.id })}>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('herd.what')}>
        {options.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`ops-btn ${metric === m.id ? 'is-primary' : ''}`}
            aria-pressed={metric === m.id}
            onClick={() => setMetric(m.id)}
          >
            {metricLabel(t, m.id)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="flex-1 text-[11px] text-(--ops-ink-2)">
          {metricLabel(t, spec.id)} ({unitLabel(t, spec.unit)})
          <input
            className="ops-input mt-1"
            type="number"
            inputMode="decimal"
            min={0}
            max={spec.max}
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button type="submit" className="ops-btn is-primary self-end" disabled={!ok}>
          {t('herd.log')}
        </button>
      </div>
      {!reporter.trim() && <p className="text-[11px] text-(--ops-amber)">{t('herd.nameFirst')}</p>}
      {note && (
        <p className="text-[11px] text-(--ops-green-deep)" role="status">
          {note}
        </p>
      )}
    </form>
  );
}

function AddHerd({
  farmId,
  paddyIds,
  reporter,
  onAdded,
}: {
  farmId: string;
  paddyIds: string[];
  reporter: string;
  onAdded: () => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<HerdKind>('fish');
  const [species, setSpecies] = useState('');
  const [count, setCount] = useState('');
  const [paddy, setPaddy] = useState('');
  const [minWater, setMinWater] = useState('');
  const [minOxygen, setMinOxygen] = useState('');
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: string | null }>({
    busy: false,
    error: null,
    done: null,
  });
  const aquatic = kind === 'fish' || kind === 'shrimp';
  const n = Number(count);
  const ready = Number.isInteger(n) && n > 0 && reporter.trim() !== '' && (!aquatic || !paddy || minWater.trim() !== '');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setState({ busy: true, error: null, done: null });
    const id = `${kind.toUpperCase()}-${(paddy || 'FARM').replace(/[^A-Za-z0-9]/g, '')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    try {
      await addHerd(farmId, {
        id,
        kind,
        count: n,
        added_by: reporter.trim(),
        ...(species.trim() ? { species: species.trim() } : {}),
        ...(paddy ? { paddy } : {}),
        ...(minWater.trim() ? { min_water_cm: Number(minWater) } : {}),
        ...(minOxygen.trim() ? { min_oxygen_mg_l: Number(minOxygen) } : {}),
      });
      setState({ busy: false, error: null, done: t('herd.added', { id }) });
      setCount('');
      setSpecies('');
      onAdded();
    } catch (err) {
      setState({ busy: false, error: writeErrorText(err, 'could not add'), done: null });
    }
  };

  return (
    <form className="mt-3 space-y-2 border-t border-(--ops-line) pt-3" onSubmit={submit} aria-label={t('herd.add')}>
      <p className="text-[11px] font-semibold">{t('herd.add')}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('herd.kindGroup')}>
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`ops-btn ${kind === k.id ? 'is-primary' : ''}`}
            aria-pressed={kind === k.id}
            onClick={() => setKind(k.id)}
          >
            {t(k.label)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-(--ops-ink-2)">
          {t('herd.howMany')}
          <input className="ops-input mt-1" type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <label className="text-[11px] text-(--ops-ink-2)">
          {t('herd.where')}
          <select className="ops-input mt-1" value={paddy} onChange={(e) => setPaddy(e.target.value)}>
            <option value="">{t('herd.wholeFarm')}</option>
            {paddyIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-(--ops-ink-2)">
          {t('herd.species')}
          <input className="ops-input mt-1" type="text" maxLength={60} value={species} onChange={(e) => setSpecies(e.target.value)} />
        </label>
        {aquatic && (
          <label className="text-[11px] text-(--ops-ink-2)">
            {t('herd.minWater')}{paddy ? ' *' : ''}
            <input className="ops-input mt-1" type="number" step="0.5" min={-40} max={30} value={minWater} onChange={(e) => setMinWater(e.target.value)} />
          </label>
        )}
        {aquatic && (
          <label className="text-[11px] text-(--ops-ink-2)">
            {t('herd.minOxygen')}
            <input className="ops-input mt-1" type="number" step="0.1" min={0} max={20} value={minOxygen} onChange={(e) => setMinOxygen(e.target.value)} />
          </label>
        )}
      </div>
      {aquatic && paddy && (
        <p className="text-[11px] text-(--ops-ink-3)">
          {t('herd.aquaticNote')}
        </p>
      )}
      <button type="submit" className="ops-btn is-primary w-full" disabled={!ready || state.busy}>
        <Plus className="w-3.5 h-3.5" /> {state.busy ? t('herd.adding') : t('herd.addToContract')}
      </button>
      {state.error && <p className="text-[11px] text-(--ops-red)" role="alert">{state.error}</p>}
      {state.done && <p className="text-[11px] text-(--ops-green-deep)" role="status">{state.done}</p>}
    </form>
  );
}

export const HerdPanel: React.FC<{
  farmId: string;
  herds: Herd[];
  paddyIds: string[];
  reporter: string;
  canAdd: boolean;
  onQueue: (item: QueuedItem) => void;
  onChanged: () => void;
  readOnly?: boolean;
}> = ({ farmId, herds, paddyIds, reporter, canAdd, onQueue, onChanged, readOnly = false }) => {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      {herds.length === 0 && <p className="text-[12px] text-(--ops-ink-3)">{t('herd.none')}</p>}
      <ul className="space-y-2">
        {herds.map((herd) => {
          const Icon = ICON[herd.kind] ?? PawPrint;
          const oxygen = herd.latest.dissolved_oxygen_mg_l;
          const feed = herd.latest.feed_kg;
          return (
            <li key={herd.id} className="ops-task">
              <button type="button" className="w-full text-left" aria-expanded={open === herd.id} onClick={() => setOpen(open === herd.id ? null : herd.id)}>
                <div className="flex items-center gap-2">
                  <span className="ops-avatar" style={{ background: 'var(--ops-agent-water)' }}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[13px] font-bold">{herd.count_now ?? '—'}</span>
                  <span className="flex-1 text-[12px] text-(--ops-ink-2)">
                    {herd.species ?? t(`herd.kind.${herd.kind}`)} · {herd.paddy ?? t('herd.wholeFarm')}
                  </span>
                  {herd.alerts.length > 0 ? <span className="ops-chip is-red">{t('herd.checkNow')}</span> : <span className="ops-chip is-green">{t('herd.ok')}</span>}
                </div>
                <p className="mt-1 text-[11px] text-(--ops-ink-3)">
                  {[
                    oxygen ? t('herd.oxygen', { v: oxygen.value }) : null,
                    feed ? t('herd.feed', { v: feed.value }) : null,
                    herd.min_water_cm !== undefined ? t('herd.keptAbove', { v: herd.min_water_cm }) : null,
                    t('herd.noSpray'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {herd.alerts.map((a) => (
                  <p key={a} className="mt-1 text-[12px] font-semibold text-(--ops-red)">
                    {a}
                  </p>
                ))}
              </button>
              {open === herd.id &&
                (readOnly ? (
                  <p className="mt-2 text-[11px] text-(--ops-amber)">{t('prop.signIn')}</p>
                ) : (
                  <HerdLog herd={herd} reporter={reporter} onQueue={onQueue} />
                ))}
            </li>
          );
        })}
      </ul>
      {canAdd && !readOnly && <AddHerd farmId={farmId} paddyIds={paddyIds} reporter={reporter} onAdded={onChanged} />}
      {canAdd && readOnly && <p className="mt-3 text-[11px] text-(--ops-amber)">{t('prop.signIn')}</p>}
    </div>
  );
};
