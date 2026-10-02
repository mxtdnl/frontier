import { useState, type ReactNode } from 'react';
import { signInFacilitator, signOutUser, useFacilitatorStatus } from '../../firebase/auth';
import { Panel } from '../../ui/components';

/** Renders `children` only for a signed-in account that is on the facilitator allowlist. */
export function FacilitatorGate({ children }: { children: (uid: string) => ReactNode }) {
  const status = useFacilitatorStatus();
  if (status.kind === 'ok') return <>{children(status.uid)}</>;
  return (
    <div className="page stack">
      <header className="row">
        <h1 className="signal">FACILITATOR</h1>
        <a href="#/">INDEX</a>
      </header>
      {status.kind === 'loading' ? <p className="dim" role="status">Checking sign-in.</p> : null}
      {status.kind === 'error' ? <p className="notice err" role="alert">{status.message}</p> : null}
      {status.kind === 'signed-out' ? <SignInForm /> : null}
      {status.kind === 'not-listed' ? (
        <Panel title="NOT ON THE ALLOWLIST" bodyClassName="pad">
          <div className="stack">
            <p className="notice err" role="alert">
              {status.email} is signed in but is not on the facilitator allowlist.
            </p>
            <p>
              Ask the owner to add this user ID under <span className="signal">facilitators</span> in the Firebase console
              (Realtime Database), with the value <span className="signal">true</span>:
            </p>
            <p className="signal" style={{ overflowWrap: 'anywhere' }}>{status.uid}</p>
            <div>
              <button type="button" className="btn" onClick={() => void signOutUser()}>Sign out</button>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="SIGN IN" bodyClassName="pad">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          void signInFacilitator(email, password).then((msg) => {
            setBusy(false);
            if (msg) setError(msg);
          });
        }}
      >
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div role="alert">{error ? <p className="notice err">{error}</p> : null}</div>
        <div>
          <button type="submit" className="btn btn-signal" disabled={busy}>Sign in</button>
        </div>
      </form>
    </Panel>
  );
}
