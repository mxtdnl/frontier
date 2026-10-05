import { forwardRef, useImperativeHandle, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

export interface CommandLineHandle {
  focus: (initial?: string) => void;
  isFocused: () => boolean;
  clear: () => void;
}

interface Props {
  onSubmit: (value: string) => void;
  onEscape: () => void;
}

/** Terminal-style command entry shown as `[input] <GO>`, visible in the top bar only while it has focus (spec §14.1). */
export const CommandLine = forwardRef<CommandLineHandle, Props>(function CommandLine({ onSubmit, onEscape }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useImperativeHandle(ref, () => ({
    focus: (initial) => {
      if (initial !== undefined) setValue(initial);
      input.current?.focus();
    },
    isFocused: () => document.activeElement === input.current,
    clear: () => {
      setValue('');
      input.current?.blur();
    },
  }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(value);
    setValue('');
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setValue('');
      input.current?.blur();
      onEscape();
    }
  };

  return (
    <form className="cmd" onSubmit={submit} role="search" aria-label="Command line">
      <label htmlFor="cmd-input" className="sr-only">Command</label>
      <input
        id="cmd-input"
        ref={input}
        className="cmd-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={key}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={24}
        aria-describedby="cmd-hint"
      />
      <button type="submit" className="cmd-go" aria-label="Go">
        {'<GO>'}
      </button>
      <span id="cmd-hint" className="sr-only">
        Enter BOARD, TRST, PACT, WIRE, FIRM followed by a ticker, or HELP.
      </span>
    </form>
  );
});
