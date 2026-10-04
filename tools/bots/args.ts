/** Command-line parsing for tools/bots.ts. */
import { isClientPolicy, POLICIES, type ClientPolicy } from './policy';

export interface Options {
  game: string;
  firms: number;
  policy: ClientPolicy;
  delayMin: number;
  delayMax: number;
  seed: number;
  foundOnly: boolean;
  /** Restrained bots (cautious, standard) join every active pact. */
  joinPacts: boolean;
  /** Devices per firm (1–5, spec §2): the founder plus teammates who join with the PIN. */
  devicesPerFirm: number;
}

export const USAGE = `Usage: npm run bots -- --game <id or join code> --firms <n> --policy <${POLICIES.join('|')}> [--delay <min>-<max> seconds] [--seed <n>] [--found-only] [--join-pacts] [--devices-per-firm <1-5>]`;

export function parseArgs(argv: string[]): Options | string {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const game = get('game');
  if (!game) return `Missing --game.\n${USAGE}`;
  const firms = Number(get('firms') ?? '8');
  if (!Number.isInteger(firms) || firms < 1 || firms > 50) return `--firms must be a whole number from 1 to 50.\n${USAGE}`;
  const policy = get('policy') ?? 'mixed';
  if (!isClientPolicy(policy)) return `Unknown policy "${policy}".\n${USAGE}`;
  const [lo, hi] = (get('delay') ?? '1-6').split('-').map(Number);
  if (lo === undefined || hi === undefined || !Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi < lo) return `--delay must look like 1-6 (seconds).\n${USAGE}`;
  const devicesPerFirm = Number(get('devices-per-firm') ?? '1');
  if (!Number.isInteger(devicesPerFirm) || devicesPerFirm < 1 || devicesPerFirm > 5) return `--devices-per-firm must be a whole number from 1 to 5.\n${USAGE}`;
  const seed = Number(get('seed') ?? '1');
  if (!Number.isInteger(seed)) return `--seed must be a whole number.\n${USAGE}`;
  return { game, firms, policy, delayMin: lo * 1000, delayMax: hi * 1000, seed, foundOnly: argv.includes('--found-only'), joinPacts: argv.includes('--join-pacts'), devicesPerFirm };
}

/** Four uppercase letters, unique per bot index, for the ticker (3–6 letters A–Z). */
export function botTicker(i: number): string {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return `BT${a[Math.floor(i / 26) % 26]}${a[i % 26]}`;
}
