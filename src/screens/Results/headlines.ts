/**
 * Results panel headlines (spec §14.4): one sentence per panel, written from the data, so the
 * panel's main point can be read without the facilitator. Pure; copy follows §15.
 */
import { PARAMS, type FinalResults, type FirmFinal } from '../../engine';
import { fmt, fmtShare, quarterLabel } from '../../ui/format';
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

/** Panel 1: "8 of 9 firms finished below their peak. 2 finished below zero." */
export function finalBoardHeadline(r: FinalResults): string {
  const firms = Object.values(r.final);
  const n = firms.length;
  if (n === 0) return 'No firm took part.';
  const below = firms.filter(belowPeak).length;
  const neg = firms.filter((f) => belowZero(f.valuation)).length;
  let first: string;
  if (below === 0) first = n === 1 ? 'The firm finished at its peak.' : 'Every firm finished at its peak.';
  else if (below === n && n > 1) first = `${n === 2 ? 'Both' : `All ${n}`} firms finished below their peak.`;
  else first = `${below} of ${n} ${plural(n, 'firm', 'firms')} finished below ${plural(below, 'its', 'their')} peak.`;
  let second: string;
  if (neg === 0) second = 'None finished below zero.';
  else if (neg === n && n > 1) second = `${n === 2 ? 'Both' : `All ${n}`} finished below zero.`;
  else second = `${neg} finished below zero.`;
  return `${first} ${second}`;
}

/** Panel 2: "Trust fell from 72.0 to 45.6 over 14 quarters." plus the moratorium quarter. */
export function trustHeadline(r: FinalResults): string {
  const q = r.trust.length;
  if (q === 0) return 'No quarter was resolved.';
  const from = fmt(r.startTrust);
  const last = r.trust[q - 1] ?? r.startTrust;
  const to = fmt(last);
  const over = `over ${q} ${plural(q, 'quarter', 'quarters')}`;
  const move = to === from ? `Trust held at ${to} ${over}.` : `Trust ${last < r.startTrust ? 'fell' : 'rose'} from ${from} to ${to} ${over}.`;
  return r.collapseRound !== null ? `${move} The moratorium began in ${quarterLabel(r.collapseRound)}.` : move;
}

/** Panel 3: "Holding pace 2 and safety 15 would have left the industry worth 3.2× what it kept." */
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

/** Panel 4: "HUMN caused 24.8% of the damage and kept 29.9% of the value." Ties (as displayed) name every tied firm. */
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
 * Panel 5 (Session 18): "Ranked by value created for the whole market, HUMN falls from 1st to 8th and ARCN rises from
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

/** Panel 6: "2 pacts formed. Members broke the terms 7 times; 4 breaches were never detected." */
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

/** Panel 7: no data to summarise; the prompts are the content. */
export const DEBRIEF_HEADLINE = 'Five questions. Discuss each in your firm, then with the room.';

/** The headline for results panel `step` (0-based, the order of RESULT_PANELS). */
export function panelHeadline(r: FinalResults, step: number): string {
  switch (step) {
    case 0:
      return finalBoardHeadline(r);
    case 1:
      return trustHeadline(r);
    case 2:
      return counterfactualHeadline(r);
    case 3:
      return attributionHeadline(r);
    case 4:
      return contributionHeadline(r);
    case 5:
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
