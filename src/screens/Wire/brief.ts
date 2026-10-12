/**
 * QUARTER BRIEF (spec §14.2, Session 19): a facilitator-only block at the top of each resolved quarter on `#/wire`.
 * Where the quarter's trust change came from (`trustBreakdown`), which firms drew most, and the conduct of the top and
 * bottom halves of the board. Pure.
 *
 * Facilitator only: it reads the engine history (pace, safety, draw and cards, even while disclosure is off). It must
 * never be imported by `#/screen`, `#/play` or `#/results` (tests/ui/hidden-paths.test.ts). It never shows τ or the end
 * round.
 */
import { trustBreakdown, type Card, type EngineState, type Params, type TrustBreakdown } from '../../engine';
import { fmt } from '../../ui/format';
import { ordinal } from '../../ui/performance';

export interface QuarterBrief {
  round: number;
  /** The breakdown the sentences are built from; its terms sum to `dT`. */
  breakdown: TrustBreakdown;
  /** Plain sentences, in display order. */
  lines: string[];
}

/** Conduct ledger side of each card (spec §10): ▲ for the market, ▼ against it. */
const SIDE: Partial<Record<Card, '▲' | '▼'>> = { PUBLISH: '▲', SHARE: '▲', POACH: '▼', BLITZ: '▼', LOBBY: '▼', RUSH: '▼' };

export const CLOSING_LINE = 'Every trust loss this quarter came from firms’ own pace, safety, cards and incidents.';

/** Terms under 1 keep two decimals, without a trailing zero (PUBLISH +0.25, LOBBY −0.5); the rest one. Signed. */
function term(x: number): string {
  const s = Math.abs(x) < 1 ? fmt(x, 2).replace(/(\.\d)0$/, '$1') : fmt(x, 1);
  return x > 0 && Number(s) !== 0 ? `+${s}` : s;
}

/** Tickers for a term, at most 5, then "+N". */
function who(ids: ReadonlyArray<string>, tk: (id: string) => string): string {
  if (ids.length === 0) return '';
  const shown = ids.slice(0, 5).map(tk).join(' ');
  return ` (${ids.length > 5 ? `${shown} +${ids.length - 5}` : shown})`;
}

/**
 * The brief for `round`, or null when the quarter has not resolved. `firms` is the engine's firm list in creation
 * order (ties in draw keep that order); `tickers` and `pactNames` map ids to display names.
 */
export function quarterBrief(
  engine: Pick<EngineState, 'history' | 'firms'>,
  round: number,
  tickers: Readonly<Record<string, string>>,
  pactNames: Readonly<Record<string, string>>,
  p?: Params,
): QuarterBrief | null {
  const b = trustBreakdown(engine.history, round, p);
  const rec = engine.history.find((h) => h.round === round);
  if (!b || !rec) return null;
  const tk = (id: string): string => tickers[id] ?? id;
  const order = engine.firms.map((f) => f.id).filter((id) => id in rec.firms);
  for (const id of Object.keys(rec.firms)) if (!order.includes(id)) order.push(id);

  // 1. The trust change and its terms.
  const head =
    Math.abs(b.dT) < 0.05 ? `Trust unchanged at ${fmt(b.to)}.` : `Trust ${b.dT > 0 ? '▲' : '▼'}${fmt(Math.abs(b.dT))} to ${fmt(b.to)}.`;
  const parts = [`Recovery ${term(b.recovery)}`, `draw ${term(b.draw)}`];
  if (b.incidentFirms.length) parts.push(`incidents ${term(b.incidents)}${who(b.incidentFirms, tk)}`);
  if (b.publishFirms.length) parts.push(`PUBLISH ${term(b.publish)}${who(b.publishFirms, tk)}`);
  if (b.lobbyFirms.length) parts.push(`LOBBY ${term(b.lobby)}${who(b.lobbyFirms, tk)}`);
  if (b.clamp !== 0) parts.push(`${b.clamp > 0 ? 'floor at 0' : 'ceiling at 100'} ${term(b.clamp)}`);
  if (b.moratoriumNow) parts.push(`moratorium ${term(b.moratorium)}`);
  const lines = [`${head} ${parts.join(' · ')}.`];

  // 2. The three largest draws, with the firm's rank after the quarter.
  const byDraw = order
    .map((id, i) => ({ id, i, f: rec.firms[id]! }))
    .sort((a, c) => c.f.draw - a.f.draw || a.i - c.i)
    .slice(0, 3);
  if (byDraw.length) {
    lines.push(
      `Largest draws: ${byDraw.map(({ id, f }) => `${tk(id)} ${fmt(f.draw)} (${ordinal(f.rank)}, pace ${f.pace} · safety ${f.safety})`).join(' · ')}.`,
    );
  }

  // 3. Cards and audited breaches by board half (top half = rank ≤ ceil(N/2)), in rank order.
  const n = order.length;
  const cut = Math.ceil(n / 2);
  const breachesBy = new Map<string, string[]>();
  for (const a of rec.audits) {
    for (const br of a.breaches) breachesBy.set(br.firmId, [...(breachesBy.get(br.firmId) ?? []), pactNames[a.pactId] ?? a.pactId]);
  }
  const conduct = (top: boolean): string[] =>
    order
      .filter((id) => (rec.firms[id]!.rank <= cut) === top)
      .sort((a, c) => rec.firms[a]!.rank - rec.firms[c]!.rank)
      .flatMap((id) => {
        const f = rec.firms[id]!;
        const out: string[] = [];
        const side = SIDE[f.card];
        if (side) out.push(`${side} ${f.card} ${tk(id)}`);
        for (const pact of breachesBy.get(id) ?? []) out.push(`▼ breach ${pact} ${tk(id)}`);
        return out;
      });
  const half = (label: string, items: string[]): string => `${label}: ${items.length ? items.join(' · ') : 'no cards or breaches'}.`;
  lines.push(`${half('Top half', conduct(true))} ${half('Bottom half', conduct(false))}`);

  // 4. Always true in the model: there is no trust loss from chance alone.
  lines.push(CLOSING_LINE);
  return { round, breakdown: b, lines };
}
