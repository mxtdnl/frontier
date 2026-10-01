export type Command =
  | { kind: 'board' }
  | { kind: 'trust' }
  | { kind: 'pacts' }
  | { kind: 'wire' }
  | { kind: 'help' }
  | { kind: 'firm'; ticker: string }
  | { kind: 'error'; message: string };

export const COMMAND_HELP: ReadonlyArray<{ mnemonic: string; text: string }> = [
  { mnemonic: 'BOARD', text: 'Firm board' },
  { mnemonic: 'TRST', text: 'Trust history, full screen' },
  { mnemonic: 'PACT', text: 'Pact table with members and terms' },
  { mnemonic: 'WIRE', text: 'Full headline log' },
  { mnemonic: 'FIRM <TICKER>', text: 'Public profile of one firm' },
  { mnemonic: 'HELP', text: 'This list' },
];

/** Parse a command-line entry. Case-insensitive; a trailing <GO> is ignored. */
export function parseCommand(input: string): Command {
  const cleaned = input.replace(/<\s*go\s*>/gi, ' ').trim().replace(/\s+/g, ' ');
  if (cleaned === '') return { kind: 'board' };
  const [word = '', ...rest] = cleaned.toUpperCase().split(' ');
  switch (word) {
    case 'BOARD':
      return { kind: 'board' };
    case 'TRST':
      return { kind: 'trust' };
    case 'PACT':
      return { kind: 'pacts' };
    case 'WIRE':
      return { kind: 'wire' };
    case 'HELP':
      return { kind: 'help' };
    case 'FIRM': {
      const ticker = rest[0] ?? '';
      if (!/^[A-Z]{3,6}$/.test(ticker)) {
        return { kind: 'error', message: 'FIRM needs a ticker of 3 to 6 letters. Enter FIRM followed by the ticker.' };
      }
      return { kind: 'firm', ticker };
    }
    default:
      return { kind: 'error', message: `${word} is not a command. Enter HELP for the list.` };
  }
}
