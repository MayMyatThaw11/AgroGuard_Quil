export type UiMode = 'dev' | 'farmer' | 'buyer';
export type ViewAs = 'farmer' | 'buyer' | null;

export const VIEW_AS_KEY = 'aq-fm-view-as';

export function pickMode(input: { accessCode: string; accountType: UiMode; viewAs: ViewAs }): { mode: UiMode; shown: UiMode } {
  const mode: UiMode = input.accessCode ? 'dev' : input.accountType;
  return { mode, shown: mode === 'dev' && input.viewAs ? input.viewAs : mode };
}
