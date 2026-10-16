import { useEffect, useState } from 'react';
import { lintAgri, type LintDiagnostic } from './api.ts';

export type LintStatus = 'checking' | 'ready' | 'offline';

export function useContractLint(text: string, delayMs = 400) {
  const [diagnostics, setDiagnostics] = useState<LintDiagnostic[]>([]);
  const [status, setStatus] = useState<LintStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('checking');
    const timer = setTimeout(() => {
      lintAgri(text, controller.signal)
        .then((out) => {
          setDiagnostics(out.diagnostics);
          setStatus('ready');
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus('offline');
        });
    }, delayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, delayMs]);

  return { diagnostics, status };
}
