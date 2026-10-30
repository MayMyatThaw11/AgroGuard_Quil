import React, { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import { acres, centroid, edgeMarks, fieldFacts } from '../../lib/farmview/annotations.ts';
import type { XZ } from '../../lib/fieldsim/localFrame.ts';
import { useT } from '../../lib/i18n.ts';

const MIN_EDGE_M = 14;
const MAX_EDGE_MARKS = 8;
const OFFSET_M = 3.5;
const TICK_M = 1.4;
const LIFT_M = 0.7;
const INK = '#23332b';

export interface AnnotatedField {
  id: string;
  ring: XZ[];
  main: boolean;
  stage: string | null;
}

const fixed = (v: number) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));

const Dimension: React.FC<{ from: XZ; to: XZ; label: string; at: (x: number, z: number) => number }> = ({ from, to, label, at }) => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * TICK_M;
  const nz = (dx / len) * TICK_M;
  const p = (x: number, z: number): [number, number, number] => [x, at(x, z) + LIFT_M, z];
  return (
    <>
      <Line points={[p(...from), p(...to)]} color={INK} lineWidth={1.4} />
      <Line points={[p(from[0] - nx, from[1] - nz), p(from[0] + nx, from[1] + nz)]} color={INK} lineWidth={1.4} />
      <Line points={[p(to[0] - nx, to[1] - nz), p(to[0] + nx, to[1] + nz)]} color={INK} lineWidth={1.4} />
      <Html position={p((from[0] + to[0]) / 2, (from[1] + to[1]) / 2)} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
        <span className="aq-fm-dim">{label}</span>
      </Html>
    </>
  );
};

export const FieldAnnotations: React.FC<{ fields: readonly AnnotatedField[]; groundAt: (x: number, z: number) => number; example: boolean }> = ({ fields, groundAt, example }) => {
  const t = useT();
  const facts = useMemo(
    () => fields.map((f) => ({ field: f, facts: fieldFacts(f.ring), middle: centroid(f.ring), marks: f.main ? edgeMarks(f.ring, MIN_EDGE_M).slice(0, MAX_EDGE_MARKS) : [] })),
    [fields],
  );
  return (
    <group name="field-annotations">
      {facts.map(({ field, facts: f, middle, marks }) => (
        <React.Fragment key={field.id}>
          <Html position={[middle[0], groundAt(middle[0], middle[1]) + 2.2, middle[1]]} center zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`aq-fm-plate ${field.main ? 'is-main' : ''}`}>
              <b>{t('farmMap.farmView.plateArea', { ha: fixed(f.areaHa), ac: fixed(acres(f.areaHa)) })}</b>
              <span>{t('farmMap.farmView.plateSize', { l: Math.round(f.lengthM), w: Math.round(f.widthM) })}</span>
              {field.main ? <small>{t(example ? 'farmMap.farmView.plateIllustrative' : 'farmMap.farmView.plateTraced')}</small> : null}
            </div>
          </Html>
          {marks.map((m, i) => {
            const half = m.lengthM / 2;
            const ux = Math.cos(m.angle);
            const uz = Math.sin(m.angle);
            const o: XZ = [m.outward[0] * OFFSET_M, m.outward[1] * OFFSET_M];
            return <Dimension key={i} from={[m.mid[0] - ux * half + o[0], m.mid[1] - uz * half + o[1]]} to={[m.mid[0] + ux * half + o[0], m.mid[1] + uz * half + o[1]]} label={`${Math.round(m.lengthM)} m`} at={groundAt} />;
          })}
        </React.Fragment>
      ))}
    </group>
  );
};
