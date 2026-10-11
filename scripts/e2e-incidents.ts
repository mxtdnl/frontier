/**
 * Incident block layout checks (Session 18). Usage: `npm run test:e2e:incidents`.
 *
 * For 4, 16 and 50 firms it builds a session with the real orchestrator in memory, resolves two quarters, then
 * rewrites quarter 2 so that 0, 1 or 8 firms had an incident, with disclosure off and on, as standard and in lit-room
 * mode. On the projector at 1280×720 and 1920×1080 it checks that:
 *  - the INCIDENTS block lists min(k, cap) incidents, then "+N more", and fits its panel
 *  - the board rows sit exactly where they sit with no incidents
 *  - with disclosure off the projector shows no pace, safety or incident risk for an incident firm
 *  - the INCID tag marks each listed firm on the board, and the INCID view lists every incident.
 * Screenshots go to shots/e2e-incidents-*.png. Exits non-zero on any failed check.
 */
import type { Browser, Page } from 'playwright';
import { createGame, PARAMS } from '../src/engine';
import { advance } from '../src/firebase/orchestrator';
import { incidentCap } from '../src/ui/incidents';
import { adminSet } from './emulator-rules';
import { BASE, check, checkProjector, runWithStack, shot, signUp, waitText, watchPage } from './lib/e2e-kit';
import { getAt, memoryCtx, setAt, type Json } from './lib/memory-io';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const tickerFor = (i: number): string =>
  `${LETTERS[i % 26]}${LETTERS[Math.floor(i / 26) % 26]}${LETTERS[(i * 7 + 3) % 26]}${LETTERS[(i * 11 + 5) % 26]}${i % 3 === 2 ? 'RN' : ''}`;
const SIZES = [[1280, 720], [1920, 1080]] as const;

/** A session of `n` firms in the reveal of quarter 2, built by the real phase machine and resolution. */
async function build(n: number, facUid: string): Promise<Json> {
  const settings = { label: 'INCD', endMode: 'manual' as const, minEnd: 10, maxEnd: 14, fixedEnd: null, disclosure: false, autoAuditP: 0 };
  const state = createGame(settings, [], 500 + n, PARAMS);
  const db: Json = {
    meta: { code: 'INCD', title: `Incidents ${n}`, createdAt: 1, facilitatorUid: facUid, settings: { mode: n > 16 ? 'multiplayer' : 'team', timerSec: 900, autoResolve: false, revealThreshold: false, litRoom: false } },
    public: { phase: 'lobby', round: 0, paused: false, disclosure: false, T: state.T, M: 0, collapsed: false, joinLocked: false, revealStep: 0 },
    engine: { ...state, params: PARAMS, rngNotes: null, cfCache: null },
  };
  for (let i = 0; i < n; i++) {
    setAt(db, `firms/f${String(i).padStart(2, '0')}`, { name: `Firm ${tickerFor(i)}`, ticker: tickerFor(i), createdAt: 1000 + i, order: i, isBot: false });
  }
  const clock = { t: Date.now() };
  const ctx = memoryCtx(db, facUid, clock);
  for (let s = 0; s < 5; s++) {
    clock.t += 1000;
    const r = await advance(ctx);
    if (!r.ok) throw new Error(`advance ${s} (${n} firms): ${r.message}`);
  }
  return db;
}

/** Rewrites quarter 2 so the first `k` firms (creation order) had an incident; disclosure as given. */
function withIncidents(base: Json, k: number, disclosure: boolean, lit: boolean): Json {
  const db = structuredClone(base);
  const ids = Object.keys(db.firms as Json).sort();
  const hit = ids.slice(0, k);
  setAt(db, 'rounds/2/incidents', k);
  setAt(db, 'rounds/2/incidentFirms', hit.length ? hit : null);
  setAt(db, 'public/disclosure', disclosure);
  setAt(db, 'meta/settings/litRoom', lit);
  // One headline names the first incident firm; the rest come from the first incident template.
  const headlines = (getAt(db, 'rounds/2/headlines') as Array<{ kind: string; text: string }> | undefined) ?? [];
  const named = hit[0] ? [{ kind: 'incident', text: `Hospital network suspends ${tickerFor(0)} assistant after errors` }] : [];
  setAt(db, 'rounds/2/headlines', [...named, ...headlines].slice(0, 4));
  setAt(
    db,
    'rounds/2/disclosure',
    disclosure ? Object.fromEntries(ids.map((id, i) => [id, { pace: (i % 4) + 1, safety: (i * 7) % 31, expo: 3, ...(hit.includes(id) ? { risk: 0.05 + i / 100 } : {}) }])) : null,
  );
  return db;
}

let seq = 0;
async function publish(db: Json): Promise<string> {
  const g = `incid-${seq++}`;
  await adminSet(`games/${g}`, db);
  return g;
}

async function rowTops(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify(Array.from(document.querySelectorAll<HTMLElement>('.scr [data-row-key]')).map((tr) => [tr.dataset.rowKey, Math.round(tr.getBoundingClientRect().top), Math.round(tr.getBoundingClientRect().height)])),
  );
}

async function open(page: Page, g: string, query = ''): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`${BASE}#/screen/${g}${query}`);
  await waitText(page, /REVEAL/, `projector ${g} in reveal`, 15_000, '.scr');
  await page.waitForTimeout(300);
}

async function scenario(browser: Browser): Promise<void> {
  const facUid = await signUp('incid@example.test', 'correct-horse-9');
  await adminSet(`facilitators/${facUid}`, true);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = watchPage(await ctx.newPage(), 'facilitator');
  await page.goto(`${BASE}#/new`);
  await waitText(page, /SIGN IN/i, 'sign-in form');
  await page.getByLabel('Email').fill('incid@example.test');
  await page.getByLabel('Password').fill('correct-horse-9');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await waitText(page, /NEW SESSION/i, 'facilitator signed in');

  for (const n of [4, 16, 50]) {
    const base = await build(n, facUid);
    for (const lit of [false, true]) {
      for (const disclosure of [false, true]) {
        const quiet = await publish(withIncidents(base, 0, disclosure, lit));
        await open(page, quiet);
        const baseline: Record<string, string> = {};
        for (const [w, h] of SIZES) {
          await page.setViewportSize({ width: w, height: h });
          await page.waitForTimeout(150);
          baseline[`${w}`] = await rowTops(page);
          check((await page.locator('[data-incident-block]').count()) === 0, `n${n} ${lit ? 'lit ' : ''}${disclosure ? 'on' : 'off'} ${w}x${h}: no incidents, no block`);
          check((await page.locator('[data-trust-chart]').count()) === 1, `n${n} ${w}x${h}: the trust chart shows without incidents`);
        }
        // With 4 firms at most 4 can have an incident in one quarter.
        for (const k of [...new Set([1, Math.min(8, n)])]) {
          const name = `incidents-n${n}-k${k}-${disclosure ? 'on' : 'off'}${lit ? '-lit' : ''}`;
          const g = await publish(withIncidents(base, k, disclosure, lit));
          await open(page, g);
          const cap = incidentCap(lit, disclosure);
          for (const [w, h] of SIZES) {
            await page.setViewportSize({ width: w, height: h });
            await page.waitForTimeout(150);
            const label = `${name} ${w}x${h}`;
            await checkProjector(page, label);
            const info = await page.evaluate(() => {
              const block = document.querySelector<HTMLElement>('[data-incident-block]');
              if (!block) return null;
              const body = block.closest<HTMLElement>('.panel-body');
              const last = block.lastElementChild as HTMLElement | null;
              const lines = Array.from(block.querySelectorAll<HTMLElement>('p'));
              return {
                count: Number(block.dataset.incidents),
                shown: block.querySelectorAll('[data-incident]').length,
                more: block.querySelector<HTMLElement>('[data-incident-more]')?.dataset.incidentMore ?? null,
                overflow: block.scrollHeight > block.clientHeight + 1,
                lastBottom: last ? last.getBoundingClientRect().bottom : 0,
                bodyBottom: body ? body.getBoundingClientRect().bottom : 0,
                clippedText: lines.filter((p) => p.scrollWidth > p.clientWidth + 1 && !p.classList.contains('incid-line')).length,
                text: block.innerText,
              };
            });
            if (!info) {
              check(false, `${label}: the INCIDENTS block shows after the reveal`);
              continue;
            }
            check(info.count === k, `${label}: block counts ${k} incidents (got ${info.count})`);
            check(info.shown === Math.min(k, cap), `${label}: block lists ${Math.min(k, cap)} incidents (got ${info.shown})`);
            check(k > cap ? info.more === String(k - cap) : info.more === null, `${label}: "+N more" ${k > cap ? `reads +${k - cap}` : 'absent'} (got ${info.more})`);
            check(!info.overflow && info.lastBottom <= info.bodyBottom + 1, `${label}: block fits its panel`);
            check(info.clippedText === 0, `${label}: no wrapped line is cut off`);
            if (!disclosure) check(!/pace \d|safety \d|risk \d/.test(info.text), `${label}: no pace, safety or risk while disclosure is off`);
            else check(/pace \d · safety \d+% · incident risk \d+%/.test(info.text), `${label}: cause gives pace, safety and risk while disclosure is on`);
            check((await rowTops(page)) === baseline[`${w}`], `${label}: board rows do not move`);
            const tags = await page.locator('.scr .tag-incid').count();
            check(tags >= 1, `${label}: INCID tag on the board (${tags})`);
            if (n <= 16 || k === 1) await shot(page, name);
          }
          // The INCID view lists every incident of the session: quarter 1's real ones and quarter 2's.
          const total = k + Number(getAt(base, 'rounds/1/incidents') ?? 0);
          await page.setViewportSize({ width: 1280, height: 720 });
          await page.keyboard.type('INCID');
          await page.keyboard.press('Enter');
          await waitText(page, /INCID · INCIDENTS BY QUARTER/, `${name}: INCID view opens`, 5000, '.scr');
          const listed = await page.locator('[data-incid-view] [data-incident]').count();
          check(listed === total, `${name}: INCID view lists ${total} incidents (got ${listed})`);
          // The list scrolls inside its panel by design, so the clipping check does not apply to the panel body.
          const scrolls = await page.evaluate(() => {
            const body = document.querySelector<HTMLElement>('.panel-body.incid-scroll');
            return body ? getComputedStyle(body).overflowY === 'auto' && body.getBoundingClientRect().bottom <= (document.querySelector('.scr')?.getBoundingClientRect().bottom ?? 0) + 1 : false;
          });
          check(scrolls, `${name}: INCID list scrolls inside its panel`);
          if (k === 8 && n === 16 && !lit) await shot(page, `${name}-view`);
          await page.keyboard.press('Escape');
          await waitText(page, /BOARD/, `${name}: Esc returns to the board`, 5000, '.scr');
        }
      }
    }
  }
  await ctx.close();
}

void runWithStack(scenario);
