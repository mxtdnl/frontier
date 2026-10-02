import { useState, type FormEvent } from 'react';
import { recallSession } from '../firebase/participant';
import { navigate } from '../router';
import { cleanCode, isValidCode } from './Join/validate';

/** `#/`: join with a code, resume, or go to the facilitator sign-in (spec §3). */
export function Index() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const resume = recallSession();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidCode(code)) {
      setError('The code is four letters, A to Z without I or O. Check it and try again.');
      return;
    }
    navigate(`#/j/${code}`);
  };

  return (
    <div className="page stack" style={{ maxWidth: '60ch' }}>
      <h1 className="signal">FRONTIER</h1>
      <form className="stack" onSubmit={submit} noValidate aria-label="Join a session">
        <div className="field">
          <label htmlFor="code">Session code</label>
          <input
            id="code"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={4}
            value={code}
            aria-describedby={error ? 'code-err' : undefined}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setCode(cleanCode(e.target.value));
              setError('');
            }}
          />
        </div>
        {error ? <p id="code-err" className="notice err" role="alert">{error}</p> : null}
        <button type="submit" className="btn btn-signal btn-block">Join a session</button>
      </form>
      {resume ? (
        <p>
          <a className="link-block" href={`#/play/${resume.gameId}`}>RESUME LAST SESSION</a> <span className="dim">· {resume.code}</span>
        </p>
      ) : null}
      <p><a className="link-block" href="#/new">FACILITATOR SIGN-IN</a></p>
    </div>
  );
}
