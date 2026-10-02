/**
 * End-to-end run against the emulators (Session 4). Usage: `npm run test:e2e`.
 *
 * Starts the Vite dev server against the emulators, then drives:
 *  - a facilitator browser context (sign-in gate, #/new, #/screen, #/control)
 *  - one browser context per scripted participant (tests/e2e/harness), each with its own
 *    anonymous sign-in, founding, joining and committing through the real data layer.
 * Screenshots go to shots/e2e-*.png. Exits non-zero on any failed check.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { APP_NAMESPACE, adminSet, loadRules } from './emulator-rules';

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/`;
const EXEC = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const OUT = resolve('shots');
const AUTH = `http://127.0.0.1:9099`;
const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '127.0.0.1:9000';

const failures: string[] = [];
const fail = (m: string): void => {
  failures.push(m);
  console.error('FAIL ' + m);
};
const check = (cond: boolean, m: string): void => {
  if (cond) console.log('ok   ' + m);
  else fail(m);
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function signUp(email: string, password: string): Promise<string> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = (await r.json()) as { localId?: string };
  if (!j.localId) throw new Error(`sign-up failed for ${email}`);
  return j.localId;
}

async function adminGet<T = unknown>(path: string): Promise<T> {
  const r = await fetch(`http://${DB_HOST}/${path}.json?ns=${APP_NAMESPACE}`, { headers: { Authorization: 'Bearer owner' } });
  return (await r.json()) as T;
}

async function waitServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('The dev server did not start.');
}

const screenText = (page: Page): Promise<string> => page.locator('.scr').innerText();

/** Waits until the text of `selector` matches `re`; records a failure if it never does. */
async function waitText(page: Page, re: RegExp, what: string, timeout = 15_000, selector = 'body'): Promise<boolean> {
  try {
    await page.waitForFunction(
      ({ sel, src, flags }) => new RegExp(src, flags).test((document.querySelector(sel) as HTMLElement | null)?.innerText ?? ''),
      { sel: selector, src: re.source, flags: re.flags },
      { timeout },
    );
    console.log('ok   ' + what);
    return true;
  } catch {
    const body = (await page.locator(selector).innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    fail(`${what} (waited ${timeout} ms; page shows: ${body})`);
    return false;
  }
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/e2e-${name}-${page.viewportSize()?.width}x${page.viewportSize()?.height}.png` });
}

/** The projector frame must fit the viewport with no clipped panels (spec §16.2). */
async function checkProjector(page: Page, label: string): Promise<void> {
  const r = await page.evaluate(() => {
    const scr = document.querySelector<HTMLElement>('.scr');
    if (!scr) return { missing: true as const };
    const box = scr.getBoundingClientRect();
    const clipped: string[] = [];
    scr.querySelectorAll<HTMLElement>('.panel-body, .panel, .topbar, .fkeys, .ticker').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.className.split(' ')[0]}:${el.textContent?.slice(0, 30)}`);
    });
    return {
      missing: false as const,
      fits: box.width <= window.innerWidth + 0.5 && box.height <= window.innerHeight + 0.5,
      fs: parseFloat(getComputedStyle(scr).fontSize),
      clipped,
    };
  });
  if (r.missing) return fail(`${label}: no .scr frame`);
  if (!r.fits) fail(`${label}: frame exceeds the viewport`);
  if (r.fs < 14) fail(`${label}: font ${r.fs}px below 14px`);
  if (r.clipped.length) fail(`${label}: clipped ${r.clipped.join(' | ')}`);
}

/** Captures the projector at both required sizes, then restores the working size. */
async function snapProjector(page: Page, name: string): Promise<void> {
  for (const [w, h] of [[1280, 720], [1920, 1080]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    await shot(page, name);
    await checkProjector(page, `projector ${name} ${w}x${h}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

interface Harness {
  signIn(): Promise<string>;
  resolveCode(code: string): Promise<string | null>;
  found(g: string, name: string, ticker: string, label: string): Promise<{ firmId: string; pin: string }>;
  join(g: string, firmId: string, pin: string, label: string): Promise<void>;
  submit(g: string, round: number, firmId: string, d: { pace: number; safety: number; card: string; target: string | null }): Promise<void>;
  tryRead(path: string): Promise<string | null>;
  enginePath(g: string): string;
}
type Call<K extends keyof Harness> = Harness[K] extends (...a: infer A) => infer R ? [K, A, R] : never;

async function h<K extends keyof Harness>(page: Page, name: K, ...args: Call<K>[1]): Promise<Awaited<Call<K>[2]>> {
  return (await page.evaluate(([n, a]) => (window as unknown as { harness: Record<string, (...x: unknown[]) => Promise<unknown>> }).harness[n as string]!(...(a as unknown[])), [name, args] as const)) as Awaited<Call<K>[2]>;
}

/** Runs `fn` and reports whether it threw (the page rejects with the database's error). */
async function refused(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await loadRules();
  await adminSet('', null);

  const vite: ChildProcess = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    env: { ...process.env, VITE_USE_EMULATOR: '1' },
    stdio: 'ignore',
    detached: true,
  });
  let browser: Browser | null = null;
  try {
    await waitServer();
    browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
    await scenario(browser);
  } finally {
    await browser?.close();
    // npx starts Vite as a child process, so stop the whole group.
    if (vite.pid) process.kill(-vite.pid, 'SIGTERM');
  }
  console.log(failures.length === 0 ? 'All checks passed.' : `${failures.length} check(s) failed.`);
  process.exit(failures.length === 0 ? 0 : 1);
}

async function scenario(browser: Browser): Promise<void> {
  const watch = (page: Page, who: string): Page => {
    page.on('console', (m) => {
      // The browser logs the auth server's 400 for the deliberate wrong-password attempt.
      if (m.type() === 'error' && !m.location().url.includes('accounts:signInWithPassword')) fail(`${who}: console error: ${m.text()} (${m.location().url})`);
    });
    page.on('pageerror', (e) => fail(`${who}: page error: ${e.message}`));
    return page;
  };
  const participant = async (who: string): Promise<{ ctx: BrowserContext; page: Page }> => {
    const ctx = await browser.newContext();
    const page = watch(await ctx.newPage(), who);
    await page.goto(`${BASE}tests/e2e/harness/participant.html`);
    await page.waitForFunction(() => 'harness' in window);
    await h(page, 'signIn');
    return { ctx, page };
  };

  const facUid = await signUp('facilitator@example.test', 'correct-horse-9');
  await adminSet(`facilitators/${facUid}`, true);
  await signUp('outsider@example.test', 'correct-horse-9');

  // ── 1. Sign-in gate ────────────────────────────────────────────────────────
  const facCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const fac = watch(await facCtx.newPage(), 'facilitator');
  await fac.goto(`${BASE}#/new`);
  await waitText(fac, /SIGN IN/i, 'signed-out visitor sees the sign-in form');
  const signIn = async (email: string, password: string): Promise<void> => {
    await fac.getByLabel('Email').fill(email);
    await fac.getByLabel('Password').fill(password);
    await fac.getByRole('button', { name: 'Sign in' }).click();
  };
  await signIn('facilitator@example.test', 'wrong-password');
  await waitText(fac, /email or password is wrong/i, 'a wrong password is explained');
  await signIn('outsider@example.test', 'correct-horse-9');
  await waitText(fac, /not on the facilitator allowlist/i, 'an account off the allowlist gets a clear message');
  check(/[A-Za-z0-9]{20,}/.test(await fac.locator('body').innerText()), 'the message shows the user ID to add');
  await fac.getByRole('button', { name: 'Sign out' }).click();
  await waitText(fac, /SIGN IN/i, 'sign-out returns to the form');
  await signIn('facilitator@example.test', 'correct-horse-9');
  await waitText(fac, /NEW SESSION/i, 'an allowlisted account reaches #/new');

  // ── 2. Create a session (4 quarters, fixed seed, two bots) ─────────────────
  await fac.getByLabel('Fixed quarter').check();
  await fac.getByLabel('Quarter', { exact: true }).fill('4');
  await fac.getByLabel('Fixed, for rehearsal').check();
  await fac.getByLabel('Seed value').fill('7');
  await fac.getByRole('button', { name: 'Add bot firm' }).click();
  await fac.getByRole('button', { name: 'Add bot firm' }).click();
  await fac.getByRole('button', { name: 'Create session' }).click();
  await fac.waitForURL(/#\/screen\/[^/?]+/);
  const g = /#\/screen\/([^/?]+)/.exec(fac.url())?.[1] ?? '';
  check(g.length > 5, `session created (${g})`);
  await waitText(fac, /LOBBY/, 'the projector opens on the lobby', 15_000, '.scr');
  const code = (await fac.locator('.scr .big.signal').first().innerText()).trim();
  check(/^[A-HJ-NP-Z]{4}$/.test(code), `join code ${code} uses A–Z without I and O`);
  check((await fac.locator('.qr svg').count()) === 1, 'the lobby shows a QR code');
  check((await screenText(fac)).includes(`#/j/${code}`), 'the lobby shows the join address');
  check((await adminGet<string>(`codes/${code}`)) === g, 'the code resolves to the session');
  const engine0 = await adminGet<{ tau: number; endRound: number }>(`games/${g}/engine`);
  check(engine0.endRound === 4 && engine0.tau >= 30 && engine0.tau <= 40, 'tau and the end round are stored under engine');
  const tau = engine0.tau;

  // ── 3. Participants join from their own browser contexts ───────────────────
  const p1 = await participant('participant 1');
  const p2 = await participant('participant 2');
  const p3 = await participant('participant 3');
  check((await h(p1.page, 'resolveCode', code)) === g, 'a participant resolves the join code');
  const alpha = await h(p1.page, 'found', g, 'Alpha Works', 'ALPH', 'AB');
  const beta = await h(p2.page, 'found', g, 'Beta Works', 'BETA', 'CD');
  await h(p3.page, 'join', g, alpha.firmId, alpha.pin, 'EF');
  await waitText(fac, /ALPH\s+Alpha Works\s+2/, 'the lobby shows live member counts (ALPH has 2)', 15_000, '.scr');
  await waitText(fac, /BETA\s+Beta Works\s+1/, 'the lobby lists BETA with 1 member', 15_000, '.scr');
  const bad = alpha.pin === '0000' ? '1111' : '0000';
  check(await refused(() => h(p3.page, 'join', g, beta.firmId, bad, 'EF')), 'a wrong PIN is refused');
  check((await h(p1.page, 'tryRead', `games/${g}/engine`)) !== null, 'a participant cannot read engine');
  await snapProjector(fac, 'lobby');

  const control = watch(await facCtx.newPage(), 'control');
  await control.setViewportSize({ width: 1440, height: 900 });
  await control.goto(`${BASE}#/control/${g}`);
  await waitText(control, /CONTROL/, 'the console opens for the same account');
  await waitText(control, /ALPH[\s\S]*BETA/, 'the console lists the firms');

  // ── 4. Phase machine: briefing → quarter 1 ─────────────────────────────────
  await fac.keyboard.press('F9');
  await waitText(fac, /BRIEFING/, 'F9 opens the briefing', 15_000, '.scr');
  check((await adminGet<boolean>(`games/${g}/public/joinLocked`)) === true, 'firm creation is locked at the briefing');
  const p4 = await participant('late participant');
  check(await refused(() => h(p4.page, 'found', g, 'Late Works', 'LATE', 'ZZ')), 'a firm cannot be founded after the lobby');
  await snapProjector(fac, 'briefing');
  await fac.keyboard.press('Shift+A');
  await waitText(fac, /OPEN/, 'Shift+A opens quarter 1', 15_000, '.scr');
  await waitText(fac, /Q1 Y1/, 'the quarter label reads Q1 Y1', 5_000, '.scr');
  await waitText(fac, /T-00:(?:[0-5]\d)|T-0[12]:/, 'the server-time countdown runs', 5_000, '.scr');
  await waitText(fac, /2\/4 COMMITTED/, 'bots count as committed', 15_000, '.scr');
  check(!(await fac.content()).includes(String(tau)), 'tau does not appear on the projector');

  await h(p1.page, 'submit', g, 1, alpha.firmId, { pace: 3, safety: 8, card: 'NONE', target: null });
  await waitText(fac, /3\/4 COMMITTED/, 'a participant commit appears on the board', 15_000, '.scr');
  await waitText(control, /received|\d\d:\d\d:\d\d/i, 'the console shows the decision time');
  await snapProjector(fac, 'open');

  // Hidden values on the console: masked until held.
  const tauButton = control.getByRole('button', { name: 'Hold to reveal TAU' });
  check((await tauButton.innerText()).includes('•••'), 'tau is masked on the console');
  const box = await tauButton.boundingBox();
  if (box) {
    await control.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await control.mouse.down();
    check((await tauButton.innerText()).includes(tau.toFixed(1)), 'holding the button reveals tau');
    await control.mouse.up();
    check((await tauButton.innerText()).includes('•••'), 'releasing the button masks tau again');
  } else fail('tau button has no box');

  // Refresh mid-round recovers from the database.
  await fac.reload();
  await waitText(fac, /OPEN[\s\S]*3\/4 COMMITTED/, 'a refresh mid-round restores the open quarter', 15_000, '.scr');

  // ── 5. Resolve quarter 1 ───────────────────────────────────────────────────
  await fac.keyboard.press('F9');
  await waitText(fac, /REVEAL/, 'F9 resolves the quarter and shows the reveal', 15_000, '.scr');
  const q1 = await adminGet<{ T: number; headlines?: unknown[] }>(`games/${g}/rounds/1`);
  check(q1 !== null && typeof q1.T === 'number', 'quarter 1 results are written');
  const rows = await fac.locator('.scr table.tbl tbody tr').count();
  check(rows === 4, 'the board lists 4 firms');
  const betaRow = (await fac.locator('.scr table.tbl tbody tr', { hasText: 'BETA' }).innerText()).replace(/\s+/g, ' ');
  check(/AUTO/.test(betaRow), 'a firm that did not commit is marked AUTO');
  check(/BOT/.test((await fac.locator('.scr table.tbl tbody tr', { hasText: /BOT|ARCN|BRLK/ }).first().innerText())), 'bot firms carry a BOT tag');
  await fac.waitForTimeout(450);
  await shot(fac, 'reveal-mid');
  await fac.waitForTimeout(1200);
  await snapProjector(fac, 'reveal');
  const engineAfter1 = await adminGet<{ round: number }>(`games/${g}/engine`);
  check(engineAfter1.round === 1, 'the engine advanced one quarter');
  const priv = await adminGet<Record<string, unknown>>(`games/${g}/firmsPrivate/${alpha.firmId}`);
  check(typeof priv.cash === 'number', 'the firm private node was written');
  await waitText(control, /REVEAL/, 'the console follows the phase');

  // Trust and firm views.
  await fac.keyboard.type('trst');
  await fac.keyboard.press('Enter');
  await waitText(fac, /TRST · PUBLIC TRUST HISTORY/, 'TRST shows the trust history', 5_000, '.scr');
  await snapProjector(fac, 'trust');
  await fac.keyboard.press('Escape');
  await fac.keyboard.type('firm alph');
  await fac.keyboard.press('Enter');
  await waitText(fac, /FIRM · ALPH/, 'FIRM <TICKER> shows a firm profile', 5_000, '.scr');
  await snapProjector(fac, 'firm');
  await fac.keyboard.press('Escape');

  // ── 6. Quarter 2: summit, timer controls ───────────────────────────────────
  await fac.keyboard.press('F9');
  await waitText(fac, /Q2 Y1[\s\S]*OPEN/, 'F9 opens quarter 2', 15_000, '.scr');
  await fac.keyboard.press('F8');
  await waitText(fac, /Industry summit in session/, 'F8 enters the summit', 15_000, '.scr');
  await waitText(fac, /PAUSED/, 'the timer shows PAUSED in the summit', 5_000, '.scr');
  check(await refused(() => h(p2.page, 'submit', g, 2, beta.firmId, { pace: 2, safety: 10, card: 'NONE', target: null })), 'decisions are refused during the summit');
  await snapProjector(fac, 'summit');
  await fac.keyboard.press('F8');
  await waitText(fac, /OPEN/, 'F8 leaves the summit and returns to the open quarter', 15_000, '.scr');
  check(!/Industry summit in session/.test(await screenText(fac)), 'the summit banner clears');
  await control.getByRole('button', { name: 'Pause', exact: true }).click();
  await waitText(fac, /PAUSED/, 'Pause on the console pauses the timer', 15_000, '.scr');
  await control.getByRole('button', { name: 'Resume', exact: true }).click();
  await waitText(control, /Pause/, 'Resume restarts the timer');
  await h(p2.page, 'submit', g, 2, beta.firmId, { pace: 2, safety: 12, card: 'PUBLISH', target: null });
  await fac.keyboard.press('F9');
  await waitText(fac, /REVEAL/, 'quarter 2 resolves', 15_000, '.scr');

  // ── 7. Quarter 3: two facilitator windows press F9 together ────────────────
  await fac.keyboard.press('F9');
  await waitText(fac, /Q3 Y1[\s\S]*OPEN/, 'F9 opens quarter 3', 15_000, '.scr');
  await h(p1.page, 'submit', g, 3, alpha.firmId, { pace: 4, safety: 0, card: 'BLITZ', target: null });
  await h(p2.page, 'submit', g, 3, beta.firmId, { pace: 1, safety: 20, card: 'NONE', target: null });
  const dup = watch(await facCtx.newPage(), 'duplicate screen');
  await dup.goto(`${BASE}#/screen/${g}`);
  await waitText(dup, /Q3 Y1[\s\S]*OPEN/, 'a second projector window loads the same quarter', 15_000, '.scr');
  await Promise.all([fac.keyboard.press('F9'), dup.keyboard.press('F9')]);
  await waitText(fac, /REVEAL/, 'the first window shows the reveal', 15_000, '.scr');
  await waitText(dup, /REVEAL/, 'the second window shows the reveal', 15_000, '.scr');
  const engineAfter3 = await adminGet<{ round: number; history: unknown[] }>(`games/${g}/engine`);
  check(engineAfter3.round === 3 && Object.keys(engineAfter3.history).length === 3, 'two windows resolved quarter 3 exactly once');
  await dup.close();

  // ── 8. Quarter 4: F10 needs two presses; the open quarter is discarded ─────
  await fac.keyboard.press('F9');
  await waitText(fac, /Q4 Y1[\s\S]*OPEN/, 'F9 opens quarter 4', 15_000, '.scr');
  await fac.keyboard.press('F10');
  await waitText(fac, /Press END again within 3 s/, 'the first F10 asks for confirmation', 5_000, '.scr');
  await fac.waitForTimeout(3300);
  await fac.keyboard.press('F10');
  await waitText(fac, /Press END again within 3 s/, 'a late second F10 asks again', 5_000, '.scr');
  check((await adminGet<string>(`games/${g}/public/phase`)) === 'open', 'the quarter is still open after a late confirmation');
  await fac.keyboard.press('Shift+E');
  await waitText(fac, /SESSION ENDED/, 'a second press within 3 s ends the session', 15_000, '.scr');
  check((await adminGet<{ round: number }>(`games/${g}/engine`)).round === 3, 'the open quarter was discarded unresolved');
  await snapProjector(fac, 'ended');

  // ── 9. Hidden values never reached participant-readable nodes ──────────────
  for (const node of ['meta', 'public', 'firms', 'firmsPublic', 'rounds', 'pacts']) {
    const text = JSON.stringify((await adminGet(`games/${g}/${node}`)) ?? null);
    check(!/tau|endRound/.test(text) && !text.includes(String(tau)), `no hidden value in ${node}`);
  }

  // ── 10. Console at phone and desktop widths ────────────────────────────────
  for (const [w, hgt] of [[390, 844], [1440, 900]] as const) {
    await control.setViewportSize({ width: w, height: hgt });
    await control.waitForTimeout(200);
    await shot(control, 'control');
    check(!(await control.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `console has no horizontal scroll at ${w}x${hgt}`);
  }

  // ── 11. Reduced motion ─────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = watch(await ctx.newPage(), 'reduced motion');
    await page.goto(`${BASE}#/`);
    await page.goto(`${BASE}#/screen/${g}`);
    await page.getByLabel('Email').fill('facilitator@example.test');
    await page.getByLabel('Password').fill('correct-horse-9');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await waitText(page, /ENDED/, 'the ended session loads under reduced motion', 15_000, '.scr');
    await page.waitForFunction(() => document.querySelectorAll('.ticker-static li').length >= 3, null, { timeout: 8000 }).catch(() => undefined);
    check((await page.locator('.ticker-static li').count()) === 3, 'reduced motion shows 3 static headlines');
    check((await page.evaluate(() => document.getAnimations().length)) === 0, 'no animations run under reduced motion');
    await ctx.close();
  }

  // ── 12. Second session: auto-resolve and the retry state ───────────────────
  await fac.goto(`${BASE}#/new`);
  await waitText(fac, /NEW SESSION/, 'a second session form loads');
  await fac.getByLabel('Round timer (s)').fill('10');
  await fac.getByLabel('Auto-resolve at deadline').check();
  await fac.getByLabel('Manual (stops at 30)').check();
  await fac.getByLabel('Fixed, for rehearsal').check();
  await fac.getByLabel('Seed value').fill('9');
  await fac.getByRole('button', { name: 'Add bot firm' }).click();
  await fac.getByRole('button', { name: 'Add bot firm' }).click();
  await fac.getByRole('button', { name: 'Create session' }).click();
  await fac.waitForURL(/#\/screen\/[^/?]+/);
  const g2 = /#\/screen\/([^/?]+)/.exec(fac.url())?.[1] ?? '';
  check(g2 !== g && g2.length > 5, `second session created (${g2})`);
  await waitText(fac, /LOBBY/, 'the second lobby loads', 15_000, '.scr');
  await fac.keyboard.press('F9');
  await waitText(fac, /BRIEFING/, 'the second session opens its briefing', 15_000, '.scr');
  await fac.keyboard.press('F9');
  await waitText(fac, /OPEN/, 'the second session opens quarter 1', 15_000, '.scr');
  const opened = Date.now();
  await waitText(fac, /REVEAL/, 'auto-resolve closes the quarter at the deadline', 25_000, '.scr');
  const took = Date.now() - opened;
  check(took >= 10_000, `auto-resolve waited for the deadline (${Math.round(took / 1000)} s)`);
  check((await adminGet<{ round: number }>(`games/${g2}/engine`)).round === 1, 'auto-resolve resolved exactly one quarter');

  await fac.keyboard.press('F9');
  await waitText(fac, /Q2 Y1[\s\S]*OPEN/, 'quarter 2 opens in the second session', 15_000, '.scr');
  const c2 = watch(await facCtx.newPage(), 'control 2');
  await c2.goto(`${BASE}#/control/${g2}`);
  await waitText(c2, /CONTROL/, 'the second console opens');
  await adminSet(`games/${g2}/public/phase`, 'resolving');
  await adminSet(`games/${g2}/public/resolvingBy`, 'stuck-window');
  await waitText(c2, /Resolution incomplete — retry/, 'a stuck resolution shows the retry state', 15_000);
  await c2.getByRole('button', { name: 'Retry resolution' }).click();
  await waitText(fac, /REVEAL/, 'Retry completes the quarter', 15_000, '.scr');
  check((await adminGet<{ round: number }>(`games/${g2}/engine`)).round === 2, 'the retried quarter was resolved once');
  check(!/Resolution incomplete/.test(await c2.locator('body').innerText()), 'the retry state clears');
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
