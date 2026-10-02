/** Input cleaning and validation for the join flow (spec §5.1, §13). Pure. */
import { CODE_PATTERN } from '../../firebase/paths';

export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const TICKER_MIN = 3;
export const TICKER_MAX = 6;
export const INITIALS_MAX = 4;

/** Letters only, upper case, at most four. */
export const cleanCode = (raw: string): string => raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
export const isValidCode = (code: string): boolean => CODE_PATTERN.test(code);

export const cleanTicker = (raw: string): string => raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, TICKER_MAX);
export const cleanPin = (raw: string): string => raw.replace(/\D/g, '').slice(0, 4);
export const cleanInitials = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, INITIALS_MAX);

/** Trimmed, with runs of whitespace collapsed. */
export const normaliseName = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

export function validateName(raw: string): string | null {
  const n = normaliseName(raw);
  if (n.length < NAME_MIN || n.length > NAME_MAX) return `The firm name needs ${NAME_MIN} to ${NAME_MAX} characters.`;
  return null;
}

/** `taken` holds the tickers already in the session. */
export function validateTicker(ticker: string, taken: ReadonlyArray<string>): string | null {
  if (ticker.length < TICKER_MIN || ticker.length > TICKER_MAX) return `The ticker needs ${TICKER_MIN} to ${TICKER_MAX} letters, A to Z.`;
  if (taken.includes(ticker)) return 'Another firm already uses this ticker. Choose a different one.';
  return null;
}

export const validatePin = (pin: string): string | null => (/^[0-9]{4}$/.test(pin) ? null : 'The PIN is four digits.');
