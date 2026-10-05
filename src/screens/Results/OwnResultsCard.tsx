import type { FirmFinal } from '../../engine';
import type { ResultsNode } from '../../firebase/schema';
import { Delta, HBar, Panel } from '../../ui/components';
import { fmt, fmtShare } from '../../ui/format';
import { ownResultSentence } from './headlines';

interface Props {
  ticker: string;
  firmId: string;
  /** Null until the facilitator has written the results. */
  results: ResultsNode | null;
  unavailable: boolean;
  /** Fallback while results are not yet written. */
  rank: number | null;
  valuation: number | null;
}

/** The participant's own results card (spec §14.4). Reads only the firm's own row of `/results`. */
export function OwnResultsCard({ ticker, firmId, results, unavailable, rank, valuation }: Props) {
  const own: FirmFinal | undefined = results?.final[firmId];
  if (!results || !own) {
    return (
      <div className="stack">
        <Panel title={`${ticker} FINAL`} right={rank ? `RANK ${rank}` : undefined} bodyClassName="pad">
          <dl className="kv">
            <dt>Valuation</dt><dd>{valuation === null ? '–' : fmt(valuation)}</dd>
          </dl>
        </Panel>
        <p className="notice" role="status">
          {unavailable ? 'Full results cannot be read. Reload the page, or watch the board.' : 'Full results are being prepared. Watch the board.'}
        </p>
      </div>
    );
  }
  const gap = own.counterfactual - own.valuation;
  const firms = Object.keys(results.final).length;
  return (
    <div className="stack">
      <Panel title={`${own.ticker} FINAL`} right={`RANK ${own.rank} OF ${firms}`} bodyClassName="pad">
        <p className="res-headline" data-headline="">
          {ownResultSentence(own, firms)}
        </p>
        <dl className="kv">
          <dt>Valuation</dt><dd>{fmt(own.valuation)}</dd>
          <dt>Peak valuation</dt><dd>{fmt(own.peakValuation)}</dd>
          <dt>Counterfactual</dt><dd>{fmt(own.counterfactual)}</dd>
          <dt>Difference</dt><dd><Delta value={-gap} /></dd>
        </dl>
        <p className="dim" style={{ marginTop: '1lh' }}>Counterfactual: every firm holds pace 2 and safety 15 with no cards and no pacts, on the same incident draws.</p>
      </Panel>
      <Panel title="YOUR SHARE OF THE DAMAGE" bodyClassName="pad stack">
        <HBar
          label="DAMAGE"
          labelW={7}
          textW={7}
          value={own.drawShare}
          domain={[0, 1]}
          tone="down"
          text={fmtShare(own.drawShare)}
          describe={`Share of the damage ${fmtShare(own.drawShare)}`}
        />
        <HBar
          label="VALUE"
          labelW={7}
          textW={7}
          value={own.valueShare}
          domain={[0, 1]}
          tone="signal-outline"
          text={fmtShare(own.valueShare)}
          describe={`Share of the value ${fmtShare(own.valueShare)}`}
        />
        <p className="dim">Damage is your share of all exposure drawn from trust. Value is your share of the industry's final value; a firm below zero holds none.</p>
      </Panel>
      <Panel title="YOUR PACT RECORD" bodyClassName="pad">
        <dl className="kv">
          <dt>Detected</dt><dd>{own.detected}</dd>
          <dt>Undetected</dt><dd>{own.undetected}</dd>
        </dl>
        <p className="dim" style={{ marginTop: '1lh' }}>Violations are quarters in which your firm broke a pact's terms. Undetected means no audit examined that quarter.</p>
      </Panel>
      <p className="notice">Watch the board for the full results.</p>
    </div>
  );
}
