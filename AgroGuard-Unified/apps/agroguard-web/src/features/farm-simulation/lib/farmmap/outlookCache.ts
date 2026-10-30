import { translate, type Lang } from '../i18n.ts';
import type { StorageLike } from '../paddySettings.ts';
import type { Outlook } from './market.ts';

export interface SavedOutlook {
  outlook: Outlook;
  savedAt: number;
}

const key = (town: string, produce: string) => `aq-fm-outlook:${town.toLowerCase()}:${produce}`;

export function saveOutlook(storage: StorageLike | null | undefined, town: string, produce: string, outlook: Outlook, now: number = Date.now()): void {
  if (!storage) return;
  try {
    storage.setItem(key(town, produce), JSON.stringify({ outlook, savedAt: now }));
  } catch {
    return;
  }
}

export function loadOutlook(storage: StorageLike | null | undefined, town: string, produce: string): SavedOutlook | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key(town, produce));
    const hit = raw ? (JSON.parse(raw) as Partial<SavedOutlook>) : null;
    return hit?.outlook && typeof hit.savedAt === 'number' ? { outlook: hit.outlook, savedAt: hit.savedAt } : null;
  } catch {
    return null;
  }
}

export function savedAgo(savedAt: number, now: number, lang: Lang): string {
  const minutes = Math.max(0, Math.round((now - savedAt) / 60000));
  if (minutes < 1) return translate(lang, 'farmMap.ago.now');
  if (minutes < 60) return translate(lang, 'farmMap.ago.min', { n: minutes });
  const hours = Math.round(minutes / 60);
  return hours < 48 ? translate(lang, 'farmMap.ago.h', { n: hours }) : translate(lang, 'farmMap.ago.days', { n: Math.round(hours / 24) });
}
