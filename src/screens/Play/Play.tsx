import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { joinPact, leavePact, proposePact, readFirmSecret, submitDecision } from '../../firebase/api';
import { getFirebase } from '../../firebase/init';
import { isPermissionDenied, rememberSession, useParticipantAuth } from '../../firebase/participant';
import { nextPactName, type PactTerms } from '../../engine';
import { useRoute } from '../../router';
import {
  useFirms,
  useFirmsPublic,
  useMeta,
  useOwnDecision,
  useOwnFirmPrivate,
  useOwnMember,
  usePacts,
  usePresence,
  usePublic,
  useRounds,
  useServerTimeOffset,
  useWire,
} from '../../state';
import { Countdown, Delta } from '../../ui/components';
import { fmt, quarterLabel } from '../../ui/format';
import { Desk } from './Desk';
import {
  bookRows,
  initialDraft,
  legalDraft,
  playView,
  poachTargets,
  wireItems,
  type Draft,
} from './model';
import { Book, EndedCard, RevealCard, Wire } from './Panels';
import { PactsTab } from './PactsTab';
import { useHeldFor, useServerNow } from './useServerNow';

type Tab = 'DESK' | 'BOOK' | 'PACTS' | 'WIRE';
const TABS: Tab[] = ['DESK', 'BOOK', 'PACTS', 'WIRE'];
const SAFE_ID = /^[^.#$[\]/\x00-\x1f\x7f]{1,64}$/;

function Message({ children, link }: { children: string; link?: { href: string; text: string } }) {
  return (
    <div className="page stack">
      <p className="notice" role="status">{children}</p>
      {link ? <a className="link-block" href={link.href}>{link.text}</a> : null}
    </div>
  );
}

/** `#/play/:gameId`: the participant control centre. */
export function Play() {
  const route = useRoute();
  const g = route.segments[1] ?? '';
  const auth = useParticipantAuth();
  if (!SAFE_ID.test(g)) return <Message link={{ href: '#/', text: 'JOIN' }}>This address has no session. Enter the join code on the landing page.</Message>;
  if (auth.kind === 'loading') return <Message>Signing in.</Message>;
  if (auth.kind === 'error') return <Message>{auth.message}</Message>;
  if (auth.kind === 'facilitator-browser') {
    return (
      <Message>
        This browser is signed in as the facilitator. Open the participant address in a private window or another browser.
      </Message>
    );
  }
  return <PlayLive g={g} uid={auth.uid} />;
}

function PlayLive({ g, uid }: { g: string; uid: string }) {
  const pubSub = usePublic(g);
  const metaSub = useMeta(g);
  const member = useOwnMember(g, uid);
  const firmId = member.data?.firmId ?? null;
  const firmsSub = useFirms(g);
  const fpubSub = useFirmsPublic(g);
  const priv = useOwnFirmPrivate(g, firmId);
  const roundsSub = useRounds(g);
  const pactsSub = usePacts(g);
  const wireSub = useWire(g);
  const offset = useServerTimeOffset();
  const { connected } = usePresence(g, uid);
  const offline = useHeldFor(!connected, 2000);

  const pub = pubSub.data;
  const round = pub?.round ?? 0;
  const decisionSub = useOwnDecision(g, round, firmId);
  const decision = decisionSub.data;
  const byMember = useOwnMember(g, decision?.by ?? null);

  const code = metaSub.data?.code;
  useEffect(() => {
    if (code && member.data) rememberSession({ code, gameId: g });
  }, [code, g, member.data]);

  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => {
    if (!firmId) return;
    let live = true;
    readFirmSecret(getFirebase().db, g, firmId).then(
      (s) => live && setPin(s?.pin ?? null),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [g, firmId]);

  const firms = firmsSub.data;
  const history = priv.data?.history ?? {};
  const book = useMemo(() => bookRows(history), [history]);
  const insolvent = firmId ? (fpubSub.data[firmId]?.insolvent ?? false) : false;
  const lastCard = priv.data?.lastCard ?? null;
  const lastTargetId = priv.data?.lastPoachTarget ?? null;
  const lastTargetTicker = lastTargetId ? (firms[lastTargetId]?.ticker ?? null) : null;
  const targets = useMemo(() => (firmId ? poachTargets(firms, firmId) : []), [firms, firmId]);

  const nowMs = useServerNow(offset, pub?.phase === 'open');
  const view = pub ? playView(pub, nowMs) : 'lobby';

  // The desk draft is seeded once per quarter from this firm's committed decision or the §6.4
  // defaults. A teammate's commit replaces it. Local edits stay until the next quarter.
  const [draft, setDraftState] = useState<Draft | null>(null);
  const seeded = useRef<number | null>(null);
  const ready = !!pub && !!firmId && !priv.loading && !decisionSub.loading && !firmsSub.loading;
  useEffect(() => {
    if (!ready || seeded.current === round) return;
    seeded.current = round;
    const prev = history[String(round - 1)] ?? null;
    setDraftState(legalDraft(initialDraft(decision, prev), lastCard, lastTargetId, insolvent));
  }, [ready, round, decision, history, lastCard, lastTargetId, insolvent]);
  const teammateAt = decision && decision.by !== uid ? decision.at : null;
  useEffect(() => {
    if (teammateAt === null || !decision) return;
    setDraftState(initialDraft(decision, null));
    // Adopt a teammate's commit once per commit.
  }, [teammateAt]);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const setDraft = (d: Draft) => {
    setError('');
    setDraftState(d);
  };

  const [pactBusy, setPactBusy] = useState(false);
  const [pactError, setPactError] = useState('');
  const [tab, setTab] = useState<Tab>('DESK');
  const prevView = useRef(view);
  useEffect(() => {
    if (view === 'summit' && prevView.current !== 'summit') setTab('PACTS');
    if (view !== 'summit' && prevView.current === 'summit') setTab('DESK');
    prevView.current = view;
  }, [view]);

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabKey = (i: number, e: KeyboardEvent) => {
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next] as Tab);
    tabRefs.current[next]?.focus();
  };

  if (pubSub.error || member.error) {
    return <Message link={{ href: '#/', text: 'JOIN' }}>The session could not be read. Check the address and the connection, then reload.</Message>;
  }
  if (pubSub.loading || member.loading || metaSub.loading) return <Message>Loading the session.</Message>;
  if (!pub || !metaSub.data) return <Message link={{ href: '#/', text: 'JOIN' }}>This session does not exist or has been deleted. Check the join code.</Message>;
  if (!firmId || !member.data) {
    return (
      <Message link={{ href: `#/j/${metaSub.data.code}`, text: 'JOIN OR FOUND A FIRM' }}>
        This device has no firm in this session. Join an existing firm with its PIN or found a new one.
      </Message>
    );
  }
  const firm = firms[firmId];
  if (!firm || !draft) return <Message>Loading the firm.</Message>;

  const commit = async () => {
    if (sending) return;
    setSending(true);
    setError('');
    try {
      await submitDecision(getFirebase().db, g, round, firmId, uid, {
        pace: draft.pace,
        safety: draft.safety,
        card: draft.card,
        target: draft.card === 'POACH' ? draft.target : null,
      });
    } catch (e) {
      setError(
        isPermissionDenied(e)
          ? 'The quarter closed or the timer stopped before this decision arrived. A decision already committed this quarter stands.'
          : 'The decision was not sent. Check the connection, then commit again.',
      );
    } finally {
      setSending(false);
    }
  };

  const pactCall = async (call: () => Promise<unknown>, what: string) => {
    if (pactBusy) return;
    setPactBusy(true);
    setPactError('');
    try {
      await call();
    } catch (e) {
      setPactError(
        isPermissionDenied(e)
          ? `${what} was refused. The session may have moved on, or the pact changed. Check the pact list and try again.`
          : `${what} was not sent. Check the connection, then try again.`,
      );
    } finally {
      setPactBusy(false);
    }
  };
  const onPropose = (terms: PactTerms) =>
    void pactCall(() => proposePact(getFirebase().db, g, round, firmId, nextPactName(Object.values(pactsSub.data)), terms), 'The proposal');
  const onJoin = (id: string) => void pactCall(() => joinPact(getFirebase().db, g, id, firmId, round), 'Joining');
  const onLeave = (id: string) => void pactCall(() => leavePact(getFirebase().db, g, id, firmId), 'Leaving');

  const lastRow = book[book.length - 1];
  const committedBy = decision
    ? decision.by === uid
      ? `device ${member.data.label || 'this device'}`
      : `device ${byMember.data?.label || 'a teammate'}`
    : '';
  const ownPublic = fpubSub.data[firmId];
  const roundNode = roundsSub.data[String(round)];

  return (
    <div className="play">
      <header className="play-head">
        {offline ? <div className="banner" role="alert">Offline. Reconnecting automatically. Committing is paused until the connection returns.</div> : null}
        <div className="topbar" style={{ height: 'auto', padding: '0.5lh 1ch', flexWrap: 'wrap', gap: '0 2ch' }}>
          <span>{firm.ticker}</span>
          <span>{round > 0 ? quarterLabel(round) : 'PRE-OPEN'}</span>
          <span>
            {view === 'open' && pub.deadline !== null ? (
              <>T-<Countdown deadline={pub.deadline} offset={offset} /></>
            ) : view === 'paused' || view === 'summit' ? (
              pub.pausedRemainingMs !== null ? <>PAUSED T-<Countdown deadline={0} frozenMs={pub.pausedRemainingMs} /></> : 'PAUSED'
            ) : view === 'ended' ? (
              'ENDED'
            ) : view === 'lobby' || view === 'briefing' ? (
              'WAITING'
            ) : (
              'CLOSED'
            )}
          </span>
        </div>
        <div className="row" style={{ padding: '0.5lh 1ch', borderBottom: 'var(--rule-w) solid var(--rule)', gap: '0 3ch' }}>
          <span><span className="dim">CASH</span> {priv.data ? fmt(priv.data.cash) : '–'}</span>
          <span><span className="dim">PROFIT</span> {lastRow ? <Delta value={lastRow.profit} /> : '–'}</span>
        </div>
        {view === 'summit' ? <div className="banner" role="status">Industry summit in session. Pacts are open.</div> : null}
      </header>

      <nav className="play-tabs" aria-label="Sections">
        <div className="tabs" role="tablist" aria-label="Sections">
          {TABS.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => tabKey(i, e)}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>

      <main className="play-main" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>
        {tab === 'DESK' ? (
          view === 'ended' ? (
            <EndedCard ticker={firm.ticker} rank={ownPublic?.rank ?? lastRow?.rank ?? null} valuation={ownPublic?.valuation ?? lastRow?.valuation ?? null} />
          ) : view === 'reveal' ? (
            <RevealCard
              round={round}
              history={history}
              audits={roundNode?.audits ?? []}
              headlines={roundNode?.headlines ?? []}
              pacts={pactsSub.data}
              firmId={firmId}
              cardNotices={priv.data?.notices[String(round)] ?? []}
            />
          ) : (
            <>
              <Desk
                view={view}
                draft={draft}
                setDraft={setDraft}
                lastCard={lastCard}
                lastTargetTicker={lastTargetTicker}
                insolvent={insolvent}
                targets={targets}
                decision={decision}
                committedBy={committedBy}
                sending={sending}
                offline={offline}
                error={error}
                onCommit={() => void commit()}
              />
              <TeamPanel name={firm.name} ticker={firm.ticker} pin={pin} />
            </>
          )
        ) : null}
        {tab === 'BOOK' ? <Book rows={book} /> : null}
        {tab === 'PACTS' ? (
          <PactsTab
            phase={pub.phase}
            pacts={pactsSub.data}
            firms={firms}
            ownFirmId={firmId}
            nextName={nextPactName(Object.values(pactsSub.data))}
            summit={view === 'summit'}
            busy={pactBusy}
            offline={offline}
            error={pactError}
            onPropose={onPropose}
            onJoin={onJoin}
            onLeave={onLeave}
          />
        ) : null}
        {tab === 'WIRE' ? <Wire items={wireItems(roundsSub.data, wireSub.data)} /> : null}
      </main>
    </div>
  );
}

function TeamPanel({ name, ticker, pin }: { name: string; ticker: string; pin: string | null }) {
  return (
    <section className="panel" aria-label="Team">
      <div className="panel-title"><span>TEAM</span><span>{ticker}</span></div>
      <div className="panel-body pad">
        <dl className="kv">
          <dt>Firm</dt><dd>{name}</dd>
          <dt>PIN</dt><dd>{pin ?? '–'}</dd>
        </dl>
        <p className="dim">Teammates join this firm with the PIN.</p>
      </div>
    </section>
  );
}
