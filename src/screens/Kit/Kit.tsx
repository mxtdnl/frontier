import { useRef, useState } from 'react';
import { CARDS, FIRMS, HEADLINES, PACE_OPTIONS, TRUST, TRUST_HISTORY, prevProfit, prevRank, prevShare, prevValue, valueHistory, type MockFirm } from '../../mock/fixtures';
import {
  Brand,
  PhaseBlock,
  StatusLine,
  CardPicker,
  CommitButton,
  CommandLine,
  Countdown,
  DataTable,
  Delta,
  FKeyBar,
  GlyphCheck,
  HBar,
  Panel,
  PresenceDot,
  QR,
  SafetySlider,
  Segmented4,
  LineChart,
  Tag,
  Ticker,
  TopBar,
} from '../../ui/components';
import { fmt, fmtShare } from '../../ui/format';
import { useLitRoom } from '../../ui/litRoom';
import { projectorKeys } from '../../ui/keys';
import { playReveal } from '../../ui/reveal';
import { boardColumns } from '../Screen/BoardView';
import type { BoardRow } from '../Screen/model';

const toRow = (f: MockFirm, i: number): BoardRow => ({
  id: f.ticker,
  ticker: f.ticker,
  name: f.name,
  rank: i + 1,
  prevIndex: prevRank(f),
  share: f.share,
  prevShare: prevShare(f),
  profit: f.profit,
  prevProfit: prevProfit(f),
  value: f.value,
  prevValue: prevValue(f),
  dValue: f.dValue,
  history: valueHistory(f),
  committed: f.committed,
  auto: f.tags.includes('AUTO'),
  insolvent: f.tags.includes('INSOLV'),
  bot: f.tags.includes('BOT'),
  pacts: f.pacts,
  breach: f.breach,
  disclosed: { pace: f.pace as 1 | 2 | 3 | 4, safety: f.safety, expo: f.expo },
});

/** Every component in every state (spec §16.3), plus the reveal simulator (§16.5). */
export function Kit() {
  const [lit, setLit] = useState(false);
  useLitRoom(lit);
  const [pace, setPace] = useState(2);
  const [safety, setSafety] = useState(10);
  const [card, setCard] = useState('NONE');
  const [target, setTarget] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [revealOn, setRevealOn] = useState(false);
  const revealRoot = useRef<HTMLDivElement>(null);
  const running = useRef<{ cancel: () => void } | null>(null);
  const [commit, setCommit] = useState<'idle' | 'committed' | 'locked'>('idle');
  const deadline = useRef(Date.now() + 107_000);

  const simulate = () => {
    running.current?.cancel();
    setRevealOn(true);
    // Wait one frame so previous values and row order are in the DOM.
    requestAnimationFrame(() => {
      if (!revealRoot.current) return;
      const run = playReveal(revealRoot.current);
      running.current = run;
      void run.done.then(() => setRevealOn(false));
    });
  };
  const reset = () => {
    running.current?.cancel();
    setRevealOn(false);
  };

  const demoDelta = TRUST.value - TRUST.prev;
  const sample = FIRMS.slice(0, 8).map(toRow);

  return (
    <div className="page stack">
      <header className="row">
        <h1 className="signal">KIT</h1>
        <span className="dim">Components in all states. Static preview.</span>
        <label className="field check">
          <input type="checkbox" checked={lit} onChange={(e) => setLit(e.target.checked)} />
          <span>Lit-room mode</span>
        </label>
      </header>

      <Panel title="REVEAL" bodyClassName="pad">
        <div className="stack">
          <div className="row">
            <button type="button" className="btn btn-signal" onClick={simulate}>Simulate reveal</button>
            <button type="button" className="btn" onClick={reset}>Reset</button>
            <span className="dim">Rolls numbers, swaps rows, inverts trust. Instant under reduced motion.</span>
          </div>
          <div ref={revealRoot} className="stack" style={{ fontSize: '16px' }}>
            <div className="big signal" data-trust-numerals="" data-trust-delta={demoDelta.toFixed(1)}>
              <span data-roll="" data-prev={revealOn ? fmt(TRUST.prev) : undefined}>{fmt(TRUST.value)}</span>
            </div>
            <DataTable
              caption="Reveal sample"
              columns={boardColumns(false, revealOn).slice(0, 6)}
              rows={sample}
              rowKey={(f) => f.id}
              prevIndex={revealOn ? (f) => f.prevIndex : undefined}
            />
          </div>
        </div>
      </Panel>

      <div className="cols-2">
        <Panel title="TOPBAR / COMMANDLINE / FKEYBAR" bodyClassName="pad">
          <div className="stack">
            <TopBar>
              <Brand />
              <CommandLine onSubmit={() => {}} onEscape={() => {}} />
              <span>Q3 Y2</span>
              <PhaseBlock kind="open" word="OPEN" />
              <span className="tb-clock">T-01:42</span>
            </TopBar>
            <StatusLine text="Q3 Y2 resolved · Trust ▼5.9 to 45.6 · BTC takes 1st · 2 incidents." />
            <div className="row">
              {(['lobby', 'briefing', 'open', 'resolving', 'reveal', 'summit', 'ended'] as const).map((k) => (
                <PhaseBlock key={k} kind={k} word={k.toUpperCase()} />
              ))}
            </div>
            <span className="dim">Tab to the command line to show it. Keys for an open quarter on the board:</span>
            <FKeyBar onAction={() => {}} keys={projectorKeys({ phase: 'open', view: 'board', activePacts: 1 })} />
          </div>
        </Panel>

        <Panel title="TAG / PRESENCEDOT / DELTA" bodyClassName="pad">
          <div className="stack">
            <div><Tag kind="BOT" /><Tag kind="AUTO" /><Tag kind="BREACH" /><Tag kind="INSOLV" /><Tag pact="PACT-A" /></div>
            <div className="row">
              <span><PresenceDot online /> online</span>
              <span><PresenceDot online={false} /> offline</span>
              <span><GlyphCheck /> committed</span>
            </div>
            <div className="row">
              <Delta value={6.3} />
              <Delta value={-6.3} />
              <Delta value={0} />
              <Delta value={2.4} suffix=" pp" />
            </div>
          </div>
        </Panel>

        <Panel title="DATATABLE" bodyClassName="pad">
          <DataTable
            caption="Sample table"
            columns={[
              { key: 'f', label: 'FIRM', w: 8, render: (f) => f.ticker },
              { key: 's', label: 'SHARE', w: 9, align: 'r', render: (f) => fmtShare(f.share) },
              { key: 'v', label: 'VALUE', w: 9, align: 'r', render: (f) => fmt(f.value) },
              { key: 'c', label: 'CHG', w: 0, align: 'r', render: (f) => <Delta value={f.dValue} /> },
            ]}
            rows={FIRMS.slice(0, 4)}
            rowKey={(f) => f.ticker}
            isOwn={(f) => f.ticker === 'CYRA'}
          />
        </Panel>

        <Panel title="LINECHART / HBAR" bodyClassName="pad">
          <div className="stack">
            <LineChart series={[{ values: TRUST_HISTORY, label: 'Trust' }]} domain="trust" changeStrip alarmDrop={5} height="14lh" description="Trust by quarter with change strip" />
            <LineChart
              series={[
                { values: TRUST_HISTORY, label: 'ACTUAL', tone: 'signal' },
                { values: [90, 90.4, 90.9, 91.2, 91.6, 92, 92.3], label: 'ALTERNATIVE', tone: 'wire' },
              ]}
              domain="trust"
              hatchBetween
              endLabels
              marker={{ index: 4, label: 'MORATORIUM Q4 Y1' }}
              reference={{ value: 50, label: 'Reference line at 50', band: true }}
              height="14lh"
              description="Two series with hatch, marker and reference line"
            />
            <LineChart series={[{ values: [150, 120, 60, -20, -75], label: 'Valuation', tone: 'wire' }]} domain="zero" height="10lh" description="Valuation crossing zero" />
            <LineChart series={[{ values: [150], label: 'Valuation', tone: 'signal' }]} domain="zero" startQuarter={1} height="4lh" description="One quarter" />
            <HBar label="MKT" value={0.79} text="1,184" />
            <HBar label="VAL" value={0.4} text="40.0%" tone="signal" marker={0.7} />
            <HBar label="DMG" value={-35} domain={[-50, 100]} text="−35.0" tone="signal" marker={60} markerTone="wire" />
          </div>
        </Panel>

        <Panel title="TICKER" bodyClassName="pad">
          <Ticker items={HEADLINES.map((h) => ({ text: h.text, round: h.round, tone: /breached|outage|administration/.test(h.text) ? ('down' as const) : ('wire' as const) }))} />
        </Panel>

        <Panel title="COUNTDOWN / QR" bodyClassName="pad">
          <div className="row">
            <span>Running: <Countdown deadline={deadline.current} /></span>
            <span>Paused: <Countdown deadline={0} frozenMs={107000} /></span>
          </div>
          <div style={{ width: '20ch', marginTop: '1lh' }}>
            <QR text="https://example.invalid/#/j/KXMT" label="Sample code" />
          </div>
        </Panel>

        <Panel title="SEGMENTED4 / SAFETYSLIDER" bodyClassName="pad">
          <div className="stack">
            <Segmented4 label="Pace" options={PACE_OPTIONS} value={pace} onChange={setPace} />
            <Segmented4 label="Pace (disabled)" options={PACE_OPTIONS} value={3} onChange={() => {}} disabled />
            <SafetySlider label="Safety" value={safety} onChange={setSafety} />
            <SafetySlider label="Safety (disabled)" value={12} onChange={() => {}} disabled />
          </div>
        </Panel>

        <Panel title="CARDPICKER / COMMITBUTTON" bodyClassName="pad">
          <div className="stack">
            <CardPicker
              cards={CARDS}
              value={card}
              target={target}
              onChange={(c, t) => {
                setCard(c);
                setTarget(t);
              }}
              lastCard="PUBLISH"
              lastTarget="ARCN"
              insolvent={false}
              targets={FIRMS.map((f) => ({ ticker: f.ticker, name: f.name }))}
              open={sheet}
              onOpen={() => setSheet(true)}
              onClose={() => setSheet(false)}
            />
            <CommitButton state={commit} onCommit={() => setCommit('committed')} />
            <div className="row">
              <button type="button" className="btn" onClick={() => setCommit('idle')}>Idle</button>
              <button type="button" className="btn" onClick={() => setCommit('committed')}>Committed</button>
              <button type="button" className="btn" onClick={() => setCommit('locked')}>Locked</button>
            </div>
          </div>
        </Panel>
      </div>
      <p className="dim">
        Reveal values come from the sample board. Previous profit {fmt(prevProfit(FIRMS[0]!))}, previous share {fmtShare(prevShare(FIRMS[0]!))}, previous value {fmt(prevValue(FIRMS[0]!))}.
      </p>
    </div>
  );
}
