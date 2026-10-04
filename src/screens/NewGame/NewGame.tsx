import { useState } from 'react';
import { getFirebase } from '../../firebase/init';
import { createSession, MAX_FIRMS_BY_MODE } from '../../firebase/orchestrator';
import type { SessionMode } from '../../firebase/schema';
import { navigate } from '../../router';
import { Panel } from '../../ui/components';
import { useLitRoom } from '../../ui/litRoom';
import { FacilitatorGate } from '../Auth/FacilitatorGate';

type EndMode = 'random' | 'fixed' | 'manual';
const POLICIES = ['cautious', 'standard', 'greedy', 'mimic-leader'] as const;

/** Setup form for the settings in spec §5.4. Create writes the session and opens its lobby. */
export function NewGame() {
  return <FacilitatorGate>{(uid) => <NewGameForm uid={uid} />}</FacilitatorGate>;
}

function NewGameForm({ uid }: { uid: string }) {
  const [mode, setMode] = useState<SessionMode>('team');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(120);
  const [auto, setAuto] = useState(false);
  const [endMode, setEndMode] = useState<EndMode>('random');
  const [minEnd, setMinEnd] = useState(10);
  const [maxEnd, setMaxEnd] = useState(14);
  const [fixedEnd, setFixedEnd] = useState(12);
  const [disclosure, setDisclosure] = useState(false);
  const [auditP, setAuditP] = useState(0.25);
  const [bots, setBots] = useState<Array<(typeof POLICIES)[number]>>([]);
  const [revealTau, setRevealTau] = useState(false);
  const [lit, setLit] = useState(false);
  const [seedMode, setSeedMode] = useState<'random' | 'fixed'>('random');
  const [seed, setSeed] = useState('');
  useLitRoom(lit);

  const maxOk = maxEnd <= 30 && minEnd <= maxEnd && minEnd >= 1;
  const maxFirms = MAX_FIRMS_BY_MODE[mode];
  const botsOk = bots.length <= maxFirms;
  const valid = timer >= 10 && maxOk && botsOk && auditP >= 0 && auditP <= 1 && (seedMode === 'random' || seed.trim() !== '');

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
          if (!valid || busy) return;
          setBusy(true);
          setError('');
          createSession(getFirebase().db, uid, {
            mode,
            timerSec: timer,
            autoResolve: auto,
            endMode,
            minEnd,
            maxEnd,
            fixedEnd,
            disclosure,
            autoAuditP: auditP,
            revealThreshold: revealTau,
            litRoom: lit,
            bots,
            seed: seedMode === 'fixed' ? seed : '',
          }).then(
            ({ gameId }) => navigate(`#/screen/${gameId}`),
            (err: unknown) => {
              setBusy(false);
              setError(`The session could not be created${err instanceof Error ? ` (${err.message})` : ''}. Check the connection and try again.`);
            },
          );
        }}
      >
        <Panel title="MODE" bodyClassName="pad">
          <fieldset className="stack">
            <legend className="dim">Mode</legend>
            <label className="field check">
              <input type="radio" name="mode" checked={mode === 'team'} onChange={() => setMode('team')} />
              <span>Team mode: 2 to {MAX_FIRMS_BY_MODE.team} firms, 1 to 5 devices per firm</span>
            </label>
            <label className="field check">
              <input type="radio" name="mode" checked={mode === 'multiplayer'} onChange={() => setMode('multiplayer')} />
              <span>Multiplayer mode: 2 to {MAX_FIRMS_BY_MODE.multiplayer} firms, one person each</span>
            </label>
            <p className="dim">
              {mode === 'team'
                ? 'Teams share a firm: one person founds it and teammates join with its PIN.'
                : 'Each person founds a firm. The PIN lets them rejoin from another device. Above 16 firms the board shows pages of 10.'}
            </p>
          </fieldset>
        </Panel>

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

        <Panel title="BOT FIRMS" right={`${bots.length}/${maxFirms}`} bodyClassName="pad">
          <div className="stack">
            <div className="row">
              {bots.map((p, i) => (
                <label key={i} className="field">
                  <span>Bot {i + 1}</span>
                  <select
                    value={p}
                    onChange={(e) => setBots(bots.map((x, j) => (j === i ? (e.target.value as (typeof POLICIES)[number]) : x)))}
                  >
                    {POLICIES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={() => setBots([...bots, 'standard'])} disabled={bots.length >= maxFirms}>Add bot firm</button>
              <button
                type="button"
                className="btn"
                onClick={() => setBots([...bots, ...Array.from({ length: Math.min(10, maxFirms - bots.length) }, (_, i) => POLICIES[(bots.length + i) % POLICIES.length] ?? 'standard')])}
                disabled={bots.length >= maxFirms}
              >
                Add 10 mixed
              </button>
              <button type="button" className="btn" onClick={() => setBots(bots.slice(0, -1))} disabled={bots.length === 0}>Remove last</button>
            </div>
            {!botsOk ? (
              <p className="notice err" role="alert">
                {bots.length} bot firms is above the {maxFirms}-firm limit for this mode. Remove {bots.length - maxFirms}, or choose multiplayer mode.
              </p>
            ) : null}
          </div>
        </Panel>

        <div>
          <button type="submit" className="btn btn-signal" disabled={!valid || busy}>Create session</button>
          <div role="alert">{error ? <p className="notice err">{error}</p> : null}</div>
        </div>
      </form>
    </div>
  );
}
