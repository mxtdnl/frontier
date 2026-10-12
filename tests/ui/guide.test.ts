/**
 * Facilitator guide (Session 19 Part E): docs/facilitator-guide/guide.html and its committed PDF.
 * The guide must not go stale the way the briefing deck's card list did: every card, route and key appears in it.
 * Rendering is checked by `npm run guide:pdf` (Chromium is not available in CI); this test checks the committed output.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findViolations } from '../../scripts/lib/copy-rules';
import { GUIDE_MAX_BYTES, GUIDE_PAGES, pdfPageCount } from '../../scripts/lib/guide';
import { CARDS } from '../../src/engine';
import { KEY_BINDINGS } from '../../src/ui/keys';

const DIR = 'docs/facilitator-guide';
const html = readFileSync(join(DIR, 'guide.html'), 'utf8');
const text = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

describe('the facilitator guide covers the app as built', () => {
  it('names every card', () => {
    for (const card of CARDS) expect(text, card).toMatch(new RegExp(`\\b${card}\\b`));
  });

  it('lists every route in spec §3', () => {
    const spec = readFileSync('docs/spec.md', 'utf8');
    const section = spec.slice(spec.indexOf('## 3. Roles and routes'), spec.indexOf('## 4.'));
    const routes = [...section.matchAll(/^\| `(#\/[^`]*)`/gm)].map((m) => m[1] ?? '');
    expect(routes.length).toBeGreaterThanOrEqual(8);
    for (const r of routes) expect(text, r).toContain(r);
  });

  it('lists every key with its Shift+letter alternative', () => {
    for (const b of KEY_BINDINGS) {
      expect(text, b.fKey).toMatch(new RegExp(`\\b${b.fKey}\\b`));
      expect(text, `Shift+${b.letter}`).toContain(`Shift+${b.letter}`);
    }
    expect(text).toContain('Esc');
  });

  it('lists every projector command', () => {
    for (const c of ['BOARD', 'TRST', 'PACT', 'WIRE', 'FIRM <TICKER>', 'FIRMS', 'RANKS', 'INCID', 'HELP']) expect(text, c).toContain(c);
  });
});

describe('the facilitator guide follows the copy and design rules', () => {
  it('uses no §15.2 term and no emoji (the §15.3 words are allowed: the guide is facilitator-only)', () => {
    expect(findViolations(text, { allowNonTelegraphing: true })).toEqual([]);
  });

  it('uses only colours from src/ui/tokens.css', () => {
    const tokens = new Set([...readFileSync('src/ui/tokens.css', 'utf8').matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase()));
    const used = [...html.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
    expect(used.length).toBeGreaterThan(0);
    for (const c of used) expect(tokens.has(c), c).toBe(true);
  });

  it('has no rounded corners, gradients or shadows', () => {
    expect(html).not.toMatch(/border-radius:\s*[1-9]/);
    expect(html).not.toMatch(/gradient\(|box-shadow|text-shadow|filter:\s*blur/);
  });

  it('loads nothing from the network', () => {
    expect(html).not.toMatch(/(src|href)=["']https?:/);
    expect(html).not.toMatch(/url\(['"]?https?:/);
    expect(html).not.toMatch(/@import/);
  });
});

describe('the committed guide files', () => {
  it('every image the guide shows is committed, and every committed image is used', () => {
    const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(srcs.length).toBeGreaterThan(15);
    for (const s of srcs) expect(existsSync(join(DIR, s)), s).toBe(true);
    for (const f of readdirSync(join(DIR, 'img'))) expect(srcs, f).toContain(`img/${f}`);
  });

  it('the PDF exists, has the expected page count and stays under 10 MB', () => {
    const pdf = join(DIR, 'FRONTIER-facilitator-guide.pdf');
    expect(existsSync(pdf)).toBe(true);
    const pages = pdfPageCount(readFileSync(pdf));
    expect(pages).toBeGreaterThanOrEqual(GUIDE_PAGES.min);
    expect(pages).toBeLessThanOrEqual(GUIDE_PAGES.max);
    expect(statSync(pdf).size).toBeLessThan(GUIDE_MAX_BYTES);
  });

  it('is never linked from the app or part of the build', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const f of [...walk('src'), 'index.html', 'vite.config.ts']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/facilitator-guide/);
  });
});
