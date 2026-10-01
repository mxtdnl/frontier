import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = 'src/engine';
const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
/** Source without comments, so doc comments may name the forbidden calls. */
const code = (f: string): string => readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('engine purity (CLAUDE.md architecture rules)', () => {
  it('uses no Math.random, Date.now, Firebase or DOM', () => {
    for (const f of files) {
      const src = code(f);
      expect(src, f).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now/);
      expect(src, f).not.toMatch(/from ['"]firebase|from ['"]react|\bwindow\.|\bdocument\.|localStorage/);
    }
  });

  it('has no "any" without a justifying comment', () => {
    for (const f of files) {
      const src = code(f);
      expect(src, f).not.toMatch(/:\s*any\b|as any\b/);
    }
  });
});
