import { PARAMS } from '../../engine';
import { DataTable, Delta, GlyphCheck, HBar, LineChart, Panel, Tag, type Column, type TagKind } from '../../ui/components';
import { fmt, fmtInt, fmtShare } from '../../ui/format';
import { boardCapacity, boardMode, boardPage, boardTagWidth, fitTags } from '../../ui/layout';

const TAG_KINDS: ReadonlyArray<string> = ['BOT', 'AUTO', 'BREACH', 'INSOLV'];
import { committedCount, marketCeiling, previousTrust, trustSeries, type BoardRow, type ScreenData } from './model';

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
    ...(f.insolvent ? ['INSOLV'] : []),
    ...(f.auto ? ['AUTO'] : []),
    ...(f.bot ? ['BOT'] : []),
    ...f.pacts,
  ];
}

export function boardColumns(disclosure: boolean, reveal: boolean, lit = false): Column<BoardRow>[] {
  const prev = (s: string) => (reveal ? s : undefined);
  const cols: Column<BoardRow>[] = [
    { key: 'rank', label: '#', w: 3, render: (f) => f.rank },
    { key: 'firm', label: 'FIRM', w: 7, render: (f) => f.ticker },
    {
      key: 'share',
      label: 'SHARE',
      w: 8,
      align: 'r',
      render: (f) => <span data-roll="" data-prev={prev(fmtShare(f.prevShare))}>{fmtShare(f.share)}</span>,
    },
    {
      key: 'profit',
      label: 'PROFIT',
      w: 9,
      align: 'r',
      render: (f) => <span data-roll="" data-prev={prev(fmt(f.prevProfit))}>{fmt(f.profit)}</span>,
    },
    {
      key: 'value',
      label: 'VALUE',
      w: 9,
      align: 'r',
      render: (f) => <span data-roll="" data-prev={prev(fmt(f.prevValue))}>{fmt(f.value)}</span>,
    },
    {
      key: 'chg',
      label: 'CHG',
      w: 9,
      align: 'r',
      render: (f) => <Delta value={f.dValue} prev={prev(fmt(0))} />,
    },
    {
      key: 'cmt',
      label: 'CMT',
      w: 5,
      align: 'r',
      render: (f) => (f.committed ? <><span className="sr-only">committed</span><GlyphCheck /></> : <span className="dim">{'–'}</span>),
    },
  ];
  if (disclosure) {
    cols.push(
      { key: 'pace', label: 'PACE', w: 5, align: 'r', render: (f) => f.disclosed?.pace ?? '–' },
      { key: 'safe', label: 'SAFE', w: 5, align: 'r', render: (f) => f.disclosed?.safety ?? '–' },
      { key: 'expo', label: 'EXPO', w: 6, align: 'r', render: (f) => (f.disclosed ? fmt(f.disclosed.expo) : '–') },
    );
  }
  const tagW = boardTagWidth(
    cols.reduce((a, c) => a + c.w, 0),
    lit,
  );
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

/** Places a firm moved at the last resolution (positive or negative). */
const moveOf = (f: BoardRow): number => f.prevIndex - (f.rank - 1);

export function BoardPanel({ rows, disclosure, reveal, page = 0, lit = false, banner = false }: BoardProps) {
  // §14.1: two-line rows while they fit (12 as standard), one-line rows to 16, then pages of 10 with up to 2 pinned rows.
  const cap = boardCapacity({ lit, banner });
  const mode = boardMode(rows.length, cap);
  const shown = boardPage(rows.map((f) => ({ ...f, move: moveOf(f) })), page, cap);
  const pinned = new Set(shown.pinned.map((f) => f.id));
  const lastPinned = shown.pinned[shown.pinned.length - 1]?.id;
  const cmt = `${committedCount(rows)}/${rows.length} CMT`;
  return (
    <Panel title="BOARD" right={mode === 'paged' ? `PAGE ${shown.page + 1}/${shown.pages} · ${cmt}` : cmt}>
      <div data-board-mode={mode} data-board-page={shown.page + 1} data-board-pages={shown.pages} style={{ display: 'contents' }}>
        <DataTable
          caption={mode === 'paged' ? `Firm board, page ${shown.page + 1} of ${shown.pages}` : 'Firm board'}
          tall={mode !== 'compact'}
          columns={boardColumns(disclosure, reveal, lit)}
          rows={[...shown.pinned, ...shown.rows]}
          rowKey={(f) => f.id}
          // The swap animates moves within one table, so it runs only when every firm is on it.
          prevIndex={reveal && mode !== 'paged' ? (f) => f.prevIndex : undefined}
          rowClass={(f) => (f.id === lastPinned ? 'pinned pin-last' : pinned.has(f.id) ? 'pinned' : undefined)}
        />
      </div>
      <p className="dim" style={{ marginTop: '1lh' }}>
        BOT automated firm · AUTO default settings applied · INSOLV forced to lowest pace · BREACH pact terms breached
      </p>
    </Panel>
  );
}

export function TrustPanel({ data, reveal }: { data: ScreenData; reveal: boolean }) {
  const { pub, rounds } = data;
  const series = trustSeries(rounds);
  const prev = previousTrust(rounds);
  const delta = pub.round === 0 ? 0 : pub.T - prev;
  const latest = Object.values(rounds).length ? Math.max(...Object.keys(rounds).map(Number)) : 0;
  const incidents = rounds[String(latest)]?.incidents ?? 0;
  const firmCount = Object.keys(data.firms).length;
  const activePacts = Object.values(data.pacts).filter((p) => p.status === 'active').length;
  return (
    <Panel title="PUBLIC TRUST" bodyClassName="col">
      <div style={{ paddingTop: '0.5lh' }}>
        <div className="big signal" data-trust-numerals="" data-trust-delta={delta.toFixed(1)}>
          <span data-roll="" data-prev={reveal ? fmt(prev) : undefined}>{fmt(pub.T)}</span>
        </div>
        <div>
          <Delta value={delta} /> <span className="dim">QoQ</span>
        </div>
      </div>
      <div className="col" style={{ flex: '1 1 0', marginTop: '1lh' }} data-trust-chart="">
        <LineChart
          series={[{ values: series, label: 'Trust', tone: 'signal' }]}
          domain="trust"
          changeStrip
          alarmDrop={5}
          description={`Public trust by quarter, from ${fmt(series[0] ?? PARAMS.T0)} to ${fmt(pub.T)}`}
        />
      </div>
      <div className="stack" style={{ margin: '1lh 0 0.5lh', gap: 0 }}>
        <HBar label="MKT" labelW={7} textW={8} value={pub.M} domain={[0, marketCeiling(firmCount)]} text={fmtInt(pub.M)} describe={`Market size ${fmtInt(pub.M)}`} />
        <div className="row"><span className="dim" style={{ width: '7ch' }}>INCID</span><span>{incidents} this quarter</span></div>
        <div className="row"><span className="dim" style={{ width: '7ch' }}>PACTS</span><span>{activePacts} active</span></div>
        <div className="row"><span className="dim" style={{ width: '7ch' }}>DISCL</span><span>{pub.disclosure ? 'ON' : 'OFF'}</span></div>
      </div>
    </Panel>
  );
}
