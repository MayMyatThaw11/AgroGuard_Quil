import React, { useEffect } from 'react';
import { Languages } from 'lucide-react';
import { LANGS, isLang, setLang, useLang, useT } from '../../lib/i18n.ts';

export const LanguagePicker: React.FC = () => {
  const lang = useLang();
  const t = useT();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <div className="mb-3">
      <label className="flex items-center gap-2 text-[13px] text-(--ops-ink-2)">
        <Languages className="w-4 h-4" aria-hidden />
        {t('lang.label')}
        <select
          className="ops-input flex-1 text-[16px]"
          value={lang}
          onChange={(e) => {
            if (isLang(e.target.value)) setLang(e.target.value);
          }}
        >
          {LANGS.map((l) => (
            <option key={l.id} value={l.id} lang={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {lang !== 'en' && <p className="mt-1 text-[11px] text-(--ops-amber)">{t('lang.draft')}</p>}
    </div>
  );
};
