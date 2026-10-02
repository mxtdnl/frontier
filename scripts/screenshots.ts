/**
 * Screenshots the static screens and states at the required sizes and runs layout checks.
 * The live facilitator routes are covered by scripts/e2e.ts.
 * Usage: npm run build && npm run shots
 * Output: shots/<route>-<state>-<w>x<h>.png and a printed list of any failed checks.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';

const OUT = resolve('shots');
const BASE = pathToFileURL(resolve('dist/index.html')).toString();
const EXEC = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

const PHONE = [
  [360, 640],
  [390, 844],
  [1440, 900],
] as const;
const PROJECTOR = [
  [1280, 720],
  [1920, 1080],
] as const;

const failures: string[] = [];
const fail = (m: string) => {
  failures.push(m);
  console.error('FAIL ' + m);
};

async function open(page: Page, hash: string): Promise<void> {
  await page.goto(BASE + hash);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  const vp = page.viewportSize();
  await page.screenshot({ path: `${OUT}/${name}-${vp?.width}x${vp?.height}.png`, fullPage });
}

/** Projector frame must fit the viewport and have no clipped content. */
async function checkProjector(page: Page, label: string): Promise<void> {
  const r = await page.evaluate(() => {
    const scr = document.querySelector<HTMLElement>('.scr');
    if (!scr) return { missing: true as const };
    const box = scr.getBoundingClientRect();
    const clipped: string[] = [];
    scr.querySelectorAll<HTMLElement>('.panel-body, .panel, .topbar, .fkeys, .ticker').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
        clipped.push(`${el.className.split(' ')[0]}:${el.textContent?.slice(0, 30)}`);
      }
    });
    const fs = parseFloat(getComputedStyle(scr).fontSize);
    return {
      missing: false as const,
      fits: box.width <= window.innerWidth + 0.5 && box.height <= window.innerHeight + 0.5,
      w: box.width,
      h: box.height,
      fs,
      clipped,
      chW: (() => {
        const s = document.createElement('span');
        s.style.cssText = 'position:absolute;visibility:hidden;width:1ch';
        scr.appendChild(s);
        const v = s.getBoundingClientRect().width;
        s.remove();
        return v;
      })(),
    };
  });
  if (r.missing) return fail(`${label}: no .scr frame`);
  if (!r.fits) fail(`${label}: frame ${r.w.toFixed(0)}x${r.h.toFixed(0)} exceeds viewport`);
  if (r.fs < 14) fail(`${label}: font ${r.fs}px below 14px`);
  if (r.clipped.length) fail(`${label}: clipped ${r.clipped.join(' | ')}`);
}

/** Participant page: no horizontal scroll, all controls at least 44 px, none smaller than 14 px text. */
async function checkPlay(page: Page, label: string): Promise<void> {
  const r = await page.evaluate(() => {
    const small: string[] = [];
    document.querySelectorAll<HTMLElement>('button, input, [role=tab], [role=radio], select, a').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      if (b.height < 43.5 || b.width < 43.5) small.push(`${el.tagName}:${(el.textContent ?? '').trim().slice(0, 16)} ${b.width.toFixed(0)}x${b.height.toFixed(0)}`);
    });
    const tiny: string[] = [];
    document.querySelectorAll<HTMLElement>('main *, header *').forEach((el) => {
      if (el.children.length === 0 && (el.textContent ?? '').trim()) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 13.5) tiny.push(`${el.tagName}:${(el.textContent ?? '').trim().slice(0, 16)} ${fs}px`);
      }
    });
    return { overflowX: document.documentElement.scrollWidth > window.innerWidth + 1, small, tiny };
  });
  if (r.overflowX) fail(`${label}: horizontal scroll`);
  if (r.small.length) fail(`${label}: targets under 44px: ${r.small.join(' | ')}`);
  if (r.tiny.length) fail(`${label}: text under 14px: ${r.tiny.join(' | ')}`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
  const requests: string[] = [];

  const newPage = async (w: number, h: number, reduced = false) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') fail(`console error: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`page error: ${e.message}`));
    page.on('request', (r) => {
      if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url());
    });
    return page;
  };

  // ---- Results (static; `#/screen` and `#/control` need a live database and are checked by `npm run test:e2e`) ----
  for (const [w, h] of PROJECTOR) {
    const page = await newPage(w, h);
    for (let p = 1; p <= 6; p++) {
      await open(page, `#/results/demo?panel=${p}${p === 2 ? '&tau=on' : ''}`);
      await shot(page, `results-${p}`);
      await checkProjector(page, `results ${p} ${w}x${h}`);
    }
    await open(page, '#/results/demo?panel=2');
    await shot(page, 'results-2-no-tau');
    await page.context().close();
  }

  // ---- Participant ----
  for (const [w, h] of PHONE) {
    const page = await newPage(w, h);
    for (const s of ['open', 'committed', 'reveal', 'summit', 'ended']) {
      await open(page, `#/play/demo?state=${s}`);
      await shot(page, `play-${s}-DESK`);
      await checkPlay(page, `play ${s} ${w}x${h}`);
      for (const tab of ['BOOK', 'PACTS', 'WIRE']) {
        await page.getByRole('tab', { name: tab }).click();
        await shot(page, `play-${s}-${tab}`);
        await checkPlay(page, `play ${s} ${tab} ${w}x${h}`);
      }
    }
    // Card sheet with POACH.
    await open(page, '#/play/demo?state=open');
    await page.getByRole('button', { name: /^Card:/ }).click();
    await page.getByRole('radio', { name: /POACH/ }).click();
    await shot(page, 'play-card-sheet');
    await checkPlay(page, `play card sheet ${w}x${h}`);
    await page.getByRole('radio', { name: 'ARCN' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'COMMIT' }).click();
    await shot(page, 'play-after-commit');
    await page.context().close();
  }

  // ---- Facilitator pages and kit ----
  for (const [w, h] of [PHONE[1], PHONE[2]] as const) {
    const page = await newPage(w, h);
    for (const [name, hash] of [
      ['kit', '#/kit'],
      ['index', '#/'],
    ] as const) {
      await open(page, hash);
      await shot(page, name, true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) fail(`${name} ${w}x${h}: horizontal scroll`);
    }
    await page.context().close();
  }

  await browser.close();
  if (requests.length) fail(`network requests outside the page: ${[...new Set(requests)].join(', ')}`);
  console.log(failures.length === 0 ? 'All checks passed.' : `${failures.length} check(s) failed.`);
  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
