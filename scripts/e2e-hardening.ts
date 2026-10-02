/**
 * Hardening run against the emulators (Session 8, spec §11 and §13). Usage: `npm run test:e2e:hardening`.
 *
 *  - a facilitator refresh mid-round and mid-resolution recovers from the database
 *  - three facilitator windows pressing F9 at once resolve and advance exactly once, every time
 *  - two console windows pressing Retry at once resolve exactly once
 *  - clock skew: a projector, and participants, whose clocks are 7 to 10 minutes wrong still show the
 *    server countdown and can commit
 *  - participants rejoining: a returning device is let back in after joining closes; a new device or a
 *    wrong PIN is not
 */
import { adminSet } from './emulator-rules';
import { BASE, adminGet, check, h, refused, runWithStack, signUp, waitText, watchPage } from './lib/e2e-kit';
import type { Browser, BrowserContext, Page } from 'playwright';

const ignore = [/accounts:signInWithPassword/, /ERR_INTERNET_DISCONNECTED/];
const D = { pace: 2, safety: 10, card: 'NONE', target: null } as const;

/** Moves `Date` by `offsetMs` before any page script runs, as a device with a wrong clock would. */
const skew = async (ctx: BrowserContext, offsetMs: number): Promise<void> => {
  await ctx.addInitScript({
    content: `(() => { const off = ${offsetMs}; const R = Date; class S extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } } window.Date = S; })();`,
  });
};

await runWithStack(async (browser: Browser) => {
  const facUid = await signUp('facilitator@example.test', 'correct-horse-9');
  await adminSet(`facilitators/${facUid}`, true);
  const facCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const fac = watchPage(await facCtx.newPage(), 'projector', ignore);
  const control = watchPage(await facCtx.newPage(), 'console', ignore);
  const key = async (page: Page, k: string): Promise<void> => {
    await page.waitForTimeout(600);
    await page.keyboard.press(k);
  };

  await fac.goto(`${BASE}#/new`);
  await fac.getByLabel('Email').fill('facilitator@example.test');
  await fac.getByLabel('Password').fill('correct-horse-9');
  await fac.getByRole('button', { name: 'Sign in' }).click();
  await waitText(fac, /NEW SESSION/, 'the facilitator reaches #/new');
  await fac.getByLabel('Round timer (s)').fill('300');
  await fac.getByLabel('Manual (stops at 30)').check();
  await fac.getByLabel('Fixed, for rehearsal').check();
  await fac.getByLabel('Seed value').fill('21');
  await fac.getByRole('button', { name: 'Add bot firm' }).click();
  await fac.getByRole('button', { name: 'Add bot firm' }).click();
  await fac.getByRole('button', { name: 'Create session' }).click();
  await fac.waitForURL(/#\/screen\/[^/?]+/);
  const g = /#\/screen\/([^/?]+)/.exec(fac.url())?.[1] ?? '';
  await waitText(fac, /LOBBY/, 'the lobby opens', 15_000, '.scr');
  await control.goto(`${BASE}#/control/${g}`);
  await waitText(control, /CONTROL/, 'the console opens');

  // ── Participants: two with correct clocks, one fast and one slow by 10 minutes ──
  const participant = async (who: string, offsetMs: number): Promise<{ ctx: BrowserContext; page: Page }> => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    if (offsetMs !== 0) await skew(ctx, offsetMs);
    const page = watchPage(await ctx.newPage(), who, ignore);
    await page.goto(`${BASE}tests/e2e/harness/participant.html`);
    await page.waitForFunction(() => 'harness' in window);
    await h(page, 'signIn');
    return { ctx, page };
  };
  const a = await participant('on time', 0);
  const b = await participant('clock 10 min fast', 10 * 60_000);
  const c = await participant('clock 10 min slow', -10 * 60_000);
  const alpha = await h(a.page, 'found', g, 'Alpha Works', 'ALPH', 'AA');
  const beta = await h(b.page, 'found', g, 'Beta Works', 'BETA', 'BB');
  const gamma = await h(c.page, 'found', g, 'Gamma Works', 'GAMM', 'CC');
  check(true, 'firms were founded from devices whose clocks are 10 minutes fast and slow');

  await key(fac, 'F9');
  await waitText(fac, /BRIEFING/, 'F9 opens the briefing', 15_000, '.scr');
  await key(fac, 'F9');
  await waitText(fac, /Q1 Y1[\s\S]*OPEN/, 'quarter 1 opens', 15_000, '.scr');

  // ── Clock skew ─────────────────────────────────────────────────────────────
  check((await h(b.page, 'submit', g, 1, beta.firmId, D)) === undefined, 'a device 10 minutes fast commits inside the deadline');
  check((await h(c.page, 'submit', g, 1, gamma.firmId, D)) === undefined, 'a device 10 minutes slow commits inside the deadline');
  const dec = await adminGet<{ at: number }>(`games/${g}/decisions/1/${beta.firmId}`);
  check(Math.abs(dec.at - Date.now()) < 60_000, 'the stored decision time is the server time, not the fast device clock');
  for (const [offset, name] of [[7 * 60_000, 'fast'], [-7 * 60_000, 'slow']] as const) {
    const sctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await skew(sctx, offset);
    const skewed = watchPage(await sctx.newPage(), `projector clock ${name}`, ignore);
    await skewed.goto(`${BASE}#/screen/${g}`);
    await skewed.getByLabel('Email').fill('facilitator@example.test');
    await skewed.getByLabel('Password').fill('correct-horse-9');
    await skewed.getByRole('button', { name: 'Sign in' }).click();
    await waitText(skewed, /T-0[2-5]:[0-5]\d/, `a projector whose clock is 7 minutes ${name} shows the server countdown`, 15_000, '.scr');
    await sctx.close();
  }
  await b.page.goto(`${BASE}#/play/${g}`);
  await waitText(b.page, /T-0[2-5]:[0-5]\d/, 'a phone whose clock is 10 minutes fast shows the server countdown', 15_000);
  await b.page.goto(`${BASE}tests/e2e/harness/participant.html`);
  await b.page.waitForFunction(() => 'harness' in window);
  await h(b.page, 'signIn');

  // ── Refresh mid-round ──────────────────────────────────────────────────────
  await h(a.page, 'submit', g, 1, alpha.firmId, D);
  await waitText(fac, /5\/5 COMMITTED/, 'all five firms are committed', 15_000, '.scr');
  await fac.reload();
  await waitText(fac, /Q1 Y1[\s\S]*OPEN[\s\S]*5\/5 COMMITTED/, 'a projector refresh mid-round restores the quarter and the committed count', 20_000, '.scr');
  await waitText(fac, /T-0[2-5]:[0-5]\d/, 'the refreshed projector shows the countdown', 5_000, '.scr');
  await control.reload();
  await waitText(control, /CONTROL[\s\S]*ALPH[\s\S]*BETA[\s\S]*GAMM/, 'a console refresh restores the firm list');

  // ── Duplicate windows: three projectors press F9 at the same moment ───────
  const dup1 = watchPage(await facCtx.newPage(), 'duplicate 1', ignore);
  const dup2 = watchPage(await facCtx.newPage(), 'duplicate 2', ignore);
  for (const p of [dup1, dup2]) {
    await p.setViewportSize({ width: 1280, height: 720 });
    await p.goto(`${BASE}#/screen/${g}`);
    await waitText(p, /Q1 Y1[\s\S]*OPEN/, 'a duplicate window loads the open quarter', 15_000, '.scr');
  }
  const press3 = async (): Promise<void> => {
    await Promise.all([fac, dup1, dup2].map((p) => p.waitForTimeout(600)));
    await Promise.all([fac, dup1, dup2].map((p) => p.keyboard.press('F9')));
  };
  const engine = (): Promise<{ round: number; history: Record<string, unknown> }> => adminGet(`games/${g}/engine`);
  await press3();
  for (const p of [fac, dup1, dup2]) await waitText(p, /REVEAL/, 'every window shows the reveal', 15_000, '.scr');
  let e = await engine();
  check(e.round === 1 && Object.keys(e.history).length === 1, 'three windows resolved quarter 1 exactly once');
  await press3();
  for (const p of [fac, dup1, dup2]) await waitText(p, /Q2 Y1[\s\S]*OPEN/, 'every window shows quarter 2', 15_000, '.scr');
  const pub2 = await adminGet<{ phase: string; round: number }>(`games/${g}/public`);
  check(pub2.round === 2 && pub2.phase === 'open', 'three windows opened quarter 2 exactly once (not quarter 3)');
  await press3();
  for (const p of [fac, dup1, dup2]) await waitText(p, /REVEAL/, 'every window shows the second reveal', 15_000, '.scr');
  e = await engine();
  check(e.round === 2 && Object.keys(e.history).length === 2, 'three windows resolved quarter 2 exactly once');
  await dup1.close();
  await dup2.close();

  // ── Refresh mid-resolution and two console windows pressing Retry ──────────
  await key(fac, 'F9');
  await waitText(fac, /Q3 Y1[\s\S]*OPEN/, 'quarter 3 opens', 15_000, '.scr');
  await adminSet(`games/${g}/public/phase`, 'resolving');
  await adminSet(`games/${g}/public/resolvingBy`, 'stuck-window');
  await control.reload();
  await waitText(control, /Resolution incomplete — retry/, 'a console refresh during a stuck resolution shows the retry state', 15_000);
  const control2 = watchPage(await facCtx.newPage(), 'console 2', ignore);
  await control2.setViewportSize({ width: 1440, height: 900 });
  await control2.goto(`${BASE}#/control/${g}`);
  await waitText(control2, /Resolution incomplete — retry/, 'a second console shows the same retry state', 15_000);
  // Both pages share one browser window, so one is in a background tab: click through the DOM, which needs no rendering.
  await Promise.all([control, control2].map((p) => p.getByRole('button', { name: 'Retry resolution' }).evaluate((el: HTMLElement) => el.click())));
  await waitText(fac, /REVEAL/, 'Retry completes the quarter', 15_000, '.scr');
  e = await engine();
  check(e.round === 3 && Object.keys(e.history).length === 3, 'two Retry presses resolved quarter 3 exactly once');
  await waitText(control, /^(?![\s\S]*Resolution incomplete)[\s\S]*/, 'the retry state clears', 10_000);
  await control2.close();

  // ── Participants rejoining after joining has closed ────────────────────────
  check((await adminGet<boolean>(`games/${g}/public/joinLocked`)) === true, 'joining is closed');
  await a.page.reload();
  await a.page.waitForFunction(() => 'harness' in window);
  await h(a.page, 'signIn'); // the same anonymous user, restored by the SDK
  check(!(await refused(() => h(a.page, 'join', g, alpha.firmId, alpha.pin, 'AA'))), 'a returning device rejoins its own firm after joining closed');
  check(await refused(() => h(a.page, 'join', g, beta.firmId, beta.pin, 'AA')), 'a returning device cannot switch to another firm after joining closed');
  const late = await participant('new device', 0);
  check(await refused(() => h(late.page, 'join', g, alpha.firmId, alpha.pin, 'ZZ')), 'a new device cannot join a firm after joining closed, even with the right PIN');
  check(await refused(() => h(late.page, 'found', g, 'Late Works', 'LATE', 'ZZ')), 'a new device cannot found a firm after joining closed');
  await a.page.goto(`${BASE}#/play/${g}`);
  await waitText(a.page, /ALPH/, 'the returning device lands on its own desk', 15_000);
  check(!/Joining is closed/.test(await a.page.locator('body').innerText()), 'a returning member is not shown the closed-joining notice');
  check(!(await fac.content()).includes(String((await adminGet<{ tau: number }>(`games/${g}/engine`)).tau)), 'tau stays off the projector throughout');
});
