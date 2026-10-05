import { useState } from 'react';
import type { Pace, Pact, PactTerms } from '../../engine';
import type { FirmNode, Phase } from '../../firebase/schema';
import { GlyphGe, GlyphLe, Panel, Segmented4, Tag } from '../../ui/components';
import { truncateList } from '../../ui/layout';
import { PACE_OPTIONS } from './model';
import { DEFAULT_TERMS_FORM, canPropose, pactAction, sortPacts, termsFromForm, termsParts, termsShort, type TermsForm } from './pacts';

/** Terms as `pace ≤ 2 · safety ≥ 15%` with the comparison signs drawn as shapes. */
export function PactTermsText({ terms }: { terms: PactTerms }) {
  const parts = termsParts(terms);
  if (parts.length === 0) return <>–</>;
  return (
    <span role="img" aria-label={termsShort(terms)} data-pact-terms="">
      {parts.map((t, i) => (
        <span key={t.label} aria-hidden="true">
          {i > 0 ? ' · ' : ''}
          {t.label} {t.op === 'le' ? <GlyphLe /> : <GlyphGe />} {t.value}
        </span>
      ))}
    </span>
  );
}

interface Props {
  phase: Phase;
  pacts: Record<string, Pact>;
  firms: Record<string, FirmNode>;
  ownFirmId: string;
  /** Name the next proposed pact will take. */
  nextName: string;
  summit: boolean;
  busy: boolean;
  offline: boolean;
  error: string;
  onPropose: (terms: PactTerms) => void;
  onJoin: (pactId: string) => void;
  onLeave: (pactId: string) => void;
}

/** PACTS: propose, join, leave, terms and members. A firm edits only its own membership. */
export function PactsTab(p: Props) {
  const list = sortPacts(p.pacts);
  const [form, setForm] = useState<TermsForm>(DEFAULT_TERMS_FORM);
  const [formError, setFormError] = useState('');
  const [proposing, setProposing] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const allowed = canPropose(p.phase);

  const submit = () => {
    const r = termsFromForm(form);
    if (!r.ok) {
      setFormError(r.message);
      return;
    }
    setFormError('');
    p.onPropose(r.terms);
    setProposing(false);
  };

  return (
    <div className="stack">
      {p.error ? <p className="notice err" role="alert">{p.error}</p> : null}

      <Panel title="PROPOSE" right={p.nextName} bodyClassName="pad">
        {!proposing ? (
          <div className="stack">
            <p className="dim">A pact sets a limit on pace, a floor on safety spend, or both. Your firm joins it on signing.</p>
            <button
              type="button"
              className="btn btn-signal btn-block"
              disabled={!allowed || p.busy || p.offline}
              onClick={() => setProposing(true)}
            >
              PROPOSE A PACT
            </button>
            {!allowed ? <p className="dim" role="status">Pacts can be proposed while a quarter is open or during a summit.</p> : null}
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="field check">
              <input type="checkbox" checked={form.limitPace} onChange={(e) => setForm({ ...form, limitPace: e.target.checked })} />
              <span>Maximum pace</span>
            </label>
            <Segmented4
              label="Maximum pace value"
              options={PACE_OPTIONS}
              value={form.maxPace}
              onChange={(v) => setForm({ ...form, maxPace: v as Pace, limitPace: true })}
            />
            <label className="field check">
              <input type="checkbox" checked={form.limitSafety} onChange={(e) => setForm({ ...form, limitSafety: e.target.checked })} />
              <span>Minimum safety spend</span>
            </label>
            <div className="field">
              <label htmlFor="pact-safety" className="dim">Minimum safety, 0 to 30</label>
              <input
                id="pact-safety"
                type="number"
                inputMode="numeric"
                min={0}
                max={30}
                step={1}
                value={form.minSafety}
                onChange={(e) => setForm({ ...form, minSafety: e.target.value, limitSafety: true })}
              />
            </div>
            <p className="dim">A breach found by an audit is published and fined. Repeated breaches lead to removal from the pact.</p>
            {formError ? <p className="notice err" role="alert">{formError}</p> : null}
            <div className="row">
              <button type="submit" className="btn btn-signal" disabled={p.busy || p.offline}>SIGN {p.nextName}</button>
              <button type="button" className="btn" onClick={() => setProposing(false)}>CANCEL</button>
            </div>
          </form>
        )}
      </Panel>

      {list.length === 0 ? <p className="notice" role="status">No pacts have been formed.</p> : null}
      {list.map((pact) => {
        const members = Object.keys(pact.members)
          .map((id) => p.firms[id]?.ticker ?? '?')
          .sort();
        const { shown, more } = truncateList(members);
        const full = expanded.has(pact.id);
        const action = pactAction(pact, p.ownFirmId);
        return (
          <Panel
            key={pact.id}
            title={pact.name}
            right={`${members.length} MBRS${pact.status !== 'active' ? ' · ' + pact.status.toUpperCase() : ''}`}
            bodyClassName="pad"
          >
            <div className="stack">
              <dl className="kv">
                <dt>Terms</dt><dd><PactTermsText terms={pact.terms} /></dd>
                <dt>Members</dt>
                <dd>
                  {(full ? members : shown).join(' ') || '–'}
                  {more > 0 ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="btn"
                        aria-expanded={full}
                        onClick={() => setExpanded((e) => (full ? new Set([...e].filter((x) => x !== pact.id)) : new Set([...e, pact.id])))}
                      >
                        {full ? 'Show fewer' : `+${more} more`}
                      </button>
                    </>
                  ) : null}
                </dd>
                <dt>Your firm</dt><dd>{p.ownFirmId in pact.members ? <Tag pact={pact.name} /> : 'Not a member'}</dd>
              </dl>
              {action === 'join' ? (
                <button type="button" className="btn btn-block" disabled={p.busy || p.offline} onClick={() => p.onJoin(pact.id)}>
                  JOIN {pact.name}
                </button>
              ) : null}
              {action === 'leave' ? (
                <button type="button" className="btn btn-block" disabled={p.busy || p.offline} onClick={() => p.onLeave(pact.id)}>
                  LEAVE {pact.name}
                </button>
              ) : null}
              {pact.status !== 'active' ? <p className="dim">This pact has dissolved. It can no longer be joined.</p> : null}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
