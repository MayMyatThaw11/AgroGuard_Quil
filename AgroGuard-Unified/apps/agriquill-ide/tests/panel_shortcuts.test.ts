import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPanelToggle, panelShortcut, type PanelState } from '../src/lib/panelShortcuts.ts';

const base = { key: '', metaKey: false, ctrlKey: false, altKey: false, targetTag: 'DIV' as string | null };

test('Panel shortcuts: [ toggles the left panel and ] the right panel', () => {
  assert.equal(panelShortcut({ ...base, key: '[' }), 'left');
  assert.equal(panelShortcut({ ...base, key: ']' }), 'right');
});

test('Panel shortcuts: backslash toggles both panels', () => {
  assert.equal(panelShortcut({ ...base, key: '\\' }), 'both');
});

test('Panel shortcuts: other keys do nothing', () => {
  assert.equal(panelShortcut({ ...base, key: 'a' }), null);
  assert.equal(panelShortcut({ ...base, key: 'Escape' }), null);
});

test('Panel shortcuts: typing in a form field never toggles a panel', () => {
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(panelShortcut({ ...base, key: '[', targetTag: tag }), null);
  }
  assert.equal(panelShortcut({ ...base, key: '[', targetTag: null }), 'left');
});

test('Panel shortcuts: modifier chords stay free for the command palette and the browser', () => {
  assert.equal(panelShortcut({ ...base, key: '[', metaKey: true }), null);
  assert.equal(panelShortcut({ ...base, key: ']', ctrlKey: true }), null);
  assert.equal(panelShortcut({ ...base, key: '\\', altKey: true }), null);
});

test('Panel shortcuts: toggling flips one side, and both flips together', () => {
  const open: PanelState = { left: true, right: true };
  assert.deepEqual(applyPanelToggle(open, 'left'), { left: false, right: true });
  assert.deepEqual(applyPanelToggle(open, 'right'), { left: true, right: false });
  assert.deepEqual(applyPanelToggle(open, 'both'), { left: false, right: false });
  assert.deepEqual(applyPanelToggle({ left: false, right: true }, 'both'), { left: true, right: false });
});
