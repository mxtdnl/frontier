import { useCallback, useEffect, useRef, useState } from 'react';
import { PACT_QUARTER, PARAMS, type FinalResults, type PactFinal, type PactQuarterCode } from '../../engine';
import { stepResults, type ActionResult } from '../../firebase/orchestrator';
import { RESULT_PANEL_COUNT } from '../../firebase/phases';
import { navigate, useRoute } from '../../router';
import { usePublic, useResults } from '../../state';
import { useMeta, useOrchestrator, useResultsPublisher } from '../../state/facilitator';
import { niceDomain } from '../../ui/chart';
import { tickerLine } from '../../ui/layout';
import { Brand, DataTable, FKeyBar, HBar, LineChart, Panel, PhaseBlock, TopBar } from '../../ui/components';
import { fmt, quarterLabel } from '../../ui/format';
import { matchKey, resultsKeys, type KeyAction } from '../../ui/keys';
import { useLitRoom } from '../../ui/litRoom';
import { FacilitatorGate } from '../Auth/FacilitatorGate';
import { Butterfly, Dumbbell } from './charts';
import { DEBRIEF_HEADLINE, attributionHeadline, counterfactualHeadline, finalBoardHeadline, pactHeadline, trustHeadline } from './headlines';
import {
  DEBRIEF_PROMPTS,
  RESULT_PANELS,
  attributionView,
  counterfactualTrustSeries,
  finalBoardRows,
  headlineFigures,
  pactLines,
  pactStripRows,
  rankedFirms,
  trustSeries,
  type PactStripRow,
} from './model';

export { RESULT_PANELS };

const SCROLL_KEYS: ReadonlySet<string> = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End']);

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
      } else if (SCROLL_KEYS.has(e.key)) {
        // A long FINAL BOARD or COUNTERFACTUAL list scrolls with the arrow, page and Home/End keys (§14.4).
        const list = document.querySelector<HTMLElement>('[data-res-scroll]');
        if (!list || list.scrollHeight <= list.clientHeight) return;
        e.preventDefault();
        const row = parseFloat(getComputedStyle(list).fontSize) * 1.35 * 1.5;
        const pageBy = list.clientHeight * 0.8;
        if (e.key === 'Home') list.scrollTop = 0;
        else if (e.key === 'End') list.scrollTop = list.scrollHeight;
        else list.scrollBy({ top: e.key === 'ArrowDown' ? row : e.key === 'ArrowUp' ? -row : e.key === 'PageDown' ? pageBy : -pageBy });
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
          <Brand />
          <PhaseBlock kind="ended" word="RESULTS" />
          <span data-results-pos="">{ended ? step + 1 : 0}/{RESULT_PANEL_COUNT}</span>
          <span>{ended ? title : 'PENDING'}</span>
          <span className="grow topbar-notice" role="status" aria-live="polite">
            {notice}
          </span>
        </TopBar>
        <div style={{ display: 'grid', minHeight: 0 }}>
          <div className="scr-main is-single">{body}</div>
        </div>
        <div />
        <FKeyBar onAction={act} keys={resultsKeys(step >= RESULT_PANEL_COUNT - 1)} />
      </div>
    </div>
  );
}

/** The panel's one-sentence point, written from the data (§14.4). */
function Headline({ text }: { text: string }) {
  return (
    <p className="res-headline" data-headline="">
      {text}
    </p>
  );
}

export function FinalBoard({ r }: { r: FinalResults }) {
  return (
    <Panel title="FINAL BOARD · ranked by final valuation" right={`peak → final valuation · ${r.rounds} QTR`} bodyClassName="pad col">
      <Headline text={finalBoardHeadline(r)} />
      <Dumbbell rows={finalBoardRows(r)} />
    </Panel>
  );
}

export function TrustTrace({ r }: { r: FinalResults }) {
  const series = trustSeries(r);
  const marker = r.collapseRound;
  const last = r.trust[r.trust.length - 1] ?? r.startTrust;
  return (
    <Panel
      title="TRUST TRACE"
      right={`${marker !== null ? `moratorium from ${quarterLabel(marker)}` : 'no moratorium'}${r.tau !== null ? ' · τ revealed' : ''}`}
      bodyClassName="pad col"
    >
      <Headline text={trustHeadline(r)} />
      <LineChart
        series={[{ values: series, label: 'Trust', tone: 'signal' }]}
        domain="trust"
        alarmDrop={5}
        changeStrip
        marker={marker !== null ? { index: marker, label: `MORATORIUM ${quarterLabel(marker)}` } : undefined}
        reference={r.tau !== null ? { value: r.tau, label: `τ ${fmt(r.tau)} · a moratorium starts below this line`, band: true } : undefined}
        description={`Public trust by quarter, from ${fmt(r.startTrust)} to ${fmt(last)}. ${
          marker !== null ? `Moratorium from ${quarterLabel(marker)}.` : 'No moratorium.'
        }${r.tau !== null ? ` Threshold ${fmt(r.tau)}.` : ''}`}
      />
    </Panel>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'wire' | 'down' | 'up' }) {
  return (
    <div className="fig" data-figure={label}>
      <div className="dim">{label}</div>
      <div className={`fig-v${tone ? ` t-${tone}` : ''}`}>{value}</div>
      <div className="dim">{sub || '\u00a0'}</div>
    </div>
  );
}

export function Counterfactual({ r }: { r: FinalResults }) {
  const firms = rankedFirms(r);
  const f = headlineFigures(r);
  const alt = PARAMS.BOT_SUSTAINABLE;
  const { domain } = niceDomain(
    Math.min(0, ...firms.flatMap((x) => [x.valuation, x.counterfactual])),
    Math.max(0, ...firms.flatMap((x) => [x.valuation, x.counterfactual])),
    4,
  );
  const right = `same incident draws · every firm at pace ${alt.pace}, safety ${alt.safety}`;
  return (
    <Panel title="COUNTERFACTUAL" right={right} bodyClassName="pad col">
      <Headline text={counterfactualHeadline(r, alt)} />
      <div className="figs">
        <Figure label="INDUSTRY VALUE" value={fmt(f.actual, 0)} sub="actual, all firms" tone={f.actual < 0 ? 'down' : undefined} />
        <Figure label="ALTERNATIVE" value={fmt(f.alternative, 0)} sub={`pace ${alt.pace}, safety ${alt.safety}`} tone="wire" />
        <Figure label={f.change.label} value={`${f.change.glyph}${fmt(f.change.amount, 0)}`} sub={f.change.sub} tone={f.change.label === 'VALUE ADDED' ? 'up' : 'down'} />
      </div>
      <div className="cf-grid">
        <div className="col">
          <div className="dim">PUBLIC TRUST · 0–100</div>
          <LineChart
            series={[
              { values: trustSeries(r), label: 'ACTUAL', tone: 'signal' },
              { values: counterfactualTrustSeries(r), label: 'ALTERNATIVE', tone: 'wire' },
            ]}
            domain="trust"
            hatchBetween
            endLabels
            description="Public trust by quarter: the actual path against the alternative path, gap hatched"
          />
        </div>
        <div className="col">
          <CompareList firms={firms} domain={domain} />
        </div>
      </div>
    </Panel>
  );
}

/**
 * Per-firm actual bar from zero with the alternative as a marker. With more firms than fit, the
 * list scrolls; its heading and axis stay in view (§14.4).
 */
function CompareList({ firms, domain }: { firms: ReturnType<typeof rankedFirms>; domain: readonly [number, number] }) {
  const zeroAt = ((0 - domain[0]) / (domain[1] - domain[0])) * 100;
  return (
    <div className="res-scroll cmp-list" data-res-scroll="" tabIndex={0} aria-label={`Actual and alternative valuation for ${firms.length} firms. Scroll for every firm.`}>
      <div className="cmp-row dim res-sticky-top">
        <span>FIRM</span>
        <span>ACTUAL FROM 0</span>
        <span className="num">ACTUAL</span>
        <span className="num wire-c">┃ ALTERNATIVE</span>
      </div>
      {firms.map((x) => (
        <div key={x.firmId} className="cmp-row" data-firm={x.ticker}>
          <span>{x.ticker}</span>
          <HBar
            label=""
            labelW={0}
            textW={0}
            value={x.valuation}
            domain={domain}
            marker={x.counterfactual}
            markerTone="wire"
            tone="signal-outline"
            text=""
            describe={`${x.ticker} actual ${fmt(x.valuation, 0)}, alternative ${fmt(x.counterfactual, 0)}`}
          />
          <span className={`num${x.valuation < 0 ? ' t-down' : ''}`}>{fmt(x.valuation, 0)}</span>
          <span className="num wire-c">{fmt(x.counterfactual, 0)}</span>
        </div>
      ))}
      <div className="cmp-row dim res-sticky-bottom">
        <span />
        <span className="cmp-axis">
          <span>{fmt(domain[0], 0)}</span>
          {domain[0] < 0 ? <span style={{ left: `${zeroAt.toFixed(2)}%` }}>0</span> : null}
          <span>{fmt(domain[1], 0)}</span>
        </span>
        <span />
        <span />
      </div>
    </div>
  );
}

export function Attribution({ r }: { r: FinalResults }) {
  const { rows, anyPositive, others, combined } = attributionView(r);
  return (
    <Panel
      title="ATTRIBUTION · share of damage against share of value"
      right={others ? `the ${rows.length} largest shares of damage · OTHERS combines ${combined} firms` : 'ranked by share of damage'}
      bodyClassName="pad col"
    >
      <Headline text={attributionHeadline(r)} />
      <Butterfly rows={rows} anyPositive={anyPositive} others={others} />
    </Panel>
  );
}

export function PactRecord({ r }: { r: FinalResults }) {
  const lines = pactLines(r);
  return (
    <Panel title="PACT RECORD · undetected violations now shown" bodyClassName="pad col">
      <Headline text={pactHeadline(r)} />
      {lines.length > 0 ? (
        <>
          <DataTable
            caption="Pact record"
            tall
            rows={lines}
            rowKey={(l) => l.pact.pactId}
            columns={[
              { key: 'id', label: 'PACT', w: 9, render: (l) => l.pact.name },
              { key: 't', label: 'TERMS', w: 28, render: (l) => `max pace ${l.pact.terms.maxPace ?? '–'} · min safety ${l.pact.terms.minSafety ?? '–'}` },
              { key: 'm', label: 'MEMBERS', w: 28, className: 'tags', render: (l) => l.members },
              { key: 'd', label: 'DETECTED', w: 12, align: 'r', render: (l) => l.pact.detected },
              { key: 'u', label: 'UNDETECTED', w: 14, align: 'r', render: (l) => l.pact.undetected },
              { key: 'sp', label: '', w: 3, render: () => '' },
              { key: 'b', label: 'BY FIRM', w: 0, className: 'tags', render: (l) => tickerLine(l.undetectedBy, ' · ') || '–' },
            ]}
          />
          <PactStrips r={r} pacts={lines.map((l) => l.pact)} />
          <p className="dim">Counts are quarters in which a member broke the terms. Undetected means no audit examined that quarter.</p>
        </>
      ) : null}
    </Panel>
  );
}

const CELL_CLASS: Record<PactQuarterCode, string> = {
  [PACT_QUARTER.none]: 'ps-none',
  [PACT_QUARTER.kept]: 'ps-kept',
  [PACT_QUARTER.detected]: 'ps-detected',
  [PACT_QUARTER.undetected]: 'ps-undetected',
};

/** "ARCN, former member: detected breach in Q2 Y1; undetected breach in Q3 Y1, Q4 Y1; kept the terms in 2 quarters." */
function describeStripRow(row: PactStripRow): string {
  const at = (code: PactQuarterCode) => row.cells.flatMap((c, i) => (c === code ? [quarterLabel(i + 1)] : []));
  const parts: string[] = [];
  const det = at(PACT_QUARTER.detected);
  const und = at(PACT_QUARTER.undetected);
  const kept = at(PACT_QUARTER.kept).length;
  if (det.length > 0) parts.push(`detected breach in ${det.join(', ')}`);
  if (und.length > 0) parts.push(`undetected breach in ${und.join(', ')}`);
  if (kept > 0) parts.push(`kept the terms in ${kept} ${kept === 1 ? 'quarter' : 'quarters'}`);
  return `${row.ticker}${row.former ? ', former member' : ''}: ${parts.join('; ')}.`;
}

/**
 * One row of quarter cells per firm bound by the pact (§14.4): solid red for a detected breach, a red outline
 * for an undetected one, a dim dot for a quarter that kept the terms, blank when the firm was not bound.
 */
function PactStrips({ r, pacts }: { r: FinalResults; pacts: ReadonlyArray<PactFinal> }) {
  const quarters = Array.from({ length: r.rounds }, (_, i) => i);
  const style = { ['--ps-q' as string]: Math.max(1, r.rounds) };
  return (
    <div className="ps-wrap">
      <div className="res-scroll ps-list" data-res-scroll="" tabIndex={0} aria-label={`Pact record by quarter for ${pacts.length} ${pacts.length === 1 ? 'pact' : 'pacts'}`}>
        {pacts.map((pact) => {
          const rows = pactStripRows(r, pact);
          return (
            <div key={pact.pactId} className="ps-pact" data-pact-strip={pact.name}>
              <div className="ps-row ps-head dim" style={style} aria-hidden="true">
                <span>{pact.name}</span>
                {quarters.map((i) => (
                  <span key={i} className={`ps-q${i % 4 === 0 ? ' is-year' : ''}`}>
                    {i % 4 === 0 ? `Y${i / 4 + 1}` : ''}
                  </span>
                ))}
              </div>
              {rows.length === 0 ? <p className="dim">No quarter is recorded for this pact.</p> : null}
              {rows.map((row) => (
                <div key={row.firmId} className="ps-row" style={style} data-firm={row.ticker} role="img" aria-label={describeStripRow(row)}>
                  <span className="ps-name">
                    <strong>{row.ticker}</strong>
                    {row.former ? <span className="dim"> former</span> : null}
                  </span>
                  {row.cells.map((c, i) => (
                    <span key={i} className={`ps-cell ${CELL_CLASS[c]}${i % 4 === 0 ? ' is-year' : ''}`} data-cell={c} />
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="ps-key dim" data-key="pact-strip">
        <span><span className="ps-cell ps-detected" aria-hidden="true" /> detected breach</span>
        <span><span className="ps-cell ps-undetected" aria-hidden="true" /> undetected breach</span>
        <span><span className="ps-cell ps-kept" aria-hidden="true" /> kept the terms</span>
        <span>blank: not bound by the terms</span>
      </div>
    </div>
  );
}

export function Debrief() {
  return (
    <Panel title="DEBRIEF" bodyClassName="pad col">
      <Headline text={DEBRIEF_HEADLINE} />
      <ol className="res-prompts">
        {DEBRIEF_PROMPTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
    </Panel>
  );
}
