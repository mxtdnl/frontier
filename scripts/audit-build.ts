/**
 * Build audit (Session 8, spec §18.8). Usage: `npm run audit:build`.
 *
 * Builds `dist/index.html`, serves it under `/frontier/` (as GitHub Pages does) and loads every route
 * in Chromium with all outside traffic blocked, recording each request and WebSocket the page tries to
 * make. Fails if any host is not Firebase, or if the file links to an outside script, stylesheet,
 * font or image. Nothing leaves the container: blocked requests are only counted.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { firebaseConfig } from '../src/firebase/config';

const EXEC = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const failures: string[] = [];
const check = (cond: boolean, m: string): void => {
  if (cond) console.log('ok   ' + m);
  else {
    failures.push(m);
    console.error('FAIL ' + m);
  }
};

const dbHost = new URL(firebaseConfig.databaseURL).hostname;
/** Hosts the app may talk to: the project's database, its auth domain, and the two auth API hosts. */
const allowed = (host: string): boolean =>
  host === dbHost ||
  host.endsWith('.firebasedatabase.app') ||
  host.endsWith('.firebaseio.com') ||
  host === firebaseConfig.authDomain ||
  host === 'identitytoolkit.googleapis.com' ||
  host === 'securetoken.googleapis.com';

const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
check(build.status === 0, 'npm run build succeeds (lint:copy, lint:design, typecheck, vite build)');

const file = resolve('dist/index.html');
const html = readFileSync(file, 'utf8');
check(statSync(file).size > 100_000, `dist/index.html exists (${Math.round(statSync(file).size / 1024)} kB)`);
check(statSync(resolve('dist')).isDirectory() && !/<script[^>]*\ssrc=/.test(html) && !/<link[^>]*rel="stylesheet"/.test(html), 'scripts and styles are inline (a single file)');
const outsideTags = [...html.matchAll(/<(?:script|link|img|iframe|source|video|audio)\b[^>]*\b(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((m) => m[0].slice(0, 80));
check(outsideTags.length === 0, `the file links to no outside script, stylesheet, image or frame${outsideTags.length ? `: ${outsideTags.join(' | ')}` : ''}`);
const cssUrls = [...html.matchAll(/url\(\s*["']?(https?:)?\/\/[^)]+\)/g)].map((m) => m[0].slice(0, 80));
check(cssUrls.length === 0, `the styles load no outside font or image${cssUrls.length ? `: ${cssUrls.join(' | ')}` : ''}`);

// Serve dist under /frontier/, like https://<owner>.github.io/frontier/.
const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (path === '/frontier/' || path === '/frontier/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(5198, '127.0.0.1', r));

const seen = new Map<string, number>();
const note = (url: string): void => {
  try {
    const u = new URL(url);
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return;
    const key = `${u.protocol}//${u.host}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  } catch {
    /* not a URL */
  }
};

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    return route.abort('blockedbyclient');
  });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage();
  page.on('request', (r) => note(r.url()));
  page.on('websocket', (w) => note(w.url()));
  const base = 'http://127.0.0.1:5198/frontier/';
  for (const route of ['#/', '#/j/ABCD', '#/play/g1', '#/new', '#/screen/g1', '#/control/g1', '#/results/g1', '#/kit']) {
    await page.goto(base + route);
    await page.waitForTimeout(1500);
    const text = await page.locator('body').innerText();
    check(text.trim().length > 0, `${route} renders from the /frontier/ sub-path`);
  }
  await page.goto(base + '#/');
  await page.waitForTimeout(300);
  check((await page.locator('#root *').count()) > 5, 'the landing page rendered a real UI');
} finally {
  await browser.close();
  server.close();
}

console.log('\nHosts the built page contacted:');
for (const [host, n] of [...seen.entries()].sort()) console.log(`  ${host}  (${n})`);
const outside = [...seen.keys()].filter((k) => {
  const host = new URL(k).hostname;
  return host !== '127.0.0.1' && !allowed(host);
});
check(outside.length === 0, `every outside host is Firebase${outside.length ? `: ${outside.join(', ')}` : ''}`);
console.log(failures.length === 0 ? 'All checks passed.' : `${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
