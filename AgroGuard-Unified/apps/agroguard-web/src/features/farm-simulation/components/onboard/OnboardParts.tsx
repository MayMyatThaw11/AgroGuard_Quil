import React, { useState } from 'react';
import type { AssetKind, OnboardResult } from '../../lib/api.ts';
import type { SortDirection } from '../../lib/fleetQuery.ts';
import { rejectedRows, type AssetDraft, type RejectedRow } from '../../lib/onboardFiles.ts';
import { svgPaddies, type DemoPaddy } from '../../lib/signinField.ts';
import { AqDataTable, type AqColumn } from '../aq/AqDataTable.tsx';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';

interface FilePickProps {
  id: string;
  label: string;
  hint: string;
  accept: string;
  fileName: string;
  template?: string;
  onPick: (file: File) => void;
  onClear: () => void;
}

export const FilePick: React.FC<FilePickProps> = ({ id, label, hint, accept, fileName, template, onPick, onClear }) => (
  <div className="aq-tw-field">
    <label htmlFor={id} className="aq-field-label">
      {label}
    </label>
    <input
      id={id}
      type="file"
      accept={accept}
      aria-describedby={`${id}-hint`}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) onPick(file);
      }}
    />
    <span id={`${id}-hint`}>
      {fileName ? `Loaded: ${fileName}` : hint}
      {template ? (
        <>
          {' · '}
          <a href={template} download>
            Download the template
          </a>
        </>
      ) : null}
    </span>
    {fileName ? (
      <div>
        <AqButton variant="ghost" onClick={onClear}>
          Remove {fileName}
        </AqButton>
      </div>
    ) : null}
  </div>
);

const PREVIEW_W = 360;
const PREVIEW_H = 200;

export const OutlinePreview: React.FC<{ outlines: DemoPaddy[] | null; kmz: boolean }> = ({ outlines, kmz }) => {
  if (kmz) return <p className="aq-hint">KMZ files are unpacked on the server. Preview after registering.</p>;
  if (!outlines) return null;
  if (!outlines.length) return <p className="aq-hint is-error">No field outlines found in this file. The server will still check it.</p>;
  const shapes = svgPaddies(outlines, PREVIEW_W, PREVIEW_H, 12);
  return (
    <figure className="aq-tw-preview">
      <svg width="100%" viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} role="img" aria-label={`${outlines.length} field outlines`}>
        {shapes.map((shape) => (
          <path key={shape.id} d={shape.d} fill="var(--aq-accent-tint)" stroke="var(--aq-accent)" strokeWidth={1.5} />
        ))}
      </svg>
      <figcaption className="aq-hint">
        {outlines.length} {outlines.length === 1 ? 'outline' : 'outlines'} read from the file
      </figcaption>
    </figure>
  );
};

const KINDS: readonly AssetKind[] = ['pump', 'drone', 'sluice', 'gate'];

export const MachinesEditor: React.FC<{ assets: AssetDraft[]; onChange: (assets: AssetDraft[]) => void }> = ({ assets, onChange }) => {
  const edit = (index: number, patch: Partial<AssetDraft>) => onChange(assets.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  return (
    <div className="aq-tw-list">
      {assets.map((asset, i) => (
        <div key={i} className="aq-tw-row is-wrap">
          <label className="aq-tw-field">
            <span>Machine {i + 1} id</span>
            <input value={asset.id} placeholder="pump-1" onChange={(e) => edit(i, { id: e.target.value })} />
          </label>
          <label className="aq-tw-field">
            <span>Kind</span>
            <select className="aq-tw-select" value={asset.kind} onChange={(e) => edit(i, { kind: e.target.value as AssetKind })}>
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <label className="aq-tw-field">
            <span>Name</span>
            <input value={asset.label} placeholder="North canal pump" onChange={(e) => edit(i, { label: e.target.value })} />
          </label>
          <label className="aq-tw-field">
            <span>Fields it serves (ids, comma separated)</span>
            <input value={asset.serves} placeholder="F1, F2" onChange={(e) => edit(i, { serves: e.target.value })} />
          </label>
          <AqButton variant="ghost" onClick={() => onChange(assets.filter((_, j) => j !== i))}>
            Remove machine {i + 1}
          </AqButton>
        </div>
      ))}
      <div>
        <AqButton onClick={() => onChange([...assets, { id: '', kind: 'pump', label: '', serves: '' }])}>Add a machine</AqButton>
      </div>
    </div>
  );
};

const COLUMNS: readonly AqColumn<RejectedRow>[] = [
  { key: 'file', label: 'File', width: 90, render: (row) => row.file },
  { key: 'line', label: 'Line', width: 64, align: 'right', render: (row) => row.line },
  { key: 'reason', label: 'Why it was rejected', render: (row) => row.reason },
];

type SortKey = 'file' | 'line' | 'reason';

const importLine = (label: string, part: OnboardResult['readings']) =>
  part ? `${label}: ${part.stored} stored, ${part.duplicate} duplicate, ${part.assumed_time} with an assumed time, ${part.rejected.length} rejected` : null;

export const OnboardResultView: React.FC<{ result: OnboardResult }> = ({ result }) => {
  const [sortKey, setSortKey] = useState<SortKey>('line');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [selected, setSelected] = useState<string | null>(null);
  const rows = rejectedRows(result).sort((a, b) => {
    const order = sortKey === 'line' ? a.line - b.line : a[sortKey].localeCompare(b[sortKey]);
    return direction === 'asc' ? order : -order;
  });
  const imports = [importLine('Readings', result.readings), importLine('Inputs', result.inputs)].filter(Boolean);
  const { is_valid: valid, diagnostics } = result.verdict;

  return (
    <div className="aq-tw-list is-body">
      <AqSectionLabel aside={result.farm_id}>Registered</AqSectionLabel>
      <div className="aq-tw-row is-wrap">
        <AqBadge tone={valid ? 'accent' : 'alert'}>{valid ? 'Contract valid' : 'Contract has errors'}</AqBadge>
        <AqBadge tone={result.to_verify ? 'warning' : 'neutral'}>{result.to_verify} TO VERIFY</AqBadge>
      </div>
      {diagnostics.length ? (
        <ul className="aq-tw-list">
          {diagnostics.map((d, i) => (
            <li key={i}>
              {d.severity} {d.code}
              {d.line !== undefined ? ` line ${d.line}` : ''}: {d.message}
            </li>
          ))}
        </ul>
      ) : null}
      {result.notes.length ? (
        <>
          <AqSectionLabel>Notes</AqSectionLabel>
          <ul className="aq-tw-list">
            {result.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </>
      ) : null}
      {imports.map((line) => (
        <p key={line} className="aq-hint">
          {line}
        </p>
      ))}
      {rows.length ? (
        <div style={{ height: 200 }}>
          <AqDataTable<RejectedRow>
            columns={COLUMNS}
            rows={rows}
            label="Rejected rows"
            rowKey={(row) => `${row.file}:${row.line}:${row.reason}`}
            selectedKey={selected}
            sortKey={sortKey}
            sortDirection={direction}
            emptyText="No rows were rejected"
            onSort={(key) => {
              if (key === sortKey) setDirection(direction === 'asc' ? 'desc' : 'asc');
              else {
                setSortKey(key as SortKey);
                setDirection('asc');
              }
            }}
            onSelect={(row) => setSelected(`${row.file}:${row.line}:${row.reason}`)}
          />
        </div>
      ) : null}
    </div>
  );
};
