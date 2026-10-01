import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function walk(dir: string, exts: ReadonlyArray<string>): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}
