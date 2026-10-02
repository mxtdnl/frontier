/**
 * Lighthouse accessibility audit of the participant screens (Session 8, spec §18.7).
 * Usage: `npm run test:a11y`. Needs the emulators (it starts its own, like the e2e runs).
 *
 * A real participant joins a session through the UI in a Chromium window that exposes a debugging
 * port. Lighthouse then takes a snapshot of the page in each state, so signed-in screens are audited
 * (a fresh navigation would sign in as a new, firm-less user). Every snapshot at phone and desktop
 * width must score at least 95, and the script prints each failing audit.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFlow } from 'lighthouse';
import { chromium, type Page } from 'playwright';
import puppeteer from 'puppeteer-core';
import { adminSet } from './emulator-rules';
import { BASE, EXEC, adminGet, check, fail, finish, signUp, waitText, watchPage, withDevServer } from './lib/e2e-kit';

const THRESHOLD = 0.95;
const DEBUG_PORT = 9333;
const SIZES = [[390, 844], [1440, 900]] as const;

type Snap = { name: string; w: number; score: number | null; failing: string[] };
const results: Snap[] = [];

await withDevServer(async () => {
  const facUid = await signUp('facilitator@example.test', 'correct-horse-9');
  await adminSet(`facilitators/${facUid}`, true);

  const fb = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
  const profile = mkdtempSync(join(tmpdir(), 'frontier-lh-'));
  const pctx = await chromium.launchPersistentContext(profile, {
    executablePath: EXEC,
    args: ['--no-sandbox', `--remote-debugging-port=${DEBUG_PORT}`],
    viewport: { width: 390, height: 844 },
  });
  try {
    // Facilitator: a 3-quarter session with two bot firms.
    const fac = watchPage(await (await fb.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), 'facilitator');
    await fac.goto(`${BASE}#/new`);
    await fac.getByLabel('Email').fill('facilitator@example.test');
    await fac.getByLabel('Password').fill('correct-horse-9');
    await fac.getByRole('button', { name: 'Sign in' }).click();
    await waitText(fac, /NEW SESSION/, 'the facilitator reaches #/new');
    await fac.getByLabel('Round timer (s)').fill('300');
    await fac.getByLabel('Fixed quarter').check();
    await fac.getByLabel('Quarter', { exact: true }).fill('2');
    await fac.getByLabel('Fixed, for rehearsal').check();
    await fac.getByLabel('Seed value').fill('4');
    await fac.getByRole('button', { name: 'Add bot firm' }).click();
    await fac.getByRole('button', { name: 'Add bot firm' }).click();
    await fac.getByRole('button', { name: 'Create session' }).click();
    await fac.waitForURL(/#\/screen\/[^/?]+/);
    const g = /#\/screen\/([^/?]+)/.exec(fac.url())?.[1] ?? '';
    await waitText(fac, /LOBBY/, 'the lobby opens', 15_000, '.scr');
    const code = (await fac.locator('.scr .big.signal').first().innerText()).trim();
    const key = async (k: string): Promise<void> => {
      await fac.waitForTimeout(600);
      await fac.keyboard.press(k);
    };

    const pb = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
    const page: Page = watchPage(pctx.pages()[0] ?? (await pctx.newPage()), 'participant');

    /** Audits the participant page as it stands, at phone and desktop width. */
    const audit = async (name: string): Promise<void> => {
      for (const [w, hgt] of SIZES) {
        await page.setViewportSize({ width: w, height: hgt });
        await page.waitForTimeout(250);
        const target = (await pb.pages()).find((p) => p.url() === page.url());
        if (!target) {
          fail(`lighthouse: no page found for ${page.url()}`);
          return;
        }
        const flow = await startFlow(target, {
          config: { extends: 'lighthouse:default', settings: { onlyCategories: ['accessibility'], screenEmulation: { disabled: true }, formFactor: w < 600 ? 'mobile' : 'desktop' } },
        });
        await flow.snapshot({ name: `${name} ${w}` });
        const lhr = (await flow.createFlowResult()).steps[0]?.lhr;
        const score = lhr?.categories['accessibility']?.score ?? null;
        const failing = Object.values(lhr?.audits ?? {})
          .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual' && a.scoreDisplayMode !== 'informative')
          .map((a) => `${a.id}: ${a.title}`);
        results.push({ name, w, score, failing });
        check(score !== null && score >= THRESHOLD, `${name} at ${w} px: accessibility ${score === null ? 'n/a' : Math.round(score * 100)} (needs ${THRESHOLD * 100})${failing.length ? ` — ${failing.join('; ')}` : ''}`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    };

    // Landing and join.
    await page.goto(`${BASE}#/`);
    await waitText(page, /Session code/, 'landing loads');
    await audit('landing');
    await page.getByLabel('Session code').fill(code);
    await page.getByRole('button', { name: 'Join a session' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Found a firm' }).waitFor();
    await audit('join: choose');
    await page.getByRole('button', { name: 'Found a firm' }).click();
    await page.getByLabel(/Firm name/).fill('Alpha Works');
    await page.getByLabel(/Ticker/).fill('ALPH');
    await page.getByLabel(/Device initials/).fill('ab');
    await audit('join: found a firm');
    await page.getByRole('button', { name: 'Found the firm' }).click();
    await waitText(page, /ALPH FOUNDED/, 'the firm is founded');
    await audit('join: founded');
    await page.getByRole('button', { name: 'Open the desk' }).click();
    await page.waitForURL(/#\/play\//);
    await waitText(page, /has not opened/, 'the desk waits in the lobby');
    await audit('play: lobby');

    await key('F9');
    await waitText(page, /Total market revenue tracks public trust/, 'the briefing shows');
    await audit('play: briefing');
    await key('F9');
    await waitText(page, /T-\d\d:\d\d/, 'quarter 1 opens on the desk');
    await audit('play: DESK open');
    await page.getByRole('button', { name: /^Card:/ }).click();
    await page.getByRole('radio', { name: /PUBLISH/ }).click();
    await audit('play: card picker');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'COMMIT' }).click();
    await waitText(page, /Committed \d\d:\d\d:\d\d/, 'the decision is committed');
    await audit('play: DESK committed');
    for (const tab of ['BOOK', 'PACTS', 'WIRE'] as const) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(200);
      await audit(`play: ${tab}`);
    }
    await page.getByRole('tab', { name: 'DESK' }).click();

    await key('F8');
    await waitText(page, /summit/i, 'the summit banner shows');
    await audit('play: summit');
    await key('F8');
    await waitText(page, /T-\d\d:\d\d/, 'the quarter reopens');
    await key('F9');
    await waitText(page, /Q1 Y1 RESULT/, 'the quarter result shows', 20_000);
    await audit('play: reveal');
    await key('F9');
    await waitText(page, /T-\d\d:\d\d/, 'quarter 2 opens');
    await key('F9');
    await waitText(page, /Q2 Y1 RESULT/, 'quarter 2 resolves', 20_000);
    await key('F9');
    await waitText(page, /Counterfactual|ended|FINAL/i, 'the session ends', 20_000);
    for (let i = 0; i < 40 && (await adminGet<unknown>(`games/${g}/results`)) === null; i++) await page.waitForTimeout(500);
    await waitText(page, /Counterfactual/, 'the results card shows', 20_000);
    await audit('play: results card');

    pb.disconnect();
  } finally {
    await pctx.close();
    await fb.close();
  }
  console.log('\nLighthouse accessibility scores');
  for (const r of results) console.log(`${String(r.score === null ? 'n/a' : Math.round(r.score * 100)).padStart(4)}  ${r.w}  ${r.name}`);
});
finish();
