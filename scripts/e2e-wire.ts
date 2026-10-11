/**
 * Facilitator wire screen at scale (Session 18). Usage: `npm run test:e2e:wire`.
 *
 * Builds a 50-firm, 30-quarter session with the real orchestrator in memory (cards, incidents, disclosure toggles in
 * the lobby and during play), writes it to the emulator, and checks `#/wire` at 1440×900 and 390×844:
 *  - it opens on the current quarter; ◄ ►, the arrow keys, the quarter field and ALL select quarters
 *  - ALL lists every wire entry of the session and a NOT ON THE WIRE section per resolved quarter, within 2 s
 *  - the log scrolls inside its panel; the page never scrolls sideways
 *  - COPY puts the selected quarter on the clipboard as plain text.
 * Screenshots go to shots/e2e-wire-*.png. Exits non-zero on any failed check.
 */
import type { Browser } from 'playwright';
import { createGame, PARAMS } from '../src/engine';
import { advance, toggleDisclosure } from '../src/firebase/orchestrator';
import { adminSet } from './emulator-rules';
import { BASE, check, runWithStack, shot, signUp, waitText, watchPage } from './lib/e2e-kit';
import { getAt, memoryCtx, setAt, type Json } from './lib/memory-io';

const N = 50;
const QUARTERS = 30;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const tickerFor = (i: number): string => `${LETTERS[i % 26]}${LETTERS[Math.floor(i / 26) % 26]}W${LETTERS[(i * 7 + 3) % 26]}`;
const CARDS = ['NONE', 'BLITZ', 'PUBLISH', 'NONE', 'RUSH', 'LOBBY', 'SHARE', 'NONE'] as const;

async function build(facUid: string): Promise<Json> {
  const settings = { label: 'WIRE', endMode: 'manual' as const, minEnd: 10, maxEnd: 30, fixedEnd: null, disclosure: false, autoAuditP: 0 };
  const state = createGame(settings, [], 4242, PARAMS);
  const db: Json = {
    meta: { code: 'WIRE', title: 'Wire scale', createdAt: 1, facilitatorUid: facUid, settings: { mode: 'multiplayer', timerSec: 900, autoResolve: false, revealThreshold: false, litRoom: false } },
    public: { phase: 'lobby', round: 0, paused: false, disclosure: false, T: state.T, M: 0, collapsed: false, joinLocked: false, revealStep: 0 },
    engine: { ...state, params: PARAMS, rngNotes: null, cfCache: null },
  };
  const ids: string[] = [];
  for (let i = 0; i < N; i++) {
    const id = `f${String(i).padStart(2, '0')}`;
    ids.push(id);
    setAt(db, `firms/${id}`, { name: `Firm ${tickerFor(i)}`, ticker: tickerFor(i), createdAt: 1000 + i, order: i, isBot: false });
  }
  const clock = { t: Date.now() - 3_600_000 };
  const ctx = memoryCtx(db, facUid, clock);
  const step = async (what: string, p: Promise<{ ok: boolean; message: string }>): Promise<void> => {
    clock.t += 1000;
    const r = await p;
    if (!r.ok) throw new Error(`${what}: ${r.message}`);
  };
  await step('disclosure in the lobby', toggleDisclosure(ctx));
  await step('briefing', advance(ctx));
  await step('open 1', advance(ctx));
  for (let r = 1; r <= QUARTERS; r++) {
    ids.forEach((id, i) => {
      // Rotate cards so no firm repeats one in consecutive quarters.
      const card = CARDS[(i + r) % CARDS.length] ?? 'NONE';
      setAt(db, `decisions/${r}/${id}`, { pace: i % 3 === 0 ? 4 : 2, safety: i % 3 === 0 ? 0 : 15, card, by: `u${id}`, at: clock.t });
    });
    if (r % 7 === 0) await step(`disclosure ${r}`, toggleDisclosure(ctx));
    await step(`resolve ${r}`, advance(ctx));
    if (r < QUARTERS) await step(`open ${r + 1}`, advance(ctx));
  }
  return db;
}

async function scenario(browser: Browser): Promise<void> {
  const facUid = await signUp('wire@example.test', 'correct-horse-9');
  await adminSet(`facilitators/${facUid}`, true);
  const t0 = performance.now();
  const db = await build(facUid);
  console.log(`built ${N} firms × ${QUARTERS} quarters in ${Math.round(performance.now() - t0)} ms`);
  const g = 'wire-scale';
  await adminSet(`games/${g}`, db);
  const headlines = Object.values((getAt(db, 'rounds') as Record<string, { headlines?: unknown[] }>) ?? {}).reduce((n, r) => n + (r.headlines?.length ?? 0), 0);
  const live = Object.keys((getAt(db, 'wire') as Json | undefined) ?? {}).length;
  check(live >= 5, `the session has live wire entries (${live})`);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = watchPage(await ctx.newPage(), 'wire');
  await page.goto(`${BASE}#/wire/${g}`);
  await page.getByLabel('Email').fill('wire@example.test');
  await page.getByLabel('Password').fill('correct-horse-9');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await waitText(page, /WIRE LOG · Q2 Y8/, '#/wire opens on the current quarter (30)');
  const sel = () => page.locator('[data-wire-selection]').getAttribute('data-wire-selection');
  await page.getByRole('button', { name: 'Previous quarter' }).click();
  check((await sel()) === '29', '◄ steps back one quarter');
  await page.keyboard.press('ArrowRight');
  check((await sel()) === '30', 'the right arrow key steps forward');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  check((await sel()) === '28', 'the left arrow key steps back');
  await page.getByLabel('Quarter number').fill('0');
  await page.getByRole('button', { name: 'GO' }).click();
  await waitText(page, /WIRE LOG · PRE/, 'the quarter field selects PRE');
  check((await page.locator('[data-wire-log] [data-wire-line]').count()) >= 1, 'PRE holds the lobby disclosure entry');
  await page.getByLabel('Quarter number').fill('31');
  await page.getByRole('button', { name: 'GO' }).click();
  await waitText(page, /Enter a quarter from 0 \(PRE\) to 30/, 'a quarter out of range is explained');

  const start = Date.now();
  await page.getByRole('button', { name: 'ALL' }).click();
  await waitText(page, /WIRE LOG · ALL QUARTERS/, 'ALL selects every quarter');
  const lines = await page.locator('[data-wire-log] [data-wire-line]').count();
  const took = Date.now() - start;
  check(lines === headlines + live, `ALL lists every wire entry (${lines} of ${headlines + live})`);
  check(took < 2000, `ALL renders within 2 s (${took} ms)`);
  check((await page.locator('[data-not-on-wire]').count()) === QUARTERS, `a NOT ON THE WIRE section for each of ${QUARTERS} quarters`);
  const off = await page.locator('[data-not-on-wire] li').count();
  check(off > QUARTERS, `NOT ON THE WIRE lists the events the cap left out (${off})`);
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    const box = await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>('.panel-body.wire-scroll');
      return {
        scrolls: !!body && body.scrollHeight > body.clientHeight && getComputedStyle(body).overflowY === 'auto',
        sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    check(box.scrolls, `${w}x${h}: the log scrolls inside its panel`);
    check(!box.sideways, `${w}x${h}: no horizontal page scroll`);
    await shot(page, 'wire-all');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const scrollStart = Date.now();
  await page.locator('.panel-body.wire-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  check(Date.now() - scrollStart < 1000, 'scrolling to the end of the log stays responsive');

  await page.getByLabel('Quarter number').fill('12');
  await page.getByRole('button', { name: 'GO' }).click();
  await waitText(page, /WIRE LOG · Q4 Y3/, 'the quarter field selects quarter 12');
  await shot(page, 'wire-q12');
  await page.getByRole('button', { name: 'COPY' }).click();
  await waitText(page, /Copied Q4 Y3 as plain text/, 'COPY confirms');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(clip.startsWith('FRONTIER WIRE · Wire scale · code WIRE · Q4 Y3'), 'the clipboard holds the quarter heading');
  check(clip.includes('NOT ON THE WIRE') && !clip.includes('Q3 Y3'), 'the clipboard holds only the selected quarter, with its facilitator section');
  await ctx.close();
}

void runWithStack(scenario);
