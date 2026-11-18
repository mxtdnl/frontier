/**
 * Results panel headlines (spec §14.4): one sentence per panel, written from the data, so the
 * panel's main point can be read without the facilitator. Pure; copy follows §15.
 */
import { PARAMS, type FinalResults, type FirmFinal } from '../../engine';
import { fmt, fmtShare } from '../../ui/format';
import { ordinal } from '../../ui/performance';

/** A final valuation within this of the peak reads as "at peak", as on the dumbbell. */
const AT_PEAK = 0.05;

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** "A", "A and B", "A, B and C". */
function listOf(items: ReadonlyArray<string>): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const belowPeak = (f: Pick<FirmFinal, 'valuation' | 'peakValuation'>): boolean => f.peakValuation - f.valuation >= AT_PEAK;
/** Below zero as displayed (one decimal), so the sentence agrees with the red figures. */
const belowZero = (v: number): boolean => fmt(v).startsWith('−');

/** Panel 1: "Holding pace 2 and safety 15 would have left the industry worth 3.2× what it kept." */
export function counterfactualHeadline(r: FinalResults, alt: { pace: number; safety: number } = PARAMS.BOT_SUSTAINABLE): string {
  const { actual, counterfactual: alternative } = r.industry;
  const holding = `pace ${alt.pace} and safety ${alt.safety}`;
  const gap = alternative - actual;
  if (fmt(gap, 0) === '0') return `The industry finished where holding ${holding} would have left it.`;
  if (gap < 0) return `The industry finished ${fmt(-gap, 0)} above what holding ${holding} would have left.`;
  if (actual > 0) {
    const ratio = alternative / actual;
    if (fmt(ratio) !== '1.0') return `Holding ${holding} would have left the industry worth ${fmt(ratio)}× what it kept.`;
    return `Holding ${holding} would have left the industry worth ${fmt(gap, 0)} more than it kept.`;
  }
  const altText = alternative > 0 ? `worth ${fmt(alternative, 0)}` : `at ${fmt(alternative, 0)}`;
  return `Holding ${holding} would have left the industry ${altText}; it finished at ${fmt(actual, 0)}.`;
}

/** Panel 2: "HUMN caused 24.8% of the damage and kept 29.9% of the value." Ties (as displayed) name every tied firm. */
export function attributionHeadline(r: FinalResults): string {
  const rows = r.attribution;
  const top = rows[0];
  if (!top || !(top.drawShare > 0)) return 'No firm drew down trust.';
  const share = fmtShare(top.drawShare);
  const tied = rows
    .filter((a) => fmtShare(a.drawShare) === share)
    .map((a) => ({ ticker: r.final[a.firmId]?.ticker ?? '?', value: a.valueShare, valuation: a.valuation }))
    .sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  const anyPositive = Object.values(r.final).some((f) => f.valuation > 0);
  const kept = (v: { value: number; valuation: number }) => (v.valuation > 0 ? fmtShare(v.value) : 'none');
  if (tied.length === 1) {
    const t = tied[0]!;
    if (!anyPositive) return `${t.ticker} caused ${share} of the damage. No firm finished with positive value.`;
    return `${t.ticker} caused ${share} of the damage and kept ${kept(t)} of the value.`;
  }
  const names = listOf(tied.map((t) => t.ticker));
  if (!anyPositive) return `${names} each caused ${share} of the damage. No firm finished with positive value.`;
  return `${names} each caused ${share} of the damage; they kept ${listOf(tied.map(kept))} of the value.`;
}

/**
 * Panel 3 (Session 18): "Ranked by value created for the whole market, HUMN falls from 1st to 8th and ARCN rises from
 * 9th to 2nd." The valuation leader's move, then the largest rise; a sentence for every net contribution below zero and
 * for the moratorium cost.
 */
export function contributionHeadline(r: FinalResults): string {
  const c = r.contribution;
  const firms = Object.values(c?.firms ?? {});
  if (!c || firms.length === 0) return 'Net contribution was not computed for this session.';
  const lead = 'Ranked by value created for the whole market';
  const leader = firms.find((f) => f.valuationRank === 1);
  const rise = [...firms]
    .filter((f) => f.valuationRank - f.rank > 0)
    .sort((a, b) => b.valuationRank - b.rank - (a.valuationRank - a.rank) || a.rank - b.rank || (a.ticker < b.ticker ? -1 : 1))[0];
  const parts: string[] = [];
  if (leader && leader.rank !== 1) parts.push(`${leader.ticker} falls from 1st to ${ordinal(leader.rank)}`);
  if (rise && rise.firmId !== leader?.firmId) parts.push(`${rise.ticker} rises from ${ordinal(rise.valuationRank)} to ${ordinal(rise.rank)}`);
  let first: string;
  if (parts.length === 0) first = `${lead}, every firm keeps its place.`;
  else if (leader && leader.rank === 1) first = `${lead}, ${leader.ticker} holds 1st and ${parts.join(' and ')}.`;
  else first = `${lead}, ${parts.join(' and ')}.`;
  const out = [first];
  if (firms.every((f) => belowZero(f.netContribution))) out.push(`Every firm's net contribution is below zero.`);
  const m = c.moratorium;
  if (m) {
    const charged = firms.filter((f) => f.moratoriumShare > 0).length;
    out.push(
      m.allocated > 0
        ? `The moratorium cost ${fmt(m.total, 0)}, charged to the ${charged} ${plural(charged, 'firm', 'firms')} that drew trust down before it.`
        : `The moratorium cost ${fmt(m.total, 0)}; no firm had drawn trust down before it, so none is charged.`,
    );
  }
  return out.join(' ');
}

/**
 * CONDUCT (panel 4, Session 20): the firm whose market effect did the most harm and the one that did the most for
 * the market. "BTAG did the most harm to the market: ▼433. ARCN did the most for it: ▲120."
 */
export function conductHeadline(r: FinalResults): string {
  const firms = Object.values(r.contribution?.firms ?? {});
  if (firms.length === 0) return 'Net contribution was not computed for this session.';
  const byTicker = (a: { ticker: string }, b: { ticker: string }): number => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0);
  const worst = [...firms].sort((a, b) => a.marketEffect - b.marketEffect || byTicker(a, b))[0];
  const best = [...firms].sort((a, b) => b.marketEffect - a.marketEffect || byTicker(a, b))[0];
  const shown = (v: number): string => fmt(Math.abs(v), 0);
  const harm = worst && worst.marketEffect < 0 && shown(worst.marketEffect) !== '0' ? worst : null;
  const help = best && best.marketEffect > 0 && shown(best.marketEffect) !== '0' ? best : null;
  const out: string[] = [];
  out.push(harm ? `${harm.ticker} did the most harm to the market: ▼${shown(harm.marketEffect)}.` : 'No firm harmed the market.');
  out.push(help ? `${help.ticker} did the most for it: ▲${shown(help.marketEffect)}.` : 'No firm added to the market.');
  return out.join(' ');
}

/** Panel 5: "2 pacts formed. Members broke the terms 7 times; 4 breaches were never detected." */
export function pactHeadline(r: FinalResults): string {
  const n = r.pacts.length;
  if (n === 0) return 'No pacts were formed.';
  const dissolved = r.pacts.filter((p) => p.status === 'dissolved').length;
  const formed = `${n} ${plural(n, 'pact', 'pacts')} formed${dissolved > 0 ? `; ${dissolved === n && n > 1 ? 'all' : dissolved} dissolved` : ''}.`;
  const breaches = r.pacts.reduce((a, p) => a + p.detected + p.undetected, 0);
  const hidden = r.pacts.reduce((a, p) => a + p.undetected, 0);
  if (breaches === 0) return `${formed} Every member kept the terms.`;
  const times = breaches === 1 ? 'once' : breaches === 2 ? 'twice' : `${breaches} times`;
  let tail: string;
  if (hidden === 0) tail = breaches === 1 ? 'the breach was detected' : 'every breach was detected';
  else if (hidden === breaches) tail = breaches === 1 ? 'the breach was never detected' : 'no breach was detected';
  else tail = `${hidden} ${plural(hidden, 'breach was', 'breaches were')} never detected`;
  return `${formed} Members broke the terms ${times}; ${tail}.`;
}

/** Panel 6: no data to summarise; the prompts are the content. */
export const DEBRIEF_HEADLINE = 'Five questions. Discuss each in your firm, then with the room.';

/** The headline for results panel `step` (0-based, the order of RESULT_PANELS). */
export function panelHeadline(r: FinalResults, step: number): string {
  switch (step) {
    case 0:
      return counterfactualHeadline(r);
    case 1:
      return attributionHeadline(r);
    case 2:
      return contributionHeadline(r);
    case 3:
      return conductHeadline(r);
    case 4:
      return pactHeadline(r);
    default:
      return DEBRIEF_HEADLINE;
  }
}

/** The participant card's opening sentence (§14.4): "You finished 2nd of 9, 12.5% below your peak." */
export function ownResultSentence(own: Pick<FirmFinal, 'rank' | 'valuation' | 'peakValuation'>, firms: number): string {
  const head = `You finished ${ordinal(own.rank)} of ${firms}`;
  const atPeak = !belowPeak(own);
  if (belowZero(own.valuation)) {
    return atPeak ? `${head}, below zero at ${fmt(own.valuation)}.` : `${head}, below zero at ${fmt(own.valuation)}, from a peak of ${fmt(own.peakValuation)}.`;
  }
  if (atPeak) return `${head}, at your peak.`;
  // Not below zero and not at peak, so the peak is above zero.
  return `${head}, ${fmt(((own.peakValuation - own.valuation) / own.peakValuation) * 100)}% below your peak.`;
}
