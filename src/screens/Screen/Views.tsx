import {
  FIRMS,
  HEADLINES,
  MORATORIUM_HEADLINE,
  PACTS,
  ROUND,
  TRUST,
  TRUST_HISTORY,
  valueHistory,
  BRIEFING_LINES,
  JOIN_CODE,
} from '../../mock/fixtures';
import { COMMAND_HELP } from '../../ui/commands';
import { DataTable, Delta, Panel, QR, StepSparkline, Tag } from '../../ui/components';
import { fmt, fmtShare, quarterLabel } from '../../ui/format';
import { KEY_BINDINGS } from '../../ui/keys';

export function TrustView() {
  const delta = TRUST.value - TRUST.prev;
  return (
    <Panel title="TRST · PUBLIC TRUST HISTORY">
      <div className="row" style={{ paddingTop: '0.5lh', alignItems: 'flex-end' }}>
        <div className="big signal">{fmt(TRUST.value)}</div>
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
          series={[{ values: TRUST_HISTORY, label: 'Trust', tone: 'signal' }]}
          min={0}
          max={100}
          w={130}
          h={16}
          count={TRUST_HISTORY.length}
          description="Public trust by quarter"
        />
        <div className="chart-x">
          <span>Q1 Y1</span>
          <span>{quarterLabel(ROUND)}</span>
        </div>
      </div>
    </Panel>
  );
}

export function PactsView({ emphasis = false }: { emphasis?: boolean }) {
  return (
    <Panel title={emphasis ? 'PACTS · SUMMIT' : 'PACT'} bodyClassName="pad">
      <DataTable
        caption="Pacts"
        tall
        rows={PACTS}
        rowKey={(p) => p.id}
        columns={[
          { key: 'id', label: 'PACT', w: 8, render: (p) => <Tag pact={p.id} /> },
          { key: 'pace', label: 'MAXPACE', w: 9, align: 'r', render: (p) => p.maxPace ?? '–' },
          { key: 'safe', label: 'MINSAFE', w: 10, align: 'r', render: (p) => p.minSafety ?? '–' },
          { key: 'members', label: 'MEMBERS', w: 0, render: (p) => p.members.join('  ') },
        ]}
      />
    </Panel>
  );
}

export function WireView() {
  return (
    <Panel title="WIRE · HEADLINE LOG" bodyClassName="pad">
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 0 }}>
        {[...HEADLINES, { round: 8, text: MORATORIUM_HEADLINE }].slice(0, 14).map((h, i) => (
          <li key={i} className="row" style={{ gap: '2ch' }}>
            <span className="dim" style={{ width: '6ch' }}>{quarterLabel(h.round)}</span>
            <span className="wire-c">{h.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function FirmView({ ticker }: { ticker: string }) {
  const f = FIRMS.find((x) => x.ticker === ticker);
  if (!f) {
    return (
      <Panel title="FIRM" bodyClassName="pad">
        <p className="notice err">No firm with ticker {ticker}. Enter BOARD for the list of tickers.</p>
      </Panel>
    );
  }
  const hist = valueHistory(f);
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
            <span>{fmt(Math.max(...hist), 0)}</span>
            <span>{fmt(Math.min(...hist), 0)}</span>
          </div>
          <StepSparkline
            series={[{ values: hist, label: 'Valuation', tone: 'wire' }]}
            min={Math.min(...hist)}
            max={Math.max(...hist)}
            w={100}
            h={14}
            description={`${f.ticker} valuation by quarter`}
          />
          <div className="chart-x">
            <span>{quarterLabel(1)}</span>
            <span>{quarterLabel(ROUND)}</span>
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

export function LobbyView() {
  const url = new URL(`#/j/${JOIN_CODE}`, window.location.href).toString();
  return (
    <>
      <Panel title="JOIN" bodyClassName="pad" style={{ width: 'var(--board-w)' }}>
        <div className="row" style={{ gap: '4ch', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <div style={{ width: '27ch', flexShrink: 0 }}>
            <QR text={url} label={`QR code for ${url}`} />
          </div>
          <div className="stack">
            <span className="dim">CODE</span>
            <div className="big signal" aria-label={`Join code ${JOIN_CODE.split('').join(' ')}`}>{JOIN_CODE}</div>
            <span className="dim">ADDRESS</span>
            <span style={{ overflowWrap: 'anywhere' }}>{url}</span>
            <span className="dim" style={{ marginTop: '1lh' }}>Scan the code or enter it on the join page. Form a firm or join one.</span>
          </div>
        </div>
      </Panel>
      <Panel title="FIRMS" right={`${FIRMS.length} FORMED`} bodyClassName="pad">
        <DataTable
          caption="Firms formed"
          rows={FIRMS}
          rowKey={(f) => f.ticker}
          columns={[
            { key: 't', label: 'TICKER', w: 8, render: (f) => f.ticker },
            { key: 'n', label: 'FIRM', w: 0, render: (f) => f.name },
            { key: 'm', label: 'MBRS', w: 6, align: 'r', render: (f) => f.members },
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
