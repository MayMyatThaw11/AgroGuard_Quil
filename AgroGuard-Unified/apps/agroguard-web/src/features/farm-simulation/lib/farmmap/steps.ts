import type { Key, Translate } from '../i18n.ts';

export type StepState = 'done' | 'next' | 'todo';
export interface Step {
  id: string;
  state: StepState;
}

function mark(flags: readonly (readonly [string, boolean])[]): Step[] {
  let open = false;
  return flags.map(([id, done]) => {
    if (done) return { id, state: 'done' as const };
    const state = open ? ('todo' as const) : ('next' as const);
    open = true;
    return { id, state };
  });
}

export const sellSteps = (f: { profile: boolean; listed: boolean; offered: boolean; delivered: boolean; paid: boolean }): Step[] =>
  mark([['profile', f.profile], ['list', f.listed], ['offer', f.offered], ['deliver', f.delivered], ['paid', f.paid]]);

export const buySteps = (f: { searched: boolean; asked: boolean; selected: boolean; received: boolean }): Step[] =>
  mark([['search', f.searched], ['ask', f.asked], ['select', f.selected], ['receive', f.received]]);

export const nextStep = (steps: readonly Step[]): Step | undefined => steps.find((s) => s.state === 'next');

export function stepsText(steps: readonly Step[], t: Translate): string {
  const next = nextStep(steps);
  return next ? t('farmMap.steps.next', { step: t(`farmMap.steps.${next.id}` as Key) }) : t('farmMap.steps.allDone');
}
