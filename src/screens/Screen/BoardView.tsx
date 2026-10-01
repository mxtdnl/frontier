import {
  COMMITTED,
  FIRMS,
  HEADLINES,
  PACTS,
  ROUND,
  TRUST,
  TRUST_HISTORY,
  prevProfit,
  prevRank,
  prevShare,
  prevValue,
  type MockFirm,
} from '../../mock/fixtures';
import { DataTable, Delta, GlyphCheck, HBar, Panel, StepSparkline, Tag, type Column } from '../../ui/components';
import { fmt, fmtInt, fmtShare, quarterLabel } from '../../ui/format';

interface BoardProps {
  disclosure: boolean;
  reveal: boolean;
}

export function boardColumns(disclosure: boolean, reveal: boolean): Column<MockFirm>[] {
  const prev = (s: string) => (reveal ? s : undefined);
  const cols: Column<MockFirm>[] = [
    { key: 'rank', label: '#', w: 3, render: (_f, i) => i + 1 },
    { key: 'firm', label: 'FIRM', w: 7, render: (f) => f.ticker },
    {
      key: 'share',
      label: 'SHARE',
      w: 8,
      align: 'r',
      render: (f) => <span data-roll="" data-prev={prev(fmtShare(prevShare(f)))}>{fmtShare(f.share)}</span>,
    },
    {
      key: 'profit',
      label: 'PROFIT',
      w: 9,
      align: 'r',
      render: (f) => <span data-roll="" data-prev={prev(fmt(prevProfit(f)))}>{fmt(f.profit)}</span>,
    },
    {
      key: 'value',
      label: 'VALUE',
      w: 9,
      align: 'r',
      render: (f) => <span data-roll="" data-prev={prev(fmt(prevValue(f)))}>{fmt(f.value)}</span>,
    },
    {
      key: 'chg',
      label: 'CHG',
      w: 9,
      align: 'r',
      render: (f) => <Delta value={f.dValue} prev={prev(fmt(Math.abs(f.dValue) * 0.5))} />,
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
      { key: 'pace', label: 'PACE', w: 5, align: 'r', render: (f) => f.pace },
      { key: 'safe', label: 'SAFE', w: 5, align: 'r', render: (f) => f.safety },
      { key: 'expo', label: 'EXPO', w: 6, align: 'r', render: (f) => fmt(f.expo) },
    );
  }
  cols.push({
    key: 'tags',
    label: '',
    w: 0,
    className: 'tags',
    render: (f) => (
      <>
        {f.tags.map((t) => (
          <Tag key={t} kind={t} />
        ))}
        {f.pacts.map((p) => (
          <Tag key={p} pact={p} />
        ))}
        {f.breach ? <Tag kind="BREACH" /> : null}
      </>
    ),
  });
  return cols;
}

export function BoardPanel({ disclosure, reveal }: BoardProps) {
  return (
    <Panel title="BOARD" right={`${COMMITTED}/${FIRMS.length} CMT`}>
      <DataTable
        caption="Firm board"
        tall
        columns={boardColumns(disclosure, reveal)}
        rows={FIRMS}
        rowKey={(f) => f.ticker}
        prevIndex={reveal ? prevRank : undefined}
      />
      <p className="dim" style={{ marginTop: '1lh' }}>
        BOT automated firm · AUTO default settings applied · INSOLV forced to lowest pace · BREACH pact terms breached
      </p>
    </Panel>
  );
}

export function TrustPanel({ disclosure, reveal }: BoardProps) {
  const delta = TRUST.value - TRUST.prev;
  return (
    <Panel title="PUBLIC TRUST">
      <div style={{ paddingTop: '0.5lh' }}>
        <div className="big signal" data-trust-numerals="" data-trust-delta={delta.toFixed(1)}>
          <span data-roll="" data-prev={reveal ? fmt(TRUST.prev) : undefined}>{fmt(TRUST.value)}</span>
        </div>
        <div>
          <Delta value={delta} /> <span className="dim">QoQ</span>
        </div>
      </div>
      <div style={{ marginTop: '1lh' }}>
        <StepSparkline
          series={[{ values: TRUST_HISTORY, label: 'Trust', tone: 'signal' }]}
          min={0}
          max={100}
          w={0}
          h={12}
          count={TRUST_HISTORY.length}
          description={`Public trust by quarter, from ${fmt(TRUST_HISTORY[0] ?? 0)} to ${fmt(TRUST.value)}`}
        />
        <div className="dim" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Q1 Y1</span>
          <span>{quarterLabel(ROUND)}</span>
        </div>
      </div>
      <div className="stack" style={{ marginTop: '1lh', gap: 0 }}>
        <HBar label="MKT" labelW={7} textW={8} value={TRUST.marketSize / TRUST.marketRef} text={fmtInt(TRUST.marketSize)} describe={`Market size ${fmtInt(TRUST.marketSize)}`} />
        <div className="row"><span className="dim" style={{ width: '7ch' }}>INCID</span><span>{TRUST.incidents} this quarter</span></div>
        <div className="row"><span className="dim" style={{ width: '7ch' }}>PACTS</span><span>{PACTS.length} active</span></div>
        <div className="row"><span className="dim" style={{ width: '7ch' }}>DISCL</span><span>{disclosure ? 'ON' : 'OFF'}</span></div>
      </div>
    </Panel>
  );
}

export const WIRE_ITEMS = (disclosure: boolean): string[] => {
  const base = HEADLINES.map((h) => h.text);
  return disclosure ? ['ARCN accelerates release schedule', ...base.filter((t) => !t.startsWith('Unnamed lab'))] : base;
};
