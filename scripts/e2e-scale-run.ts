/**
 * 14-quarter runs at the new scale (Session 10). Usage: `npm run test:e2e:scale-run`.
 *
 *  1. Multiplayer mode: 49 bot clients (`tools/bots.ts --firms 49`) plus one scripted human,
 *     50 firms on 50 devices.
 *  2. Team mode: 15 bot firms on 3 devices each (`--devices-per-firm 3`) plus a human firm on 5
 *     devices, 16 firms on 50 devices.
 *
 * The facilitator creates each session through `#/new`, keeps the projector and console open and
 * presses F9 for every quarter once all firms have committed. Quarter 3 has a summit in which the
 * human proposes a pact and the restrained bots join. For every quarter the run records the time
 * from F9 to the reveal on the projector and the size of the resolution's multi-path write (the
 * same resolution replayed in memory on a copy of the database, which must give the stored result).
 * Writes reports/scale-run.md. Exits non-zero on any failed check.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import type { Browser, Page } from 'playwright';
import { resolveCurrentRound } from '../src/firebase/orchestrator';
import { adminSet } from './emulator-rules';
import { BASE, OUT, adminGet, check, h, runWithStack, signUp, snapProjector, waitText, watchPage } from './lib/e2e-kit';
import { memoryCtx, type Json } from './lib/memory-io';
import { storeAndRead } from '../tests/firebase/rtdb';

const QUARTERS = 14;
const ignore = [/accounts:signInWithPassword/, /ERR_INTERNET_DISCONNECTED/];
const label = (r: number): string => `Q${((r - 1) % 4) + 1} Y${Math.ceil(r / 4)}`;
const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
const size = (v: unknown): number => Buffer.byteLength(JSON.stringify(v ?? null), 'utf8');
/** JSON with object keys sorted, so two copies of one value compare equal whatever order they were built in. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Json).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  );

interface Quarter {
  round: number;
  resolveMs: number;
  writeBytes: number;
  roundBytes: number;
  firmsPublicBytes: number;
}

interface RunReport {
  name: string;
  firms: number;
  devices: number;
  quarters: Quarter[];
  wireEntries: number;
  pactMembers: number;
  gameBytes: number;
  resultsBytes: number;
  /** Bot commits the rules refused because the quarter was not open at that moment. */
  refused: number;
}

interface Plan {
  name: string;
  mode: 'multiplayer' | 'team';
  botFirms: number;
  botDevices: number;
  humanDevices: number;
}

const PLANS: Plan[] = [
  { name: 'Multiplayer mode: 49 bot clients + 1 human', mode: 'multiplayer', botFirms: 49, botDevices: 1, humanDevices: 1 },
  { name: 'Team mode: 15 bot firms × 3 devices + 1 human firm × 5 devices', mode: 'team', botFirms: 15, botDevices: 3, humanDevices: 5 },
];

async function runPlan(browser: Browser, plan: Plan, email: string, seed: number): Promise<RunReport> {
  const firmsN = plan.botFirms + 1;
  const devices = plan.botFirms * plan.botDevices + plan.humanDevices;
  const tag = `${plan.mode} run`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const fac = watchPage(await ctx.newPage(), `${tag} projector`, ignore);
  const control = watchPage(await ctx.newPage(), `${tag} console`, ignore);
  await control.setViewportSize({ width: 1440, height: 900 });
  const key = async (k: string): Promise<void> => {
    await fac.waitForTimeout(600);
    await fac.keyboard.press(k);
  };

  await fac.goto(`${BASE}#/new`);
  await waitText(fac, /SIGN IN|NEW SESSION/, `${tag}: #/new loads`);
  if (await fac.getByLabel('Email').isVisible().catch(() => false)) {
    await fac.getByLabel('Email').fill(email);
    await fac.getByLabel('Password').fill('correct-horse-9');
    await fac.getByRole('button', { name: 'Sign in' }).click();
  }
  await waitText(fac, /NEW SESSION/, `${tag}: the facilitator reaches #/new`);
  await fac.getByLabel(plan.mode === 'multiplayer' ? /Multiplayer mode/ : /Team mode/).check();
  await fac.getByLabel('Round timer (s)').fill('300');
  await fac.getByLabel('Fixed quarter').check();
  await fac.getByLabel('Quarter', { exact: true }).fill(String(QUARTERS));
  await fac.getByLabel('Fixed, for rehearsal').check();
  await fac.getByLabel('Seed value').fill(String(seed));
  await fac.getByRole('button', { name: 'Create session' }).click();
  await fac.waitForURL(/#\/screen\/[^/?]+/);
  const g = /#\/screen\/([^/?]+)/.exec(fac.url())?.[1] ?? '';
  await waitText(fac, /LOBBY/, `${tag}: the lobby opens`, 15_000, '.scr');
  const code = (await fac.locator('.scr .big.signal').first().innerText()).trim();
  await control.goto(`${BASE}#/control/${g}`);
  await waitText(control, new RegExp(plan.mode === 'multiplayer' ? 'Multiplayer mode, at most 50 firms' : 'Team mode, at most 16 firms'), `${tag}: the console shows the mode`);

  mkdirSync(OUT, { recursive: true });
  const botLog = createWriteStream(`${OUT}/scale-run-${plan.mode}-bots.log`);
  const args = ['tsx', 'tools/bots.ts', '--game', code, '--firms', String(plan.botFirms), '--policy', 'mixed', '--delay', '0-3', '--seed', String(seed), '--join-pacts', '--devices-per-firm', String(plan.botDevices)];
  const bots: ChildProcess = spawn('npx', args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let botText = '';
  bots.stdout?.on('data', (d: Buffer) => (botText += d.toString()));
  bots.stderr?.on('data', (d: Buffer) => (botText += d.toString()));
  bots.stdout?.pipe(botLog);
  bots.stderr?.pipe(botLog);
  const botsExited = new Promise<number | null>((done) => bots.on('exit', (c) => done(c)));
  const report: RunReport = { name: plan.name, firms: firmsN, devices, quarters: [], wireEntries: 0, pactMembers: 0, gameBytes: 0, resultsBytes: 0, refused: 0 };
  const hctxs: Array<Awaited<ReturnType<Browser['newContext']>>> = [];
  try {
    for (let i = 0; i < 360 && !/bot firm\(s\) on \d+ device\(s\) ready/.test(botText); i++) await fac.waitForTimeout(500);
    const ready = new RegExp(`${plan.botFirms} bot firm\\(s\\) on ${plan.botFirms * plan.botDevices} device\\(s\\) ready`).test(botText);
    check(ready, `${tag}: ${plan.botFirms} bot firms on ${plan.botFirms * plan.botDevices} devices are ready${ready ? '' : ` (bots said: ${botText.slice(-400)})`}`);

    // The human firm: one founder, then teammates who join with the PIN.
    const humans: Page[] = [];
    for (let d = 0; d < plan.humanDevices; d++) {
      const hctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      hctxs.push(hctx);
      const p = watchPage(await hctx.newPage(), `${tag} human ${d + 1}`, ignore);
      await p.goto(`${BASE}tests/e2e/harness/participant.html`);
      await p.waitForFunction(() => 'harness' in window);
      await h(p, 'signIn');
      humans.push(p);
    }
    const founder = humans[0] as Page;
    const { firmId, pin } = await h(founder, 'found', g, 'Human Works', 'HUMN', 'H1');
    for (let d = 1; d < humans.length; d++) await h(humans[d] as Page, 'join', g, firmId, pin, `H${d + 1}`);
    await waitText(fac, new RegExp(`${firmsN} FIRMS`), `${tag}: the lobby counts ${firmsN} firms`, 20_000, '.scr');
    const members = (await adminGet<Record<string, unknown>>(`games/${g}/members`)) ?? {};
    check(Object.keys(members).length === devices, `${tag}: ${devices} devices are members (got ${Object.keys(members).length})`);
    await snapProjector(fac, `scale-run-${plan.mode}-lobby`);

    await key('F9');
    await waitText(fac, /BRIEFING/, `${tag}: F9 opens the briefing`, 15_000, '.scr');
    await key('F9');
    const committed = new RegExp(`${firmsN}/${firmsN} COMMITTED`);
    for (let r = 1; r <= QUARTERS; r++) {
      await waitText(fac, new RegExp(`${label(r)}[\\s\\S]*OPEN`), `${tag}: quarter ${r} is open`, 20_000, '.scr');
      if (r === 3) {
        await key('F8');
        await waitText(fac, /Industry summit in session/, `${tag}: F8 enters the summit`, 15_000, '.scr');
        const pactId = await h(founder, 'proposePact', g, r, firmId, 'PACT-A', 2);
        let n = 0;
        for (let i = 0; i < 60; i++) {
          n = Object.keys((await adminGet<Record<string, unknown> | null>(`games/${g}/pacts/${pactId}/members`)) ?? {}).length;
          if (n >= Math.floor(plan.botFirms / 2)) break;
          await fac.waitForTimeout(500);
        }
        report.pactMembers = n;
        check(n > plan.botFirms / 3, `${tag}: restrained bots joined PACT-A (${n} members)`);
        await fac.waitForTimeout(1500);
        await snapProjector(fac, `scale-run-${plan.mode}-summit`);
        await key('F8');
        await waitText(fac, /OPEN/, `${tag}: F8 returns to the open quarter`, 15_000, '.scr');
      }
      // Every human device commits; the last commit wins.
      for (const p of humans) await h(p, 'submit', g, r, firmId, { pace: 3, safety: 5, card: 'NONE', target: null });
      await waitText(fac, committed, `${tag}: all ${firmsN} firms committed in quarter ${r}`, 60_000, '.scr');
      // Every firm has committed once; let each remaining device's commit (delay at most 3 s) land too.
      await fac.waitForTimeout(3500);

      // Replay the resolution in memory on a copy of the database, to measure its write.
      const copy = (await adminGet<Json>(`games/${g}`)) ?? {};
      let writeBytes = 0;
      const mem = memoryCtx(copy, 'replay', { t: Date.now() }, (patch) => (writeBytes = Math.max(writeBytes, size(patch))));
      const replay = await resolveCurrentRound(mem, r);
      check(replay.ok, `${tag}: quarter ${r} replays in memory (${replay.message})`);

      const t0 = Date.now();
      await key('F9');
      await waitText(fac, /REVEAL/, `${tag}: quarter ${r} resolves`, 30_000, '.scr');
      const resolveMs = Date.now() - t0 - 600;
      const stored = await adminGet<Json>(`games/${g}/rounds/${r}`);
      const same = canon(storeAndRead(stored)) === canon(storeAndRead((copy.rounds as Json | undefined)?.[String(r)]));
      check(same, `${tag}: quarter ${r} stored result equals the replay`);
      report.quarters.push({ round: r, resolveMs, writeBytes, roundBytes: size(stored), firmsPublicBytes: size(await adminGet(`games/${g}/firmsPublic`)) });
      if (r === 1 || r === 7 || r === QUARTERS) await snapProjector(fac, `scale-run-${plan.mode}-q${r}`);
      if (r < QUARTERS) await key('F9');
    }
    await key('F9');
    await waitText(fac, /ENDED/, `${tag}: the session ends after quarter ${QUARTERS}`, 20_000, '.scr');

    // Results: F9 on the ended projector opens them; then F9 steps through the six panels.
    await key('F9');
    await fac.waitForURL(/#\/results\//);
    const seq: string[] = [];
    for (let step = 0; step < 6; step++) {
      const want = `${step + 1}/6`;
      const ok = await fac
        .waitForFunction((w) => document.querySelector('[data-results-pos]')?.textContent === w, want, { timeout: 20_000 })
        .then(() => true, () => false);
      check(ok, `${tag}: results show ${want}`);
      seq.push(want);
      await snapProjector(fac, `scale-run-${plan.mode}-results-${step + 1}`);
      if (step === 0 || step === 2) {
        const drawn = await fac.evaluate(() => document.querySelectorAll('svg g[data-firm], .cmp-row[data-firm]').length);
        check(drawn === firmsN, `${tag}: results panel ${step + 1} draws all ${firmsN} firms (${drawn})`);
      }
      await key('F9');
    }
    console.log(`${tag}: results sequence ${seq.join(', ')}`);
    report.wireEntries = Object.keys((await adminGet<Json>(`games/${g}/wire`)) ?? {}).length;
    report.gameBytes = size(await adminGet(`games/${g}`));
    report.resultsBytes = size(await adminGet(`games/${g}/results`));
    const exit = await Promise.race([botsExited, new Promise<'timeout'>((d) => setTimeout(() => d('timeout'), 30_000))]);
    check(exit === 0, `${tag}: the bot clients exit cleanly when the session ends (${String(exit)})`);
    // A commit whose timer fires as F8 starts a summit is refused by the rules (not open) and sent again when the
    // quarter reopens; every firm still committing every quarter (checked above) is what matters.
    report.refused = (botText.match(/ refused: /g) ?? []).length;
  } finally {
    if (bots.pid && bots.exitCode === null) {
      try {
        process.kill(-bots.pid, 'SIGTERM');
      } catch {
        /* already exited */
      }
    }
    botLog.end();
    for (const c of hctxs) await c.close();
    await ctx.close();
  }
  return report;
}

function write(reports: RunReport[]): void {
  const L: string[] = ['# Scale runs', '', 'Generated by `npm run test:e2e:scale-run` against the emulators (Session 10). Times are measured on the cloud container and include the projector seeing the result; the live database adds network latency.', ''];
  for (const r of reports) {
    const q = r.quarters;
    const max = (f: (x: Quarter) => number): number => Math.max(...q.map(f));
    const mean = (f: (x: Quarter) => number): number => q.reduce((a, x) => a + f(x), 0) / Math.max(1, q.length);
    L.push(`## ${r.name}`, '');
    L.push(`${r.firms} firms on ${r.devices} participant devices, plus the projector and the console. ${q.length} quarters resolved.`, '');
    L.push('| quarter | F9 to reveal | resolution write | rounds/{r} | firmsPublic |', '|---|---|---|---|---|');
    for (const x of q) L.push(`| ${x.round} | ${x.resolveMs} ms | ${kb(x.writeBytes)} | ${kb(x.roundBytes)} | ${kb(x.firmsPublicBytes)} |`);
    L.push('');
    L.push(`- Slowest F9 to reveal: ${max((x) => x.resolveMs)} ms (mean ${Math.round(mean((x) => x.resolveMs))} ms).`);
    L.push(`- Largest resolution write: ${kb(max((x) => x.writeBytes))} (quarter ${q.find((x) => x.writeBytes === max((y) => y.writeBytes))?.round ?? '–'}).`);
    L.push(`- Wire entries at the end: ${r.wireEntries} (PACT-A reached ${r.pactMembers} members at the summit).`);
    L.push(`- Whole session at the end: ${kb(r.gameBytes)}; results node ${kb(r.resultsBytes)}.`);
    L.push(`- Bot commits refused because the quarter had just closed or a summit had just started: ${r.refused} (each firm still committed every quarter).`, '');
  }
  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/scale-run.md', L.join('\n'));
}

await runWithStack(async (browser) => {
  const email = 'scale-run@example.test';
  const facUid = await signUp(email, 'correct-horse-9');
  await adminSet(`facilitators/${facUid}`, true);
  const reports: RunReport[] = [];
  for (const [i, plan] of PLANS.entries()) reports.push(await runPlan(browser, plan, email, 40 + i));
  write(reports);
  for (const r of reports) {
    console.log(`${r.name}: slowest resolve ${Math.max(...r.quarters.map((q) => q.resolveMs))} ms, largest write ${kb(Math.max(...r.quarters.map((q) => q.writeBytes)))}`);
  }
});
