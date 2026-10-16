import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldLiftStoreDay } from '../src/lib/daySync.ts';

/**
 * Regression coverage for the "Maximum update depth exceeded" crash in
 * SpatialCanvas: a push-down effect writes the parent's day prop into the
 * farm store, and a lift-up effect echoes a *changed* store day back to the
 * parent (for a future in-3D-view day scrub that writes to the store
 * directly, bypassing the prop). The two effects run in declaration order
 * within one React commit, each closing over the props/state captured at the
 * start of *that* render.
 *
 * Pre-fix, the lift-up effect's dependency array included the parent's day
 * prop, so it reran in the very same commit as the push-down effect — before
 * the store's new value had reached a render — and always saw the pre-write
 * store value as "different from the parent's new day," echoing it straight
 * back. The parent treated the echo as a new day, re-triggering the
 * push-down effect, forever.
 *
 * `simulateRenders` below models React's real per-commit semantics (each
 * effect reruns only when its own dependency changed since the *previous*
 * commit, reading values as captured at the start of the current commit) to
 * exercise the actual mechanism, not a reimplementation that could drift
 * from the component.
 *
 * Two changes went into the fix; this file establishes which is load-bearing
 * for the crash itself versus which is a correctness refinement:
 *   - Dropping the parent's day prop from the lift-up effect's dependency
 *     array (so it only reruns when the store's day visibly changes between
 *     commits) is CONFIRMED below to be what stops the infinite loop, with
 *     or without the ref guard.
 *   - Comparing against the value the push-down effect itself last applied
 *     (shouldLiftStoreDay) instead of directly against the parent's day is
 *     a correctness refinement: it makes "was this change caused by our own
 *     push-down, or by something else" explicit, rather than relying on the
 *     two happening to agree once the deps change lets them settle. It does
 *     not, by itself, stop the loop (also confirmed below) while the old
 *     dependency array is still in place.
 */

interface SyncResult {
  renders: number;
  converged: boolean;
  finalParentDay: number;
  finalStoreDay: number;
}

function clamp(day: number): number {
  return Math.max(1, Math.min(120, day));
}

interface SimOptions {
  /** Pre-fix: the lift-up effect's deps included the parent's day prop. */
  liftUpDependsOnParentDay: boolean;
  /** The fixed comparison (shouldLiftStoreDay) vs. the pre-fix direct comparison. */
  useRefGuard: boolean;
}

function commitFactory(initialDay: number, options: SimOptions) {
  let parentState = initialDay;
  let liveStoreDay = initialDay;
  let lastPushedDay: number | null = null;
  let prevRenderedParentDay: number | undefined;
  let prevRenderedStoreDay: number | undefined;

  function commit(isFirstRender: boolean): boolean {
    const renderedParentDay = parentState;
    const renderedStoreDay = liveStoreDay; // snapshot at the start of this commit

    // Push-down effect: reruns when the parent's day prop changed.
    if (isFirstRender || renderedParentDay !== prevRenderedParentDay) {
      liveStoreDay = clamp(renderedParentDay);
      lastPushedDay = liveStoreDay;
    }

    // Lift-up effect: pre-fix, its deps also included the parent's day prop,
    // so it reran on every parent-day change, not only on store changes.
    const liftUpDepsChanged =
      isFirstRender ||
      renderedStoreDay !== prevRenderedStoreDay ||
      (options.liftUpDependsOnParentDay && renderedParentDay !== prevRenderedParentDay);

    if (liftUpDepsChanged) {
      const shouldLift = options.useRefGuard
        ? shouldLiftStoreDay(renderedStoreDay, lastPushedDay)
        : renderedStoreDay !== renderedParentDay; // the pre-fix comparison
      if (shouldLift) {
        if (options.useRefGuard) lastPushedDay = renderedStoreDay;
        parentState = renderedStoreDay;
      }
    }

    prevRenderedParentDay = renderedParentDay;
    prevRenderedStoreDay = renderedStoreDay;

    return parentState !== renderedParentDay || liveStoreDay !== renderedStoreDay; // another render needed
  }

  return {
    commit,
    setParentState(value: number) {
      parentState = value;
    },
    getParentState() {
      return parentState;
    },
    getStoreDay() {
      return liveStoreDay;
    },
  };
}

/** A single external change to the parent's day (a scrub, a preset switch, a stop/restart). */
function simulateRenders(initialDay: number, change: number, options: SimOptions, maxRenders = 50): SyncResult {
  const sim = commitFactory(initialDay, options);
  sim.commit(true); // mount: parent and store already equal

  sim.setParentState(change);
  for (let renderIndex = 0; renderIndex < maxRenders; renderIndex += 1) {
    const needsRerender = sim.commit(false);
    if (!needsRerender) {
      return {
        renders: renderIndex + 1,
        converged: true,
        finalParentDay: sim.getParentState(),
        finalStoreDay: sim.getStoreDay(),
      };
    }
  }
  return { renders: maxRenders, converged: false, finalParentDay: sim.getParentState(), finalStoreDay: sim.getStoreDay() };
}

/**
 * Play mode: App.tsx's interval calls `setCurrentDay(d => d + 1)` — a
 * functional updater reading whatever `currentDay` *currently* is — once per
 * tick. This applies `totalTicks` such ticks, one per simulated render (far
 * faster than the interval's real ~50-250ms cadence, as a stress test), and
 * checks the whole run never needs more than `maxRenders` to settle.
 */
function simulateTicking(initialDay: number, totalTicks: number, options: SimOptions, maxRenders = 400): SyncResult {
  const sim = commitFactory(initialDay, options);
  sim.commit(true);

  let ticksApplied = 0;
  for (let renderIndex = 0; renderIndex < maxRenders; renderIndex += 1) {
    if (ticksApplied < totalTicks) {
      sim.setParentState(sim.getParentState() + 1); // the real d => d + 1 semantics
      ticksApplied += 1;
    }
    const needsRerender = sim.commit(false);
    if (!needsRerender && ticksApplied >= totalTicks) {
      return {
        renders: renderIndex + 1,
        converged: true,
        finalParentDay: sim.getParentState(),
        finalStoreDay: sim.getStoreDay(),
      };
    }
  }
  return { renders: maxRenders, converged: false, finalParentDay: sim.getParentState(), finalStoreDay: sim.getStoreDay() };
}

test('shouldLiftStoreDay: ignores the value this component just pushed', () => {
  assert.equal(shouldLiftStoreDay(42, 42), false);
  assert.equal(shouldLiftStoreDay(43, 42), true, 'a genuinely different store day is still lifted');
  assert.equal(shouldLiftStoreDay(42, null), false, 'nothing to lift before the first push-down');
});

test('regression: the pre-fix effects (old deps + direct comparison) oscillate forever', () => {
  const result = simulateRenders(42, 43, { liftUpDependsOnParentDay: true, useRefGuard: false });
  assert.equal(result.converged, false, 'pre-fix logic never settles within a generous render budget');
  assert.notEqual(result.finalStoreDay, result.finalParentDay, 'left bouncing between two different values');
});

test('CONFIRMED: dropping the parent-day dependency is what stops the loop, independent of the comparison used', () => {
  for (const useRefGuard of [false, true]) {
    for (const nextDay of [43, 1, 120, -5, 500]) {
      const result = simulateRenders(42, nextDay, { liftUpDependsOnParentDay: false, useRefGuard });
      assert.equal(
        result.converged,
        true,
        `useRefGuard=${useRefGuard}, day=${nextDay}: expected convergence once the parent-day dep is dropped`,
      );
    }
  }
});

test('CONFIRMED: the ref guard alone, keeping the old dependency array, does not stop the loop', () => {
  const result = simulateRenders(42, 43, { liftUpDependsOnParentDay: true, useRefGuard: true });
  assert.equal(
    result.converged,
    false,
    'the ref guard does not help if the lift-up effect still co-fires with push-down in the same commit',
  );
});

test('fix: converges within a few renders for a single in-range day change', () => {
  const result = simulateRenders(42, 43, { liftUpDependsOnParentDay: false, useRefGuard: true });
  assert.equal(result.converged, true);
  assert.ok(result.renders <= 4, `expected a handful of renders, got ${result.renders}`);
  assert.equal(result.finalStoreDay, 43);
  assert.equal(result.finalParentDay, 43, 'parent day is never reverted by its own push-down');
});

test('fix: converges under play-mode ticking (App.tsx\'s real setCurrentDay(d => d + 1) pattern)', () => {
  for (const totalTicks of [1, 3, 10, 30]) {
    const result = simulateTicking(42, totalTicks, { liftUpDependsOnParentDay: false, useRefGuard: true });
    assert.equal(result.converged, true, `${totalTicks} tick(s) did not converge`);
    assert.equal(result.finalParentDay, result.finalStoreDay, `${totalTicks} tick(s): parent and store agree`);
  }
});

test('fix: out-of-range input clamps into [1, 120] and settles (does not require echoing the clamp)', () => {
  for (const nextDay of [-5, 0, 121, 500]) {
    const result = simulateRenders(42, nextDay, { liftUpDependsOnParentDay: false, useRefGuard: true });
    assert.equal(result.converged, true, `day ${nextDay} did not converge`);
    assert.ok(result.finalStoreDay >= 1 && result.finalStoreDay <= 120, `day ${nextDay} clamps into range`);
  }
});

test('fix: converges for every in-range day with no clamping, and parent/store agree', () => {
  for (const nextDay of [1, 42, 90, 120]) {
    const result = simulateRenders(42, nextDay, { liftUpDependsOnParentDay: false, useRefGuard: true });
    assert.equal(result.converged, true, `day ${nextDay} did not converge`);
    assert.equal(result.finalParentDay, result.finalStoreDay, `day ${nextDay}: parent and store agree`);
    assert.equal(result.finalStoreDay, nextDay);
  }
});

test('fix: a day written to the store from outside the push-down effect is still lifted to the parent', () => {
  // Models the case the lift-up effect exists for: something other than this
  // component's own push-down (e.g. a future in-3D-view scrub) calls the
  // store's setDay directly, bypassing the parent prop.
  const lastPushedDay = 42;
  const externallyWrittenStoreDay = 50;
  assert.equal(
    shouldLiftStoreDay(externallyWrittenStoreDay, lastPushedDay),
    true,
    "an external store change is distinguishable from the component's own last push and is still lifted",
  );
});
