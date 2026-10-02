/**
 * Screenshots the static screens and states at the required sizes and runs layout checks.
 * The live routes (facilitator and participant) are covered by scripts/e2e.ts.
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
