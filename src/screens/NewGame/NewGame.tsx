import { useState } from 'react';
import { navigate } from '../../router';
import { Panel } from '../../ui/components';
import { useLitRoom } from '../../ui/litRoom';

type EndMode = 'random' | 'fixed' | 'manual';
const POLICIES = ['cautious', 'standard', 'greedy', 'mimic-leader'] as const;

/** Setup form for the settings in spec §5.4. Static in this build: Create opens the lobby preview. */
export function NewGame() {
  const [timer, setTimer] = useState(120);
  const [auto, setAuto] = useState(false);
  const [endMode, setEndMode] = useState<EndMode>('random');
  const [minEnd, setMinEnd] = useState(10);
  const [maxEnd, setMaxEnd] = useState(14);
  const [fixedEnd, setFixedEnd] = useState(12);
  const [disclosure, setDisclosure] = useState(false);
  const [auditP, setAuditP] = useState(0.25);
  const [bots, setBots] = useState<string[]>([]);
  const [revealTau, setRevealTau] = useState(false);
  const [lit, setLit] = useState(false);
  const [seedMode, setSeedMode] = useState<'random' | 'fixed'>('random');
  const [seed, setSeed] = useState('');
  useLitRoom(lit);

  const maxOk = maxEnd <= 30 && minEnd <= maxEnd && minEnd >= 1;
  const valid = timer >= 10 && maxOk && auditP >= 0 && auditP <= 1 && (seedMode === 'random' || seed.trim() !== '');

  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(Number(e.target.value));

  return (
    <div className="page stack">
      <header className="row">
        <h1 className="signal">NEW SESSION</h1>
        <span className="dim">Settings stay editable until quarter 1.</span>
      </header>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) navigate('#/screen/demo?state=lobby');
        }}
      >
        <div className="cols-2">
          <Panel title="TIMING" bodyClassName="pad">
            <div className="stack">
              <label className="field">
                <span>Round timer (s)</span>
                <input type="number" min={10} step={10} value={timer} onChange={num(setTimer)} />
              </label>
              <label className="field check">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                <span>Auto-resolve at deadline</span>
              </label>
              <p className="dim">{auto ? 'Resolves when the timer reaches zero.' : 'Submissions lock at the deadline. Press F9 to resolve.'}</p>
            </div>
          </Panel>

          <Panel title="END" bodyClassName="pad">
            <fieldset className="stack">
              <legend className="dim">End mode</legend>
              {(['random', 'fixed', 'manual'] as const).map((m) => (
                <label key={m} className="field check">
                  <input type="radio" name="endmode" checked={endMode === m} onChange={() => setEndMode(m)} />
                  <span>{m === 'random' ? 'Random within a range' : m === 'fixed' ? 'Fixed quarter' : 'Manual (stops at 30)'}</span>
                </label>
              ))}
              {endMode === 'random' ? (
                <div className="row">
                  <label className="field"><span>Earliest</span><input type="number" min={1} max={30} value={minEnd} onChange={num(setMinEnd)} /></label>
                  <label className="field"><span>Latest</span><input type="number" min={1} max={30} value={maxEnd} onChange={num(setMaxEnd)} /></label>
                </div>
              ) : null}
              {endMode === 'fixed' ? (
                <label className="field"><span>Quarter</span><input type="number" min={1} max={30} value={fixedEnd} onChange={num(setFixedEnd)} /></label>
              ) : null}
              {!maxOk ? <p className="notice err" role="alert">Range must sit between 1 and 30, earliest not after latest. Adjust the two values.</p> : null}
            </fieldset>
          </Panel>

          <Panel title="RULES" bodyClassName="pad">
            <div className="stack">
              <label className="field check">
                <input type="checkbox" checked={disclosure} onChange={(e) => setDisclosure(e.target.checked)} />
                <span>Disclosure at start</span>
              </label>
              <label className="field">
                <span>Automatic audit probability per pact per quarter</span>
                <input type="number" min={0} max={1} step={0.05} value={auditP} onChange={num(setAuditP)} />
              </label>
              <label className="field check">
                <input type="checkbox" checked={revealTau} onChange={(e) => setRevealTau(e.target.checked)} />
                <span>Reveal TAU line on results screen</span>
              </label>
            </div>
          </Panel>

          <Panel title="DISPLAY AND SEED" bodyClassName="pad">
            <div className="stack">
              <label className="field check">
                <input type="checkbox" checked={lit} onChange={(e) => setLit(e.target.checked)} />
                <span>Lit-room display mode</span>
              </label>
              <fieldset className="stack">
                <legend className="dim">Seed</legend>
                <label className="field check">
                  <input type="radio" name="seed" checked={seedMode === 'random'} onChange={() => setSeedMode('random')} />
                  <span>Random</span>
                </label>
                <label className="field check">
                  <input type="radio" name="seed" checked={seedMode === 'fixed'} onChange={() => setSeedMode('fixed')} />
                  <span>Fixed, for rehearsal</span>
                </label>
                {seedMode === 'fixed' ? (
                  <label className="field"><span>Seed value</span><input type="text" value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={24} /></label>
                ) : null}
              </fieldset>
            </div>
          </Panel>
        </div>

        <Panel title="BOT FIRMS" right={`${bots.length}`} bodyClassName="pad">
          <div className="stack">
            <div className="row">
              {bots.map((p, i) => (
                <label key={i} className="field">
                  <span>Bot {i + 1}</span>
                  <select
                    value={p}
                    onChange={(e) => setBots(bots.map((x, j) => (j === i ? e.target.value : x)))}
                  >
                    {POLICIES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={() => setBots([...bots, 'standard'])} disabled={bots.length >= 12}>Add bot firm</button>
              <button type="button" className="btn" onClick={() => setBots(bots.slice(0, -1))} disabled={bots.length === 0}>Remove last</button>
            </div>
          </div>
        </Panel>

        <div>
          <button type="submit" className="btn btn-signal" disabled={!valid}>Create session</button>
        </div>
      </form>
    </div>
  );
}
