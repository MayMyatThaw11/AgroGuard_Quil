import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { virtualWindow, type SortDirection } from '../../lib/fleetQuery.ts';

export interface AqColumn<T> {
  key: string;
  label: string;
  width?: number;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
}

interface AqDataTableProps<T> {
  columns: readonly AqColumn<T>[];
  rows: readonly T[];
  label: string;
  rowKey: (row: T) => string;
  selectedKey: string | null;
  sortKey: string;
  sortDirection: SortDirection;
  rowHeight?: number;
  emptyText: string;
  onSort: (key: string) => void;
  onSelect: (row: T) => void;
}

const OVERSCAN = 6;

export function AqDataTable<T>({
  columns,
  rows,
  label,
  rowKey,
  selectedKey,
  sortKey,
  sortDirection,
  rowHeight = 34,
  emptyText,
  onSort,
  onSelect,
}: AqDataTableProps<T>) {
  const body = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(360);

  useEffect(() => {
    const el = body.current;
    if (!el) return undefined;
    const measure = () => {
      if (el.clientHeight) setViewport(el.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const template = columns.map((column) => (column.width ? `${column.width}px` : 'minmax(0, 1fr)')).join(' ');
  const { start, end } = virtualWindow(scrollTop, viewport, rowHeight, rows.length, OVERSCAN);

  return (
    <div className="aq-table" role="grid" aria-label={label} aria-rowcount={rows.length + 1}>
      <div className="aq-table-head" role="row" style={{ gridTemplateColumns: template }}>
        {columns.map((column) => {
          const active = column.key === sortKey;
          return (
            <button
              key={column.key}
              type="button"
              role="columnheader"
              className={`aq-th ${column.align === 'right' ? 'is-right' : ''}`}
              aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              onClick={() => onSort(column.key)}
            >
              {column.label}
              {active ? sortDirection === 'asc' ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <div ref={body} className="aq-table-body" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <div style={{ height: rows.length * rowHeight }}>
          {rows.slice(start, end).map((row, offset) => {
            const key = rowKey(row);
            return (
              <div
                key={key}
                role="row"
                tabIndex={0}
                aria-rowindex={start + offset + 2}
                aria-selected={key === selectedKey}
                className="aq-table-row"
                style={{ top: (start + offset) * rowHeight, height: rowHeight, gridTemplateColumns: template }}
                onClick={() => onSelect(row)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
              >
                {columns.map((column) => (
                  <div key={column.key} role="gridcell" className={`aq-td ${column.align === 'right' ? 'is-right' : ''}`}>
                    {column.render(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {rows.length === 0 ? <div className="aq-empty">{emptyText}</div> : null}
      </div>
    </div>
  );
}
