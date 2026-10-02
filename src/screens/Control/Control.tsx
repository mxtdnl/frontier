import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addTime,
  advance,
  endSession,
  retryResolution,
  setPaused,
  toggleSummit,
  type ActionResult,
  type Seen,
} from '../../firebase/orchestrator';
import { useRoute } from '../../router';
import { useFirms, useFirmsPublic, usePacts, usePublic, useServerTimeOffset } from '../../state';
import {
  useAutoResolve,
  useCommitSync,
  useDecisions,
  useEngine,
  useMembers,
  useMeta,
  useOrchestrator,
  usePactsPrivate,
  usePresenceAll,
} from '../../state/facilitator';
import { Countdown, DataTable, GlyphCheck, Panel, PresenceDot, Tag } from '../../ui/components';
import { fmt, fmtTime, quarterLabel } from '../../ui/format';
import { matchKey } from '../../ui/keys';
import { FacilitatorGate } from '../Auth/FacilitatorGate';

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

const END_CONFIRM_MS = 3000;

export function Control() {
  const { segments } = useRoute();
  const g = segments[1] ?? null;
  if (!g) {
    return (
      <div className="page stack">
        <p className="notice err" role="alert">No session in the address. Create one, or open the link shown after creation.</p>
        <a href="#/new">NEW SESSION</a>
      </div>
    );
  }
  return <FacilitatorGate>{(uid) => <LiveControl g={g} uid={uid} />}</FacilitatorGate>;
}

function LiveControl({ g, uid }: { g: string; uid: string }) {
  const pubSub = usePublic(g);
  const metaSub = useMeta(g);
  const firms = useFirms(g).data;
  const firmsPublic = useFirmsPublic(g).data;
  const pacts = usePacts(g).data;
  const members = useMembers(g).data;
  const presence = usePresenceAll(g).data;
  const engine = useEngine(g).data;
  const pactsPrivate = usePactsPrivate(g).data;
  const pub = pubSub.data;
  const meta = metaSub.data;
  const offset = useServerTimeOffset();
  const ctx = useOrchestrator(g, uid);
  const decisions = useDecisions(g, pub && pub.phase === 'open' ? pub.round : null).data;

  const [notice, setNotice] = useState('');
  const [busyNow, setBusyNow] = useState(false);
  const noticeTimer = useRef(0);
  const busy = useRef(false);
  const endArmedAt = useRef(0);
  const seenRef = useRef<Seen | undefined>(undefined);
  seenRef.current = pub ? { phase: pub.phase, round: pub.round } : undefined;
  // A quarter normally resolves in well under a second; only a longer wait counts as incomplete.
  const resolvingSince = pub?.phase === 'resolving' ? `${pub.round}/${pub.resolvingBy ?? ''}` : null;
  const [stuck, setStuck] = useState<string | null>(null);
  useEffect(() => {
    if (resolvingSince === null) {
      setStuck(null);
      return undefined;
    }
    const id = window.setTimeout(() => setStuck(resolvingSince), 4000);
    return () => window.clearTimeout(id);
  }, [resolvingSince]);

  const say = useCallback((text: string, ms = 5000) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), ms);
  }, []);
  const report = useCallback((r: ActionResult) => say(r.message, r.ok ? 5000 : 12000), [say]);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  useAutoResolve(ctx, pub, meta?.settings.autoResolve ?? false, report);
  useCommitSync(g, pub, firms, firmsPublic, decisions);

  const run = useCallback(
    (action: () => Promise<ActionResult>) => {
      if (busy.current) return;
      busy.current = true;
      setBusyNow(true);
      action()
        .then(report, () => say('The action failed. Check the connection and try again.', 12000))
        .finally(() => {
          busy.current = false;
          setBusyNow(false);
        });
    },
    [report, say],
  );

  const pressEnd = useCallback(() => {
    const now = Date.now();
    if (now - endArmedAt.current <= END_CONFIRM_MS) {
      endArmedAt.current = 0;
      run(() => endSession(ctx, seenRef.current));
    } else {
      endArmedAt.current = now;
      say('Press END again within 3 s to end the session.');
    }
  }, [ctx, run, say]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      const a = matchKey(e, false);
      if (a === 'advance') run(() => advance(ctx, seenRef.current));
      else if (a === 'summit') run(() => toggleSummit(ctx, seenRef.current));
      else if (a === 'end') pressEnd();
      else if (a === 'audit') say('Audit is not connected yet.');
      else if (a === 'disclosure') say('Disclosure toggle is not connected yet.');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx, pressEnd, run, say]);

  const rows = useMemo(
    () =>
      Object.entries(firms)
        .sort(([ka, a], [kb, b]) => a.createdAt - b.createdAt || (ka < kb ? -1 : 1))
        .map(([id, f]) => {
          const mine = Object.entries(members).filter(([, m]) => m.firmId === id);
          return {
            id,
            ticker: f.ticker,
            name: f.name,
            bot: f.isBot ? f.botPolicy : null,
            members: mine.map(([uidM, m]) => ({ uid: uidM, label: m.label || uidM.slice(0, 4), online: presence[uidM]?.online === true })),
            decision: decisions[id] ?? null,
          };
        }),
    [firms, members, presence, decisions],
  );

  if (pubSub.error || metaSub.error) {
    return (
      <div className="page stack">
        <p className="notice err" role="alert">
          This session cannot be read. It belongs to another account, or the address is wrong. Open #/new to create a session.
        </p>
        <a href="#/new">NEW SESSION</a>
      </div>
    );
  }
  if (!pub || !meta) {
    return (
      <div className="page stack">
        <p className={pubSub.loading || metaSub.loading ? 'dim' : 'notice err'} role="status">
          {pubSub.loading || metaSub.loading ? 'Loading session.' : 'No session at this address. Check the link.'}
        </p>
      </div>
    );
  }

  const isOpen = pub.phase === 'open';
  const committed = rows.filter((r) => r.bot !== null || r.decision !== null).length;
  const frozen = pub.phase === 'summit' || pub.paused;
  const incomplete = pub.phase === 'resolving' && !busyNow && stuck === resolvingSince;
  const unaudited = (id: string): number => {
    const pp = pactsPrivate[id];
    if (!pp) return 0;
    let n = 0;
    for (const [round, byFirm] of Object.entries(pp.violations)) {
      for (const f of Object.keys(byFirm)) if (!pp.detected[round]?.[f]) n++;
    }
    return n;
  };
  const pactRows = Object.values(pacts).filter((p) => p.status === 'active');

  return (
    <div className="page stack">
      <header className="row">
        <h1 className="signal">CONTROL</h1>
        <span className="dim">{meta.title} · code {meta.code}</span>
        <a href={`#/screen/${g}`}>SCREEN</a>
      </header>
      <div role="status" aria-live="polite">{notice ? <p className="notice">{notice}</p> : null}</div>

      {incomplete ? (
        <div className="notice err" role="alert">
          <p>Resolution incomplete — retry. The quarter is held in RESOLVING and nothing was written.</p>
          <button type="button" className="btn btn-signal" onClick={() => run(() => retryResolution(ctx, pub.resolvingBy))}>
            Retry resolution
          </button>
        </div>
      ) : null}

      <div className="cols-2">
        <Panel title="SESSION" bodyClassName="pad">
          <div className="stack">
            <div className="row">
              <span className="dim">PHASE</span>
              <span className="signal">{pub.phase.toUpperCase()}</span>
              {pub.round > 0 ? (
                <>
                  <span className="dim">QUARTER</span>
                  <span>{quarterLabel(pub.round)}</span>
                </>
              ) : null}
              <span className="dim">TRUST</span>
              <span>{fmt(pub.T)}</span>
              {pub.collapsed ? <span className="signal">MORATORIUM</span> : null}
            </div>
            <div className="row">
              <span className="dim">TIMER</span>
              {pub.phase === 'open' || pub.phase === 'summit' ? (
                <span>
                  <Countdown deadline={pub.deadline ?? 0} offset={offset} frozenMs={frozen ? (pub.pausedRemainingMs ?? 0) : undefined} />
                  {frozen ? ' PAUSED' : ''}
                </span>
              ) : (
                <span className="dim">{'–'}</span>
              )}
              <span className="dim">AUTO-RESOLVE</span>
              <span>{meta.settings.autoResolve ? 'ON' : 'OFF'}</span>
            </div>
            <div className="row">
              <button type="button" className="btn" disabled={!isOpen} onClick={() => run(() => addTime(ctx, -30_000))}>−30 s</button>
              <button type="button" className="btn" disabled={!isOpen} onClick={() => run(() => addTime(ctx, 30_000))}>+30 s</button>
              <button type="button" className="btn" disabled={!isOpen} onClick={() => run(() => setPaused(ctx, !pub.paused))}>
                {pub.paused ? 'Resume' : 'Pause'}
              </button>
            </div>
            <div className="row">
              <HoldReveal label="END" value={engine ? (engine.endRound === null ? 'MANUAL' : String(engine.endRound)) : '–'} />
              <HoldReveal label="TAU" value={engine ? fmt(engine.tau) : '–'} />
            </div>
            <p className="dim">Hidden values show while the button is held. They never appear on the board or on participant devices.</p>
          </div>
        </Panel>

        <Panel title="CONTROLS" bodyClassName="pad">
          <div className="stack">
            <div className="row">
              <button type="button" className="btn" onClick={() => say('Disclosure toggle is not connected yet.')}>F7 DISCL</button>
              <button type="button" className="btn" disabled={busyNow} onClick={() => run(() => toggleSummit(ctx, seenRef.current))}>F8 SUMMIT</button>
              <button type="button" className="btn btn-signal" disabled={busyNow} onClick={() => run(() => advance(ctx, seenRef.current))}>F9 ADVANCE</button>
              <button type="button" className="btn" disabled={busyNow} onClick={pressEnd}>F10 END</button>
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={() => say('Audit is not connected yet.')}>F6 AUDIT</button>
            </div>
            <p className="dim">Press END twice within 3 s. ADVANCE resolves an open quarter, with AUTO defaults for firms that have not committed.</p>
          </div>
        </Panel>
      </div>

      <Panel title="FIRMS" right={isOpen ? `${committed}/${rows.length} CMT` : `${rows.length} FIRMS`} bodyClassName="pad">
        <div className="scroll-x">
          <DataTable
            caption="Firm submissions and presence"
            rows={rows}
            rowKey={(f) => f.id}
            columns={[
              { key: 't', label: 'FIRM', w: 8, render: (f) => f.ticker },
              {
                key: 'p',
                label: 'PRESENCE',
                w: 24,
                render: (f) =>
                  f.members.length === 0 ? (
                    <span className="dim">none</span>
                  ) : (
                    f.members.map((m) => (
                      <span key={m.uid} style={{ marginRight: '2ch' }}>
                        <PresenceDot online={m.online} label={m.label} /> {m.label}
                      </span>
                    ))
                  ),
              },
              {
                key: 'c',
                label: 'CMT',
                w: 6,
                render: (f) =>
                  isOpen && (f.decision || f.bot) ? <><span className="sr-only">committed</span><GlyphCheck /></> : <span className="dim">{'–'}</span>,
              },
              { key: 'at', label: 'RECEIVED', w: 11, render: (f) => (isOpen && f.decision ? fmtTime(new Date(f.decision.at)) : '–') },
              { key: 'a', label: 'FORECAST', w: 10, render: (f) => (isOpen && !f.decision && !f.bot ? <Tag kind="AUTO" /> : '') },
              { key: 'b', label: 'BOT POLICY', w: 0, render: (f) => (f.bot ? <><Tag kind="BOT" /> {f.bot}</> : '') },
            ]}
          />
        </div>
      </Panel>

      <Panel title="PACTS" bodyClassName="pad">
        {pactRows.length === 0 ? <p className="dim">No pacts in force.</p> : null}
        {pactRows.length > 0 ? (
          <div className="scroll-x">
            <DataTable
              caption="Pacts and unaudited violations"
              rows={pactRows}
              rowKey={(p) => p.id}
              columns={[
                { key: 'id', label: 'PACT', w: 9, render: (p) => <Tag pact={p.name} /> },
                { key: 'terms', label: 'TERMS', w: 26, render: (p) => `max pace ${p.terms.maxPace ?? '–'} · min safety ${p.terms.minSafety ?? '–'}` },
                { key: 'm', label: 'MBRS', w: 6, align: 'r', render: (p) => Object.keys(p.members).length },
                { key: 'u', label: 'UNAUD', w: 0, align: 'r', render: (p) => unaudited(p.id) },
              ]}
            />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
