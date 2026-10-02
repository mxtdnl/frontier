import { useState } from 'react';
import type { Card, Pace } from '../../engine';
import type { DecisionNode } from '../../firebase/schema';
import { BRIEFING_LINES } from '../Screen/briefing';
import { CardPicker, CommitButton, Panel, Segmented4, SafetySlider } from '../../ui/components';
import { fmt, fmtTime } from '../../ui/format';
import { CARD_INFO, PACE_OPTIONS, canCommit, deskFigures, sameDraft, type Draft, type PlayView } from './model';

interface Target {
  id: string;
  ticker: string;
  name: string;
}

interface Props {
  view: PlayView;
  draft: Draft;
  setDraft: (d: Draft) => void;
  lastCard: Card | null;
  lastTargetTicker: string | null;
  insolvent: boolean;
  targets: Target[];
  decision: DecisionNode | null;
  /** Device label of whoever committed (spec §14.3). */
  committedBy: string;
  sending: boolean;
  offline: boolean;
  error: string;
  onCommit: () => void;
}

const WAITING: Partial<Record<PlayView, string>> = {
  lobby: 'The session has not opened. Quarter 1 opens after the briefing.',
  paused: 'Timer paused. Decisions resume when the timer restarts.',
  closed: 'Quarter closed. Results follow.',
  resolving: 'Resolving the quarter. Results follow.',
  summit: 'Decisions are paused during the summit.',
};

/** DESK: pace, safety, card, estimate and commit. */
export function Desk(p: Props) {
  const [sheet, setSheet] = useState(false);
  const open = p.view === 'open';
  const { cost, exposure } = deskFigures(p.draft);
  const targetTicker = p.targets.find((t) => t.id === p.draft.target)?.ticker ?? null;
  const committed = p.decision !== null;
  const dirty = p.decision !== null && !sameDraft(p.draft, { pace: p.decision.pace, safety: p.decision.safety, card: p.decision.card, target: p.decision.target });

  if (p.view === 'lobby') return <p className="notice" role="status">{WAITING.lobby}</p>;
  if (p.view === 'briefing') return <Briefing />;

  const status = p.error
    ? p.error
    : committed && p.decision
      ? `Committed ${fmtTime(new Date(p.decision.at))} · edit until close · ${p.committedBy}${dirty ? ' · changes not committed' : ''}`
      : open
        ? 'Not committed. Keeps last quarter’s settings if left open.'
        : (WAITING[p.view] ?? '');

  return (
    <div className="stack">
      {!open && WAITING[p.view] ? <p className="notice" role="status">{WAITING[p.view]}</p> : null}
      <section className="stack" style={{ gap: '0.5lh' }} aria-label="Pace">
        <span className="dim">PACE</span>
        <Segmented4
          label="Deployment pace"
          options={PACE_OPTIONS}
          value={p.draft.pace}
          onChange={(v) => p.setDraft({ ...p.draft, pace: v as Pace })}
          disabled={!open}
        />
      </section>
      <section className="stack" style={{ gap: '0.5lh' }} aria-label="Safety">
        <span className="dim">SAFETY · % of reference budget</span>
        <SafetySlider label="Safety spend" value={p.draft.safety} onChange={(v) => p.setDraft({ ...p.draft, safety: v })} disabled={!open} />
      </section>
      <section className="stack" style={{ gap: '0.5lh' }} aria-label="Card">
        <span className="dim">CARD</span>
        <CardPicker
          cards={CARD_INFO}
          value={p.draft.card}
          target={targetTicker}
          onChange={(c, t) => p.setDraft({ ...p.draft, card: c as Card, target: c === 'POACH' ? (p.targets.find((x) => x.ticker === t)?.id ?? null) : null })}
          lastCard={p.lastCard}
          lastTarget={p.lastTargetTicker}
          insolvent={p.insolvent}
          targets={p.targets}
          open={open && sheet}
          onOpen={() => open && setSheet(true)}
          onClose={() => setSheet(false)}
        />
        <p className="dim">
          The same card cannot repeat in consecutive quarters. POACH needs a target, and not the same target two quarters running. Insolvent firms cannot play cards.
        </p>
        {p.draft.card === 'POACH' && p.draft.target === null ? <p className="notice err" role="alert">POACH needs a target. Open CARD and select one, or choose another card.</p> : null}
      </section>
      <section className="stack" style={{ gap: 0 }} aria-label="Estimate">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span className="dim">Estimated cost this quarter</span>
          <span>{fmt(cost)}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span className="dim">Public exposure</span>
          <span>{exposure}</span>
        </div>
      </section>
      <div className="stack commit-bar" style={{ gap: '0.5lh' }}>
        <CommitButton
          state={!open ? 'locked' : committed ? 'committed' : 'idle'}
          disabled={p.sending || p.offline || !canCommit(p.draft)}
          onCommit={p.onCommit}
        />
        <p role={p.error ? 'alert' : 'status'} aria-live="polite" className={p.error ? 'notice err' : 'dim'}>
          {p.offline && open ? 'Offline. Reconnect to commit.' : status}
        </p>
      </div>
    </div>
  );
}

function Briefing() {
  return (
    <div className="stack">
      <Panel title="BRIEFING" bodyClassName="pad">
        {BRIEFING_LINES.market.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </Panel>
      <p className="notice" role="status">Quarter 1 opens shortly. Decide pace, safety and an optional card, then commit.</p>
    </div>
  );
}
