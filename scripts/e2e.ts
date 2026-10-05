/**
 * End-to-end run against the emulators (Session 4). Usage: `npm run test:e2e`.
 *
 * Starts the Vite dev server against the emulators, then drives:
 *  - a facilitator browser context (sign-in gate, #/new, #/screen, #/control)
 *  - one browser context per scripted participant (tests/e2e/harness), each with its own
 *    anonymous sign-in, founding, joining and committing through the real data layer.
 * Session 5 adds real participant browsers (phone and desktop sizes, one keyboard-only) that
 * join through the UI and play a 3-quarter session.
 * Screenshots go to shots/e2e-*.png. Exits non-zero on any failed check.
 */
import { readFileSync } from 'node:fs';
import type { Browser, BrowserContext, Page } from 'playwright';
import { PARAMS, estimatedCost } from '../src/engine';
import { ownResultSentence } from '../src/screens/Results/headlines';
import { fmt, fmtShare } from '../src/ui/format';
import { adminSet } from './emulator-rules';
import {
  BASE, adminGet, blockOutside, check, fail, h, refused, runWithStack, screenText, shot, signUp, snapPlay, snapProjector, tabTo, waitText,
} from './lib/e2e-kit';

// ── Run ───────────────────────────────────────────────────────────────────────

async function scenario(browser: Browser): Promise<void> {
  const watch = (page: Page, who: string): Page => {
    blockOutside(page, who);
    page.on('console', (m) => {
      // The browser logs the auth server's 400 for the deliberate wrong-password attempt, and failed
      // connections while a participant is deliberately taken offline.
      if (m.type() === 'error' && !m.location().url.includes('accounts:signInWithPassword') && !m.text().includes('ERR_INTERNET_DISCONNECTED')) fail(`${who}: console error: ${m.text()} (${m.location().url})`);
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
  const code = (await fac.locator('.scr [data-join-code]').first().innerText()).trim();
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

  // Session 9 review, H1: a device that founds twice leaves a firm with no members; REMOVE clears it.
  const p5 = await participant('participant who founds twice');
  const p5uid = await h(p5.page, 'signIn');
  const spare = await h(p5.page, 'found', g, 'Spare Works', 'SPAR', 'GH');
  const gone = await h(p5.page, 'found', g, 'Gone Works', 'GONE', 'GH');
  await waitText(fac, /SPAR[\s\S]*GONE/, 'the lobby lists both firms founded by one device', 15_000, '.scr');
  for (const [firm, ticker] of [[spare, 'SPAR'], [gone, 'GONE']] as const) {
    await control.getByRole('button', { name: `Remove ${ticker}` }).click();
    await waitText(control, new RegExp(`Press REMOVE on ${ticker} again`), `the first REMOVE on ${ticker} only arms it`);
    check((await adminGet(`games/${g}/firms/${firm.firmId}`)) !== null, `${ticker} is still there after one press`);
    await control.getByRole('button', { name: `Remove ${ticker}` }).click();
    await waitText(control, new RegExp(`${ticker} removed`), `a second REMOVE removes ${ticker}`);
  }
  check((await adminGet(`games/${g}/members/${p5uid}`)) === null, "the removed firm's device is no longer a member");
  await waitText(fac, /4 FIRMS/, 'the projector drops the removed firms', 15_000, '.scr');
  await control.getByRole('button', { name: 'LOCK JOINS' }).click();
  await waitText(control, /Joining locked/, 'LOCK JOINS locks joining in the lobby');
  check((await adminGet<boolean>(`games/${g}/public/joinLocked`)) === true, 'joinLocked is set by LOCK JOINS');
  check(await refused(() => h(p5.page, 'found', g, 'Late Spare', 'LSPR', 'GH')), 'no firm can be founded once joins are locked');
  await control.getByRole('button', { name: 'REOPEN JOINS' }).click();
  await waitText(control, /Joining reopened/, 'REOPEN JOINS reopens joining in the lobby');
  check((await adminGet<boolean>(`games/${g}/public/joinLocked`)) === false, 'joinLocked is cleared by REOPEN JOINS');

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
  // The lobby steps scroll the console down (LOCK JOINS sits near the bottom), and a console notice
  // clears after 5 s and shifts the layout: measure the button in view, after the notice goes.
  await control.waitForFunction(() => !document.querySelector('[role=status] .notice'), undefined, { timeout: 15_000 });
  await tauButton.scrollIntoViewIfNeeded();
  const box = await tauButton.boundingBox();
  if (box) {
    await control.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await control.mouse.down();
    const shown = await control
      .waitForFunction((t) => document.querySelector('[aria-label="Hold to reveal TAU"]')?.textContent?.includes(t) ?? false, tau.toFixed(1), { timeout: 5_000 })
      .then(() => true, () => false);
    check(shown, 'holding the button reveals tau');
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
  // Firm performance views (Session 13).
  await fac.keyboard.type('firms');
  await fac.keyboard.press('Enter');
  await waitText(fac, /FIRMS[\s\S]*same scale/, 'FIRMS shows the small multiples', 5_000, '.scr');
  check((await fac.locator('.fm-card').count()) === 4 && (await fac.locator('[data-firms-grid="3x2"]').count()) === 1, 'FIRMS draws a card for each of 4 firms in 3 columns');
  await snapProjector(fac, 'firms');
  await fac.keyboard.press('Escape');
  await fac.keyboard.type('ranks');
  await fac.keyboard.press('Enter');
  await waitText(fac, /RANKS[\s\S]*1 quarter resolved/, 'RANKS after one quarter says 1 quarter resolved', 5_000, '.scr');
  await fac.keyboard.press('Escape');
  await fac.keyboard.type('help');
  await fac.keyboard.press('Enter');
  await waitText(fac, /HELP[\s\S]*FIRMS[\s\S]*RANKS/, 'HELP lists FIRMS and RANKS', 5_000, '.scr');
  await fac.keyboard.press('Escape');
  const board1 = await fac.locator('[data-share-strip]').count();
  check(board1 === 1 && (await fac.locator('.scr [data-value-bar]').count()) === 4, 'the board shows the value share strip and a value bar per firm');

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
  await fac.waitForTimeout(600); // the projector ignores a key pressed while the previous action is still finishing

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

  await participantScenario(browser, fac, facCtx, watch, participant);
}


// ── Session 5: participants ───────────────────────────────────────────────────

async function participantScenario(
  browser: Browser,
  fac: Page,
  facCtx: BrowserContext,
  watch: (page: Page, who: string) => Page,
  harnessParticipant: (who: string) => Promise<{ ctx: BrowserContext; page: Page }>,
): Promise<void> {
  console.log('--- Session 5: participants ---');
  // The projector ignores a key pressed while its previous action is still finishing, so settle first.
  const key = async (page: Page, k: string): Promise<void> => {
    await page.waitForTimeout(600);
    await page.keyboard.press(k);
  };
  // ── Create a 3-quarter session with two bots and a 60 s timer ──
  await fac.goto(`${BASE}#/new`);
  await waitText(fac, /NEW SESSION/, 'participant run: the session form loads');
  await fac.getByLabel('Round timer (s)').fill('60');
  await fac.getByLabel('Fixed quarter').check();
  await fac.getByLabel('Quarter', { exact: true }).fill('3');
  await fac.getByLabel('Fixed, for rehearsal').check();
  await fac.getByLabel('Seed value').fill('11');
  await fac.getByRole('button', { name: 'Add bot firm' }).click();
  await fac.getByRole('button', { name: 'Add bot firm' }).click();
  await fac.getByRole('button', { name: 'Create session' }).click();
  await fac.waitForURL(/#\/screen\/[^/?]+/);
  const g = /#\/screen\/([^/?]+)/.exec(fac.url())?.[1] ?? '';
  await waitText(fac, /LOBBY/, 'participant run: the lobby loads', 15_000, '.scr');
  const code = (await fac.locator('.scr [data-join-code]').first().innerText()).trim();
  const control = watch(await facCtx.newPage(), 'participant-run control');
  await control.setViewportSize({ width: 1440, height: 900 });
  await control.goto(`${BASE}#/control/${g}`);
  await waitText(control, /CONTROL/, 'participant run: the console opens');

  // ── Phone A: landing, code entry, confirm, found a firm ──
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const A = watch(await ctxA.newPage(), 'phone A');
  await A.goto(`${BASE}#/`);
  await waitText(A, /Session code/, 'landing shows the code field');
  check(/FACILITATOR SIGN-IN/.test(await A.locator('body').innerText()), 'landing offers the facilitator sign-in');
  await snapPlay(A, 'landing');
  await A.getByLabel('Session code').fill('KXMI');
  await A.getByRole('button', { name: 'Join a session' }).click();
  await waitText(A, /four letters, A to Z without I or O/, 'an invalid code is explained');
  await A.getByLabel('Session code').fill(code.toLowerCase());
  await A.getByRole('button', { name: 'Join a session' }).click();
  await A.waitForURL(new RegExp(`#/j/${code}`));
  await A.getByRole('button', { name: 'Continue' }).waitFor();
  check((await A.getByLabel('Session code').inputValue()) === code, 'the typed code carries over to the join page');
  await A.getByLabel('Session code').fill('ZZZZ');
  await A.getByRole('button', { name: 'Continue' }).click();
  await waitText(A, /No session has this code/, 'an unknown code is explained');
  await A.getByLabel('Session code').fill(code);
  await A.getByRole('button', { name: 'Continue' }).click();
  await A.getByRole('button', { name: 'Found a firm' }).waitFor();
  await snapPlay(A, 'join-choose');
  await A.getByRole('button', { name: 'Found a firm' }).click();
  await A.getByRole('button', { name: 'Found the firm' }).click();
  await waitText(A, /needs 2 to 20 characters/, 'a missing firm name is explained');
  await waitText(A, /needs 3 to 6 letters/, 'a missing ticker is explained');
  await A.getByLabel(/Firm name/).fill('Alpha Works');
  await A.getByLabel(/Ticker/).fill('al1ph');
  check((await A.getByLabel(/Ticker/).inputValue()) === 'ALPH', 'the ticker keeps A–Z only, in capitals');
  await A.getByLabel(/Device initials/).fill('ab');
  const pinShown = (await A.locator('.big.signal').innerText()).trim();
  check(/^[0-9]{4}$/.test(pinShown), `a 4-digit PIN is shown before founding (${pinShown})`);
  check(/full name/i.test(await A.locator('body').innerText()), 'the initials field warns against full names');
  await snapPlay(A, 'join-found');
  await A.getByRole('button', { name: 'Found the firm' }).click();
  await waitText(A, /ALPH FOUNDED/, 'founding confirms the firm');
  check((await A.locator('.big.signal').innerText()).trim() === pinShown, 'the PIN stays the same after founding');
  await snapPlay(A, 'join-founded');
  await A.getByRole('button', { name: 'Open the desk' }).click();
  await A.waitForURL(/#\/play\//);
  await waitText(A, /has not opened/, 'the desk waits in the lobby');
  const firmA = Object.entries((await adminGet<Record<string, { ticker: string; isBot: boolean }>>(`games/${g}/firms`)) ?? {}).find(([, f]) => f.ticker === 'ALPH')?.[0] ?? '';
  check((await adminGet<{ pin: string }>(`games/${g}/firmSecrets/${firmA}`)).pin === pinShown, 'the PIN shown is the PIN stored');
  check((await A.locator('.panel', { hasText: 'TEAM' }).innerText()).includes(pinShown), 'the PIN is shown again on the DESK');

  // ── Phone B: joins by direct address, wrong PIN then right PIN ──
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const B = watch(await ctxB.newPage(), 'phone B');
  await B.goto(`${BASE}#/j/${code}`);
  check((await B.getByLabel('Session code').inputValue()) === code, 'the join address prefills the code');
  await B.getByRole('button', { name: 'Continue' }).click();
  await B.getByRole('button', { name: 'Join a firm' }).click();
  await B.getByRole('button', { name: 'Join the firm' }).click();
  await waitText(B, /Select a firm to join/, 'joining without a firm is explained');
  await B.getByRole('radio', { name: /ALPH/ }).check();
  await B.getByLabel(/Firm PIN/).fill(pinShown === '0000' ? '1111' : '0000');
  await B.getByLabel(/Device initials/).fill('ef');
  await snapPlay(B, 'join-firm');
  await B.getByRole('button', { name: 'Join the firm' }).click();
  await waitText(B, /PIN was not accepted/, 'a wrong PIN is refused and explained');
  await B.getByLabel(/Firm PIN/).fill(pinShown);
  await B.getByRole('button', { name: 'Join the firm' }).click();
  await B.waitForURL(/#\/play\//);
  await waitText(B, /has not opened/, 'a correct PIN joins the firm');

  // ── Desktop C: founds a second firm and uses the keyboard only from the desk on ──
  const ctxC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const C = watch(await ctxC.newPage(), 'desktop C');
  await C.goto(`${BASE}#/j/${code}`);
  await C.getByRole('button', { name: 'Continue' }).click();
  await C.getByRole('button', { name: 'Found a firm' }).click();
  await C.getByLabel(/Firm name/).fill('Cedar Labs');
  await C.getByLabel(/Ticker/).fill('CEDR');
  await C.getByLabel(/Device initials/).fill('gh');
  await C.getByRole('button', { name: 'Found the firm' }).click();
  await C.getByRole('button', { name: 'Open the desk' }).click();
  await waitText(C, /has not opened/, 'a second firm is founded');
  // A ticker already in use is refused.
  const ctxD = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const D = watch(await ctxD.newPage(), 'phone D');
  await D.goto(`${BASE}#/j/${code}`);
  await D.getByRole('button', { name: 'Continue' }).click();
  await D.getByRole('button', { name: 'Found a firm' }).click();
  await D.getByLabel(/Firm name/).fill('Another Alpha');
  await D.getByLabel(/Ticker/).fill('ALPH');
  await D.getByRole('button', { name: 'Found the firm' }).click();
  await waitText(D, /already uses this ticker/, 'a duplicate ticker is refused');

  // ── Briefing: late joins are closed ──
  await key(fac, 'F9');
  await waitText(fac, /BRIEFING/, 'participant run: F9 opens the briefing', 15_000, '.scr');
  await waitText(A, /Total market revenue tracks public trust/, 'participants see the briefing');
  await waitText(D, /Joining is closed/, 'an open founding form is replaced by the closed notice when the briefing starts');
  await D.reload();
  await D.getByRole('button', { name: 'Continue' }).click();
  await waitText(D, /Joining is closed/, 'a late visitor is told joining is closed');
  await ctxD.close();

  // ── Quarter 1 ──
  await key(fac, 'Shift+A');
  await waitText(A, /T-\d\d:\d\d/, 'the countdown runs on the phone', 15_000);
  await waitText(A, /Q1 Y1/, 'the header shows the quarter');
  const botTickers = Object.values((await adminGet<Record<string, { ticker: string; isBot: boolean }>>(`games/${g}/firms`)) ?? {}).filter((f) => f.isBot).map((f) => f.ticker);

  await A.getByRole('radio', { name: /Aggressive/ }).click();
  for (let i = 0; i < 3; i++) await A.getByRole('button', { name: 'Safety spend: increase' }).click();
  await A.getByRole('button', { name: /^Card:/ }).click();
  await A.getByRole('radio', { name: /PUBLISH/ }).click();
  await A.getByRole('button', { name: 'Done' }).click();
  const cost1 = fmt(estimatedCost(3, 13, 'PUBLISH', PARAMS));
  check(/Estimated cost this quarter\s*\n?\s*/.test(await A.locator('[aria-label="Estimate"]').innerText()) && (await A.locator('[aria-label="Estimate"]').innerText()).includes(cost1), `the estimated cost is ${cost1}`);
  check(/LOW|MED|HIGH|SEVERE/.test(await A.locator('[aria-label="Estimate"]').innerText()), 'the public exposure label is shown');
  check(/same card cannot repeat[\s\S]*Insolvent firms cannot play cards/.test(await A.locator('[aria-label="Card"]').innerText()), 'the cooldown and insolvency rules are shown inline');
  await snapPlay(A, 'play-open');
  await A.getByRole('button', { name: 'COMMIT' }).click();
  await waitText(A, /Committed \d\d:\d\d:\d\d · edit until close · device AB/, 'commit shows the time and the committing device');
  await waitText(B, /Committed \d\d:\d\d:\d\d · edit until close · device AB/, 'a teammate sees which device committed');
  check((await B.getByRole('radio', { name: /Aggressive/ }).getAttribute('aria-checked')) === 'true', 'a teammate’s desk adopts the committed pace');
  await B.getByRole('radio', { name: /Breakneck/ }).click();
  await waitText(B, /changes not committed/, 'an edited desk says changes are not committed');
  await B.getByRole('button', { name: 'Recommit' }).click();
  await waitText(B, /device EF(?![\s\S]*changes not committed)/, 'recommit replaces the decision from the second device');
  await waitText(A, /device EF/, 'the first device sees the recommit');
  const dec1 = await adminGet<{ pace: number; safety: number; card: string }>(`games/${g}/decisions/1/${firmA}`);
  check(dec1.pace === 4 && dec1.safety === 13 && dec1.card === 'PUBLISH', 'the stored decision is the recommitted one');

  // Keyboard-only commit on desktop C.
  await C.keyboard.press('Tab');
  await tabTo(C, '[aria-label="Deployment pace"] [role=radio][aria-checked="true"]', 'the pace selector');
  await C.keyboard.press('ArrowRight');
  await tabTo(C, 'input[type=range][aria-label="Safety spend"]', 'the safety slider');
  await C.keyboard.press('ArrowRight');
  await C.keyboard.press('ArrowRight');
  await tabTo(C, '.card-trigger', 'the card picker');
  await C.keyboard.press('Enter');
  await tabTo(C, '.card-opt[aria-checked="false"]', 'the BLITZ card', 'BLITZ');
  await C.keyboard.press('Enter');
  await tabTo(C, '.sheet-body .btn-signal', 'the Done button');
  await C.keyboard.press('Enter');
  await tabTo(C, '.commit-bar .btn-signal', 'the commit button');
  await C.keyboard.press('Enter');
  await waitText(C, /Committed \d\d:\d\d:\d\d · edit until close · device GH/, 'a keyboard-only commit works');
  const firmC = Object.entries((await adminGet<Record<string, { ticker: string }>>(`games/${g}/firms`)) ?? {}).find(([, f]) => f.ticker === 'CEDR')?.[0] ?? '';
  const decC = await adminGet<{ pace: number; safety: number; card: string }>(`games/${g}/decisions/1/${firmC}`);
  check(decC.pace === 3 && decC.safety === 12 && decC.card === 'BLITZ', 'the keyboard-only decision has pace 3, safety 12, BLITZ');
  await tabTo(C, '[role=tab][aria-selected="true"]', 'the tab bar');
  await C.keyboard.press('ArrowRight');
  await waitText(C, /No quarters resolved yet/, 'arrow keys move between tabs');
  await C.keyboard.press('Home');
  await waitText(C, /Estimated cost this quarter/, 'Home returns to the desk');
  await snapPlay(C, 'play-desktop-open');

  // Reload keeps membership (same device, same anonymous user).
  await A.reload();
  await waitText(A, /Committed \d\d:\d\d:\d\d[\s\S]*device EF/, 'a reload restores the firm and its committed decision');
  const A2 = watch(await ctxA.newPage(), 'phone A (new tab)');
  await A2.goto(`${BASE}#/`);
  check(await A2.getByRole('link', { name: /RESUME LAST SESSION/ }).isVisible(), 'the landing page offers to resume the last session');
  await A2.getByRole('link', { name: /RESUME LAST SESSION/ }).click();
  await waitText(A2, /ALPH/, 'resuming returns to the same firm');
  await A2.close();

  // ── Reveal 1 ──
  await key(fac, 'F9');
  await waitText(A, /Q1 Y1 RESULT/, 'the result card appears at the reveal', 15_000);
  const resultText = await A.locator('main').innerText();
  check(/Revenue[\s\S]*Costs[\s\S]*Profit[\s\S]*Valuation/.test(resultText) && /RANK \d/.test(resultText), 'the result card shows revenue, costs, profit, valuation and rank');
  check(/NOTICES/.test(resultText), 'the result card has a notices panel');
  await snapPlay(A, 'play-reveal');
  await A.getByRole('tab', { name: 'BOOK' }).click();
  await waitText(A, /Q1 Y1/, 'BOOK lists the quarter');
  check(/1 quarter resolved/.test(await A.locator('main').innerText()), 'BOOK says 1 quarter resolved instead of drawing a one-point line');
  await snapPlay(A, 'play-book');
  await A.getByRole('tab', { name: 'WIRE' }).click();
  check((await A.locator('ul[aria-label="Wire"] li').count()) >= 2, 'WIRE lists the quarter’s headlines');
  await snapPlay(A, 'play-wire');
  await A.getByRole('tab', { name: 'PACTS' }).click();
  await waitText(A, /No pacts have been formed/, 'PACTS shows existing pacts read only');
  await snapPlay(A, 'play-pacts');
  await A.getByRole('tab', { name: 'DESK' }).click();
  const priv1 = await adminGet<{ cash: number }>(`games/${g}/firmsPrivate/${firmA}`);
  check((await A.locator('.play-head').innerText()).includes(fmt(priv1.cash)), 'the header shows the firm’s cash');

  // ── Quarter 2: summit freezes the desk, then POACH ──
  await key(fac, 'F9');
  await waitText(A, /Q2 Y1[\s\S]*T-/, 'quarter 2 opens on the phone', 15_000);
  const defaultsText = await A.locator('[aria-label="Pace"]').innerText();
  check(/4/.test(defaultsText) && (await A.getByRole('radio', { name: /Breakneck/ }).getAttribute('aria-checked')) === 'true', 'the desk defaults to last quarter’s applied pace');
  await key(fac, 'F8');
  await waitText(A, /Industry summit in session/, 'the summit banner shows', 15_000);
  // The tab switches in an effect after the banner first renders, so wait for it rather than reading it at once.
  check(
    await A.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes('PACTS') ?? false, undefined, { timeout: 5_000 }).then(() => true, () => false),
    'the summit selects the PACTS tab',
  );
  await snapPlay(A, 'play-summit');

  // Pacts (Session 6): propose from the phone, join from the desktop, audit and disclose from the projector.
  await A.getByRole('button', { name: 'PROPOSE A PACT' }).click();
  await A.getByRole('button', { name: 'SIGN PACT-A' }).click();
  await waitText(A, /PACT-A[\s\S]*pace 2 or lower/, 'a pact is proposed from the phone during the summit');
  await waitText(fac, /PACT-A/, 'the projector lists the new pact in the summit view', 15_000, '.scr');
  await C.getByRole('button', { name: 'JOIN PACT-A' }).click();
  await waitText(C, /LEAVE PACT-A/, 'a second firm joins the pact from the desktop');
  await waitText(fac, /ALPH\s+CEDR|CEDR\s+ALPH/, 'the projector shows both members', 15_000, '.scr');
  await snapPlay(C, 'play-pacts-live');
  await A.getByRole('tab', { name: 'WIRE' }).click();
  await waitText(A, /PACT-A/, 'the pact headlines reach the WIRE tab', 20_000);
  await A.getByRole('tab', { name: 'PACTS' }).click();
  // Another pact attempt without terms is refused with an explanation.
  await A.getByRole('button', { name: 'PROPOSE A PACT' }).click();
  await A.getByRole('checkbox', { name: 'Maximum pace' }).uncheck();
  await A.getByRole('button', { name: /SIGN PACT-B/ }).click();
  await waitText(A, /Set a maximum pace, a minimum safety spend, or both/, 'a pact with no terms is explained');
  await A.getByRole('button', { name: 'CANCEL' }).click();
  // F6 on the projector queues a manual audit; the console shows it queued.
  await key(fac, 'Shift+F');
  await waitText(fac, /AUDIT · SELECT PACT/, 'Shift+F opens the audit picker on the projector', 15_000, '.scr');
  await shot(fac, 'participant-run-audit');
  await key(fac, '1');
  await waitText(fac, /PACT-A audit queued/, 'pressing 1 queues the audit', 15_000, '.scr');
  await waitText(control, /QUEUED/, 'the console shows the audit queued', 15_000);
  // F7 / Shift+D turns disclosure on, on the projector and the console.
  await key(fac, 'Shift+D');
  await waitText(fac, /DISCLOSURE ON/, 'Shift+D turns disclosure on', 15_000, '.scr');
  await waitText(control, /F7 DISCLOSURE ON/, 'the console shows disclosure on', 15_000);
  await A.getByRole('tab', { name: 'DESK' }).click();
  check(await A.getByRole('button', { name: 'LOCKED' }).isDisabled(), 'the desk is locked during the summit');
  await key(fac, 'F8');
  await waitText(A, /^(?![\s\S]*Industry summit in session)[\s\S]*T-\d\d:\d\d/, 'leaving the summit clears the banner and restores the countdown', 15_000);
  await A.getByRole('button', { name: /^Card:/ }).click();
  await A.getByRole('radio', { name: /POACH/ }).click();
  await A.getByRole('button', { name: 'Done' }).click({ force: true, trial: true }).catch(() => undefined);
  check(await A.getByRole('button', { name: 'Done' }).isDisabled(), 'POACH without a target cannot be confirmed');
  const target = botTickers[0] ?? 'ARCN';
  await A.getByRole('radio', { name: target }).click();
  await A.getByRole('button', { name: 'Done' }).click();
  await snapPlay(A, 'play-poach');
  await A.getByRole('button', { name: /Recommit|COMMIT/ }).click();
  await waitText(A, /Committed/, 'POACH with a target commits');
  const dec2 = await adminGet<{ card: string; target: string | null }>(`games/${g}/decisions/2/${firmA}`);
  check(dec2.card === 'POACH' && dec2.target !== null && dec2.target !== firmA, 'the stored POACH has a target other than the own firm');
  await key(fac, 'F9');
  await waitText(A, /Q2 Y1 RESULT/, 'quarter 2 resolves', 15_000);
  check(/PACT-A audit found a breach\. Fine \d/.test(await A.locator('main').innerText()), 'the result card reports the audit breach and the fine');
  // BOOK against the field (Session 13): every other firm as a thin line, from public round results.
  await A.getByRole('tab', { name: 'BOOK' }).click();
  await A.locator('[data-book-field] svg[data-chart="line"]').waitFor({ timeout: 5_000 }).catch(() => fail('BOOK draws the field chart after quarter 2'));
  check((await A.locator('[data-book-field] [data-context]').count()) === 3, 'BOOK draws the firm against the 3 other firms');
  check(/^Rank [1-4] of 4\./.test((await A.locator('[data-book-sentence]').innerText()).trim()), 'BOOK states the rank of 4');
  await snapPlay(A, 'play-book-field');
  await A.getByRole('tab', { name: 'DESK' }).click();
  // RANKS after two quarters: a line per firm, one leader highlighted.
  await fac.keyboard.type('ranks');
  await fac.keyboard.press('Enter');
  await waitText(fac, /RANKS[\s\S]*(rose to|holds) 1st/, 'RANKS shows the headline after two quarters', 5_000, '.scr');
  check((await fac.locator('[data-rank-line]').count()) === 4 && (await fac.locator('[data-rank-line][data-tone="leader"]').count()) === 1, 'RANKS draws 4 lines with the leader highlighted');
  await snapProjector(fac, 'ranks');
  await fac.keyboard.press('Escape');
  const board2 = await screenText(fac);
  check(/PACE\s+SAFETY\s+EXPOSURE/.test(board2), 'the board shows PACE, SAFETY and EXPOSURE while disclosure is on');
  check(/BREACH/.test(board2) && /PACT-A/.test(board2), 'the board carries the pact tag and the BREACH tag after the audit');
  await shot(fac, 'participant-run-disclosure-on');
  await key(fac, 'Shift+D');
  await waitText(fac, /DISCLOSURE OFF/, 'Shift+D turns disclosure off', 15_000, '.scr');
  check(!/PACE\s+SAFETY\s+EXPOSURE/.test(await screenText(fac)), 'the PACE, SAFETY and EXPOSURE columns disappear when disclosure is off');
  const round2 = await adminGet<{ disclosure?: Record<string, unknown> }>(`games/${g}/rounds/2`);
  check(Object.keys(round2.disclosure ?? {}).length === 4, 'the quarter 2 snapshot holds all four firms');

  // ── Quarter 3: cooldowns, offline, locked after the deadline ──
  await key(fac, 'F9');
  await waitText(A, /Q3 Y1[\s\S]*T-/, 'quarter 3 opens', 15_000);
  await A.getByRole('button', { name: /^Card:/ }).click();
  check((await A.getByRole('radio', { name: /POACH/ }).getAttribute('aria-disabled')) === 'true', 'the card played last quarter is not selectable');
  check(/Played last quarter/.test(await A.locator('dialog').innerText()), 'the sheet says why the card is unavailable');
  await A.getByRole('radio', { name: /LOBBY/ }).click();
  await A.getByRole('button', { name: 'Done' }).click();

  // Offline state and automatic reconnection.
  await ctxA.setOffline(true);
  const sawOffline = await waitText(A, /Offline\. Reconnecting automatically/, 'the offline banner appears', 30_000);
  if (sawOffline) {
    check(await A.getByRole('button', { name: /COMMIT|Recommit/ }).isDisabled(), 'committing is paused while offline');
    await snapPlay(A, 'play-offline');
  }
  await ctxA.setOffline(false);
  await waitText(A, /^(?![\s\S]*Offline\. Reconnecting)[\s\S]*/, 'the offline banner clears after reconnecting', 30_000);
  await A.getByRole('button', { name: /COMMIT|Recommit/ }).click();
  await waitText(A, /Committed/, 'a commit goes through after reconnecting');

  // Close the quarter: -30 s twice on the console puts the deadline at now.
  // The console ignores a press while the previous action runs, so wait for each to finish.
  await control.getByRole('button', { name: '−30 s' }).click();
  await waitText(control, /Removed 30 s/, 'the first −30 s is applied');
  await control.getByRole('button', { name: '−30 s' }).click();
  await waitText(A, /Quarter closed/, 'the desk shows the closed state after the deadline', 15_000);
  check(await A.getByRole('button', { name: 'LOCKED' }).isDisabled(), 'the commit button is locked after the deadline');
  await snapPlay(A, 'play-locked');
  await key(fac, 'F9');
  await waitText(A, /Q3 Y1 RESULT/, 'quarter 3 resolves', 15_000);
  await key(fac, 'F9');
  await waitText(A, /ENDED/, 'the session ends', 15_000);
  await waitText(A, /Watch the board/, 'the ended state points to the board');
  await snapPlay(A, 'play-ended');
  await waitText(B, /Watch the board/, 'a teammate sees the ended state');

  // ── Session 7: results, export, delete ──
  console.log('--- Session 7: results ---');
  type Fin = { ticker: string; rank: number; valuation: number; peakValuation: number; counterfactual: number; drawShare: number; undetected: number };
  type Res = { rounds: number; industry: { actual: number; counterfactual: number; destroyed: number }; final: Record<string, Fin>; dataLines: string[] };
  const res = await adminGet<Res | null>(`games/${g}/results`);
  check(res !== null && res.rounds === 3, 'results were written once the session ended (3 quarters)');
  if (res) {
    check(!/tau|endRound|seed/.test(JSON.stringify(res)), 'the results node holds no hidden value');
    check(res.dataLines.length === 12, 'results hold 12 DATA lines (3 quarters, 4 firms)');
    const own = res.final[firmA];
    check(own !== undefined, 'the results hold a row for firm ALPH');
    // Participant card: own figures only.
    await waitText(A, /Counterfactual/, 'phone A shows the actual vs counterfactual card');
    const textA = await A.locator('body').innerText();
    check(own !== undefined && textA.includes(`RANK ${own.rank} OF 4`), 'phone A shows its final rank');
    check(own !== undefined && textA.includes(fmt(own.valuation)) && textA.includes(fmt(own.counterfactual)), 'phone A shows valuation and counterfactual');
    check(/DAMAGE/.test(textA) && textA.includes(fmtShare(own?.drawShare ?? -1)) && /Undetected/.test(textA), 'phone A shows its share of the damage and undetected violations');
    check(own !== undefined && textA.includes(ownResultSentence(own, 4)), 'phone A opens with its result sentence');
    const others = Object.entries(res.final).filter(([id]) => id !== firmA).map(([, f]) => f.ticker);
    check(others.every((t) => !new RegExp(`\\b${t}\\b`).test(textA)), "phone A does not show another firm's ticker");
    await snapPlay(A, 'play-results-card');
    await waitText(B, /Counterfactual/, 'a teammate sees the same results card');
  }

  // Projector: F9 on the ended board opens the results sequence.
  await key(fac, 'F9');
  await waitText(fac, /RESULTS[\s\S]*1\/6[\s\S]*FINAL BOARD/, 'F9 on the ended board opens results panel 1', 15_000, '.scr');
  if (res) {
    const text1 = await screenText(fac);
    check(Object.values(res.final).every((f) => text1.includes(f.ticker) && text1.includes(fmt(f.valuation))), 'panel 1 lists every firm with its final valuation');
  }
  await snapProjector(fac, 'results-1');
  const panels: Array<[number, RegExp, string]> = [
    [2, /TRUST TRACE/, 'TRUST TRACE'],
    [3, /COUNTERFACTUAL[\s\S]*INDUSTRY VALUE[\s\S]*ALTERNATIVE[\s\S]*VALUE (LOST|ADDED)/, 'COUNTERFACTUAL'],
    [4, /ATTRIBUTION[\s\S]*SHARE OF DAMAGE[\s\S]*SHARE OF VALUE/, 'ATTRIBUTION'],
    [5, /PACT RECORD/, 'PACT RECORD'],
    [6, /DEBRIEF[\s\S]*Ostrom/, 'DEBRIEF'],
  ];
  for (const [n, re, name] of panels) {
    await key(fac, 'F9');
    await waitText(fac, new RegExp(`${n}/6`), `F9 steps to results panel ${n} (${name})`, 15_000, '.scr');
    await waitText(fac, re, `panel ${n} shows ${name}`, 5_000, '.scr');
    const text = await screenText(fac);
    if (n === 2) {
      check(!/τ|tau/i.test(text) && (await fac.locator('.scr .lc-ref').count()) === 0, 'the trust trace has no tau line while the setting is off');
      check(/moratorium from Q\d Y\d|no moratorium/.test(text), 'the trust trace states the moratorium marker');
      // The line itself is drawn from the published value; publish one to check the drawing.
      await adminSet(`games/${g}/results/tau`, 33);
      await waitText(fac, /τ 33\.0 · a moratorium starts below this line/, 'a published tau draws the labelled line', 10_000, '.scr');
      check((await fac.locator('.scr .lc-ref').count()) === 1, 'the tau line is drawn');
      await snapProjector(fac, 'results-2-tau');
      await adminSet(`games/${g}/results/tau`, null);
      await waitText(fac, /^(?![\s\S]*τ)[\s\S]*/, 'the tau line goes when tau is removed', 10_000, '.scr');
    }
    if (n === 3 && res) {
      check(text.replace(/\s+/g, ' ').includes(`INDUSTRY VALUE ${fmt(res.industry.actual, 0)}`), 'panel 3 shows the actual industry value from the results');
    }
    if (n === 5) check(/UNDETECTED|No pacts were formed/.test(text), 'panel 5 reveals undetected violations or says no pact formed');
    await snapProjector(fac, `results-${n}`);
  }
  await fac.waitForTimeout(600);
  await fac.keyboard.press('F9');
  await waitText(fac, /last results panel/, 'F9 on the last panel stays put and says so', 10_000, '.scr');
  check((await adminGet<number>(`games/${g}/public/revealStep`)) === 5, 'the results step is stored (panel 6)');
  await fac.waitForTimeout(600);
  await fac.keyboard.press('Escape');
  await waitText(fac, /5\/6[\s\S]*PACT RECORD/, 'Esc steps back to panel 5', 10_000, '.scr');
  await fac.reload();
  await waitText(fac, /5\/6[\s\S]*PACT RECORD/, 'a reload restores the results step from the database', 15_000, '.scr');

  // Console: exports.
  await control.reload();
  await waitText(control, /EXPORT/, 'the console shows the export panel after the session ends');
  const [jsonDl] = await Promise.all([control.waitForEvent('download'), control.getByRole('button', { name: /DOWNLOAD HISTORY/ }).click()]);
  const jsonPath = await jsonDl.path();
  const exported = JSON.parse(readFileSync(jsonPath, 'utf8')) as { format: string; code: string; history: unknown[]; engine: { tau: number }; results: { rounds: number } | null };
  check(jsonDl.suggestedFilename() === `frontier-${code}-history.json`, 'the history download is named after the join code');
  check(exported.format === 'frontier-export' && exported.history.length === 3 && typeof exported.engine.tau === 'number' && exported.results?.rounds === 3, 'the JSON holds 3 quarters, the hidden values and the results');
  const [txtDl] = await Promise.all([control.waitForEvent('download'), control.getByRole('button', { name: /DOWNLOAD DATA LINES/ }).click()]);
  const lines = readFileSync(await txtDl.path(), 'utf8').trimEnd().split('\n');
  check(lines.length === 12 && lines.every((l) => l.startsWith(`DATA|game=${code}|round=`)), 'the text file holds 12 DATA lines in the §8.4 format');
  check(res !== null && JSON.stringify(lines) === JSON.stringify(res.dataLines), 'the exported DATA lines equal those in the results');

  // ── Privacy ──
  const probe = await harnessParticipant('privacy probe');
  const privateReads: Array<[string, string]> = [
    ['engine', `games/${g}/engine`],
    ['another firm’s private data', `games/${g}/firmsPrivate/${firmA}`],
    ['another firm’s decision', `games/${g}/decisions/1/${firmA}`],
    ['the pact private records', `games/${g}/pactsPrivate`],
    ['the member list', `games/${g}/members`],
    ['the firm PINs', `games/${g}/firmSecrets`],
  ];
  for (const [what, path] of privateReads) check((await h(probe.page, 'tryRead', path)) !== null, `a non-member cannot read ${what}`);
  for (const [who, page] of [['A', A], ['B', B], ['C', C]] as const) {
    const text = await page.locator('body').innerText();
    check(!/\bTAU\b|\bτ\b|endRound|end round/i.test(text), `participant ${who} never shows a hidden parameter`);
  }

  // Console at phone width during the loop.
  await control.setViewportSize({ width: 390, height: 844 });
  await shot(control, 'participant-run-control');
  check(!(await control.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'the console has no horizontal scroll at 390x844');
  await control.setViewportSize({ width: 1440, height: 900 });
  await shot(control, 'participant-run-control');

  // ── Delete session: double confirmation ──
  await control.reload();
  await control.getByRole('button', { name: 'DELETE SESSION' }).click();
  await waitText(control, /Confirm deletion of session/, 'the first press asks for confirmation');
  check(await control.getByRole('button', { name: 'CONFIRM DELETE' }).isDisabled(), 'confirm stays disabled until the join code is typed');
  await control.getByLabel(/Type [A-Z]{4} to confirm/).fill('ZZZZ');
  check(await control.getByRole('button', { name: 'CONFIRM DELETE' }).isDisabled(), 'a wrong code keeps confirm disabled');
  await control.getByRole('button', { name: 'CANCEL' }).click();
  check((await adminGet<unknown>(`games/${g}/meta`)) !== null, 'cancelling deletes nothing');
  await control.getByRole('button', { name: 'DELETE SESSION' }).click();
  await control.getByLabel(/Type [A-Z]{4} to confirm/).fill(code.toLowerCase());
  await control.getByRole('button', { name: 'CONFIRM DELETE' }).click();
  await control.waitForURL(/#\/new/, { timeout: 15_000 });
  check((await adminGet<unknown>(`games/${g}`)) === null, 'the session record is gone');
  check((await adminGet<unknown>(`codes/${code}`)) === null, 'the join code is free again');
  await probe.ctx.close();
  for (const c of [ctxA, ctxB, ctxC]) await c.close();
}

await runWithStack(scenario);
