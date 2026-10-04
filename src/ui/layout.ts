/**
 * Layout rules that depend on the firm count (spec §14.1–14.4, Session 10). Pure functions,
 * so the paging and column rules are unit-tested without a browser. The projector is a
 * fixed character grid (grid.css), so one rule holds at 1280×720 and 1920×1080 alike.
 */

// ── Board (§14.1) ─────────────────────────────────────────────────────────────

/** Two-line rows fit up to this many firms. */
export const BOARD_TALL_MAX = 12;
/** One-line rows fit up to this many firms; above it the board pages. */
export const BOARD_COMPACT_MAX = 16;
export const BOARD_PAGE_SIZE = 10;
/** Rows pinned above a page: the leader and the largest mover. */
export const BOARD_PIN_MAX = 2;
/** Rank change, in places, that pins a firm. */
export const BOARD_PIN_MOVE = 3;
export const BOARD_ROTATE_MS = 8000;
/** Rotation holds this long after a key press on the projector. */
export const BOARD_HOLD_MS = 30000;

export type BoardMode = 'tall' | 'compact' | 'paged';

export function boardMode(n: number): BoardMode {
  if (n <= BOARD_TALL_MAX) return 'tall';
  if (n <= BOARD_COMPACT_MAX) return 'compact';
  return 'paged';
}

export const boardPageCount = (n: number): number => (boardMode(n) === 'paged' ? Math.ceil(n / BOARD_PAGE_SIZE) : 1);

export interface Ranked {
  rank: number;
  /** Places moved since the previous quarter (either direction). */
  move: number;
}

export interface BoardPage<T> {
  /** Rows above the page, not on it: the leader, then the largest mover. */
  pinned: T[];
  rows: T[];
  page: number;
  pages: number;
}

/** One page of a board already sorted by rank. `page` wraps, so a rotating counter can be passed as is. */
export function boardPage<T extends Ranked>(sorted: ReadonlyArray<T>, page: number): BoardPage<T> {
  const pages = boardPageCount(sorted.length);
  if (pages === 1) return { pinned: [], rows: [...sorted], page: 0, pages: 1 };
  const p = ((page % pages) + pages) % pages;
  const rows = sorted.slice(p * BOARD_PAGE_SIZE, (p + 1) * BOARD_PAGE_SIZE);
  const on = new Set(rows);
  const pinned: T[] = [];
  const leader = sorted[0];
  if (leader && !on.has(leader)) pinned.push(leader);
  const movers = sorted
    .filter((r) => Math.abs(r.move) >= BOARD_PIN_MOVE && !on.has(r) && r !== leader)
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move) || a.rank - b.rank);
  for (const m of movers) {
    if (pinned.length >= BOARD_PIN_MAX) break;
    pinned.push(m);
  }
  pinned.sort((a, b) => a.rank - b.rank);
  return { pinned, rows, page: p, pages };
}

// ── Lobby (§14.1) ─────────────────────────────────────────────────────────────

export const LOBBY_TABLE_MAX = 16;
export const LOBBY_COLUMN_ROWS = 16;
export const LOBBY_COLUMNS_MAX = 4;

/** 0 means the one-table layout. */
export const lobbyColumns = (n: number): number => (n <= LOBBY_TABLE_MAX ? 0 : Math.min(LOBBY_COLUMNS_MAX, Math.ceil(n / LOBBY_COLUMN_ROWS)));

/** Splits items into `cols` columns filled top to bottom, the earlier columns one longer when uneven. */
export function fillColumns<T>(items: ReadonlyArray<T>, cols: number): T[][] {
  const c = Math.max(1, cols);
  const per = Math.ceil(items.length / c);
  return Array.from({ length: c }, (_, i) => items.slice(i * per, (i + 1) * per));
}

// ── Long lists (§14.1, §14.3, §14.4) ──────────────────────────────────────────

export const LIST_MAX = 12;
export const LIST_SHOWN = 10;

/** A list longer than 12 shows the first 10 and the count of the rest. */
export function truncateList<T>(items: ReadonlyArray<T>): { shown: T[]; more: number } {
  if (items.length <= LIST_MAX) return { shown: [...items], more: 0 };
  return { shown: items.slice(0, LIST_SHOWN), more: items.length - LIST_SHOWN };
}

/** Tickers as one line: "ARCN BRLK … +14 more". */
export function tickerLine(tickers: ReadonlyArray<string>, sep = ' '): string {
  const { shown, more } = truncateList(tickers);
  return more > 0 ? `${shown.join(sep)}${sep}+${more} more` : shown.join(sep);
}

// ── Phone lists (§14.3) ───────────────────────────────────────────────────────

/** A firm list longer than this gains a filter field. */
export const FILTER_ABOVE = 8;

/** Keeps entries whose ticker contains the typed letters (case and spacing ignored). */
export function filterByTicker<T extends { ticker: string }>(items: ReadonlyArray<T>, query: string): T[] {
  const q = query.replace(/[^a-z]/gi, '').toUpperCase();
  if (!q) return [...items];
  return items.filter((t) => t.ticker.toUpperCase().includes(q));
}

// ── Results (§14.4) ───────────────────────────────────────────────────────────

/** Rows per column on the full-width results panels. */
export const RESULT_COLUMN_ROWS = 16;
export const RESULT_COLUMNS_MAX = 2;
export const RESULT_PAGE_MAX = RESULT_COLUMN_ROWS * RESULT_COLUMNS_MAX;
/** ATTRIBUTION lists every firm up to this count. */
export const ATTRIBUTION_ALL_MAX = 24;
/** Above that, the firms with the largest share of damage, then one OTHERS row. */
export const ATTRIBUTION_TOP = 12;

export interface Span {
  start: number;
  end: number;
}

/** P balanced pages of at most `max` items, in order. */
export function balancedPages(n: number, max: number): Span[] {
  if (n <= 0) return [{ start: 0, end: 0 }];
  const pages = Math.ceil(n / max);
  const per = Math.ceil(n / pages);
  return Array.from({ length: pages }, (_, i) => ({ start: i * per, end: Math.min(n, (i + 1) * per) }));
}

/** Columns for `rows` rows on one results page: 1 up to 16 rows, 2 above. */
export const resultColumns = (rows: number): number => Math.min(RESULT_COLUMNS_MAX, Math.max(1, Math.ceil(rows / RESULT_COLUMN_ROWS)));

/** FINAL BOARD pages. */
export const finalBoardPages = (n: number): Span[] => balancedPages(n, RESULT_PAGE_MAX);

/** COUNTERFACTUAL: one page up to 16 firms; above, a figures-and-trust page, then comparison pages. */
export function counterfactualPages(n: number): { split: boolean; compare: Span[] } {
  if (n <= RESULT_COLUMN_ROWS) return { split: false, compare: [{ start: 0, end: n }] };
  return { split: true, compare: balancedPages(n, RESULT_PAGE_MAX) };
}

/** Pages per results panel, in panel order (FINAL BOARD … DEBRIEF). */
export function resultPageCounts(n: number): number[] {
  const cf = counterfactualPages(n);
  return [finalBoardPages(n).length, 1, cf.split ? 1 + cf.compare.length : 1, 1, 1, 1];
}

/** The next (panel, page) when stepping by `delta`, or a message at either end. */
export function stepResultsPosition(
  counts: ReadonlyArray<number>,
  step: number,
  sub: number,
  delta: 1 | -1,
): { step: number; sub: number } | string {
  const pagesOf = (i: number): number => Math.max(1, counts[i] ?? 1);
  const s = Math.min(Math.max(0, step), counts.length - 1);
  const p = Math.min(Math.max(0, sub), pagesOf(s) - 1);
  if (delta === 1) {
    if (p + 1 < pagesOf(s)) return { step: s, sub: p + 1 };
    if (s + 1 >= counts.length) return 'This is the last results panel.';
    return { step: s + 1, sub: 0 };
  }
  if (p > 0) return { step: s, sub: p - 1 };
  if (s === 0) return 'This is the first results panel.';
  return { step: s - 1, sub: pagesOf(s - 1) - 1 };
}

/** Top-bar position: "3/6" or "3/6 · 2/3". */
export function resultsPositionLabel(counts: ReadonlyArray<number>, step: number, sub: number): string {
  const pages = Math.max(1, counts[step] ?? 1);
  const base = `${step + 1}/${counts.length}`;
  return pages > 1 ? `${base} · ${Math.min(sub, pages - 1) + 1}/${pages}` : base;
}
