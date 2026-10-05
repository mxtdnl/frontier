import { useState, type FormEvent } from 'react';
import { recallSession } from '../firebase/participant';
import { navigate } from '../router';
import { CodeField, Wordmark } from '../ui/components';
import { isValidCode } from './Join/validate';

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
    <main className="page stack" style={{ maxWidth: '60ch' }}>
      <Wordmark />
      <form className="stack code-form" onSubmit={submit} noValidate aria-label="Join a session">
        <div className="field">
          <label htmlFor="code">Session code</label>
          <CodeField
            id="code"
            value={code}
            invalid={!!error}
            describedBy={error ? 'code-err' : undefined}
            onChange={(c) => {
              setCode(c);
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
    </main>
  );
}
