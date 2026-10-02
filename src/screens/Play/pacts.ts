/**
 * Pure helpers for the PACTS tab (spec §5.3, §9.1). No Firebase and no React.
 */
import type { Pace, Pact, PactTerms } from '../../engine';
import type { Phase } from '../../firebase/schema';

export interface TermsForm {
  limitPace: boolean;
  maxPace: Pace;
  limitSafety: boolean;
  /** Raw field text; validated on submit. */
  minSafety: string;
}

export const DEFAULT_TERMS_FORM: TermsForm = { limitPace: true, maxPace: 2, limitSafety: false, minSafety: '15' };

export type TermsResult = { ok: true; terms: PactTerms } | { ok: false; message: string };

/** Terms need a maximum pace and/or a minimum safety (spec §5.3); safety is a whole number 0 to 30. */
export function termsFromForm(f: TermsForm): TermsResult {
  if (!f.limitPace && !f.limitSafety) return { ok: false, message: 'Set a maximum pace, a minimum safety spend, or both.' };
  let minSafety: number | null = null;
  if (f.limitSafety) {
    const t = f.minSafety.trim();
    if (!/^\d{1,2}$/.test(t) || Number(t) > 30) return { ok: false, message: 'Minimum safety is a whole number from 0 to 30.' };
    minSafety = Number(t);
  }
  return { ok: true, terms: { maxPace: f.limitPace ? f.maxPace : null, minSafety } };
}

/** Pacts can be proposed while a quarter is open or in a summit (rules, spec §13). */
export const canPropose = (phase: Phase): boolean => phase === 'open' || phase === 'summit';

export type PactAction = 'leave' | 'join' | 'none';

/** Own firm's action on a pact: members may leave, others may join an active pact. */
export function pactAction(pact: Pick<Pact, 'members' | 'status'>, firmId: string): PactAction {
  if (pact.status !== 'active') return 'none';
  return firmId in pact.members ? 'leave' : 'join';
}

export function termsText(t: PactTerms): string {
  const parts: string[] = [];
  if (t.maxPace !== null) parts.push(`pace ${t.maxPace} or lower`);
  if (t.minSafety !== null) parts.push(`safety ${t.minSafety} or higher`);
  return parts.join(' · ') || '–';
}

/** Active pacts first, then by creation order. */
export function sortPacts(pacts: Record<string, Pact>): Pact[] {
  return Object.values(pacts).sort(
    (a, b) => Number(b.status === 'active') - Number(a.status === 'active') || a.createdRound - b.createdRound || a.name.localeCompare(b.name),
  );
}
