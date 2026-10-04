/** Console Firms panel (spec §14.2, Session 10): sort and filter, as pure functions. */

export type FirmSort = 'order' | 'cmt' | 'online';

export interface FirmFilters {
  /** Firms that have not committed this quarter (open quarter only). */
  notCommitted: boolean;
  /** Human firms with no device online. */
  offline: boolean;
}

export interface ConsoleFirm {
  id: string;
  ticker: string;
  /** Bot policy, or null for a human firm. */
  bot: string | null;
  members: ReadonlyArray<{ online: boolean }>;
  /** True when a decision for the open quarter is stored. */
  committed: boolean;
}

export const onlineCount = (f: ConsoleFirm): number => f.members.filter((m) => m.online).length;

/** Bots always count as committed and online. */
const isCommitted = (f: ConsoleFirm): boolean => f.bot !== null || f.committed;
const isOffline = (f: ConsoleFirm): boolean => f.bot === null && onlineCount(f) === 0;

/**
 * Filters, then sorts. Rows arrive in creation order, which breaks every tie.
 * `cmt` puts firms still to commit first; `online` puts firms with the fewest devices online first.
 */
export function firmTable<T extends ConsoleFirm>(rows: ReadonlyArray<T>, sort: FirmSort, filters: FirmFilters, open: boolean): T[] {
  const kept = rows.filter((f) => !(filters.notCommitted && open && isCommitted(f)) && !(filters.offline && !isOffline(f)));
  if (sort === 'order') return kept;
  const key = (f: T): number => (sort === 'cmt' ? (isCommitted(f) ? 1 : 0) : f.bot !== null ? Number.MAX_SAFE_INTEGER : onlineCount(f));
  const index = new Map(rows.map((f, i) => [f.id, i]));
  return [...kept].sort((a, b) => key(a) - key(b) || (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
}
