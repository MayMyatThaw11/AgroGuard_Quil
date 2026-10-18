import React, { useRef, useState } from 'react';
import { Sprout, ScanLine, LocateFixed, Upload, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import {
  detectDisease, explainCrop, locationWeather, suggestCrops,
  type CropConditions, type CropSuggestion, type DiseaseResult, type Lang,
} from '../../lib/agroguard';
import { writeErrorText } from '../../lib/apiError';
import { PLANT_GROUPS } from '../../lib/plantGroups';

type Tab = 'crop' | 'disease';

const card = 'rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] p-4';
const label = 'block text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] mb-1';
const input = 'w-full rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-1.5 text-sm text-[var(--text-primary)]';
const primaryBtn = 'inline-flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50';
const ghostBtn = 'inline-flex items-center gap-1.5 rounded border border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-base)] disabled:opacity-50';

const ErrorLine: React.FC<{ text: string }> = ({ text }) => (
  <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-[var(--status-error)]">
    <AlertTriangle className="w-4 h-4" aria-hidden="true" />{text}
  </p>
);

const List: React.FC<{ title: string; items: string[] }> = ({ title, items }) =>
  items.length === 0 ? null : (
    <div className="mt-3">
      <h4 className="text-xs font-semibold text-[var(--text-secondary)]">{title}</h4>
      <ul className="mt-1 list-disc pl-5 text-sm text-[var(--text-primary)] space-y-0.5">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );

const numValue = (n: number) => (Number.isNaN(n) ? '' : n);
// Zero means the dataset has no figure for this crop, so show a dash rather than 0.
const money = (n: number | undefined) => (n && n > 0 ? n.toLocaleString() : '—');

const CropPanel: React.FC<{ lang: Lang }> = ({ lang }) => {
  const [cond, setCond] = useState<CropConditions>({ soilPh: 6.5, rainfallMm: 120, temperatureC: 28 });
  const [result, setResult] = useState<CropSuggestion | null>(null);
  const [picked, setPicked] = useState(0);
  const [region, setRegion] = useState('');
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState<'' | 'locate' | 'suggest' | 'explain'>('');
  const [error, setError] = useState('');

  const set = (key: keyof CropConditions) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCond((c) => ({ ...c, [key]: e.target.value === '' ? Number.NaN : Number(e.target.value) }));

  const locate = () => {
    if (!navigator.geolocation) { setError('This browser cannot share its location.'); return; }
    setBusy('locate'); setError('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const w = await locationWeather(coords.latitude, coords.longitude, lang);
          setCond({ soilPh: w.current.soil_pH_estimate, rainfallMm: w.current.rainfall_7d_mm, temperatureC: w.current.temperature_c });
          setRegion(lang === 'my' ? w.region.name_my : w.region.name_en);
        } catch (err) { setError(writeErrorText(err, 'Could not load weather for this location.')); }
        finally { setBusy(''); }
      },
      () => { setError('Location permission was denied.'); setBusy(''); },
    );
  };

  const suggest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.values(cond).some((v) => !Number.isFinite(v))) { setError('Enter a number in every field.'); return; }
    setBusy('suggest'); setError(''); setResult(null); setExplanation('');
    try {
      const r = await suggestCrops(cond, lang);
      setResult(r); setPicked(0);
    } catch (err) { setError(writeErrorText(err, 'Unable to get a crop suggestion.')); }
    finally { setBusy(''); }
  };

  const explain = async () => {
    if (!result) return;
    setBusy('explain'); setError(''); setExplanation('');
    try { await explainCrop(cond, result.recommendations[picked].crop, lang, setExplanation); }
    catch (err) { setError(writeErrorText(err, 'The AI explanation is unavailable.')); }
    finally { setBusy(''); }
  };

  const chosen = result?.recommendations[picked];

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <form onSubmit={suggest} className={card} aria-label="Crop conditions">
        <div className="space-y-3">
          <div><label className={label} htmlFor="ag-ph">Soil pH</label>
            <input id="ag-ph" className={input} type="number" step="0.1" min={0} max={14} value={numValue(cond.soilPh)} onChange={set('soilPh')} /></div>
          <div><label className={label} htmlFor="ag-rain">Rainfall (mm)</label>
            <input id="ag-rain" className={input} type="number" step="1" min={0} value={numValue(cond.rainfallMm)} onChange={set('rainfallMm')} /></div>
          <div><label className={label} htmlFor="ag-temp">Temperature (°C)</label>
            <input id="ag-temp" className={input} type="number" step="0.5" min={-50} max={70} value={numValue(cond.temperatureC)} onChange={set('temperatureC')} /></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" className={primaryBtn} disabled={busy !== ''}>
            {busy === 'suggest' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}Suggest crops
          </button>
          <button type="button" className={ghostBtn} onClick={locate} disabled={busy !== ''}>
            {busy === 'locate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}Use my location
          </button>
        </div>
        {region && <p className="mt-2 text-xs text-[var(--text-tertiary)]">Filled from live weather near {region}.</p>}
        {error && <ErrorLine text={error} />}
      </form>

      <section className={card} aria-live="polite">
        {!chosen ? (
          <p className="text-sm text-[var(--text-tertiary)]">Enter field conditions, or use your location, to see ranked crop matches.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Recommended crops">
              {result!.recommendations.map((r, i) => (
                <button key={r.cropKey} type="button" role="tab" aria-selected={i === picked}
                  onClick={() => { setPicked(i); setExplanation(''); }}
                  className={`rounded border px-3 py-1 text-sm ${i === picked ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border-default)] text-[var(--text-secondary)]'}`}>
                  {r.crop} · {Math.round(r.suitabilityPercent)}%
                </button>
              ))}
            </div>
            <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{chosen.crop}</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{chosen.description}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-[var(--text-primary)] sm:grid-cols-4">
              <div><dt className={label}>Price</dt><dd>{money(chosen.marketPriceMmkPerKg)} MMK/kg</dd></div>
              <div><dt className={label}>Per viss</dt><dd>{money(chosen.priceMmkPerViss)} MMK</dd></div>
              <div><dt className={label}>Yield</dt><dd>{money(chosen.yieldPerAcreKg)} kg/acre</dd></div>
              <div><dt className={label}>Revenue</dt><dd>{chosen.estGrossRevenueUsdPerHa > 0 ? `$${money(chosen.estGrossRevenueUsdPerHa)}/ha` : '—'}</dd></div>
            </dl>
            {chosen.priceSource && (
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                Price source: {chosen.priceSource}{chosen.priceUsdPerKg > 0 && ` · about $${chosen.priceUsdPerKg.toFixed(2)}/kg`}
              </p>
            )}
            <div className="mt-4">
              <button type="button" className={ghostBtn} onClick={explain} disabled={busy !== ''}>
                {busy === 'explain' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Explain with AI
              </button>
              {explanation && <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{explanation}</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

const DiseasePanel: React.FC<{ lang: Lang }> = ({ lang }) => {
  const [groupId, setGroupId] = useState(PLANT_GROUPS[0].id);
  const [cropName, setCropName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState<DiseaseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const group = PLANT_GROUPS.find((g) => g.id === groupId) ?? PLANT_GROUPS[0];

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(f ? URL.createObjectURL(f) : ''); setResult(null); setError('');
  };

  const pickGroup = (id: string) => { setGroupId(id); setCropName(''); setResult(null); };

  const analyse = async () => {
    if (!file) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await detectDisease(file, groupId, cropName, lang));
    } catch (err) { setError(writeErrorText(err, 'Disease detection failed.')); }
    finally { setBusy(false); }
  };

  // healthStatus is translated in Burmese mode, so read the untranslated
  // class name: the service rejects non-plant photos with a Not_A_Plant /
  // background class, and healthy classes end in "Healthy".
  const raw = result?.rawClassName ?? '';
  const invalid = raw === '00_Background_Non_Plant' || raw.includes('Not_A_Plant');
  const healthy = /healthy$/i.test(raw);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className={card}>
        <label className={label} htmlFor="ag-group">Plant group</label>
        <select id="ag-group" className={input} value={groupId} onChange={(e) => pickGroup(e.target.value)}>
          {PLANT_GROUPS.map((g, i) => <option key={g.id} value={g.id}>{i + 1}. {g.name[lang]}</option>)}
        </select>
        <label className={`${label} mt-3`} htmlFor="ag-crop">Crop (optional)</label>
        <select id="ag-crop" className={input} value={cropName} onChange={(e) => { setCropName(e.target.value); setResult(null); }}>
          <option value="">All crops in this group</option>
          {group.crops.map((c) => <option key={c.id} value={c.id}>{c[lang]}</option>)}
        </select>
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">{group.tip[lang]}</p>

        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} aria-label="Plant photo" />
        <button type="button" className={`${ghostBtn} mt-3`} onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4" />Choose plant photo</button>
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">JPG, PNG or WEBP, up to 8 MB.</p>
        {preview && <img src={preview} alt="Selected plant" className="mt-3 max-h-56 w-full rounded object-contain bg-[var(--surface-base)]" />}
        <button type="button" className={`${primaryBtn} mt-3`} onClick={analyse} disabled={!file || busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}Analyse
        </button>
        {error && <ErrorLine text={error} />}
      </div>

      <section className={card} aria-live="polite">
        {!result ? (
          <p className="text-sm text-[var(--text-tertiary)]">
            Pick the plant group, then upload a photo. Five group models cover 25 ASEAN crops, including rice, corn, coffee, mango, tomato and chili.
          </p>
        ) : invalid ? (
          <>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Photo not recognised</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              The model could not find a clear plant from this group in the photo. Check the plant group, then retake a close, in-focus photo.
            </p>
            <List title="Tips" items={result.treatmentRecommendations} />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{result.plantName}</h3>
              <span className={`text-sm font-medium ${healthy ? 'text-[var(--accent)]' : 'text-[var(--status-error)]'}`}>
                {healthy ? result.healthStatus : result.detectedDisease}
              </span>
            </div>
            {result.scientificName && <p className="text-xs italic text-[var(--text-tertiary)]">{result.scientificName}</p>}
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-[var(--text-primary)] sm:grid-cols-4">
              <div><dt className={label}>Health</dt><dd>{result.healthScore}/100</dd></div>
              <div><dt className={label}>Confidence</dt><dd>{Math.round(result.confidenceScore)}%</dd></div>
              <div><dt className={label}>Severity</dt><dd>{result.diseaseSeverity || '—'}</dd></div>
              <div><dt className={label}>Affected area</dt><dd>{result.estimatedAffectedArea || '—'}</dd></div>
            </dl>
            {result.confidenceScore < 60 && (
              <p className="mt-2 text-sm text-[var(--status-warning,var(--text-secondary))]">
                Low confidence. Treat this as a guess and retake the photo closer and in better light.
              </p>
            )}
            <List title="Visible symptoms" items={result.visibleSymptoms} />
            <List title="Possible causes" items={result.possibleCauses} />
            <List title="Treatment" items={result.treatmentRecommendations} />
            <List title="Prevention" items={result.preventionRecommendations} />
            <p className="mt-4 text-xs text-[var(--text-tertiary)]">A model estimate from one photo. Confirm with an agronomist before treating a whole field.</p>
          </>
        )}
      </section>
    </div>
  );
};

export const AgronomyView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('crop');
  const [lang, setLang] = useState<Lang>('en');
  const tabs: ReadonlyArray<{ id: Tab; text: string }> = [
    { id: 'crop', text: 'Crop suggestion' },
    { id: 'disease', text: 'Disease detection' },
  ];
  return (
    <div className="h-full overflow-auto p-4 bg-[var(--surface-base)]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Agronomy</h2>
            <p className="text-xs text-[var(--text-tertiary)]">Powered by the AgroGuard models</p>
          </div>
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label="Agronomy tools" className="flex gap-1">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                  className={`rounded px-3 py-1.5 text-sm ${tab === t.id ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'}`}>
                  {t.text}
                </button>
              ))}
            </div>
            <select aria-label="Result language" className={`${input} !w-auto`} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="en">English</option>
              <option value="my">မြန်မာ</option>
            </select>
          </div>
        </header>
        {tab === 'crop' ? <CropPanel lang={lang} /> : <DiseasePanel lang={lang} />}
      </div>
    </div>
  );
};
