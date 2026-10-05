import { COMMAND_HELP } from '../../ui/commands';
import { DataTable, Delta, FirmMultiples, LineChart, Panel, QR, RankChart, Tag, type RankLine } from '../../ui/components';
import { yDomain } from '../../ui/chart';
import { fmt, fmtShare, quarterLabel } from '../../ui/format';
import { KEY_BINDINGS } from '../../ui/keys';
import { fillColumns, firmsGrid, firmsPage, lobbyColumns, tickerLine, truncateList } from '../../ui/layout';
import { largestFaller, leaderOf, rankByQuarter, ranksHeadline, type FirmRef } from '../../ui/performance';
import { BRIEFING_LINES } from './briefing';
import { boardRows, joinUrl, pactRows, previousTrust, trustSeries, valuationSeries, wireItems, type BoardRow, type PactRow, type ScreenData } from './model';

export function TrustView({ data }: { data: ScreenData }) {
  const series = trustSeries(data.rounds);
  const delta = data.pub.round === 0 ? 0 : data.pub.T - previousTrust(data.rounds);
  return (
    <Panel title="TRST · PUBLIC TRUST HISTORY" bodyClassName="col">
      <p className="dim" style={{ paddingTop: '0.5lh' }}>{BRIEFING_LINES.market[0]}</p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="big signal" data-amber="trust">{fmt(data.pub.T)}</div>
        <div>
          <Delta value={delta} /> <span className="dim">since last quarter</span>
        </div>
      </div>
      <div className="col" style={{ flex: '1 1 0', margin: '1lh 0' }} data-trust-chart="">
        <LineChart
          series={[{ values: series, label: 'Trust', tone: 'signal' }]}
          domain="trust"
          changeStrip
          alarmDrop={5}
          description="Public trust by quarter"
        />
      </div>
    </Panel>
  );
}

export function PactsView({ data, emphasis = false }: { data: ScreenData; emphasis?: boolean }) {
  const rows = pactRows(data);
  return (
    <Panel title={emphasis ? 'PACTS · SUMMIT' : 'PACT'} bodyClassName="pad">
      {rows.length === 0 ? (
        <p className="dim">No pacts in force.</p>
      ) : (
        <DataTable
          caption="Pacts"
          tall
          rows={rows}
          rowKey={(p) => p.id}
          columns={[
            { key: 'id', label: 'PACT', w: 9, render: (p) => <Tag pact={p.name} /> },
            { key: 'pace', label: 'MAX PACE', w: 10, align: 'r', render: (p) => p.maxPace ?? '–' },
            { key: 'safe', label: 'MIN SAFETY', w: 12, align: 'r', render: (p) => p.minSafety ?? '–' },
            // Beside the board at a summit the panel is narrow; the members need the room more than the audit line.
            ...(emphasis ? [] : [{ key: 'audit', label: 'AUDIT', w: 27, render: (p: PactRow) => <AuditCell audit={p.lastAudit} /> }]),
            {
              key: 'members',
              label: 'MEMBERS',
              w: 0,
              className: 'tags',
              render: (p) => {
                const { shown, more } = truncateList(p.members);
                return (
                  // Wraps without indenting the next line, and never ends a line in a margin.
                  <span className="wrap-list">
                    {shown.map((m) => (
                      <span key={m.id}>
                        {m.ticker} {m.breach ? <Tag kind="BREACH" /> : null}
                      </span>
                    ))}
                    {more > 0 ? <span className="dim" data-more={more}>+{more} more</span> : null}
                  </span>
                );
              },
            },
          ]}
        />
      )}
    </Panel>
  );
}

function AuditCell({ audit }: { audit: PactRow['lastAudit'] }) {
  if (!audit) return <span className="dim">none yet</span>;
  const result = audit.breaches === 0 ? 'clean' : `${audit.breaches} breach${audit.breaches === 1 ? '' : 'es'}`;
  return <>{quarterLabel(audit.round)} {audit.kind === 'manual' ? 'MANUAL' : 'AUTO'} · {result}</>;
}

interface AuditViewProps {
  data: ScreenData;
  /** Pact ids already queued are not known to the projector; the notice confirms each press. */
  onQueue: (pactId: string) => void;
}

/** F6: choose a pact to audit. Press the number, or select the row. */
export function AuditView({ data, onQueue }: AuditViewProps) {
  const rows = pactRows(data).slice(0, 9);
  return (
    <Panel title="AUDIT · SELECT PACT" bodyClassName="pad">
      {rows.length === 0 ? (
        <p className="dim">No pacts in force to audit. Esc returns to the board.</p>
      ) : (
        <div className="stack">
          <p className="dim">Press the number of the pact to queue an audit. It runs when the quarter resolves. Esc returns to the board.</p>
          {rows.map((p, i) => (
            <button key={p.id} type="button" className="btn" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => onQueue(p.id)}>
              <span className="signal" style={{ width: '3ch', display: 'inline-block' }}>{i + 1}</span>
              <span style={{ width: '9ch', display: 'inline-block' }}>{p.name}</span>
              <span className="dim">{tickerLine(p.members.map((m) => m.ticker))}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function WireView({ data }: { data: ScreenData }) {
  const items = wireItems(data.rounds, data.wire).slice(0, 14);
  return (
    <Panel title="WIRE · HEADLINE LOG" bodyClassName="pad">
      {items.length === 0 ? <p className="dim">No headlines yet.</p> : null}
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 0 }}>
        {items.map((h, i) => (
          <li key={i} className="row" style={{ gap: '2ch' }}>
            <span className="dim" style={{ width: '6ch' }}>{h.round > 0 ? quarterLabel(h.round) : 'PRE'}</span>
            <span className="wire-c">{h.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function FirmView({ ticker, data }: { ticker: string; data: ScreenData }) {
  const f: BoardRow | undefined = boardRows(data).find((x) => x.ticker === ticker);
  if (!f) {
    return (
      <Panel title="FIRM" bodyClassName="pad">
        <p className="notice err">No firm with ticker {ticker}. Enter BOARD for the list of tickers.</p>
      </Panel>
    );
  }
  const hist = valuationSeries(f.id, data.rounds);
  return (
    <Panel title={`FIRM · ${f.ticker}`} bodyClassName="pad">
      <div className="stack">
        <div className="big">{f.ticker}</div>
        <div className="row">
          <span>{f.name}</span>
          <span className="dim">SHARE</span> <span>{fmtShare(f.share)}</span>
          <span className="dim">VALUE</span> <span>{fmt(f.value)}</span>
          <Delta value={f.dValue} />
        </div>
        <LineChart
          series={[{ values: hist, label: 'Valuation', tone: 'wire' }]}
          domain="zero"
          height="16lh"
          description={`${f.ticker} valuation by quarter, from ${fmt(hist[0] ?? 0)} to ${fmt(hist[hist.length - 1] ?? 0)}`}
        />
        <div className="row">
          {f.pacts.map((p) => (
            <Tag key={p} pact={p} />
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** `FIRMS` (§14.1, Session 13): small multiples, one card per firm in rank order, every card on one y-scale. */
export function FirmsView({ data, page = 0 }: { data: ScreenData; page?: number }) {
  const rows = boardRows(data);
  const grid = firmsGrid(rows.length);
  const shown = firmsPage(rows, page);
  // The scale covers every firm, so cards on different pages compare honestly.
  const { domain, ticks } = yDomain('zero', rows.map((r) => r.history), 4);
  const step = ticks.length > 1 ? (ticks[1] as number) - (ticks[0] as number) : 0;
  const right = `${shown.pages > 1 ? `PAGE ${shown.page + 1}/${shown.pages} · ` : ''}valuation · same scale · gridlines every ${fmt(step, step % 1 === 0 ? 0 : 1)} · dotted line 0 · hollow square peak`;
  return (
    <Panel title="FIRMS" right={right} bodyClassName="col">
      <div data-firms-page={shown.page + 1} data-firms-pages={shown.pages} style={{ display: 'contents' }}>
        <FirmMultiples
          cols={grid.cols}
          rows={grid.rows}
          domain={domain}
          ticks={ticks}
          cards={shown.items.map((r) => ({ id: r.id, ticker: r.ticker, rank: r.rank, value: r.value, change: r.dValue, history: r.history }))}
        />
      </div>
    </Panel>
  );
}

/** `RANKS` (§14.1, Session 13): rank by quarter; the leader and the largest faller highlighted. */
export function RanksView({ data }: { data: ScreenData }) {
  const firms: FirmRef[] = Object.entries(data.firms).map(([id, f]) => ({ id, ticker: f.ticker }));
  const table = rankByQuarter(firms, data.rounds);
  const leader = leaderOf(firms, table);
  const faller = largestFaller(firms, table);
  const lines: RankLine[] = firms.map((f) => {
    const ranks = table.ranks[f.id] ?? [];
    const tone: RankLine['tone'] = f.id === leader?.id ? 'leader' : f.id === faller?.firm.id ? 'faller' : 'other';
    const label = tone === 'leader' ? `${f.ticker} 1st` : tone === 'faller' && faller ? `${f.ticker} ▼${faller.now - faller.best}` : f.ticker;
    return { id: f.id, ticker: f.ticker, ranks, tone, label };
  });
  const headline = ranksHeadline(firms, table);
  const described = headline ? `Rank of each firm by quarter. ${headline}` : 'Rank of each firm by quarter.';
  return (
    <Panel title="RANKS" right="rank by valuation, each quarter" bodyClassName="col">
      {headline ? <p className="ranks-headline" data-ranks-headline="">{headline}</p> : null}
      <RankChart lines={lines} startQuarter={table.rounds[0] ?? 1} firmCount={firms.length} description={described} />
    </Panel>
  );
}

export function HelpView() {
  return (
    <Panel title="HELP" bodyClassName="pad">
      <div className="cols-2">
        <div className="stack" style={{ gap: 0 }}>
          <span className="dim">COMMANDS · type, then Enter. Esc returns to the board.</span>
          {COMMAND_HELP.map((c) => (
            <div key={c.mnemonic} className="row">
              <span style={{ width: '16ch' }} className="signal">{c.mnemonic}</span>
              <span>{c.text}</span>
            </div>
          ))}
          <span className="dim" style={{ marginTop: '1lh' }}>
            Type in lower case or with Caps Lock. Shift plus a mapped letter runs a key action.
          </span>
        </div>
        <div className="stack" style={{ gap: 0 }}>
          <span className="dim">KEYS</span>
          {KEY_BINDINGS.map((b) => (
            <div key={b.action} className="row">
              <span style={{ width: '16ch' }} className="signal">{b.fKey} / Shift+{b.letter}</span>
              <span>{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function LobbyView({ code, firms, memberCounts }: { code: string; firms: ScreenData['firms']; memberCounts: Record<string, number> }) {
  const url = joinUrl(code, window.location.href);
  const rows = Object.entries(firms)
    .sort(([, a], [, b]) => a.createdAt - b.createdAt)
    .map(([id, f]) => ({ id, ...f }));
  const cols = lobbyColumns(rows.length);
  return (
    <>
      <Panel title="JOIN" bodyClassName="pad" style={{ width: 'var(--board-w)' }}>
        <div className="row" style={{ gap: '4ch', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <div style={{ width: '27ch', flexShrink: 0 }}>
            <QR text={url} label={`QR code for ${url}`} />
          </div>
          <div className="stack">
            <span className="dim">CODE</span>
            <div className="big" data-join-code="" aria-label={`Join code ${code.split('').join(' ')}`}>{code}</div>
            <span className="dim">ADDRESS</span>
            <span style={{ overflowWrap: 'anywhere' }}>{url}</span>
            <ol className="join-steps" aria-label="How to join">
              <li><span className="step-n">1</span>Scan the code or enter it on the join page.</li>
              <li><span className="step-n">2</span>Form a firm or join one.</li>
              <li><span className="step-n">3</span>Wait for the briefing.</li>
            </ol>
          </div>
        </div>
      </Panel>
      <Panel title="FIRMS" right={`${rows.length} FORMED`} bodyClassName="pad">
        {rows.length === 0 ? <p className="dim">No firms formed yet.</p> : null}
        {cols === 0 ? (
          <DataTable
            caption="Firms formed"
            rows={rows}
            rowKey={(f) => f.id}
            columns={[
              { key: 't', label: 'TICKER', w: 8, render: (f) => f.ticker },
              { key: 'n', label: 'FIRM', w: 0, render: (f) => <>{f.name} {f.isBot ? <Tag kind="BOT" /> : null}</> },
              { key: 'm', label: 'DEVICES', w: 9, align: 'r', render: (f) => (f.isBot ? <span className="dim">{'–'}</span> : (memberCounts[f.id] ?? 0)) },
            ]}
          />
        ) : (
          <>
            <p className="dim">TICKER and devices joined. BOT marks an automated firm.</p>
            <div className="lobby-cols" data-lobby-cols={cols}>
              {fillColumns(rows, cols).map((col, c) => (
                <div key={c} className="lobby-col" role="list" aria-label={`Firms formed, column ${c + 1}`}>
                  {col.map((f) => (
                    <div key={f.id} className="lobby-cell" role="listitem" data-firm={f.ticker}>
                      <span>{f.ticker}</span>
                      {f.isBot ? <span className="dim">BOT</span> : <span className="num">{memberCounts[f.id] ?? 0}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}

export function BriefingView() {
  return (
    <>
      <Panel title="MARKET" bodyClassName="pad" style={{ width: 'var(--board-w)' }}>
        <div className="stack">
          {BRIEFING_LINES.market.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <span className="dim" style={{ marginTop: '1lh' }}>COMMITS</span>
          {BRIEFING_LINES.commits.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </Panel>
      <Panel title="CONTROLS" bodyClassName="pad">
        <div className="stack">
          {BRIEFING_LINES.controls.map(([k, v]) => (
            <div key={k} className="row" style={{ flexWrap: 'nowrap' }}>
              <span className="signal" style={{ width: '8ch', flexShrink: 0 }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <span className="dim" style={{ marginTop: '1lh' }}>CARDS</span>
          {BRIEFING_LINES.cards.map(([k, v]) => (
            <div key={k} className="row" style={{ flexWrap: 'nowrap' }}>
              <span className="wire-c" style={{ width: '8ch', flexShrink: 0 }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
