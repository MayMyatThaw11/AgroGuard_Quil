/**
 * Reconciliation rule for SpatialCanvas's two-way sync between the parent's
 * `currentDay` prop and the farm store's `day` field.
 *
 * The bug this guards against: SpatialCanvas has one effect that pushes the
 * parent's day down into the store, and a second effect that lifts a changed
 * store day back up to the parent (for a future in-3D-view day scrub that
 * writes to the store directly, bypassing the prop). Within a single commit,
 * the lift-up effect reads the store's day as it was at render time, before
 * the push-down effect's own write to the store has flowed back through a
 * render. So right after the push-down effect writes a new day, the lift-up
 * effect sees that same write as "the store changed" and echoes it straight
 * back to the parent — which the parent treats as a new day, triggering the
 * push-down effect again, forever ("Maximum update depth exceeded").
 *
 * The fix: remember the day value the push-down effect itself last applied.
 * The lift-up effect only lifts a store day that differs from that value —
 * i.e. a change that did not come from the push-down effect's own write.
 */
export function shouldLiftStoreDay(storeDay: number, lastPushedDay: number | null): boolean {
  if (lastPushedDay === null) return false;
  return storeDay !== lastPushedDay;
}
