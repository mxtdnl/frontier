import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { advance, endSession, toggleSummit, type ActionResult, type Seen } from '../../firebase/orchestrator';
import { useRoute } from '../../router';
import { useFirms, useFirmsPublic, usePacts, usePublic, useRounds, useServerTimeOffset } from '../../state';
import { useCommitSync, useDecisions, useAutoResolve, useMembers, useMeta, useOrchestrator } from '../../state/facilitator';
import { CommandLine, Countdown, FKeyBar, Panel, Ticker, TopBar, type CommandLineHandle } from '../../ui/components';
import { parseCommand } from '../../ui/commands';
import { fmt, quarterLabel } from '../../ui/format';
import { matchKey, type KeyAction } from '../../ui/keys';
import { useLitRoom } from '../../ui/litRoom';
import { playReveal } from '../../ui/reveal';
import { FacilitatorGate } from '../Auth/FacilitatorGate';
import { BoardPanel, TrustPanel } from './BoardView';
import { boardRows, committedCount, previousTrust, wireItems, type ScreenData } from './model';
import { BriefingView, FirmView, HelpView, LobbyView, PactsView, TrustView, WireView } from './Views';

type View = { kind: 'board' | 'trust' | 'pacts' | 'wire' | 'help' } | { kind: 'firm'; ticker: string };

const PHASE_LABEL = {
  lobby: 'LOBBY',
  briefing: 'BRIEFING',
  open: 'OPEN',
  resolving: 'RESOLVING',
  reveal: 'REVEAL',
  summit: 'SUMMIT',
  ended: 'ENDED',
} as const;
const END_CONFIRM_MS = 3000;

/** Projector board. Facilitator sign-in required; reads only public nodes (never `engine`). */
export function Screen() {
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
  return <FacilitatorGate>{(uid) => <LiveScreen g={g} uid={uid} />}</FacilitatorGate>;
}

function LiveScreen({ g, uid }: { g: string; uid: string }) {
  const route = useRoute();
  const pubSub = usePublic(g);
  const metaSub = useMeta(g);
  const firms = useFirms(g).data;
  const firmsPublic = useFirmsPublic(g).data;
  const rounds = useRounds(g).data;
  const pacts = usePacts(g).data;
  const members = useMembers(g).data;
  const pub = pubSub.data;
  const meta = metaSub.data;
  const offset = useServerTimeOffset();
  const ctx = useOrchestrator(g, uid);
  const decisions = useDecisions(g, pub && pub.phase === 'open' ? pub.round : null).data;

  useLitRoom(meta?.settings.litRoom ?? false);

  const [view, setView] = useState<View>(() => {
    const v = route.query.get('view');
    return v === 'trust' || v === 'pacts' || v === 'wire' || v === 'help' ? { kind: v } : { kind: 'board' };
  });
  const [notice, setNotice] = useState('');
  const cmd = useRef<CommandLineHandle>(null);
  const root = useRef<HTMLDivElement>(null);
  const endArmedAt = useRef(0);
  const noticeTimer = useRef(0);
  const busy = useRef(false);
  const seenRef = useRef<Seen | undefined>(undefined);
  seenRef.current = pub ? { phase: pub.phase, round: pub.round } : undefined;

  const say = useCallback((text: string, ms = 4000) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), ms);
  }, []);
  const report = useCallback((r: ActionResult) => say(r.message, r.ok ? 4000 : 9000), [say]);

  useAutoResolve(ctx, pub, meta?.settings.autoResolve ?? false, report);
  useCommitSync(g, pub, firms, firmsPublic, decisions);

  /** Runs one orchestrator action at a time, so a repeated key press cannot skip a phase. */
  const run = useCallback(
    (action: () => Promise<ActionResult>) => {
      if (busy.current) return;
      busy.current = true;
      action()
        .then(report, () => say('The action failed. Check the connection and press the key again.', 9000))
        .finally(() => {
          busy.current = false;
        });
    },
    [report, say],
  );

  const act = useCallback(
    (a: KeyAction) => {
      switch (a) {
        case 'board':
          setView({ kind: 'board' });
          break;
        case 'trust':
          setView({ kind: 'trust' });
          break;
        case 'pacts':
          setView({ kind: 'pacts' });
          break;
        case 'audit':
          say('Audit is not connected yet.');
          break;
        case 'disclosure':
          say('Disclosure toggle is not connected yet.');
          break;
        case 'summit':
          run(() => toggleSummit(ctx, seenRef.current));
          break;
        case 'advance':
          run(() => advance(ctx, seenRef.current));
          break;
        case 'end': {
          const now = Date.now();
          if (now - endArmedAt.current <= END_CONFIRM_MS) {
            endArmedAt.current = 0;
            run(() => endSession(ctx, seenRef.current));
          } else {
            endArmedAt.current = now;
            say('Press END again within 3 s to end the session.');
          }
          break;
        }
      }
    },
    [ctx, run, say],
  );

  const submit = useCallback(
    (value: string) => {
      const c = parseCommand(value);
      if (c.kind === 'error') {
        say(c.message);
        return;
      }
      setNotice('');
      setView(c.kind === 'firm' ? { kind: 'firm', ticker: c.ticker } : { kind: c.kind });
    },
    [say],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const focused = cmd.current?.isFocused() ?? false;
      const a = matchKey(e, focused);
      if (a) {
        e.preventDefault();
        act(a);
        return;
      }
      if (e.key === 'Escape' && !focused) {
        setView({ kind: 'board' });
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (!focused && !typing && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        cmd.current?.focus(e.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act]);

  // Reveal sequence, once per quarter, only when the page watched the quarter resolve.
  const phase = pub?.phase ?? null;
  const prevPhase = useRef<typeof phase>(null);
  useEffect(() => {
    const before = prevPhase.current;
    prevPhase.current = phase;
    if (phase !== 'reveal' || (before !== 'open' && before !== 'resolving') || view.kind !== 'board' || !root.current) return;
    const run = playReveal(root.current);
    return () => run.cancel();
  }, [phase, pub?.round, view.kind]);

  const data: ScreenData | null = useMemo(
    () =>
      pub && meta
        ? {
            pub,
            meta,
            firms,
            firmsPublic,
            rounds,
            pacts,
            memberCounts: Object.values(members).reduce<Record<string, number>>((acc, m) => {
              acc[m.firmId] = (acc[m.firmId] ?? 0) + 1;
              return acc;
            }, {}),
          }
        : null,
    [pub, meta, firms, firmsPublic, rounds, pacts, members],
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
  if (!data || !pub || !meta) {
    return (
      <div className="page stack">
        <p className={pubSub.loading || metaSub.loading ? 'dim' : 'notice err'} role="status">
          {pubSub.loading || metaSub.loading ? 'Loading session.' : 'No session at this address. Check the link.'}
        </p>
      </div>
    );
  }

  const rows = boardRows(data);
  const reveal = pub.phase === 'reveal';
  const showQuarter = pub.round > 0 && pub.phase !== 'lobby' && pub.phase !== 'briefing';
  const frozen = pub.phase === 'summit' || pub.paused;
  const delta = pub.T - previousTrust(rounds);
  const wire = wireItems(rounds)
    .slice(0, 12)
    .map((h) => h.text);

  let main;
  if (pub.phase === 'lobby') {
    main = <div className="scr-main"><LobbyView code={meta.code} firms={firms} memberCounts={data.memberCounts} /></div>;
  } else if (pub.phase === 'briefing') {
    main = <div className="scr-main"><BriefingView /></div>;
  } else if (view.kind === 'board') {
    main = (
      <div className="scr-main">
        <BoardPanel rows={rows} disclosure={pub.disclosure} reveal={reveal} />
        {pub.phase === 'summit' ? (
          <PactsView data={data} emphasis />
        ) : pub.phase === 'ended' ? (
          <Panel title="SESSION ENDED" bodyClassName="pad">
            <p>The session has ended. Final results follow on the results screen.</p>
          </Panel>
        ) : (
          <TrustPanel data={data} reveal={reveal} />
        )}
      </div>
    );
  } else {
    main = (
      <div className="scr-main is-single">
        {view.kind === 'trust' ? <TrustView data={data} /> : null}
        {view.kind === 'pacts' ? <PactsView data={data} /> : null}
        {view.kind === 'wire' ? <WireView data={data} /> : null}
        {view.kind === 'help' ? <HelpView /> : null}
        {view.kind === 'firm' ? <FirmView ticker={view.ticker} data={data} /> : null}
      </div>
    );
  }

  const timerShown = pub.phase === 'open' || pub.phase === 'summit';
  return (
    <div className="scr-wrap">
      <div className="scr" ref={root}>
        <TopBar>
          <CommandLine ref={cmd} onSubmit={submit} onEscape={() => setView({ kind: 'board' })} />
          {showQuarter ? (
            <>
              <span className="sep">|</span>
              <span>{quarterLabel(pub.round)}</span>
            </>
          ) : null}
          <span className="sep">|</span>
          <span>{PHASE_LABEL[pub.phase]}</span>
          {timerShown && (pub.deadline !== null || frozen) ? (
            <>
              <span className="sep">|</span>
              <span>
                T-<Countdown deadline={pub.deadline ?? 0} offset={offset} frozenMs={frozen ? (pub.pausedRemainingMs ?? 0) : undefined} />
                {frozen ? ' PAUSED' : ''}
              </span>
            </>
          ) : null}
          {pub.phase === 'open' || pub.phase === 'summit' || pub.phase === 'resolving' ? (
            <>
              <span className="sep">|</span>
              <span>{committedCount(rows)}/{rows.length} COMMITTED</span>
            </>
          ) : null}
          {pub.phase === 'lobby' ? (
            <>
              <span className="sep">|</span>
              <span>{rows.length} FIRMS</span>
            </>
          ) : null}
          <span className="grow topbar-notice" role="status" aria-live="polite">
            {notice}
          </span>
        </TopBar>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {pub.phase === 'summit' ? <div className="scr-banner" role="status">Industry summit in session</div> : null}
          <div style={{ flex: 1, minHeight: 0, display: 'grid' }}>{main}</div>
        </div>
        <Ticker items={wire.length ? wire : ['Wire quiet.']} />
        <FKeyBar onAction={act} />
        {reveal ? (
          <p className="sr-only" role="status" aria-live="polite">
            {`${quarterLabel(pub.round)} resolved. Public trust ${fmt(pub.T)}, ${delta < 0 ? 'down' : 'up'} ${fmt(Math.abs(delta))}.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}

