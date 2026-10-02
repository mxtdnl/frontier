/**
 * Realtime Database paths (spec §12). This is the only module that builds paths.
 * Every key segment is checked so a malformed id can never address another node.
 */

/** RTDB forbids `. $ # [ ] /` and ASCII control characters in keys. */
const KEY = /^[^.$#[\]/\x00-\x1f\x7f]{1,768}$/;

export function key(k: string | number): string {
  const s = String(k);
  if (!KEY.test(s)) throw new Error(`Invalid database key: ${JSON.stringify(s)}`);
  return s;
}

const join = (...parts: Array<string | number>): string => parts.map(key).join('/');

/** Join codes: 4 letters, A–Z without I and O (spec §12). */
export const CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/;

export const paths = {
  facilitator: (uid: string) => join('facilitators', uid),
  code: (code: string) => {
    if (!CODE_PATTERN.test(code)) throw new Error(`Invalid join code: ${JSON.stringify(code)}`);
    return join('codes', code);
  },
  game: (g: string) => join('games', g),
  meta: (g: string) => join('games', g, 'meta'),
  public: (g: string) => join('games', g, 'public'),
  firms: (g: string) => join('games', g, 'firms'),
  firm: (g: string, f: string) => join('games', g, 'firms', f),
  firmSecret: (g: string, f: string) => join('games', g, 'firmSecrets', f),
  firmsPublic: (g: string) => join('games', g, 'firmsPublic'),
  firmPublic: (g: string, f: string) => join('games', g, 'firmsPublic', f),
  firmsPrivate: (g: string) => join('games', g, 'firmsPrivate'),
  firmPrivate: (g: string, f: string) => join('games', g, 'firmsPrivate', f),
  members: (g: string) => join('games', g, 'members'),
  member: (g: string, uid: string) => join('games', g, 'members', uid),
  presenceAll: (g: string) => join('games', g, 'presence'),
  presence: (g: string, uid: string) => join('games', g, 'presence', uid),
  presenceOnline: (g: string, uid: string) => join('games', g, 'presence', uid, 'online'),
  decisions: (g: string, round: number) => join('games', g, 'decisions', round),
  decision: (g: string, round: number, f: string) => join('games', g, 'decisions', round, f),
  rounds: (g: string) => join('games', g, 'rounds'),
  round: (g: string, round: number) => join('games', g, 'rounds', round),
  wire: (g: string) => join('games', g, 'wire'),
  pacts: (g: string) => join('games', g, 'pacts'),
  pact: (g: string, p: string) => join('games', g, 'pacts', p),
  pactMember: (g: string, p: string, f: string) => join('games', g, 'pacts', p, 'members', f),
  pactsPrivate: (g: string) => join('games', g, 'pactsPrivate'),
  pactPrivate: (g: string, p: string) => join('games', g, 'pactsPrivate', p),
  engine: (g: string) => join('games', g, 'engine'),
  results: (g: string) => join('games', g, 'results'),
  serverTimeOffset: () => '.info/serverTimeOffset',
  connected: () => '.info/connected',
} as const;

/**
 * Paths relative to `games/{g}`, for keys of a single multi-path `update()` rooted at the
 * game node (spec §11 step 4).
 */
export const rel = {
  public: () => 'public',
  publicField: (name: string) => join('public', name),
  firm: (f: string) => join('firms', f),
  firmField: (f: string, name: string) => join('firms', f, name),
  firmSecret: (f: string) => join('firmSecrets', f),
  firmPublic: (f: string) => join('firmsPublic', f),
  firmPublicField: (f: string, name: string) => join('firmsPublic', f, name),
  firmPrivate: (f: string) => join('firmsPrivate', f),
  firmPrivateField: (f: string, name: string) => join('firmsPrivate', f, name),
  firmPrivateHistory: (f: string, round: number) => join('firmsPrivate', f, 'history', round),
  firmPrivateNotices: (f: string, round: number) => join('firmsPrivate', f, 'notices', round),
  member: (uid: string) => join('members', uid),
  round: (round: number) => join('rounds', round),
  wireEntry: (key: string) => join('wire', key),
  pendingAudits: () => join('engine', 'pendingAudits'),
  pact: (p: string) => join('pacts', p),
  pactStatus: (p: string) => join('pacts', p, 'status'),
  pactMembers: (p: string) => join('pacts', p, 'members'),
  pactPrivate: (p: string) => join('pactsPrivate', p),
  engine: () => 'engine',
  results: () => 'results',
} as const;
