# Live sessions without bots — parameter analysis (2026-10-08)

Source: the Realtime Database export of 2026-10-08. No parameter was changed. Every recommendation below needs an owner decision and a calibration session (spec §8.3) before it reaches `src/engine/params.ts`.

## 1. Scope and method

**Sessions analysed.** The export holds 17 games. Four had no bot firms and ran to the end:

| Game | Firms | Devices | Quarters | End mode | Disclosure at end | τ |
|---|---|---|---|---|---|---|
| ZWYF | 10 | 25 | 10 | random | off | 35.8 |
| RBZE | 10 | 21 | 24 | manual | on | 30.3 |
| XLWZ | 7 | 13 | 20 | manual | on | 35.2 |
| PLEA | 10 | 32 | 17 | manual | on | 33.0 |

Excluded: 11 games with bot firms (GZVZ had 4 bot firms among 16) and 2 games that never left the lobby.

**Parameters.** All four games stored identical parameters, equal to the current `params.ts` (Session 16: R 0.13, DRAW [0.125, 0.25, 1.2, 1.4], INC_TRUST 1.5).

**Methods.**
- **Exact replay.** Each game was replayed through the engine from its seed and the stored decisions. The trust path matches the stored path exactly in all four games; the difference is 0 at every quarter. Pact fines were not replayed. They change some firms' cash slightly but never trust.
- **Observed-human scenario.** The 37 human firm trajectories (pace, safety and card for each quarter) were pooled. For each seed, N trajectories were drawn with replacement and played against the engine for up to 30 quarters. A trajectory shorter than 30 quarters repeats its last 5 quarters. This "observed-human" room was then run under candidate parameter sets, alongside the calibration conditions C1–C5 (`tools/calibration/scenarios.ts`, unchanged).
- **Seeds.** 200 seeds per scenario. The single-reckless-firm check (REVIEW M1) used 500 seeds. The harness reproduces the logged Session 16 figures: C1–C5 pass, and M1 at N = 4 is 22–31% by quarter 14.

## 2. Findings

### F1. No room reached the moratorium

| Game | Lowest trust (quarter) | Trust at end | Gap above τ at the lowest point |
|---|---|---|---|
| ZWYF | 67.7 (Q9) | 71.0 | 32.0 |
| RBZE | 46.5 (Q24) | 46.5 | 16.2 |
| XLWZ | 49.5 (Q18) | 51.7 | 14.3 |
| PLEA | 60.7 (Q17) | 60.7 | 27.7 |

Three of the four rooms ran past quarter 14, to quarters 17–24 under manual end. Even then, no room came within 14 points of τ. The design goal in spec §1 (a moratorium students cause themselves) was not met in any session.

### F2. Trust pressure sat just above what regeneration repairs

Average trust change per quarter, from the exact replay:

| Game | Regeneration | Draw D | Incidents I | PUBLISH | LOBBY | Net |
|---|---|---|---|---|---|---|
| ZWYF | +2.60 | −4.53 | −0.72 | +2.80 | −0.25 | −0.10 |
| RBZE | +3.07 | −4.80 | −0.85 | +1.67 | −0.15 | −1.07 |
| XLWZ | +3.09 | −4.10 | −1.20 | +1.30 | −0.10 | −1.01 |
| PLEA | +2.71 | −4.24 | −0.85 | +2.00 | −0.29 | −0.66 |

At R = 0.13, regeneration peaks at 3.25 points per quarter, at trust 50. Rooms lost about 0.1–1.1 points a quarter. The 37–42 points between T0 = 72 and τ would take roughly 35 or more quarters at that rate.

### F3. PUBLISH cancels much of the draw, and calibration never sees it

- **What the card did.** Across the four games, PUBLISH added 128 trust points against 315 points of draw. That is 62% of draw in ZWYF, 47% in PLEA, 35% in RBZE and 32% in XLWZ.
- **Why it is so strong:**
  - PUBLISH adds a flat +1.0 per card (spec §6.3 step 6). Unlike draw and incidents, this is **not scaled by 8/N**.
  - Session 2 cut DRAW to 1/8 of its starting values, and PUBLISH_TRUST was never rescaled. One PUBLISH (cost 10) now cancels more than the whole draw of a pace 4 firm at safety 0 in a 10-firm room (1.4 × 0.8 = 1.12).
  - The 8/N gap grows with room size. At N = 50, one card's trust gain is 6.25 times its value at the reference N of 8, relative to draw.
- **Why calibration missed it.** No calibration policy plays PUBLISH: the greedy bot plays BLITZ and the sustainable bot plays no card. C1–C5 therefore cannot detect this effect.
- **Effect of removing it.** Replaying the actual decisions with PUBLISH_TRUST = 0 (nothing else changed):
  - the lowest trust falls by 11–27 points
  - XLWZ reaches the moratorium in quarter 13.

### F4. Human rooms do not play like the calibration's greedy bot

- **Pace mix** (firm-quarters not on AUTO):
  - pace 1: 15%
  - pace 2: 28%
  - pace 3: 36%
  - pace 4: 21%
- **Safety.** Median safety at pace 3–4 is 12.5–15. The greedy bot uses 5.
- **Mean draw per firm (d_i):** 0.56. The greedy bot's is 1.17 and the sustainable bot's 0.175. By draw, the human rooms behaved like a room about **38% greedy**.
- **Calibration context.** Calibration already shows that a room one third greedy rarely reaches the moratorium within 14 quarters (0–25%, Session 16).
- **Safety's share.** SAFETY_DRAW_EFF = 0.6 means safety 15 removes 30% of a firm's draw. Humans' habit of pairing high pace with moderate safety accounts for much of the gap between them and the greedy bot.

### F5. The observed-human room almost never collapses under current parameters

Moratorium by quarter 14 in the observed-human scenario (current parameters):

| N | 4 | 6 | 10 | 20 | 50 |
|---|---|---|---|---|---|
| by Q14 | 13% | 7% | 1% | 0% | 0% |

This confirms F1 beyond the four rooms played.

### F6. The temptation works as designed

- **Rank correlation (Spearman) with final valuation, per game:**
  - mean pace: +0.27 to +0.77 (positive in all four)
  - mean safety: −0.05 to −0.64 (negative in all four).
- **Mean quarterly profit by pace:** +4.9, +5.3, −0.2 and −10.5 for paces 1–4. Racing pays through the capability term of valuation, not through cash.
- **Insolvency.** 5 of 37 firms became insolvent. They include two of the three lowest-pace firms in RBZE and the lowest-pace firm in XLWZ. Under α = 2, a restrained firm's share shrinks until revenue no longer covers compute and safety.

### F7. Most "value lost" in shorter sessions came from racing spend, not trust

Final industry valuation against the counterfactual (spec §10), decomposed:

| Game | ALTERNATIVE | Actual | Revenue (lower trust, incidents) | Extra compute | Safety spend | Card spend | Capability term |
|---|---|---|---|---|---|---|---|
| ZWYF | 5,615 | 3,295 | −543 | −960 | −17 | −1,095 | +295 |
| RBZE | 12,093 | 2,437 | −5,866 | −2,140 | +811 | −2,090 | −372 |
| XLWZ | 7,153 | 1,348 | −3,500 | −1,028 | +100 | −1,185 | −192 |
| PLEA | 8,615 | 3,770 | −1,581 | −1,592 | −248 | −1,565 | +141 |

- **Card play.** A card was played in 74% of firm-quarters:
  - BLITZ 26%
  - POACH 22%
  - PUBLISH 21%
  - LOBBY 4%.
- **Shorter sessions.** In ZWYF, card and compute spending equal 89% of the value lost, and lower revenue 23% (a higher capability term offsets part). In PLEA the figures are 65% and 33%.
- **Debrief implication.** The VALUE LOST figure is truthful. In a short session, however, it mostly measures an arms race (BLITZ and POACH are zero-sum transfers of share), not damage to trust.

### F8. Pacts never formed

- **Proposals.** Nine pacts were proposed. No pact had two members in any resolved quarter. In one pact a second firm joined and withdrew before the quarter resolved.
- **Breaches.** In six of the nine pacts the proposer, as the only member, breached its own terms, mostly in the first quarters after proposing. Audits detected the breaches in two of these pacts.
- **Consequence.** No room tested audits or graduated sanctions (REVIEW M3). LOBBY, whose main use is to waive a pact fine, was played in 4% of firm-quarters.
- **Unconfirmed explanation.** The data cannot show why. It is consistent with participants never perceiving a threat to trust worth coordinating against.

### F9. Safety erodes in long sessions

- **RBZE.** Mean safety fell from 12–16 in quarters 1–5 to 7–12 in quarters 13–24.
- **XLWZ.** Mean safety fell from 17–19 in quarters 1–5 to 9–13 in quarters 17–20.
- **Cause (inference).** As firms' cash fell, safety was cut first. This is not confirmed by the data alone.

## 3. Why the §8.3 levers cannot fix this alone

§8.3 orders the levers R, DRAW, INC_TRUST, COMPUTE_COST, CAP_GAIN, γ. All of them move the greedy bot and human rooms together. C1 binds:
- the all-greedy median moratorium is already quarter 5, the lower bound
- 26–36% of all-greedy seeds reach it by quarter 4, against the limit of 50%.

Raising pressure enough for a 38%-greedy room to collapse by quarter 14 pushes the all-greedy median below quarter 5.

Tested examples (200 seeds):
- S2 (section 4) with τ raised to [35, 45]: fails C1 at every N tested, and C4 at N = 4.
- S2 with R lowered to 0.12: passes, but C1 by quarter 4 reaches 44–48% of seeds, and M1 at N = 4 rises to 45–57%.

Session 16 reached the same conclusion: pressure rises linearly with the share of greedy firms.

The two levers that separate human rooms from the greedy bot are:
- **PUBLISH_TRUST**, which bots never use
- **SAFETY_DRAW_EFF**, which barely affects the greedy bot (safety 5) but matters at the safety humans choose.

Neither is in the §8.3 list, so using them needs an owner decision.

## 4. Candidate parameter sets

All sets keep every other parameter at its current value. LOBBY_TRUST stays at 0.5 per card, unscaled; scaling it by 8/N doubles it at N = 4 and made M1 worse (tested).

| Set | PUBLISH_TRUST | SAFETY_DRAW_EFF | Engine change |
|---|---|---|---|
| S0 current | 1.0 | 0.6 | — |
| S1 | 0.25 × 8/N | 0.4 | §6.3 step 6: PUBLISH term scaled by 8/N |
| **S2 (recommended)** | **0.1 × 8/N** | **0.4** | §6.3 step 6: PUBLISH term scaled by 8/N |
| S3 (parameter only) | 0 | 0.4 | none |
| S4 | 0.1 × 8/N | 0.3 | §6.3 step 6: PUBLISH term scaled by 8/N |

Results (200 seeds; M1 500 seeds):

| Set | N | Observed-human moratorium by Q12 / Q14 (median quarter) | C1–C5 | C1 by Q4 (limit 50%) | C5 by Q14 / median | Passive path, lowest p10 trust | M1 by Q14 |
|---|---|---|---|---|---|---|---|
| S0 | 4 | 9% / 13% (none) | PPPPP | 36% | 98% / 11 | 70.0 | 22–31% |
| S0 | 10 | 0% / 1% (none) | PPPPP | 27% | 100% / 11 | 71.6 | — |
| S0 | 50 | 0% / 0% (none) | PPPPP | 27% | 100% / 11 | 72.3 | — |
| S1 | 4 | 35% / 45% (17) | PPPPP | 42% | 100% / 10 | 69.9 | 27–40% |
| S1 | 10 | 32% / 46% (16) | PPPPP | 37% | 100% / 10 | 71.2 | — |
| S1 | 50 | 77% / 85% (11) | PPPPP | 41% | 100% / 10 | 72.2 | — |
| **S2** | 4 | 45% / 55% (14) | PPPPP | 42% | 100% / 10 | 69.9 | 27–40% |
| **S2** | 6 | 45% / 55% (13) | PPPPP | 40% | 100% / 10 | 70.6 | 0% |
| **S2** | 10 | 42% / 57% (13) | PPPPP | 37% | 100% / 10 | 71.2 | — |
| **S2** | 20 | 49% / 69% (13) | PPPPP | 38% | 100% / 10 | 71.7 | — |
| **S2** | 50 | 90% / 94% (10) | PPPPP | 41% | 100% / 10 | 72.2 | — |
| S3 | 4 | 51% / 60% (12) | PPPPP | 42% | 100% / 10 | 69.9 | 27–40% |
| S3 | 10 | 51% / 64% (12) | PPPPP | 37% | 100% / 10 | 71.2 | — |
| S3 | 50 | 97% / 98% (9) | PPPPP | 41% | 100% / 10 | 72.2 | — |
| S4 | 4 | 54% / 64% (12) | PPPPP | 46% | 100% / 10 | 69.8 | 33–43% |
| S4 | 10 | 59% / 71% (12) | PPPPP | 42% | 100% / 10 | 71.1 | — |
| S4 | 50 | 99% / 99% (9) | PPPPP | 47% | 100% / 10 | 72.1 | — |

Results at N = 6 and N = 20 for S0, S1, S3 and S4 sit between their neighbours and are omitted. C2's value gain over C1 falls from about 391% to about 379% under S2 and S3.

## 5. Recommendations

1. **Adopt S2: PUBLISH_TRUST 0.1 scaled by 8/N, and SAFETY_DRAW_EFF 0.6 → 0.4.**
   - **Effect.** The observed-human room reaches the moratorium by quarter 14 in 55–69% of seeds at N = 4–20, up from 0–13%. C1–C5 still pass at every N tested.
   - **What PUBLISH keeps.** It stays a small private cost for a public benefit, which is useful in the debrief.
   - **Spec changes.** Scaling by 8/N changes the formula in spec §6.3 step 6 and the card table in §5.2, so it is a spec deviation that needs your approval.
   - **Without an engine change.** S3 gives a slightly stronger result (60–78% at N = 4–20), but PUBLISH then has no trust effect at all, only the incident halving.
2. **Accept or reject these trade-offs explicitly.** They come with S1–S4:
   - **M1 at N = 4** (one reckless firm) rises from 22–31% to 27–40% by quarter 14. The runbook's at-least-6-firms advice stays valid: M1 is 0% at N = 6.
   - **Safety no longer fully offsets pace.** A room all at pace 3 with safety 30 reaches the moratorium in 16–21% of seeds with SAFETY_DRAW_EFF 0.4 (S1–S3), and in 60–69% with 0.3 (S4). Today it is 0%. The §8.2 diagnostic "safety substitutes for restraint" becomes partial.
   - **Exposure labels move.** EXPO_CUTS must be re-derived, because d_i changes at every safety level above 0 (as in Sessions 2 and 16).
   - **C1 margin narrows.** C1 by quarter 4 moves from 26–36% to 37–42%. A 500-seed confirmation is needed.
3. **Add the observed-human room to calibration.**
   - Add it as a §8.2 diagnostic, or as a new condition C6 if you set a target for it.
   - Build it from the DATA lines of real sessions, so future calibration measures how classes actually play rather than only bots.
   - The target is yours to set, for example "moratorium by quarter 14 in at least 60% of seeds at N = 6–16".
4. **No tested set reaches 80% by quarter 14 at N ≤ 10 while C1 holds.**
   - The best is S4: 64–86% at N = 4–20 (64–71% at N ≤ 10), with C1 by quarter 4 at 42–47% of seeds.
   - Reaching 80% would need either a relaxed C1 (all-greedy median quarter 4 allowed) or an engine-structure change. Neither was tested here.
5. **Run sessions with a fixed 14-quarter end.** Calibration measures 14 quarters. Three of the four rooms ran 17–24 quarters, where safety erosion (F9) and insolvency (F6) dominate.
6. **Leave the pact parameters (M3) alone until a room has actually formed a pact.** The current data cannot inform them (F8).
7. **For the debrief:** in a session with no moratorium, VALUE LOST mostly reflects card and compute spending (F7). The facilitator may want to say so when presenting the figure. A display change would be a spec change.

## 6. Limits of this analysis

- **Small sample.** Four sessions and 37 firms, all with 7–10 firms. Results at N = 4 and at N ≥ 20 are extrapolations from resampled 7–10-firm behaviour.
- **Fixed behaviour.** The observed-human scenario does not react to parameters or to trust. If PUBLISH loses most of its trust effect, classes may play it less, which would raise pressure further. If trust falls visibly faster, classes may slow down. Neither effect can be estimated from this data.
- **Pact fines** were not replayed. They do not affect trust.
- **Seeds.** Candidate sets ran at 200 seeds (M1 at 500). The calibration session that applies a set must run the full `npm run calibrate` at 200 and 500 seeds and log the change in `docs/CALIBRATION.md`.
