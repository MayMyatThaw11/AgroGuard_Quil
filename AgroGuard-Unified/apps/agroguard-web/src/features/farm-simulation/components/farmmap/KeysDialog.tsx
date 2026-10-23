import React from 'react';
import { AqDialog } from '../aq/AqDialog.tsx';
import { useT, type Key, type Translate } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';

const KEYS: readonly (readonly [readonly string[], Key])[] = [
  [['/'], 'farmMap.keys.search'],
  [['Esc'], 'farmMap.keys.clear'],
  [['+', '−'], 'farmMap.keys.zoom'],
  [['farmMap.keys.drag', 'farmMap.keys.rightDrag'], 'farmMap.keys.pan'],
  [['N'], 'farmMap.keys.north'],
  [['H'], 'farmMap.keys.overview'],
  [['S'], 'farmMap.keys.view'],
  [['T'], 'farmMap.keys.terrain'],
  [['R'], 'farmMap.keys.route'],
  [['F'], 'farmMap.keys.field'],
  [['L'], 'farmMap.keys.land'],
  [['['], 'farmMap.keys.layers'],
  [[']'], 'farmMap.keys.details'],
  [['\\'], 'farmMap.keys.panels'],
  [['O'], 'farmMap.keys.offline'],
  [['?'], 'farmMap.keys.list'],
];

const keyText = (t: Translate, k: string) => (k === 'farmMap.keys.drag' || k === 'farmMap.keys.rightDrag' ? t(k) : k);

export const KeysDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  return (
  <AqDialog title={t('farmMap.keys.title')} width={440} onClose={onClose} footer={<AqButton variant="primary" onClick={onClose}>{t('farmMap.common.done')}</AqButton>}>
    <dl className="aq-fm-keys">
      {KEYS.map(([keys, label]) => (
        <React.Fragment key={label}>
          <dt>{keys.map((k) => <kbd key={k} className="aq-kbd">{keyText(t, k)}</kbd>)}</dt>
          <dd>{t(label)}</dd>
        </React.Fragment>
      ))}
    </dl>
  </AqDialog>
  );
};
