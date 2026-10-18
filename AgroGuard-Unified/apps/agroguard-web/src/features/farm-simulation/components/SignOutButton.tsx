import React from 'react';
import { useT } from '../lib/i18n.ts';
import { activeSession, signOut } from '../lib/session.ts';

export const SignOutButton: React.FC<{ className: string }> = ({ className }) => {
  const t = useT();
  if (!activeSession()) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        signOut();
        window.location.reload();
      }}
    >
      {t('action.signOut')}
    </button>
  );
};
