import { useEffect, useRef, useState } from 'react';
import { CONTROL_FIRMS, HIDDEN, PACTS, ROUND } from '../../mock/fixtures';
import { DataTable, GlyphCheck, Panel, PresenceDot, Tag } from '../../ui/components';
import { quarterLabel } from '../../ui/format';

/** Held value, masked until the control is pressed. Hidden values appear only on this route. */
function HoldReveal({ label, value }: { label: string; value: string }) {
  const [held, setHeld] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      aria-pressed={held}
      aria-label={`Hold to reveal ${label}`}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      onBlur={() => setHeld(false)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setHeld(true);
        }
      }}
      onKeyUp={() => setHeld(false)}
      style={{ minWidth: '14ch' }}
    >
      {label} {held ? value : '•••'}
    </button>
  );
}

export function Control() {
  const [notice, setNotice] = useState('');
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const say = (t: string) => {
    setNotice(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(''), 4000);
  };
  const stub = (what: string) => () => say(`${what} is not connected in this preview.`);

  return (
    <div className="page stack">
      <header className="row">
        <h1 className="signal">CONTROL</h1>
        <span className="dim">Static preview. Not connected to a database.</span>
      </header>
      <div role="status" aria-live="polite">{notice ? <p className="notice">{notice}</p> : null}</div>

      <div className="cols-2">
        <Panel title="SESSION" bodyClassName="pad">
          <div className="stack">
            <div className="row"><span className="dim">PHASE</span><span>OPEN</span><span className="dim">QTR</span><span>{quarterLabel(ROUND)}</span></div>
            <div className="row">
              <button type="button" className="btn" onClick={stub('Timer')}>+30 s</button>
              <button type="button" className="btn" onClick={stub('Timer')}>{'−'}30 s</button>
              <button type="button" className="btn" onClick={stub('Timer')}>Pause</button>
            </div>
            <div className="row">
              <HoldReveal label="END" value={String(HIDDEN.endRound)} />
              <HoldReveal label="TAU" value={String(HIDDEN.tau)} />
            </div>
            <p className="dim">Hidden values show while the button is held. They never appear on the board or on participant devices.</p>
          </div>
        </Panel>

        <Panel title="CONTROLS" bodyClassName="pad">
          <div className="stack">
            <div className="row">
              <button type="button" className="btn" onClick={stub('Disclosure')}>F7 DISCL</button>
              <button type="button" className="btn" onClick={stub('Summit')}>F8 SUMMIT</button>
              <button type="button" className="btn btn-signal" onClick={stub('Advance')}>F9 ADVANCE</button>
              <button type="button" className="btn" onClick={stub('End')}>F10 END</button>
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={stub('Audit')}>F6 AUDIT</button>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="FIRMS" right="6/8 CMT" bodyClassName="pad">
        <div className="scroll-x">
          <DataTable
            caption="Firm submissions and presence"
            rows={CONTROL_FIRMS}
            rowKey={(f) => f.ticker}
            columns={[
              { key: 't', label: 'FIRM', w: 8, render: (f) => f.ticker },
              {
                key: 'p',
                label: 'PRESENCE',
                w: 20,
                render: (f) =>
                  f.members.length === 0 ? (
                    <span className="dim">none</span>
                  ) : (
                    f.members.map((m) => (
                      <span key={m.initials} style={{ marginRight: '2ch' }}>
                        <PresenceDot online={m.online} label={m.initials} /> {m.initials}
                      </span>
                    ))
                  ),
              },
              {
                key: 'c',
                label: 'CMT',
                w: 6,
                render: (f) => (f.committedAt ? <><span className="sr-only">committed</span><GlyphCheck /></> : <span className="dim">{'–'}</span>),
              },
              { key: 'at', label: 'RECEIVED', w: 11, render: (f) => f.committedAt ?? '–' },
              { key: 'a', label: 'FORECAST', w: 10, render: (f) => (f.autoForecast ? <Tag kind="AUTO" /> : '') },
              { key: 'b', label: 'BOT POLICY', w: 0, render: (f) => (f.bot ? <><Tag kind="BOT" /> {f.bot}</> : '') },
            ]}
          />
        </div>
      </Panel>

      <div className="cols-2">
        <Panel title="PACTS" bodyClassName="pad">
          <div className="scroll-x">
            <DataTable
              caption="Pacts and unaudited violations"
              rows={PACTS}
              rowKey={(p) => p.id}
              columns={[
                { key: 'id', label: 'PACT', w: 9, render: (p) => <Tag pact={p.id} /> },
                { key: 'terms', label: 'TERMS', w: 26, render: (p) => `max pace ${p.maxPace ?? '–'} · min safety ${p.minSafety ?? '–'}` },
                { key: 'm', label: 'MBRS', w: 6, align: 'r', render: (p) => p.members.length },
                { key: 'u', label: 'UNAUD', w: 7, align: 'r', render: (p) => p.unaudited },
                {
                  key: 'a',
                  label: '',
                  w: 10,
                  render: (p) => (
                    <button type="button" className="btn" onClick={stub(`Audit of ${p.id}`)}>Audit</button>
                  ),
                },
              ]}
            />
          </div>
        </Panel>

        <div className="stack">
          <Panel title="EXPORT" bodyClassName="pad">
            <div className="row">
              <button type="button" className="btn" onClick={stub('Export')}>JSON</button>
              <button type="button" className="btn" onClick={stub('Export')}>DATA lines</button>
            </div>
          </Panel>
          <Panel title="DANGER" bodyClassName="pad">
            <div className="row">
              <button type="button" className="btn" onClick={stub('Remove firm')}>Remove firm</button>
              <button type="button" className="btn" onClick={stub('Lock joins')}>Lock joins</button>
              <button type="button" className="btn" onClick={stub('Delete session')}>Delete session</button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
