import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMMITTED, FIRMS, ROUND, TRUST } from '../../mock/fixtures';
import { navigate, setQueryParam, useRoute } from '../../router';
import { CommandLine, Countdown, FKeyBar, Ticker, TopBar, type CommandLineHandle } from '../../ui/components';
import { parseCommand } from '../../ui/commands';
import { fmt, quarterLabel } from '../../ui/format';
import { matchKey, type KeyAction } from '../../ui/keys';
import { useLitRoom } from '../../ui/litRoom';
import { playReveal } from '../../ui/reveal';
import { BoardPanel, TrustPanel, WIRE_ITEMS } from './BoardView';
import { BriefingView, FirmView, HelpView, LobbyView, PactsView, TrustView, WireView } from './Views';

export const SCREEN_STATES = ['lobby', 'briefing', 'open', 'reveal', 'summit', 'disclosure-on', 'disclosure-off'] as const;
type Phase = 'lobby' | 'briefing' | 'open' | 'reveal' | 'summit';
type View = { kind: 'board' | 'trust' | 'pacts' | 'wire' | 'help' } | { kind: 'firm'; ticker: string };

const ADVANCE_ORDER: Phase[] = ['lobby', 'briefing', 'open', 'reveal'];
const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'LOBBY',
  briefing: 'BRIEFING',
  open: 'OPEN',
  reveal: 'REVEAL',
  summit: 'SUMMIT',
};
const END_CONFIRM_MS = 3000;

function readState(raw: string | null, disclosureParam: string | null): { phase: Phase; disclosure: boolean } {
  const disclosureAlias = raw === 'disclosure-on' ? true : raw === 'disclosure-off' ? false : null;
  const phase: Phase = disclosureAlias !== null ? 'open' : ADVANCE_ORDER.concat(['summit']).includes(raw as Phase) ? (raw as Phase) : 'open';
  return { phase, disclosure: disclosureAlias ?? disclosureParam === 'on' };
}

export function Screen() {
  const route = useRoute();
  const { phase, disclosure } = readState(route.query.get('state'), route.query.get('disclosure'));
  const lit = route.query.get('lit') === '1';
  useLitRoom(lit);

  const [view, setView] = useState<View>(() => {
    const v = route.query.get('view');
    return v === 'trust' || v === 'pacts' || v === 'wire' || v === 'help' ? { kind: v } : { kind: 'board' };
  });
  const [notice, setNotice] = useState('');
  const cmd = useRef<CommandLineHandle>(null);
  const root = useRef<HTMLDivElement>(null);
  const endArmedAt = useRef<number>(0);
  const noticeTimer = useRef<number>(0);
  // Stable mock deadline: 107 s after load, shown as T-01:47.
  const deadline = useMemo(() => Date.now() + 107_000, []);

  const say = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4000);
  }, []);

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
          say('Audit is not connected in this preview.');
          break;
        case 'disclosure':
          setQueryParam('disclosure', disclosure ? null : 'on');
          if (route.query.get('state')?.startsWith('disclosure')) setQueryParam('state', 'open');
          break;
        case 'summit':
          setQueryParam('state', phase === 'summit' ? 'open' : 'summit');
          break;
        case 'advance': {
          const i = ADVANCE_ORDER.indexOf(phase);
          const next = phase === 'summit' ? 'open' : (ADVANCE_ORDER[i + 1] ?? 'open');
          setQueryParam('state', next);
          break;
        }
        case 'end': {
          const now = Date.now();
          if (now - endArmedAt.current <= END_CONFIRM_MS) {
            endArmedAt.current = 0;
            navigate('#/results/demo?panel=1');
          } else {
            endArmedAt.current = now;
            say('Press END again within 3 s to end the session.');
          }
          break;
        }
      }
    },
    [disclosure, phase, route.query, say],
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

  // Reveal sequence on entering the reveal phase.
  useEffect(() => {
    if (phase !== 'reveal' || view.kind !== 'board' || !root.current) return;
    const run = playReveal(root.current);
    return () => run.cancel();
  }, [phase, view.kind]);

  const reveal = phase === 'reveal';
  const delta = TRUST.value - TRUST.prev;
  const showQuarter = phase !== 'lobby' && phase !== 'briefing';

  let main;
  if (phase === 'lobby') {
    main = <div className="scr-main"><LobbyView /></div>;
  } else if (phase === 'briefing') {
    main = <div className="scr-main"><BriefingView /></div>;
  } else if (view.kind === 'board') {
    main = (
      <div className="scr-main">
        <BoardPanel disclosure={disclosure} reveal={reveal} />
        {phase === 'summit' ? <PactsView emphasis /> : <TrustPanel disclosure={disclosure} reveal={reveal} />}
      </div>
    );
  } else {
    main = (
      <div className="scr-main is-single">
        {view.kind === 'trust' ? <TrustView /> : null}
        {view.kind === 'pacts' ? <PactsView /> : null}
        {view.kind === 'wire' ? <WireView /> : null}
        {view.kind === 'help' ? <HelpView /> : null}
        {view.kind === 'firm' ? <FirmView ticker={view.ticker} /> : null}
      </div>
    );
  }

  return (
    <div className="scr-wrap">
      <div className="scr" ref={root}>
        <TopBar>
          <CommandLine ref={cmd} onSubmit={submit} onEscape={() => setView({ kind: 'board' })} />
          {showQuarter ? (
            <>
              <span className="sep">|</span>
              <span>{quarterLabel(ROUND)}</span>
            </>
          ) : null}
          <span className="sep">|</span>
          <span>{PHASE_LABEL[phase]}</span>
          {phase === 'open' || phase === 'summit' ? (
            <>
              <span className="sep">|</span>
              <span>
                T-<Countdown deadline={deadline} frozenMs={phase === 'summit' ? 107_000 : undefined} />
                {phase === 'summit' ? ' PAUSED' : ''}
              </span>
            </>
          ) : null}
          {phase === 'open' || phase === 'summit' ? (
            <>
              <span className="sep">|</span>
              <span>{COMMITTED}/{FIRMS.length} COMMITTED</span>
            </>
          ) : null}
          {phase === 'lobby' ? (
            <>
              <span className="sep">|</span>
              <span>{FIRMS.length} FIRMS</span>
            </>
          ) : null}
          <span className="grow topbar-notice" role="status" aria-live="polite">
            {notice}
          </span>
        </TopBar>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {phase === 'summit' ? <div className="scr-banner" role="status">Industry summit in session</div> : null}
          <div style={{ flex: 1, minHeight: 0, display: 'grid' }}>{main}</div>
        </div>
        <Ticker items={WIRE_ITEMS(disclosure)} />
        <FKeyBar onAction={act} />
        {reveal ? (
          <p className="sr-only" role="status" aria-live="polite">
            {`${quarterLabel(ROUND)} resolved. Public trust ${fmt(TRUST.value)}, ${delta < 0 ? 'down' : 'up'} ${fmt(Math.abs(delta))}.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
