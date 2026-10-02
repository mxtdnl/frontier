import { COMMAND_HELP } from '../../ui/commands';
import { DataTable, Delta, Panel, QR, StepSparkline, Tag } from '../../ui/components';
import { fmt, fmtShare, quarterLabel } from '../../ui/format';
import { KEY_BINDINGS } from '../../ui/keys';
import { BRIEFING_LINES } from './briefing';
import { boardRows, joinUrl, pactRows, previousTrust, trustSeries, valuationSeries, wireItems, type BoardRow, type PactRow, type ScreenData } from './model';

export function TrustView({ data }: { data: ScreenData }) {
  const series = trustSeries(data.rounds);
  const delta = data.pub.round === 0 ? 0 : data.pub.T - previousTrust(data.rounds);
  return (
    <Panel title="TRST · PUBLIC TRUST HISTORY">
      <div className="row" style={{ paddingTop: '0.5lh', alignItems: 'flex-end' }}>
        <div className="big signal">{fmt(data.pub.T)}</div>
        <div>
          <Delta value={delta} /> <span className="dim">QoQ</span>
        </div>
      </div>
      <div className="chart" style={{ marginTop: '1lh' }}>
        <div className="chart-y" style={{ height: '16lh' }}>
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
        <StepSparkline
          series={[{ values: series, label: 'Trust', tone: 'signal' }]}
          min={0}
          max={100}
          w={130}
          h={16}
          count={Math.max(series.length, 2)}
          description="Public trust by quarter"
        />
        <div className="chart-x">
          <span>START</span>
          <span>{series.length > 1 ? quarterLabel(series.length - 1) : ''}</span>
        </div>
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
            { key: 'id', label: 'PACT', w: 8, render: (p) => <Tag pact={p.name} /> },
            { key: 'pace', label: 'MAXPACE', w: 9, align: 'r', render: (p) => p.maxPace ?? '–' },
            { key: 'safe', label: 'MINSAFE', w: 10, align: 'r', render: (p) => p.minSafety ?? '–' },
            { key: 'audit', label: 'AUDIT', w: 22, render: (p) => <AuditCell audit={p.lastAudit} /> },
            {
              key: 'members',
              label: 'MEMBERS',
              w: 0,
              render: (p) => (
                <>
                  {p.members.map((m) => (
                    <span key={m.id} style={{ marginRight: '2ch' }}>
                      {m.ticker} {m.breach ? <Tag kind="BREACH" /> : null}
                    </span>
                  ))}
                </>
              ),
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
  return <>{quarterLabel(audit.round)} {audit.kind === 'manual' ? 'MAN' : 'AUTO'} · {result}</>;
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
              <span className="dim">{p.members.map((m) => m.ticker).join(' ')}</span>
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
  const lo = Math.min(...hist);
  const hi = Math.max(...hist);
  return (
    <Panel title={`FIRM · ${f.ticker}`} bodyClassName="pad">
      <div className="stack">
        <div className="big signal">{f.ticker}</div>
        <div className="row">
          <span>{f.name}</span>
          <span className="dim">SHARE</span> <span>{fmtShare(f.share)}</span>
          <span className="dim">VAL</span> <span>{fmt(f.value)}</span>
          <Delta value={f.dValue} />
        </div>
        <div className="chart">
          <div className="chart-y" style={{ height: '14lh' }}>
            <span>{fmt(hi, 0)}</span>
            <span>{fmt(lo, 0)}</span>
          </div>
          <StepSparkline
            series={[{ values: hist, label: 'Valuation', tone: 'wire' }]}
            min={lo}
            max={hi}
            w={100}
            h={14}
            count={Math.max(hist.length, 2)}
            description={`${f.ticker} valuation by quarter`}
          />
          <div className="chart-x">
            <span>START</span>
            <span>{hist.length > 1 ? quarterLabel(hist.length - 1) : ''}</span>
          </div>
        </div>
        <div className="row">
          {f.pacts.map((p) => (
            <Tag key={p} pact={p} />
          ))}
        </div>
      </div>
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
  return (
    <>
      <Panel title="JOIN" bodyClassName="pad" style={{ width: 'var(--board-w)' }}>
        <div className="row" style={{ gap: '4ch', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <div style={{ width: '27ch', flexShrink: 0 }}>
            <QR text={url} label={`QR code for ${url}`} />
          </div>
          <div className="stack">
            <span className="dim">CODE</span>
            <div className="big signal" aria-label={`Join code ${code.split('').join(' ')}`}>{code}</div>
            <span className="dim">ADDRESS</span>
            <span style={{ overflowWrap: 'anywhere' }}>{url}</span>
            <span className="dim" style={{ marginTop: '1lh' }}>Scan the code or enter it on the join page. Form a firm or join one.</span>
          </div>
        </div>
      </Panel>
      <Panel title="FIRMS" right={`${rows.length} FORMED`} bodyClassName="pad">
        {rows.length === 0 ? <p className="dim">No firms formed yet.</p> : null}
        <DataTable
          caption="Firms formed"
          rows={rows}
          rowKey={(f) => f.id}
          columns={[
            { key: 't', label: 'TICKER', w: 8, render: (f) => f.ticker },
            { key: 'n', label: 'FIRM', w: 0, render: (f) => <>{f.name} {f.isBot ? <Tag kind="BOT" /> : null}</> },
            { key: 'm', label: 'MBRS', w: 6, align: 'r', render: (f) => (f.isBot ? <span className="dim">{'–'}</span> : (memberCounts[f.id] ?? 0)) },
          ]}
        />
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
