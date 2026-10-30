import { useCallback, useEffect, useRef, useState } from 'react';
import { decideProposal, postReading } from './api.ts';
import { createProducer } from './farmmap/producers.ts';
import { ApiError } from './apiError.ts';
import {
  enqueue,
  flushQueue,
  loadQueue,
  saveQueue,
  type FlushReport,
  type QueuedItem,
  type SendOutcome,
} from './fieldQueue.ts';
import { REPORTER_KEY } from './session.ts';

export async function sendItem(item: QueuedItem): Promise<SendOutcome> {
  try {
    if (item.kind === 'reading') {
      const out = await postReading(item.body);
      if (out.rejected.length > 0 && out.stored.length === 0) {
        return { result: 'conflict', message: out.rejected.map((r) => `${r.field}: ${r.reason}`).join('; ') };
      }
    } else if (item.kind === 'producer') {
      await createProducer(item.body);
    } else {
      await decideProposal(item.body.proposal_id, item.body.decision, item.body.decided_by);
    }
    return { result: 'done' };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return { result: 'retry', message: 'farm access code missing or wrong; enter it and the queue will resend' };
    }
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      return { result: 'conflict', message: err.message };
    }
    return { result: 'retry', message: err instanceof Error ? err.message : 'network unavailable' };
  }
}

export function useFieldQueue(onSent?: () => void) {
  const [items, setItems] = useState<QueuedItem[]>(() => loadQueue());
  const [report, setReport] = useState<FlushReport | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const busy = useRef(false);
  const latest = useRef(items);

  const commit = useCallback((next: QueuedItem[]) => {
    latest.current = next;
    saveQueue(next);
    setItems(next);
  }, []);

  const flush = useCallback(async () => {
    if (busy.current || latest.current.length === 0) return;
    busy.current = true;
    try {
      const { remaining, report: outcome } = await flushQueue(latest.current, sendItem);
      commit(remaining);
      setReport(outcome);
      if (outcome.sent > 0 || outcome.conflicts.length > 0) onSent?.();
    } finally {
      busy.current = false;
    }
  }, [commit, onSent]);

  const add = useCallback(
    (item: QueuedItem) => {
      commit(enqueue(latest.current, item));
      void flush();
    },
    [commit, flush]
  );

  useEffect(() => {
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    void flush();
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [flush]);

  return { items, report, online, add, flush };
}

export function useReporter(): [string, (name: string) => void] {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(REPORTER_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const update = useCallback((next: string) => {
    setName(next);
    try {
      localStorage.setItem(REPORTER_KEY, next);
    } catch {
      return;
    }
  }, []);
  return [name, update];
}

export function newId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
