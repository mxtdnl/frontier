import { describe, expect, it } from 'vitest';
import {
  cleanCode,
  cleanInitials,
  cleanPin,
  cleanTicker,
  isValidCode,
  normaliseName,
  validateName,
  validatePin,
  validateTicker,
} from '../../src/screens/Join/validate';

describe('join code', () => {
  it('keeps four upper-case letters', () => {
    expect(cleanCode('kx-mt9z')).toBe('KXMT');
    expect(cleanCode('ab')).toBe('AB');
  });
  it('accepts A–Z without I and O only', () => {
    expect(isValidCode('KXMT')).toBe(true);
    expect(isValidCode('KXMI')).toBe(false);
    expect(isValidCode('KXMO')).toBe(false);
    expect(isValidCode('KXM')).toBe(false);
  });
});

describe('firm name', () => {
  it('needs 2 to 20 characters after trimming', () => {
    expect(validateName('A')).not.toBeNull();
    expect(validateName('  A  ')).not.toBeNull();
    expect(validateName('AB')).toBeNull();
    expect(validateName('x'.repeat(20))).toBeNull();
    expect(validateName('x'.repeat(21))).not.toBeNull();
  });
  it('collapses whitespace', () => {
    expect(normaliseName('  Halden   Labs ')).toBe('Halden Labs');
  });
});

describe('ticker', () => {
  it('is 3 to 6 letters A–Z, upper case', () => {
    expect(cleanTicker('ab1c-d')).toBe('ABCD');
    expect(cleanTicker('abcdefgh')).toBe('ABCDEF');
    expect(validateTicker('AB', [])).not.toBeNull();
    expect(validateTicker('ABC', [])).toBeNull();
    expect(validateTicker('ABCDEF', [])).toBeNull();
  });
  it('rejects a ticker already in the session', () => {
    expect(validateTicker('ARCN', ['ARCN', 'BRLK'])).toMatch(/already uses/);
    expect(validateTicker('HELX', ['ARCN'])).toBeNull();
  });
});

describe('PIN and initials', () => {
  it('keeps four digits', () => {
    expect(cleanPin('12a34 5')).toBe('1234');
    expect(validatePin('0420')).toBeNull();
    expect(validatePin('042')).not.toBeNull();
  });
  it('limits initials to four upper-case letters or digits', () => {
    expect(cleanInitials('ab c-d9')).toBe('ABCD');
  });
});
