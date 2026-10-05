import type { AuditResult, FirmRoundResult, Headline, Pact } from '../../engine';
import type { FirmNode, NoticeEntry, RoundNode } from '../../firebase/schema';
import { bookSentence, fieldSeries, rankByQuarter } from '../../ui/performance';
import { DataTable, Delta, LineChart, Panel } from '../../ui/components';
import { fmt, fmtSigned, quarterLabel } from '../../ui/format';
import { resultNotices, shareChangePp, type BookRow, type WireItem } from './model';

interface RevealProps {
  round: number;
  history: Record<string, FirmRoundResult>;
  audits: ReadonlyArray<AuditResult>;
  headlines: ReadonlyArray<Headline>;
  pacts: Record<string, Pact>;
  firmId: string;
  /** Cards dropped at resolution (private to the firm). */
  cardNotices: ReadonlyArray<NoticeEntry>;
}

/** Quarter result card, notices and headlines (spec §14.3, reveal state). */
export function RevealCard({ round, history, audits, headlines, pacts, firmId, cardNotices }: RevealProps) {
  const r = history[String(round)];
  if (!r) return <p className="notice" role="status">No result is recorded for this firm in {quarterLabel(round)}.</p>;
  const dShare = shareChangePp(history, round);
  return (
    <div className="stack">
      <Panel title={`${quarterLabel(round)} RESULT`} right={`RANK ${r.rank}`} bodyClassName="pad">
        <dl className="kv">
          <dt>Revenue</dt><dd>{fmt(r.revenue)}</dd>
          <dt>Costs</dt><dd>{fmt(r.cost + r.fine)}</dd>
          <dt>Profit</dt><dd><Delta value={r.profit} /></dd>
          <dt>Share</dt><dd>{fmt(r.share * 100)}%</dd>
          <dt>Share chg</dt><dd>{dShare === null ? '–' : <Delta value={dShare} suffix=" pp" />}</dd>
          <dt>Valuation</dt><dd>{fmt(r.valuation)}</dd>
          <dt>Rank chg</dt><dd>{r.rankDelta === 0 ? '0' : fmtSigned(r.rankDelta, 0)}</dd>
        </dl>
      </Panel>
      <Panel title="NOTICES" bodyClassName="pad">
        {resultNotices(r, audits, pacts, firmId, cardNotices).map((n) => <p key={n}>{n}</p>)}
      </Panel>
      <Wire items={headlines.map((h) => ({ round, label: quarterLabel(round), text: h.text }))} empty="No headlines this quarter." />
    </div>
  );
}

interface BookProps {
  rows: BookRow[];
  /** Public data only: every firm's valuation per quarter from `rounds/{r}/results` (§14.3, Session 13). */
  rounds: Record<string, RoundNode>;
  firms: Record<string, FirmNode>;
  firmId: string;
}

/** BOOK (§14.3): "against the field" chart and sentence, then the firm's own quarterly results. */
export function Book({ rows, rounds, firms, firmId }: BookProps) {
  if (rows.length === 0) return <p className="notice" role="status">No quarters resolved yet. Results appear here after the first reveal.</p>;
  const ids = Object.keys(firms);
  const field = fieldSeries(ids, firmId, rounds);
  const refs = Object.entries(firms).map(([id, f]) => ({ id, ticker: f.ticker }));
  const own = rankByQuarter(refs, rounds).ranks[firmId] ?? [];
  const ticker = firms[firmId]?.ticker ?? 'Own firm';
  const values = field.own;
  const others = field.others.length;
  return (
    <div className="stack">
      <div data-book-field="" data-others={others}>
        <span style={{ fontWeight: 600 }}>VALUATION · AGAINST {others} OTHER FIRM{others === 1 ? '' : 'S'}</span>
        <LineChart
          series={[{ values, label: ticker, tone: 'signal' }]}
          context={field.others}
          zeroDotted
          domain="zero"
          startQuarter={field.start}
          height="10lh"
          description={`${ticker} valuation by quarter, from ${fmt(values[0] ?? 0)} to ${fmt(values[values.length - 1] ?? 0)}, drawn against ${others} other firms`}
        />
        <p className="book-key" aria-hidden="true">
          <span><span className="sw" />{ticker}</span>
          <span><span className="sw other" />other firms</span>
          <span><span className="sw zero" />zero</span>
        </p>
        <p data-book-sentence="">{bookSentence(own, ids.length)}</p>
      </div>
      <div className="scroll-x">
        <DataTable
          caption="Own quarterly results"
          rows={[...rows].reverse()}
          rowKey={(b) => String(b.round)}
          columns={[
            { key: 'q', label: 'QTR', w: 6, render: (b) => quarterLabel(b.round) },
            { key: 'rev', label: 'REV', w: 6, align: 'r', render: (b) => fmt(b.revenue) },
            { key: 'cost', label: 'COST', w: 6, align: 'r', render: (b) => fmt(b.cost + b.fine) },
            { key: 'pl', label: 'P&L', w: 7, align: 'r', render: (b) => fmt(b.profit) },
            { key: 'val', label: 'VAL', w: 7, align: 'r', render: (b) => fmt(b.valuation) },
            { key: 'rk', label: 'RK', w: 3, align: 'r', render: (b) => b.rank },
          ]}
        />
      </div>
    </div>
  );
}

export function Wire({ items, empty = 'No headlines yet.' }: { items: WireItem[]; empty?: string }) {
  if (items.length === 0) return <p className="notice" role="status">{empty}</p>;
  return (
    <ul className="stack feed" style={{ listStyle: 'none', margin: 0, padding: 0, gap: '0.5lh' }} aria-label="Wire">
      {items.map((h, i) => (
        <li key={`${h.round}-${i}`}>
          <span className="dim">{h.label}</span>
          <br />
          <span className="wire-c">{h.text}</span>
        </li>
      ))}
    </ul>
  );
}
