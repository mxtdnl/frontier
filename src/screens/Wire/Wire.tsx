import { useEffect, useMemo, useState } from 'react';
import { useRoute } from '../../router';
import { useFirms, usePacts, usePublic, useRounds, useWire } from '../../state';
import { useEngine, useMeta } from '../../state/facilitator';
import { Panel } from '../../ui/components';
import { fmtTime } from '../../ui/format';
import { FacilitatorGate } from '../Auth/FacilitatorGate';
import { copyText, groupLabel, notOnWire, quarterRange, tickerMap, wireGroups, type OffWireLine, type Selection, type WireGroup, type WireLine } from './model';

/**
 * `#/wire` (spec §14.2, Session 18): the full wire log for the facilitator, on a second laptop or tab while `#/control`
 * stays open. It only reads: nothing here writes to the database.
 */
export function Wire() {
  const { segments } = useRoute();
  const g = segments[1] ?? null;
  if (!g) {
    return (
      <div className="page stack">
        <p className="notice err" role="alert">No session in the address. Open the wire log from the control console.</p>
        <a href="#/new">NEW SESSION</a>
      </div>
    );
  }
  return <FacilitatorGate>{() => <LiveWire g={g} />}</FacilitatorGate>;
}

const TONE_CLASS = { down: 't-down', up: 't-up', wire: 't-wire' } as const;
const time = (at: number): string => fmtTime(new Date(at));

function LiveWire({ g }: { g: string }) {
  const pubSub = usePublic(g);
  const metaSub = useMeta(g);
  const rounds = useRounds(g).data;
  const wire = useWire(g).data;
  const firms = useFirms(g).data;
  const pacts = usePacts(g).data;
  const engine = useEngine(g).data;
  const pub = pubSub.data;
  const current = pub?.round ?? 0;

  const groups = useMemo(() => wireGroups(rounds, wire), [rounds, wire]);
  const range = quarterRange(groups, current);
  const [sel, setSel] = useState<Selection | null>(null);
  // The selector opens on the current quarter, once it is known.
  const selection: Selection = sel ?? current;
  const [field, setField] = useState('');
  const [notice, setNotice] = useState('');

  const tickers = useMemo(() => tickerMap(firms), [firms]);
  const pactNames = useMemo(() => Object.fromEntries(Object.values(pacts).map((p) => [p.id, p.name])), [pacts]);
  const off = useMemo(() => {
    const history = engine?.history ?? [];
    const cache = new Map<number, OffWireLine[]>();
    return (round: number): OffWireLine[] => {
      if (!cache.has(round)) cache.set(round, notOnWire(history, round, tickers, pactNames));
      return cache.get(round) ?? [];
    };
  }, [engine, tickers, pactNames]);

  const step = (d: number): void => {
    const base = selection === 'all' ? current : selection;
    const next = Math.min(range[range.length - 1] ?? 0, Math.max(0, base + d));
    setSel(next);
    setField('');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (pubSub.error || metaSub.error) {
    return (
      <div className="page stack">
        <p className="notice err" role="alert">This session cannot be read. It belongs to another account, or the address is wrong. Open the wire log from the control console.</p>
      </div>
    );
  }
  if (!pub || !metaSub.data) {
    return (
      <div className="page stack">
        <p className="dim" role="status">{pubSub.loading || metaSub.loading ? 'Loading session.' : 'No session at this address. Check the link.'}</p>
      </div>
    );
  }
  const meta = metaSub.data;
  const shown: number[] = selection === 'all' ? [...range].reverse() : [selection];
  // NOT ON THE WIRE exists only for resolved quarters (an open or discarded quarter has no history).
  const resolved = engine?.round ?? 0;
  const copy = (): void => {
    const text = copyText(selection, groups, off, time, `${meta.title} · code ${meta.code}`, resolved);
    navigator.clipboard.writeText(text).then(
      () => setNotice(`Copied ${selection === 'all' ? 'every quarter' : groupLabel(selection)} as plain text.`),
      () => setNotice('Copy failed: the browser refused clipboard access. Select the log and copy it with Ctrl+C.'),
    );
  };
  const goField = (): void => {
    const n = Number(field.trim().toUpperCase() === 'PRE' ? 0 : field);
    if (!Number.isInteger(n) || n < 0 || n > (range[range.length - 1] ?? 0)) {
      setNotice(`Enter a quarter from 0 (PRE) to ${range[range.length - 1] ?? 0}.`);
      return;
    }
    setNotice('');
    setSel(n);
  };

  return (
    <div className="page stack wire-page">
      <header className="row">
        <h1 className="signal">WIRE</h1>
        <span className="dim">{meta.title} · code {meta.code}</span>
        <a href={`#/control/${g}`}>CONTROL</a>
        <span className="dim">{pub.phase.toUpperCase()} · {groupLabel(current)}</span>
      </header>
      <div className="row wire-select" role="group" aria-label="Quarter">
        <button type="button" className="btn" aria-label="Previous quarter" onClick={() => step(-1)} disabled={selection !== 'all' && selection <= 0}>◄</button>
        <span className="wire-sel-label" data-wire-selection={selection === 'all' ? 'all' : String(selection)} aria-live="polite">
          {selection === 'all' ? 'ALL' : groupLabel(selection)}
        </span>
        <button type="button" className="btn" aria-label="Next quarter" onClick={() => step(1)} disabled={selection !== 'all' && selection >= (range[range.length - 1] ?? 0)}>►</button>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            goField();
          }}
        >
          <label className="field">
            <span className="sr-only">Quarter number</span>
            <input type="text" inputMode="numeric" size={4} placeholder="Q no." value={field} onChange={(e) => setField(e.target.value)} aria-label="Quarter number" />
          </label>
          <button type="submit" className="btn">GO</button>
        </form>
        <button type="button" className="btn" aria-pressed={selection === 'all'} onClick={() => setSel('all')}>ALL</button>
        <button type="button" className="btn btn-signal" onClick={copy}>COPY</button>
        <span className="dim">◄ ► or the arrow keys step one quarter.</span>
      </div>
      <div role="status" aria-live="polite">{notice ? <p className="notice">{notice}</p> : null}</div>
      <Panel title={selection === 'all' ? 'WIRE LOG · ALL QUARTERS' : `WIRE LOG · ${groupLabel(selection)}`} bodyClassName="pad wire-scroll">
        <div data-wire-log="">
          {shown.map((r) => (
            <QuarterBlock key={r} round={r} group={groups.find((x) => x.round === r)} off={r > 0 && r <= resolved ? off(r) : null} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Line({ l }: { l: WireLine }) {
  return (
    <li className="wire-line" data-wire-line="">
      <span className="dim wl-q">{groupLabel(l.round)}</span>
      <span className="dim wl-t">{l.at !== null ? time(l.at) : '--:--:--'}</span>
      <span className={`wl-k ${TONE_CLASS[l.tone]}`}>{l.tone === 'down' ? '▼ ' : l.tone === 'up' ? '▲ ' : ''}{l.kind}</span>
      <span className={TONE_CLASS[l.tone]}>{l.text}</span>
    </li>
  );
}

function QuarterBlock({ round, group, off }: { round: number; group: WireGroup | undefined; off: OffWireLine[] | null }) {
  return (
    <section className="wire-quarter" data-wire-quarter={round}>
      <h2 className="wire-q-head">{groupLabel(round)}</h2>
      {group && group.lines.length > 0 ? (
        <ul className="wire-list">
          {group.lines.map((l, i) => (
            <Line key={i} l={l} />
          ))}
        </ul>
      ) : (
        <p className="dim">No wire entries.</p>
      )}
      {off ? (
        <div className="wire-off" data-not-on-wire={round}>
          <h3 className="dim">NOT ON THE WIRE · facilitator only</h3>
          {off.length === 0 ? (
            <p className="dim">Nothing left out.</p>
          ) : (
            <ul className="wire-list">
              {off.map((l, i) => (
                <li key={i} className="wire-line">
                  <span className="dim wl-q">{groupLabel(l.round)}</span>
                  <span className={`wl-k ${TONE_CLASS[l.tone]}`}>{l.tone === 'down' ? '▼ ' : l.tone === 'up' ? '▲ ' : ''}{l.kind}</span>
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
