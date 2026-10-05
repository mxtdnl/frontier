import { useEffect, useRef, useState } from 'react';
import { FILTER_ABOVE, filterByTicker } from '../layout';

export interface CardInfo {
  id: string;
  name: string;
  cost: number;
  effect: string;
}

interface Props {
  cards: ReadonlyArray<CardInfo>;
  value: string;
  target: string | null;
  onChange: (card: string, target: string | null) => void;
  /** Card played last quarter: not selectable now. */
  lastCard: string | null;
  /** Target of the last POACH: not selectable now. */
  lastTarget: string | null;
  /** Insolvent firms cannot play cards. */
  insolvent: boolean;
  targets: ReadonlyArray<{ ticker: string; name: string }>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Rules paragraph shown at the top of the sheet. */
  rules?: string;
}

/** Trigger plus modal sheet. POACH reveals a target list. */
export function CardPicker({ cards, value, target, onChange, lastCard, lastTarget, insolvent, targets, open, onOpen, onClose, rules }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const [query, setQuery] = useState('');
  const long = targets.length > FILTER_ABOVE;
  const shown = long ? filterByTicker(targets, query) : targets;
  const current = cards.find((c) => c.id === value);
  const needsTarget = value === 'POACH';
  const ready = !needsTarget || target !== null;

  return (
    <>
      <button type="button" className="card-trigger" onClick={onOpen} aria-haspopup="dialog">
        <span>
          Card: <strong>{value}</strong>
          {needsTarget && target ? ` to ${target}` : ''}
        </span>
        <span className="dim">{current && current.cost > 0 ? `${current.cost}` : '–'}</span>
      </button>
      <dialog ref={dlg} className="sheet" onClose={onClose} aria-label="Action card">
        <div className="sheet-head">
          <span>CARD</span>
          <span>Esc to close</span>
        </div>
        <div className="sheet-body">
          {rules ? <p className="dim">{rules}</p> : null}
          {insolvent ? <p className="notice err">Insolvent firms cannot play cards.</p> : null}
          <div role="radiogroup" aria-label="Action card" className="stack" style={{ gap: '0.5lh' }}>
            {cards.map((c) => {
              const blocked = insolvent ? c.id !== 'NONE' : c.id !== 'NONE' && c.id === lastCard;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  className="card-opt"
                  aria-checked={c.id === value}
                  aria-disabled={blocked}
                  onClick={() => {
                    if (!blocked) onChange(c.id, c.id === 'POACH' ? target : null);
                  }}
                >
                  <strong>{c.id}</strong>
                  <span>
                    {c.name}
                    <br />
                    <span className="dim">{c.effect}</span>
                    {blocked && !insolvent ? (
                      <>
                        <br />
                        <span className="dim">Played last quarter. Not available.</span>
                      </>
                    ) : null}
                  </span>
                  <span className="cost">{c.cost > 0 ? c.cost : '–'}</span>
                </button>
              );
            })}
          </div>
          {needsTarget ? (
            <div className="stack" style={{ gap: '0.5lh' }}>
              <span className="dim">TARGET · not the same target two quarters running</span>
              {long ? (
                <div className="field">
                  <label htmlFor="poach-filter">Find a target by ticker</label>
                  <input
                    id="poach-filter"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={6}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <span className="dim" role="status">
                    {shown.length} of {targets.length} firms shown{target ? ` · selected ${target}` : ''}
                  </span>
                </div>
              ) : null}
              <div className={`target-list${long ? ' is-long' : ''}`} role="radiogroup" aria-label="Poach target">
                {shown.length === 0 ? <span className="dim">No ticker contains those letters.</span> : null}
                {shown.map((t) => {
                  const blocked = t.ticker === lastTarget;
                  return (
                    <button
                      key={t.ticker}
                      type="button"
                      role="radio"
                      aria-checked={t.ticker === target}
                      aria-disabled={blocked}
                      title={blocked ? 'Targeted last quarter' : t.name}
                      onClick={() => {
                        if (!blocked) onChange('POACH', t.ticker);
                      }}
                    >
                      {t.ticker}
                    </button>
                  );
                })}
              </div>
              {target === null ? <span className="dim">Select a target to use this card.</span> : null}
            </div>
          ) : null}
          <button type="button" className="btn btn-signal btn-block" disabled={!ready} onClick={onClose}>
            Done
          </button>
        </div>
      </dialog>
    </>
  );
}
