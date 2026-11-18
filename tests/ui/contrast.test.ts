import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/tokens.css', 'utf8');

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1] as string] = m[2] as string;
  return out;
}
const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const litBlock = /\.lit-room\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const base = tokens(rootBlock);
const lit = { ...base, ...tokens(litBlock) };

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('WCAG AA contrast (spec §16.6)', () => {
  const pairs: Array<[string, string]> = [
    ['text', 'base'], ['text', 'panel'], ['dim', 'base'], ['dim', 'panel'],
    ['signal', 'base'], ['signal', 'panel'], ['wire', 'base'], ['wire', 'panel'],
    ['up', 'panel'], ['down', 'panel'], ['signal-ink', 'signal'], ['signal-ink', 'wire'],
    // Tokens v2 (Session 12): header and alternate rows, and the solid phase blocks.
    ['text', 'raise'], ['dim', 'raise'], ['signal', 'raise'], ['wire', 'raise'], ['up', 'raise'], ['down', 'raise'],
    ['signal-ink', 'up'], ['signal-ink', 'text'], ['signal-ink', 'dim'],
  ];
  for (const [fg, bg] of pairs) {
    it(`${fg} on ${bg}`, () => {
      expect(ratio(base[fg] as string, base[bg] as string)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('lit-room dim on base, panel and raise', () => {
    expect(ratio(lit.dim as string, lit.base as string)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(lit.dim as string, lit.panel as string)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(lit.dim as string, lit.raise as string)).toBeGreaterThanOrEqual(4.5);
  });
  it('records the measured ratios in spec §16.6', () => {
    expect(ratio(base.dim as string, base.panel as string)).toBeCloseTo(5.67, 2);
    expect(ratio(base.dim as string, base.raise as string)).toBeCloseTo(5.18, 2);
    expect(ratio(lit.dim as string, lit.panel as string)).toBeCloseTo(8.2, 1);
  });
  it('signal-dim fails AA for text, so it is used for outlines and hatches only', () => {
    expect(ratio(base['signal-dim'] as string, base.panel as string)).toBeLessThan(4.5);
  });
  it('lit-room values stay brighter than the standard values', () => {
    for (const k of ['dim', 'rule', 'grid', 'raise']) {
      expect(lum(lit[k] as string), k).toBeGreaterThan(lum(base[k] as string));
    }
  });
  it('panels and rules separate from black better than tokens v1', () => {
    expect(ratio(base.panel as string, base.base as string)).toBeGreaterThan(1.2);
    expect(ratio(base.rule as string, base.panel as string)).toBeGreaterThan(1.4);
  });
});
