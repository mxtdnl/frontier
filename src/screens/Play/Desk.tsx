import { useState } from 'react';
import type { Card, ExposureLabel, Pace } from '../../engine';
import type { DecisionNode } from '../../firebase/schema';
import { BRIEFING_LINES } from '../Screen/briefing';
import { CardPicker, CommitButton, GlyphCheck, Panel, Segmented4, SafetySlider } from '../../ui/components';
import { fmt, fmtTime } from '../../ui/format';
import { CARD_INFO, EXPOSURE_STEPS, PACE_OPTIONS, canCommit, commitBar, deskFigures, exposureStep, sameDraft, type Draft, type PlayView } from './model';

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

/** The card rules, printed inside the card sheet (spec §14.3). */
const CARD_RULES =
  'The same card cannot repeat in consecutive quarters. POACH needs a target, and not the same target two quarters running. Insolvent firms cannot play cards.';

const WAITING: Partial<Record<PlayView, string>> = {
  lobby: 'The session has not opened. Quarter 1 opens after the briefing.',
  paused: 'Timer paused. Decisions resume when the timer restarts.',
  closed: 'Quarter closed. Results follow.',
  resolving: 'Resolving the quarter. Results follow.',
  summit: 'Decisions are paused during the summit.',
};

/** Four-step exposure meter plus the word (spec §14.3). The word carries the meaning; fills are decoration. */
export function ExposureMeter({ label }: { label: ExposureLabel }) {
  const step = exposureStep(label);
  return (
    <span className="expo" role="img" aria-label={`Public exposure ${label}, step ${step} of ${EXPOSURE_STEPS.length}`}>
      <span className="expo-cells" aria-hidden="true">
        {EXPOSURE_STEPS.map((l, i) => (
          <span key={l} className={`expo-cell${i < step ? (step >= 3 ? ' is-hot' : ' is-on') : ''}`} />
        ))}
      </span>
      <span aria-hidden="true">{label}</span>
    </span>
  );
}

/** DESK: pace, safety, card, then the decision ticket and the commit bar (spec §14.3). */
export function Desk(p: Props) {
  const [sheet, setSheet] = useState(false);
  const open = p.view === 'open';
  const { cost, exposure } = deskFigures(p.draft);
  const targetTicker = p.targets.find((t) => t.id === p.draft.target)?.ticker ?? null;
  const committed = p.decision !== null;
  const dirty = p.decision !== null && !sameDraft(p.draft, { pace: p.decision.pace, safety: p.decision.safety, card: p.decision.card, target: p.decision.target });
  const cardInfo = CARD_INFO.find((c) => c.id === p.draft.card);

  if (p.view === 'lobby') return <p className="notice" role="status">{WAITING.lobby}</p>;
  if (p.view === 'briefing') return <Briefing />;

  const bar = commitBar({
    open,
    committed,
    dirty,
    offline: p.offline,
    error: p.error,
    time: p.decision ? fmtTime(new Date(p.decision.at)) : '',
    device: p.committedBy,
    lockedText: WAITING[p.view] ?? 'locked',
  });
  const showButton = open && (!committed || dirty || bar.kind === 'error' || bar.kind === 'offline');

  return (
    <>
      <div className="stack desk" style={{ gap: '0.5lh' }}>
        {!open && WAITING[p.view] ? <p className="notice" role="status">{WAITING[p.view]}</p> : null}
        <section className="stack" style={{ gap: '0.25lh' }} aria-label="Pace">
          <span className="dim">PACE</span>
          <Segmented4
            label="Deployment pace"
            options={PACE_OPTIONS}
            value={p.draft.pace}
            onChange={(v) => p.setDraft({ ...p.draft, pace: v as Pace })}
            disabled={!open}
          />
        </section>
        <section className="stack" style={{ gap: '0.25lh' }} aria-label="Safety">
          <span className="dim">SAFETY · share of reference budget</span>
          <SafetySlider label="Safety spend" value={p.draft.safety} onChange={(v) => p.setDraft({ ...p.draft, safety: v })} disabled={!open} />
        </section>
        <section className="stack" style={{ gap: '0.25lh' }} aria-label="Card">
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
            rules={CARD_RULES}
          />
          {cardInfo ? (
            <p className="card-effect" data-card-effect="">
              <strong>{cardInfo.name}</strong> <span className="dim">{cardInfo.effect}</span>
            </p>
          ) : null}
          {p.draft.card === 'POACH' && p.draft.target === null ? <p className="notice err" role="alert">POACH needs a target. Open CARD and select one, or choose another card.</p> : null}
        </section>
      </div>
      <div className="desk-foot">
        <section className="ticket" aria-label="Estimate" data-ticket="">
          <div className="ticket-row">
            <span className="dim">Estimated cost this quarter</span>
            <span>{fmt(cost)}</span>
          </div>
          <div className="ticket-row">
            <span className="dim">Public exposure</span>
            <ExposureMeter label={exposure} />
          </div>
        </section>
        {showButton ? (
          <CommitButton
            state={committed ? 'committed' : 'idle'}
            disabled={p.sending || p.offline || !canCommit(p.draft)}
            onCommit={p.onCommit}
          />
        ) : null}
        <p
          role={bar.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`commit-status is-${bar.kind}`}
          data-commit-status={bar.kind}
        >
          {bar.kind === 'committed' || (bar.kind === 'locked' && committed) ? <><GlyphCheck />{' '}</> : null}
          {bar.text}
        </p>
      </div>
    </>
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
