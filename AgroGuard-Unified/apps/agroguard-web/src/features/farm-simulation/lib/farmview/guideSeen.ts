export const GUIDE_KEY = 'aq-farmview-guide-seen';

export type GuideStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function browserStorage(): GuideStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function guideSeen(storage: GuideStorage | null): boolean {
  try {
    return storage?.getItem(GUIDE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markGuideSeen(storage: GuideStorage | null): void {
  try {
    storage?.setItem(GUIDE_KEY, '1');
  } catch {
    return;
  }
}
