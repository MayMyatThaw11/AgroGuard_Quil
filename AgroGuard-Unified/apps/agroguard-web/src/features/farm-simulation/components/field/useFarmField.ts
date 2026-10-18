import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Proposal } from '../../data/ops/types.ts';
import { getProposals, runWatch } from '../../lib/api.ts';
import { writeErrorText } from '../../lib/apiError.ts';
import { useFieldQueue, useReporter } from '../../lib/useFieldQueue.ts';

export interface FarmField {
  readOnly: boolean;
  reporter: string;
  setReporter: (name: string) => void;
  proposals: Proposal[];
  pendingIds: Set<string>;
  queued: number;
  online: boolean;
  lastError: string | null;
  conflicts: string[];
  watching: boolean;
  watchError: string | null;
  add: ReturnType<typeof useFieldQueue>['add'];
  flush: () => Promise<void>;
  watch: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useFarmField(farmId: string, onChange?: () => void, readOnly = false): FarmField {
  const [reporter, setReporter] = useReporter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [watching, setWatching] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProposals((await getProposals(farmId)).proposals);
    } catch {
      return;
    }
  }, [farmId]);

  const sent = useCallback(() => {
    void refresh();
    onChange?.();
  }, [refresh, onChange]);

  const queue = useFieldQueue(sent);

  const watch = useCallback(async () => {
    setWatching(true);
    setWatchError(null);
    try {
      await runWatch(farmId);
      await refresh();
    } catch (err) {
      setWatchError(writeErrorText(err, 'watch failed'));
    } finally {
      setWatching(false);
    }
  }, [farmId, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pendingIds = useMemo(
    () => new Set(queue.items.flatMap((i) => (i.kind === 'decision' ? [i.body.proposal_id] : []))),
    [queue.items]
  );

  return {
    readOnly,
    reporter,
    setReporter,
    proposals,
    pendingIds,
    queued: queue.items.length,
    online: queue.online,
    lastError: queue.report?.lastError ?? null,
    conflicts: queue.report?.conflicts.map((c) => c.message) ?? [],
    watching,
    watchError,
    add: queue.add,
    flush: queue.flush,
    watch,
    refresh,
  };
}
