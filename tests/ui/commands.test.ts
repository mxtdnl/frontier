import { describe, expect, it } from 'vitest';
import { COMMAND_HELP, parseCommand } from '../../src/ui/commands';

describe('parseCommand', () => {
  it('parses the fixed mnemonics, ignoring case and <GO>', () => {
    expect(parseCommand('board')).toEqual({ kind: 'board' });
    expect(parseCommand('TRST <GO>')).toEqual({ kind: 'trust' });
    expect(parseCommand(' pact ')).toEqual({ kind: 'pacts' });
    expect(parseCommand('Wire')).toEqual({ kind: 'wire' });
    expect(parseCommand('help')).toEqual({ kind: 'help' });
  });
  it('parses FIRMS and RANKS as their own commands, distinct from FIRM <TICKER> (Session 13)', () => {
    expect(parseCommand('firms')).toEqual({ kind: 'firms' });
    expect(parseCommand('RANKS <GO>')).toEqual({ kind: 'ranks' });
    expect(parseCommand('firm firms')).toEqual({ kind: 'firm', ticker: 'FIRMS' });
  });
  it('lists every command in HELP', () => {
    expect(COMMAND_HELP.map((c) => c.mnemonic)).toEqual(['BOARD', 'TRST', 'PACT', 'WIRE', 'FIRM <TICKER>', 'FIRMS', 'RANKS', 'HELP']);
  });
  it('treats empty input as the board', () => {
    expect(parseCommand('   ')).toEqual({ kind: 'board' });
  });
  it('parses FIRM with a ticker', () => {
    expect(parseCommand('firm arcn')).toEqual({ kind: 'firm', ticker: 'ARCN' });
    expect(parseCommand('FIRM  DOLM <GO>')).toEqual({ kind: 'firm', ticker: 'DOLM' });
  });
  it('rejects FIRM without a valid ticker', () => {
    expect(parseCommand('FIRM').kind).toBe('error');
    expect(parseCommand('FIRM AB').kind).toBe('error');
    expect(parseCommand('FIRM ARCN1').kind).toBe('error');
  });
  it('reports unknown commands with the next step', () => {
    const c = parseCommand('xyz');
    expect(c.kind).toBe('error');
    if (c.kind === 'error') expect(c.message).toContain('HELP');
  });
});
