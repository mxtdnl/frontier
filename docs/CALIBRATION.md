# Calibration log

Every change to a value in `src/engine/params.ts` is recorded here with before and after results (spec §8.3). Full results for the current values are in `reports/calibration.md` (`npm run calibrate -- --seeds 200`).

How to read the result tables:
- C1: the median quarter of the moratorium, then the % of seeds with a moratorium by quarter 12. Pass requires a median of 5–9 and at least 90%.
- C2: the % of seeds with a moratorium by quarter 30, then the median gain in valuation over C1. Pass requires at most 1% and a gain of at least 40%.
- C3: the median gain of the greedy firm over the rest. Pass requires at least 25%.
- C4: the % of seeds with a moratorium by quarter 14. Pass requires at most 5%.
- C5 (from Session 16): with half the firms greedy, the % of seeds with a moratorium by quarter 14, then the median moratorium quarter. Pass requires at least 80% and a median of 11 or earlier.

---

## 2026-10-01 — Session 2

All runs use seeds 1–200 per scenario and N, unless stated otherwise.

### Step 0: spec starting values (before any change)

Every condition fails at every N. Trust falls below τ in quarter 1 even when every firm plays restrained (pace 2, safety 15).

The cause is scale. Total draw per quarter is 8 × the average firm's d_i:
- restrained play: about 14 points
- greedy play: about 52 points, plus incidents.

The logistic regeneration term R × T × (1 − T/100) is at most 25R, which is 4 points at R = 0.16.

| N | C1 | C2 | C3 | C4 | result |
|---|---|---|---|---|---|
| 4 | 1 / 100% | 100% / 11% | 15% | 100% | FFFF |
| 6 | 1 / 100% | 100% / 11% | 13% | 100% | FFFF |
| 8 | 1 / 100% | 100% / 11% | 13% | 100% | FFFF |
| 10 | 1 / 100% | 100% / 11% | 13% | 100% | FFFF |
| 12 | 1 / 100% | 100% / 11% | 13% | 100% | FFFF |

### Step 1: R 0.16 → 0.25 (first in the §8.3 order)

I swept R alone at 50 seeds:

| R | Result |
|---|---|
| 0.16 or 0.5 | Everything fails. |
| 1.0 | C2 and C3 pass; C1 still reaches a moratorium in quarter 1. |
| 2.0 | C1 median is quarter 3–4, still too early. |

No value of R alone can pass C1. Greedy draw in quarter 1 exceeds anything regeneration can offset. Values of R near or above 1 also make the discrete logistic step overshoot, so trust would swing by tens of points a quarter.

R was therefore raised only moderately, to 0.25, which gives a faster recovery once pressure eases. Results at 200 seeds:

| N | C1 | C2 | C3 | C4 | result |
|---|---|---|---|---|---|
| 4 | 1 / 100% | 100% / 20% | 12% | 100% | FFFF |
| 6 | 1 / 100% | 100% / 19% | 13% | 100% | FFFF |
| 8 | 1 / 100% | 100% / 19% | 13% | 100% | FFFF |
| 10 | 1 / 100% | 100% / 19% | 13% | 100% | FFFF |
| 12 | 1 / 100% | 100% / 19% | 14% | 100% | FFFF |

### Step 2: DRAW [1.0, 2.5, 5.5, 9.0] → [0.125, 0.3125, 0.6875, 1.125] (second in the order)

All four values were multiplied by 1/8, so the ratios between paces are unchanged.

Search, with C1–C4 results only:
- **Grid, 50 seeds:** R ∈ {0.16, 0.25, 0.35} × DRAW scale ∈ {0.10, 0.125, 0.15, 0.175, 0.20}.
- **Refinement, 200 seeds:**
  - R = 0.25 at DRAW scales 0.11, 0.125, 0.135 and 0.15
  - R = 0.30 at DRAW scales 0.15 and 0.175.

What the search showed:
- At R = 0.25, DRAW × 0.15 passes, but C1's median sits on the lower bound (quarter 5) and C4 reaches 3% at N = 4.
- DRAW × 0.125 centres C1 at quarter 6 and keeps C4 at no more than 1%. This was chosen.
- A 500-seed check gives the same result: all pass, C1 median 6, C4 at most 1.0%.

After, at 200 seeds:

| N | C1 | C2 | C3 | C4 | result |
|---|---|---|---|---|---|
| 4 | 6 / 100% | 0% / 466% | 448% | 1.0% | PPPP |
| 6 | 6 / 100% | 0% / 467% | 388% | 0% | PPPP |
| 8 | 6 / 100% | 0% / 466% | 365% | 0% | PPPP |
| 10 | 6 / 100% | 0% / 463% | 356% | 0% | PPPP |
| 12 | 6 / 100% | 0% / 461% | 353% | 0% | PPPP |

INC_TRUST, COMPUTE_COST, CAP_GAIN and γ were not changed.

Observation, not a change: with DRAW at 1/8 of its starting values, the 8/N scaling makes total draw D equal to the average firm's starting-scale d_i. The spec's starting values look as if they were written for "total draw = average d_i" rather than "8 × average d_i". The owner may want to confirm which was intended. The calibrated behaviour is the same either way.

### Step 3: EXPO_CUTS [1.5, 3.5, 6] → [0.1875, 0.4375, 0.75] (spec deviation)

This step is not in the §8.3 list. The exposure label cutoffs (§6.5) are thresholds on d_i. After step 2 every decision would read LOW, so the cutoffs were scaled by the same 1/8. Each decision keeps the label the spec intended:
- at safety 0, pace 1–4 read LOW, MED, HIGH and SEVERE
- pace 4 at safety 30 reads HIGH.

This step does not affect C1–C4, because the label is display-only. It is logged as a spec deviation in `docs/PROGRESS.md`.

### Engine rule change agreed with the owner (not a parameter)

The moratorium cash haircut (§6.3 step 7) applies only to positive cash. Negative cash is unchanged. This was decided before calibration, and all results above include it.

---

## 2026-10-02 — Session 9 (audit; no change)

No parameter was changed.

- **500-seed rerun** (`npm run calibrate -- --seeds 500 --out reports/calibration-500.md`): C1–C4 pass for every N, with the same margins as at 200 seeds. C1's median is quarter 6; C4 is at most 1.0% (N = 4).
- **Strategy search** (`npx tsx tools/audit-strategies.ts --seeds 100`, `reports/strategy-audit.md`): no dominant strategy. Three balance findings are left for the owner. Each would need a calibration change logged here:
  - one firm can trigger the moratorium at N ≤ 4 (`docs/REVIEW.md` M1)
  - POACH dominates the card choice over a whole session (M2)
  - pact sanctions do not deter a breach (M3).

---

## 2026-10-04 — Session 10 (multiplayer mode, up to 50 firms; no change)

No parameter was changed. Spec §8.1 now requires C1–C4 at N = 16, 20, 30, 40 and 50 as well as 4–12. `tools/calibration/scenarios.ts` runs all ten values (`npm run calibrate -- --seeds 200`, `reports/calibration.md`, 128 s).

| N | C1 | C2 | C3 | C4 | result |
|---|---|---|---|---|---|
| 16 | 6 / 100% | 0% / 464% | 345% | 0% | PPPP |
| 20 | 6 / 100% | 0% / 462% | 344% | 0% | PPPP |
| 30 | 6 / 100% | 0% / 465% | 340% | 0% | PPPP |
| 40 | 6 / 100% | 0% / 464% | 338% | 0% | PPPP |
| 50 | 6 / 100% | 0% / 465% | 337% | 0% | PPPP |

N = 4–12 are unchanged from Session 2.

Why no change was needed: the 8/N factor (§6.3 steps 4 and 5) makes total draw and incident loss depend on average behaviour, and market size grows with N (§6.3 step 8), so per-firm economics stay close to N = 12. The exposure label cutoffs apply to the unscaled d_i and do not depend on N.

Observations for the owner (diagnostics, no pass condition):
- **Mixed rooms collapse later at large N.** The owner finds this, and the 21.5% at N = 12, unacceptably low (2026-10-04); Session 16 in `docs/SESSIONS.md` recalibrates it. With half the firms greedy, the share of seeds with a moratorium by quarter 14 falls from 21.5% at N = 12 to 2.5% at N = 50; by quarter 30 it stays near 73%. Incident shocks average out over more firms, so trust moves more smoothly. A 50-person session needs most of the room to push hard before quarter 14 for the moratorium to arrive within a normal session length.
- **Leaderboard churn rises with N**: 15 firms change rank per quarter at N = 50 (1.2 at N = 12). The paged board pins the largest mover (§14.1).
- Card dominance stays below 10% for every card at every N.

---

## 2026-10-05 — Session 16 (earlier moratorium under greedy play)

**Owner decision (2026-10-05).** New condition **C5** in spec §8.1: with ⌊N/2⌋ firms greedy and the rest sustainable, a moratorium by quarter 14 in at least 80% of seeds, and a median moratorium quarter of 11 or earlier, for every N from 4 to 50. C1–C4 still hold.

How to read the new tables:
- C5: % of seeds with a moratorium by quarter 14, then the median moratorium quarter ("none" when fewer than half have one). Pass requires at least 80% and a median of 11 or earlier.
- Margin columns used while searching:
  - "C1 ≤ Q4": share of all-greedy seeds with a moratorium by quarter 4. C1's median stays at 5 or later only while this is below 50%.
  - "C5 ≤ Q11": share of half-greedy seeds with a moratorium by quarter 11. The C5 median holds only while this is at least 50%.
- "Passive": the §8.2 passive path (every firm on the defaults for 30 quarters). It must be stable: lowest p10 trust at least 67, and drift below 2.

### Step 0: Session 15 values (before any change), 200 seeds

R 0.25, DRAW [0.125, 0.3125, 0.6875, 1.125], INC_TRUST 4.0.

| N | C1 | C2 | C3 | C4 | C5 | result |
|---|---|---|---|---|---|---|
| 4 | 6 / 100% | 0% / 466% | 448% | 1.0% | 34.5% / none | PPPPF |
| 6 | 6 / 100% | 0% / 467% | 388% | 0% | 26.5% / none | PPPPF |
| 8 | 6 / 100% | 0% / 466% | 365% | 0% | 26.0% / none | PPPPF |
| 10 | 6 / 100% | 0% / 463% | 356% | 0% | 23.0% / none | PPPPF |
| 12 | 6 / 100% | 0% / 461% | 353% | 0% | 21.5% / none | PPPPF |
| 16 | 6 / 100% | 0% / 464% | 345% | 0% | 16.5% / none | PPPPF |
| 20 | 6 / 100% | 0% / 462% | 344% | 0% | 10.5% / none | PPPPF |
| 30 | 6 / 100% | 0% / 465% | 340% | 0% | 5.0% / none | PPPPF |
| 40 | 6 / 100% | 0% / 464% | 338% | 0% | 4.5% / none | PPPPF |
| 50 | 6 / 100% | 0% / 465% | 337% | 0% | 2.5% / none | PPPPF |

### How the search was run

- Search tool: a script outside the repository that calls `runConditions` and the C5 room exactly as `tools/calibrate.ts` does.
- **Seeds.** Wide grids were screened at 60–100 seeds, over a subset of N (4, 6, 12 and 50, sometimes also 8 and 20). Every set that passed the screen was rerun at 200 seeds for all ten N.
- **Deviation from the session text** ("200 seeds per change"): screening at 60–100 seeds made it possible to try about 200 sets. The kept set was also run at 200 and 500 seeds.

### Step 1: R alone (first in the §8.3 order), 100 seeds

| R | N=4: C1 / C4 / C5 | N=6: C1 / C4 / C5 | N=12: C1 / C4 / C5 | N=50: C1 / C4 / C5 | fails |
|---|---|---|---|---|---|
| 0.25 (before) | 7 / 1% / 32% none | 6 / 0% / 20% none | 6 / 0% / 17% none | 6 / 0% / 2% none | C5 everywhere |
| 0.20 | 6 / 3% / 56% 13 | 6 / 0% / 64% 13 | 6 / 0% / 63% 13 | 5 / 0% / 81% 13 | C5 everywhere |
| 0.18 | 5 / 11% / 68% 11 | 5 / 1% / 74% 11 | 5 / 0% / 83% 11 | 5 / 0% / 97% 11 | C4 and C5 at N=4; C5 at N=6 |
| 0.17 | 5 / 13% / 71% 11 | 5 / 1% / 81% 10.5 | 5 / 0% / 90% 11 | 5 / 0% / 100% 10 | C4 and C5 at N=4 |
| 0.16 | 5 / 24% / 81% 10 | 5 / 1% / 85% 10 | 5 / 0% / 96% 10 | 5 / 0% / 100% 10 | C4 at N=4 |
| 0.13 | 5 / 38% / 97% 9 | 5 / 5% / 98% 9 | 5 / 0% / 100% 9 | 4 / 0% / 100% 8 | C4 at N=4; C1 at N=50 |
| 0.10 | 4 / 56% / 100% 8 | 4 / 25% / 100% 8 | 4 / 0% / 100% 8 | 4 / 0% / 100% 7 | C1, C2 and C4 |

What this shows:
- **Cause 1 is confirmed.** Logistic regeneration absorbs a half-greedy room. Lowering R alone brings C5 into range for N ≥ 6.
- **Cause 2 is confirmed.** At N = 4 an incident costs INC_TRUST × 8/N = 8 trust points, so one greedy firm's incidents trigger the moratorium by chance (C4 fails). No R passes C4 and C5 together at N = 4.
- Not kept.

### Step 2: R × DRAW, INC_TRUST unchanged at 4.0, 100 seeds

- **Grid:** 40 sets. R ∈ {0.12, 0.14, 0.16, 0.18, 0.20}; pace 2 draw ∈ {0.25, 0.3125}; pace 3–4 draw scaled by {0.8, 1.0, 1.2, 1.4}; N = 4, 6, 12, 50.
- **Result:** no set passes. The closest sets fail only C4 at N = 4, at 24–31%:
  - R 0.16 with DRAW unchanged
  - R 0.12 with DRAW [0.125, 0.25, 0.55, 0.9].
- Not kept. Incident damage has to fall before C4 and C5 can both hold at N = 4.

### Step 3: R × DRAW × INC_TRUST (third in the order)

- **First grid:** 48 sets, 60 seeds. R ∈ {0.14, 0.16, 0.18, 0.20}; INC_TRUST ∈ {2, 2.5, 3}; pace 3–4 draw × {1.3, 1.6, 1.9, 2.2}.
  - One set passed: R 0.14, INC_TRUST 2, pace 3–4 × 1.3.
  - With INC_TRUST at 2.5 or 3, sets failed C5 at N = 4–6 or C1 at N = 50.
- **Finer grid:** 48 sets, 100 seeds, N = 4, 6, 8, 12, 20, 50. R ∈ {0.12–0.15}; INC_TRUST ∈ {1.5, 2}; pace 2 draw ∈ {0.25, 0.3125}; pace 3–4 × {1.2, 1.3, 1.4}.
  - 18 sets passed C1–C5.
  - In every passing set, C1's median is quarter 5. Moving the all-greedy median to 6 always pushed the half-greedy median past 11.
  - The reason: total pressure rises linearly with the share of greedy firms, so the all-greedy room is only about twice as fast as the half-greedy room.
- **Finalists:** 8 sets at 200 seeds, all ten N. All 8 passed C1–C5.
- **Full calibration on two finalists:**

| set | C1–C5 | passive path |
|---|---|---|
| A: R 0.12, INC_TRUST 1.5, DRAW [0.125, 0.3125, 0.9, 1.45] | pass | **unstable at N = 4** (lowest p10 trust 66.75) |
| B: R 0.11, INC_TRUST 1.5, DRAW [0.125, 0.3125, 0.85, 1.4] | pass | **unstable at every N** (lowest p10 trust 63–66.5, drifting down) |

- Neither was kept. With R near 0.12, regeneration at trust 72 roughly equals the defaults room's draw, so trust no longer stays up on the passive path.

### Step 4: add the passive-path check; lower pace 2 draw, 100 seeds

- **Grid:** 36 sets. R ∈ {0.12, 0.13, 0.14}; INC_TRUST ∈ {1.5, 2}; pace 2 draw ∈ {0.25, 0.275}; pace 3–4 × {1.3, 1.4, 1.5}. All six checks (C1–C5 and the passive path) at N = 4, 6, 12, 50.
- **Result:** 19 sets passed all six. Lowering pace 2 draw from 0.3125 to 0.25 lifts the defaults room's equilibrium back above 72.
- **Most balanced set with uniform 3–4 scaling:**
  - R 0.12, INC_TRUST 1.5, DRAW [0.125, 0.25, 0.9625, 1.575]
  - C1 ≤ Q4 19–33%, C5 ≤ Q11 73–88%, C4 0%, lowest passive p10 69.8.

### Step 5: the single reckless firm (REVIEW M1), 500 seeds

M1 is the worst single-firm strategy for trust: pace 3–4, safety 0 or 5, any card plan. The other firms are restrained (pace 2, safety 15) or keep the defaults (pace 2, safety 10). Each cell is the moratorium share by Q14 / by Q30, over the two fields.

| set | N=4 | N=5 | N=6 | N=8 |
|---|---|---|---|---|
| before | 17–22% / 43–65% | 2–6% / 13–29% | 0.8–1.4% / 3–9% | 0% / 0% |
| uniform: R 0.12, INC 1.5, DRAW [0.125, 0.25, 0.9625, 1.575] | 60–77% / 100% | 11–23% / 99–100% | 0.8–3.6% / 78–100% | 0% / 9–49% |
| R 0.12, INC 1.5, DRAW [0.125, 0.25, 1.1, 1.45] | 42–57% / 100% | 4–12% / 95–100% | 0.2–1.4% / 55–95% | — |
| R 0.12, INC 1.5, DRAW [0.125, 0.25, 1.2, 1.35] | 27–42% / 100% | 2–6% / 84–100% | 0–0.6% / 36–87% | — |
| **kept: R 0.13, INC 1.5, DRAW [0.125, 0.25, 1.2, 1.4]** | **22–31% / ~100%** | **1–3% / 65–97%** | **0–0.2% / 16–68%** | — |

- The worst strategy is pace 4, safety 0 with LOBBY every other quarter in every row.
- **Uniform scaling of DRAW makes M1 much worse.** The worst single firm plays pace 4, and its draw grows with the pace 4 entry.
- **Flattening the step from pace 3 to pace 4** keeps the greedy bot's average draw (it plays pace 3 and 4 equally) while capping the worst single firm. It brings M1 by quarter 14 close to its old level at every N.
- The set in bold is kept. It passes all six checks at 100 seeds (N = 4, 6, 12, 50).
- **Owner decision (2026-10-05):** the kept set, over uniform scaling.

### Step 6: kept values

| parameter | before | after |
|---|---|---|
| R | 0.25 | **0.13** |
| DRAW | [0.125, 0.3125, 0.6875, 1.125] | **[0.125, 0.25, 1.2, 1.4]** |
| INC_TRUST | 4.0 | **1.5** |
| EXPO_CUTS (display only, see step 7) | [0.1875, 0.4375, 0.75] | **[0.15, 0.55, 1.21]** |

COMPUTE_COST, CAP_GAIN and γ were not changed.

After, 200 seeds (`reports/calibration.md`):

| N | C1 | C2 | C3 | C4 | C5 | result |
|---|---|---|---|---|---|---|
| 4 | 5 / 100% | 0% / 392% | 595% | 0% | 98.0% / 11 | PPPPP |
| 6 | 5 / 100% | 0% / 393% | 434% | 0% | 100% / 11 | PPPPP |
| 8 | 5 / 100% | 0% / 392% | 394% | 0% | 100% / 11 | PPPPP |
| 10 | 5 / 100% | 0% / 391% | 379% | 0% | 100% / 11 | PPPPP |
| 12 | 5 / 100% | 0% / 390% | 372% | 0% | 100% / 10 | PPPPP |
| 16 | 5 / 100% | 0% / 390% | 361% | 0% | 100% / 11 | PPPPP |
| 20 | 5 / 100% | 0% / 390% | 358% | 0% | 100% / 11 | PPPPP |
| 30 | 5 / 100% | 0% / 389% | 352% | 0% | 100% / 11 | PPPPP |
| 40 | 5 / 100% | 0% / 390% | 350% | 0% | 100% / 11 | PPPPP |
| 50 | 5 / 100% | 0% / 389% | 348% | 0% | 100% / 11 | PPPPP |

- Margins at 200 seeds: C1 ≤ Q4 23–36% (limit 50%); C5 ≤ Q11 67–81% (limit 50%).
- **500 seeds** (`reports/calibration-500.md`): all C1–C5 pass at every N.
  - C1 median 5
  - C4 at most 0.4% (N = 4)
  - C5 98.2–100% by quarter 14, median quarter 10 or 11.

**Greedy share** (200 seeds, moratorium by Q14; full table with Q10 and Q12 in `reports/calibration.md`):

| N | 1/4 greedy before → after | 1/3 greedy before → after | 1/2 greedy before → after | 2/3 greedy before → after |
|---|---|---|---|---|
| 4 | 1.0% → 0% | 1.0% → 0% | 34.5% → 98.0% | 86.0% → 100% |
| 8 | 0% → 0% | 3.0% → 25.0% | 26.0% → 100% | 65.0% → 100% |
| 12 | 0% → 0% | 0.5% → 5.5% | 21.5% → 100% | 82.5% → 100% |
| 20 | 0% → 0% | 0% → 8.0% | 10.5% → 100% | 80.0% → 100% |
| 50 | 0% → 0% | 0% → 0.5% | 2.5% → 100% | 92.5% → 100% |

A room that is a third greedy still rarely reaches the moratorium within 14 quarters. Half greedy almost always does, typically in quarters 9–12.

**Diagnostics after the change** (200 seeds):
- **Passive path:** stable at every N. Lowest p10 trust is 70.0 at N = 4 (was 67.0); no moratorium by quarter 30.
- **All-sustainable room:**
  - Median trust at Q14 is about 80, against 86 before.
  - Mean firm value at Q14 is about 740, against 845 before (−12%).
  - No moratorium by Q30.
  - Trust recovers about half as fast once pressure eases, because R halved.
- **All Aggressive (pace 3):**
  - at safety 0: median moratorium quarter 5 (was 9)
  - at safety 15: moratorium in 100% of seeds, median quarter 8 (before: 0–14.5% by Q14)
  - at safety 30: no moratorium.
  - So safety now offsets aggressive pace only at the top of the range.
- **Card dominance:** at most 7.0% for any card (pass).
- **Leaderboard volatility:** unchanged within noise (15.7 firms changing rank per quarter at N = 50).

### Step 7: EXPO_CUTS [0.1875, 0.4375, 0.75] → [0.15, 0.55, 1.21] (display only)

The exposure label (§6.5) is a threshold on d_i, so the cutoffs follow DRAW, as in Session 2 step 3.

The new cutoffs keep the reference labels:
- at safety 0, pace 1–4 read LOW, MED, HIGH and SEVERE
- pace 4 at safety 30 reads HIGH
- pace 1 and pace 2 match the spec's original label at every safety from 0 to 30; pace 2 reads MED up to safety 20.

The flatter step from pace 3 to pace 4 means two boundaries cannot both stay where the spec's starting scale put them. The labels still describe each firm's real draw truthfully. Letters below are the label at safety 0, 1, 2 … 30:

| pace | spec starting scale | new |
|---|---|---|
| 3 | HIGH up to safety 18, then MED | HIGH up to safety 27, then MED |
| 4 | SEVERE up to safety 16, then HIGH | SEVERE up to safety 6, then HIGH |

This step does not affect C1–C5.
