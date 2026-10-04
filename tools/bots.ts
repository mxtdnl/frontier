/**
 * Bot clients (spec §7, Session 8). Usage:
 *   npm run bots -- --game <id or join code> --firms 8 --policy mixed [--delay 1-6] [--seed 1] [--found-only]
 *                   [--join-pacts] [--devices-per-firm 3]
 *
 * Each bot is an anonymous participant that founds its own firm during the lobby and then
 * commits a decision in every open quarter, after a random delay, using the real data layer
 * and the real security rules. With --devices-per-firm N, N − 1 more devices join each firm
 * with its PIN (team mode load tests); every device keeps its own connection and commits. It runs against the emulators (project `demo-frontier`) only;
 * the cloud container cannot reach the live database. A rehearsal on the live site uses the
 * in-app bot firms instead (set at `#/new`).
 *
 * Exits when the session ends, or on Ctrl-C.
 */
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, onValue, ref, type Database } from 'firebase/database';
import { mulberry32, type BotPolicy, type Card, type Pace, type Pact } from '../src/engine';
import * as api from '../src/firebase/api';
import { EMULATOR_AUTH_PORT, EMULATOR_DATABASE_PORT, EMULATOR_HOST } from '../src/firebase/config';
import { emulatorOptions } from '../src/firebase/init';
import { paths } from '../src/firebase/paths';
import type { FirmPrivateNode, FirmPublicNode, PublicNode, RoundNode } from '../src/firebase/schema';
import { botTicker, parseArgs, type Options } from './bots/args';
import { assignPolicies, decide } from './bots/policy';

interface Bot {
  index: number;
  policy: BotPolicy;
  db: Database;
  auth: Auth;
  uid: string;
  firmId: string;
}

let appCount = 0;
async function connect(): Promise<{ db: Database; auth: Auth; uid: string }> {
  // One named app per bot, so each has its own anonymous user.
  const app = initializeApp(emulatorOptions, `bot-${appCount++}`);
  const auth = getAuth(app);
  const db = getDatabase(app);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}`, { disableWarnings: true });
  connectDatabaseEmulator(db, EMULATOR_HOST, EMULATOR_DATABASE_PORT);
  const uid = (await signInAnonymously(auth)).user.uid;
  return { db, auth, uid };
}

const log = (m: string): void => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

async function resolveGame(db: Database, game: string): Promise<string> {
  if (/^[A-HJ-NP-Z]{4}$/.test(game)) {
    const g = await api.resolveCode(db, game);
    if (!g) throw new Error(`No session has the join code ${game}.`);
    return g;
  }
  return game;
}

/** Runs one bot: watches the board and commits a decision in every open quarter. */
function play(bot: Bot, g: string, o: Options, rng: () => number): Promise<void> {
  return new Promise((done) => {
    let offset = 0;
    let lastCard: Card = 'NONE';
    let insolvent = false;
    let pub: PublicNode | null = null;
    let board: Record<string, FirmPublicNode> = {};
    let rounds: Record<string, RoundNode> = {};
    const submitted = new Set<number>();
    let pacts: Record<string, Pact> = {};
    const joined = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stops: Array<() => void> = [];
    const stop = (): void => {
      if (timer) clearTimeout(timer);
      stops.forEach((s) => s());
      done();
    };

    const leaderPace = (round: number): Pace | null => {
      const leader = Object.entries(board).find(([, f]) => f.rank === 1)?.[0];
      const snap = rounds[String(round - 1)]?.disclosure;
      const seen = leader && snap ? snap[leader] : undefined;
      return seen ? seen.pace : null;
    };

    /** With --join-pacts, the restrained bots join every active pact once, in an open quarter or a summit. */
    const considerPacts = (): void => {
      if (!o.joinPacts || !pub || (pub.phase !== 'open' && pub.phase !== 'summit')) return;
      if (bot.policy !== 'cautious' && bot.policy !== 'standard') return;
      const round = pub.round;
      for (const p of Object.values(pacts)) {
        if (p.status !== 'active' || p.members[bot.firmId] !== undefined || joined.has(p.id)) continue;
        joined.add(p.id);
        api
          .joinPact(bot.db, g, p.id, bot.firmId, round)
          .then(() => log(`${botTicker(bot.index)} joined ${p.name}`))
          .catch((e: unknown) => log(`${botTicker(bot.index)} could not join ${p.name}: ${e instanceof Error ? e.message : String(e)}`));
      }
    };

    const consider = (): void => {
      if (!pub) return;
      if (pub.phase === 'ended') return stop();
      considerPacts();
      if (pub.phase !== 'open' || pub.deadline === null || submitted.has(pub.round) || timer) return;
      const round = pub.round;
      const remaining = pub.deadline - (Date.now() + offset);
      // Never plan past the deadline; leave 1.5 s for the write to arrive.
      const wait = Math.max(0, Math.min(o.delayMin + rng() * (o.delayMax - o.delayMin), remaining - 1500));
      timer = setTimeout(() => {
        timer = null;
        if (pub?.phase !== 'open' || pub.round !== round) return;
        const d = decide(bot.policy, { lastCard, insolvent: insolvent || board[bot.firmId]?.insolvent === true, leaderPace: leaderPace(round) }, rng());
        api
          .submitDecision(bot.db, g, round, bot.firmId, bot.uid, d)
          .then(() => {
            submitted.add(round);
            log(`${botTicker(bot.index)} ${bot.policy.padEnd(12)} Q${round} pace ${d.pace} safety ${d.safety} card ${d.card}`);
          })
          .catch((e: unknown) => log(`${botTicker(bot.index)} Q${round} refused: ${e instanceof Error ? e.message : String(e)}`));
      }, wait);
    };

    stops.push(onValue(ref(bot.db, paths.serverTimeOffset()), (s) => (offset = typeof s.val() === 'number' ? (s.val() as number) : 0)));
    stops.push(api.subscribeFirmsPublic(bot.db, g, (v) => (board = v)));
    stops.push(api.subscribePacts(bot.db, g, (v) => { pacts = v; considerPacts(); }));
    stops.push(api.subscribeRounds(bot.db, g, (v) => (rounds = v)));
    stops.push(
      api.subscribeFirmPrivate(bot.db, g, bot.firmId, (v: FirmPrivateNode | null) => {
        if (v) lastCard = v.lastCard;
        insolvent = v ? v.cash < 0 : false;
      }),
    );
    stops.push(
      api.subscribePublic(bot.db, g, (v) => {
        pub = v;
        consider();
      }),
    );
  });
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  if (typeof o === 'string') {
    console.error(o);
    process.exit(2);
  }
  const first = await connect();
  const g = await resolveGame(first.db, o.game);
  const pub = await api.readPublic(first.db, g);
  if (!pub) throw new Error(`Session ${g} does not exist.`);
  if (pub.phase !== 'lobby') throw new Error(`Session ${g} is in phase ${pub.phase}. Bot firms can only be founded in the lobby.`);

  const policies = assignPolicies(o.policy, o.firms);
  const bots: Bot[] = [];
  const founded: Array<{ index: number; firmId: string; pin: string }> = [];
  for (let i = 0; i < o.firms; i++) {
    const c = i === 0 ? first : await connect();
    const pin = api.generatePin();
    const firmId = await api.foundFirm(c.db, g, c.uid, { name: `Bot Firm ${i + 1}`, ticker: botTicker(i), pin, label: 'BT', order: 100 + i });
    bots.push({ index: i, policy: policies[i]!, db: c.db, auth: c.auth, uid: c.uid, firmId });
    founded.push({ index: i, firmId, pin });
    log(`${botTicker(i)} founded as ${policies[i]!}`);
  }
  // Teammates join in parallel across firms; the join throttle allows one per firm per second.
  for (let d = 2; d <= o.devicesPerFirm; d++) {
    await Promise.all(
      founded.map(async (f) => {
        const c = await connect();
        await api.joinFirm(c.db, g, c.uid, f.firmId, f.pin, `B${d}`);
        bots.push({ index: f.index, policy: policies[f.index]!, db: c.db, auth: c.auth, uid: c.uid, firmId: f.firmId });
      }),
    );
    log(`device ${d} joined each of ${founded.length} firms`);
  }
  if (o.foundOnly) {
    process.exit(0);
  }
  log(`${founded.length} bot firm(s) on ${bots.length} device(s) ready in session ${g}. Waiting for quarters.`);
  process.on('SIGINT', () => process.exit(0));
  await Promise.all(bots.map((b, k) => play(b, g, o, mulberry32(o.seed * 1000 + b.index + 100_000 * Math.floor(k / founded.length)))));
  log('Session ended.');
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
