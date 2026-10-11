import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addTime,
  advance,
  deleteSession,
  endSession,
  publishResults,
  queueAudit,
  removeFirm,
  retryResolution,
  setJoinsLocked,
  setPaused,
  toggleDisclosure,
  toggleSummit,
  MAX_FIRMS_BY_MODE,
  type ActionResult,
  type Seen,
} from '../../firebase/orchestrator';
import { navigate, useRoute } from '../../router';
import { useFirms, useFirmsPublic, usePacts, usePublic, useResults, useRounds, useServerTimeOffset, useWire } from '../../state';
import {
  useAutoResolve,
  useCommitSync,
  useDecisions,
  useEngine,
  useLiveWire,
  useMembers,
  useMeta,
  useOrchestrator,
  usePactsPrivate,
  usePresenceAll,
  useResultsPublisher,
} from '../../state/facilitator';
import type { Pact } from '../../engine';
import type { FirmNode, RoundNode } from '../../firebase/schema';
import { nextLine } from './next';
import { Countdown, DataTable, GlyphCheck, Panel, PresenceDot, Tag } from '../../ui/components';
import { fmt, fmtTime, quarterLabel } from '../../ui/format';
import { matchKey } from '../../ui/keys';
import { FacilitatorGate } from '../Auth/FacilitatorGate';
import { DangerPanel, ExportPanel } from './ExportDanger';
import { firmTable, onlineCount, type FirmFilters, type FirmSort } from './firms';

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
  const rounds = useRounds(g).data;
  const wireSub = useWire(g);
  const members = useMembers(g).data;
  const presence = usePresenceAll(g).data;
  const engine = useEngine(g).data;
  const resultsSub = useResults(pubSub.data?.phase === 'ended' ? g : null);
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
  useLiveWire(ctx, pub, firms, pacts, rounds, wireSub.data, !wireSub.loading);
  useResultsPublisher(ctx, pub?.phase ?? null, report);

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

  /** Danger panel: removing a firm in the lobby needs a second press on the same firm within 3 s. */
  const removeArmed = useRef<{ id: string; at: number } | null>(null);
  const pressRemove = useCallback(
    (id: string, ticker: string) => {
      const now = Date.now();
      const armed = removeArmed.current;
      if (armed && armed.id === id && now - armed.at <= END_CONFIRM_MS) {
        removeArmed.current = null;
        run(() => removeFirm(ctx, id));
      } else {
        removeArmed.current = { id, at: now };
        say(`Press REMOVE on ${ticker} again within 3 s to remove the firm and sign out its devices.`);
      }
    },
    [ctx, run, say],
  );

  const pactsPanel = useRef<HTMLDivElement>(null);
  const activePactsRef = useRef<Pact[]>([]);
  /** F6: one pact is queued directly; with several, focus moves to the pact list to choose. */
  const auditKey = useCallback(() => {
    const list = activePactsRef.current;
    const only = list[0];
    if (list.length === 0) say('No pacts in force to audit.');
    else if (list.length === 1 && only) run(() => queueAudit(ctx, only.id));
    else {
      say('Select a pact: press Enter on its AUDIT button.');
      pactsPanel.current?.querySelector('button')?.focus();
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
      else if (a === 'audit') auditKey();
      else if (a === 'disclosure') run(() => toggleDisclosure(ctx, seenRef.current));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx, pressEnd, run, auditKey]);

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
            committed: decisions[id] !== undefined,
          };
        }),
    [firms, members, presence, decisions],
  );
  const [sort, setSort] = useState<FirmSort>('order');
  const [filters, setFilters] = useState<FirmFilters>({ notCommitted: false, offline: false });

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
  activePactsRef.current = pactRows;
  const canAudit = pub.phase === 'open' || pub.phase === 'reveal' || pub.phase === 'summit';
  const queued = new Set(engine?.pendingAudits ?? []);
  const auditLog = auditOutcomes(rounds, pacts, firms);

  const next = nextLine({ phase: pub.phase, round: pub.round, paused: pub.paused, committed, total: rows.length, incomplete });
  const tableRows = firmTable(rows, sort, filters, isOpen);
  const sortButton = (key: FirmSort, label: string) => (
    <button type="button" className="btn" aria-pressed={sort === key} onClick={() => setSort(key)}>
      {label}
    </button>
  );

  return (
    <div className="page stack">
      {/* §14.2: the control strip stays in view while the page scrolls. */}
      <div className="ctl-strip stack" data-control-strip="">
        <header className="row">
          <h1 className="signal">CONTROL</h1>
          <span className="dim">{meta.title} · code {meta.code}</span>
          <a href={`#/screen/${g}`}>SCREEN</a>
          <a href={`#/wire/${g}`} target="_blank" rel="noopener">WIRE LOG</a>
          {pub.phase === 'ended' ? <a href={`#/results/${g}`}>RESULTS</a> : null}
          <span className="dim">
            {pub.phase.toUpperCase()}
            {pub.round > 0 ? ` · ${quarterLabel(pub.round)}` : ''}
            {isOpen ? ` · ${committed}/${rows.length} CMT` : ` · ${rows.length} FIRMS`}
          </span>
        </header>
        <div className="ctl-groups" data-ctl-groups="">
          <div className="ctl-group" role="group" aria-label="Routine" data-group="routine">
            <span className="ctl-group-label dim">ROUTINE</span>
            <button type="button" className="btn" disabled={!isOpen} onClick={() => run(() => addTime(ctx, -30_000))}>−30 s</button>
            <button type="button" className="btn" disabled={!isOpen} onClick={() => run(() => addTime(ctx, 30_000))}>+30 s</button>
            <button type="button" className="btn" disabled={!isOpen} onClick={() => run(() => setPaused(ctx, !pub.paused))}>
              {pub.paused ? 'Resume' : 'Pause'}
            </button>
          </div>
          <div className="ctl-group" role="group" aria-label="Session flow" data-group="flow">
            <span className="ctl-group-label dim">SESSION FLOW</span>
            <button type="button" className="btn" onClick={auditKey}>F6 AUDIT</button>
            <button type="button" className="btn" aria-pressed={pub.disclosure} disabled={busyNow || pub.phase === 'ended'} onClick={() => run(() => toggleDisclosure(ctx, seenRef.current))}>
              F7 DISCLOSURE {pub.disclosure ? 'ON' : 'OFF'}
            </button>
            <button type="button" className={`btn${next.key === 'F8' ? ' btn-signal' : ''}`} disabled={busyNow} onClick={() => run(() => toggleSummit(ctx, seenRef.current))}>F8 SUMMIT</button>
            <button type="button" className={`btn${next.key === 'F9' ? ' btn-signal' : ''}`} disabled={busyNow} onClick={() => run(() => advance(ctx, seenRef.current))}>F9 ADVANCE</button>
          </div>
          <div className="ctl-group is-irreversible" role="group" aria-label="Irreversible" data-group="irreversible">
            <span className="ctl-group-label">IRREVERSIBLE</span>
            <button type="button" className="btn" disabled={busyNow} onClick={pressEnd}>F10 END</button>
            <HoldReveal label="END" value={engine ? (engine.endRound === null ? 'MANUAL' : String(engine.endRound)) : '–'} />
            <HoldReveal label="TAU" value={engine ? fmt(engine.tau) : '–'} />
          </div>
        </div>
        <p className="ctl-next" data-next={next.key ?? ''}>{next.text}</p>
        <div role="status" aria-live="polite">{notice ? <p className="notice">{notice}</p> : null}</div>
      </div>

      {incomplete ? (
        <div className="notice err" role="alert">
          <p>Resolution incomplete — retry. The quarter is held in RESOLVING and nothing was written.</p>
          <button type="button" className="btn btn-signal" onClick={() => run(() => retryResolution(ctx, pub.resolvingBy))}>
            Retry resolution
          </button>
        </div>
      ) : null}

      {pub.phase === 'ended' && !resultsSub.loading && resultsSub.data === null ? (
        <div className="notice err" role="alert">
          <p>Results are not written yet. Participants see a waiting message until they are.</p>
          <button type="button" className="btn btn-signal" disabled={busyNow} onClick={() => run(() => publishResults(ctx))}>
            Retry results
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
              <span className="dim">MODE</span>
              <span data-mode={meta.settings.mode}>
                {meta.settings.mode === 'multiplayer' ? 'Multiplayer mode' : 'Team mode'}, at most {MAX_FIRMS_BY_MODE[meta.settings.mode]} firms
              </span>
            </div>
            <p className="dim">END and TAU show their value while the button in the IRREVERSIBLE group is held. They never appear on the board or on participant devices.</p>
          </div>
        </Panel>

        <Panel title="CONTROLS" bodyClassName="pad">
          <div className="stack">
            <p className="dim">The buttons stay at the top of this page while it scrolls. The F-keys and Shift+letters work here too.</p>
            <p className="dim">Disclosure {pub.disclosure ? 'ON: PACE, SAFETY and EXPOSURE are published each quarter' : 'OFF: nothing is published'}.</p>
            <p className="dim">Press END twice within 3 s. ADVANCE resolves an open quarter, with AUTO defaults for firms that have not committed.</p>
          </div>
        </Panel>
      </div>

      <Panel title="FIRMS" right={isOpen ? `${committed}/${rows.length} CMT` : `${rows.length} FIRMS`} bodyClassName="pad">
        <div className="row" style={{ marginBottom: '0.5lh' }}>
          <span className="dim">SORT</span>
          {sortButton('order', 'FIRM')}
          {sortButton('cmt', 'CMT')}
          {sortButton('online', 'ONLINE')}
          <span className="dim">SHOW</span>
          <button type="button" className="btn" aria-pressed={filters.notCommitted} disabled={!isOpen} onClick={() => setFilters({ ...filters, notCommitted: !filters.notCommitted })}>
            NOT COMMITTED
          </button>
          <button type="button" className="btn" aria-pressed={filters.offline} onClick={() => setFilters({ ...filters, offline: !filters.offline })}>
            OFFLINE
          </button>
          <span className="dim" role="status" data-firms-shown={tableRows.length}>
            {tableRows.length === rows.length ? `all ${rows.length}` : `${tableRows.length} of ${rows.length}`}
          </span>
        </div>
        <div className="scroll-x scroll-y" data-firms-scroll="">
          <DataTable
            caption="Firm submissions and presence"
            rows={tableRows}
            rowKey={(f) => f.id}
            columns={[
              { key: 't', label: 'FIRM', w: 8, render: (f) => f.ticker },
              { key: 'on', label: 'ON', w: 5, align: 'r', render: (f) => (f.bot ? <span className="dim">{'–'}</span> : `${onlineCount(f)}/${f.members.length}`) },
              {
                key: 'p',
                label: 'PRESENCE',
                w: 12,
                render: (f) =>
                  f.members.length === 0 ? (
                    <span className="dim">none</span>
                  ) : (
                    f.members.map((m) => (
                      <span key={m.uid} style={{ marginRight: '1ch' }}>
                        <PresenceDot online={m.online} label={m.label} />
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
              { key: 'b', label: 'BOT POLICY', w: pub.phase === 'lobby' ? 18 : 0, render: (f) => (f.bot ? <><Tag kind="BOT" /> {f.bot}</> : '') },
              ...(pub.phase === 'lobby'
                ? [
                    {
                      key: 'x',
                      label: 'DANGER',
                      w: 0,
                      render: (f: (typeof rows)[number]) => (
                        <button type="button" className="btn" disabled={busyNow} onClick={() => pressRemove(f.id, f.ticker)} aria-label={`Remove ${f.ticker}`}>
                          REMOVE
                        </button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
        {pub.phase === 'lobby' ? (
          <p className="dim">A firm with no devices (PRESENCE none) was left when its founder founded or joined another firm. Remove it before the briefing, or it plays on AUTO defaults all session.</p>
        ) : null}
      </Panel>

      <Panel title="PACTS" right={queued.size ? `${queued.size} AUDIT QUEUED` : undefined} bodyClassName="pad">
        {pactRows.length === 0 ? <p className="dim">No pacts in force.</p> : null}
        {pactRows.length > 0 ? (
          <div className="scroll-x" ref={pactsPanel}>
            <DataTable
              caption="Pacts, unaudited violations and audit actions"
              rows={pactRows}
              rowKey={(p) => p.id}
              columns={[
                { key: 'id', label: 'PACT', w: 9, render: (p) => <Tag pact={p.name} /> },
                { key: 'terms', label: 'TERMS', w: 26, render: (p) => `max pace ${p.terms.maxPace ?? '–'} · min safety ${p.terms.minSafety ?? '–'}` },
                { key: 'm', label: 'MBRS', w: 6, align: 'r', render: (p) => Object.keys(p.members).length },
                { key: 'u', label: 'UNAUD', w: 8, align: 'r', render: (p) => unaudited(p.id) },
                {
                  key: 'a',
                  label: 'AUDIT',
                  w: 0,
                  render: (p) =>
                    queued.has(p.id) ? (
                      <span className="signal">QUEUED</span>
                    ) : (
                      <button type="button" className="btn" disabled={busyNow || !canAudit} onClick={() => run(() => queueAudit(ctx, p.id))} aria-label={`Audit ${p.name}`}>
                        AUDIT
                      </button>
                    ),
                },
              ]}
            />
          </div>
        ) : null}
        <p className="dim">An audit runs when the quarter resolves, together with the automatic audits. Unaudited counts are private.</p>
      </Panel>

      <Panel title="AUDIT OUTCOMES" bodyClassName="pad">
        {auditLog.length === 0 ? <p className="dim">No audits have run yet.</p> : null}
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 0 }}>
          {auditLog.map((l) => (
            <li key={l.key}>
              <span className="dim">{quarterLabel(l.round)}</span> {l.pact} <span className="dim">{l.kind}</span> {l.text}
            </li>
          ))}
        </ul>
      </Panel>

      <ExportPanel g={g} code={meta.code} rounds={engine?.round ?? 0} now={ctx.now} />

      <DangerPanel
        code={meta.code}
        disabled={busyNow}
        joinLocked={pub.joinLocked}
        lobby={pub.phase === 'lobby'}
        onJoinLock={(locked) => run(() => setJoinsLocked(ctx, locked))}
        onDelete={() =>
          run(async () => {
            const r = await deleteSession(ctx);
            if (r.ok) navigate('#/new');
            return r;
          })
        }
      />
    </div>
  );
}

interface AuditLine {
  key: string;
  round: number;
  pact: string;
  kind: 'MAN' | 'AUTO';
  text: string;
}

/** Published audit outcomes, newest quarter first (automatic and manual). */
export function auditOutcomes(
  rounds: Record<string, RoundNode>,
  pacts: Record<string, Pact>,
  firms: Record<string, FirmNode>,
): AuditLine[] {
  const out: AuditLine[] = [];
  const nums = Object.keys(rounds).map(Number).filter((n) => n > 0).sort((a, b) => b - a);
  for (const r of nums) {
    for (const a of rounds[String(r)]?.audits ?? []) {
      const name = pacts[a.pactId]?.name ?? a.pactId;
      const text =
        a.breaches.length === 0
          ? 'full compliance'
          : a.breaches
              .map((b) => `${firms[b.firmId]?.ticker ?? '?'} breach #${b.count}, ${b.waived ? 'fine waived' : `fine ${fmt(b.fine)}`}${b.expelled ? ', expelled' : ''}`)
              .join(' · ');
      out.push({ key: `${r}-${a.pactId}`, round: r, pact: name, kind: a.kind === 'manual' ? 'MAN' : 'AUTO', text });
    }
  }
  return out;
}
