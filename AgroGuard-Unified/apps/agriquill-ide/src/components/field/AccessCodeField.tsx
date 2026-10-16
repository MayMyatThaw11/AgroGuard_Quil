import React, { useState } from 'react';
import { accessCode, setAccessCode } from '../../lib/api.ts';
import { useT } from '../../lib/i18n.ts';

export const AccessCodeField: React.FC<{ className?: string; inputClassName?: string }> = ({ className, inputClassName = 'ops-input mt-1' }) => {
  const t = useT();
  const [code, setCode] = useState(accessCode);
  return (
    <label className={className}>
      {t('access.label')}
      <input
        className={inputClassName}
        type="password"
        autoComplete="off"
        maxLength={120}
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setAccessCode(e.target.value.trim());
        }}
      />
    </label>
  );
};
