import { createGame, PARAMS, resolveRound, type Decision, type EngineState, type FirmInit, type GameSettings, type Params, type Policy } from '../../src/engine';

export const SETTINGS: GameSettings = {
  label: 'TEST',
  endMode: 'random',
  minEnd: PARAMS.END_MIN,
  maxEnd: PARAMS.END_MAX,
  fixedEnd: null,
  disclosure: false,
  autoAuditP: 0,
};

export const TICKERS = ['ARCN', 'BRLK', 'CYRA', 'DOLM', 'EMBR', 'FJRD', 'GLYN', 'HRTH', 'IVES', 'JUNO', 'KELP', 'LUMA', 'MIRA', 'NOVA', 'ORCA', 'PIKE'];

export function firms(n: number, policy: Policy | null = null): FirmInit[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `f${i}`,
    ticker: TICKERS[i] ?? `F${i}`,
    isBot: policy !== null,
    botPolicy: policy,
  }));
}

export function game(n = 4, opts: { seed?: number; settings?: Partial<GameSettings>; policy?: Policy | null; p?: Params } = {}): EngineState {
  return createGame({ ...SETTINGS, ...opts.settings }, firms(n, opts.policy ?? null), opts.seed ?? 1, opts.p ?? PARAMS);
}

export const dec = (pace: 1 | 2 | 3 | 4, safety: number, card: Decision['card'] = 'NONE', target: string | null = null): Decision => ({
  pace,
  safety,
  card,
  target,
});

/** Same decision for every firm. */
export function all(state: EngineState, d: Decision): Record<string, Decision> {
  return Object.fromEntries(state.firms.map((f) => [f.id, d]));
}

export function firm(state: EngineState, id: string) {
  const f = state.firms.find((x) => x.id === id);
  if (!f) throw new Error(`no firm ${id}`);
  return f;
}

export function run(state: EngineState, rounds: number, decide: (s: EngineState) => Record<string, Decision>, p: Params = PARAMS): EngineState {
  let s = state;
  for (let i = 0; i < rounds; i++) s = resolveRound(s, decide(s), p).state;
  return s;
}

/** Params with no incidents, so trust arithmetic is exact. */
export const NO_INC: Params = { ...PARAMS, INC_BASE: [0, 0, 0, 0] };
