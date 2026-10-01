import { useCallback, useEffect } from 'react';
import {
  COLLAPSE_INDEX,
  DEBRIEF_PROMPTS,
  OWN_TICKER,
  PACTS,
  RESULTS,
  TAU,
  TRUST_ACTUAL,
  TRUST_ALT,
} from '../../mock/fixtures';
import { setQueryParam, useRoute } from '../../router';
import { DataTable, Delta, FKeyBar, HBar, Panel, StepSparkline, Tag, TopBar } from '../../ui/components';
import { fmt, fmtShare, quarterLabel } from '../../ui/format';
import { matchKey, type KeyAction } from '../../ui/keys';
import { useLitRoom } from '../../ui/litRoom';

export const RESULT_PANELS = ['FINAL BOARD', 'TRUST TRACE', 'COUNTERFACTUAL', 'ATTRIBUTION', 'PACT RECORD', 'DEBRIEF'] as const;

const ranked = [...RESULTS].sort((a, b) => b.finalValue - a.finalValue);
const totalFinal = RESULTS.reduce((a, r) => a + r.finalValue, 0);
const totalCf = RESULTS.reduce((a, r) => a + r.counterfactual, 0);
const maxCf = Math.max(...RESULTS.map((r) => r.counterfactual));

/** Results sequence (spec §14.4), stepped with F9. Static data in this build. */
export function Results() {
  const route = useRoute();
  const panel = Math.min(6, Math.max(1, Number(route.query.get('panel') ?? '1') || 1));
  const showTau = route.query.get('tau') === 'on';
  useLitRoom(route.query.get('lit') === '1');

  const act = useCallback(
    (a: KeyAction) => {
      if (a === 'advance') setQueryParam('panel', String(Math.min(6, panel + 1)));
    },
    [panel],
  );
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const a = matchKey(e, false);
      if (a) {
        e.preventDefault();
        act(a);
      }
      if (e.key === 'Escape' && panel > 1) setQueryParam('panel', String(panel - 1));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [act, panel]);

  const title = RESULT_PANELS[panel - 1];
  return (
    <div className="scr-wrap">
      <div className="scr">
        <TopBar>
          <span>RESULTS</span>
          <span className="sep">|</span>
          <span>{panel}/6</span>
          <span className="sep">|</span>
          <span>{title}</span>
        </TopBar>
        <div style={{ display: 'grid', minHeight: 0 }}>
          <div className="scr-main is-single">
            {panel === 1 ? <FinalBoard /> : null}
            {panel === 2 ? <TrustTrace showTau={showTau} /> : null}
            {panel === 3 ? <Counterfactual /> : null}
            {panel === 4 ? <Attribution /> : null}
            {panel === 5 ? <PactRecord /> : null}
            {panel === 6 ? <Debrief /> : null}
          </div>
        </div>
        <div />
        <FKeyBar onAction={act} />
      </div>
    </div>
  );
}

function FinalBoard() {
  const peak = Math.max(...ranked.map((r) => r.peakValue));
  return (
    <Panel title="FINAL BOARD · ranked by final valuation" bodyClassName="pad">
      <div className="stack" style={{ gap: 0 }}>
        <div className="row dim" style={{ flexWrap: 'nowrap' }}>
          <span style={{ width: '4ch' }}>#</span>
          <span style={{ width: '8ch' }}>FIRM</span>
          <span style={{ flex: 1 }}>FINAL (bar) · PEAK (marker)</span>
          <span style={{ width: '10ch', textAlign: 'right' }}>FINAL</span>
          <span style={{ width: '10ch', textAlign: 'right' }}>PEAK</span>
        </div>
        {ranked.map((r, i) => (
          <div key={r.ticker} style={{ display: 'flex', alignItems: 'center', height: '2lh' }}>
            <span style={{ width: '4ch' }}>{i + 1}</span>
            <span style={{ width: '8ch' }} className={r.ticker === OWN_TICKER ? 'signal' : ''}>{r.ticker}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <HBar label="" labelW={0} textW={0} value={r.finalValue / peak} marker={r.peakValue / peak} tone="signal" text="" describe={`${r.ticker} final ${fmt(r.finalValue)}, peak ${fmt(r.peakValue)}`} />
            </div>
            <span style={{ width: '10ch', textAlign: 'right' }}>{fmt(r.finalValue)}</span>
            <span style={{ width: '10ch', textAlign: 'right' }} className="dim">{fmt(r.peakValue)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TrustTrace({ showTau }: { showTau: boolean }) {
  return (
    <Panel title="TRUST TRACE" right={`marker: moratorium ${quarterLabel(COLLAPSE_INDEX + 1)}`} bodyClassName="pad">
      <div className="chart">
        <div className="chart-y" style={{ height: '20lh' }}>
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
        <StepSparkline
          series={[{ values: TRUST_ACTUAL, label: 'Trust', tone: 'signal' }]}
          min={0}
          max={100}
          w={130}
          h={20}
          markAt={COLLAPSE_INDEX}
          refLine={showTau ? TAU : undefined}
          description={`Public trust by quarter. Moratorium in ${quarterLabel(COLLAPSE_INDEX + 1)}.`}
        />
        <div className="chart-x">
          <span>{quarterLabel(1)}</span>
          <span>{quarterLabel(TRUST_ACTUAL.length)}</span>
        </div>
      </div>
      {showTau ? <p className="dim" style={{ marginTop: '1lh' }}>Dashed line: tau, {fmt(TAU, 0)}.</p> : null}
    </Panel>
  );
}

function Counterfactual() {
  const destroyed = totalCf - totalFinal;
  return (
    <Panel title="COUNTERFACTUAL · industry actual vs sustainable path" bodyClassName="pad">
      <div className="stack">
        <div className="row" style={{ gap: '4ch' }}>
          <span><span className="dim">ACTUAL</span> {fmt(totalFinal, 0)}</span>
          <span><span className="dim">SUSTAINABLE</span> {fmt(totalCf, 0)}</span>
          <span><span className="dim">DESTROYED</span> <Delta value={-destroyed} digits={0} /> ({fmt((destroyed / totalCf) * 100, 0)}%)</span>
        </div>
        <div className="chart">
          <div className="chart-y" style={{ height: '6lh' }}>
            <span>100</span>
            <span>0</span>
          </div>
          <StepSparkline
            series={[
              { values: TRUST_ALT, label: 'Sustainable path', tone: 'wire' },
              { values: TRUST_ACTUAL, label: 'Actual', tone: 'signal' },
            ]}
            min={0}
            max={100}
            w={130}
            h={6}
            description="Trust: actual path against the sustainable path, by quarter"
          />
          <div className="chart-x"><span>{quarterLabel(1)}</span><span>{quarterLabel(TRUST_ACTUAL.length)}</span></div>
        </div>
        <div className="stack" style={{ gap: 0 }}>
          <div className="dim row" style={{ flexWrap: 'nowrap' }}><span style={{ width: '8ch' }}>FIRM</span><span>SUST = sustainable path (blue) · ACT = actual (signal)</span></div>
          {ranked.map((r) => (
            <div key={r.ticker} className="stack" style={{ gap: 0 }}>
              <HBar label={r.ticker} value={r.counterfactual / maxCf} tone="wire" text={`${fmt(r.counterfactual, 0)} SUST`} textW={10} describe={`${r.ticker} sustainable path ${fmt(r.counterfactual, 0)}`} />
              <HBar label="" value={r.finalValue / maxCf} tone="signal" text={`${fmt(r.finalValue, 0)} ACT`} textW={10} describe={`${r.ticker} actual ${fmt(r.finalValue, 0)}`} />
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function Attribution() {
  return (
    <Panel title="ATTRIBUTION · share of depletion vs share of value" bodyClassName="pad">
      <div className="stack" style={{ gap: 0 }}>
        <div className="dim row" style={{ flexWrap: 'nowrap' }}><span style={{ width: '8ch' }}>FIRM</span><span>DEPL = share of depletion (red) · VAL = share of value (signal)</span></div>
        {ranked.map((r) => {
          const vs = r.finalValue / totalFinal;
          return (
            <div key={r.ticker} style={{ marginBottom: '0.5lh' }}>
              <HBar label={r.ticker} value={r.depletionShare} tone="down" text={`${fmtShare(r.depletionShare)} DEPL`} textW={12} describe={`${r.ticker} share of depletion ${fmtShare(r.depletionShare)}`} />
              <HBar label="" value={vs} tone="signal" text={`${fmtShare(vs)} VAL`} textW={12} describe={`${r.ticker} share of value ${fmtShare(vs)}`} />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function PactRecord() {
  return (
    <Panel title="PACT RECORD · undetected violations now shown" bodyClassName="pad">
      <DataTable
        caption="Pact record"
        tall
        rows={PACTS}
        rowKey={(p) => p.id}
        columns={[
          { key: 'id', label: 'PACT', w: 9, render: (p) => <Tag pact={p.id} /> },
          { key: 't', label: 'TERMS', w: 28, render: (p) => `max pace ${p.maxPace ?? '–'} · min safety ${p.minSafety ?? '–'}` },
          { key: 'm', label: 'MEMBERS', w: 28, render: (p) => p.members.join(' ') },
          { key: 'd', label: 'DETECTED', w: 10, align: 'r', render: (p) => RESULTS.filter((r) => p.members.includes(r.ticker)).reduce((a, r) => a + r.detected, 0) },
          { key: 'u', label: 'UNDETECTED', w: 0, align: 'r', render: (p) => RESULTS.filter((r) => p.members.includes(r.ticker)).reduce((a, r) => a + r.undetected, 0) },
        ]}
      />
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
