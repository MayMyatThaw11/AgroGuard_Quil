import { useSyncExternalStore } from 'react';
import { EN, type Dictionary, type Key } from './i18n/en.ts';
import { FIL } from './i18n/fil.ts';
import { ID } from './i18n/id.ts';
import { KM } from './i18n/km.ts';
import { MY } from './i18n/my.ts';
import { TH } from './i18n/th.ts';
import { VI } from './i18n/vi.ts';

export type { Key } from './i18n/en.ts';

export const LANGS = [
  { id: 'en', name: 'English', locale: 'en' },
  { id: 'my', name: 'မြန်မာ', locale: 'my' },
  { id: 'vi', name: 'Tiếng Việt', locale: 'vi' },
  { id: 'th', name: 'ไทย', locale: 'th' },
  { id: 'fil', name: 'Filipino', locale: 'fil' },
  { id: 'id', name: 'Bahasa Indonesia', locale: 'id' },
  { id: 'km', name: 'ខ្មែរ', locale: 'km' },
] as const;

export type Lang = (typeof LANGS)[number]['id'];
export type Vars = Record<string, string | number>;
export type Translate = (key: Key, vars?: Vars) => string;

export const DICTIONARIES: Readonly<Record<Lang, Dictionary>> = { en: EN, my: MY, vi: VI, th: TH, fil: FIL, id: ID, km: KM };

const STORAGE_KEY = 'agriquill.lang';

export function isLang(value: unknown): value is Lang {
  return LANGS.some((l) => l.id === value);
}

export function translate(lang: Lang, key: Key, vars?: Vars): string {
  const text = DICTIONARIES[lang][key] || EN[key];
  return vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text;
}

function stored(): Lang {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLang(value) ? value : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang | null = null;
const listeners = new Set<() => void>();

export function getLang(): Lang {
  current ??= stored();
  return current;
}

function remember(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    return;
  }
}

export function setLang(lang: Lang): void {
  current = lang;
  remember(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => 'en');
}

export function useT(): Translate {
  const lang = useLang();
  return (key, vars) => translate(lang, key, vars);
}

export function localeOf(lang: Lang): string {
  return LANGS.find((l) => l.id === lang)?.locale ?? 'en';
}

export const tr: Translate = (key, vars) => translate(getLang(), key, vars);

export const activeLocale = (): string => localeOf(getLang());
