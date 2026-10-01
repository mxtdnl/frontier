/**
 * Seeded randomness (spec §6.8). The only source of randomness in the engine.
 * rng = mulberry32(hash(gameSeed, round, stream)).
 */

export type Stream = 'setup' | 'incident' | 'headline' | 'audit' | 'bot';

export type Rng = () => number;

/** mulberry32: a 32-bit generator returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the UTF-16 code units, finished with the murmur3 avalanche step. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function seedFor(gameSeed: number, round: number, stream: Stream): number {
  return hash32(`${gameSeed >>> 0}|${round}|${stream}`);
}

/** A fresh generator for one (game, round, stream) triple. */
export function streamRng(gameSeed: number, round: number, stream: Stream): Rng {
  return mulberry32(seedFor(gameSeed, round, stream));
}

/** Uniform integer in [min, max], inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Uniformly chosen element of a non-empty list. */
export function pick<T>(rng: Rng, items: ReadonlyArray<T>): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('pick: empty list');
  return item;
}
