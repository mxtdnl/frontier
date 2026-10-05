import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { JoinBusyError, foundFirm, generatePin, joinFirm, resolveCode } from '../../firebase/api';
import { getFirebase } from '../../firebase/init';
import { isPermissionDenied, rememberSession, useParticipantAuth } from '../../firebase/participant';
import { navigate, useRoute } from '../../router';
import { useFirms, useMeta, useOwnMember, usePublic } from '../../state';
import { CodeField, Panel, Wordmark } from '../../ui/components';
import { FILTER_ABOVE, filterByTicker } from '../../ui/layout';
import {
  INITIALS_MAX,
  NAME_MAX,
  cleanCode,
  cleanInitials,
  cleanPin,
  cleanTicker,
  isValidCode,
  normaliseName,
  validateName,
  validatePin,
  validateTicker,
} from './validate';

function Message({ children }: { children: ReactNode }) {
  return (
    <main className="page stack" style={{ maxWidth: '60ch' }}>
      <p className="notice" role="status">{children}</p>
      <a className="link-block" href="#/">BACK</a>
    </main>
  );
}

/** `#/j/:code`: confirm the code, then found a firm or join one with its PIN (spec §3, §14.3). */
export function Join() {
  const route = useRoute();
  const auth = useParticipantAuth();
  if (auth.kind === 'loading') return <Message>Signing in.</Message>;
  if (auth.kind === 'error') return <Message>{auth.message}</Message>;
  if (auth.kind === 'facilitator-browser') {
    return <Message>This browser is signed in as the facilitator. Open the join address in a private window or another browser.</Message>;
  }
  return <JoinFlow uid={auth.uid} initialCode={cleanCode(route.segments[1] ?? '')} />;
}

function JoinFlow({ uid, initialCode }: { uid: string; initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [session, setSession] = useState<{ code: string; gameId: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidCode(code)) {
      setError('The code is four letters, A to Z without I or O. Check it and try again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const gameId = await resolveCode(getFirebase().db, code);
      if (!gameId) setError('No session has this code. Check it with the facilitator and try again.');
      else {
        setSession({ code, gameId });
        window.history.replaceState(null, '', `#/j/${code}`);
      }
    } catch {
      setError('The code could not be checked. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (session) {
    return <Choose uid={uid} code={session.code} g={session.gameId} onChangeCode={() => setSession(null)} />;
  }
  return (
    <main className="page stack" style={{ maxWidth: '60ch' }}>
      <Wordmark />
      <h2 className="signal">JOIN A SESSION</h2>
      <form className="stack code-form" onSubmit={(e) => void confirm(e)} noValidate>
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
        <button type="submit" className="btn btn-signal btn-block" disabled={busy}>Continue</button>
      </form>
      <a className="link-block" href="#/">BACK</a>
    </main>
  );
}

type Mode = 'choose' | 'found' | 'join';

function Choose({ uid, code, g, onChangeCode }: { uid: string; code: string; g: string; onChangeCode: () => void }) {
  const pubSub = usePublic(g);
  const metaSub = useMeta(g);
  const firmsSub = useFirms(g);
  const member = useOwnMember(g, uid);
  const [mode, setMode] = useState<Mode>('choose');
  const [founded, setFounded] = useState<{ pin: string; ticker: string; name: string } | null>(null);

  const pub = pubSub.data;
  if (pubSub.loading || firmsSub.loading || member.loading || metaSub.loading) return <Message>Loading the session.</Message>;
  if (pubSub.error || !pub) return <Message>This session could not be read. Check the code and the connection.</Message>;

  const firms = firmsSub.data;
  const own = member.data ? firms[member.data.firmId] : undefined;
  const closed = pub.joinLocked || pub.phase === 'ended';
  const solo = metaSub.data?.settings.mode === 'multiplayer';

  if (founded) {
    return (
      <main className="page stack" style={{ maxWidth: '60ch' }}>
        <h1 className="signal">{founded.ticker} FOUNDED</h1>
        <Panel title={solo ? 'FIRM PIN' : 'TEAM PIN'} bodyClassName="pad">
          <p className="big signal" aria-label={`PIN ${founded.pin.split('').join(' ')}`}>{founded.pin}</p>
          <p>
            {solo
              ? 'Keep this PIN. It lets you rejoin your firm from another device. It is also shown on the DESK tab.'
              : `Teammates join ${founded.name} with this PIN. It is also shown on the DESK tab.`}
          </p>
        </Panel>
        <button type="button" className="btn btn-signal btn-block" onClick={() => navigate(`#/play/${g}`)}>Open the desk</button>
      </main>
    );
  }

  return (
    <main className="page stack" style={{ maxWidth: '60ch' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="signal">{code}</h1>
        <button type="button" className="btn" onClick={onChangeCode}>Change code</button>
      </div>
      {metaSub.data?.title ? <p className="dim">{metaSub.data.title}</p> : null}

      {own ? (
        <Panel title="YOUR FIRM" right={own.ticker} bodyClassName="pad">
          <p>This device is in {own.name}.</p>
          <button type="button" className="btn btn-signal btn-block" onClick={() => navigate(`#/play/${g}`)}>Open the desk</button>
        </Panel>
      ) : null}

      {closed ? (
        <p className="notice" role="status">
          {pub.phase === 'ended' ? 'This session has ended.' : 'Joining is closed. Firms can no longer be founded or joined. Ask the facilitator.'}
        </p>
      ) : mode === 'choose' ? (
        solo ? (
          <div className="stack">
            <button type="button" className="btn btn-signal btn-block" onClick={() => setMode('found')}>{own ? 'Found a new firm' : 'Found your firm'}</button>
            <p className="dim">Changed device? Rejoin with the PIN shown when you founded your firm.</p>
            <button type="button" className="btn btn-block" onClick={() => setMode('join')}>Rejoin your firm with its PIN</button>
          </div>
        ) : (
          <div className="stack">
            <button type="button" className="btn btn-signal btn-block" onClick={() => setMode('found')}>{own ? 'Found a new firm' : 'Found a firm'}</button>
            <button type="button" className="btn btn-block" onClick={() => setMode('join')}>{own ? 'Join a different firm' : 'Join a firm'}</button>
          </div>
        )
      ) : mode === 'found' ? (
        <FoundForm
          g={g}
          uid={uid}
          code={code}
          existing={Object.values(firms)}
          onBack={() => setMode('choose')}
          onDone={setFounded}
        />
      ) : (
        <JoinForm g={g} uid={uid} code={code} firms={firms} solo={solo} onBack={() => setMode('choose')} />
      )}
    </main>
  );
}

function InitialsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="initials">Device initials (optional)</label>
      <input
        id="initials"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={INITIALS_MAX}
        value={value}
        aria-describedby="initials-note"
        onChange={(e) => onChange(cleanInitials(e.target.value))}
      />
      <span id="initials-note" className="dim">Shown to teammates beside a commit. Do not enter a full name.</span>
    </div>
  );
}

interface FoundProps {
  g: string;
  uid: string;
  code: string;
  existing: ReadonlyArray<{ ticker: string }>;
  onBack: () => void;
  onDone: (f: { pin: string; ticker: string; name: string }) => void;
}

function FoundForm({ g, uid, code, existing, onBack, onDone }: FoundProps) {
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [label, setLabel] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pin = useMemo(() => generatePin(), []);
  const taken = useMemo(() => existing.map((f) => f.ticker), [existing]);
  const nameErr = validateName(name);
  const tickerErr = validateTicker(ticker, taken);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameErr || tickerErr || busy) return;
    setBusy(true);
    setError('');
    try {
      await foundFirm(getFirebase().db, g, uid, { name: normaliseName(name), ticker, pin, label, order: existing.length });
      rememberSession({ code, gameId: g });
      onDone({ pin, ticker, name: normaliseName(name) });
    } catch (err) {
      setError(
        isPermissionDenied(err)
          ? 'The firm was not created. Joining may have closed since this page loaded. Go back and check the session.'
          : 'The firm was not created. Check the connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={(e) => void submit(e)} noValidate aria-label="Found a firm">
      <div className="field">
        <label htmlFor="firm-name">Firm name (2–{NAME_MAX} characters)</label>
        <input
          id="firm-name"
          type="text"
          autoComplete="off"
          maxLength={NAME_MAX + 4}
          value={name}
          aria-invalid={touched && nameErr ? true : undefined}
          aria-describedby={touched && nameErr ? 'name-err' : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {touched && nameErr ? <span id="name-err" className="notice err" role="alert">{nameErr}</span> : null}
      </div>
      <div className="field">
        <label htmlFor="ticker">Ticker (3–6 letters, A–Z)</label>
        <input
          id="ticker"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={6}
          value={ticker}
          aria-invalid={touched && tickerErr ? true : undefined}
          aria-describedby={touched && tickerErr ? 'ticker-err' : undefined}
          onChange={(e) => setTicker(cleanTicker(e.target.value))}
        />
        {touched && tickerErr ? <span id="ticker-err" className="notice err" role="alert">{tickerErr}</span> : null}
      </div>
      <InitialsField value={label} onChange={setLabel} />
      <Panel title="TEAM PIN" bodyClassName="pad">
        <p className="big signal" aria-label={`PIN ${pin.split('').join(' ')}`}>{pin}</p>
        <p>Give this PIN to teammates so they can join the firm. It is shown again after the firm is founded.</p>
      </Panel>
      {error ? <p className="notice err" role="alert">{error}</p> : null}
      <button type="submit" className="btn btn-signal btn-block" disabled={busy}>Found the firm</button>
      <button type="button" className="btn btn-block" onClick={onBack}>Back</button>
    </form>
  );
}

interface JoinProps {
  g: string;
  uid: string;
  code: string;
  firms: Record<string, { name: string; ticker: string; isBot: boolean }>;
  /** Multiplayer mode: the PIN join is a rejoin from another device. */
  solo: boolean;
  onBack: () => void;
}

function JoinForm({ g, uid, code, firms, solo, onBack }: JoinProps) {
  const list = useMemo(
    () =>
      Object.entries(firms)
        .filter(([, f]) => !f.isBot)
        .map(([id, f]) => ({ id, ...f }))
        .sort((a, b) => a.ticker.localeCompare(b.ticker)),
    [firms],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const shown = filterByTicker(list, query);
  const [pin, setPin] = useState('');
  const [label, setLabel] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pinErr = validatePin(pin);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!picked || pinErr || busy) return;
    setBusy(true);
    setError('');
    try {
      await joinFirm(getFirebase().db, g, uid, picked, pin, label);
      rememberSession({ code, gameId: g });
      navigate(`#/play/${g}`);
    } catch (err) {
      setError(
        err instanceof JoinBusyError
          ? err.message
          : isPermissionDenied(err)
          ? 'The PIN was not accepted, or joining has closed. Check the PIN with a teammate and try again.'
          : 'The join did not go through. Check the connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={(e) => void submit(e)} noValidate aria-label={solo ? 'Rejoin your firm' : 'Join a firm'}>
      {list.length === 0 ? <p className="notice" role="status">No firms have been founded yet. Found one, or wait for a teammate to do so.</p> : null}
      {list.length > FILTER_ABOVE ? (
        <div className="field">
          <label htmlFor="firm-filter">Find a firm by ticker</label>
          <input
            id="firm-filter"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={6}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="dim" role="status">{shown.length} of {list.length} firms shown</span>
        </div>
      ) : null}
      <fieldset className="stack" style={{ gap: 0 }}>
        <legend className="dim">FIRM</legend>
        {shown.map((f) => (
          <label key={f.id} className="field check">
            <input type="radio" name="firm" checked={picked === f.id} onChange={() => setPicked(f.id)} />
            <span>{f.ticker} · {f.name}</span>
          </label>
        ))}
      </fieldset>
      {touched && !picked ? <p className="notice err" role="alert">Select a firm to join.</p> : null}
      <div className="field">
        <label htmlFor="pin">Firm PIN (4 digits)</label>
        <input
          id="pin"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          aria-invalid={touched && pinErr ? true : undefined}
          aria-describedby={touched && pinErr ? 'pin-err' : undefined}
          onChange={(e) => {
            setPin(cleanPin(e.target.value));
            setError('');
          }}
        />
        {touched && pinErr ? <span id="pin-err" className="notice err" role="alert">{pinErr}</span> : null}
      </div>
      <InitialsField value={label} onChange={setLabel} />
      {error ? <p className="notice err" role="alert">{error}</p> : null}
      <button type="submit" className="btn btn-signal btn-block" disabled={busy}>{solo ? 'Rejoin the firm' : 'Join the firm'}</button>
      <button type="button" className="btn btn-block" onClick={onBack}>Back</button>
    </form>
  );
}
