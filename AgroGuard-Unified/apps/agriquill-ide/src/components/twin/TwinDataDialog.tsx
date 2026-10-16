import React, { useState } from 'react';
import { Plug, RefreshCw, Save } from 'lucide-react';
import type { AdapterConfig, TestSummary } from '../../lib/livetwin/twinAdapter.ts';
import { ASSUMPTIONS } from '../../lib/livetwin/twinModels.ts';
import { ENDPOINTS, SCHEMA_DOC, SCHEMA_VERSION } from '../../lib/livetwin/twinSchema.ts';
import type { SourceStatus } from '../../lib/livetwin/twinStore.ts';
import { SPRAY_WIND_LIMIT_KMH } from '../../lib/livetwin/twinWeather.ts';
import { AqDialog } from '../aq/AqDialog.tsx';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqTabs } from '../aq/aqLayout.tsx';
import { minutesAgo } from './twinFormat.ts';
import { useTwin } from './useTwin.ts';

type DataTab = 'sources' | 'issues' | 'model' | 'api';
type Tone = 'accent' | 'water' | 'alert' | 'neutral';

const TONE: Record<SourceStatus['status'], Tone> = { ok: 'accent', loading: 'water', error: 'alert', idle: 'neutral' };

interface SourceRowProps {
  name: string;
  status: SourceStatus;
  what: string;
  extra?: string;
}

const SourceRow: React.FC<SourceRowProps> = ({ name, status, what, extra }) => (
  <div className="aq-tw-source-row">
    <b>{name}</b>
    <AqBadge tone={TONE[status.status]}>{status.status}</AqBadge>
    <span>
      {what}
      {status.count != null && status.of != null ? ` · ${status.count}/${status.of}` : ''}
      {status.at ? ` · ${minutesAgo(status.at)}` : ''}
      {status.cached ? ' (cached)' : ''}
      {status.error ? <span className="aq-tw-alert"> · {status.error}</span> : null}
      {extra ? ` · ${extra}` : ''}
    </span>
  </div>
);

export const TwinDataDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const twin = useTwin();
  const state = twin.store.get();
  const [tab, setTab] = useState<DataTab>('sources');
  const [config, setConfig] = useState<AdapterConfig>(() => twin.adapter.config());
  const [result, setResult] = useState<{ busy?: boolean; error?: string; summary?: TestSummary } | null>(null);
  const src = state.sources;
  const modelDone: SourceStatus = { status: 'ok' };

  const runTest = async () => {
    setResult({ busy: true });
    try {
      setResult({ summary: await twin.adapter.test(config) });
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <AqDialog
      title="Data sources and provenance"
      description="Every number on screen is observed, modelled or demo fixture. This is where each one comes from."
      width={760}
      onClose={onClose}
      footer={<AqButton onClick={onClose}>Close</AqButton>}
    >
      <AqTabs<DataTab>
        value={tab}
        label="Data sources"
        onChange={setTab}
        items={[
          { value: 'sources', label: 'Sources' },
          { value: 'issues', label: `Validation · ${state.issues.length}` },
          { value: 'model', label: 'Model assumptions' },
          { value: 'api', label: 'Connect API' },
        ]}
      />
      <div className="aq-tw-dialog-scroll">
        {tab === 'sources' ? (
          <div>
            <SourceRow name="Farms and fleet" status={src.adapter} what={state.sourceLabel || '—'} extra={src.adapter.machines != null ? `${src.adapter.count} farms, ${src.adapter.machines} machines` : undefined} />
            <SourceRow name="Weather and ET₀" status={src.forecast} what="Open-Meteo forecast API: current conditions, 92 days of daily history and 7-day forecast (rain, Tmax/Tmin, FAO ET₀)" />
            <SourceRow
              name="Season archive"
              status={src.archive}
              what={src.archive.note === 'not needed' ? 'ERA5 via Open-Meteo archive — not needed, all seasons inside the 92-day window' : 'ERA5 reanalysis via Open-Meteo archive, for seasons older than 92 days'}
            />
            <SourceRow name="Soil moisture" status={src.soilMoisture} what="Open-Meteo hourly model, 0–1, 3–9, 9–27 cm (model output, not probes)" />
            <SourceRow name="Elevation" status={src.elevation} what="Open-Meteo elevation API (Copernicus DEM 90 m)" />
            <SourceRow name="Soil properties" status={src.soilgrids} what="ISRIC SoilGrids 250 m: pH, clay, sand, silt, organic carbon — loaded per farm on demand" extra={`${src.soilgrids.loaded ?? 0} farms cached`} />
            <SourceRow name="Water depth" status={modelDone} what="Model: daily water balance per paddy. No field gauges connected (schema field paddy.sensor)" />
            <SourceRow name="Crop stage" status={modelDone} what="Model: growing degree days since transplant date" />
            <SourceRow name="NDVI" status={{ status: 'idle' }} what="Not connected — Sentinel-2 needs an API key. Shown as no data rather than estimated" />
            <SourceRow name="Machine positions" status={{ status: state.source === 'api' ? 'ok' : 'idle' }} what={state.source === 'api' ? 'From your API /tasks' : 'Simulated from planned tasks on the sim clock (fixture mode)'} />
            <SourceRow name="Site GIS" status={modelDone} what="OpenStreetMap via Overpass (water, forest, coast, settlements, protected areas) · Copernicus 90 m DEM slope via Open-Meteo · cached 30 days" />
            <div className="aq-tw-row aq-tw-pad">
              <AqButton variant="secondary" onClick={() => void twin.store.reload()}>
                <RefreshCw size={14} aria-hidden="true" />
                Refetch all weather now
              </AqButton>
            </div>
          </div>
        ) : tab === 'issues' ? (
          state.issues.length ? (
            state.issues.map((issue, i) => (
              <div key={i} className="aq-tw-issue-row">
                <AqBadge tone={issue.level === 'error' ? 'alert' : 'warning'}>{issue.level}</AqBadge>
                <code>{issue.path}</code>
                <span>{issue.msg}</span>
              </div>
            ))
          ) : (
            <p className="aq-tw-caption">
              All {state.farms.length} farms and {state.machines.length} machines passed schema v{SCHEMA_VERSION} validation.
            </p>
          )
        ) : tab === 'model' ? (
          <ul className="aq-tw-list is-body">
            {ASSUMPTIONS.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
            <li>
              Guard rails hold spraying above {SPRAY_WIND_LIMIT_KMH} km/h wind or in rain (the 5.5 m/s hard halt applies even when guards are overridden), sprinklers in rain, flooding ripening
              paddies, draining at panicle initiation to heading, tilling or harvesting standing crop.
            </li>
          </ul>
        ) : (
          <div className="aq-tw-api">
            <AqTabs<AdapterConfig['mode']>
              value={config.mode}
              label="Data source"
              onChange={(mode) => setConfig({ ...config, mode })}
              items={[
                { value: 'fixture', label: 'Demo fixture' },
                { value: 'api', label: 'Your API' },
              ]}
            />
            {config.mode === 'api' ? (
              <>
                <label className="aq-tw-field">
                  <span>Base URL</span>
                  <input value={config.baseUrl} placeholder="http://127.0.0.1:8000/api/v1/agriquill" onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} />
                </label>
                <label className="aq-tw-field">
                  <span>Bearer token (optional, kept in this browser only)</span>
                  <input type="password" value={config.token} onChange={(e) => setConfig({ ...config, token: e.target.value })} />
                </label>
                <div className="aq-tw-row">
                  <AqButton variant="secondary" disabled={!config.baseUrl || result?.busy} onClick={() => void runTest()}>
                    <Plug size={14} aria-hidden="true" />
                    Test connection
                  </AqButton>
                  {result && !result.busy ? (
                    <span className={result.error ? 'aq-tw-alert' : 'aq-tw-good'}>
                      {result.error ?? `${result.summary?.farms} farms, ${result.summary?.machines} machines valid · ${result.summary?.errors} errors, ${result.summary?.warnings} warnings`}
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="aq-tw-caption is-flush">Generated farms near real ASEAN rice towns, so every live data source can be exercised. Labelled “Demo fixture” throughout.</p>
            )}
            <div>
              <p className="aq-eyebrow">Schema v{SCHEMA_VERSION} · endpoints</p>
              {ENDPOINTS.map(([method, path, note]) => (
                <div key={path} className="aq-tw-endpoint">
                  <b>{method}</b>
                  <code>{path}</code>
                  <span className="aq-tw-faint">{note}</span>
                </div>
              ))}
              {(['Farm', 'Paddy', 'Machine', 'Task'] as const).map((name) => (
                <div key={name} className="aq-tw-schema">
                  <p className="aq-tw-schema-title">{name}</p>
                  {SCHEMA_DOC[name].map(([field, type, required]) => (
                    <div key={field} className="aq-tw-schema-row">
                      <code>{field}</code>
                      <span>{type}</span>
                      <span className={required ? 'aq-tw-good' : 'aq-tw-faint'}>{required ? 'required' : 'optional'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="aq-tw-row is-end">
              <AqButton
                variant="primary"
                onClick={() => {
                  twin.adapter.configure(config);
                  window.location.reload();
                }}
              >
                <Save size={14} aria-hidden="true" />
                Save and reload
              </AqButton>
            </div>
          </div>
        )}
      </div>
    </AqDialog>
  );
};
