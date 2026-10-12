/**
 * Renders the facilitator guide to PDF (Session 19 Part E). Usage: `npm run guide:pdf`.
 *
 * docs/facilitator-guide/guide.html → docs/facilitator-guide/FRONTIER-facilitator-guide.pdf, A4, with Playwright's
 * Chromium. Only local files load: any other request is blocked and fails the run, as does any image or font that does
 * not load. Fails when the page count leaves GUIDE_PAGES or the PDF reaches 10 MB.
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { GUIDE_MAX_BYTES, GUIDE_PAGES, pdfPageCount } from './lib/guide';

const EXEC = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const SRC = resolve('docs/facilitator-guide/guide.html');
const OUT = resolve('docs/facilitator-guide/FRONTIER-facilitator-guide.pdf');

const failures: string[] = [];
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://')) return route.continue();
    failures.push(`blocked a network request: ${url}`);
    return route.abort();
  });
  page.on('requestfailed', (r) => failures.push(`request failed: ${r.url()} (${r.failure()?.errorText ?? '?'})`));
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
  await page.goto(pathToFileURL(SRC).href, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const state = await page.evaluate(async () => {
    await document.fonts.ready;
    const broken = [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src') ?? '?');
    return { broken, images: document.images.length, font: document.fonts.check('600 9pt "IBM Plex Mono"') && document.fonts.check('400 9pt "IBM Plex Mono"') };
  });
  for (const b of state.broken) failures.push(`image did not load: ${b}`);
  if (!state.font) failures.push('IBM Plex Mono did not load (run npm ci so node_modules/@fontsource is present)');
  await page.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true });
  const pages = pdfPageCount(readFileSync(OUT));
  const bytes = statSync(OUT).size;
  if (pages < GUIDE_PAGES.min || pages > GUIDE_PAGES.max) failures.push(`${pages} pages, expected ${GUIDE_PAGES.min} to ${GUIDE_PAGES.max}`);
  if (bytes >= GUIDE_MAX_BYTES) failures.push(`${(bytes / 1e6).toFixed(1)} MB, limit ${GUIDE_MAX_BYTES / 1e6} MB`);
  console.log(`${OUT}: ${pages} pages, ${(bytes / 1e6).toFixed(2)} MB, ${state.images} images`);
} finally {
  await browser.close();
}
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log('guide:pdf passed.');
