/**
 * Live subscription hooks (spec §12). Pass `null` for any id that is not known yet; the
 * hook then stays idle. None of these hooks reads a facilitator-only node.
 */
import { useEffect, useState } from 'react';
import type { Pact } from '../engine';
import {
  subscribeDecision,
  subscribeFirmPrivate,
  subscribeFirms,
  subscribeFirmsPublic,
  subscribeMember,
  subscribeMeta,
  subscribePacts,
  subscribePublic,
  subscribeRounds,
} from '../firebase/api';
import { getFirebase } from '../firebase/init';
import { subscribeConnected, subscribeServerTimeOffset, trackPresence } from '../firebase/presence';
import type { DecisionNode, FirmNode, FirmPrivateNode, FirmPublicNode, MemberNode, MetaNode, PublicNode, RoundNode } from '../firebase/schema';
import { useSubscription, type Subscription } from './useSubscription';

const db = () => getFirebase().db;
const EMPTY = Object.freeze({}) as Record<string, never>;

export const useMeta = (g: string | null): Subscription<MetaNode | null> =>
  useSubscription<MetaNode | null>(g, (cb, err) => subscribeMeta(db(), g as string, cb, err), null);

export const usePublic = (g: string | null): Subscription<PublicNode | null> =>
  useSubscription<PublicNode | null>(g, (cb, err) => subscribePublic(db(), g as string, cb, err), null);

export const useFirms = (g: string | null): Subscription<Record<string, FirmNode>> =>
  useSubscription<Record<string, FirmNode>>(g, (cb, err) => subscribeFirms(db(), g as string, cb, err), EMPTY);

export const useFirmsPublic = (g: string | null): Subscription<Record<string, FirmPublicNode>> =>
  useSubscription<Record<string, FirmPublicNode>>(g, (cb, err) => subscribeFirmsPublic(db(), g as string, cb, err), EMPTY);

export const useRounds = (g: string | null): Subscription<Record<string, RoundNode>> =>
  useSubscription<Record<string, RoundNode>>(g, (cb, err) => subscribeRounds(db(), g as string, cb, err), EMPTY);

export const usePacts = (g: string | null): Subscription<Record<string, Pact>> =>
  useSubscription<Record<string, Pact>>(g, (cb, err) => subscribePacts(db(), g as string, cb, err), EMPTY);

/** The signed-in user's own membership (gives their firm id). */
export function useOwnMember(g: string | null, uid: string | null): Subscription<MemberNode | null> {
  const key = g && uid ? `${g}/${uid}` : null;
  return useSubscription<MemberNode | null>(key, (cb, err) => subscribeMember(db(), g as string, uid as string, cb, err), null);
}

/** The participant's own firm's private data. Rules refuse any other firm. */
export function useOwnFirmPrivate(g: string | null, firmId: string | null): Subscription<FirmPrivateNode | null> {
  const key = g && firmId ? `${g}/${firmId}` : null;
  return useSubscription<FirmPrivateNode | null>(key, (cb, err) => subscribeFirmPrivate(db(), g as string, firmId as string, cb, err), null);
}

/** The participant's own firm's decision for a round. */
export function useOwnDecision(g: string | null, round: number | null, firmId: string | null): Subscription<DecisionNode | null> {
  const key = g && firmId && round !== null && round > 0 ? `${g}/${round}/${firmId}` : null;
  return useSubscription<DecisionNode | null>(key, (cb, err) => subscribeDecision(db(), g as string, round as number, firmId as string, cb, err), null);
}

/**
 * Publishes this user's presence for the game while mounted and reports whether the
 * client is connected (for the offline state).
 */
export function usePresence(g: string | null, uid: string | null): { connected: boolean; error: Error | null } {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => subscribeConnected(db(), setConnected), []);
  useEffect(() => {
    if (!g || !uid) return undefined;
    setError(null);
    return trackPresence(db(), g, uid, setError);
  }, [g, uid]);
  return { connected, error };
}

/** Server-minus-local clock offset in ms, for countdowns against the server deadline. */
export function useServerTimeOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => subscribeServerTimeOffset(db(), setOffset), []);
  return offset;
}
