/**
 * Screenshots for the facilitator guide (Session 19 Part E). Usage: `npm run guide:shots`.
 *
 * Stages a session against the emulators with the real screens: fixed seed, ten in-app bot firms (mixed policies) and
 * two scripted phone firms with fictional names (Quarry Labs QRRY, Talwen Systems TLWN). QRRY proposes PACT-A in a
 * summit, TLWN joins it, QRRY then breaks it and an F6 audit finds the breach. The session runs to a fixed end, then
 * every results panel is captured. Images go to docs/facilitator-guide/img/ and are committed; the guide build
 * (`npm run guide:pdf`) needs no emulator.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import type { Decision } from '../src/engine';
import { adminSet } from './emulator-rules';
import { BASE, adminGet, check, h, runWithStack, signUp, waitText, watchPage } from './lib/e2e-kit';

const IMG = resolve('docs/facilitator-guide/img');
const SEED = Number(process.env.GUIDE_SEED ?? 11);
const QUARTERS = Number(process.env.GUIDE_QUARTERS ?? 14);
const ignore = [/accounts:signInWithPassword/, /ERR_INTERNET_DISCONNECTED/];
const label = (r: number): string => `Q${((r - 1) % 4) + 1} Y${Math.ceil(r / 4)}`;

async function save(page: Page, name: string, fullPage = false): Promise<void> {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${IMG}/${name}.png`, fullPage });
}

/** A plain page (console, wire log) cropped to its centred content column, at most `height` px tall. */
async function saveColumn(page: Page, name: string, height: number): Promise<void> {
  await page.waitForTimeout(250);
  const box = await page.locator('.page').first().boundingBox();
  if (!box) throw new Error(`${name}: no .page element`);
  const x = Math.max(0, Math.floor(box.x) - 16);
  const width = Math.min(Math.ceil(box.width) + 32, (page.viewportSize()?.width ?? 1440) - x);
  const h = Math.min(height, Math.ceil(box.y + box.height) + 16);
  await page.screenshot({ path: `${IMG}/${name}.png`, clip: { x, y: 0, width, height: h } });
}

/** QRRY's decisions from quarter 3 on: racing, with RUSH every other quarter. */
const qrry = (r: number): Decision => ({ pace: r % 3 === 0 ? 3 : 4, safety: 0, card: r % 2 ? 'RUSH' : 'NONE', target: null });

await runWithStack(async (browser) => {
  mkdirSync(IMG, { recursive: true });
  const facUid = await signUp('guide@example.test', 'correct-horse-9');
  await adminSet(`facilitators/${facUid}`, true);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const fac = watchPage(await ctx.newPage(), 'projector', ignore);
  const key = async (k: string): Promise<void> => {
    await fac.waitForTimeout(600);
    await fac.keyboard.press(k);
  };

  // ── #/new ──────────────────────────────────────────────────────────────────
  await fac.goto(`${BASE}#/new`);
  await fac.getByLabel('Email').fill('guide@example.test');
  await fac.getByLabel('Password').fill('correct-horse-9');
  await fac.getByRole('button', { name: 'Sign in' }).click();
  await waitText(fac, /NEW SESSION/, 'the facilitator reaches #/new');
  await fac.getByLabel('Fixed quarter').check();
  await fac.getByLabel('Quarter', { exact: true }).fill(String(QUARTERS));
  await fac.getByLabel('Fixed, for rehearsal').check();
  await fac.getByLabel('Seed value').fill(String(SEED));
  await fac.getByRole('button', { name: /Add 10 mixed/ }).click();
  await save(fac, 'new', true);
  await fac.getByRole('button', { name: 'Create session' }).click();
  await fac.waitForURL(/#\/screen\/[^/?]+/);
  const g = /#\/screen\/([^/?]+)/.exec(fac.url())?.[1] ?? '';
  await waitText(fac, /LOBBY/, 'the lobby opens', 15_000, '.scr');

  // ── Two phone firms ────────────────────────────────────────────────────────
  const phone = async (who: string): Promise<Page> => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p = watchPage(await c.newPage(), who, ignore);
    await p.goto(`${BASE}tests/e2e/harness/participant.html`);
    await p.waitForFunction(() => 'harness' in window);
    await h(p, 'signIn');
    return p;
  };
  const q = await phone('QRRY');
  const { firmId: qId } = await h(q, 'found', g, 'Quarry Labs', 'QRRY', 'QL');
  const t = await phone('TLWN');
  await h(t, 'found', g, 'Talwen Systems', 'TLWN', 'TS');
  await waitText(fac, /TLWN/, 'the lobby lists both phone firms', 15_000, '.scr');
  await save(fac, 'lobby');

  const control = watchPage(await ctx.newPage(), 'console', ignore);
  await control.setViewportSize({ width: 1440, height: 900 });
  await control.goto(`${BASE}#/control/${g}`);
  await waitText(control, /CONTROL/, 'the console opens');

  // ── Briefing ───────────────────────────────────────────────────────────────
  await fac.bringToFront();
  await key('F9');
  await waitText(fac, /BRIEFING/, 'F9 opens the briefing', 15_000, '.scr');
  await save(fac, 'briefing');

  // ── Quarter 1: the phone desk, the open board, the console, the reveal ──────
  await key('Shift+A');
  await waitText(fac, new RegExp(`${label(1)}[\\s\\S]*OPEN`), 'quarter 1 opens', 15_000, '.scr');
  await q.goto(`${BASE}#/play/${g}`);
  await t.goto(`${BASE}#/play/${g}`);
  await waitText(q, /T-\d\d:\d\d/, 'the QRRY phone shows the countdown', 15_000);
  await save(q, 'phone-desk');
  await q.getByRole('radio', { name: /Aggressive/ }).click();
  await q.getByRole('button', { name: /^COMMIT/ }).click();
  await waitText(q, /COMMITTED/, 'QRRY commits quarter 1');
  await fac.waitForTimeout(800);
  await save(fac, 'board-open');
  await control.bringToFront();
  await control.waitForTimeout(800);
  await saveColumn(control, 'control', 900);
  await fac.bringToFront();

  let incidentShot = false;
  const resolveQuarter = async (r: number): Promise<void> => {
    await key('F9');
    await waitText(fac, /REVEAL/, `quarter ${r} resolves`, 20_000, '.scr');
    // The INCIDENTS block appears when the 1.2 s reveal sequence ends.
    await fac.waitForTimeout(1800);
    const hit = Object.values((await adminGet<Record<string, string> | string[] | null>(`games/${g}/rounds/${r}/incidentFirms`)) ?? {});
    if (!incidentShot && hit.length > 0 && (await fac.locator('[data-incident-block]').count()) > 0) {
      incidentShot = true;
      await save(fac, 'reveal-incidents');
    }
  };
  await resolveQuarter(1);
  await waitText(q, /RESULT/, 'the QRRY phone shows the result card', 15_000);
  await save(q, 'phone-result');

  // ── Quarter 2: summit, pact, the terms preview, the ticket notice ──────────
  await key('F9');
  await waitText(fac, new RegExp(`${label(2)}[\\s\\S]*OPEN`), 'quarter 2 opens', 15_000, '.scr');
  await key('F8');
  await waitText(fac, /Industry summit in session/, 'F8 enters the summit', 15_000, '.scr');
  await save(fac, 'summit');
  await waitText(q, /PROPOSE A PACT/, 'the summit opens the PACTS tab on the phone', 15_000);
  await q.getByRole('button', { name: 'PROPOSE A PACT' }).click();
  await q.getByRole('checkbox', { name: 'Maximum pace' }).check();
  await q.locator('[data-pact-preview]').scrollIntoViewIfNeeded();
  await save(q, 'phone-pact-preview');
  await q.getByRole('button', { name: 'SIGN PACT-A' }).click();
  await waitText(t, /JOIN PACT-A/, 'TLWN sees PACT-A', 15_000);
  await t.getByRole('button', { name: 'JOIN PACT-A' }).click();
  await waitText(q, /PACT-A[\s\S]*TLWN|PACT-A[\s\S]*2 MBRS/, 'QRRY sees TLWN join', 15_000);
  await save(q, 'phone-pacts');
  await key('F8');
  await waitText(fac, new RegExp(`${label(2)}[\\s\\S]*OPEN`), 'F8 returns to the open quarter', 15_000, '.scr');
  await q.getByRole('tab', { name: 'DESK' }).click();
  await q.getByRole('radio', { name: /Breakneck/ }).click();
  await waitText(q, /Breaks PACT-A: pace 2 or lower/, 'the ticket warns that Breakneck breaks PACT-A');
  await save(q, 'phone-ticket-notice');
  await q.getByRole('button', { name: /COMMIT/ }).click();
  await waitText(q, /COMMITTED/, 'QRRY commits quarter 2');
  await resolveQuarter(2);

  // ── Quarters 3 to the end ──────────────────────────────────────────────────
  // A harness tab in QRRY's browser context submits for it; the same anonymous user is restored there.
  const qh = watchPage(await q.context().newPage(), 'QRRY harness', ignore);
  await qh.goto(`${BASE}tests/e2e/harness/participant.html`);
  await qh.waitForFunction(() => 'harness' in window);
  await h(qh, 'signIn');
  for (let r = 3; r <= QUARTERS; r++) {
    await key('F9');
    await waitText(fac, new RegExp(`${label(r)}[\\s\\S]*OPEN`), `quarter ${r} opens`, 15_000, '.scr');
    if (r === 4) {
      // F6 (Shift+F) then 1: audit PACT-A when this quarter resolves.
      await key('Shift+F');
      await waitText(fac, /Press the number of the pact/, 'Shift+F opens the audit picker', 5_000, '.scr');
      await fac.keyboard.press('1');
      await fac.waitForTimeout(800);
      await key('Escape');
    }
    if (r === 7) {
      await key('Shift+D');
      await waitText(fac, /DISCLOSURE ON/, 'Shift+D turns disclosure on', 15_000, '.scr');
    }
    await h(qh, 'submit', g, r, qId, qrry(r));
    await resolveQuarter(r);
    if (r === 7) await save(fac, 'reveal-disclosure');
    if (r === 4) {
      await q.getByRole('tab', { name: 'BOOK' }).click();
      await q.locator('[data-book-field] svg[data-chart="line"]').waitFor({ timeout: 10_000 }).catch(() => check(false, 'BOOK draws the field chart'));
      await save(q, 'phone-book');
      await q.getByRole('tab', { name: 'DESK' }).click();
      const w = watchPage(await ctx.newPage(), 'wire', ignore);
      await w.setViewportSize({ width: 1440, height: 900 });
      await w.goto(`${BASE}#/wire/${g}`);
      await waitText(w, /WIRE LOG · /, '#/wire opens');
      await w.getByLabel('Quarter number').fill('4');
      await w.getByRole('button', { name: 'GO' }).click();
      await waitText(w, /QUARTER BRIEF/, 'the QUARTER BRIEF shows for quarter 4');
      await saveColumn(w, 'wire-brief', 900);
      await w.close();
      await fac.bringToFront();
    }
  }
  check(incidentShot, 'a reveal with the INCIDENTS block was captured');

  // ── End and the seven results panels ───────────────────────────────────────
  await key('F9');
  await waitText(fac, /ENDED/, 'F9 after the final quarter ends the session', 15_000, '.scr');
  for (let i = 0; i < 40 && (await adminGet<unknown>(`games/${g}/results`)) === null; i++) await fac.waitForTimeout(500);
  await fac.goto(`${BASE}#/results/${g}`);
  await waitText(fac, /FINAL BOARD/, 'the results open', 15_000, '.scr');
  await fac.waitForTimeout(800);
  await save(fac, 'results-1');
  for (let n = 2; n <= 7; n++) {
    await key('F9');
    await waitText(fac, new RegExp(`${n}/7`), `F9 steps to results panel ${n}`, 15_000, '.scr');
    await fac.waitForTimeout(800);
    await save(fac, `results-${n}`);
  }
  const pub = await adminGet<{ collapsed: boolean; collapseRound: number | null }>(`games/${g}/public`);
  console.log(`guide session: seed ${SEED}, ${QUARTERS} quarters, moratorium ${pub.collapsed ? `in quarter ${pub.collapseRound}` : 'none'}`);
});
