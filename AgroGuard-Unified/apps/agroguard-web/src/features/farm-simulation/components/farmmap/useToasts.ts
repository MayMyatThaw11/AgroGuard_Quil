import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'warning';

export interface ToastInput {
  key?: string;
  tone: ToastTone;
  title: string;
  message?: string;
  action?: readonly [string, () => void];
  ms?: number;
  sticky?: boolean;
}

export interface ToastItem extends ToastInput {
  id: string;
}

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((all) => all.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      counter.current += 1;
      const id = toast.key ?? `toast-${counter.current}`;
      setItems((all) => [...all.filter((item) => item.id !== id), { ...toast, id }].slice(-3));
      const previous = timers.current.get(id);
      if (previous) clearTimeout(previous);
      if (!toast.sticky) timers.current.set(id, setTimeout(() => dismiss(id), toast.ms ?? 5000));
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => clearTimeout(timer));
  }, []);

  return { items, push, dismiss };
}
