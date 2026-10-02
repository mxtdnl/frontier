import { useState } from 'react';
import { assembleExport, dataText, download, readExportParts } from '../../firebase/export';
import { getFirebase } from '../../firebase/init';
import { Panel } from '../../ui/components';

interface ExportProps {
  g: string;
  code: string;
  /** Resolved quarters; nothing to export before the first. */
  rounds: number;
  /** Server clock, for the file timestamp. */
  now: () => number;
}

/** Downloads the full history as JSON, or every DATA line as text (spec §8.4, §14.2). */
export function ExportPanel({ g, code, rounds, now }: ExportProps) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const run = async (kind: 'json' | 'data') => {
    setBusy(true);
    setNote('');
    try {
      const parts = await readExportParts(getFirebase().db, g);
      if (kind === 'json') {
        const file = assembleExport(parts, new Date(now()).toISOString());
        download(`frontier-${code}-history.json`, JSON.stringify(file, null, 2), 'application/json');
        setNote(`History saved as frontier-${code}-history.json.`);
      } else {
        const text = dataText(parts.engine);
        if (text === '') setNote('No quarter has resolved yet, so there are no DATA lines.');
        else {
          download(`frontier-${code}-data.txt`, text, 'text/plain');
          setNote(`DATA lines saved as frontier-${code}-data.txt.`);
        }
      }
    } catch {
      setNote('The export failed. Check the connection and press the button again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="EXPORT" right={`${rounds} QTR`} bodyClassName="pad">
      <div className="stack">
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => void run('json')}>
            DOWNLOAD HISTORY (.json)
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void run('data')}>
            DOWNLOAD DATA LINES (.txt)
          </button>
        </div>
        <p className="dim">
          The history file holds every quarter, every decision and the hidden values (seed, TAU, end quarter). Keep it private. The text file
          has one DATA line per firm per quarter.
        </p>
        <div role="status" aria-live="polite">{note ? <p className="notice">{note}</p> : null}</div>
      </div>
    </Panel>
  );
}

interface DangerProps {
  code: string;
  disabled: boolean;
  onDelete: () => void;
  /** Lock joins (spec §14.2): only offered in the lobby. */
  joinLocked: boolean;
  lobby: boolean;
  onJoinLock: (locked: boolean) => void;
}

/** Delete session: press once to arm, type the join code, then confirm. */
export function DangerPanel({ code, disabled, onDelete, joinLocked, lobby, onJoinLock }: DangerProps) {
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState('');
  const match = typed.trim().toUpperCase() === code;

  return (
    <Panel title="DANGER" bodyClassName="pad">
      <div className="stack">
        <div className="row">
          {lobby ? (
            <button type="button" className="btn" disabled={disabled} aria-pressed={joinLocked} onClick={() => onJoinLock(!joinLocked)}>
              {joinLocked ? 'REOPEN JOINS' : 'LOCK JOINS'}
            </button>
          ) : null}
          <span className="dim">
            {joinLocked
              ? 'Joining is locked. No firm can be founded or joined.'
              : 'Joining is open. Lock it once every team has formed; the briefing locks it in any case.'}
          </span>
        </div>
        {!armed ? (
          <div className="row">
            <button type="button" className="btn" disabled={disabled} onClick={() => setArmed(true)}>
              DELETE SESSION
            </button>
            <span className="dim">Removes the session and frees code {code}. This cannot be undone. Export first.</span>
          </div>
        ) : (
          <div className="stack">
            <p className="notice err" role="alert">
              Confirm deletion of session {code}. Every firm, decision and result is removed for everyone.
            </p>
            <label className="field">
              <span>Type {code} to confirm</span>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label={`Type ${code} to confirm deletion`}
              />
            </label>
            <div className="row">
              <button type="button" className="btn btn-signal" disabled={!match || disabled} onClick={onDelete}>
                CONFIRM DELETE
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setArmed(false);
                  setTyped('');
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
