/**
 * Full rehearsal against the emulators (Session 8, spec §18.3). Usage: `npm run test:e2e:rehearsal`.
 *
 * A facilitator (projector and console, real browser) runs 14 quarters with 8 bot clients
 * (`tools/bots.ts`, policy mixed) and one scripted human. It covers a summit, a pact, two manual
 * audits, a disclosure toggle, a forced collapse (fixed seed, checked against the engine-only
 * replica in scripts/lib/rehearsal-model.ts), the counterfactual and all six results panels.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { buildResults, dataLinesOf } from '../src/engine';
import { engineStateOf, fromEngine } from '../src/firebase/schema';
import { fmt } from '../src/ui/format';
import { adminSet } from './emulator-rules';
import {
  BASE, OUT, adminGet, check, h, runWithStack, screenText, shot, signUp, snapProjector, waitText, watchPage,
} from './lib/e2e-kit';
import { DISCLOSURE_ON, HUMAN, REHEARSAL_QUARTERS, simulateRehearsal } from './lib/rehearsal-model';

/** Fixed seed with a moratorium in quarter 10 (the unit test tests/tools/rehearsal-model.test.ts guards it). */
export const SEED = 5;
const BOTS = 8;
const FIRMS = BOTS + 1;

const ignore = [/accounts:signInWithPassword/, /ERR_INTERNET_DISCONNECTED/];

/** Quarter label as the projector prints it: Q1 Y1 … Q2 Y4. */
const label = (r: number): string => `Q${((r - 1) % 4) + 1} Y${Math.ceil(r / 4)}`;

await runWithStack(async (browser) => {
  const facUid = await signUp('facilitator@example.test', 'correct-horse-9');
  await adminSet(`facilitators/${facUid}`, true);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const fac = watchPage(await ctx.newPage(), 'projector', ignore);
  const control = watchPage(await ctx.newPage(), 'console', ignore);
  await control.setViewportSize({ width: 1440, height: 900 });
  // The projector ignores a key pressed while its previous action is still finishing, so settle first.
  const key = async (k: string, page = fac): Promise<void> => {
    await page.waitForTimeout(600);
    await page.keyboard.press(k);
  };

  // ── Sign in and create the session ─────────────────────────────────────────
  await fac.goto(`${BASE}#/new`);
  await fac.getByLabel('Email').fill('facilitator@example.test');
  await fac.getByLabel('Password').fill('correct-horse-9');
  await fac.getByRole('button', { name: 'Sign in' }).click();
  await waitText(fac, /NEW SESSION/, 'the facilitator reaches #/new');
  await fac.getByLabel('Round timer (s)').fill('120');
  await fac.getByLabel('Fixed quarter').check();
  await fac.getByLabel('Quarter', { exact: true }).fill(String(REHEARSAL_QUARTERS));
  await fac.getByLabel(/Automatic audit probability/).fill('0');
  await fac.getByLabel('Fixed, for rehearsal').check();
  await fac.getByLabel('Seed value').fill(String(SEED));
  await fac.getByRole('button', { name: 'Create session' }).click();
  await fac.waitForURL(/#\/screen\/[^/?]+/);
  const g = /#\/screen\/([^/?]+)/.exec(fac.url())?.[1] ?? '';
  await waitText(fac, /LOBBY/, 'the lobby opens', 15_000, '.scr');
  const code = (await fac.locator('.scr .big.signal').first().innerText()).trim();
  await control.goto(`${BASE}#/control/${g}`);
  await waitText(control, /CONTROL/, 'the console opens');
  const engine0 = await adminGet<{ tau: number; endRound: number }>(`games/${g}/engine`);
  check(engine0.endRound === REHEARSAL_QUARTERS, `the hidden end round is ${REHEARSAL_QUARTERS}`);
  const model = simulateRehearsal(SEED);
  check(Math.abs(engine0.tau - model.tau) < 1e-9, 'the session tau equals the replica’s tau');

  // ── Eight bot clients, then the scripted human ─────────────────────────────
  mkdirSync(OUT, { recursive: true });
  const botLog = createWriteStream(`${OUT}/rehearsal-bots.log`);
  const bots: ChildProcess = spawn('npx', ['tsx', 'tools/bots.ts', '--game', code, '--firms', String(BOTS), '--policy', 'mixed', '--delay', '0-2', '--seed', '1', '--join-pacts'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bots.stdout?.pipe(botLog);
  bots.stderr?.pipe(botLog);
  let botText = '';
  bots.stdout?.on('data', (d: Buffer) => (botText += d.toString()));
  bots.stderr?.on('data', (d: Buffer) => (botText += d.toString()));
  try {
    for (let i = 0; i < 120 && !/bot firm\(s\) ready/.test(botText); i++) await fac.waitForTimeout(500);
    check(/8 bot firm\(s\) ready/.test(botText), `eight bot clients founded their firms${/ready/.test(botText) ? '' : ` (bots said: ${botText.slice(0, 300)})`}`);

    const hctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const human = watchPage(await hctx.newPage(), 'human', ignore);
    await human.goto(`${BASE}tests/e2e/harness/participant.html`);
    await human.waitForFunction(() => 'harness' in window);
    await h(human, 'signIn');
    const { firmId } = await h(human, 'found', g, 'Human Works', 'HUMN', 'HU');
    await waitText(fac, /HUMN\s+Human Works\s+1/, 'the lobby lists the human firm after the bots', 15_000, '.scr');
    const firms = (await adminGet<Record<string, unknown>>(`games/${g}/firms`)) ?? {};
    check(Object.keys(firms).length === FIRMS, `${FIRMS} firms formed`);

    // ── Briefing and quarters ────────────────────────────────────────────────
    await key('F9');
    await waitText(fac, /BRIEFING/, 'F9 opens the briefing', 15_000, '.scr');
    await key('Shift+A');

    let pactId = '';
    const committed = new RegExp(`${FIRMS}/${FIRMS} COMMITTED`);
    const events: string[] = [];
    for (let r = 1; r <= REHEARSAL_QUARTERS; r++) {
      await waitText(fac, new RegExp(`${label(r)}[\\s\\S]*OPEN`), `quarter ${r} is open`, 15_000, '.scr');
      check(!(await fac.content()).includes(String(engine0.tau)), `tau is not on the projector in quarter ${r}`);

      if (r === 2) {
        await key('F8');
        await waitText(fac, /Industry summit in session/, 'F8 enters the summit', 15_000, '.scr');
        pactId = await h(human, 'proposePact', g, r, firmId, 'PACT-A', 2);
        for (let i = 0; i < 60; i++) {
          const members = (await adminGet<Record<string, unknown> | null>(`games/${g}/pacts/${pactId}/members`)) ?? {};
          if (Object.keys(members).length >= 5) break;
          await fac.waitForTimeout(500);
        }
        const members = (await adminGet<Record<string, unknown> | null>(`games/${g}/pacts/${pactId}/members`)) ?? {};
        check(Object.keys(members).length === 5, 'the human and four restrained bots joined PACT-A');
        await snapProjector(fac, 'rehearsal-summit');
        await key('F8');
        await waitText(fac, /OPEN/, 'F8 returns to the open quarter', 15_000, '.scr');
        events.push('summit');
      }
      if (r === DISCLOSURE_ON.from) {
        await key('Shift+D');
        await waitText(fac, /DISCL ON/, 'Shift+D turns disclosure on', 15_000, '.scr');
        events.push('disclosure on');
      }
      if (r === 5 || r === 8) {
        await key('Shift+F');
        await waitText(fac, /Press the number of the pact/, `Shift+F opens the audit picker (quarter ${r})`, 5_000, '.scr');
        await fac.keyboard.press('1');
        for (let i = 0; i < 20; i++) {
          const q = await adminGet<unknown[] | Record<string, unknown> | null>(`games/${g}/engine/pendingAudits`);
          if (q && Object.keys(q).length > 0) break;
          await fac.waitForTimeout(250);
        }
        const q = await adminGet<unknown[] | Record<string, unknown> | null>(`games/${g}/engine/pendingAudits`);
        check(q !== null && Object.keys(q).length === 1, `an audit is queued in quarter ${r}`);
        await key('Escape');
        events.push(`audit Q${r}`);
      }
      if (r === DISCLOSURE_ON.to + 1) {
        await key('Shift+D');
        await waitText(fac, /DISCL OFF/, 'Shift+D turns disclosure off', 15_000, '.scr');
        events.push('disclosure off');
      }

      await h(human, 'submit', g, r, firmId, HUMAN);
      await waitText(fac, committed, `all ${FIRMS} firms are committed in quarter ${r}`, 25_000, '.scr');
      await key('F9');
      await waitText(fac, /REVEAL/, `quarter ${r} resolves`, 20_000, '.scr');
      const round = await adminGet<{ T: number; audits?: unknown[]; disclosure?: unknown } | null>(`games/${g}/rounds/${r}`);
      check(round !== null && typeof round.T === 'number', `quarter ${r} results are written`);

      if (r === DISCLOSURE_ON.from + 1 || r === DISCLOSURE_ON.to) {
        await fac.waitForTimeout(1700);
        const head = (await fac.locator('.scr table.tbl thead').innerText()).replace(/\s+/g, ' ');
        check(/PACE/.test(head) && /SAFE/.test(head) && /EXPO/.test(head), `quarter ${r}: the PACE, SAFE and EXPO columns show while disclosure is on`);
        check(round?.disclosure != null, `quarter ${r}: a disclosure snapshot is published`);
      }
      if (r === 5 || r === 8) {
        const audits = Object.values(round?.audits ?? {}) as Array<{ kind: string; breaches: unknown[] }>;
        check(audits.some((a) => a.kind === 'manual' && Object.keys(a.breaches ?? {}).length > 0), `quarter ${r}: the manual audit published a breach`);
      }
      if (r === 5) {
        await fac.waitForTimeout(1700);
        check(/BREACH/.test(await screenText(fac)), 'quarter 5: the board shows a BREACH tag after detection');
        await snapProjector(fac, 'rehearsal-breach');
      }
      if (r === DISCLOSURE_ON.to + 1) {
        await fac.waitForTimeout(1700);
        const head = (await fac.locator('.scr table.tbl thead').innerText()).replace(/\s+/g, ' ');
        check(!/PACE|SAFE|EXPO/.test(head), 'after the toggle the disclosure columns are gone');
      }
      if (r === model.collapseRound) {
        await fac.waitForTimeout(1700);
        const pub = await adminGet<{ collapsed: boolean; collapseRound: number | null }>(`games/${g}/public`);
        check(pub.collapsed && pub.collapseRound === model.collapseRound, `the forced collapse arrives in quarter ${model.collapseRound}`);
        check(/MORATORIUM/i.test(await screenText(fac)), 'the moratorium headline is on the projector');
        await snapProjector(fac, 'rehearsal-collapse');
        events.push('collapse');
      }
      if (r < REHEARSAL_QUARTERS) await key('F9');
    }

    // ── End and results ──────────────────────────────────────────────────────
    await key('F9');
    await waitText(fac, /SESSION ENDED|ENDED/, 'F9 after the final quarter ends the session', 15_000, '.scr');
    check((await adminGet<string>(`games/${g}/public/phase`)) === 'ended', 'the phase is ended');
    for (let i = 0; i < 40 && (await adminGet<unknown>(`games/${g}/results`)) === null; i++) await fac.waitForTimeout(500);
    type Res = { rounds: number; collapseRound: number | null; industry: { actual: number; counterfactual: number; destroyed: number }; final: Record<string, { ticker: string; valuation: number; rank: number; counterfactual: number; undetected: number }>; dataLines: string[]; tau?: number };
    const res = await adminGet<Res | null>(`games/${g}/results`);
    check(res !== null && res.rounds === REHEARSAL_QUARTERS, `results cover ${REHEARSAL_QUARTERS} quarters`);
    if (res) {
      check(res.collapseRound === model.collapseRound, `results record the collapse in quarter ${model.collapseRound}`);
      check(res.dataLines.length === REHEARSAL_QUARTERS * FIRMS, `results hold ${REHEARSAL_QUARTERS * FIRMS} DATA lines`);
      check(res.tau === undefined || res.tau === null, 'tau is not published (the reveal setting is off)');
      // The stored results equal a fresh computation from the stored engine state.
      // The REST read drops empty lists and maps, exactly as the app's own reads do, so normalise it the same way.
      const engine = fromEngine(await adminGet<unknown>(`games/${g}/engine`));
      if (!engine) throw new Error('The engine node is missing.');
      const fresh = buildResults(engineStateOf(engine), { revealTau: false }, engine.params);
      check(JSON.stringify(res.dataLines) === JSON.stringify(dataLinesOf(engineStateOf(engine))), 'stored DATA lines equal those rebuilt from the engine history');
      check(Math.abs(res.industry.actual - fresh.industry.actual) < 1e-6 && Math.abs(res.industry.counterfactual - fresh.industry.counterfactual) < 1e-6, 'stored industry value and counterfactual equal a fresh computation');
      check(res.industry.counterfactual > res.industry.actual && res.industry.destroyed > 0, 'the counterfactual shows value destroyed');
      const humanRow = res.final[firmId];
      check(humanRow !== undefined && humanRow.undetected >= 0, 'the results hold a row for the human firm');

      await fac.goto(`${BASE}#/results/${g}`);
      await waitText(fac, /RESULTS[\s\S]*FINAL BOARD/, 'the results screen opens', 15_000, '.scr');
      await snapProjector(fac, 'rehearsal-results-1');
      const panels: Array<[number, RegExp]> = [[2, /TRUST TRACE/], [3, /COUNTERFACTUAL[\s\S]*VALUE DESTROYED/], [4, /ATTRIBUTION/], [5, /PACT RECORD[\s\S]*UNDETECTED/], [6, /DEBRIEF/]];
      for (const [n, re] of panels) {
        await key('F9');
        await waitText(fac, new RegExp(`${n}/6`), `F9 steps to results panel ${n}`, 15_000, '.scr');
        await waitText(fac, re, `panel ${n} shows its content`, 5_000, '.scr');
        if (n === 2) check(/marker: collapse/.test(await screenText(fac)) && !/Dashed line|tau/i.test(await screenText(fac)), 'the trust trace marks the collapse and shows no tau line');
        if (n === 3) check((await screenText(fac)).replace(/\s+/g, ' ').includes(`INDUSTRY VALUE ${fmt(res.industry.actual, 0)}`), 'panel 3 shows the stored actual industry value');
        await snapProjector(fac, `rehearsal-results-${n}`);
      }

      // The human's own results card, read through the real participant screen.
      await human.goto(`${BASE}#/play/${g}`);
      await waitText(human, /Counterfactual/, 'the human sees the results card', 20_000);
      const t = await human.locator('body').innerText();
      check(humanRow !== undefined && t.includes(fmt(humanRow.valuation)) && t.includes(fmt(humanRow.counterfactual)), 'the card shows valuation and counterfactual from the results');
      await shot(human, 'rehearsal-human-card');
    }
    console.log(`rehearsal events: ${events.join(', ')}`);
    await hctx.close();
  } finally {
    if (bots.pid) {
      try {
        process.kill(-bots.pid, 'SIGTERM');
      } catch {
        /* already exited */
      }
    }
    botLog.end();
  }
  await ctx.close();
});
