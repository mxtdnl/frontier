/**
 * Session 9 audit: dominant-strategy search and the single-firm moratorium check.
 * Uses the engine exactly as the game does; changes no mechanic and no parameter.
 *
 *   npx tsx tools/audit-strategies.ts --seeds 100 --out reports/strategy-audit.md
 *   npx tsx tools/audit-strategies.ts --seeds 100 --params overrides.json --out reports/x.md
 *
 * Sections
 * 1. Strategy grid: firm 0 plays every fixed (pace, safety, card rotation) strategy, plus
 *    end-game and early-race switches, against four fields (restrained, greedy, defaults,
 *    mixed). Compared with the two reference strategies, greedy and sustainable (§8.1).
 * 2. Symmetric check: every firm plays the same strategy. Flags any strategy that avoids a
 *    moratorium and still beats an all-sustainable field per firm.
 * 3. Pact breach: firm 0 breaches a pact all firms belong to, with automatic audits.
 * 4. Single-firm moratorium: the worst strategy for trust, one firm against a restrained or
 *    defaults field, at N = 2–8.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  PARAMS,
  allowedCards,
  createGame,
  emptyPactPrivate,
  resolveRound,
  type Card,
  type Decision,
  type EngineState,
  type FirmInit,
  type Pace,
  type Params,
  type Policy,
} from '../src/engine';
import { mean, median, quantile } from './calibration/scenarios';

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};
const SEEDS = Number(arg('seeds') ?? 100);
const OUT = arg('out') ?? 'reports/strategy-audit.md';
const ROUNDS = 14;
const overridesPath = arg('params');
const p: Params = { ...PARAMS, ...(overridesPath ? (JSON.parse(readFileSync(overridesPath, 'utf8')) as Partial<Params>) : {}) };

// ── strategies ────────────────────────────────────────────────────────────────

/** A firm-0 strategy: a decision from the state before the quarter (round = quarter about to resolve). */
interface Strategy {
  id: string;
  /** Bot policy for the reference strategies; null for scripted ones. */
  policy: Policy | null;
  decide: (s: EngineState, round: number) => Decision;
}

/** Highest-valued other firm that is not the previous POACH target. */
function poachTarget(s: EngineState): string | null {
  const me = s.firms[0];
  if (!me) return null;
  return (
    [...s.firms].filter((f) => f.id !== me.id && f.id !== me.lastPoachTarget).sort((a, b) => b.valuation - a.valuation)[0]?.id ?? null
  );
}

/** Card plans. A card cannot repeat, so a plan alternates between two choices. */
const PLANS: Record<string, ReadonlyArray<Card>> = {
  none: ['NONE'],
  publish: ['PUBLISH', 'NONE'],
  blitz: ['BLITZ', 'NONE'],
  lobby: ['LOBBY', 'NONE'],
  poach: ['POACH', 'NONE'],
  'publish+blitz': ['PUBLISH', 'BLITZ'],
  'poach+blitz': ['POACH', 'BLITZ'],
  'publish+poach': ['PUBLISH', 'POACH'],
  share: ['SHARE', 'NONE'],
  rush: ['RUSH', 'NONE'],
  'rush+poach': ['RUSH', 'POACH'],
  'rush+blitz': ['RUSH', 'BLITZ'],
  'share+publish': ['SHARE', 'PUBLISH'],
};

function scripted(id: string, pace: (round: number) => Pace, safety: (round: number) => number, plan: ReadonlyArray<Card>): Strategy {
  return {
    id,
    policy: null,
    decide: (s, round) => {
      const me = s.firms[0];
      const want = plan[(round - 1) % plan.length] ?? 'NONE';
      const card = me && allowedCards(me).includes(want) ? want : 'NONE';
      const target = card === 'POACH' ? poachTarget(s) : null;
      return { pace: pace(round), safety: safety(round), card: card === 'POACH' && !target ? 'NONE' : card, target };
    },
  };
}

const PACES: Pace[] = [1, 2, 3, 4];
const SAFETIES = [0, 5, 10, 15, 20, 30];

function grid(): Strategy[] {
  const out: Strategy[] = [];
  for (const pace of PACES)
    for (const s of SAFETIES)
      for (const [name, plan] of Object.entries(PLANS)) out.push(scripted(`p${pace} s${s} ${name}`, () => pace, () => s, plan));
  // Switches: restrained until quarter k, then race (end-game defection), and the reverse.
  for (const k of [6, 8, 10, 12]) out.push(scripted(`p2 s15 → p4 s0 blitz from q${k}`, (r) => (r < k ? 2 : 4), (r) => (r < k ? 15 : 0), ['BLITZ', 'NONE']));
  for (const k of [4, 6, 8]) out.push(scripted(`p4 s0 blitz → p2 s15 from q${k}`, (r) => (r < k ? 4 : 2), (r) => (r < k ? 0 : 15), ['BLITZ', 'NONE']));
  return out;
}

const REF_GREEDY: Strategy = { id: 'REF greedy (bot)', policy: 'greedy', decide: () => ({ pace: 3, safety: 5, card: 'NONE', target: null }) };
const REF_SUST: Strategy = { id: 'REF sustainable (bot)', policy: 'sustainable', decide: () => ({ pace: 2, safety: 15, card: 'NONE', target: null }) };

// ── fields ────────────────────────────────────────────────────────────────────

type Other = { policy: Policy } | 'defaults';
const FIELDS: Record<string, (n: number) => Other[]> = {
  restrained: (n) => Array.from({ length: n - 1 }, () => ({ policy: 'sustainable' as const })),
  greedy: (n) => Array.from({ length: n - 1 }, () => ({ policy: 'greedy' as const })),
  defaults: (n) => Array.from({ length: n - 1 }, () => 'defaults' as const),
  mixed: (n) =>
    Array.from({ length: n - 1 }, (_, i) => ({ policy: (['cautious', 'standard', 'greedy', 'mimic-leader'] as const)[i % 4] ?? 'standard' })),
};

// ── simulation ────────────────────────────────────────────────────────────────

interface Run {
  /** Firm 0's valuation after each quarter. */
  v0: number[];
  /** Mean valuation of the other firms after each quarter. */
  vOthers: number[];
  collapseRound: number | null;
  /** Firm 0's share of cumulative draw at the end. */
  drawShare: number;
  fines: number;
}

function run(
  seed: number,
  strat: Strategy | null,
  others: Other[],
  opts: { rounds?: number; autoAuditP?: number; pact?: { maxPace: Pace | null; minSafety: number | null } } = {},
  /** When strat is null, every firm (including firm 0) uses `allStrat`. */
  allStrat: Strategy | null = null,
): Run {
  const rounds = opts.rounds ?? ROUNDS;
  const setups: Array<{ policy: Policy | null; strat: Strategy | null }> = [];
  if (strat) setups.push({ policy: strat.policy, strat: strat.policy ? null : strat });
  else setups.push({ policy: allStrat?.policy ?? null, strat: allStrat?.policy ? null : allStrat });
  for (const o of others) {
    if (allStrat) setups.push({ policy: allStrat.policy, strat: allStrat.policy ? null : allStrat });
    else setups.push(o === 'defaults' ? { policy: null, strat: null } : { policy: o.policy, strat: null });
  }
  const firms: FirmInit[] = setups.map((s, i) => ({ id: `f${i}`, ticker: `F${i}`, isBot: s.policy !== null, botPolicy: s.policy }));
  let s = createGame(
    { label: 'AUD', endMode: 'manual', minEnd: p.END_MIN, maxEnd: p.END_MAX, fixedEnd: null, disclosure: false, autoAuditP: opts.autoAuditP ?? 0 },
    firms,
    seed,
    p,
  );
  if (opts.pact) {
    s.pacts.push({
      id: 'pk',
      name: 'PACT-A',
      proposer: 'f1',
      terms: { maxPace: opts.pact.maxPace, minSafety: opts.pact.minSafety },
      members: Object.fromEntries(firms.map((f) => [f.id, 0])),
      createdRound: 0,
      status: 'active',
    });
    s.pactsPrivate.pk = emptyPactPrivate();
  }
  const out: Run = { v0: [], vOthers: [], collapseRound: null, drawShare: 0, fines: 0 };
  for (let r = 1; r <= rounds; r++) {
    const decisions: Record<string, Decision> = {};
    setups.forEach((st, i) => {
      if (!st.strat) return;
      // Scripted strategies decide from their own firm's view: rotate the state so they see themselves first.
      const view = i === 0 ? s : { ...s, firms: [s.firms[i], ...s.firms.filter((_, j) => j !== i)] as EngineState['firms'] };
      decisions[`f${i}`] = st.strat.decide(view, r);
    });
    const res = resolveRound(s, decisions, p);
    for (const a of res.outputs.audits) for (const b of a.breaches) if (b.firmId === 'f0') out.fines += b.fine;
    s = res.state;
    if (s.history.length > 1) s.history = s.history.slice(-1);
    out.v0.push(s.firms[0]?.valuation ?? 0);
    out.vOthers.push(mean(s.firms.slice(1).map((f) => f.valuation)));
  }
  out.collapseRound = s.collapseRound;
  const total = s.firms.reduce((a, f) => a + f.cumulativeDraw, 0);
  out.drawShare = total > 0 ? (s.firms[0]?.cumulativeDraw ?? 0) / total : 0;
  return out;
}

/** Expected valuation under the default hidden end (uniform over quarters 10–14). */
const vEnd = (v: number[]): number => mean(v.slice(p.END_MIN - 1, p.END_MAX));

interface Eval {
  id: string;
  v14: number;
  vEnd: number;
  collapse14: number;
  drawShare: number;
}

function evaluate(strat: Strategy, field: string, n: number): Eval {
  const others = FIELDS[field]?.(n) ?? [];
  const v14: number[] = [];
  const ve: number[] = [];
  const dr: number[] = [];
  let col = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = run(seed, strat, others);
    v14.push(r.v0[ROUNDS - 1] ?? 0);
    ve.push(vEnd(r.v0));
    dr.push(r.drawShare);
    if (r.collapseRound !== null) col++;
  }
  return { id: strat.id, v14: median(v14), vEnd: median(ve), collapse14: col / SEEDS, drawShare: mean(dr) };
}

// ── report ────────────────────────────────────────────────────────────────────

const lines: string[] = [];
const line = (s = ''): void => {
  lines.push(s);
};
const f1 = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : '–');
const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const t0 = Date.now();

line('# Strategy audit');
line();
line(`Generated by \`npx tsx tools/audit-strategies.ts --seeds ${SEEDS}${overridesPath ? ` --params ${overridesPath}` : ''}\`. Seeds 1–${SEEDS}. ${overridesPath ? `\`params.ts\` values with overrides ${JSON.stringify(JSON.parse(readFileSync(overridesPath, 'utf8')))}` : 'Current `params.ts` values'}; no mechanic changed.`);
line('Valuations are medians across seeds. "V end" is the mean of quarters 10–14 (the default hidden end range), "V14" is quarter 14.');
line();

const NS = [4, 8, 12];
const strategies = grid();
const fieldNames = Object.keys(FIELDS);

// 1. Grid
line('## 1. Best response by field');
line();
line(`Firm 0 tries ${strategies.length} scripted strategies (pace 1–4 × safety ${SAFETIES.join('/')} × ${Object.keys(PLANS).length} card plans, plus switches) and the two references.`);
line('A strategy is **dominant** if it is the best response in every field and N. A strategy **beats both references** in a field if its V end is above both greedy and sustainable there.');
line();
const bestBy: Record<string, string> = {};
const beatsBoth = new Map<string, number>();
const cells = NS.length * fieldNames.length;
line('| N | field | best strategy | V end | collapse by 14 | draw share | greedy V end | sustainable V end | best / greedy |');
line('|---|---|---|---|---|---|---|---|---|');
for (const n of NS) {
  for (const field of fieldNames) {
    const g = evaluate(REF_GREEDY, field, n);
    const su = evaluate(REF_SUST, field, n);
    const evals = strategies.map((st) => evaluate(st, field, n));
    evals.sort((a, b) => b.vEnd - a.vEnd);
    const best = evals[0];
    if (!best) continue;
    bestBy[`${n}/${field}`] = best.id;
    for (const e of evals) if (e.vEnd > g.vEnd && e.vEnd > su.vEnd) beatsBoth.set(e.id, (beatsBoth.get(e.id) ?? 0) + 1);
    line(`| ${n} | ${field} | ${best.id} | ${f1(best.vEnd)} | ${pct(best.collapse14)} | ${pct(best.drawShare)} | ${f1(g.vEnd)} | ${f1(su.vEnd)} | ${f1(best.vEnd / g.vEnd)}× |`);
    // Top five for the record.
    if (n === 8) {
      bestBy[`top/${field}`] = evals
        .slice(0, 5)
        .map((e) => `${e.id} (${f1(e.vEnd)}, collapse ${pct(e.collapse14)})`)
        .join('; ');
    }
  }
}
line();
const bestIds = new Set(Object.entries(bestBy).filter(([k]) => !k.startsWith('top/')).map(([, v]) => v));
line(`Distinct best responses across ${cells} field × N cells: ${bestIds.size} (${[...bestIds].join(', ')}).`);
line(`Dominant strategy (best in every cell): **${bestIds.size === 1 ? [...bestIds][0] : 'none'}**.`);
const always = [...beatsBoth.entries()].filter(([, c]) => c === cells).map(([id]) => id);
line(`Strategies that beat both references in every cell: ${always.length}${always.length ? ` (${always.slice(0, 12).join(', ')}${always.length > 12 ? ', …' : ''})` : ''}.`);
line();
line('Top five at N = 8, by field:');
line();
for (const field of fieldNames) line(`- ${field}: ${bestBy[`top/${field}`] ?? '–'}`);
line();

// 1b. Cards in isolation: the value of each card plan at a fixed pace and safety.
for (const field of fieldNames) {
  line(`### Card plans at fixed pace and safety (N = 8, ${field} field)`);
  line();
  line('V end, then the moratorium share by quarter 14 in brackets.');
  line();
  line('| pace / safety | ' + Object.keys(PLANS).join(' | ') + ' |');
  line('|---|' + Object.keys(PLANS).map(() => '---').join('|') + '|');
  for (const [pace, s] of [[2, 15], [3, 5], [4, 0], [4, 30]] as const) {
    const row = Object.entries(PLANS).map(([name, plan]) => {
      const e = evaluate(scripted(name, () => pace, () => s, plan), field, 8);
      return `${f1(e.vEnd)} (${pct(e.collapse14)})`;
    });
    line(`| p${pace} s${s} | ${row.join(' | ')} |`);
  }
  line();
}

// 2. Symmetric
line('## 2. Symmetric play: every firm uses the same strategy');
line();
line('Flags a strategy that avoids a moratorium in ≥ 99% of seeds over 30 quarters and gives a higher mean firm valuation at quarter 14 than an all-sustainable field. Such a strategy would let a whole class beat restraint without restraint.');
line();
line('| N | all-sustainable V14 | best symmetric strategy without moratorium | its V14 | its moratorium by 30 | flagged |');
line('|---|---|---|---|---|---|');
const symFlags: string[] = [];
const symTop: Record<number, string> = {};
for (const n of NS) {
  const meanV14 = (st: Strategy): { v: number; col: number } => {
    const vs: number[] = [];
    let col = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = run(seed, null, Array.from({ length: n - 1 }, () => 'defaults' as const), { rounds: 30 }, st);
      vs.push(((r.v0[ROUNDS - 1] ?? 0) + (n - 1) * (r.vOthers[ROUNDS - 1] ?? 0)) / n);
      if (r.collapseRound !== null) col++;
    }
    return { v: median(vs), col: col / SEEDS };
  };
  const base = meanV14(REF_SUST);
  const safe = strategies
    .filter((x) => !x.id.includes('→'))
    .map((st) => ({ id: st.id, ...meanV14(st) }))
    .filter((r) => r.col <= 0.01)
    .sort((a, b) => b.v - a.v);
  const best = safe[0] ?? null;
  const flagged = best !== null && best.v > base.v && best.id !== 'p2 s15 none';
  if (flagged && best) symFlags.push(`N=${n}: ${best.id}`);
  symTop[n] = safe.slice(0, 5).map((r) => `${r.id} (${f1(r.v)})`).join('; ');
  line(`| ${n} | ${f1(base.v)} | ${best?.id ?? '–'} | ${f1(best?.v ?? NaN)} | ${pct(best?.col ?? NaN)} | ${flagged ? 'yes' : 'no'} |`);
}
line();
line('Top five symmetric strategies without a moratorium (mean firm V14):');
line();
for (const n of NS) line(`- N = ${n}: ${symTop[n] ?? '–'}`);
line();

// 3. Pact breach
line('## 3. Pact breach');
line();
line('All N = 8 firms are in one pact (maximum pace 2, minimum safety 10). Firms 1–7 comply (pace 2, safety 15). Automatic audits at the default 0.25 per quarter. Firm 0:');
line();
line('| firm 0 strategy | V end | fines paid (mean) | collapse by 14 | V end with no pact |');
line('|---|---|---|---|---|');
const pactStrats: Strategy[] = [
  scripted('comply: p2 s15 none', () => 2, () => 15, ['NONE']),
  scripted('breach: p4 s0 blitz', () => 4, () => 0, ['BLITZ', 'NONE']),
  scripted('breach: p4 s0 lobby (waiver)', () => 4, () => 0, ['LOBBY', 'NONE']),
  scripted('breach: p3 s5 none', () => 3, () => 5, ['NONE']),
  scripted('breach: p4 s30 blitz', () => 4, () => 30, ['BLITZ', 'NONE']),
];
for (const st of pactStrats) {
  const ve: number[] = [];
  const veNo: number[] = [];
  const fines: number[] = [];
  let col = 0;
  const others = Array.from({ length: 7 }, () => ({ policy: 'sustainable' as const }));
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = run(seed, st, others, { autoAuditP: 0.25, pact: { maxPace: 2, minSafety: 10 } });
    ve.push(vEnd(r.v0));
    fines.push(r.fines);
    if (r.collapseRound !== null) col++;
    veNo.push(vEnd(run(seed, st, others).v0));
  }
  line(`| ${st.id} | ${f1(median(ve))} | ${f1(mean(fines))} | ${pct(col / SEEDS)} | ${f1(median(veNo))} |`);
}
line();

// 4. Single-firm moratorium
line('## 4. Can one firm cause a moratorium on its own?');
line();
const S4 = Number(arg('seeds-single') ?? 500);
line(`One firm plays each pace 3–4 strategy at safety 0 or 5 with every card plan; the other firms are restrained (pace 2, safety 15) or keep the defaults (pace 2, safety 10). Seeds 1–${S4}. The worst strategy for each N and field is shown.`);
line();
line('| N | field | worst strategy | moratorium by 14 | by 30 | median quarter when it happens |');
line('|---|---|---|---|---|---|');
const single: Record<string, number> = {};
const worstCands = grid().filter((st) => /^p[34] s(0|5) /.test(st.id));
for (const n of [2, 3, 4, 5, 6, 8]) {
  for (const field of ['restrained', 'defaults']) {
    const others = FIELDS[field]?.(n) ?? [];
    let worst: { id: string; c14: number; c30: number; med: number } | null = null;
    for (const st of worstCands) {
      let c14 = 0;
      let c30 = 0;
      const when: number[] = [];
      for (let seed = 1; seed <= S4; seed++) {
        const r = run(seed, st, others, { rounds: 30 });
        if (r.collapseRound !== null) {
          c30++;
          when.push(r.collapseRound);
          if (r.collapseRound <= 14) c14++;
        }
      }
      const e = { id: st.id, c14: c14 / S4, c30: c30 / S4, med: when.length ? quantile(when, 0.5) : NaN };
      if (!worst || e.c14 > worst.c14 || (e.c14 === worst.c14 && e.c30 > worst.c30)) worst = e;
    }
    if (!worst) continue;
    single[`${n}/${field}`] = worst.c14;
    line(`| ${n} | ${field} | ${worst.id} | ${pct(worst.c14)} | ${pct(worst.c30)} | ${Number.isFinite(worst.med) ? worst.med : '–'} |`);
  }
}
line();

line('## Summary');
line();
line(`- Dominant strategy: ${bestIds.size === 1 ? `**yes** (${[...bestIds][0]})` : 'none found'}.`);
line(`- Strategies beating both references in every field and N: ${always.length}.`);
line(`- Symmetric strategies that beat restraint without a moratorium: ${symFlags.length ? symFlags.join('; ') : 'none'}.`);
line(`- Worst single-firm moratorium rate by quarter 14 at N = 4: ${pct(Math.max(single['4/restrained'] ?? 0, single['4/defaults'] ?? 0))}.`);
line();
line(`Run time ${((Date.now() - t0) / 1000).toFixed(0)} s.`);

writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(`Wrote ${OUT} in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
