import React from 'react';
import type { LegendSpec } from '../../lib/farmmap/farmMapLegendTheme.ts';
import { useT } from '../../lib/i18n.ts';
import { gradientStyle, tintStyle } from './tint.ts';

export const FarmMapLegend: React.FC<{ spec: LegendSpec }> = ({ spec }) => {
  const t = useT();
  if (spec.gradient && spec.labels) {
    return (
      <div className="aq-fm-ramp">
        <span>{spec.labels[0]}</span>
        <span className="aq-fm-ramp-bar" style={gradientStyle(spec.gradient)} role="img" aria-label={t('farmMap.legend.scale', { from: spec.labels[0], to: spec.labels[1] })} />
        <span>{spec.labels[1]}{spec.unit ? ` ${spec.unit}` : ''}</span>
      </div>
    );
  }
  return (
    <div className="aq-fm-swatches">
      {spec.items?.map((item) => (
        <span key={item.label} className="aq-fm-swatch-item">
          <i className="aq-fm-swatch" style={tintStyle(item.tint)} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
};
