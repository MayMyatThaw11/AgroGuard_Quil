import React from 'react';
import { AqDialog } from '../aq/AqDialog.tsx';
import { AqButton } from '../aq/aqPrimitives.tsx';

const KEYS: readonly (readonly [readonly string[], string])[] = [
  [['/'], 'Search farms, towns, markets'],
  [['Esc'], 'Clear selection, route or search'],
  [['+', '−'], 'Zoom in / out'],
  [['Drag', 'Right-drag'], 'Pan · rotate and tilt'],
  [['N'], 'Reset north and tilt'],
  [['H'], 'ASEAN overview'],
  [['S'], 'Map / satellite'],
  [['T'], '3D terrain'],
  [['R'], 'Route from the selected farm'],
  [['F'], 'Open the selected rice farm in the field monitor'],
  [['L'], 'What fits the land at the map centre'],
  [['['], 'Hide or show layers'],
  [[']'], 'Hide or show details'],
  [['\\'], 'Hide or show both panels'],
  [['O'], 'Simulate offline'],
  [['?'], 'This list'],
];

export const KeysDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <AqDialog title="Keyboard and mouse" width={440} onClose={onClose} footer={<AqButton variant="primary" onClick={onClose}>Done</AqButton>}>
    <dl className="aq-fm-keys">
      {KEYS.map(([keys, label]) => (
        <React.Fragment key={label}>
          <dt>{keys.map((k) => <kbd key={k} className="aq-kbd">{k}</kbd>)}</dt>
          <dd>{label}</dd>
        </React.Fragment>
      ))}
    </dl>
  </AqDialog>
);
