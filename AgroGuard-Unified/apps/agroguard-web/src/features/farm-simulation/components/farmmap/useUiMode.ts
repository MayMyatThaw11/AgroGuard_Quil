import { useCallback, useState } from 'react';
import { accountType } from '../../../../lib/account.js';
import { accessCode } from '../../lib/api.ts';
import { pickMode, VIEW_AS_KEY, type UiMode, type ViewAs } from '../../lib/farmmap/uiMode.ts';

function readViewAs(): ViewAs {
  try {
    const value = sessionStorage.getItem(VIEW_AS_KEY);
    return value === 'farmer' || value === 'buyer' ? value : null;
  } catch {
    return null;
  }
}

export function useUiMode(): { mode: UiMode; shown: UiMode; viewAs: ViewAs; setViewAs: (next: ViewAs) => void } {
  const [viewAs, setState] = useState<ViewAs>(readViewAs);
  const setViewAs = useCallback((next: ViewAs) => {
    try {
      if (next) sessionStorage.setItem(VIEW_AS_KEY, next);
      else sessionStorage.removeItem(VIEW_AS_KEY);
    } catch {
      /* the choice lasts for this page only */
    }
    setState(next);
  }, []);
  return { ...pickMode({ accessCode: accessCode(), accountType: accountType(), viewAs }), viewAs, setViewAs };
}
