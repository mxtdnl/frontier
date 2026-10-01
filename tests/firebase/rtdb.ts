/**
 * Mimics what the Realtime Database does to a value on a write and a later read:
 * nulls and empty objects or arrays vanish, arrays are stored as numeric-keyed objects,
 * and on read an object whose keys are all integers comes back as an array when more
 * than half of the slots from 0 to the largest key are filled.
 * (Firebase docs, "Best practices for arrays"; checked against the emulator in
 * tests/emulator/api.test.ts.)
 */
export function storeAndRead(v: unknown): unknown {
  return readBack(store(v));
}

function store(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return v;
  const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v);
  const out: Record<string, unknown> = {};
  for (const [k, x] of entries) {
    const s = store(x);
    if (s !== null) out[k] = s;
  }
  return Object.keys(out).length ? out : null;
}

function readBack(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  const children = Object.fromEntries(keys.map((k) => [k, readBack(o[k])]));
  if (keys.length && keys.every((k) => /^(0|[1-9]\d*)$/.test(k))) {
    const max = Math.max(...keys.map(Number));
    if (keys.length * 2 > max + 1) {
      const a: unknown[] = new Array(max + 1);
      for (const k of keys) a[Number(k)] = children[k];
      return a;
    }
  }
  return children;
}
