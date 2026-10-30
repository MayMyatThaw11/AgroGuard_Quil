import type { ProducerDraft } from './farmmap/producers.ts';

export type QueuedItem =
  | {
      id: string;
      kind: 'reading';
      queuedAt: string;
      body: {
        device_id: string;
        observed_at: string;
        values: Record<string, number>;
        reporter: string;
        photo_base64?: string;
      };
    }
  | {
      id: string;
      kind: 'decision';
      queuedAt: string;
      body: { proposal_id: string; decision: 'approved' | 'rejected'; decided_by: string };
    }
  | { id: string; kind: 'producer'; queuedAt: string; body: ProducerDraft };

export type SendOutcome = { result: 'done' } | { result: 'conflict'; message: string } | { result: 'retry'; message: string };

export interface FlushReport {
  sent: number;
  conflicts: { item: QueuedItem; message: string }[];
  pending: number;
  lastError: string | null;
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'agriquill.fieldQueue.v1';

function storage(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadQueue(store: KeyValueStore | null = storage()): QueuedItem[] {
  if (!store) return [];
  try {
    const raw = store.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedItem[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(items: QueuedItem[], store: KeyValueStore | null = storage()): void {
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(items));
  } catch {
    return;
  }
}

export function itemKey(item: QueuedItem): string {
  if (item.kind === 'reading') return `reading:${item.body.device_id}:${item.body.observed_at}`;
  if (item.kind === 'producer') return `producer:${item.body.name}:${item.body.lat}:${item.body.lon}`;
  return `decision:${item.body.proposal_id}`;
}

export function enqueue(items: QueuedItem[], item: QueuedItem): QueuedItem[] {
  const key = itemKey(item);
  return [...items.filter((existing) => itemKey(existing) !== key), item];
}

export async function flushQueue(
  items: QueuedItem[],
  send: (item: QueuedItem) => Promise<SendOutcome>
): Promise<{ remaining: QueuedItem[]; report: FlushReport }> {
  const report: FlushReport = { sent: 0, conflicts: [], pending: 0, lastError: null };
  const remaining = [...items];
  while (remaining.length > 0) {
    const outcome = await send(remaining[0]);
    if (outcome.result === 'retry') {
      report.lastError = outcome.message;
      break;
    }
    const item = remaining.shift() as QueuedItem;
    if (outcome.result === 'done') report.sent += 1;
    else report.conflicts.push({ item, message: outcome.message });
  }
  report.pending = remaining.length;
  return { remaining, report };
}
