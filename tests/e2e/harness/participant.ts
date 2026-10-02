/**
 * A scripted participant for the end-to-end run. It loads in its own browser context, signs
 * in anonymously with the real SDK and calls the same data-layer functions the participant
 * screens will use. Served by the Vite dev server only; never part of the build.
 */
import { signInAnonymously } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import type { Decision } from '../../../src/engine';
import * as api from '../../../src/firebase/api';
import { getFirebase } from '../../../src/firebase/init';
import { paths } from '../../../src/firebase/paths';

const { auth, db } = getFirebase();
let uid = '';

const harness = {
  async signIn(): Promise<string> {
    uid = (await signInAnonymously(auth)).user.uid;
    return uid;
  },
  resolveCode: (code: string) => api.resolveCode(db, code),
  async found(g: string, name: string, ticker: string, label: string): Promise<{ firmId: string; pin: string }> {
    const pin = api.generatePin();
    const firmId = await api.foundFirm(db, g, uid, { name, ticker, pin, label, order: 99 });
    return { firmId, pin };
  },
  join: (g: string, firmId: string, pin: string, label: string) => api.joinFirm(db, g, uid, firmId, pin, label),
  submit: (g: string, round: number, firmId: string, d: Decision) => api.submitDecision(db, g, round, firmId, uid, d),
  proposePact: (g: string, round: number, firmId: string, name: string, maxPace: number) =>
    api.proposePact(db, g, round, firmId, name, { maxPace: maxPace as 1 | 2 | 3 | 4, minSafety: null }),
  async readPublic(g: string) {
    return api.readPublic(db, g);
  },
  /** Error text when the read is refused, or null if it succeeded. */
  async tryRead(path: string): Promise<string | null> {
    try {
      await get(ref(db, path));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  },
  enginePath: (g: string) => paths.engine(g),
};

(window as unknown as { harness: typeof harness }).harness = harness;
