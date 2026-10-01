import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  BOOK,
  CARDS,
  FIRMS,
  HEADLINES,
  OWN,
  OWN_RESULT,
  PACE_OPTIONS,
  PACTS,
  RESULTS,
  ROUND,
  exposureLabel,
  mockEstimatedCost,
  mockExposure,
} from '../../mock/fixtures';
import { useRoute } from '../../router';
import {
  CardPicker,
  CommitButton,
  Countdown,
  DataTable,
  Delta,
  Segmented4,
  SafetySlider,
  StepSparkline,
  Tag,
} from '../../ui/components';
import { fmt, fmtTime, quarterLabel } from '../../ui/format';

export const PLAY_STATES = ['open', 'committed', 'reveal', 'summit', 'ended'] as const;
type PlayState = (typeof PLAY_STATES)[number];
type Tab = 'DESK' | 'BOOK' | 'PACTS' | 'WIRE';
const TABS: Tab[] = ['DESK', 'BOOK', 'PACTS', 'WIRE'];

function readState(raw: string | null): PlayState {
  return (PLAY_STATES as ReadonlyArray<string>).includes(raw ?? '') ? (raw as PlayState) : 'open';
}

export function Play() {
  const route = useRoute();
  const initial = readState(route.query.get('state'));
  const [state, setState] = useState<PlayState>(initial);
  const [tab, setTab] = useState<Tab>(initial === 'summit' ? 'PACTS' : 'DESK');
  const [pace, setPace] = useState<number>(OWN.pace);
  const [safety, setSafety] = useState<number>(OWN.safety);
  const [card, setCard] = useState<string>('NONE');
  const [target, setTarget] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [committedAt, setCommittedAt] = useState<Date | null>(initial === 'committed' ? new Date(2026, 0, 1, 14, 2, 11) : null);
  const deadline = useMemo(() => Date.now() + 107_000, []);

  // The URL selects the state; local actions (commit) move between open and committed.
  const key = route.query.get('state');
  useEffect(() => {
    const s = readState(key);
    setState(s);
    setTab(s === 'summit' ? 'PACTS' : 'DESK');
    setCommittedAt(s === 'committed' ? new Date(2026, 0, 1, 14, 2, 11) : null);
  }, [key]);

  const commit = () => {
    setCommittedAt(new Date());
    setState('committed');
  };

  const showEnded = state === 'ended';
  const showReveal = state === 'reveal';
  const own = FIRMS.find((f) => f.ticker === OWN.ticker);
  const ownRank = FIRMS.findIndex((f) => f.ticker === OWN.ticker) + 1;

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

  return (
    <div className="play">
      <header className="play-head">
        <div className="topbar" style={{ height: 'auto', padding: '0.5lh 1ch', flexWrap: 'wrap', gap: '0 2ch' }}>
          <span>{OWN.ticker}</span>
          <span>{quarterLabel(ROUND)}</span>
          <span>
            {state === 'open' || state === 'committed' ? (
              <>T-<Countdown deadline={deadline} /></>
            ) : state === 'summit' ? (
              'PAUSED'
            ) : state === 'ended' ? (
              'ENDED'
            ) : (
              'CLOSED'
            )}
          </span>
        </div>
        <div className="row" style={{ padding: '0.5lh 1ch', borderBottom: 'var(--rule-w) solid var(--rule)', gap: '0 3ch' }}>
          <span><span className="dim">CASH</span> {fmt(OWN.cash)}</span>
          <span><span className="dim">PROFIT</span> <Delta value={OWN.lastProfit} /></span>
        </div>
        {state === 'summit' ? <div className="banner" role="status">Industry summit in session. Pacts are open.</div> : null}
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
          showEnded ? (
            <EndedCard />
          ) : showReveal ? (
            <RevealCard rank={ownRank} dShare={own ? own.dShare : 0} />
          ) : (
            <Desk
              locked={state === 'summit'}
              committedAt={state === 'committed' ? committedAt : null}
              pace={pace}
              setPace={setPace}
              safety={safety}
              setSafety={setSafety}
              card={card}
              target={target}
              setCard={(c, t) => {
                setCard(c);
                setTarget(t);
              }}
              sheet={sheet}
              setSheet={setSheet}
              onCommit={commit}
            />
          )
        ) : null}
        {tab === 'BOOK' ? <Book /> : null}
        {tab === 'PACTS' ? <PactList emphasis={state === 'summit'} /> : null}
        {tab === 'WIRE' ? <Wire /> : null}
      </main>
    </div>
  );
}

interface DeskProps {
  locked: boolean;
  committedAt: Date | null;
  pace: number;
  setPace: (n: number) => void;
  safety: number;
  setSafety: (n: number) => void;
  card: string;
  target: string | null;
  setCard: (c: string, t: string | null) => void;
  sheet: boolean;
  setSheet: (b: boolean) => void;
  onCommit: () => void;
}

function Desk(p: DeskProps) {
  const cost = mockEstimatedCost(p.pace, p.safety, p.card);
  const expo = exposureLabel(mockExposure(p.pace, p.safety));
  const targets = FIRMS.filter((f) => f.ticker !== OWN.ticker).map((f) => ({ ticker: f.ticker, name: f.name }));
  return (
    <div className="stack">
      <section className="stack" style={{ gap: '0.5lh' }} aria-label="Pace">
        <span className="dim">PACE</span>
        <Segmented4 label="Deployment pace" options={PACE_OPTIONS} value={p.pace} onChange={p.setPace} disabled={p.locked} />
      </section>
      <section className="stack" style={{ gap: '0.5lh' }} aria-label="Safety">
        <span className="dim">SAFETY · % of reference budget</span>
        <SafetySlider label="Safety spend" value={p.safety} onChange={p.setSafety} disabled={p.locked} />
      </section>
      <section className="stack" style={{ gap: '0.5lh' }} aria-label="Card">
        <span className="dim">CARD</span>
        <CardPicker
          cards={CARDS}
          value={p.card}
          target={p.target}
          onChange={p.setCard}
          lastCard={OWN.lastCard}
          lastTarget={OWN.lastTarget}
          insolvent={OWN.insolvent}
          targets={targets}
          open={p.sheet}
          onOpen={() => p.setSheet(true)}
          onClose={() => p.setSheet(false)}
        />
        <p className="dim">
          The same card cannot repeat in consecutive quarters. POACH needs a target and not the same target two quarters running. Insolvent firms cannot play cards.
        </p>
      </section>
      <section className="stack" style={{ gap: 0 }} aria-label="Estimate">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span className="dim">Estimated cost this quarter</span>
          <span>{fmt(cost)}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span className="dim">Public exposure</span>
          <span>{expo}</span>
        </div>
      </section>
      <div className="stack commit-bar" style={{ gap: '0.5lh' }}>
        <CommitButton state={p.locked ? 'locked' : p.committedAt ? 'committed' : 'idle'} onCommit={p.onCommit} />
        <p role="status" aria-live="polite" className="dim">
          {p.committedAt
            ? `Committed ${fmtTime(p.committedAt)} · edit until close · device ${OWN.device}`
            : p.locked
              ? 'Decisions are paused during the summit.'
              : 'Not committed. Keeps last quarter’s settings if left open.'}
        </p>
      </div>
    </div>
  );
}

function RevealCard({ rank, dShare }: { rank: number; dShare: number }) {
  return (
    <div className="stack">
      <section className="panel" aria-label="Quarter result">
        <div className="panel-title"><span>{`${quarterLabel(ROUND)} RESULT`}</span><span>RANK {rank}</span></div>
        <div className="panel-body pad">
          <dl className="kv">
            <dt>Revenue</dt><dd>{fmt(OWN_RESULT.revenue)}</dd>
            <dt>Costs</dt><dd>{fmt(OWN_RESULT.costs)}</dd>
            <dt>Profit</dt><dd><Delta value={OWN_RESULT.profit} /></dd>
            <dt>Share chg</dt><dd><Delta value={dShare} suffix=" pp" /></dd>
            <dt>Valuation</dt><dd>{fmt(OWN_RESULT.value)}</dd>
          </dl>
        </div>
      </section>
      <section className="panel" aria-label="Notices">
        <div className="panel-title"><span>NOTICES</span></div>
        <div className="panel-body pad">
          {OWN_RESULT.notices.map((n) => <p key={n}>{n}</p>)}
        </div>
      </section>
      <Wire count={4} />
    </div>
  );
}

function EndedCard() {
  const idx = RESULTS.findIndex((r) => r.ticker === OWN.ticker);
  const r = RESULTS[idx];
  const totalDepletion = RESULTS.reduce((a, x) => a + x.depletionShare, 0);
  if (!r) return null;
  return (
    <div className="stack">
      <section className="panel" aria-label="Final result">
        <div className="panel-title"><span>{OWN.ticker} FINAL</span><span>RANK {idx + 1}</span></div>
        <div className="panel-body pad">
          <dl className="kv">
            <dt>Valuation</dt><dd>{fmt(r.finalValue)}</dd>
            <dt>Alt path</dt><dd>{fmt(r.counterfactual)}</dd>
            <dt>Gap</dt><dd><Delta value={r.finalValue - r.counterfactual} /></dd>
            <dt>Damage share</dt><dd>{fmt((r.depletionShare / totalDepletion) * 100)}%</dd>
            <dt>Undetected</dt><dd>{r.undetected}</dd>
          </dl>
        </div>
      </section>
      <p className="notice">Watch the board for the full results.</p>
    </div>
  );
}

function Book() {
  const values = BOOK.map((b) => b.value);
  return (
    <div className="stack">
      <div>
        <span className="dim">VALUATION</span>
        <StepSparkline
          series={[{ values, label: 'Valuation', tone: 'signal' }]}
          min={Math.min(...values) - 10}
          max={Math.max(...values) + 10}
          w={36}
          h={6}
          description={`Own valuation by quarter, from ${fmt(values[0] ?? 0)} to ${fmt(values[values.length - 1] ?? 0)}`}
        />
      </div>
      <div className="scroll-x">
        <DataTable
          caption="Own quarterly results"
          rows={[...BOOK].reverse()}
          rowKey={(b) => String(b.round)}
          columns={[
            { key: 'q', label: 'QTR', w: 7, render: (b) => quarterLabel(b.round) },
            { key: 'rev', label: 'REV', w: 7, align: 'r', render: (b) => fmt(b.revenue) },
            { key: 'cost', label: 'COST', w: 7, align: 'r', render: (b) => fmt(b.costs) },
            { key: 'pl', label: 'P&L', w: 7, align: 'r', render: (b) => fmt(b.profit) },
            { key: 'val', label: 'VAL', w: 8, align: 'r', render: (b) => fmt(b.value) },
            { key: 'rk', label: 'RK', w: 4, align: 'r', render: (b) => b.rank },
          ]}
        />
      </div>
    </div>
  );
}

function PactList({ emphasis }: { emphasis: boolean }) {
  return (
    <div className="stack">
      <p className="dim">
        {emphasis ? 'Existing pacts. Proposing, joining and leaving arrive in a later build.' : 'Existing pacts. Read only in this build.'}
      </p>
      {PACTS.map((p) => (
        <section key={p.id} className="panel" aria-label={p.id}>
          <div className="panel-title"><Tag pact={p.id} /><span>{p.members.length} MBRS</span></div>
          <div className="panel-body pad">
            <dl className="kv">
              <dt>Max pace</dt><dd>{p.maxPace ?? '–'}</dd>
              <dt>Min safety</dt><dd>{p.minSafety ?? '–'}</dd>
              <dt>Members</dt><dd>{p.members.join(' ')}</dd>
            </dl>
          </div>
        </section>
      ))}
    </div>
  );
}

function Wire({ count }: { count?: number }) {
  const items = count ? HEADLINES.slice(0, count) : HEADLINES;
  return (
    <ul className="stack feed" style={{ listStyle: 'none', margin: 0, padding: 0, gap: '0.5lh' }} aria-label="Wire">
      {items.map((h, i) => (
        <li key={i}>
          <span className="dim">{quarterLabel(h.round)}</span>
          <br />
          <span className="wire-c">{h.text}</span>
        </li>
      ))}
    </ul>
  );
}
