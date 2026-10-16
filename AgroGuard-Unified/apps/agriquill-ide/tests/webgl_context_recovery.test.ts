import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachContextLossRecovery, type ContextLossTarget } from '../src/lib/webglContextRecovery.ts';

/**
 * FarmScene.tsx had no "webglcontextlost"/"webglcontextrestored" handling at
 * all before this fix, so a lost context (observed in the field as "WebGL
 * context was lost" console messages) could never recover: per the WebGL
 * spec, a lost context is only eligible for restoration if the lost-event
 * handler calls event.preventDefault(); otherwise the browser treats the
 * loss as permanent. This is the one property that actually matters here,
 * verified without a real WebGL context or DOM via a minimal fake target.
 */
function fakeTarget() {
  const listeners = new Map<string, Set<(event: { preventDefault(): void }) => void>>();
  return {
    target: {
      addEventListener(type: string, listener: (event: { preventDefault(): void }) => void) {
        (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(listener);
      },
      removeEventListener(type: string, listener: (event: { preventDefault(): void }) => void) {
        listeners.get(type)?.delete(listener);
      },
    } as ContextLossTarget,
    dispatch(type: 'webglcontextlost' | 'webglcontextrestored') {
      let defaultPrevented = false;
      const event = { preventDefault: () => { defaultPrevented = true; } };
      for (const listener of listeners.get(type) ?? []) listener(event);
      return defaultPrevented;
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

test('CONFIRMED: a lost context calls preventDefault(), making it eligible for restoration', () => {
  const { target, dispatch } = fakeTarget();
  attachContextLossRecovery(target, { onLost: () => {}, onRestored: () => {} });
  const defaultPrevented = dispatch('webglcontextlost');
  assert.equal(defaultPrevented, true, 'without this, "webglcontextrestored" never fires per the WebGL spec');
});

test('onLost and onRestored fire on their respective events, and only those', () => {
  const { target, dispatch } = fakeTarget();
  let lost = 0;
  let restored = 0;
  attachContextLossRecovery(target, { onLost: () => { lost += 1; }, onRestored: () => { restored += 1; } });

  dispatch('webglcontextlost');
  assert.equal(lost, 1);
  assert.equal(restored, 0);

  dispatch('webglcontextrestored');
  assert.equal(lost, 1);
  assert.equal(restored, 1);
});

test('the returned cleanup function detaches both listeners', () => {
  const { target, dispatch, listenerCount } = fakeTarget();
  let lost = 0;
  const detach = attachContextLossRecovery(target, { onLost: () => { lost += 1; }, onRestored: () => {} });

  assert.equal(listenerCount('webglcontextlost'), 1);
  detach();
  assert.equal(listenerCount('webglcontextlost'), 0);
  assert.equal(listenerCount('webglcontextrestored'), 0);

  dispatch('webglcontextlost'); // after detaching, should not call onLost
  assert.equal(lost, 0);
});

test('surviving a loss-then-restore cycle leaves no error state (models FarmScene\'s overlay toggling off)', () => {
  const { target, dispatch } = fakeTarget();
  let contextLost = false;
  attachContextLossRecovery(target, {
    onLost: () => { contextLost = true; },
    onRestored: () => { contextLost = false; },
  });

  dispatch('webglcontextlost');
  assert.equal(contextLost, true, 'the recoverable overlay should show while lost');
  dispatch('webglcontextrestored');
  assert.equal(contextLost, false, 'the overlay should clear once restored, with no reload needed');
});
