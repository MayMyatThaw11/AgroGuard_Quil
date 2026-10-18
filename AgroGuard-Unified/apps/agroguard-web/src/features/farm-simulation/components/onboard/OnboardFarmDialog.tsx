import React, { useEffect, useState } from 'react';
import { getAuthMe, onboardFarm, type OnboardResult } from '../../lib/api.ts';
import { ApiError } from '../../lib/apiError.ts';
import {
  CSV_SUFFIXES,
  OUTLINE_SUFFIXES,
  farmHref,
  farmProblems,
  fileProblem,
  fileProblems,
  geojsonOutlines,
  kmlOutlines,
  missingUnlocks,
  onboardBody,
  onboardErrorText,
  suffix,
  toBase64,
  type OnboardDraft,
} from '../../lib/onboardFiles.ts';
import { activeSession } from '../../lib/session.ts';
import type { DemoPaddy } from '../../lib/signinField.ts';
import { AqDialog } from '../aq/AqDialog.tsx';
import { AqSectionLabel, AqTabs } from '../aq/aqLayout.tsx';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { FilePick, MachinesEditor, OnboardResultView, OutlinePreview } from './OnboardParts.tsx';

type Step = 'farm' | 'outlines' | 'records' | 'register';
type CsvKey = 'fieldsCsv' | 'readingsCsv' | 'inputsCsv';

const STEPS: readonly { value: Step; label: string }[] = [
  { value: 'farm', label: '1 Farm' },
  { value: 'outlines', label: '2 Outlines' },
  { value: 'records', label: '3 Records' },
  { value: 'register', label: '4 Register' },
];

function previewOutlines(name: string, text: string): DemoPaddy[] {
  try {
    return suffix(name) === '.kml' ? kmlOutlines(new DOMParser().parseFromString(text, 'application/xml')) : geojsonOutlines(text);
  } catch {
    return [];
  }
}

const Problems: React.FC<{ items: string[] }> = ({ items }) =>
  items.length ? (
    <ul className="aq-tw-list">
      {items.map((item) => (
        <li key={item} className="aq-hint is-error">
          {item}
        </li>
      ))}
    </ul>
  ) : null;

interface OnboardFarmDialogProps {
  onClose: () => void;
  onDemoPresets: () => void;
}

export const OnboardFarmDialog: React.FC<OnboardFarmDialogProps> = ({ onClose, onDemoPresets }) => {
  const sessionName = activeSession()?.name ?? '';
  const [draft, setDraft] = useState<OnboardDraft>({
    farmId: '',
    name: '',
    country: '',
    utcOffset: '',
    standard: '',
    registeredBy: sessionName,
    boundaries: null,
    fieldsCsv: '',
    readingsCsv: '',
    inputsCsv: '',
    assets: [],
  });
  const [step, setStep] = useState<Step>('farm');
  const [csvNames, setCsvNames] = useState<Record<CsvKey, string>>({ fieldsCsv: '', readingsCsv: '', inputsCsv: '' });
  const [outlines, setOutlines] = useState<DemoPaddy[] | null>(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<OnboardResult | null>(null);

  const update = (patch: Partial<OnboardDraft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    let live = true;
    getAuthMe()
      .then((me) => {
        if (!live) return;
        setDraft((d) => ({ ...d, farmId: d.farmId || me.farms?.[0] || '', registeredBy: d.registeredBy || me.name || '' }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const pickOutlines = async (file: File) => {
    const problem = fileProblem(file.name, file.size, OUTLINE_SUFFIXES);
    setFileError(problem ?? '');
    if (problem) return;
    if (suffix(file.name) === '.kmz') {
      update({ boundaries: { filename: file.name, base64: toBase64(new Uint8Array(await file.arrayBuffer())) } });
      setOutlines(null);
      return;
    }
    const text = await file.text();
    update({ boundaries: { filename: file.name, text } });
    setOutlines(previewOutlines(file.name, text));
  };

  const pickCsv = (key: CsvKey) => async (file: File) => {
    const problem = fileProblem(file.name, file.size, CSV_SUFFIXES);
    setFileError(problem ?? '');
    if (problem) return;
    update({ [key]: await file.text() });
    setCsvNames((names) => ({ ...names, [key]: file.name }));
  };

  const clearCsv = (key: CsvKey) => () => {
    update({ [key]: '' });
    setCsvNames((names) => ({ ...names, [key]: '' }));
  };

  const farmIssues = farmProblems(draft);
  const problems = [...farmIssues, ...fileProblems(draft)];
  const farmId = draft.farmId.trim();
  const stepIndex = STEPS.findIndex((s) => s.value === step);

  const register = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await onboardFarm(farmId, onboardBody(draft)));
    } catch (err) {
      setError(onboardErrorText(err instanceof ApiError ? err.status : null, err instanceof Error ? err.message : String(err), farmId));
    } finally {
      setBusy(false);
    }
  };

  const openFarm = (id: string) => {
    const { pathname, search, hash } = window.location;
    window.location.assign(`${pathname}${farmHref(search, id)}${hash}`);
  };

  const footer = result ? (
    <>
      <AqButton onClick={onClose}>Close</AqButton>
      <AqButton variant="primary" onClick={() => openFarm(result.farm_id)}>
        Open farm
      </AqButton>
    </>
  ) : (
    <>
      <AqButton variant="ghost" style={{ marginRight: 'auto' }} onClick={onDemoPresets}>
        Demo presets
      </AqButton>
      <AqButton onClick={onClose}>Cancel</AqButton>
      {stepIndex > 0 ? <AqButton onClick={() => setStep(STEPS[stepIndex - 1].value)}>Back</AqButton> : null}
      {step === 'register' ? (
        <AqButton variant="primary" disabled={busy || problems.length > 0} onClick={() => void register()}>
          {busy ? 'Registering' : 'Register farm'}
        </AqButton>
      ) : (
        <AqButton variant="primary" onClick={() => setStep(STEPS[stepIndex + 1].value)}>
          Next
        </AqButton>
      )}
    </>
  );

  return (
    <div className="aq-root" style={{ display: 'contents' }}>
      <AqDialog
        title="Bring your farm"
        description="Register your own farm from your files. Only people with access to this farm see its records."
        width={760}
        onClose={onClose}
        footer={footer}
      >
        {result ? (
          <div className="aq-tw-dialog-scroll">
            <OnboardResultView result={result} />
          </div>
        ) : (
          <>
            <AqTabs<Step> value={step} items={STEPS} label="Farm setup steps" onChange={setStep} />
            <div className="aq-tw-dialog-scroll aq-tw-list is-body">
              {fileError ? (
                <div className="aq-alert is-error" role="alert">
                  {fileError}
                </div>
              ) : null}

              {step === 'farm' ? (
                <>
                  <label className="aq-tw-field">
                    <span>Farm id (letters, digits, _ or -)</span>
                    <input value={draft.farmId} placeholder="farm_my_paddies" onChange={(e) => update({ farmId: e.target.value })} />
                  </label>
                  <label className="aq-tw-field">
                    <span>Farm name</span>
                    <input value={draft.name} maxLength={80} onChange={(e) => update({ name: e.target.value })} />
                  </label>
                  <div className="aq-tw-row is-wrap">
                    <label className="aq-tw-field">
                      <span>Country (two letters)</span>
                      <input value={draft.country} maxLength={2} placeholder="MM" onChange={(e) => update({ country: e.target.value.toUpperCase() })} />
                    </label>
                    <label className="aq-tw-field">
                      <span>UTC offset (optional)</span>
                      <input value={draft.utcOffset} placeholder="+06:30" onChange={(e) => update({ utcOffset: e.target.value })} />
                    </label>
                    <label className="aq-tw-field">
                      <span>Standard (optional)</span>
                      <input value={draft.standard} placeholder="ASOA_ORGANIC" onChange={(e) => update({ standard: e.target.value })} />
                    </label>
                  </div>
                  <label className="aq-tw-field">
                    <span>Registered by</span>
                    <input value={draft.registeredBy} readOnly={Boolean(sessionName)} maxLength={80} onChange={(e) => update({ registeredBy: e.target.value })} />
                  </label>
                  <Problems items={farmIssues} />
                </>
              ) : null}

              {step === 'outlines' ? (
                <>
                  <FilePick
                    id="onboard-outlines"
                    label="Field outlines"
                    hint="Google Earth KML or KMZ, or GeoJSON, up to 2 MB. Optional when the field sheet has a latitude and longitude per field."
                    accept={OUTLINE_SUFFIXES.join(',')}
                    fileName={draft.boundaries?.filename ?? ''}
                    onPick={(file) => pickOutlines(file).catch(() => setFileError(`Could not read ${file.name}`))}
                    onClear={() => {
                      update({ boundaries: null });
                      setOutlines(null);
                    }}
                  />
                  <OutlinePreview outlines={outlines} kmz={Boolean(draft.boundaries?.base64)} />
                </>
              ) : null}

              {step === 'records' ? (
                <>
                  <FilePick
                    id="onboard-fields"
                    label="Field sheet"
                    hint="One row per field: crop, planting date and stage. CSV, up to 2 MB."
                    accept=".csv"
                    template="/templates/fields.csv"
                    fileName={csvNames.fieldsCsv}
                    onPick={(file) => pickCsv('fieldsCsv')(file).catch(() => setFileError(`Could not read ${file.name}`))}
                    onClear={clearCsv('fieldsCsv')}
                  />
                  <FilePick
                    id="onboard-readings"
                    label="Water readings (optional)"
                    hint="Water tube readings per field. CSV, up to 2 MB."
                    accept=".csv"
                    template="/templates/readings.csv"
                    fileName={csvNames.readingsCsv}
                    onPick={(file) => pickCsv('readingsCsv')(file).catch(() => setFileError(`Could not read ${file.name}`))}
                    onClear={clearCsv('readingsCsv')}
                  />
                  <FilePick
                    id="onboard-inputs"
                    label="Spray and fertiliser notebook (optional)"
                    hint="One row per spray or fertiliser round. CSV, up to 2 MB."
                    accept=".csv"
                    template="/templates/inputs.csv"
                    fileName={csvNames.inputsCsv}
                    onPick={(file) => pickCsv('inputsCsv')(file).catch(() => setFileError(`Could not read ${file.name}`))}
                    onClear={clearCsv('inputsCsv')}
                  />
                  <AqSectionLabel>Machines (optional)</AqSectionLabel>
                  <MachinesEditor assets={draft.assets} onChange={(assets) => update({ assets })} />
                </>
              ) : null}

              {step === 'register' ? (
                <>
                  <AqSectionLabel>What is still missing</AqSectionLabel>
                  {missingUnlocks(draft).length ? (
                    <ul className="aq-tw-list">
                      {missingUnlocks(draft).map((m) => (
                        <li key={m.item}>
                          <b>{m.item}</b> would unlock: {m.unlocks}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="aq-hint">Nothing. Every file the farm test uses is here.</p>
                  )}
                  <Problems items={problems} />
                  {error ? (
                    <div className="aq-alert is-error" role="alert">
                      {error}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </>
        )}
      </AqDialog>
    </div>
  );
};
