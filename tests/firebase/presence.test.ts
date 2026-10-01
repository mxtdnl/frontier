import { describe, expect, it } from 'vitest';
import { remainingMs, serverNow } from '../../src/firebase/presence';

describe('server time', () => {
  it('adds the server offset to the local clock', () => {
    expect(serverNow(250, 1_000)).toBe(1_250);
    expect(serverNow(-400, 1_000)).toBe(600);
  });

  it('counts down to the server deadline, never below zero', () => {
    expect(remainingMs(10_000, 0, 4_000)).toBe(6_000);
    expect(remainingMs(10_000, 2_000, 4_000)).toBe(4_000);
    expect(remainingMs(10_000, 0, 12_000)).toBe(0);
    expect(remainingMs(null, 0, 0)).toBeNull();
  });
});
