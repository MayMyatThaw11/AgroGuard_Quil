import React, { useMemo, useState } from 'react';
import { formatCm, sortRows, type FleetRow, type SortDirection, type SortKey } from '../../lib/fleetQuery.ts';
import { AqDataTable, type AqColumn } from '../aq/AqDataTable.tsx';
import { AqStatusDot } from '../aq/aqLayout.tsx';

interface FleetTableProps {
  rows: readonly FleetRow[];
  selectedId: string | null;
  safeDepthCm: number;
  onSelect: (id: string) => void;
}

const STATUS_LABEL: Record<FleetRow['status'], string> = { ok: 'On track', watch: 'Watch', alert: 'Alert', offline: 'Offline' };

export const FleetTable: React.FC<FleetTableProps> = ({ rows, selectedId, safeDepthCm, onSelect }) => {
  const [sortKey, setSortKey] = useState<string>('low');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const sorted = useMemo(() => sortRows(rows, sortKey as SortKey, direction), [rows, sortKey, direction]);

  const columns: AqColumn<FleetRow>[] = [
    { key: 'id', label: 'Field', width: 84, render: (row) => <strong>{row.id}</strong> },
    { key: 'coop', label: 'Cooperative', width: 140, render: (row) => row.coop },
    { key: 'region', label: 'Region', width: 96, render: (row) => row.region },
    {
      key: 'crop',
      label: 'Crop · stage',
      render: (row) => (
        <span title={`${row.crop} · ${row.stage}`}>
          {row.crop} <span className="aq-muted">· {row.stage}</span>
        </span>
      ),
    },
    { key: 'water', label: 'Water now', align: 'right', width: 90, render: (row) => formatCm(row.water) },
    {
      key: 'low',
      label: 'Lowest ahead',
      align: 'right',
      width: 104,
      render: (row) => <span className={row.low < safeDepthCm ? 'aq-strong-alert' : ''}>{formatCm(row.low)}</span>,
    },
    { key: 'ndvi', label: 'NDVI', align: 'right', width: 56, render: (row) => row.ndvi.toFixed(2) },
    {
      key: 'status',
      label: 'Status',
      width: 92,
      render: (row) => (
        <>
          <AqStatusDot status={row.status} />
          {STATUS_LABEL[row.status]}
        </>
      ),
    },
  ];

  return (
    <div className="aq-pane aq-pane-pad">
      <AqDataTable
        columns={columns}
        rows={sorted}
        label="Fields"
        rowKey={(row) => row.id}
        selectedKey={selectedId}
        sortKey={sortKey}
        sortDirection={direction}
        emptyText="No fields match these filters."
        onSort={(key) => {
          if (key === sortKey) setDirection(direction === 'asc' ? 'desc' : 'asc');
          else {
            setSortKey(key);
            setDirection('asc');
          }
        }}
        onSelect={(row) => onSelect(row.id)}
      />
    </div>
  );
};
