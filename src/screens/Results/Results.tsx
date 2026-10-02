import { useCallback, useEffect, useRef, useState } from 'react';
import type { FinalResults } from '../../engine';
import { stepResults, type ActionResult } from '../../firebase/orchestrator';
import { RESULT_PANEL_COUNT } from '../../firebase/phases';
import { navigate, useRoute } from '../../router';
import { usePublic, useResults } from '../../state';
import { useMeta, useOrchestrator, useResultsPublisher } from '../../state/facilitator';
import { DataTable, Delta, FKeyBar, HBar, Panel, StepSparkline, TopBar } from '../../ui/components';
import { fmt, fmtShare, quarterLabel } from '../../ui/format';
import { matchKey, type KeyAction } from '../../ui/keys';
import { useLitRoom } from '../../ui/litRoom';
import { FacilitatorGate } from '../Auth/FacilitatorGate';
import {
  DEBRIEF_PROMPTS,
  RESULT_PANELS,
  barFraction,
  counterfactualTrustSeries,
  destroyedShare,
  pactLines,
  rankedFirms,
  tickerOf,
  trustSeries,
} from './model';

export { RESULT_PANELS };

/** Results sequence (spec §14.4) on the projector, stepped with F9. Facilitator sign-in required. */
export function Results() {
  const { segments } = useRoute();
  const g = segments[1] ?? null;
  if (!g) {
    return (
      <div className="page stack">
        <p className="notice err" role="alert">No session in the address. Open the results from the control console.</p>
        <a href="#/new">NEW SESSION</a>
      </div>
    );
  }
  return <FacilitatorGate>{(uid) => <LiveResults g={g} uid={uid} />}</FacilitatorGate>;
}

function LiveResults({ g, uid }: { g: string; uid: string }) {
  const pubSub = usePublic(g);
  const metaSub = useMeta(g);
  const pub = pubSub.data;
  const meta = metaSub.data;
  const ended = pub?.phase === 'ended';
  const resultsSub = useResults(ended ? g : null);
  const results = resultsSub.data;
  const ctx = useOrchestrator(g, uid);
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const step = ended && pub ? Math.min(RESULT_PANEL_COUNT - 1, Math.max(0, pub.revealStep)) : 0;
  const stepRef = useRef(step);
  stepRef.current = step;

  useLitRoom(meta?.settings.litRoom ?? false);
  useResultsPublisher(ctx, pub?.phase ?? null, (r: ActionResult) => setNotice(r.message));

  const move = useCallback(
    (delta: 1 | -1) => {
      if (busy.current) return;
      busy.current = true;
      stepResults(ctx, delta)
        .then((r) => setNotice(r.ok ? '' : r.message), () => setNotice('The panel did not change. Check the connection and press the key again.'))
        .finally(() => {
          busy.current = false;
        });
    },
    [ctx],
  );

  const act = useCallback(
    (a: KeyAction) => {
      if (a === 'advance') move(1);
      else if (a === 'board') navigate(`#/screen/${g}`);
    },
    [move, g],
  );

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const a = matchKey(e, false);
      if (a === 'advance' || a === 'board') {
        e.preventDefault();
        act(a);
      } else if (e.key === 'Escape' && stepRef.current > 0) {
        move(-1);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [act, move]);

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

  const title = RESULT_PANELS[step];
  let body;
  if (!ended) {
    body = (
      <Panel title="RESULTS" bodyClassName="pad">
        <p>The session is still running. Results appear here after it ends.</p>
        <a href={`#/screen/${g}`}>BOARD</a>
      </Panel>
    );
  } else if (!results) {
    body = (
      <Panel title="RESULTS" bodyClassName="pad">
        <p role="status">{resultsSub.error ? 'Results cannot be read. Reload the page.' : 'Results are being prepared.'}</p>
      </Panel>
    );
  } else {
    body = (
      <>
        {step === 0 ? <FinalBoard r={results} /> : null}
        {step === 1 ? <TrustTrace r={results} /> : null}
        {step === 2 ? <Counterfactual r={results} /> : null}
        {step === 3 ? <Attribution r={results} /> : null}
        {step === 4 ? <PactRecord r={results} /> : null}
        {step === 5 ? <Debrief /> : null}
      </>
    );
  }

  return (
    <div className="scr-wrap">
      <div className="scr">
        <TopBar>
          <span>RESULTS</span>
          <span className="sep">|</span>
          <span>{ended ? step + 1 : 0}/{RESULT_PANEL_COUNT}</span>
          <span className="sep">|</span>
          <span>{ended ? title : 'PENDING'}</span>
          <span className="grow topbar-notice" role="status" aria-live="polite">
            {notice}
          </span>
        </TopBar>
        <div style={{ display: 'grid', minHeight: 0 }}>
          <div className="scr-main is-single">{body}</div>
        </div>
        <div />
        <FKeyBar onAction={act} />
      </div>
    </div>
  );
}

export function FinalBoard({ r }: { r: FinalResults }) {
  const firms = rankedFirms(r);
  const top = Math.max(1, ...firms.map((f) => Math.max(f.valuation, f.peakValuation)));
  return (
    <Panel title="FINAL BOARD · ranked by final valuation" right={`${r.rounds} QTR`} bodyClassName="pad">
      <div className="stack" style={{ gap: 0 }}>
        <div className="row dim" style={{ flexWrap: 'nowrap' }}>
          <span style={{ width: '4ch' }}>#</span>
          <span style={{ width: '8ch' }}>FIRM</span>
          <span style={{ flex: 1 }}>FINAL (bar) · PEAK (marker)</span>
          <span style={{ width: '10ch', textAlign: 'right' }}>FINAL</span>
          <span style={{ width: '10ch', textAlign: 'right' }}>PEAK</span>
        </div>
        {firms.map((f) => (
          <div key={f.firmId} style={{ display: 'flex', alignItems: 'center', height: '2lh' }}>
            <span style={{ width: '4ch' }}>{f.rank}</span>
            <span style={{ width: '8ch' }} >{f.ticker}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <HBar
                label=""
                labelW={0}
                textW={0}
                value={barFraction(f.valuation, top)}
                marker={barFraction(f.peakValuation, top)}
                tone="signal"
                text=""
                describe={`${f.ticker} rank ${f.rank}, final ${fmt(f.valuation)}, peak ${fmt(f.peakValuation)}`}
              />
            </div>
            <span style={{ width: '10ch', textAlign: 'right' }}>{fmt(f.valuation)}</span>
            <span style={{ width: '10ch', textAlign: 'right' }} className="dim">{fmt(f.peakValuation)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function TrustTrace({ r }: { r: FinalResults }) {
  const series = trustSeries(r);
  const marker = r.collapseRound;
  return (
    <Panel
      title="TRUST TRACE"
      right={marker !== null ? `marker: collapse ${quarterLabel(marker)}` : 'no collapse'}
      bodyClassName="pad"
    >
      <div className="chart">
        <div className="chart-y" style={{ height: '20lh' }}>
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
        <StepSparkline
          series={[{ values: series, label: 'Trust', tone: 'signal' }]}
          min={0}
          max={100}
          w={130}
          h={20}
          markAt={marker ?? undefined}
          refLine={r.tau ?? undefined}
          description={`Public trust by quarter, from ${fmt(r.startTrust)} to ${fmt(r.trust[r.trust.length - 1] ?? r.startTrust)}. ${
            marker !== null ? `Collapse in ${quarterLabel(marker)}.` : 'No collapse.'
          }`}
        />
        <div className="chart-x">
          <span>START</span>
          <span>{quarterLabel(Math.max(1, r.rounds))}</span>
        </div>
      </div>
      {r.tau !== null ? <p className="dim" style={{ marginTop: '1lh' }}>Dashed line: tau, {fmt(r.tau, 0)}.</p> : null}
    </Panel>
  );
}

export function Counterfactual({ r }: { r: FinalResults }) {
  const firms = rankedFirms(r);
  const top = Math.max(1, ...firms.map((f) => Math.max(f.valuation, f.counterfactual)));
  const share = destroyedShare(r);
  return (
    <Panel title="COUNTERFACTUAL · industry actual vs sustainable path" bodyClassName="pad">
      <div className="stack">
        <div className="row" style={{ gap: '4ch' }}>
          <span><span className="dim">INDUSTRY VALUE</span> {fmt(r.industry.actual, 0)}</span>
          <span><span className="dim">SUSTAINABLE</span> {fmt(r.industry.counterfactual, 0)}</span>
          <span>
            <span className="dim">VALUE DESTROYED</span> <Delta value={-r.industry.destroyed} digits={0} />
            {share !== null ? ` (${fmt(share * 100, 0)}%)` : ''}
          </span>
        </div>
        <div className="chart">
          <div className="chart-y" style={{ height: '6lh' }}>
            <span>100</span>
            <span>0</span>
          </div>
          <StepSparkline
            series={[
              { values: counterfactualTrustSeries(r), label: 'Sustainable path', tone: 'wire' },
              { values: trustSeries(r), label: 'Actual', tone: 'signal' },
            ]}
            min={0}
            max={100}
            w={130}
            h={6}
            description="Trust: actual path against the sustainable path, by quarter"
          />
          <div className="chart-x"><span>START</span><span>{quarterLabel(Math.max(1, r.rounds))}</span></div>
        </div>
        <div className="stack" style={{ gap: 0 }}>
          <div className="dim row" style={{ flexWrap: 'nowrap' }}><span style={{ width: '8ch' }}>FIRM</span><span>SUST = sustainable path (blue) · ACT = actual (signal)</span></div>
          {firms.map((f) => (
            <div key={f.firmId} className="stack" style={{ gap: 0 }}>
              <HBar label={f.ticker} value={barFraction(f.counterfactual, top)} tone="wire" text={`${fmt(f.counterfactual, 0)} SUST`} textW={12} describe={`${f.ticker} sustainable path ${fmt(f.counterfactual, 0)}`} />
              <HBar label="" value={barFraction(f.valuation, top)} tone="signal" text={`${fmt(f.valuation, 0)} ACT`} textW={12} describe={`${f.ticker} actual ${fmt(f.valuation, 0)}`} />
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function Attribution({ r }: { r: FinalResults }) {
  return (
    <Panel title="ATTRIBUTION · share of depletion vs share of value" bodyClassName="pad">
      <div className="stack" style={{ gap: 0 }}>
        <div className="dim row" style={{ flexWrap: 'nowrap' }}><span style={{ width: '8ch' }}>FIRM</span><span>DEPL = share of depletion (red) · VAL = share of value (signal)</span></div>
        {r.attribution.map((a) => {
          const t = tickerOf(r, a.firmId);
          return (
            <div key={a.firmId} style={{ marginBottom: '0.5lh' }}>
              <HBar label={t} value={a.drawShare} tone="down" text={`${fmtShare(a.drawShare)} DEPL`} textW={14} describe={`${t} share of depletion ${fmtShare(a.drawShare)}`} />
              <HBar label="" value={a.valueShare} tone="signal" text={`${fmtShare(a.valueShare)} VAL`} textW={14} describe={`${t} share of value ${fmtShare(a.valueShare)}`} />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function PactRecord({ r }: { r: FinalResults }) {
  const lines = pactLines(r);
  return (
    <Panel title="PACT RECORD · undetected violations now shown" bodyClassName="pad">
      {lines.length === 0 ? <p>No pacts were formed.</p> : null}
      {lines.length > 0 ? (
        <div className="stack">
          <DataTable
            caption="Pact record"
            tall
            rows={lines}
            rowKey={(l) => l.pact.pactId}
            columns={[
              { key: 'id', label: 'PACT', w: 9, render: (l) => l.pact.name },
              { key: 't', label: 'TERMS', w: 28, render: (l) => `max pace ${l.pact.terms.maxPace ?? '–'} · min safety ${l.pact.terms.minSafety ?? '–'}` },
              { key: 'm', label: 'MEMBERS', w: 28, render: (l) => l.members },
              { key: 'd', label: 'DETECTED', w: 12, align: 'r', render: (l) => l.pact.detected },
              { key: 'u', label: 'UNDETECTED', w: 14, align: 'r', render: (l) => l.pact.undetected },
              { key: 'sp', label: '', w: 3, render: () => '' },
              { key: 'b', label: 'BY FIRM', w: 0, render: (l) => l.undetectedBy.join(' · ') || '–' },
            ]}
          />
          <p className="dim">Counts are quarters in which a member broke the terms. Undetected means no audit examined that quarter.</p>
        </div>
      ) : null}
    </Panel>
  );
}

function Debrief() {
  return (
    <Panel title="DEBRIEF" bodyClassName="pad">
      <ol className="stack" style={{ margin: 0, paddingLeft: '4ch', gap: '1lh' }}>
        {DEBRIEF_PROMPTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
    </Panel>
  );
}
