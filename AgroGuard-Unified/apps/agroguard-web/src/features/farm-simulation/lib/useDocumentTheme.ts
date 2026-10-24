import { useEffect, useState } from 'react';

const read = (): 'dark' | 'light' => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export function useDocumentTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const watch = new MutationObserver(() => setTheme(read()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    setTheme(read());
    return () => watch.disconnect();
  }, []);
  return theme;
}
