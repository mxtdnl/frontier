# FRONTIER — specification v1.0

Working title. Terminal mnemonic: `FRNT`.
A multiplayer classroom simulation in which teams run competing AI companies over quarterly rounds. The design goal is a tragedy-of-the-commons collapse that students cause themselves and recognise afterwards.

Owner: Max Neal (BSc PEP, Hult International Business School).
Status: build-ready. Sections marked **[TUNABLE]** may be changed only through the calibration process in §8.

---

## 1. Purpose and learning objectives

By the end of a session, students should be able to:

1. Explain how individually rational competition can destroy a shared resource that every competitor depends on (Hardin 1968; Ostrom 1990).
2. Distinguish private returns from shared costs, i.e. a negative externality.
3. Evaluate why non-binding agreements fail under competitive pressure, and how monitoring, disclosure and graduated sanctions change behaviour (Ostrom's design principles).
4. Connect the dynamics to the real debate on AI safety racing (Armstrong, Bostrom & Shulman 2016).

**Non-telegraphing rule.** Nothing a participant sees before the results screen may name or hint at the lesson. The banned vocabulary is listed in §15.3. The game presents itself as a competitive business simulation.

---

## 2. Session format

| Item | Value |
|---|---|
| Firms | 2–16 supported; calibrated for 4–12 |
| Team size | 1–5 devices per firm (any member can submit; last commit wins) |
| Round | One financial quarter |
| Round timer | Default 120 s; facilitator can add ±30 s or pause |
| Typical session | 8–14 quarters (35–60 min) plus a 20–30 min debrief |
| Hard maximum | 30 quarters |
| Devices | Projector (facilitator laptop), optional private facilitator console, one or more phones/laptops per firm |
| Interaction | In person or Zoom chat. No in-app chat. |

---

## 3. Roles and routes

The app is a single-page app using hash routing. It is built to one `index.html` and hosted on GitHub Pages.

| Route | Who | Auth | Purpose |
|---|---|---|---|
| `#/` | Anyone | — | Landing: "Join a game" or "Facilitator sign-in" |
| `#/j/:code` | Participants | Anonymous | Join flow: game code, then found or join a firm |
| `#/play/:gameId` | Participants | Anonymous + membership | Control centre (mobile-first, responsive to desktop) |
| `#/screen/:gameId` | Facilitator | Email/password + facilitator allowlist | Projected board, with facilitator keyboard controls |
| `#/control/:gameId` | Facilitator | Same as above | Private console on a non-mirrored device: setup, hidden parameters, submissions, presence, audits |
| `#/results/:gameId` | Participants and facilitator | Same as the game | Results. The projector sequence is facilitator-driven; participants see their own firm's results card |
| `#/new` | Facilitator | Facilitator | Create a game and configure settings (§5.4) |

The projector route must never render hidden parameters: τ, the end round, unaudited violations, or private firm data. Those appear only on `#/control`.

---

## 4. Game flow and state machine

```
LOBBY → BRIEFING → OPEN(1) → RESOLVING(1) → REVEAL(1) → OPEN(2) → … → ENDED
                              ↑                     │
                              └── SUMMIT ←──────────┘   (facilitator may enter SUMMIT from OPEN or REVEAL)
```

| Phase | Meaning | Facilitator action to leave |
|---|---|---|
| `lobby` | Firms form; QR code and game code on screen | F9 → `briefing` (also locks firm creation) |
| `briefing` | One-screen market primer (§14.5) | F9 → `open` round 1 |
| `open` | Decisions accepted until `deadline` | F9 = force resolve (missing firms take defaults, §6.4) |
| `resolving` | Facilitator client runs the engine (§11) | Automatic → `reveal` |
| `reveal` | Results, headlines and leaderboard reorder | F9 → next `open`, or `ended` if the end round is reached |
| `summit` | Timer paused; "Industry summit in session"; pact UI emphasised | F8 → return to the previous phase |
| `ended` | Results sequence (§14.4) | — |

**Collapse** is a flag rather than a phase. When the trust index T falls below τ during resolution, `public.collapsed = true` and the reveal shows the moratorium event. From that reveal the facilitator chooses F9 (continue under moratorium) or F10 (end now).

**Hidden end.**
- `endMode` is one of `manual`, `random` or `fixed`.
- `random`: endRound ~ UniformInt[minEnd, maxEnd]. Default 10–14; maxEnd ≤ 30.
- `fixed`: endRound is set explicitly.
- `manual`: the game runs until the facilitator ends it or round 30 is reached.
- endRound is stored only at the facilitator-only engine path.
- Participants and the projector show the current quarter only, never a total.
- After round 30 resolves, the next F9 always goes to `ended`.

**End early.** F10 on `screen` or `control` requires a second press within 3 s to confirm. If pressed during `open`, the current round is discarded unresolved and the game moves to `ended`. If pressed during `reveal`, it moves straight to `ended`.

**Quarter labels.** Round n is shown as `Q{((n−1) mod 4)+1} Y{ceil(n/4)}`, e.g. round 7 → `Q3 Y2`.

---

## 5. Decisions

### 5.1 The three inputs per firm per quarter

| Input | Control | Values | Default if missing |
|---|---|---|---|
| Deployment pace | 4-segment selector | 1 Cautious, 2 Standard, 3 Aggressive, 4 Breakneck | Previous quarter's value; round 1 → 2 |
| Safety spend | Slider | Integer 0–30 (% of reference budget) | Previous quarter's value; round 1 → 10 |
| Action card | Optional picker | `NONE`, `POACH`, `PUBLISH`, `LOBBY`, `BLITZ` | `NONE` |

Firms commit with a single button. They can change and recommit until the deadline. The board shows a ✓ beside committed firms and `AUTO` beside firms that received defaults.

### 5.2 Action cards **[TUNABLE costs and effects]**

| Card | Cost (cash) | Effect | Constraint |
|---|---|---|---|
| `POACH` Poach talent | 15 | You +3 capability; the target firm −3 capability (floor 10) | Requires a target firm; not the same target two rounds running |
| `PUBLISH` Publish safety research | 10 | Public trust +1.0 at resolution; your incident probability ×0.5 this quarter | — |
| `LOBBY` Lobby regulators | 10 | Exempt from pact fines detected this quarter (the violation is still recorded); public trust −0.5 | — |
| `BLITZ` Marketing blitz | 15 | Your effective capability ×1.2 in the share calculation this quarter only | — |

A firm may not play the same card in consecutive quarters. Insolvent firms (§6.7) cannot play cards.

### 5.3 Pacts (participant side)

- Any firm may propose a pact during `open` or `summit`.
- Terms are a maximum pace (1–4 or none) and/or a minimum safety level (0–30 or none).
- Other firms join from the PACTS tab and may leave at any time.
- Joining and leaving are public and generate wire headlines.
- Mechanics are in §9.

### 5.4 Facilitator settings (at `#/new`, editable until round 1)

| Setting | Default |
|---|---|
| Round timer | 120 s |
| Auto-resolve at deadline | Off (submissions lock; facilitator presses F9) |
| End mode | `random` 10–14 |
| Disclosure at start | Off |
| Automatic audit probability per pact per quarter | 0.25 |
| Bot firms | 0 (each bot has a policy: `cautious`, `standard`, `greedy`, `mimic-leader`) |
| Reveal threshold on results screen | Off |
| Lit-room display mode | Off |
| Seed | Random; may be fixed for rehearsal |

---

## 6. Engine model

The engine is a pure, deterministic TypeScript module with no Firebase imports. It takes `(state, decisions, params, rng)` and returns `(newState, outputs)`. Every modifier is multiplicative and weight-adjusted.

### 6.1 State

Global state:
- T: public trust, 0–100. Start T0.
- M: market size.
- round.
- collapsed.
- τ: hidden threshold.

Per firm:
- cash_i
- C_i: capability
- lastCard_i
- lastPoachTarget_i
- cumulativeDraw_i
- incidents_i
- violations_i (per pact)
- insolvent_i

### 6.2 Parameters **[TUNABLE — starting guesses, not yet calibrated]**

| Symbol | Meaning | Start value |
|---|---|---|
| T0 | Starting trust | 72 |
| R | Logistic regeneration rate (carrying capacity 100) | 0.16 |
| τ | Collapse threshold | UniformReal[30, 40] per game |
| CAP_GAIN[p] | Capability gain by pace | [2, 4, 7, 11] |
| COMPUTE_COST[p] | Cash cost by pace | [12, 20, 32, 48] |
| DRAW[p] | Base trust draw by pace | [1.0, 2.5, 5.5, 9.0] |
| INC_BASE[p] | Incident probability by pace | [0.02, 0.05, 0.15, 0.30] |
| SAFETY_DRAW_EFF | Max draw reduction at s = 30 | 0.60 |
| SAFETY_INC_EFF | Max incident reduction at s = 30 | 0.70 |
| SAFETY_CAP_DRAG | Max capability-gain drag at s = 30 | 0.25 |
| BUDGET_REF | Safety cost per 1% | 1.0 cash per percentage point |
| INC_TRUST | Trust hit per incident (scaled by 8/N) | 4.0 |
| INC_REV_LOSS | Firm revenue loss in an incident quarter | 0.15 |
| M_PER_FIRM | Market size per firm at T = 100 | 100 |
| γ | Market sensitivity to trust | 1.4 |
| α | Contest exponent for share | 2.0 |
| CAP_MULT | Valuation multiple on capability | 3.0 |
| CASH0, C0 | Starting cash and capability | 100, 20 |
| COLLAPSE_CAP_WRITEDOWN | Capability assets retained on collapse | 0.15 |
| COLLAPSE_CASH_HAIRCUT | Cash retained on collapse | 0.60 |
| MORATORIUM_M | Market multiplier after collapse | 0.15 |
| MORATORIUM_R | Regeneration multiplier after collapse | 0.25 |
| BACKLASH | One-off trust drop at collapse | 10 |
| INSOLVENCY | Cash level that triggers insolvency | −100 |

### 6.3 Resolution order (one quarter)

Let σ_i = s_i / 30, which runs from 0 to 1. Let N be the number of firms, including bots.

1. **Defaults.** Fill missing decisions (§6.4). Insolvent firms are forced to pace 1 with no card.
2. **Validate cards.** If a card breaks a constraint (cooldown, missing target, insolvency), convert it to `NONE` and send a private notice.
3. **Capability.**
   C_i ← C_i + CAP_GAIN[p_i] × (1 − SAFETY_CAP_DRAG × σ_i)
   Then apply `POACH`: +3 to the player, −3 to the target, floored at 10.
4. **Trust draw.**
   d_i = DRAW[p_i] × (1 − SAFETY_DRAW_EFF × σ_i)
   Total draw D = (Σ d_i) × (8 / N)
   Note: the 8/N factor makes total pressure depend on average behaviour, not firm count, so one firm's impact is about 1/N.
   Add d_i × 8/N to cumulativeDraw_i.
5. **Incidents.**
   For each firm, draw u_{t,i} from the seeded RNG (common random numbers, §6.8).
   q_i = INC_BASE[p_i] × (1 − SAFETY_INC_EFF × σ_i), multiplied by 0.5 if the firm played `PUBLISH`.
   An incident occurs if u_{t,i} < q_i.
   Each incident adds INC_TRUST × 8/N to the incident trust loss I, and flags the firm for a revenue loss.
6. **Trust update.**
   T ← clamp(T + R_eff × T × (1 − T/100) − D − I + 1.0 × (#PUBLISH) − 0.5 × (#LOBBY), 0, 100)
   R_eff = R, or R × MORATORIUM_R if collapsed.
7. **Collapse check.** If not yet collapsed and T < τ:
   - set collapsed = true
   - T ← max(0, T − BACKLASH)
   - every firm: cash ×= COLLAPSE_CASH_HAIRCUT
   - record the collapse round.
8. **Market.**
   M = M_PER_FIRM × N × (T/100)^γ, multiplied by MORATORIUM_M if collapsed.
9. **Share.**
   Effective capability E_i = C_i, multiplied by 1.2 if the firm played `BLITZ`.
   share_i = E_i^α / Σ E_j^α
10. **P&L.**
    revenue_i = share_i × M, multiplied by (1 − INC_REV_LOSS) if the firm had an incident.
    cost_i = COMPUTE_COST[p_i] + s_i × BUDGET_REF + cardCost_i
    profit_i = revenue_i − cost_i
    cash_i += profit_i
11. **Pacts.** Evaluate compliance, run audits and apply fines (§9).
12. **Insolvency.** If cash_i < INSOLVENCY, set insolvent_i = true. This is sticky.
13. **Valuation.**
    V_i = cash_i + CAP_MULT × C_i × (T/100), with the capability term multiplied by COLLAPSE_CAP_WRITEDOWN if collapsed.
14. **Rank** by V_i, descending. Ties are broken by cash, then firm creation order.
15. **Headlines.** Generate 2–4 wire headlines from events (§15.4).
16. **Outputs.** Emit the per-round outputs and DATA lines (§8.4).

### 6.4 Defaults for missing decisions

A firm with no committed decision when resolution starts keeps its previous quarter's pace and safety, with card `NONE`. In round 1 the default is pace 2 and safety 10. The firm is flagged `auto: true` for that round.

### 6.5 Participant-visible information

Participants can see:
- T and its history
- market size
- every firm's share, quarterly profit and valuation
- pact memberships
- headlines
- their own cash, capability, costs and P&L

They see their own **public exposure** as a qualitative label derived from d_i: LOW < 1.5 ≤ MED < 3.5 ≤ HIGH < 6 ≤ SEVERE. They see an estimated cost for the quarter (deterministic: compute + safety + card).

They never see τ, endRound, other firms' cash, capability, pace or safety (unless disclosure is on, §9.3), or unaudited violations.

### 6.6 What the briefing tells participants (truthfully)

- Total market revenue tracks public trust.
- Trust recovers when pressure eases.
- Pace builds capability faster, and capability wins market share.
- Safety spend costs money and lowers your public exposure and incident risk.
- Valuation reflects cash plus capability, priced by the market.

The briefing does not mention any threshold.

### 6.7 Insolvency

An insolvent firm is forced to Cautious pace and cannot play cards. It stays on the board, marked `INSOLV`.

### 6.8 Randomness

- `rng = mulberry32(hash(gameSeed, round, stream))`
- Streams: `incident`, `headline`, `audit`, `bot`.
- Incident draws u_{t,i} are indexed by (round, firm creation order). This guarantees common random numbers between the actual run and the counterfactual (§10).
- τ and endRound are drawn once at game creation from stream `setup`.

---

## 7. Bots

Bot firms submit decisions computed inside the resolution step from their policy:

| Policy | Behaviour |
|---|---|
| `cautious` | Pace 1, safety 20 |
| `standard` | Pace 2, safety 10 |
| `greedy` | Pace 3 or 4 (50/50 via the `bot` stream), safety 5, `BLITZ` when allowed |
| `mimic-leader` | Copies the previous-round pace of the current valuation leader (needs disclosure); otherwise pace 3, safety 8 |

Bots are labelled `BOT` on every screen. They serve rehearsal, small classes and load testing.

---

## 8. Calibration **[governs all TUNABLE values]**

### 8.1 Validity conditions

All four must hold for N ∈ {4, 6, 8, 10, 12}, across at least 200 seeds per scenario, over 14 rounds. Thresholds are medians, with the stated percentile constraints.

| # | Scenario | Pass condition |
|---|---|---|
| C1 | All firms greedy (pace 3/4, safety 5, `BLITZ`) | Collapse occurs; median collapse round within 5–9; ≥ 90% of seeds collapse by round 12 |
| C2 | All firms sustainable (pace 2, safety 15, no card) | No collapse in ≥ 99% of seeds by round 30; mean final V per firm > mean final V per firm in C1 by ≥ 40% |
| C3 | One greedy firm, rest sustainable | The greedy firm's final V > the mean sustainable firm's V by ≥ 25% (temptation exists) |
| C4 | One greedy firm, rest sustainable | No collapse in ≥ 95% of seeds by round 14 (no single firm can collapse the market) |

### 8.2 Additional diagnostics (report; no hard pass)

- Half greedy, half sustainable: collapse round distribution.
- All Aggressive with safety 0, 15 and 30. This shows that safety substitutes for restraint.
- **Passive path**: every firm keeps defaults every round (pace 2, safety 10). Must be stable, and no collapse by round 30.
- Card dominance check: no single card is played in > 60% of best-response rounds in a greedy best-response search.
- Leaderboard volatility: mean rank changes per round in a mixed field.

### 8.3 Process

- `tools/calibrate.ts` runs all scenarios, writes `reports/calibration.md` (tables and pass/fail per condition and N) and DATA lines.
- If a condition fails, adjust parameters in this order: R, DRAW, INC_TRUST, COMPUTE_COST, CAP_GAIN, γ.
- Record every change, with before and after results, in `docs/CALIBRATION.md`.
- Never change engine structure to pass a condition without noting it as a spec deviation.

### 8.4 DATA lines

One per firm per round, emitted by the engine and stored in the export:

```
DATA|game=ABCD|round=3|T=64.21|M=512.4|collapsed=0|firm=HELIX|bot=0|pace=3|safety=5|card=BLITZ|share=0.241|rev=123.5|cost=52.0|profit=71.5|cash=233.1|cap=41.0|val=312.4|draw=0.84|incident=0|auto=0
```

---

## 9. Pacts, audits and disclosure

### 9.1 Pacts

`pact = {id, name (PACT-A, PACT-B…), proposerFirmId, terms: {maxPace|null, minSafety|null}, members: {firmId: joinedRound}, createdRound, status: active|dissolved}`.

- A pact with fewer than 2 members after 2 rounds dissolves.
- A firm may belong to several pacts.

### 9.2 Compliance, audits and sanctions

**Compliance.** At step 11 the engine checks each member against the terms of every pact it belongs to. A breach is recorded privately as `violations[pactId][round][firmId]`.

**Audits.**
- *Manual*: facilitator presses F6 on `control` and selects a pact.
- *Automatic*: each active pact is audited with probability `autoAuditP` per quarter, drawn from stream `audit`.

An audit examines all unaudited rounds for that pact, up to the last 3, and publishes the violations found.

**Graduated sanctions** count per firm, per pact:

| Detected violation | Fine (fraction of current cash, minimum 10) |
|---|---|
| 1st | 10% |
| 2nd | 25% |
| 3rd | 40%, and the firm is expelled from the pact |

Fines leave the economy. `LOBBY` in the quarter of detection waives the fine but not publication.

**Publication.** Detected violations become public wire headlines and a `BREACH` flag on the board for 2 rounds. Undetected violations are revealed only on the results screen.

### 9.3 Disclosure toggle

- The facilitator toggles it with F7 at any phase.
- While it is on, each resolution publishes `{pace, safety, d_i}` per firm for that round, and the board gains `PACE`, `SAFE` and `EXPO` columns.
- While it is off, those columns are absent and the data is written only to the facilitator-only path.
- Toggling produces a wire headline: "Assembly passes frontier disclosure rule" / "Disclosure rule suspended".
- The toggle state is always visible in the board status line.

---

## 10. Counterfactual and attribution (results)

**Counterfactual.**
- Replay from round 1 with the same N, seed, τ and number of rounds played.
- Every firm, including bots, plays the sustainable policy (pace 2, safety 15, no cards, no pacts).
- Use common random numbers.
- Outputs: the industry total final valuation and the per-firm final valuation, which is equal across firms.

**Headline figures.**
- `INDUSTRY VALUE` (actual total) and `ALTERNATIVE` (counterfactual total).
- `VALUE LOST` = counterfactual total − actual total (the definition is unchanged; this figure was labelled `VALUE DESTROYED` before 2026-10-03).
- `YOUR FIRM` actual vs counterfactual.

**Display rules for negative totals** (owner decision 5, 2026-10-03; display only, engine definitions unchanged):
- The value-lost percentage (of the alternative total) is shown only when the actual industry total is positive. Otherwise the sub-label reads "industry finished below zero".
- If the actual total exceeds the alternative, the figure is labelled `VALUE ADDED` with ▲.
- Value share keeps counting negative valuations as 0. When no firm finishes above zero, the value side of the attribution chart shows the single line "No firm finished with positive value" instead of 0.0% bars.

**Attribution.** For each firm: share of cumulative draw (Σ over rounds of d_i × 8/N, divided by the total) against share of final industry valuation. Plot as a ranked pair of bars per firm.

---

## 11. Resolution orchestration

The facilitator's client runs resolution. There are no Cloud Functions, so the project stays on the free Spark plan.

1. **Acquire lock.** Run an RTDB transaction on `games/{g}/public` that sets `phase: 'resolving'` and `resolvingBy: uid` only if `phase` is `open` and `round` matches. Abort otherwise.
2. **Read inputs.** Read `decisions/{round}`, `engine`, `firmsPrivate`, `pacts`, `pactsPrivate` and `firms` once.
3. **Run engine.** Call `resolveRound` (pure).
4. **Write.** Make a single multi-path `update()` writing `firmsPrivate/*`, `firmsPublic/*`, `rounds/{round}`, `engine`, `pactsPrivate`, `pacts` and `public` (phase `reveal`, T, M, collapsed, the disclosure snapshot). The multi-path update is atomic.
5. **Recover.** If step 4 fails, `phase` stays `resolving`. `control` shows "Resolution incomplete" with a *Retry* button that re-runs from step 2. This is safe because nothing was written.
6. **Timer.** The deadline is stored as a server timestamp in ms. Clients compute the countdown using `/.info/serverTimeOffset`. Never write per-second ticks.

---

## 12. Data model (Firebase Realtime Database)

```
/facilitators/{uid}: true                      (set manually in the console)
/codes/{CODE}: gameId                          (4-letter join code, A–Z without I/O)
/games/{gameId}/
  meta:         {code, title, createdAt, facilitatorUid, settings{...public subset}}
  public:       {phase, round, deadline, paused, disclosure, T, M, collapsed, collapseRound|null,
                 joinLocked, resolvingBy|null, endedAt|null, revealStep (results sequence index)}
  firms/{firmId}:        {name, ticker (4–6 chars), createdAt, order, isBot, botPolicy|null}
  firmSecrets/{firmId}:  {pin}                 (facilitator + members read; used by rules on join)
  firmsPublic/{firmId}:  {share, profit, valuation, rank, rankDelta, submittedRound, auto, insolvent, breachUntilRound}
  firmsPrivate/{firmId}: {cash, cap, lastCard, lastPoachTarget, cumulativeDraw, incidents, history{round:{...}}}
  members/{uid}:         {firmId, label, joinedAt}
  presence/{uid}:        {online, lastSeen}
  decisions/{round}/{firmId}: {pace, safety, card, target|null, by: uid, at: serverTs}
  rounds/{round}:        {T, dT, M, incidents, headlines[], audits[], disclosure{firmId:{pace,safety,expo}}|null,
                          results{firmId:{share, profit, valuation, rank}}}
  pacts/{pactId}:        {name, proposer, terms{maxPace, minSafety}, members{firmId: joinedRound}, createdRound, status}
  pactsPrivate/{pactId}: {violations{round:{firmId:true}}, sanctions{firmId:count}, lastAuditRound}
  engine:                {seed, params, tau, endMode, endRound|null, rngNotes, cfCache|null}
  results:               {final{...}, counterfactual{...}, attribution{...}, dataLines[]}
```

## 13. Security rules (requirements — implement in `database.rules.json`, test in the emulator)

**Facilitator access**
- `isFac` = `root.child('facilitators').child(auth.uid).val() === true`.
- A facilitator can read and write everything under games they created (`meta/facilitatorUid === auth.uid`).

**Read access**
- Any authenticated user can read `public`, `firms`, `firmsPublic`, `rounds`, `pacts`, `presence` (online flags only) and `meta` (excluding settings beyond the public subset).
- `engine` and `pactsPrivate`: facilitator only.
- `firmsPrivate/{f}` and `firmSecrets/{f}`: facilitator, or a member of firm f.
- `decisions/{r}/{f}`: facilitator, or a member of f.
- `results`: anyone authenticated, but only when `public.phase === 'ended'`.

**Write access**
- Facilitator only: `public`, `firmsPublic`, `firmsPrivate`, `rounds`, `engine`, `results`, `pactsPrivate`.
- `decisions/{r}/{f}`:
  - author is a member of f
  - `r` equals `public.round`
  - `public.phase === 'open'`
  - `now <= public.deadline + 3000`
  - validate: pace ∈ {1,2,3,4}; safety is an integer 0–30; card ∈ the enum; target is a valid other firmId or null; `by === auth.uid`.
- `firms/{f}` creation:
  - authenticated
  - `public.joinLocked !== true`
  - name length 2–20 and ticker matches `^[A-Z]{3,6}$`
  - created together with `firmSecrets/{f}/pin` (4 digits) and the creator's `members/{uid}`.
- `members/{uid}`:
  - only `auth.uid === uid`
  - firm exists
  - the pin supplied in `members/{uid}/pin` equals `firmSecrets/{firmId}/pin`
  - not join-locked, except that rejoining an existing membership is always allowed.
- `presence/{uid}`: own uid only.
- `pacts/{p}`:
  - create: a member of the proposer firm
  - `members/{f}`: a member of firm f may add or remove only f.
- Deny everything else by default.

---

## 14. Screens

### 14.1 Projector board (`#/screen`) — 16:9, target 1920×1080, must also work at 1280×720

The layout is built on a monospace character grid (§16.2). Regions:

```
┌ TOP BAR (signal amber, black text): FRNT <GO> │ Q3 Y2 │ PHASE │ T-01:47 │ 6/8 COMMITTED ┐
├ BOARD (left ~62%) ─────────────────────────┬ TRUST (right ~38%) ───────────────────┤
│ #  FIRM      SHARE   PROFIT   VALUE   Δ  ✓ │ PUBLIC TRUST                          │
│ rows… (BREACH / AUTO / INSOLV / BOT tags)  │ 61.8  ▼6.3 QoQ   (large numerals)      │
│ [PACE SAFE EXPO columns if disclosure on]  │ line chart + change strip, all quarters│
│                                            │ MKT SIZE bar  │ INCIDENTS │ PACTS │ DISCL│
├ WIRE (scrolling ticker; static list if reduced motion) ─────────────────────────────┤
└ F-KEY BAR: F2 BOARD  F3 TRUST  F4 PACTS  F6 AUDIT  F7 DISCL  F8 SUMMIT  F9 ADVANCE  F10 END ┘
```

**Command line.** This is the signature feature. Typing on the projector focuses a command line in the top bar.

- Mnemonics followed by Enter, shown as `<GO>`:
  - `BOARD`
  - `TRST`: full-screen trust history
  - `PACT`: pact table with members and terms
  - `WIRE`: full headline log
  - `FIRM <TICKER>`: a public firm profile with share and valuation history
  - `HELP`
- Esc returns to the board.
- F-keys mirror these.
- Every F-key action also has a letter alternative, because laptops often need Fn: Shift+A advance, Shift+S summit, Shift+D disclosure, Shift+E end.
- Never bind F5, F11 or F12.

**Lobby state.**
- A large join code.
- A QR code, generated client-side.
- The URL.
- Firms appearing live with member counts.

**Reveal state.** One orchestrated motion moment, described in §16.5.

### 14.2 Facilitator console (`#/control`)

Panels:
- **Game**: phase, round, timer controls (+30 s, −30 s, pause), endRound and τ shown masked until held.
- **Firms**: presence dots per member, committed ✓, decision received time, AUTO forecast, bot policy.
- **Pacts**: terms, members, unaudited violation counts (private), Audit button.
- **Controls**: Disclosure, Summit, Advance, End.
- **Export**: JSON and DATA lines.
- **Danger**: remove a firm, lock joins, delete the game.

### 14.3 Participant control centre (`#/play`) — mobile-first

- Header: firm ticker, quarter, countdown, cash, last-quarter profit.
- Bottom tab bar on mobile, left rail on desktop. Tabs:
  - **DESK**: the decisions
  - **BOOK**: own P&L history and own valuation line chart (zero-based)
  - **PACTS**: propose, join, leave, terms, members
  - **WIRE**: the feed
- DESK contents: pace selector (4 segments, ≥ 44 px targets); safety slider plus numeric stepper; card picker sheet, with a target list for POACH; an *Estimated cost this quarter* line; a *Public exposure* label; the commit button (signal amber, full width).
- After commit: "Committed 14:02:11 · edit until close". The committing device's label is shown to teammates.
- Reveal state: a quarter result card with revenue, costs, profit, Δshare, valuation, rank, incident or audit notices and the headlines.
- Summit state: a banner, with the PACTS tab auto-selected.
- `ended`: the own-firm results card (§14.4) and a "Watch the board" note.

### 14.4 Results (`#/results`)

On the projector the facilitator steps through panels with F9:

1. **FINAL BOARD**: ranked by final valuation. A dumbbell per firm from peak (hollow square) to final (solid square) on one axis that includes zero; final value and drop from peak on the right; final values below zero in `--down` with a − sign.
2. **TRUST TRACE**: full history as a `LineChart`. The collapse quarter is a labelled vertical marker. The τ line, with a hatched band below it, appears only if the "Reveal threshold" setting is on.
3. **COUNTERFACTUAL**: three headline figures (INDUSTRY VALUE, ALTERNATIVE, VALUE LOST or VALUE ADDED, §10); actual and alternative trust paths, each labelled at its end, with the gap hatched; per-firm comparison on a zero-based axis (actual bar from zero, alternative as a marker).
4. **ATTRIBUTION**: a butterfly chart per firm: share of damage extending left in `--down`, share of value extending right in `--signal`, ticker in the middle, values at the bar ends. Negative-total rule in §10.

Series are labelled on the chart; no abbreviations (SUST, ACT, DEPL) or prose legends.
5. **PACT RECORD**: terms, members, detected vs undetected violations (now revealed).
6. **DEBRIEF**: the five prompts in §15.5.

Participants see their own firm's card: final rank, valuation actual vs counterfactual, cumulative exposure share, and undetected violations of their own.

### 14.5 Briefing (projector, one screen)

A terse market primer covering §6.6, the three controls, cards (one line each), how commits work, and that the timer is shown. It contains no numbers that reveal parameters.

---

## 15. Language and copy

### 15.1 Voice

The voice is that of a financial terminal and a wire service:
- Terse, declarative, present tense.
- Labels are short uppercase mnemonics that work as genuine terminal codes: `VAL`, `MKT`, `EXPO`, `TRST`. They are not tracked-out eyebrows.
- Headlines and body copy are in sentence case.
- Numbers carry the message.
- No exclamation marks. No second-person cheerleading. No emoji.

### 15.2 Banned everywhere

"unlock", "empower", "seamless", "revolutionary", "harness", "elevate", "supercharge", "game-changer", "dive in", "journey", "welcome to the future", "in today's fast-paced", "let's", "awesome", "great job", "oops", "not just X but Y". Also: sparkles or brain imagery, and gradient text.

### 15.3 Banned before the results screen (non-telegraphing)

"commons", "tragedy", "sustainable", "sustainability", "cooperate", "cooperation", "collective", "shared resource", "tipping point", "threshold", "collapse" (the word may appear only in the moratorium event headline), "game", "player", "score", "win", "level". Use "firm", "board", "valuation", "quarter" and "market" instead.

### 15.4 Wire headline bank (template engine; seeded choice via the `headline` stream)

**Fictional entities**
- Regulator: *Office of Frontier Systems (OFS)*
- Legislature: *the Assembly*
- Pollster: *Halden Research*
- Never use real companies or people.

**Trust bands** (one when the band changes, otherwise 30% chance per round):
- ≥ 80: "Halden poll: public broadly optimistic on AI products"
- 70–80: "Consumer groups question pace of model releases"
- 60–70: "Halden poll: majority now uneasy about frontier AI"
- 50–60: "Assembly members table AI licensing bill"
- 40–50: "OFS signals review of emergency powers"
- < 40: "OFS chair: 'all options on the table'"

**Events** (`{FIRM}` is the ticker):
- Rank change: "{FIRM} overtakes {FIRM2} on valuation"
- Pace 4: "{FIRM} accelerates release schedule" (only when disclosure is on; otherwise "Unnamed lab accelerates release schedule, sources say")
- Incident: "Service outage traced to {FIRM} model", "{FIRM} model linked to fraud wave", "Data leak hits {FIRM} enterprise clients"
- PUBLISH: "{FIRM} publishes evaluation results"
- LOBBY: "{FIRM} expands policy team in capital"
- POACH: "{FIRM} hires senior researchers from {TARGET}"
- BLITZ: "{FIRM} launches global ad campaign"
- Pact formed / joined / left: "{FIRMS} sign voluntary release accord {PACT}", "{FIRM} joins {PACT}", "{FIRM} withdraws from {PACT}"
- Audit clean: "Audit of {PACT} finds full compliance"
- Breach: "Audit finds {FIRM} breached {PACT} terms; fine levied"
- Disclosure on / off: "Assembly passes frontier disclosure rule" / "Disclosure rule suspended"
- Insolvency: "{FIRM} enters administration talks"
- Collapse (only here): "OFS imposes moratorium on frontier deployments; markets collapse"
- Moratorium rounds: "Moratorium extended; sector valuations slide"
- Final round reveal: "Markets close for the period"

Calibration builds will extend the bank to at least 40 templates in the same register.

### 15.5 Debrief prompts (results panel 6)

1. When did your firm first notice trust falling, and what did you change?
2. Which pacts held and which broke? Was the difference monitoring, sanctions or trust?
3. Compare your share of the damage with your share of the value. Is that outcome fair, and who should pay?
4. Would disclosure from quarter 1 have changed your decisions? Why?
5. Where does this pattern appear in the real AI industry, and which of Ostrom's design principles would you add to the market?

---

## 16. Design system — Option A "Amber terminal", refined

### 16.1 Tokens

| Token | Hex | Use |
|---|---|---|
| `--base` | `#000000` | Page. True black, deliberately not a tinted near-black |
| `--panel` | `#15140F` | Panel fills, ticker strip |
| `--rule` | `#2E2C22` | 1 px grid rules |
| `--text` | `#E8E2C8` | Primary text |
| `--dim` | `#8A8570` | Secondary text and labels |
| `--signal` | `#FFB000` | Top bar, focus, own firm, primary action, trust value |
| `--signal-ink` | `#000000` | Text on signal |
| `--wire` | `#5EC8D8` | Headlines, market size, informational data |
| `--up` | `#7FD15B` | Positive deltas (always with + or ▲) |
| `--down` | `#FF4D3D` | Negative deltas, breaches, alarms (always with − or ▼) |

**Lit-room mode** (a facilitator toggle):
- `--dim` → `#B9B39A`
- `--rule` → `#4A4736`
- base font scale × 1.15
- rules become 2 px.

Colours do not invert.

### 16.2 Type and grid

- One family: **IBM Plex Mono** (400, 500, 600), self-hosted via `@fontsource/ibm-plex-mono`, with tabular figures throughout. No second face.
- Layout is in `ch` units on a character grid. Panel widths, column positions and gutters are integers of `1ch`. Line height is fixed at 1.35, so every row aligns across panels. This grid is the design's single bold idea; keep everything else quiet.
- Projector base size: `clamp(14px, 1.05vw, 22px)`. Large numerals are 4× base, weight 500.
- Participant base size: 16 px, with a minimum of 14 px anywhere.
- Uppercase only for mnemonic labels of ≤ 6 characters. No letter-spacing.

### 16.3 Components

`TopBar`, `FKeyBar`, `CommandLine`, `Panel` (title row and 1 px rule border, no radius), `DataTable` (fixed ch columns, right-aligned numerics), `Delta` (sign, glyph and colour), `LineChart` (below), `HBar` (drawn from a visible zero line; negative values extend left in `--down` with a − sign), `Ticker`, `Segmented4`, `SafetySlider` (track and block thumb), `CardPicker` (sheet), `CommitButton`, `Tag` (`BOT`, `AUTO`, `BREACH`, `INSOLV`, `PACT-A`), `PresenceDot`, `QR`, `Countdown`.

All corners are square, except the device-like participant sheet edges, which are max 2 px.

**`LineChart`** (replaces `StepSparkline`; owner approval 2026-10-03, UI audit):
- One SVG, sized from its container. Axes, ticks and labels are drawn inside it on the same scale as the data.
- Horizontal gridlines only. The value axis is on the right. One tick per quarter, with longer ticks and `Y1`, `Y2`… labels at year boundaries (`START` at the opening value).
- Straight segments between quarter points (no steps, no smoothing, no area fill), with a square marker at each quarter. On trust charts, quarters that lost 5 or more are drawn as `--down` markers and the largest drop is labelled.
- A solid tag at the end of the line carries the latest value.
- Optional: a change strip under the plot (one bar per quarter from a zero line, `--up` with ▲ for a rise, `--down` with ▼ for a fall); a labelled horizontal reference line; a labelled vertical marker; a flat 45° hatch between two series.
- The y domain is either trust (always 0–100) or zero-based (always includes 0); never the min-to-max of the data.
- A series with a single point shows the text "1 quarter resolved" instead of a line.
- τ is never passed to a chart on `#/screen` or `#/play`. It is drawn only on the results trust trace when the "Reveal threshold" setting is on.

### 16.4 Forbidden

Gradients, glows, blur, glassmorphism, drop shadows, rounded cards, donut or pie charts, smoothed area charts, emoji, icon fonts used as decoration, sparkle or AI iconography, skeleton shimmer, fade-and-slide-up entrances, hover lift effects.

Allowed exception: a flat 45° hatch (1 px lines in a token colour, no gradient or opacity ramp) filling the gap between two compared series or the band below a revealed τ line.

### 16.5 Motion (one orchestrated moment)

**On reveal**, over at most 1200 ms in total:
1. numbers roll digit-by-digit as a character flip, top to bottom, staggered 40 ms per row
2. leaderboard rows then swap positions in one 300 ms move
3. if ΔT ≤ −5, the trust numerals invert once (signal background, black text) for 400 ms.

**Ticker:** constant slow scroll.

**Reduced motion:** all of the above becomes instant, and the ticker becomes a static list of the latest 3 headlines.

**Elsewhere:** motion only in direct response to input.

### 16.6 Accessibility

- WCAG AA contrast for all text. Verify `--dim` on `--panel`.
- Never use colour alone; use signs and glyphs as well.
- Focus is visible as a signal-coloured block outline.
- Touch targets are at least 44 px.
- Full keyboard operation on `play`.
- `aria-live="polite"` for the countdown at 30 s and 10 s, and for reveal results.

---

## 17. Technology and repository

| Item | Choice |
|---|---|
| Build | Vite + TypeScript (strict) + React 18 or later, hash router |
| Output | Single `dist/index.html` via `vite-plugin-singlefile`; fonts inlined |
| Backend | Firebase Realtime Database + Firebase Auth (Anonymous; Email/Password for facilitators) on the Spark plan |
| Hosting | GitHub Pages via GitHub Actions |
| Tests | Vitest (engine and UI logic); `@firebase/rules-unit-testing` against the RTDB emulator; Playwright smoke tests |
| QR | `qrcode-generator` (client-side, no network) |

```
/CLAUDE.md
/docs/spec.md  /docs/PROGRESS.md  /docs/CALIBRATION.md
/src/engine/{types,params,rng,resolve,cards,pacts,headlines,counterfactual,policies,data}.ts
/src/firebase/{config,init,paths,api,presence,orchestrator}.ts
/src/state/ (subscription hooks)
/src/ui/{tokens.css, grid.css, components/*}
/src/screens/{Landing,Join,Play,Screen,Control,NewGame,Results}/*
/tools/{calibrate.ts, bots.ts}
/tests/{engine,rules,e2e}/*
/database.rules.json  /firebase.json  /.firebaserc
/.github/workflows/pages.yml
```

---

## 18. Acceptance criteria (v1)

1. Calibration conditions C1–C4 pass. `reports/calibration.md` is committed.
2. Rules tests prove the following:
   - Participants cannot read `engine`, `pactsPrivate`, other firms' `firmsPrivate` or decisions, or `results` before the end.
   - Participants cannot write outside their own decision, membership, presence and pact membership.
   - Late decisions are rejected.
3. A full rehearsal with 8 bot firms plus 2 human test devices runs 14 quarters without errors, including summit, two audits, a disclosure toggle, a collapse and a counterfactual.
4. A 30-quarter manual-mode run reaches round 30 and ends automatically.
5. The participant UI is usable at 360×640, 390×844 and 1440×900. The projector is legible at 1280×720 from the back of a 60-seat room (verified at 14 px minimum effective size).
6. Grep of participant-facing strings finds none of the §15.2 or §15.3 terms (excluding the results screen and the collapse headline).
7. Lighthouse accessibility score ≥ 95 on `play`.
8. The built `dist/index.html` runs from GitHub Pages with Firebase reachable; no other network requests.

## 19. Out of scope for v1

Bilateral trading; in-app chat; LLM-generated headlines; multiple concurrent facilitators per game; persistence beyond 30 days (provide a "Delete game" control instead).
