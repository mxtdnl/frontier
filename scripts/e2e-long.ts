/**
 * 30-quarter manual-mode run against the emulators (Session 8, spec §18.4). Usage: `npm run test:e2e:long`.
 *
 * The largest supported class: 15 bot clients plus one scripted human (16 firms). Only F9 is used:
 * the end mode is manual, so the session must stop by itself after quarter 30. The projector and the
 * results panels are checked for clipping at that size.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { adminSet } from './emulator-rules';
import { BASE, OUT, adminGet, check, h, runWithStack, screenText, signUp, snapProjector, waitText, watchPage } from './lib/e2e-kit';

const BOTS = 15;
const FIRMS = BOTS + 1;
const QUARTERS = 30;
const ignore = [/accounts:signInWithPassword/, /ERR_INTERNET_DISCONNECTED/];
const label = (r: number): string => `Q${((r - 1) % 4) + 1} Y${Math.ceil(r / 4)}`;

await runWithStack(async (browser) => {
  const facUid = await signUp('facilitator@example.test', 'correct-horse-9');
  await adminSet(`facilitators/${facUid}`, true);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const fac = watchPage(await ctx.newPage(), 'projector', ignore);
  const key = async (k: string): Promise<void> => {
    await fac.waitForTimeout(600);
    await fac.keyboard.press(k);
  };

  await fac.goto(`${BASE}#/new`);
  await fac.getByLabel('Email').fill('facilitator@example.test');
  await fac.getByLabel('Password').fill('correct-horse-9');
  await fac.getByRole('button', { name: 'Sign in' }).click();
  await waitText(fac, /NEW SESSION/, 'the facilitator reaches #/new');
  await fac.getByLabel('Manual (stops at 30)').check();
  await fac.getByLabel('Fixed, for rehearsal').check();
  await fac.getByLabel('Seed value').fill('3');
  await fac.getByRole('button', { name: 'Create session' }).click();
  await fac.waitForURL(/#\/screen\/[^/?]+/);
  const g = /#\/screen\/([^/?]+)/.exec(fac.url())?.[1] ?? '';
  await waitText(fac, /LOBBY/, 'the lobby opens', 15_000, '.scr');
  const code = (await fac.locator('.scr [data-join-code]').first().innerText()).trim();
  const engine0 = await adminGet<{ endRound: number | null }>(`games/${g}/engine`);
  check(engine0.endRound == null, 'manual mode stores no end round');

  mkdirSync(OUT, { recursive: true });
  const botLog = createWriteStream(`${OUT}/long-bots.log`);
  const bots: ChildProcess = spawn('npx', ['tsx', 'tools/bots.ts', '--game', code, '--firms', String(BOTS), '--policy', 'mixed', '--delay', '0-1', '--seed', '2'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bots.stdout?.pipe(botLog);
  bots.stderr?.pipe(botLog);
  let botText = '';
  bots.stdout?.on('data', (d: Buffer) => (botText += d.toString()));
  bots.stderr?.on('data', (d: Buffer) => (botText += d.toString()));
  try {
    for (let i = 0; i < 160 && !/bot firm\(s\) on \d+ device\(s\) ready/.test(botText); i++) await fac.waitForTimeout(500);
    check(new RegExp(`${BOTS} bot firm\\(s\\) on ${BOTS} device\\(s\\) ready`).test(botText), `${BOTS} bot clients founded their firms${/ready/.test(botText) ? '' : ` (bots said: ${botText.slice(0, 300)})`}`);

    const hctx = await browser.newContext();
    const human = watchPage(await hctx.newPage(), 'human', ignore);
    await human.goto(`${BASE}tests/e2e/harness/participant.html`);
    await human.waitForFunction(() => 'harness' in window);
    await h(human, 'signIn');
    const { firmId } = await h(human, 'found', g, 'Human Works', 'HUMN', 'HU');
    await waitText(fac, /HUMN\s+Human Works\s+1/, 'the human firm appears in the lobby', 15_000, '.scr');
    check(Object.keys((await adminGet<Record<string, unknown>>(`games/${g}/firms`)) ?? {}).length === FIRMS, `${FIRMS} firms formed (the maximum)`);

    await key('F9');
    await waitText(fac, /BRIEFING/, 'F9 opens the briefing', 15_000, '.scr');
    await key('F9');

    const committed = new RegExp(`${FIRMS}/${FIRMS} COMMITTED`);
    for (let r = 1; r <= QUARTERS; r++) {
      await waitText(fac, new RegExp(`${label(r)}[\\s\\S]*OPEN`), `quarter ${r} is open`, 15_000, '.scr');
      await h(human, 'submit', g, r, firmId, { pace: 2, safety: 12, card: 'NONE', target: null });
      await waitText(fac, committed, `all ${FIRMS} firms are committed in quarter ${r}`, 25_000, '.scr');
      await key('F9');
      await waitText(fac, /REVEAL/, `quarter ${r} resolves`, 20_000, '.scr');
      if (r === 3 || r === QUARTERS) {
        await fac.waitForTimeout(1700);
        await snapProjector(fac, `long-board-${r}`);
        check((await fac.locator('.scr table.tbl tbody tr').count()) === FIRMS, `quarter ${r}: the board lists all ${FIRMS} firms`);
      }
      if (r < QUARTERS) await key('F9');
    }

    // Quarter 30 has resolved. F9 must end the session; no quarter 31 may open.
    await key('F9');
    await waitText(fac, /ENDED/, 'F9 after quarter 30 ends the session with no quarter 31', 15_000, '.scr');
    const pub = await adminGet<{ phase: string; round: number }>(`games/${g}/public`);
    check(pub.phase === 'ended' && pub.round === QUARTERS, 'the phase is ended at round 30');
    check((await adminGet<unknown>(`games/${g}/rounds/31`)) === null, 'no quarter 31 was resolved');

    for (let i = 0; i < 40 && (await adminGet<unknown>(`games/${g}/results`)) === null; i++) await fac.waitForTimeout(500);
    const res = await adminGet<{ rounds: number; dataLines: string[]; final: Record<string, unknown> } | null>(`games/${g}/results`);
    check(res !== null && res.rounds === QUARTERS, 'results cover 30 quarters');
    check(res !== null && res.dataLines.length === QUARTERS * FIRMS, `results hold ${QUARTERS * FIRMS} DATA lines`);
    check(res !== null && Object.keys(res.final).length === FIRMS, `results rank all ${FIRMS} firms`);

    await fac.goto(`${BASE}#/results/${g}`);
    await waitText(fac, /RESULTS[\s\S]*FINAL BOARD/, 'the results screen opens', 15_000, '.scr');
    await snapProjector(fac, 'long-results-1');
    const panels: Array<[number, RegExp]> = [[2, /TRUST TRACE/], [3, /COUNTERFACTUAL/], [4, /ATTRIBUTION/], [5, /NET CONTRIBUTION/], [6, /PACT RECORD/], [7, /DEBRIEF/]];
    for (const [n, re] of panels) {
      await key('F9');
      await waitText(fac, new RegExp(`${n}/7`), `F9 steps to results panel ${n}`, 15_000, '.scr');
      await waitText(fac, re, `panel ${n} shows its content`, 5_000, '.scr');
      await snapProjector(fac, `long-results-${n}`);
    }
    check(!/tau/i.test(await screenText(fac)), 'no tau on the results screen');
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
