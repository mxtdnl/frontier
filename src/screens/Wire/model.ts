/**
 * Facilitator wire screen (`#/wire`, spec §14.2, Session 18). Pure functions.
 *
 * `wireGroups` merges the quarter headlines (`rounds/{r}/headlines`) and the live events (`wire`) into one log grouped by
 * quarter. `notOnWire` lists, from the engine history, the events of a quarter that the headline cap left out. The
 * engine history is facilitator-only: this module and the screen that renders it must never be imported by `#/screen`,
 * `#/play` or the participant results card (tests/ui/hidden-paths.test.ts).
 */
import type { Card, EngineState, HeadlineKind } from '../../engine';
import type { FirmNode, RoundNode, WireNode } from '../../firebase/schema';
import { isAlarmKind, wireKindLabel as kindLabel } from '../../firebase/wire';
import { quarterLabel } from '../../ui/format';

export type WireTone = 'wire' | 'down' | 'up';

export interface WireLine {
  /** Quarter the line belongs to; 0 before quarter 1 (`PRE`). */
  round: number;
  /** Server time in ms; null when not stored (a headline resolved before Session 18). */
  at: number | null;
  /** Short uppercase kind label, e.g. INCID, CARD, PACT. */
  kind: string;
  text: string;
  tone: WireTone;
}

export interface WireGroup {
  round: number;
  lines: WireLine[];
}


/** Colour by kind, as on the ticker (§14.1): alarms down, clean audits up, the rest wire. */
export const wireTone = (kind: string): WireTone => (isAlarmKind(kind) ? 'down' : kind === 'audit-clean' ? 'up' : 'wire');

/** Quarter label, or PRE for events before quarter 1. */
export const groupLabel = (round: number): string => (round > 0 ? quarterLabel(round) : 'PRE');

/**
 * Every wire entry of the session grouped by quarter, newest quarter first. Within a quarter the lines are in the order
 * they happened: live events while it was open, its headlines at resolution, then live events during its reveal.
 */
export function wireGroups(rounds: Record<string, RoundNode>, wire: Record<string, WireNode>): WireGroup[] {
  type Keyed = WireLine & { seq: number; order: number; i: number };
  const all: Keyed[] = [];
  for (const [key, r] of Object.entries(rounds)) {
    const n = Number(key);
    if (!Number.isInteger(n) || n <= 0) continue;
    r.headlines.forEach((h, i) => all.push({ round: n, at: r.resolvedAt, kind: kindLabel(h.kind), text: h.text, tone: wireTone(h.kind), seq: n, order: 0, i }));
  }
  Object.entries(wire)
    .sort(([ka, a], [kb, b]) => a.at - b.at || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .forEach(([, e], i) => all.push({ round: Math.max(0, e.round), at: e.at || null, kind: kindLabel(e.kind), text: e.text, tone: wireTone(e.kind), seq: e.seq, order: 1, i }));
  const byRound = new Map<number, Keyed[]>();
  for (const l of all) byRound.set(l.round, [...(byRound.get(l.round) ?? []), l]);
  return [...byRound.entries()]
    .sort(([a], [b]) => b - a)
    .map(([round, lines]) => ({
      round,
      lines: lines
        .sort((a, b) => a.seq - b.seq || a.order - b.order || a.i - b.i)
        .map(({ round: r, at, kind, text, tone }) => ({ round: r, at, kind, text, tone })),
    }));
}

/** Quarters the selector offers: PRE (0) up to the current quarter, every earlier quarter included. */
export function quarterRange(groups: ReadonlyArray<WireGroup>, current: number): number[] {
  const top = Math.max(current, 0, ...groups.map((g) => g.round));
  return Array.from({ length: top + 1 }, (_, i) => i);
}

export interface OffWireLine {
  round: number;
  kind: string;
  text: string;
  tone: WireTone;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = (text: string, ticker: string): boolean => new RegExp(`(^|[^A-Z])${escape(ticker)}([^A-Z]|$)`).test(text);

const CARD_KIND: Partial<Record<Card, HeadlineKind>> = {
  POACH: 'poach',
  PUBLISH: 'publish',
  LOBBY: 'lobby',
  BLITZ: 'blitz',
  SHARE: 'share',
  RUSH: 'rush',
};

/**
 * Events of quarter `round` that no headline of that quarter reports (§14.2 "NOT ON THE WIRE"): incidents, cards played,
 * audits and insolvencies, from the engine history. Facilitator only: the lines name cards, pace and safety.
 */
export function notOnWire(history: EngineState['history'], round: number, tickers: Readonly<Record<string, string>>, pactNames: Readonly<Record<string, string>>): OffWireLine[] {
  const rec = history.find((h) => h.round === round);
  if (!rec) return [];
  const prev = history.find((h) => h.round === round - 1);
  const heads = rec.headlines;
  const said = (kind: HeadlineKind, ...tickers_: string[]): boolean => heads.some((h) => h.kind === kind && tickers_.every((t) => names(h.text, t)));
  const tk = (id: string): string => tickers[id] ?? id;
  const out: OffWireLine[] = [];
  const ids = Object.keys(rec.firms);
  const order = rec.incidentFirms.length ? [...rec.incidentFirms, ...ids.filter((id) => !rec.incidentFirms.includes(id))] : ids;
  // Incidents first, in creation order when stored (the engine writes incidentFirms in that order).
  for (const id of order) {
    const f = rec.firms[id];
    if (!f?.incident || said('incident', tk(id))) continue;
    out.push({ round, kind: 'INCID', text: `${tk(id)} had an incident · pace ${f.pace} · safety ${f.safety}%`, tone: 'down' });
  }
  for (const id of ids) {
    const f = rec.firms[id];
    if (!f || f.card === 'NONE') continue;
    const kind = CARD_KIND[f.card];
    const target = f.card === 'POACH' && f.target ? tk(f.target) : null;
    if (kind && said(kind, tk(id), ...(target ? [target] : []))) continue;
    out.push({ round, kind: f.card, text: target ? `${tk(id)} played POACH on ${target}` : `${tk(id)} played ${f.card}`, tone: 'wire' });
  }
  for (const a of rec.audits) {
    const pact = pactNames[a.pactId] ?? a.pactId;
    const mode = a.kind === 'manual' ? 'manual' : 'automatic';
    if (a.breaches.length === 0) {
      if (!said('audit-clean', pact)) out.push({ round, kind: 'AUDIT', text: `${mode} audit of ${pact}: full compliance`, tone: 'up' });
      continue;
    }
    for (const b of a.breaches) {
      if (said('breach', tk(b.firmId), pact)) continue;
      const outcome = b.expelled ? 'expelled' : b.waived ? 'fine waived' : `fine ${b.fine.toFixed(1)}`;
      out.push({ round, kind: 'BREACH', text: `${mode} audit of ${pact}: ${tk(b.firmId)} breached · ${outcome}`, tone: 'down' });
    }
  }
  for (const id of ids) {
    const f = rec.firms[id];
    const before = prev?.firms[id]?.insolvent ?? false;
    if (!f?.insolvent || before || said('insolvency', tk(id))) continue;
    out.push({ round, kind: 'INSOLV', text: `${tk(id)} became insolvent`, tone: 'down' });
  }
  return out;
}

/** Ticker by firm id, from the public firm list. */
export const tickerMap = (firms: Record<string, FirmNode>): Record<string, string> => Object.fromEntries(Object.entries(firms).map(([id, f]) => [id, f.ticker]));

export type Selection = number | 'all';

/** The selected quarter (or every quarter) as plain text, for the debrief. `time` formats a server time. */
export function copyText(
  selection: Selection,
  groups: ReadonlyArray<WireGroup>,
  off: (round: number) => OffWireLine[],
  time: (at: number) => string,
  title: string,
  /** Last resolved quarter: only resolved quarters have a NOT ON THE WIRE section. */
  resolved: number,
): string {
  const chosen = selection === 'all' ? groups : groups.filter((g) => g.round === selection);
  const rounds = selection === 'all' ? chosen.map((g) => g.round) : [selection];
  const lines = [`FRONTIER WIRE · ${title} · ${selection === 'all' ? 'ALL QUARTERS' : groupLabel(selection)}`];
  for (const r of rounds) {
    const g = chosen.find((x) => x.round === r);
    lines.push('', groupLabel(r));
    if (!g || g.lines.length === 0) lines.push('No wire entries.');
    for (const l of g?.lines ?? []) lines.push(`${groupLabel(l.round)}  ${l.at !== null ? time(l.at) : '--:--:--'}  ${l.kind.padEnd(7)}  ${l.text}`);
    const o = off(r);
    if (r > 0 && r <= resolved) {
      lines.push('NOT ON THE WIRE');
      if (o.length === 0) lines.push('Nothing left out.');
      for (const l of o) lines.push(`${groupLabel(l.round)}  ${l.kind.padEnd(7)}  ${l.text}`);
    }
  }
  return lines.join('\n');
}
