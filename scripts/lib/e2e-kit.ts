/** Shared helpers for the Playwright end-to-end runs (Sessions 4 to 8). */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { APP_NAMESPACE, adminSet, loadRules } from '../emulator-rules';

export const PORT = 5199;
export const BASE = `http://127.0.0.1:${PORT}/`;
export const EXEC = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
export const OUT = resolve('shots');
export const AUTH = `http://127.0.0.1:9099`;
export const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '127.0.0.1:9000';

export const failures: string[] = [];
export const fail = (m: string): void => {
  failures.push(m);
  console.error('FAIL ' + m);
};
export const check = (cond: boolean, m: string): void => {
  if (cond) console.log('ok   ' + m);
  else fail(m);
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string): Promise<string> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = (await r.json()) as { localId?: string };
  if (!j.localId) throw new Error(`sign-up failed for ${email}`);
  return j.localId;
}

export async function adminGet<T = unknown>(path: string): Promise<T> {
  const r = await fetch(`http://${DB_HOST}/${path}.json?ns=${APP_NAMESPACE}`, { headers: { Authorization: 'Bearer owner' } });
  return (await r.json()) as T;
}

export async function waitServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('The dev server did not start.');
}

export const screenText = (page: Page): Promise<string> => page.locator('.scr').innerText();

/** Waits until the text of `selector` matches `re`; records a failure if it never does. */
export async function waitText(page: Page, re: RegExp, what: string, timeout = 15_000, selector = 'body'): Promise<boolean> {
  try {
    await page.waitForFunction(
      ({ sel, src, flags }) => new RegExp(src, flags).test((document.querySelector(sel) as HTMLElement | null)?.innerText ?? ''),
      { sel: selector, src: re.source, flags: re.flags },
      { timeout },
    );
    console.log('ok   ' + what);
    return true;
  } catch {
    const body = (await page.locator(selector).innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    fail(`${what} (waited ${timeout} ms; page shows: ${body})`);
    return false;
  }
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/e2e-${name}-${page.viewportSize()?.width}x${page.viewportSize()?.height}.png` });
}

/** The projector frame must fit the viewport with no clipped panels (spec §16.2). */
export async function checkProjector(page: Page, label: string): Promise<void> {
  const r = await page.evaluate(() => {
    const scr = document.querySelector<HTMLElement>('.scr');
    if (!scr) return { missing: true as const };
    const box = scr.getBoundingClientRect();
    const clipped: string[] = [];
    scr.querySelectorAll<HTMLElement>('.panel-body, .panel, .topbar, .fkeys, .ticker').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.className.split(' ')[0]}:${el.textContent?.slice(0, 30)}`);
    });
    return {
      missing: false as const,
      fits: box.width <= window.innerWidth + 0.5 && box.height <= window.innerHeight + 0.5,
      fs: parseFloat(getComputedStyle(scr).fontSize),
      clipped,
    };
  });
  if (r.missing) return fail(`${label}: no .scr frame`);
  if (!r.fits) fail(`${label}: frame exceeds the viewport`);
  if (r.fs < 14) fail(`${label}: font ${r.fs}px below 14px`);
  if (r.clipped.length) fail(`${label}: clipped ${r.clipped.join(' | ')}`);
}

/**
 * Chart geometry on the page (spec §16.3): every line chart's line runs from the left to the right end of its axis,
 * every y label sits on the gridline it names, every SVG chart fits its container, and every results chart has visible
 * marks for each firm.
 */
export async function checkCharts(page: Page, label: string): Promise<void> {
  const r = await page.evaluate(() => {
    const problems: string[] = [];
    let charts = 0;
    document.querySelectorAll<SVGSVGElement>('svg[data-chart]').forEach((svg, k) => {
      charts++;
      const kind = svg.dataset.chart ?? '?';
      const host = svg.parentElement as HTMLElement;
      const box = svg.getBoundingClientRect();
      const hostBox = host.getBoundingClientRect();
      if (box.width < 20 || box.height < 20) problems.push(`${kind}#${k} is ${Math.round(box.width)}x${Math.round(box.height)}`);
      // A results list that scrolls (§14.4) is taller than its scroll area by design; only its width must fit.
      const scrolls = host.matches('[data-res-scroll]');
      if (box.width > hostBox.width + 1 || (!scrolls && box.height > hostBox.height + 1)) problems.push(`${kind}#${k} is larger than its container`);
      const fs = parseFloat(getComputedStyle(svg).fontSize);
      // Line charts, FIRMS cards and the RANKS chart (Session 13) all draw quarters across the full plot width.
      if (kind === 'line' || kind === 'multiple' || kind === 'ranks') {
        const left = Number(svg.dataset.plotLeft);
        const right = Number(svg.dataset.plotRight);
        svg.querySelectorAll<SVGPathElement>('path.lc-line').forEach((path, j) => {
          const b = path.getBBox();
          if (Math.abs(b.x - left) > 1.5 || Math.abs(b.x + b.width - right) > 1.5) {
            problems.push(`line#${k}.${j} spans ${b.x.toFixed(1)}–${(b.x + b.width).toFixed(1)}, axis ${left.toFixed(1)}–${right.toFixed(1)}`);
          }
        });
        svg.querySelectorAll<SVGTextElement>('text.lc-ytick').forEach((t) => {
          const b = t.getBBox();
          const mid = b.y + b.height / 2;
          const want = Number(t.dataset.y);
          if (Math.abs(mid - want) > fs * 0.2) problems.push(`label "${t.textContent}" centred at ${mid.toFixed(1)}, value at ${want.toFixed(1)}`);
        });
      }
      // No named helper functions in here: tsx wraps them in a __name call that does not exist in the page.
      const visible: Record<string, number> = {};
      svg.querySelectorAll<SVGGraphicsElement>('[data-mark]').forEach((m) => {
        const b = m.getBBox();
        if (b.width > 0 && b.height > 0) visible[m.dataset.mark ?? ''] = (visible[m.dataset.mark ?? ''] ?? 0) + 1;
      });
      // A shortened attribution chart's OTHERS row (§14.4) carries figures, not bars.
      const rows = svg.querySelectorAll('g[data-firm]:not([data-others])').length;
      if (kind === 'dumbbell' && (rows === 0 || visible.final !== rows || visible.peak !== rows)) problems.push(`dumbbell: ${rows} firms, missing marks`);
      if (kind === 'butterfly') {
        if (rows === 0 || visible.damage !== rows) problems.push(`butterfly: ${rows} firms, missing damage bars`);
        if (visible.value !== rows && !svg.querySelector('[data-note="no-positive"]')) problems.push('butterfly: value side has neither bars nor the no-positive note');
      }
    });
    document.querySelectorAll<HTMLElement>('.cmp-row[data-firm]').forEach((row) => {
      const fill = row.querySelector<HTMLElement>('.hbar-fill');
      const marker = row.querySelector<HTMLElement>('.hbar-marker');
      if (!fill || fill.getBoundingClientRect().width < 0.5 || !marker) problems.push(`comparison ${row.dataset.firm}: no visible bar or marker`);
    });
    return { charts, problems };
  });
  if (r.problems.length) fail(`${label}: charts: ${r.problems.join(' | ')}`);
}

/** Results panels (§14.4): most empty height allowed below the last content, as a share of the panel body. */
export const RESULTS_EMPTY_MAX = 0.2;

/**
 * Results panel checks (spec §14.4, Session 14), run on any projector frame that shows a results panel:
 * the panel body opens with a non-empty headline, and the content reaches down the panel, leaving at most
 * RESULTS_EMPTY_MAX of its height empty at the bottom. Returns the headline text ('' when no results panel).
 */
export async function checkResultsPanel(page: Page, label: string): Promise<string> {
  const r = await page.evaluate(() => {
    const head = document.querySelector<HTMLElement>('.scr .panel-body > [data-headline]');
    if (!head) return null;
    const body = head.parentElement as HTMLElement;
    const box = body.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(body).paddingBottom) || 0;
    let lowest = box.top;
    body.querySelectorAll<Element>('*').forEach((el) => {
      if (el.children.length > 0 || el.tagName === 'svg') return;
      const b = el.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return;
      lowest = Math.max(lowest, Math.min(b.bottom, box.bottom));
    });
    return {
      text: head.innerText.trim(),
      first: body.firstElementChild === head,
      empty: (box.bottom - pad - lowest) / Math.max(1, box.height - pad),
    };
  });
  if (r === null) return '';
  if (!r.text) fail(`${label}: results headline is empty`);
  if (!r.first) fail(`${label}: results headline is not the first thing in the panel`);
  if (r.empty > RESULTS_EMPTY_MAX) fail(`${label}: results panel leaves ${(r.empty * 100).toFixed(0)}% of its height empty`);
  return r.text;
}

/** Captures the projector at both required sizes, then restores the working size. */
export async function snapProjector(page: Page, name: string): Promise<void> {
  for (const [w, h] of [[1280, 720], [1920, 1080]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    await shot(page, name);
    await checkProjector(page, `projector ${name} ${w}x${h}`);
    await checkCharts(page, `projector ${name} ${w}x${h}`);
    await checkAmber(page, `projector ${name} ${w}x${h}`);
    await checkResultsPanel(page, `projector ${name} ${w}x${h}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

/**
 * Amber budget (spec §16.1, Session 12): a solid amber fill only on the brand block, the primary key and the
 * reveal invert; large amber text only on the countdown and the trust numeral. Charts (SVG) are not counted.
 */
export async function checkAmber(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const scr = document.querySelector<HTMLElement>('.scr');
    if (!scr) return ['no .scr frame'];
    const amber = 'rgb(255, 176, 0)';
    const base = parseFloat(getComputedStyle(scr).fontSize);
    const out: string[] = [];
    scr.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (el.closest('svg')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') return;
      if (cs.backgroundColor === amber && !el.matches('.tb-brand, .fkey.is-primary .k, .is-inverted')) {
        out.push(`amber fill on ${el.className || el.tagName}: ${el.textContent?.slice(0, 20)}`);
      }
      const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (ownText && cs.color === amber && parseFloat(cs.fontSize) >= base * 1.4 && !el.closest('.tb-clock, [data-trust-numerals], [data-amber]')) {
        out.push(`large amber text on ${el.className || el.tagName}: ${el.textContent?.slice(0, 20)}`);
      }
    });
    return out;
  });
  if (bad.length) fail(`${label}: amber budget: ${bad.slice(0, 4).join(' | ')}`);
  else console.log(`ok   ${label}: amber budget`);
}

export interface Harness {
  signIn(): Promise<string>;
  resolveCode(code: string): Promise<string | null>;
  found(g: string, name: string, ticker: string, label: string): Promise<{ firmId: string; pin: string }>;
  join(g: string, firmId: string, pin: string, label: string): Promise<void>;
  submit(g: string, round: number, firmId: string, d: { pace: number; safety: number; card: string; target: string | null }): Promise<void>;
  proposePact(g: string, round: number, firmId: string, name: string, maxPace: number): Promise<string>;
  tryRead(path: string): Promise<string | null>;
  enginePath(g: string): string;
}
export type Call<K extends keyof Harness> = Harness[K] extends (...a: infer A) => infer R ? [K, A, R] : never;

export async function h<K extends keyof Harness>(page: Page, name: K, ...args: Call<K>[1]): Promise<Awaited<Call<K>[2]>> {
  return (await page.evaluate(([n, a]) => (window as unknown as { harness: Record<string, (...x: unknown[]) => Promise<unknown>> }).harness[n as string]!(...(a as unknown[])), [name, args] as const)) as Awaited<Call<K>[2]>;
}

/** Runs `fn` and reports whether it threw (the page rejects with the database's error). */
export async function refused(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}


/** Participant page: no horizontal scroll, every control at least 44 px, no text under 14 px. */
export async function checkPhone(page: Page, label: string): Promise<void> {
  const r = await page.evaluate(() => {
    const small: string[] = [];
    document.querySelectorAll<HTMLElement>('button, input, [role=tab], [role=radio], select, a').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      if (el.matches('input[type=range]')) return; // the slider thumb is the target; its track is 44 px tall in the wrapper
      const box = el.matches('input[type=radio], input[type=checkbox]') ? (el.closest('label') ?? el).getBoundingClientRect() : b;
      if (box.height < 43.5 || box.width < 43.5) small.push(`${el.tagName}:${(el.textContent ?? '').trim().slice(0, 16)} ${b.width.toFixed(0)}x${b.height.toFixed(0)}`);
    });
    const tiny: string[] = [];
    document.querySelectorAll<HTMLElement>('main *, header *, .page *').forEach((el) => {
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

/**
 * Spec §14.3 (settles REVIEW L8): when the desk shows a decision ticket, the ticket and the commit
 * bar are both inside the viewport together, at every size, without scrolling the page.
 */
export async function checkDeskFit(page: Page, label: string): Promise<void> {
  const r = await page.evaluate(() => {
    const ticket = document.querySelector<HTMLElement>('[data-ticket]');
    const bar = document.querySelector<HTMLElement>('[data-commit-status]');
    if (!ticket || !bar) return null;
    const btn = Array.from(document.querySelectorAll<HTMLElement>('.desk-foot button')).find((b) => /COMMIT/i.test(b.textContent ?? ''));
    const rects = [ticket, bar, btn ?? ticket].map((el) => el.getBoundingClientRect());
    const inside = rects.map((b) => b.top >= -0.5 && b.bottom <= window.innerHeight + 0.5 && b.left >= -0.5 && b.right <= window.innerWidth + 0.5);
    return { ticket: inside[0] as boolean, bar: inside[1] as boolean, btn: inside[2] as boolean, h: window.innerHeight };
  });
  if (!r) return;
  if (!r.ticket || !r.bar || !r.btn) fail(`${label}: decision ticket and commit bar are not both in view (ticket ${r.ticket}, bar ${r.bar}, button ${r.btn})`);
}

export const SIZES = [[360, 640], [390, 844], [1440, 900]] as const;

/** Captures a participant page at the three required sizes and runs the layout checks. */
export async function snapPlay(page: Page, name: string): Promise<void> {
  const base = page.viewportSize() ?? { width: 390, height: 844 };
  for (const [w, hgt] of SIZES) {
    await page.setViewportSize({ width: w, height: hgt });
    await page.waitForTimeout(150);
    await shot(page, name);
    await checkPhone(page, `${name} ${w}x${hgt}`);
    await checkDeskFit(page, `${name} ${w}x${hgt}`);
    await checkCharts(page, `${name} ${w}x${hgt}`);
  }
  await page.setViewportSize(base);
}

/** Presses Tab until the focused element matches `selector`. Keyboard-only navigation. */
export async function tabTo(page: Page, selector: string, what: string, text = '', max = 80): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(([sel, t]) => (document.activeElement?.matches(sel as string) ?? false) && (document.activeElement?.textContent ?? '').includes(t as string), [selector, text])) return true;
    await page.keyboard.press('Tab');
  }
  fail(`keyboard: could not reach ${what}`);
  return false;
}


/** Loads the rules, clears the emulator, starts the Vite dev server against the emulators, runs `body`, then stops the server. */
export async function withDevServer(body: () => Promise<void>): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await loadRules();
  await adminSet('', null);
  const vite: ChildProcess = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    env: { ...process.env, VITE_USE_EMULATOR: '1' },
    stdio: 'ignore',
    detached: true,
  });
  try {
    await waitServer();
    await body();
  } catch (e) {
    fail(`run aborted: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  } finally {
    // npx starts Vite as a child process, so stop the whole group.
    if (vite.pid) process.kill(-vite.pid, 'SIGTERM');
  }
}

/** Ends the run: prints the summary and exits non-zero if any check failed. */
export function finish(): never {
  console.log(failures.length === 0 ? 'All checks passed.' : `${failures.length} check(s) failed.`);
  process.exit(failures.length === 0 ? 0 : 1);
}

/** Starts the dev server and a Chromium browser, runs `body`, cleans up and exits. */
export async function runWithStack(body: (browser: Browser) => Promise<void>): Promise<never> {
  await withDevServer(async () => {
    const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
    try {
      await body(browser);
    } finally {
      await browser.close();
    }
  });
  return finish();
}

/** Logs console and page errors of `page` as failures, apart from the deliberate ones named in `ignore`. */
export function watchPage(page: Page, who: string, ignore: RegExp[] = []): Page {
  blockOutside(page, who);
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = `${m.text()} ${m.location().url}`;
    if (ignore.some((re) => re.test(text))) return;
    fail(`${who}: console error: ${m.text()} (${m.location().url})`);
  });
  page.on('pageerror', (e) => fail(`${who}: page error: ${e.message}`));
  return page;
}

/** Spec §18.8: every request a page makes must stay on the local machine (the dev server and the emulators). */
export function blockOutside(page: Page, who: string): void {
  page.on('request', (r) => {
    let u: URL;
    try {
      u = new URL(r.url());
    } catch {
      return;
    }
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:' || u.hostname === '127.0.0.1' || u.hostname === 'localhost') return;
    fail(`${who}: request to an outside host: ${u.origin}`);
  });
}
