/**
 * Incident lines for the projector (spec §14.1, §15.4, Session 18). Pure functions over the public `rounds` and
 * `firms` nodes only. Each incident has three parts: the firm and its wire headline, the effect, and the cause.
 *
 * The cause follows the disclosure rule (§6.5, owner decision 2026-10-10): with disclosure on, the firm's pace,
 * safety and incident risk from `rounds/{r}/disclosure`; with disclosure off, only the general cause. The trust
 * cost per incident (INC_TRUST × 8/N) is shown as a number (owner decision 2026-10-10).
 */
import { BANK, PARAMS, fill } from '../engine';
import type { FirmNode, RoundNode } from '../firebase/schema';
import { fmt } from './format';

/** The cause line while pace and safety are private (§15.4). */
export const GENERAL_CAUSE = 'Incident risk rises with pace and falls with safety spend.';
/** Incidents listed in the board's block before `+N more` (§14.1). */
export const INCIDENT_BLOCK_MAX = 4;
/** Lit-room mode with disclosure on: three lines per incident leave room for three (32-row grid). */
export const INCIDENT_BLOCK_MAX_LIT_DISCLOSED = 3;

/** Incidents the block lists before `+N more` in this mode. */
export const incidentCap = (lit: boolean, disclosed: boolean): number => (lit && disclosed ? INCIDENT_BLOCK_MAX_LIT_DISCLOSED : INCIDENT_BLOCK_MAX);

export interface IncidentLine {
  round: number;
  firmId: string;
  ticker: string;
  /** The incident's wire headline, or the first incident template when the headline cap left it out. */
  headline: string;
  /** "trust −1.2 · HUMN revenue −15% this quarter". */
  effect: string;
  /** "pace 4 · safety 5% · incident risk 27%" with disclosure on; GENERAL_CAUSE with disclosure off. */
  cause: string;
  /** True when the cause names the firm's own pace and safety (disclosure was on at resolution). */
  disclosed: boolean;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The quarter's incident headline naming `ticker` as a whole word, if the headline cap kept it. */
function headlineFor(node: RoundNode, ticker: string): string | null {
  const word = new RegExp(`(^|[^A-Z])${escape(ticker)}([^A-Z]|$)`);
  return node.headlines.find((h) => h.kind === 'incident' && word.test(h.text))?.text ?? null;
}

/** Trust lost per incident in a quarter with `n` firms (§6.3 step 5). */
export const incidentTrustCost = (n: number): number => (PARAMS.INC_TRUST * PARAMS.DRAW_REF_N) / Math.max(1, n);

/** One line per incident of quarter `round`, in firm creation order. Empty with no incidents. */
export function incidentLines(round: number, node: RoundNode | undefined, firms: Record<string, FirmNode>): IncidentLine[] {
  if (!node) return [];
  // N is the firm count at that resolution: every firm has a result entry.
  const n = Object.keys(node.results).length || Object.keys(firms).length;
  const trust = fmt(-incidentTrustCost(n));
  const revenue = `${Math.round(PARAMS.INC_REV_LOSS * 100)}%`;
  return node.incidentFirms.flatMap((id): IncidentLine[] => {
    const ticker = firms[id]?.ticker;
    if (!ticker) return [];
    const d = node.disclosure?.[id] ?? null;
    const parts = d ? [`pace ${d.pace}`, `safety ${d.safety}%`, ...(d.risk !== null ? [`incident risk ${Math.round(d.risk * 100)}%`] : [])] : [];
    return [
      {
        round,
        firmId: id,
        ticker,
        headline: headlineFor(node, ticker) ?? fill(BANK.incident[0] ?? '', { FIRM: ticker }),
        effect: `trust ${trust} · ${ticker} revenue −${revenue} this quarter`,
        cause: d ? parts.join(' · ') : GENERAL_CAUSE,
        disclosed: d !== null,
      },
    ];
  });
}

/** Every incident of the session, newest quarter first, creation order within a quarter (the `INCID` view). */
export function allIncidents(rounds: Record<string, RoundNode>, firms: Record<string, FirmNode>): IncidentLine[] {
  return Object.keys(rounds)
    .map(Number)
    .filter((r) => Number.isInteger(r) && r > 0)
    .sort((a, b) => b - a)
    .flatMap((r) => incidentLines(r, rounds[String(r)], firms));
}

/** The board's block: at most `max` incidents, the rest counted (§14.1). */
export function incidentBlock(lines: ReadonlyArray<IncidentLine>, max = INCIDENT_BLOCK_MAX): { shown: IncidentLine[]; more: number } {
  return { shown: lines.slice(0, max), more: Math.max(0, lines.length - max) };
}

/** Firms that carry the `INCID` tag: an incident in the latest resolved quarter, during its reveal and the next open quarter. */
export function incidentTagged(latest: number, node: RoundNode | undefined, pubRound: number, phase: string): Set<string> {
  if (!node || latest <= 0) return new Set();
  const during = pubRound === latest || (pubRound === latest + 1 && (phase === 'open' || phase === 'summit'));
  return during && phase !== 'resolving' ? new Set(node.incidentFirms) : new Set();
}
