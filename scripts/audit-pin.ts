/**
 * Session 9 audit reproduction (docs/REVIEW.md, H2): one anonymous client in the lobby tries
 * to guess a firm's 4-digit PIN. Phase 1 writes the membership directly with every PIN (no
 * longer accepted: a guess must be recorded first). Phase 2 records guesses through the
 * per-firm join throttle and reports the rate. Exits 0 when no PIN was found. Emulator only.
 *
 *   firebase emulators:exec --config firebase.test.json --only auth,database --project demo-frontier "npx tsx scripts/audit-pin.ts [pin] [batch] [window-ms]"
 *
 * The rate measured here is the local emulator's. The live database's rate was not measured
 * (the container cannot reach it).
 */
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, goOffline, ref, serverTimestamp, set, update } from 'firebase/database';
import { EMULATOR_AUTH_PORT, EMULATOR_DATABASE_PORT, EMULATOR_HOST } from '../src/firebase/config';
import { emulatorOptions } from '../src/firebase/init';
import { paths } from '../src/firebase/paths';
import { adminSet, loadRules } from './emulator-rules';

const G = 'pin-audit';
const SECRET = process.argv[2] ?? '7391';
const BATCH = Number(process.argv[3] ?? 100);
const WINDOW_MS = Number(process.argv[4] ?? 15_000);

async function main(): Promise<void> {
  await loadRules();
  await adminSet(`games/${G}`, {
    meta: { code: 'PINA', title: 'PIN audit', createdAt: 1, facilitatorUid: 'fac', settings: { timerSec: 120 } },
    public: { phase: 'lobby', round: 0, paused: false, disclosure: false, T: 72, M: 0, collapsed: false, joinLocked: false, revealStep: 0 },
    firms: { victim: { name: 'Victim Labs', ticker: 'VICT', createdAt: 1, order: 0, isBot: false } },
    firmSecrets: { victim: { pin: SECRET } },
  });
  const app = initializeApp(emulatorOptions, 'pin-audit');
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, EMULATOR_HOST, EMULATOR_DATABASE_PORT);
  const { user } = await signInAnonymously(auth);
  const target = ref(db, paths.member(G, user.uid));

  // Phase 1: write the membership directly with every PIN (the attack that worked before the throttle).
  const t0 = Date.now();
  let tries = 0;
  let found: string | null = null;
  for (let start = 0; start < 10_000 && !found; start += BATCH) {
    const pins = Array.from({ length: Math.min(BATCH, 10_000 - start) }, (_, i) => String(start + i).padStart(4, '0'));
    const results = await Promise.all(
      pins.map((pin) =>
        set(target, { firmId: 'victim', pin, joinedAt: serverTimestamp() }).then(
          () => pin,
          () => null,
        ),
      ),
    );
    tries += pins.length;
    found = results.find((r) => r !== null) ?? null;
  }
  const s = (Date.now() - t0) / 1000;
  console.log(`Direct membership writes: PIN ${found ?? 'not found'} after ${tries} guesses in ${s.toFixed(1)} s.`);

  // Phase 2: the throttled path. Each guess must first be recorded with the firm's join stamp.
  const t1 = Date.now();
  let recorded = 0;
  let refused = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (Date.now() - t1 < WINDOW_MS && !found) {
      const pin = String(next++ % 10_000).padStart(4, '0');
      try {
        await update(ref(db), { [paths.joinRequest(G, 'victim', user.uid)]: { pin, at: serverTimestamp() }, [paths.joinThrottle(G, 'victim')]: serverTimestamp() });
        recorded++;
        await set(target, { firmId: 'victim', pin, joinedAt: serverTimestamp() }).then(() => (found = pin), () => undefined);
      } catch {
        refused++;
      }
    }
  };
  await Promise.all(Array.from({ length: 20 }, worker));
  const s2 = (Date.now() - t1) / 1000;
  const rate = recorded / s2;
  console.log(`Throttled path: ${recorded} guesses recorded and ${refused} refused in ${s2.toFixed(1)} s (${rate.toFixed(2)} guesses per second, 20 parallel writers).`);
  console.log(`Expected time for all 10,000 PINs at this rate: ${(10_000 / rate / 3600).toFixed(1)} hours.`);
  goOffline(db);
  await deleteApp(app);
  process.exit(found === null ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
