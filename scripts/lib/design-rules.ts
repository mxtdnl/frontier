/** Design lint rules (spec §16.1, §16.4, CLAUDE.md design rules). */

export interface DesignViolation {
  line: number;
  detail: string;
}

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FORBIDDEN_CSS: ReadonlyArray<[RegExp, string]> = [
  [/gradient\(/i, 'gradient'],
  [/drop-shadow\(/i, 'drop-shadow'],
  [/(?:backdrop-)?filter\s*:\s*[^;]*blur\(/i, 'blur'],
  [/backdrop-filter/i, 'backdrop-filter'],
];

/** Hex colour values are allowed only in tokens.css. */
export function findHex(text: string): DesignViolation[] {
  const out: DesignViolation[] = [];
  text.split('\n').forEach((l, i) => {
    // Ignore fragment identifiers such as href="#/screen" (no hex digits only form).
    const m = HEX.exec(l.replace(/href=["']#[^"']*["']/g, ''));
    if (m && !/^#\d+\b/.test(m[0] ?? '')) out.push({ line: i + 1, detail: `hex colour ${m[0]}` });
  });
  return out;
}

export function findForbiddenCss(text: string): DesignViolation[] {
  const out: DesignViolation[] = [];
  text.split('\n').forEach((l, i) => {
    for (const [re, name] of FORBIDDEN_CSS) {
      if (re.test(l)) out.push({ line: i + 1, detail: name });
    }
    for (const prop of ['box-shadow', 'text-shadow']) {
      const m = new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i').exec(l);
      if (m && (m[1] ?? '').trim() !== 'none') out.push({ line: i + 1, detail: prop });
    }
    const radius = /border-radius\s*:\s*([^;]+)/i.exec(l);
    if (radius) {
      const values = (radius[1] ?? '').trim().split(/\s+/);
      const ok = values.every((v) => /^0(px)?$/.test(v) || /^[12]px$/.test(v));
      if (!ok) out.push({ line: i + 1, detail: 'border-radius above 2px' });
    }
  });
  return out;
}
