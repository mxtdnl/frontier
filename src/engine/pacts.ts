/** Pacts, compliance, audits, sanctions and the disclosure snapshot (spec §9). */
import type { Params } from './params';
import type { Rng } from './rng';
import type { AuditBreach, AuditResult, Card, DisclosureEntry, FirmState, Pace, Pact, PactPrivate } from './types';

export function emptyPactPrivate(): PactPrivate {
  return { violations: {}, detected: {}, checked: {}, sanctions: {}, lastAuditRound: 0 };
}

/** PACT-A … PACT-Z, then PACT-AA, PACT-AB … */
export function nextPactName(pacts: ReadonlyArray<Pact>): string {
  let n = pacts.length;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `PACT-${s}`;
}

export function breaches(terms: Pact['terms'], pace: Pace, safety: number): boolean {
  return (terms.maxPace !== null && pace > terms.maxPace) || (terms.minSafety !== null && safety < terms.minSafety);
}

/** Step 11a. Notes each active-pact member checked, and records a private violation for each that broke the terms. */
export function recordViolations(
  pacts: ReadonlyArray<Pact>,
  priv: Record<string, PactPrivate>,
  applied: ReadonlyMap<string, { pace: Pace; safety: number }>,
  round: number,
): void {
  for (const pact of pacts) {
    if (pact.status !== 'active') continue;
    const pp = (priv[pact.id] ??= emptyPactPrivate());
    for (const [firmId, joined] of Object.entries(pact.members)) {
      const d = applied.get(firmId);
      if (!d || joined > round) continue;
      (pp.checked[String(round)] ??= {})[firmId] = true;
      if (!breaches(pact.terms, d.pace, d.safety)) continue;
      (pp.violations[String(round)] ??= {})[firmId] = true;
    }
  }
}

/** Fine for the n-th detected violation (n ≥ 1). */
export function fineFor(count: number, cash: number, p: Params): number {
  const rate = p.FINE_RATES[Math.min(count, p.FINE_RATES.length) - 1] ?? 0;
  return Math.max(p.FINE_MIN, rate * cash);
}

/** Rounds an audit at `round` examines: unaudited rounds, at most the last AUDIT_WINDOW. */
export function auditWindow(pp: PactPrivate, round: number, p: Params): number[] {
  const from = Math.max(pp.lastAuditRound + 1, round - p.AUDIT_WINDOW + 1, 1);
  const out: number[] = [];
  for (let r = from; r <= round; r++) out.push(r);
  return out;
}

/** Audits one pact: publishes violations in the window, applies graduated sanctions. */
export function auditPact(
  pact: Pact,
  pp: PactPrivate,
  firms: FirmState[],
  cards: ReadonlyMap<string, Card>,
  round: number,
  kind: AuditResult['kind'],
  p: Params,
): AuditResult {
  const rounds = auditWindow(pp, round, p);
  const found = new Map<string, number[]>();
  for (const r of rounds) {
    for (const firmId of Object.keys(pp.violations[String(r)] ?? {})) {
      (pp.detected[String(r)] ??= {})[firmId] = true;
      const list = found.get(firmId) ?? [];
      list.push(r);
      found.set(firmId, list);
    }
  }
  const result: AuditBreach[] = [];
  for (const firm of firms) {
    const hit = found.get(firm.id);
    if (!hit) continue;
    const count = (pp.sanctions[firm.id] ?? 0) + 1;
    pp.sanctions[firm.id] = count;
    const waived = cards.get(firm.id) === 'LOBBY';
    const fine = waived ? 0 : fineFor(count, firm.cash, p);
    firm.cash -= fine;
    const expelled = count >= p.EXPEL_AT && firm.id in pact.members;
    if (expelled) delete pact.members[firm.id];
    firm.breachUntilRound = round + p.BREACH_FLAG_ROUNDS - 1;
    result.push({ firmId: firm.id, rounds: hit, count, fine, waived, expelled });
  }
  pp.lastAuditRound = round;
  return { pactId: pact.id, kind, rounds, breaches: result };
}

/**
 * Step 11b. Every pact consumes one `audit` draw in creation order, so the draws are
 * stable. An active pact is audited if the facilitator requested it or the draw is
 * below autoAuditP.
 */
export function runAudits(
  pacts: Pact[],
  priv: Record<string, PactPrivate>,
  firms: FirmState[],
  cards: ReadonlyMap<string, Card>,
  pending: ReadonlyArray<string>,
  autoAuditP: number,
  round: number,
  rng: Rng,
  p: Params,
): AuditResult[] {
  const out: AuditResult[] = [];
  for (const pact of pacts) {
    const u = rng();
    if (pact.status !== 'active') continue;
    const manual = pending.includes(pact.id);
    if (!manual && !(u < autoAuditP)) continue;
    const pp = (priv[pact.id] ??= emptyPactPrivate());
    out.push(auditPact(pact, pp, firms, cards, round, manual ? 'manual' : 'auto', p));
  }
  return out;
}

/** Step 11c. A pact with fewer than PACT_MIN_MEMBERS members after PACT_GRACE_ROUNDS rounds dissolves. */
export function dissolvePacts(pacts: Pact[], round: number, p: Params): Pact[] {
  const dissolved: Pact[] = [];
  for (const pact of pacts) {
    if (pact.status !== 'active') continue;
    const age = round - pact.createdRound + 1;
    if (age >= p.PACT_GRACE_ROUNDS && Object.keys(pact.members).length < p.PACT_MIN_MEMBERS) {
      pact.status = 'dissolved';
      dissolved.push(pact);
    }
  }
  return dissolved;
}

/** §9.3: published per firm while disclosure is on. */
export function disclosureSnapshot(
  firms: ReadonlyArray<FirmState>,
  applied: ReadonlyMap<string, { pace: Pace; safety: number; expo: number }>,
): Record<string, DisclosureEntry> {
  const out: Record<string, DisclosureEntry> = {};
  for (const f of firms) {
    const d = applied.get(f.id);
    if (d) out[f.id] = { pace: d.pace, safety: d.safety, expo: d.expo };
  }
  return out;
}
