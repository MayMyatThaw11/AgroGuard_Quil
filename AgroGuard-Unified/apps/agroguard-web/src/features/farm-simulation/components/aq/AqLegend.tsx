import React from 'react';

interface SwatchItem {
  tone: 'ok' | 'watch' | 'alert' | 'offline';
  label: string;
  count: number;
}

interface AqLegendProps {
  items?: readonly SwatchItem[];
  ramp?: { kind: 'water' | 'ndvi'; labels: [string, string]; unit: string };
}

export const AqLegend: React.FC<AqLegendProps> = ({ items, ramp }) => (
  <div className="aq-legend">
    {items?.map((item) => (
      <span key={item.tone} className="aq-legend-item">
        <span className={`aq-legend-swatch is-${item.tone}`} aria-hidden="true" />
        {item.label} {item.count.toLocaleString()}
      </span>
    ))}
    {ramp ? (
      <>
        <span>{ramp.labels[0]}</span>
        <span className={`aq-legend-ramp is-${ramp.kind}`} role="img" aria-label={`${ramp.unit} colour scale from ${ramp.labels[0]} to ${ramp.labels[1]}`} />
        <span>
          {ramp.labels[1]} {ramp.unit}
        </span>
      </>
    ) : null}
  </div>
);
