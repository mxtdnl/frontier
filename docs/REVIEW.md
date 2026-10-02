# Independent review (Session 9)

Date: 2026-10-02. Scope: security, model, copy and design, as set out for Session 9 in `docs/SESSIONS.md`. No features were added beyond what the fixes needed. Both high findings are fixed. For H2 the owner chose the join throttle, which changes spec §12 and §13. Everything else is listed for the owner to decide.

Severity scale:
- **Critical**: breaks a class session or exposes hidden values to participants with no special effort.
- **High**: one participant can spoil a session or another firm's play, or a facilitator cannot recover without starting again.
- **Medium**: a real weakness that needs effort to exploit or has a workaround.
- **Low**: a minor or cosmetic issue, or a spec-level observation.

## Summary

| # | Severity | Finding | Status |
|---|---|---|---|
| H1 | High | Firms left with no members, and extra firms, cannot be removed | **Fixed** (REMOVE and LOCK JOINS on the console) |
| H2 | High | A firm's 4-digit PIN could be guessed in seconds while joining was open | **Fixed** (per-firm join throttle, owner's choice; new rules to paste) |
| M1 | Medium | One firm alone can trigger the moratorium with 4 or fewer firms | Open: runbook advice added; parameter choice for the owner |
| M2 | Medium | POACH dominates the card choice, unlike the §8.2 diagnostic suggests | Open |
| M3 | Medium | Pact sanctions do not deter a breach | Open |
| M4 | Medium | Tickers are not unique in the rules | Open |
| L1–L10 | Low | See section 4 | Open |

No critical findings.

---

## 1. Security

Each threat was tested against `database.rules.json` in the emulator (`tests/rules/audit.test.ts`, 16 tests) and against the client code (`tests/ui/hidden-paths.test.ts`, 6 tests).

| Threat | Result | Evidence |
|---|---|---|
| A participant uses developer tools to read hidden values | **Refused.** `engine` (τ, end round, seed), `pactsPrivate`, other firms' `firmsPrivate`, `firmSecrets` and decisions, the member and presence lists and `results` before the end are all denied, to members and non-members alike. No public node contains τ or the end round. | `audit.test.ts` "reading hidden values" |
| τ and the end round reach `#/screen` or `#/play` | **No.** The participant pages (`#/`, `#/j`, `#/play` and the results card) never load the facilitator hooks or the orchestrator: the test walks their whole import graph. The projector runs the orchestrator, because F9 resolves quarters, but its own code never subscribes to or renders `engine` or `pactsPrivate`, and no orchestrator message contains τ or the end round. The e2e run also checks that τ is absent from the projector's page. A mutation check (adding an `engine` hook to the desk) fails the test. | `hidden-paths.test.ts`; `npm run test:e2e` |
| Writing another firm's decision | **Refused**, including for a bot firm, and inside a multi-path update that also writes the member's own decision: that update fails as a whole and writes nothing. | `audit.test.ts` |
| Late writes | **Refused**: more than 3 s after the deadline, while paused (no deadline), while resolving, for a past quarter, and with a back-dated client timestamp. | `audit.test.ts`, `participant.test.ts` |
| Forging results | **Refused.** Participants cannot write `public`, `firmsPublic`, `firmsPrivate`, `rounds`, `results`, `engine`, `pactsPrivate`, `wire`, a pact's status or an existing firm. A participant cannot create a firm marked as a bot. | `audit.test.ts` |
| Guessing PINs | **Was possible in about 9 s while joining was open; now about 2.8 hours.** See H2. | `audit.test.ts`; `scripts/audit-pin.ts` |

### H1 (High, fixed): firms left with no members, and extra firms, could not be removed

**What happened.**
- In the normal join page, a device already in a firm is offered "Found a new firm" and "Join a different firm".
- Doing either leaves the old firm in place. If that device was its only member, the old firm has no members.
- Nothing could remove it. The spec's DANGER panel (§14.2: "remove a firm, lock joins") had only DELETE SESSION.
- A firm with no members plays on AUTO defaults (pace 2, safety 10) for the whole session. It counts in N, takes market share and sits on the board.
- With developer tools, one device can found any number of firms (the rules have no cap). More than 16 firms makes F9 refuse to start, and the only way out was to delete the session.

**Reproduction (before the fix).**
1. On a phone, found firm SPAR, then on the same phone found firm GONE.
2. The projector lobby lists both firms. SPAR's MBRS reads 0, and the console's PRESENCE reads *none*.
3. Press F9. SPAR is in the market for the whole session.

`tests/emulator/orchestrator.test.ts` ("removes a firm left without members…") reproduces steps 1–2 through the real rules.

**Fix.**
- `#/control`, FIRMS panel, lobby only: a **REMOVE** button per firm (press twice within 3 s). One update removes the firm, its PIN and its devices' memberships (`removeFirm` in `src/firebase/orchestrator.ts`).
- Removal is refused after the lobby, because the market is built from the firm list at the briefing.
- DANGER panel: **LOCK JOINS** / **REOPEN JOINS**, lobby only (`setJoinsLocked`). The briefing still locks joining, as before.
- `docs/RUNBOOK.md`: check for PRESENCE *none* before the briefing, and lock joins once teams have formed.
- Tests:
  - 6 orchestrator unit tests
  - 1 emulator test through the real rules
  - an e2e step that founds twice from one device, removes both firms from the console, and locks and reopens joins.
- No rules change was needed: the facilitator could already write these nodes.

### H2 (High, fixed): a firm's PIN could be guessed in seconds while joining was open

**What happened.**
- Joining checked a 4-digit PIN in the rules (§13). The rules refuse a wrong guess but cannot count failures, because a refused write leaves no trace.
- One anonymous client against the emulator found a PIN after 7,400 guesses in 6.6 s, about 1,100 guesses per second. All 10,000 PINs took about 9 s. The live database's rate was not measured (the container cannot reach it).
- A device that got in stayed a member after joining closed (rejoining is always allowed). For the rest of the session it could read that firm's cash, capability and decisions, and overwrite the firm's decision every quarter.
- Doing this needs a short script run from the browser's developer tools. It is not possible from the app's own pages.

**Reproduction.**

```
firebase emulators:exec --config firebase.test.json --only auth,database --project demo-frontier "npx tsx scripts/audit-pin.ts 7391 100 15000"
```

- Before the fix: `PIN 7391 after 7400 guesses in 6.6 s (1119 guesses per second)`.
- After the fix:
  - `Direct membership writes: PIN not found after 10000 guesses in 6.5 s.`
  - `Throttled path: 15 guesses recorded and 42778 refused in 15.0 s (1.00 guesses per second, 20 parallel writers). Expected time for all 10,000 PINs at this rate: 2.8 hours.`

**Fix (owner's choice: join throttle).**
- A join is now two writes (`joinFirm` in `src/firebase/api.ts`).
  1. Record the guess. The client writes `joinRequests/{firm}/{uid}: {pin, at}` and `joinThrottle/{firm}: now` in one update. The rules accept this at most once per firm per second, whoever writes it, and refuse it while joining is locked.
  2. Join. `members/{uid}` is accepted only if its PIN equals both the recorded guess and the firm's PIN.
- Founding a firm and rejoining the device's own firm need no recorded guess, and are unchanged.
- No participant can read `joinRequests` or `joinThrottle`.
- If two teammates join the same firm in the same second, the app waits about a second and retries, up to 8 times. If the slot stays busy it says: "Another device is joining this firm. Wait a few seconds and try again."
- REMOVE also clears a removed firm's guesses and stamp.
- Tests:
  - 4 new tests in `audit.test.ts`, and the membership tests in `participant.test.ts` rewritten for the two-step join
  - the emulator API test joins through the real SDK, a wrong PIN first and then the right one within the same second
  - mutation checks: removing the one-second condition, or the recorded-guess check, fails 1 and 3 tests respectively; both were restored.
- **Owner step:** paste the new `database.rules.json` into the Firebase console. Until then the old live rules still accept a direct join with the right PIN, so the guessing weakness stays open, and a wrong PIN shows "Another device is joining this firm…" after about 10 s instead of "The PIN was not accepted".

**What remains.**
- Someone who keeps writing the stamp every second can delay real joins to that firm. The app retries, and the facilitator can press LOCK JOINS once teams have formed.
- The runbook asks the facilitator to check the console for unexpected devices before the briefing.

---

## 2. Model

Reports:
- `reports/calibration-500.md` (`npm run calibrate -- --seeds 500`)
- `reports/strategy-audit.md` (`npx tsx tools/audit-strategies.ts --seeds 100`)

No parameter was changed.

**Calibration at 500 seeds.** C1–C4 pass for N = 4, 6, 8, 10 and 12, with the same margins as at 200 seeds:

| Condition | Result at 500 seeds |
|---|---|
| C1 | Median moratorium quarter is 6; at least 99.4% of seeds have one by quarter 12 |
| C2 | No moratorium by quarter 30; gain over the greedy field is 460–464% |
| C3 | The greedy firm gains 354–447% |
| C4 | Moratorium by quarter 14 in at most 1.0% of seeds (N = 4) |

**Dominant-strategy search.**
- Firm 0 tried 199 scripted strategies:
  - pace 1–4 × safety 0, 5, 10, 15, 20 or 30 × 8 card plans
  - plus switches between restraint and racing at quarters 4–12.
- Each was played against four fields (restrained, greedy, defaults, mixed) at N = 4, 8 and 12, over 100 seeds. It was compared with the two §8.1 references, the greedy bot and the sustainable policy.
- **No dominant strategy.** Five different strategies are best across the 12 field-and-N cells. In greedy fields the best reply is pace 1 at safety 0, because the market has already collapsed.
- One strategy beats both references in every cell: **pace 3, safety 0, POACH and BLITZ alternating**. It is a sharper form of greedy play, not a way around the lesson. The best responses in restrained and mixed fields take 20–51% of all trust draw and depend on others holding back: this one collapses the market in 14% of mixed-field seeds at N = 4.
- **Symmetric play.** If every firm plays pace 1, safety 0 and PUBLISH every other quarter, there is no moratorium in 30 quarters, and the mean firm value at quarter 14 is 50–60% above an all-sustainable field (1,287–1,356 against 847–856). This supports restraint rather than undermining it: the best collective play is even more restrained than the spec's "sustainable" policy (pace 2, safety 15). It does show that PUBLISH's +1.0 trust, which the spec does not scale by 8/N, is a strong collective lever (L9).

### M1 (Medium): one firm alone can trigger the moratorium with 4 or fewer firms

**What happens.**
- C4 passes because its single greedy firm uses the greedy bot (pace 3 or 4, safety 5).
- The worst single-firm strategy is pace 4, safety 0, with LOBBY every other quarter. It does much more damage, because each incident costs INC_TRUST × 8/N trust: 8 points at N = 4.

Moratorium caused by that one firm alone (500 seeds; the other firms restrained, or keeping the defaults):

| N | by quarter 14 | by quarter 30 | median quarter |
|---|---|---|---|
| 2 | 88–90% | 99.6% | 8 |
| 3 | 49–56% | 82–94% | 13 |
| 4 | **17–22%** | 43–65% | 16–17 |
| 5 | 2–6% | 13–29% | 20 |
| 6 | 0.8–1.4% | 3–9% | 20 |
| 8 | 0% | 0–0.2% | – |

So the statement "no single firm can trigger a moratorium at N = 4" does not hold. With the default hidden end (quarters 10–14) the risk inside a session is lower than the "by 14" column, because the median quarter is 16–17.

**Reproduction.** `npx tsx tools/audit-strategies.ts --seeds 100`, section 4.

**Mitigation now.** The runbook says to use at least 6 firms, adding bot firms on `#/new` for small classes.

**Options for the owner** (each needs a calibration run and an entry in `docs/CALIBRATION.md`):
1. Make 6 firms the practical minimum. Bots fill the gap, and `#/new` could warn below 6. This needs no parameter change.
2. Scale incident damage with a floor, for example INC_TRUST × 8/max(N, 6). This is a spec deviation: it changes the §6.3 step 5 formula.
3. Accept it. One reckless firm in a very small market can be a valid teaching moment.

### M2 (Medium): POACH dominates the card choice

**What happens.**
- The §8.2 card-dominance check passes (NONE is chosen 87% of the time), but it judges each card only by the valuation at the end of that quarter.
- Over a whole session, POACH is by far the strongest card: +3 capability for you and −3 for a rival, compounding through share. In a restrained field at N = 8, valuation at the end of the session:

| Pace and safety | No card | POACH every other quarter | POACH and BLITZ alternating |
|---|---|---|---|
| Pace 2, safety 15 | 740 | 1,155 (+56%) | 1,286 (+74%) |
| Pace 4, safety 0 | 2,087 | 2,422 | 2,590 |

- Every best response in a restrained, defaults or mixed field includes POACH. PUBLISH and BLITZ alone add 0–8%. LOBBY loses value unless a pact fine is due.
- Cards are meant to be tactical choices. In practice the card decision collapses to "POACH whenever allowed".

**Reproduction.** `reports/strategy-audit.md`, section 1 (card plans table).

**Options:** raise POACH's cost (15 → 25–30), cut its effect (±3 → ±2), or add a multi-quarter best-response check to `tools/calibrate.ts` before tuning. Each is a calibration change.

### M3 (Medium): pact sanctions do not deter a breach

**What happens.**
- All 8 firms are in a pact (maximum pace 2, minimum safety 10), with automatic audits at the default 0.25.
- A firm that breaches at pace 4, safety 0 still ends at 1,760 against 740 for complying, after paying 617 in fines on average.
- Alternating LOBBY halves the fines (318).
- Fines are a share of current cash with a minimum of 10, so a firm with little or negative cash pays only 10 per detection.
- The spec's lesson that non-binding pacts fail is supported. However, learning objective 3 also asks how monitoring and graduated sanctions change behaviour, and at these settings they barely do.

**Reproduction.** `reports/strategy-audit.md`, section 3.

**Options:** a higher default audit probability (0.25 → 0.5), fines based on valuation rather than cash, or a larger minimum fine. Each is a calibration change. Alternatively, keep it and use the debrief to discuss why the sanctions were too weak.


---

## 3. Copy and design

**Copy.**
- `npm run lint:copy` passes (49 files).
- I also checked, by script and by hand, every string that reaches participants or the projector from outside `src/screens` and `src/ui`:
  - engine headlines (57 templates)
  - the live wire
  - orchestrator and Firebase error messages shown on the projector or console.
- No banned or telegraphing term appears outside the moratorium headline and the results screen. There are no exclamation marks, no apologies and no emoji. The hits were internal identifiers only (the `games` database path, the `collapse` headline kind, the `game=` key in exported DATA lines).

**Design.**
- I reviewed screenshots from `npm run test:e2e` against §16.4 and the character grid:
  - participant at 360×640, 390×844 and 1440×900
  - projector at 1280×720 and 1920×1080.
- No gradients, glow, blur, shadows, rounded cards, pie charts, smoothed charts, emoji or decorative icons. Columns sit on whole `ch` widths.
- The automated checks pass: no clipping, no horizontal scroll, touch targets of at least 44 px, text of at least 14 px.

Low findings from this pass are L6–L8 in section 4.

---

## 4. Low findings (for the owner to decide)

### M4 (Medium): tickers are not unique in the rules

**What happens.**
- The join page refuses a ticker already in the session, but the rules do not.
- With developer tools, a participant can found a second firm with an existing ticker, for example ALPH. The board, the wire headlines, the POACH target list and `FIRM ALPH` then show two firms with the same name.

**Reproduction.** In the lobby, write a firm with the same ticker through the database REST interface. The rules accept it.

**Fix (proposed).** Add a `tickers/{TICKER}: firmId` index node, created in the same update as the firm, with a rule that it must not already exist. This changes spec §12 and §13. Until then, the facilitator can press REMOVE on the copy in the lobby.

### Low findings

| # | Finding | Reproduction | Proposed fix |
|---|---|---|---|
| L1 | **Other firms' cash and capability can be worked out from public data.** Cash is 100 plus the sum of published quarterly profits, minus published fines and the deterministic moratorium haircut. Capability is (valuation − cash) / (3 × T/100). The quarterly capability gains for pace 1–4 do not overlap (1.5–2, 3–4, 5.25–7, 8.25–11), so pace can be inferred even with disclosure off. This contradicts §6.5's "never see other firms' cash, capability, pace". It follows from the spec's own public set, not from a code fault. | A spreadsheet of the board's PROFIT and VALUE columns. | Owner decision: accept it (it takes real effort, and the market "prices" it), or publish rounded figures. |
| L2 | Published audit records (`rounds/{r}/audits`) include each fine's amount. Since fine = rate × cash, the amount reveals that firm's cash. | Read `rounds` from developer tools after a detected breach. | Publish only firm, pact and count, and keep amounts on the console. Low value while L1 stands. |
| L3 | A pact join or leave written in the fraction of a second between the resolution's read and its write is lost, but only if that same resolution also changes the pact's members (an expulsion), because the orchestrator then rewrites the whole member list. | Join a pact while the phase is RESOLVING, in a quarter where an audit expels a member. | Refuse pact membership edits while RESOLVING, in the rules. |
| L4 | The rules accept joining a dissolved pact (Session 6 open issue). The engine ignores it, so it has no effect on play. | Write `pacts/{p}/members/{f}` on a dissolved pact. | Add `status === 'active'` to the member rule. |
| L5 | An expelled firm can rejoin the pact. The spec is silent. Its sanction count persists. | Join again after expulsion. | Owner decision. |
| L6 | Firm names, tickers and device initials are free text and are shown on the projector. A team could use a banned or telegraphing word. | Found a firm named "Commons Labs". | REMOVE in the lobby (H1 fix). Optionally run the copy rules on names in the join form. |
| L7 | Some uppercase labels are longer than the 6-character mnemonic rule (§16.2): DETECTED and UNDETECTED (results), and the phase names BRIEFING and RESOLVING. Most other long labels come from the spec itself (COUNTERFACTUAL, ATTRIBUTION, VALUE DESTROYED). | `src/screens/Results/Results.tsx:340`, `src/screens/Screen/Screen.tsx:21` | Owner decision: shorten (DETECT, UNDET) or accept, since they are spec terms. |
| L8 | At 360×640 the "Estimated cost" and "Public exposure" lines sit below the commit button, so a phone user must scroll to see them before committing. | `shots/e2e-play-open-360x640.png` | Move the two lines above the card picker on narrow screens. |
| L9 | PUBLISH (+1.0) and LOBBY (−0.5) trust effects are not scaled by 8/N (as the spec says), while draw and incidents are. With 12 firms, one PUBLISH outweighs a pace-4 firm's whole quarterly draw. | `reports/strategy-audit.md`, section 2 | Owner decision at the next calibration: keep, or scale by 8/N. |
| L10 | `results` can be read by every signed-in user once the session ends, including every firm's figures and violations, and τ if the reveal setting is on (Session 7 open issue). This is what spec §13 says. | Read `results` after the end. | Accept (spec), or split a per-firm card node. |

Also noted, no action needed:
- Codes are 4 letters (331,776 values), so live sessions can be found by trying codes. This only exposes public nodes and the lobby, which LOCK JOINS now closes early.
- `npm audit` still reports 4 high findings in Firebase's unused Firestore dependency (Session 8).
