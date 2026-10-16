import type { FleetRow } from './fleetQuery.ts';

interface CsvColumn {
  label: string;
  value: (row: FleetRow) => string | number;
}

export const FLEET_CSV_COLUMNS: readonly CsvColumn[] = [
  { label: 'Field', value: (row) => row.id },
  { label: 'Cooperative', value: (row) => row.coop },
  { label: 'Region', value: (row) => row.region },
  { label: 'Crop', value: (row) => row.crop },
  { label: 'Stage', value: (row) => row.stage },
  { label: 'Day', value: (row) => row.day },
  { label: 'Water now (cm)', value: (row) => row.water },
  { label: 'Lowest ahead (cm)', value: (row) => row.low },
  { label: 'NDVI', value: (row) => row.ndvi },
  { label: 'Area (ha)', value: (row) => row.area },
  { label: 'Status', value: (row) => row.status },
];

function escape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows: readonly FleetRow[]): string {
  const header = FLEET_CSV_COLUMNS.map((column) => column.label).join(',');
  const lines = rows.map((row) => FLEET_CSV_COLUMNS.map((column) => escape(column.value(row))).join(','));
  return `${[header, ...lines].join('\n')}\n`;
}
