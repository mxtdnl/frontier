import { PARAMS } from '../../engine';
import { CommitMark, DataTable, Delta, GlyphCheck, LineChart, Panel, RankMove, Tag, TrendLine, ValueBar, type Column, type TagKind } from '../../ui/components';
import { fmt, fmtInt, fmtShare, quarterLabel } from '../../ui/format';
import { GENERAL_CAUSE, incidentBlock, type IncidentLine } from '../../ui/incidents';
import { TRUST_EXPLAINER } from './briefing';
import { boardCapacity, boardChartWidths, boardMode, boardPage, boardTagWidth, fitTags } from '../../ui/layout';
import { sharedDomain, trendWindow } from '../../ui/performance';

import { committedCount, marketAndValue, previousTrust, tagKey, trustSeries, type BoardRow, type ScreenData } from './model';

const TAG_KINDS: ReadonlyArray<string> = ['BOT', 'AUTO', 'BREACH', 'INCID', 'INSOLV'];

interface BoardProps {
  rows: ReadonlyArray<BoardRow>;
  disclosure: boolean;
  reveal: boolean;
  /** Rotation counter for the paged board; wraps over the page count. */
  page?: number;
  /** Lit-room mode (fewer grid rows). */
  lit?: boolean;
  /** The summit banner takes two rows above the board. */
  banner?: boolean;
}

/** Board tags in priority order: alarms first, pact memberships last (§14.1). */
export function boardTags(f: BoardRow): string[] {
  return [
    ...(f.breach ? ['BREACH'] : []),
    ...(f.incident ? ['INCID'] : []),
    ...(f.insolvent ? ['INSOLV'] : []),
    ...(f.auto ? ['AUTO'] : []),
    ...(f.bot ? ['BOT'] : []),
    ...f.pacts,
  ];
}

/** Width the tag column keeps before the disclosure headers fall back to mnemonics. */
const MIN_TAG_W = 12;
/** Rank, MOVE, FIRM, SHARE, PROFIT, VALUE, CHANGE and the commit mark (§14.1, Session 13). */
const BASE_W = 48;
/** PACE, SAFETY and EXPOSURE, or PACE, SAFE and EXPO. */
const DISCLOSURE_W = { full: 21, short: 16 } as const;

/**
 * Mnemonic headers used where full words would squeeze the tags off the row (lit-room mode with
 * disclosure on). Each one is explained in the key strip, so every label is a word or keyed (§14.1).
 */
export function boardMnemonics(disclosure: boolean, lit: boolean): Array<{ tag: string; text: string }> {
  if (!disclosure || boardTagWidth(BASE_W + DISCLOSURE_W.full, lit) >= MIN_TAG_W) return [];
  return [
    { tag: 'SAFE', text: 'safety' },
    { tag: 'EXPO', text: 'exposure' },
  ];
}

/** Width of the fixed (text) columns. */
function fixedW(disclosure: boolean, lit: boolean): number {
  if (!disclosure) return BASE_W;
  return BASE_W + (boardMnemonics(disclosure, lit).length > 0 ? DISCLOSURE_W.short : DISCLOSURE_W.full);
}

/** Widths of the valuation bar and trend line in this mode; 0 hides the column (§14.1 width table). */
export function boardChartW(disclosure: boolean, lit: boolean): { bar: number; trend: number } {
  return boardChartWidths(boardTagWidth(fixedW(disclosure, lit), lit));
}

/** Shared scales: the bar over every firm's value, the trend line over every firm's last 14 quarters. */
export interface BoardScales {
  value: readonly [number, number];
  trend: readonly [number, number];
}

export function boardScales(rows: ReadonlyArray<BoardRow>): BoardScales {
  return {
    value: sharedDomain(rows.map((r) => [r.value])),
    trend: sharedDomain(rows.map((r) => trendWindow(r.history))),
  };
}

const NO_SCALES: BoardScales = { value: [0, 1], trend: [0, 1] };

export function boardColumns(disclosure: boolean, reveal: boolean, lit = false, scales: BoardScales = NO_SCALES): Column<BoardRow>[] {
  const prev = (s: string) => (reveal ? s : undefined);
  const short = boardMnemonics(disclosure, lit).length > 0;
  const { bar, trend } = boardChartW(disclosure, lit);
  const cols: Column<BoardRow>[] = [
    { key: 'rank', label: '#', w: 3, render: (f) => f.rank },
    { key: 'move', label: 'MOVE', w: 5, align: 'r', render: (f) => <RankMove move={moveOf(f)} /> },
    { key: 'firm', label: 'FIRM', w: 7, render: (f) => f.ticker },
    {
      key: 'share',
      label: 'SHARE',
      w: 7,
      align: 'r',
      render: (f) => <span data-roll="" data-prev={prev(fmtShare(f.prevShare))}>{fmtShare(f.share)}</span>,
    },
    {
      key: 'profit',
      label: 'PROFIT',
      w: 8,
      align: 'r',
      render: (f) => <span data-roll="" data-prev={prev(fmt(f.prevProfit))}>{fmt(f.profit)}</span>,
    },
    {
      key: 'value',
      label: 'VALUE',
      w: 8,
      align: 'r',
      render: (f) => (
        <span data-roll="" data-prev={prev(fmt(f.prevValue))} className={f.value < 0 ? 'neg-c' : undefined}>
          {fmt(f.value)}
        </span>
      ),
    },
    {
      key: 'chg',
      label: 'CHANGE',
      w: 8,
      align: 'r',
      render: (f) => <Delta value={f.dValue} prev={prev(fmt(0))} />,
    },
    {
      key: 'cmt',
      label: '✓',
      head: (
        <>
          <span className="sr-only">committed</span>
          <GlyphCheck />
        </>
      ),
      w: 2,
      className: 'cmt-cell',
      render: (f) => <CommitMark committed={f.committed} />,
    },
  ];
  if (bar > 0) cols.push({ key: 'bar', label: '', w: bar, className: 'chart-cell', render: (f) => <ValueBar value={f.value} domain={scales.value} /> });
  if (trend > 0) cols.push({ key: 'trend', label: 'TREND', w: trend, className: 'chart-cell', render: (f) => <TrendLine values={trendWindow(f.history)} domain={scales.trend} /> });
  if (disclosure) {
    cols.push(
      { key: 'pace', label: 'PACE', w: 5, align: 'r', render: (f) => f.disclosed?.pace ?? '–' },
      { key: 'safe', label: short ? 'SAFE' : 'SAFETY', w: short ? 5 : 7, align: 'r', render: (f) => f.disclosed?.safety ?? '–' },
      { key: 'expo', label: short ? 'EXPO' : 'EXPOSURE', w: short ? 6 : 9, align: 'r', render: (f) => (f.disclosed ? fmt(f.disclosed.expo) : '–') },
    );
  }
  const tagW = boardTagW(disclosure, lit);
  cols.push({
    key: 'tags',
    label: '',
    w: 0,
    className: 'tags-line',
    render: (f) => {
      // One line of tags, most important first; the rest are counted, so a row never grows (§14.1).
      const { shown, more } = fitTags(boardTags(f), tagW);
      return (
        <>
          {shown.map((t) => (TAG_KINDS.includes(t) ? <Tag key={t} kind={t as TagKind} /> : <Tag key={t} pact={t} />))}
          {more > 0 ? <span className="dim" data-more-tags={more}>+{more}</span> : null}
        </>
      );
    },
  });
  return cols;
}

/** Width of the board's tag column in ch: the board width less the columns `boardColumns` builds. */
export function boardTagW(disclosure: boolean, lit: boolean): number {
  const { bar, trend } = boardChartW(disclosure, lit);
  return boardTagWidth(fixedW(disclosure, lit) + bar + trend, lit);
}

/** Places a firm moved at the last resolution (positive or negative). */
const moveOf = (f: BoardRow): number => f.prevIndex - (f.rank - 1);

export function BoardPanel({ rows, disclosure, reveal, page = 0, lit = false, banner = false }: BoardProps) {
  // §14.1: two-line rows while they fit (12 as standard), one-line rows to 16, then pages of 10 with up to 2 pinned rows.
  const cap = boardCapacity({ lit, banner });
  const mode = boardMode(rows.length, cap);
  const shown = boardPage(rows.map((f) => ({ ...f, move: moveOf(f) })), page, cap);
  const pinned = new Set(shown.pinned.map((f) => f.id));
  const lastPinned = shown.pinned[shown.pinned.length - 1]?.id;
  const cmt = `${committedCount(rows)}/${rows.length} COMMITTED`;
  const visible = [...shown.pinned, ...shown.rows];
  const tagW = boardTagW(disclosure, lit);
  const fitted = visible.map((f) => fitTags(boardTags(f), tagW));
  const key = [
    ...(visible.some((f) => f.committed) ? [{ tag: '✓', text: 'committed' }] : []),
    ...boardMnemonics(disclosure, lit),
    ...tagKey(fitted.map((t) => t.shown), fitted.some((t) => t.more > 0)),
  ];
  return (
    <Panel title="BOARD" right={mode === 'paged' ? `PAGE ${shown.page + 1}/${shown.pages} · ${cmt}` : cmt}>
      <div data-board-mode={mode} data-board-page={shown.page + 1} data-board-pages={shown.pages} style={{ display: 'contents' }}>
        <DataTable
          caption={mode === 'paged' ? `Firm board, page ${shown.page + 1} of ${shown.pages}` : 'Firm board'}
          tall={mode !== 'compact'}
          columns={boardColumns(disclosure, reveal, lit, boardScales(rows))}
          rows={visible}
          rowKey={(f) => f.id}
          // The swap animates moves within one table, so it runs only when every firm is on it.
          prevIndex={reveal && mode !== 'paged' ? (f) => f.prevIndex : undefined}
          rowClass={(f) => (f.id === lastPinned ? 'pinned pin-last' : pinned.has(f.id) ? 'pinned' : undefined)}
        />
      </div>
      {/* Key strip (§14.1): only the tags, marks and mnemonics on screen; a second line uses the gap row when needed. */}
      <p className="key-strip" data-key-strip="">
        {key.map((k) => (
          <span key={k.tag}>
            <span className="key-tag">{k.tag === '✓' ? <span className="cmt-box"><GlyphCheck /></span> : k.tag}</span> {k.text}
          </span>
        ))}
      </p>
    </Panel>
  );
}

/**
 * The INCIDENTS block (§14.1, Session 18): each incident of the quarter with its effect and cause, at most `max`, then
 * `+N more`. With disclosure off the general cause is printed once at the foot, so it never names pace or safety.
 */
export function IncidentBlock({ round, lines, max }: { round: number; lines: ReadonlyArray<IncidentLine>; max: number }) {
  const { shown, more } = incidentBlock(lines, max);
  const general = shown.some((l) => !l.disclosed);
  return (
    <div className="incid-block" data-incident-block="" data-incidents={lines.length}>
      <p className="incid-head">
        INCIDENTS <span className="dim">· {quarterLabel(round)}</span>
      </p>
      {shown.map((l) => (
        <div key={l.firmId} data-incident={l.ticker}>
          <p className="incid-line">
            <span className="neg-c">▼ {l.ticker}</span> {l.headline}
          </p>
          <p className="incid-line is-sub">{l.effect}</p>
          {l.disclosed ? <p className="incid-line is-sub" data-incident-cause="">{l.cause}</p> : null}
        </div>
      ))}
      {more > 0 ? (
        <p className="incid-line dim" data-incident-more={more}>
          +{more} more · INCID for the full list
        </p>
      ) : null}
      {general ? (
        <p className="dim" data-incident-cause="">
          {GENERAL_CAUSE}
        </p>
      ) : null}
    </div>
  );
}

interface TrustPanelProps {
  data: ScreenData;
  reveal: boolean;
  /** The quarter's incidents once the reveal sequence has ended; the block then takes the chart's place. */
  incidents?: ReadonlyArray<IncidentLine>;
  /** Incidents the block lists before `+N more`. */
  incidentMax?: number;
}

const FIG_LABEL_W = 15;

/** One figure row under the trust chart: label, whole number, change since last quarter (▲/▼) and a dim note. */
function FigureRow({ label, value, delta, note, attr }: { label: string; value: number; delta: number | null; note: string; attr: string }) {
  // One line, values in the column the INCIDENTS and PACTS rows use: label 15ch, value 6ch, change 6ch, note.
  return (
    <div className="row" style={{ flexWrap: 'nowrap', whiteSpace: 'nowrap', overflow: 'hidden' }} data-figure={attr} data-figure-delta={delta === null ? '' : delta.toFixed(1)}>
      <span className="dim" style={{ width: `${FIG_LABEL_W}ch`, flex: 'none' }}>{label}</span>
      <span className="num" style={{ width: '6ch', flex: 'none', textAlign: 'left' }}>{fmtInt(value)}</span>
      <span style={{ width: '6ch', flex: 'none' }}>{delta === null ? <span className="dim">–</span> : <Delta value={delta} digits={0} />}</span>
      <span className="dim">{note}</span>
    </div>
  );
}

export function TrustPanel({ data, reveal, incidents = [], incidentMax = 4 }: TrustPanelProps) {
  const { pub, rounds } = data;
  const series = trustSeries(rounds);
  const prev = previousTrust(rounds);
  const delta = pub.round === 0 ? 0 : pub.T - prev;
  const latest = Object.values(rounds).length ? Math.max(...Object.keys(rounds).map(Number)) : 0;
  const incidentCount = rounds[String(latest)]?.incidents ?? 0;
  const firmCount = Object.keys(data.firms).length;
  const activePacts = Object.values(data.pacts).filter((p) => p.status === 'active').length;
  const mv = marketAndValue(rounds, firmCount);
  return (
    <Panel title="PUBLIC TRUST" bodyClassName="col">
      <div style={{ paddingTop: '0.5lh' }}>
        {/* While the INCIDENTS block replaces the chart, the block needs this line's room (lit-room mode, Session 20). */}
        {incidents.length === 0 ? <p className="dim" data-trust-explainer="">{TRUST_EXPLAINER}</p> : null}
        <div className="big signal" data-trust-numerals="" data-trust-delta={delta.toFixed(1)}>
          <span data-roll="" data-prev={reveal ? fmt(prev) : undefined}>{fmt(pub.T)}</span>
        </div>
        <div>
          <Delta value={delta} /> <span className="dim">since last quarter</span>
        </div>
      </div>
      {incidents.length > 0 ? (
        <IncidentBlock round={latest} lines={incidents} max={incidentMax} />
      ) : (
        <div className="col" style={{ flex: '1 1 0', marginTop: '1lh' }} data-trust-chart="">
          <LineChart
            series={[{ values: series, label: 'Trust', tone: 'signal' }]}
            domain="trust"
            changeStrip
            alarmDrop={5}
            description={`Public trust by quarter, from ${fmt(series[0] ?? PARAMS.T0)} to ${fmt(pub.T)}`}
          />
        </div>
      )}
      <div className="stack" style={{ margin: '1lh 0 0.5lh', gap: 0 }}>
        <FigureRow label="MARKET" value={mv.market} delta={mv.marketDelta} note="this quarter" attr="market" />
        <FigureRow label="INDUSTRY VALUE" value={mv.value} delta={mv.valueDelta} note="all firms" attr="value" />
        {/* The INCIDENTS block lists every incident, so the count row would repeat it. */}
        {incidents.length === 0 ? (
          <div className="row"><span className="dim" style={{ width: `${FIG_LABEL_W}ch` }}>INCIDENTS</span><span>{incidentCount} this quarter</span></div>
        ) : null}
        <div className="row"><span className="dim" style={{ width: `${FIG_LABEL_W}ch` }}>PACTS</span><span>{activePacts} active</span></div>
        <div className="row"><span className="dim" style={{ width: `${FIG_LABEL_W}ch` }}>DISCLOSURE</span><span>{pub.disclosure ? 'ON' : 'OFF'}</span></div>
      </div>
    </Panel>
  );
}
