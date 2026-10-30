export const MILLER = 5;

export function showRows<T>(rows: readonly T[], expanded: boolean, limit: number = MILLER): { shown: T[]; hidden: number } {
  if (expanded || rows.length <= limit) return { shown: [...rows], hidden: 0 };
  return { shown: rows.slice(0, limit), hidden: rows.length - limit };
}
