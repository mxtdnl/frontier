import { PARAMS } from '../../engine';
import { DataTable, Delta, GlyphCheck, HBar, Panel, StepSparkline, Tag, type Column } from '../../ui/components';
import { fmt, fmtInt, fmtShare, quarterLabel } from '../../ui/format';
import { committedCount, marketCeiling, previousTrust, trustSeries, type BoardRow, type ScreenData } from './model';

interface BoardProps {
  rows: ReadonlyArray<BoardRow>;
  disclosure: boolean;
  reveal: boolean;
}

export function boardColumns(disclosure: boolean, reveal: boolean): Column<BoardRow>[] {
  const prev = (s: string) => (reveal ? s : undefined);
  const cols: Column<BoardRow>[] = [
    { key: 'rank', label: '#', w: 3, render: (_f, i) => i + 1 },
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
  cols.push({
    key: 'tags',
    label: '',
    w: 0,
    className: 'tags',
    render: (f) => (
      <>
        {f.bot ? <Tag kind="BOT" /> : null}
        {f.auto ? <Tag kind="AUTO" /> : null}
        {f.insolvent ? <Tag kind="INSOLV" /> : null}
        {f.pacts.map((p) => (
          <Tag key={p} pact={p} />
        ))}
        {f.breach ? <Tag kind="BREACH" /> : null}
      </>
    ),
  });
  return cols;
}

export function BoardPanel({ rows, disclosure, reveal }: BoardProps) {
  return (
    <Panel title="BOARD" right={`${committedCount(rows)}/${rows.length} CMT`}>
      <DataTable
        caption="Firm board"
        tall
        columns={boardColumns(disclosure, reveal)}
        rows={rows}
        rowKey={(f) => f.id}
        prevIndex={reveal ? (f) => f.prevIndex : undefined}
      />
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
  const resolved = series.length - 1;
  const latest = Object.values(rounds).length ? Math.max(...Object.keys(rounds).map(Number)) : 0;
  const incidents = rounds[String(latest)]?.incidents ?? 0;
  const firmCount = Object.keys(data.firms).length;
  const activePacts = Object.values(data.pacts).filter((p) => p.status === 'active').length;
  return (
    <Panel title="PUBLIC TRUST">
      <div style={{ paddingTop: '0.5lh' }}>
        <div className="big signal" data-trust-numerals="" data-trust-delta={delta.toFixed(1)}>
          <span data-roll="" data-prev={reveal ? fmt(prev) : undefined}>{fmt(pub.T)}</span>
        </div>
        <div>
          <Delta value={delta} /> <span className="dim">QoQ</span>
        </div>
      </div>
      <div style={{ marginTop: '1lh' }}>
        <StepSparkline
          series={[{ values: series, label: 'Trust', tone: 'signal' }]}
          min={0}
          max={100}
          w={0}
          h={12}
          count={series.length}
          description={`Public trust by quarter, from ${fmt(series[0] ?? PARAMS.T0)} to ${fmt(pub.T)}`}
        />
        <div className="dim" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Q1 Y1</span>
          <span>{quarterLabel(Math.max(1, resolved))}</span>
        </div>
      </div>
      <div className="stack" style={{ marginTop: '1lh', gap: 0 }}>
        <HBar label="MKT" labelW={7} textW={8} value={pub.M / marketCeiling(firmCount)} text={fmtInt(pub.M)} describe={`Market size ${fmtInt(pub.M)}`} />
        <div className="row"><span className="dim" style={{ width: '7ch' }}>INCID</span><span>{incidents} this quarter</span></div>
        <div className="row"><span className="dim" style={{ width: '7ch' }}>PACTS</span><span>{activePacts} active</span></div>
        <div className="row"><span className="dim" style={{ width: '7ch' }}>DISCL</span><span>{pub.disclosure ? 'ON' : 'OFF'}</span></div>
      </div>
    </Panel>
  );
}
