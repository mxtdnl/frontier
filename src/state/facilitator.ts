/**
 * Facilitator-only subscriptions and the orchestrator context. Import only from `#/control`,
 * `#/new` and the facilitator side of `#/screen`.
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  subscribeDecisions,
  subscribeEngine,
  subscribeMembers,
  subscribePactsPrivate,
  subscribePresenceAll,
  updateGame,
} from '../firebase/api';
import { getFirebase } from '../firebase/init';
import { autoResolve, firebaseIO, publishWire, type ActionResult, type Ctx } from '../firebase/orchestrator';
import { AUTO_RESOLVE_DELAY_MS } from '../firebase/phases';
import { rel } from '../firebase/paths';
import type { DecisionNode, EngineNode, FirmNode, FirmPublicNode, MemberNode, PactPrivateNode, PresenceNode, PublicNode, RoundNode, WireNode } from '../firebase/schema';
import { pendingWire } from '../firebase/wire';
import type { Pact } from '../engine';
import { useServerTimeOffset } from './hooks';
import { useSubscription, type Subscription } from './useSubscription';

const db = () => getFirebase().db;
const EMPTY = Object.freeze({}) as Record<string, never>;

export { useMeta } from './hooks';

export const useMembers = (g: string | null): Subscription<Record<string, MemberNode>> =>
  useSubscription<Record<string, MemberNode>>(g, (cb, err) => subscribeMembers(db(), g as string, cb, err), EMPTY);

export const usePresenceAll = (g: string | null): Subscription<Record<string, PresenceNode>> =>
  useSubscription<Record<string, PresenceNode>>(g, (cb, err) => subscribePresenceAll(db(), g as string, cb, err), EMPTY);

export function useDecisions(g: string | null, round: number | null): Subscription<Record<string, DecisionNode>> {
  const key = g && round !== null && round > 0 ? `${g}/${round}` : null;
  return useSubscription<Record<string, DecisionNode>>(key, (cb, err) => subscribeDecisions(db(), g as string, round as number, cb, err), EMPTY);
}

/** Hidden values live here (τ, end round). Use only on `#/control`. */
export const useEngine = (g: string | null): Subscription<EngineNode | null> =>
  useSubscription<EngineNode | null>(g, (cb, err) => subscribeEngine(db(), g as string, cb, err), null);

export const usePactsPrivate = (g: string | null): Subscription<Record<string, PactPrivateNode>> =>
  useSubscription<Record<string, PactPrivateNode>>(g, (cb, err) => subscribePactsPrivate(db(), g as string, cb, err), EMPTY);

/** Orchestrator context for this browser window, with server time from `/.info/serverTimeOffset`. */
export function useOrchestrator(g: string, uid: string): Ctx {
  const offset = useServerTimeOffset();
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const windowId = useMemo(() => crypto.randomUUID().slice(0, 8), []);
  return useMemo(
    () => ({ io: firebaseIO(db(), g), uid, windowId, now: () => Date.now() + offsetRef.current }),
    [g, uid, windowId],
  );
}

/**
 * Resolves the quarter at its deadline when the facilitator enabled auto-resolve. Waits for
 * the decision grace window to close first. The lock transaction makes duplicates harmless,
 * so every open facilitator window may run this.
 */
export function useAutoResolve(ctx: Ctx, pub: PublicNode | null, enabled: boolean, onResult: (r: ActionResult) => void): void {
  const deadline = pub?.phase === 'open' && !pub.paused ? pub.deadline : null;
  const round = pub?.round ?? 0;
  const cb = useRef(onResult);
  cb.current = onResult;
  useEffect(() => {
    if (!enabled || deadline === null) return undefined;
    const wait = Math.max(0, deadline + AUTO_RESOLVE_DELAY_MS - ctx.now()) + 50;
    const id = window.setTimeout(() => {
      void autoResolve(ctx).then((r) => {
        if (r) cb.current(r);
      });
    }, wait);
    return () => window.clearTimeout(id);
  }, [ctx, enabled, deadline, round]);
}

/**
 * Participants cannot write `firmsPublic`, and cannot read each other's decisions, so the
 * facilitator's window mirrors "committed" onto the public board: a firm that has a decision
 * for the open quarter, or a bot, gets `submittedRound` = the quarter. Idempotent.
 */
export function useCommitSync(
  g: string,
  pub: PublicNode | null,
  firms: Record<string, FirmNode>,
  firmsPublic: Record<string, FirmPublicNode>,
  decisions: Record<string, DecisionNode>,
): void {
  const sent = useRef(new Set<string>());
  useEffect(() => {
    if (!pub || pub.phase !== 'open' || pub.round < 1) return;
    const patch: Record<string, unknown> = {};
    const keys: string[] = [];
    for (const [id, fp] of Object.entries(firmsPublic)) {
      if (fp.submittedRound === pub.round) continue;
      const committed = id in decisions || firms[id]?.isBot === true;
      const key = `${pub.round}/${id}`;
      if (!committed || sent.current.has(key)) continue;
      patch[rel.firmPublicField(id, 'submittedRound')] = pub.round;
      keys.push(key);
    }
    if (keys.length === 0) return;
    keys.forEach((k) => sent.current.add(k));
    updateGame(db(), g, patch).catch(() => keys.forEach((k) => sent.current.delete(k)));
  }, [g, pub, firms, firmsPublic, decisions]);
}

/**
 * Publishes pact headlines (formed, joined, left) to `wire/` for the whole room. Participants
 * cannot write there, so an open facilitator window does it. Entries are derived from the
 * current pacts and keyed deterministically, so a refreshed or duplicate window adds nothing twice.
 */
export function useLiveWire(
  ctx: Ctx,
  pub: PublicNode | null,
  firms: Record<string, FirmNode>,
  pacts: Record<string, Pact>,
  rounds: Record<string, RoundNode>,
  wire: Record<string, WireNode>,
  loaded: boolean,
): void {
  const sent = useRef(new Set<string>());
  useEffect(() => {
    // Wait for the wire to load, or entries already published would be written again.
    if (!pub || !loaded || pub.phase === 'lobby' || pub.phase === 'briefing') return;
    const keys = Object.keys(pendingWire({ pacts, firms, rounds, wire, pub, now: 0 })).filter((k) => !sent.current.has(k));
    if (keys.length === 0) return;
    keys.forEach((k) => sent.current.add(k));
    publishWire(ctx, { pacts, firms, rounds, wire, pub }).catch(() => keys.forEach((k) => sent.current.delete(k)));
  }, [ctx, pub, firms, pacts, rounds, wire, loaded]);
}
