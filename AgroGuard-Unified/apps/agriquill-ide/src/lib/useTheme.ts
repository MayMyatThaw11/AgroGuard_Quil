import { useCallback, useEffect, useState } from 'react';

/**
 * Theme controller.
 *
 * Dark is the default because the workspace is a monitoring surface. The
 * choice is persisted to localStorage and mirrored onto <html data-theme>,
 * which is what the token layer keys off. Because tokens are CSS custom
 * properties, switching is a single attribute write: no re-render, no flash,
 * no duplicated stylesheet.
 *
 * The initial value is applied by an inline script in index.html before paint,
 * so a returning user with a light preference never sees a dark flash.
 */

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'agriquill.theme';

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private mode or blocked storage: fall through to the media query.
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0f1311' : '#ffffff');
  }
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const resolved = readStoredTheme();
    setTheme(resolved);
    applyTheme(resolved);
  }, []);

  const toggle = useCallback(() => {
    setTheme(current => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Persistence is best-effort; the session still switches.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}

/** Inline no-flash bootstrap. Kept in sync with STORAGE_KEY above. */
export const THEME_BOOTSTRAP = `(function(){try{var k='${STORAGE_KEY}';var s=localStorage.getItem(k);if(s!=='light'&&s!=='dark'){s=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=s;}catch(e){document.documentElement.dataset.theme='dark';}})();`;