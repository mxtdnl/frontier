/**
 * Layout checks by firm count (Session 10). Usage: `npm run test:e2e:scale`.
 *
 * For 2, 12, 16, 17, 24, 32, 40 and 50 firms it builds a session with the real orchestrator in
 * memory (lobby, an open quarter, six resolved quarters with pacts and disclosure, a summit, the
 * end and the results), writes each state to the emulator with one admin write, and checks:
 *  - the projector board (every page kind), lobby and summit at 1280×720 and 1920×1080
 *  - all six results panels and every page within them
 *  - the console: control strip always in view, firms table scrolling inside its panel, filters.
 * Then a phone at 360×640 founds the 50th firm through the join screen in multiplayer mode and
 * checks the POACH picker with 49 targets and a 30-member pact.
 * Screenshots go to shots/scale-*.png. Exits non-zero on any failed check.
 */
import type { Browser, Page } from 'playwright';
import { createGame, PARAMS, type BotPolicy } from '../src/engine';
import { advance, BOT_FIRMS, endSession, MAX_FIRMS_BY_MODE, publishResults, toggleDisclosure, toggleSummit } from '../src/firebase/orchestrator';
import { boardCapacity, boardPageCount, boardPageSize, filterByTicker, lobbyColumns } from '../src/ui/layout';
import { adminSet } from './emulator-rules';
import { BASE, adminGet, check, fail, shot, signUp, snapPlay, snapProjector, runWithStack, waitText, watchPage, checkPhone } from './lib/e2e-kit';
import { memoryCtx, setAt, type Json } from './lib/memory-io';

const COUNTS = [2, 12, 16, 17, 24, 32, 40, 50] as const;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const POLICIES: BotPolicy[] = ['cautious', 'standard', 'greedy', 'mimic-leader'];

/** Unique 4–6 letter tickers; every third is 6 letters, the widest the rules allow. */
function tickerFor(i: number): string {
  const base = `${LETTERS[i % 26]}${LETTERS[Math.floor(i / 26) % 26]}${LETTERS[(i * 7 + 3) % 26]}${LETTERS[(i * 11 + 5) % 26]}`;
  return base + (i % 3 === 1 ? 'R' : i % 3 === 2 ? 'RN' : '');
}

let codeSeq = 0;
const nextCode = (): string => {
  const k = codeSeq++;
  return `${CODE_LETTERS[k % 24]}${CODE_LETTERS[Math.floor(k / 24) % 24]}ZZ`;
};

interface Built {
  mode: 'team' | 'multiplayer';
  states: Record<'lobby' | 'open' | 'reveal' | 'summit' | 'ended', Json>;
  /** Human firms still to commit in the open snapshot. */
  notCommitted: number;
}

const clone = (x: Json): Json => structuredClone(x);

/** A session of `n` firms, run by the real orchestrator in memory. Every fifth firm is an in-app bot. */
async function build(n: number, facUid: string, lit = false): Promise<Built> {
  const mode = n > MAX_FIRMS_BY_MODE.team ? 'multiplayer' : 'team';
  const devices = mode === 'team' ? 3 : 1;
  const settings = { label: 'SCAL', endMode: 'manual' as const, minEnd: 10, maxEnd: 14, fixedEnd: null, disclosure: false, autoAuditP: 0.25 };
  const state = createGame(settings, [], 1000 + n, PARAMS);
  const db: Json = {
    meta: { code: 'SCAL', title: `Scale ${n}`, createdAt: 1, facilitatorUid: facUid, settings: { mode, timerSec: 900, autoResolve: false, revealThreshold: false, litRoom: lit } },
    public: { phase: 'lobby', round: 0, paused: false, disclosure: false, T: state.T, M: 0, collapsed: false, joinLocked: false, revealStep: 0 },
    engine: { ...state, params: PARAMS, rngNotes: null, cfCache: null },
  };
  const humans: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `f${String(i).padStart(2, '0')}`;
    const bot = i % 5 === 4;
    setAt(db, `firms/${id}`, { name: `Firm ${tickerFor(i)}`, ticker: tickerFor(i), createdAt: 1000 + i, order: i, isBot: bot, ...(bot ? { botPolicy: POLICIES[i % 4] } : {}) });
    if (bot) continue;
    humans.push(id);
    setAt(db, `firmSecrets/${id}`, { pin: '1234' });
    for (let k = 0; k < devices; k++) {
      const uid = `u${id}d${k}`;
      setAt(db, `members/${uid}`, { firmId: id, label: `${LETTERS[k]}${LETTERS[i % 26]}`, joinedAt: 5, pin: '1234' });
      // One firm in seven has no device online, so the OFFLINE filter has something to find.
      setAt(db, `presence/${uid}`, { online: i % 7 !== 3, lastSeen: 5 });
    }
  }
  const clock = { t: Date.now() };
  const ctx = memoryCtx(db, facUid, clock);
  const step = async (what: string, action: Promise<{ ok: boolean; message: string }>): Promise<void> => {
    const r = await action;
    if (!r.ok) throw new Error(`${what} (${n} firms): ${r.message}`);
  };
  const commit = (round: number, id: string, i: number): void => {
    const greedy = i % 3 === 0;
    setAt(db, `decisions/${round}/${id}`, {
      pace: greedy ? 4 : 2,
      safety: greedy ? 0 : 15,
      card: greedy && round % 2 === 1 ? 'BLITZ' : 'NONE',
      by: `u${id}d0`,
      at: clock.t,
    });
  };
  const lobby = clone(db);
  await step('briefing', advance(ctx));
  await step('open 1', advance(ctx));
  humans.forEach((id, i) => {
    if (i % 2 === 0) commit(1, id, i);
  });
  const open = clone(db);
  const notCommitted = humans.filter((_, i) => i % 2 !== 0).length;
  for (let r = 1; r <= 6; r++) {
    humans.forEach((id, i) => commit(r, id, i));
    if (r === 2 && humans.length >= 2) {
      const big = humans.slice(0, Math.max(2, Math.ceil(humans.length * 0.6)));
      setAt(db, 'pacts/pA', { name: 'PACT-A', proposer: big[0], terms: { maxPace: 2 }, members: Object.fromEntries(big.map((f) => [f, 2])), createdRound: 2, status: 'active' });
      setAt(db, 'pacts/pB', { name: 'PACT-B', proposer: humans[1], terms: { minSafety: 10 }, members: { [humans[1] as string]: 2, [humans[0] as string]: 2 }, createdRound: 2, status: 'active' });
    }
    if (r === 4) await step('disclosure', toggleDisclosure(ctx));
    clock.t += 1000;
    await step(`resolve ${r}`, advance(ctx));
    if (r < 6) await step(`open ${r + 1}`, advance(ctx));
  }
  const reveal = clone(db);
  await step('summit', toggleSummit(ctx));
  const summit = clone(db);
  await step('summit off', toggleSummit(ctx));
  await step('end', endSession(ctx));
  await step('results', publishResults(ctx));
  return { mode, states: { lobby, open, reveal, summit, ended: clone(db) }, notCommitted };
}

/** Writes a state as its own session and returns its id. */
async function publish(snapshot: Json, tag: string): Promise<string> {
  const g = `scale-${tag}`;
  const code = nextCode();
  const s = clone(snapshot);
  setAt(s, 'meta/code', code);
  await adminSet(`games/${g}`, s);
  await adminSet(`codes/${code}`, g);
  return g;
}

/** Table cells on the projector whose text is cut off (the panel checks see only panel overflow). */
async function clippedCells(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.scr td'))
      .filter((td) => td.scrollWidth > td.clientWidth + 1)
      .map((td) => (td.textContent ?? '').trim().slice(0, 24)),
  );
}

async function projector(page: Page, g: string, query: string, name: string, phaseText: RegExp): Promise<void> {
  // A fresh document each time, so no state carries over from the previous session's page.
  await page.goto('about:blank');
  await page.goto(`${BASE}#/screen/${g}${query}`);
  await waitText(page, phaseText, `${name}: projector shows ${phaseText.source}`, 15_000, '.scr');
  await page.waitForTimeout(300);
  await snapProjector(page, name);
  for (const [w, h] of [[1280, 720], [1920, 1080]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const cut = await clippedCells(page);
    check(cut.length === 0, `${name} ${w}x${h}: no table cell is cut off${cut.length ? ` (${cut.slice(0, 4).join(' | ')})` : ''}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

async function boardChecks(page: Page, n: number, name: string, wantPage: number, cap = boardCapacity()): Promise<void> {
  const info = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-board-mode]');
    return {
      mode: el?.dataset.boardMode ?? '',
      page: Number(el?.dataset.boardPage ?? 0),
      pages: Number(el?.dataset.boardPages ?? 0),
      rows: document.querySelectorAll('[data-board-mode] tbody tr').length,
      pinned: document.querySelectorAll('[data-board-mode] tbody tr.pinned').length,
    };
  });
  const pages = boardPageCount(n, cap);
  check(info.pages === pages, `${name}: ${pages} board page(s) (got ${info.pages})`);
  if (pages > 1) {
    check(info.mode === 'paged', `${name}: the board is paged`);
    check(info.page === wantPage, `${name}: shows page ${wantPage} (got ${info.page})`);
    check(info.rows <= cap && info.rows - info.pinned <= 10, `${name}: at most ${cap} two-line rows, 10 on the page (${info.rows - info.pinned} + ${info.pinned} pinned)`);
    check((await page.locator('.scr').innerText()).includes(`PAGE ${wantPage}/${pages}`), `${name}: the PAGE ${wantPage}/${pages} marker is shown`);
    if (wantPage > 1 && cap > boardPageSize(cap)) check(info.pinned >= 1, `${name}: the leader is pinned above page ${wantPage}`);
  } else {
    check(info.rows === n, `${name}: all ${n} rows on one board (got ${info.rows})`);
  }
}

async function results(page: Page, g: string, n: number, tag = ''): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`${BASE}#/results/${g}`);
  await waitText(page, /FINAL BOARD/, `results ${n}: panel 1 loads`, 20_000, '.scr');
  for (let step = 0; step < 6; step++) {
    await adminSet(`games/${g}/public/revealStep`, step);
    const label = `${step + 1}/6`;
    const ok = await page
      .waitForFunction((want) => document.querySelector('[data-results-pos]')?.textContent === want, label, { timeout: 10_000 })
      .then(() => true, () => false);
    check(ok, `results ${n}: top bar shows ${label}`);
    await page.waitForTimeout(250);
    const name = `scale-${tag}${n}-results-${step + 1}`;
    await snapProjector(page, name);
    const marks = await page.evaluate(() => Array.from(document.querySelectorAll('svg [data-firm], .cmp-row[data-firm]')).map((e) => (e as HTMLElement).dataset.firm ?? ''));
    if (step === 0 || step === 2) {
      const what = step === 0 ? 'FINAL BOARD' : 'COUNTERFACTUAL';
      check(marks.length === n, `results ${n} ${what}: all ${n} firms drawn (${marks.length})`);
      // A long list scrolls (§14.4): End reaches the last firm, Home returns, and the heading stays in view.
      const scroll = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('[data-res-scroll]');
        return el ? { scrolls: el.scrollHeight > el.clientHeight + 1 } : null;
      });
      // FINAL BOARD draws rows that fit without a scroll area; the comparison list always has one.
      if (step === 2) check(scroll !== null, `results ${n} ${what}: the firm list sits in a scroll area`);
      if (scroll?.scrolls) {
        await page.keyboard.press('End');
        await page.waitForTimeout(250);
        const end = await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('[data-res-scroll]')!;
          const box = el.getBoundingClientRect();
          const rows = Array.from(el.querySelectorAll<SVGGraphicsElement | HTMLElement>('[data-firm]'));
          const last = rows[rows.length - 1]!.getBoundingClientRect();
          const head = el.querySelector<HTMLElement>('.res-sticky-top')!.getBoundingClientRect();
          const foot = el.querySelector<HTMLElement>('.res-sticky-bottom')?.getBoundingClientRect();
          return {
            top: el.scrollTop,
            lastVisible: last.top >= head.bottom - 1 && last.bottom <= (foot ? foot.top : box.bottom) + 1,
            headPinned: Math.abs(head.top - box.top) < 1.5,
          };
        });
        check(end.top > 0 && end.lastVisible, `results ${n} ${what}: End scrolls to the last firm`);
        check(end.headPinned, `results ${n} ${what}: the heading stays in view while scrolled`);
        await shot(page, `${name}-end`);
        await page.keyboard.press('Home');
        await page.waitForTimeout(150);
        check((await page.evaluate(() => document.querySelector<HTMLElement>('[data-res-scroll]')!.scrollTop)) === 0, `results ${n} ${what}: Home scrolls back to the top`);
      } else {
        check(n <= 19, `results ${n} ${what}: ${n} firms fit without scrolling`);
      }
    }
    if (step === 3) check(marks.length === (n > 24 ? 13 : n), `results ${n} ATTRIBUTION: ${marks.length} rows (${n > 24 ? '12 + OTHERS' : 'every firm'})`);
  }
}

async function consoleChecks(page: Page, g: string, n: number, notCommitted: number): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`${BASE}#/control/${g}`);
  await waitText(page, /FIRMS/, `console ${n}: loads`, 15_000);
  for (const [w, h] of [[1280, 720], [1920, 1080]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    await shot(page, `scale-${n}-console-bottom`);
    const r = await page.evaluate(() => {
      const strip = document.querySelector<HTMLElement>('[data-control-strip]')?.getBoundingClientRect();
      const f9 = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'F9 ADVANCE')?.getBoundingClientRect();
      const scroller = document.querySelector<HTMLElement>('[data-firms-scroll]');
      const lh = parseFloat(getComputedStyle(document.body).fontSize) * 1.35;
      return {
        scrolled: window.scrollY > 0,
        stripTop: strip?.top ?? -1,
        f9Visible: !!f9 && f9.top >= 0 && f9.bottom <= window.innerHeight,
        tableH: scroller?.clientHeight ?? 0,
        maxH: lh * 21 + 2,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    check(r.f9Visible && Math.abs(r.stripTop) < 1, `console ${n} ${w}x${h}: F9 ADVANCE stays in view at the bottom of the page${r.scrolled ? '' : ' (page did not scroll)'}`);
    check(r.tableH <= r.maxH, `console ${n} ${w}x${h}: firms table at most 20 rows tall (${Math.round(r.tableH)}px)`);
    check(!r.overflowX, `console ${n} ${w}x${h}: no horizontal scroll`);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'NOT COMMITTED' }).click();
  const shown = Number(await page.locator('[data-firms-shown]').getAttribute('data-firms-shown'));
  check(shown === notCommitted, `console ${n}: NOT COMMITTED shows the ${notCommitted} human firms still to commit (got ${shown})`);
  await page.getByRole('button', { name: 'NOT COMMITTED' }).click();
  await page.getByRole('button', { name: 'CMT', exact: true }).click();
  const first = await page.locator('[data-firms-scroll] tbody tr').first().innerText();
  check(!first.includes('✓'), `console ${n}: sorting by CMT lists a firm still to commit first`);
}

async function phoneRun(browser: Browser, facPage: Page, facUid: string): Promise<void> {
  // 49 in-app bot firms in a multiplayer lobby; a phone founds the 50th through the join screen.
  const state = createGame({ label: 'PHON', endMode: 'manual', minEnd: 10, maxEnd: 14, fixedEnd: null, disclosure: false, autoAuditP: 0 }, [], 77, PARAMS);
  const db: Json = {
    meta: { code: 'PHON', title: 'Phone 50', createdAt: 1, facilitatorUid: facUid, settings: { mode: 'multiplayer', timerSec: 900, autoResolve: false, revealThreshold: false, litRoom: false } },
    public: { phase: 'lobby', round: 0, paused: false, disclosure: false, T: state.T, M: 0, collapsed: false, joinLocked: false, revealStep: 0 },
    engine: { ...state, params: PARAMS, rngNotes: null, cfCache: null },
  };
  BOT_FIRMS.slice(0, 49).forEach((b, i) => setAt(db, `firms/b${String(i).padStart(2, '0')}`, { name: b.name, ticker: b.ticker, createdAt: 1000 + i, order: i, isBot: true, botPolicy: POLICIES[i % 4] }));
  const g = await publish(db, 'phone');
  const code = await adminGet<string>(`games/${g}/meta/code`);

  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const phone = watchPage(await ctx.newPage(), 'phone');
  await phone.goto(`${BASE}#/j/${code}`);
  await phone.getByRole('button', { name: 'Continue' }).click();
  await waitText(phone, /Found your firm/, 'multiplayer join screen leads with "Found your firm"');
  check(await phone.getByRole('button', { name: 'Rejoin your firm with its PIN' }).isVisible(), 'multiplayer join screen offers the PIN rejoin');
  await shot(phone, 'scale-phone-join');
  await checkPhone(phone, 'scale phone join 360x640');
  await phone.getByRole('button', { name: 'Found your firm' }).click();
  await phone.getByLabel(/Firm name/).fill('Solo Labs');
  await phone.getByLabel(/Ticker/).fill('SOLO');
  await phone.getByRole('button', { name: 'Found the firm' }).click();
  await waitText(phone, /FIRM PIN/, 'founding shows the FIRM PIN panel');
  check((await phone.locator('body').innerText()).includes('Keep this PIN. It lets you rejoin your firm from another device.'), 'the PIN panel explains the rejoin');

  await facPage.goto(`${BASE}#/screen/${g}`);
  await waitText(facPage, /50 FIRMS/, 'the projector lobby counts 50 firms', 15_000, '.scr');
  check((await facPage.locator('.lobby-cell').count()) === 50, 'the lobby lists all 50 firms in columns');
  check(Number(await facPage.locator('[data-lobby-cols]').getAttribute('data-lobby-cols')) === lobbyColumns(50), `the lobby uses ${lobbyColumns(50)} columns`);
  await snapProjector(facPage, 'scale-50-lobby-live');
  await facPage.keyboard.press('F9');
  await waitText(facPage, /BRIEFING/, 'F9 opens the briefing with 50 firms', 15_000, '.scr');
  await facPage.waitForTimeout(500);
  await facPage.keyboard.press('F9');
  await waitText(facPage, /OPEN/, 'F9 opens quarter 1 with 50 firms', 15_000, '.scr');

  await phone.getByRole('button', { name: 'Open the desk' }).click();
  await waitText(phone, /Card:/, 'the phone desk opens');
  await phone.locator('.card-trigger').click();
  await phone.getByRole('radio', { name: /POACH/ }).click();
  const targets = phone.locator('.target-list [role=radio]');
  check((await targets.count()) === 49, `the POACH picker lists 49 targets (got ${await targets.count()})`);
  check(await phone.getByLabel('Find a target by ticker').isVisible(), 'the POACH picker has a ticker filter');
  await snapPlay(phone, 'scale-phone-poach');
  await phone.getByLabel('Find a target by ticker').fill('rn');
  const want = filterByTicker(BOT_FIRMS.slice(0, 49), 'rn').length;
  check((await targets.count()) === want, `typing RN leaves the ${want} tickers containing RN (got ${await targets.count()})`);
  await targets.first().click();
  check(await phone.getByRole('button', { name: 'Done' }).isEnabled(), 'a filtered target can be selected and the card confirmed');
  await shot(phone, 'scale-phone-poach-filtered');
  await checkPhone(phone, 'scale phone POACH filtered 360x640');
  await phone.getByRole('button', { name: 'Done' }).click();

  const members = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`b${String(i).padStart(2, '0')}`, 1]));
  await adminSet(`games/${g}/pacts/pBig`, { name: 'PACT-A', proposer: 'b00', terms: { maxPace: 2 }, members, createdRound: 1, status: 'active' });
  await phone.getByRole('tab', { name: 'PACTS' }).click();
  const more = phone.getByRole('button', { name: '+20 more' });
  await more.waitFor({ timeout: 10_000 }).catch(() => fail('the 30-member pact shows "+20 more"'));
  await snapPlay(phone, 'scale-phone-pacts');
  await more.click();
  check(await phone.getByRole('button', { name: 'Show fewer' }).isVisible(), '"+20 more" expands the member list');
  await checkPhone(phone, 'scale phone PACTS expanded 360x640');
  await ctx.close();
}

async function scenario(browser: Browser): Promise<void> {
  const facUid = await signUp('scale@example.test', 'correct-horse-9');
  await adminSet(`facilitators/${facUid}`, true);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = watchPage(await ctx.newPage(), 'facilitator');
  await page.goto(`${BASE}#/new`);
  await waitText(page, /SIGN IN/i, 'sign-in form');
  await page.getByLabel('Email').fill('scale@example.test');
  await page.getByLabel('Password').fill('correct-horse-9');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await waitText(page, /NEW SESSION/i, 'facilitator signed in');
  await page.getByLabel(/Multiplayer mode/).check();
  check((await page.locator('body').innerText()).includes('0/50'), '#/new shows the 50-firm bot limit in multiplayer mode');

  for (const n of COUNTS) {
    const t0 = performance.now();
    const b = await build(n, facUid);
    console.log(`built ${n} firms (${b.mode}) in ${Math.round(performance.now() - t0)} ms`);
    const ids = {
      lobby: await publish(b.states.lobby, `${n}-lobby`),
      open: await publish(b.states.open, `${n}-open`),
      reveal: await publish(b.states.reveal, `${n}-reveal`),
      summit: await publish(b.states.summit, `${n}-summit`),
      ended: await publish(b.states.ended, `${n}-ended`),
    };
    await projector(page, ids.lobby, '', `scale-${n}-lobby`, /LOBBY/);
    if (n > 16) check((await page.locator('.lobby-cell').count()) === n, `lobby ${n}: every firm has a cell`);
    await projector(page, ids.open, '', `scale-${n}-open`, /OPEN/);
    await boardChecks(page, n, `board ${n} open`, 1);
    await projector(page, ids.reveal, '', `scale-${n}-reveal`, /REVEAL/);
    await boardChecks(page, n, `board ${n} reveal`, 1);
    const pages = boardPageCount(n);
    if (pages > 1) {
      await projector(page, ids.reveal, `?page=${pages}`, `scale-${n}-reveal-last`, /REVEAL/);
      await boardChecks(page, n, `board ${n} last page`, pages);
      await projector(page, ids.reveal, '?page=2', `scale-${n}-reveal-p2`, /REVEAL/);
      await boardChecks(page, n, `board ${n} page 2`, 2);
    }
    await projector(page, ids.summit, '', `scale-${n}-summit`, /SUMMIT/);
    await boardChecks(page, n, `board ${n} summit`, 1, boardCapacity({ banner: true }));
    await projector(page, ids.reveal, '?view=pacts', `scale-${n}-pacts`, /PACT/);
    await results(page, ids.ended, n);
    await consoleChecks(page, ids.open, n, b.notCommitted);
  }

  // Lit-room mode: 32 grid rows instead of 36, so fewer two-line rows fit (§14.1).
  for (const n of [12, 16, 24, 50]) {
    const b = await build(n, facUid, true);
    const reveal = await publish(b.states.reveal, `lit-${n}-reveal`);
    const summit = await publish(b.states.summit, `lit-${n}-summit`);
    const ended = await publish(b.states.ended, `lit-${n}-ended`);
    await projector(page, await publish(b.states.lobby, `lit-${n}-lobby`), '', `scale-lit-${n}-lobby`, /LOBBY/);
    await projector(page, reveal, '', `scale-lit-${n}-reveal`, /REVEAL/);
    await boardChecks(page, n, `lit board ${n} reveal`, 1, boardCapacity({ lit: true }));
    if (n > 16) {
      await projector(page, reveal, '?page=2', `scale-lit-${n}-reveal-p2`, /REVEAL/);
      await boardChecks(page, n, `lit board ${n} page 2`, 2, boardCapacity({ lit: true }));
    }
    await projector(page, summit, '', `scale-lit-${n}-summit`, /SUMMIT/);
    await boardChecks(page, n, `lit board ${n} summit`, 1, boardCapacity({ lit: true, banner: true }));
    await results(page, ended, n, 'lit-');
  }

  // Rotation: a paged board turns the page after 8 s, and a key press holds it.
  const rot = await publish((await build(24, facUid)).states.reveal, 'rotation');
  await page.goto(`${BASE}#/screen/${rot}`);
  await waitText(page, /PAGE 1\/3/, 'rotation: starts on page 1', 15_000, '.scr');
  await waitText(page, /PAGE 2\/3/, 'rotation: turns to page 2 after 8 s', 12_000, '.scr');
  await page.keyboard.press('Shift');
  await page.waitForTimeout(10_000);
  check((await page.locator('.scr').innerText()).includes('PAGE 2/3'), 'rotation: holds for 30 s after a key press');

  await phoneRun(browser, page, facUid);
  await ctx.close();
}

void runWithStack(scenario);
