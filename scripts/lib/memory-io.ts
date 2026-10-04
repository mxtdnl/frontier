/**
 * The orchestrator against an in-memory copy of one game node (Session 10). Synthetic sessions
 * for the scale checks are produced by the real phase machine and resolution code, then written
 * to the emulator in one admin write, so a 50-firm layout check takes seconds, not a session.
 * Values pass through `storeAndRead`, which mimics what the database does to them.
 */
import type { Ctx, OrchestratorIO } from '../../src/firebase/orchestrator';
import {
  fromDecisions,
  fromEngine,
  fromFirms,
  fromMeta,
  fromPacts,
  fromPublic,
  fromResults,
  type MemberNode,
} from '../../src/firebase/schema';
import { storeAndRead } from '../../tests/firebase/rtdb';

export type Json = Record<string, unknown>;

/** Writes `value` at a slash path inside `root`; null deletes. */
export function setAt(root: Json, path: string, value: unknown): void {
  const parts = path.split('/');
  let node = root;
  for (const key of parts.slice(0, -1)) {
    const next = node[key];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) node[key] = {};
    node = node[key] as Json;
  }
  const last = parts[parts.length - 1] as string;
  if (value === null) delete node[last];
  else node[last] = structuredClone(value);
}

export const getAt = (root: Json, path: string): unknown =>
  path.split('/').reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Json)[k] : undefined), root);

/** An orchestrator context over `db` (the contents of `games/{g}`), with a settable clock. */
export function memoryCtx(db: Json, uid: string, clock: { t: number }): Ctx {
  const io: OrchestratorIO = {
    async transactPublic(step) {
      const current = fromPublic(storeAndRead(db.public));
      if (!current) return { committed: false, value: null };
      const next = step(current);
      if (next === undefined) return { committed: false, value: current };
      setAt(db, 'public', storeAndRead(next) ?? {});
      return { committed: true, value: fromPublic(storeAndRead(next)) };
    },
    readPublic: async () => fromPublic(storeAndRead(db.public)),
    readMeta: async () => fromMeta(storeAndRead(db.meta)),
    readEngine: async () => fromEngine(storeAndRead(db.engine)),
    readFirms: async () => fromFirms(storeAndRead(db.firms)),
    readMembers: async () => (storeAndRead(db.members) ?? {}) as Record<string, MemberNode>,
    readDecisions: async (r) => fromDecisions(storeAndRead(getAt(db, `decisions/${r}`))),
    readPacts: async () => fromPacts(storeAndRead(db.pacts)),
    readResults: async () => fromResults(storeAndRead(db.results)),
    async deleteGame() {
      for (const k of Object.keys(db)) delete db[k];
    },
    async transactPendingAudits(step) {
      const engine = fromEngine(storeAndRead(db.engine));
      const current = engine?.pendingAudits ?? [];
      const next = step(current);
      if (next === undefined) return { committed: false, value: current };
      setAt(db, 'engine/pendingAudits', next.length ? next : null);
      return { committed: true, value: next };
    },
    async update(patch) {
      for (const [path, value] of Object.entries(patch)) setAt(db, path, storeAndRead(value) ?? null);
    },
  };
  return { io, uid, windowId: 'scale', now: () => clock.t };
}
