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

---

## 2026-10-09 — Session 17 (recalibration from live play; SHARE and RUSH)

**Owner decisions (2026-10-08 and 2026-10-09).**
- **Set S7** from `reports/live-sessions-2026-10-08.md` and docs/SESSIONS.md:
  - PUBLISH_TRUST 1.0 per card, unscaled → **0.25 per card × 8/N** (spec §6.3 step 6; an engine change, approved as a spec change)
  - SAFETY_DRAW_EFF 0.6 → **0.35**
  - LOBBY_TRUST stays 0.5 per card, unscaled.
- **Outside the §8.3 order, with the owner's approval.** Neither lever is in the §8.3 list (R, DRAW, INC_TRUST, COMPUTE_COST, CAP_GAIN, γ). The reason: those levers move the greedy bot and human rooms together, and C1 binds. The all-greedy median is already quarter 5, the lower limit. PUBLISH (which no bot plays) and SAFETY_DRAW_EFF (which barely affects the greedy bot at safety 5) separate human rooms from the bots.
- **New cards.**
  - `SHARE`: cost 15; every firm's incident probability ×0.75 per SHARE played (stacks per card).
  - `RUSH`: cost 0; +4 capability (permanent, applied before POACH); own draw d_i ×2 and own incident probability **×2** this quarter.
  - The owner raised RUSH's incident multiplier from the proposed ×1.5 to ×2, and asked for ×3 to be measured alongside.
- **No target for the observed-human room.** It is a §8.2 diagnostic, not a condition C6.

**New in the tools** (`tools/calibration/scenarios.ts`, `tools/calibrate.ts`):
- **Observed-human room.** N trajectories drawn with replacement from `tools/calibration/observed-human.json` (37 live firms), seeded per (seed, N). Each plays 30 quarters; a trajectory shorter than 30 repeats its last 5 quarters; a POACH target is a seeded random other firm, excluding the firm's previous target so that the repeat rule does not drop the card.
- **Harness check.** On the Session 16 engine and values, the room gives 13.0% / 5.5% / 0% / 0% / 0% by quarter 14 at N = 4 / 6 / 10 / 20 / 50. The live-session report measured 13% / 7% / 1% / 0% / 0%.
- **C1 by quarter 4** is now reported. C1's median stays at 5 only while this is below 50%.
- **Card dominance.** The check also reports each card's share of the quarters in which it was legal. No card may repeat, so no card other than NONE can exceed 50% of all quarters, and the 60% limit cannot fail for a single card.
- **Strategy audit.** `tools/audit-strategies.ts` gains five card plans (share, rush, rush+poach, rush+blitz, share+publish), card-plan tables for all four fields, and a `--params` override.

### Step 0: Session 16 values (before), 200 seeds

Measured with the Session 17 tools on the Session 16 engine and parameters. "C1" is the median quarter, then the share by quarter 4; "obs. human" is the observed-human room's share by quarter 14.

| N | C1 | C2 | C3 | C4 | C5 | obs. human | result |
|---|---|---|---|---|---|---|---|
| 4 | 5 / 35.5% | 0% / 392% | 595% | 0% | 98.0% / 11 | 13.0% | PPPPP |
| 6 | 5 / 33.5% | 0% / 393% | 434% | 0% | 100% / 11 | 5.5% | PPPPP |
| 8 | 5 / 30.5% | 0% / 392% | 394% | 0% | 100% / 11 | 2.5% | PPPPP |
| 10 | 5 / 26.5% | 0% / 391% | 379% | 0% | 100% / 11 | 0% | PPPPP |
| 12 | 5 / 23.0% | 0% / 390% | 372% | 0% | 100% / 10 | 0.5% | PPPPP |
| 16 | 5 / 25.0% | 0% / 390% | 361% | 0% | 100% / 11 | 0% | PPPPP |
| 20 | 5 / 26.0% | 0% / 390% | 358% | 0% | 100% / 11 | 0% | PPPPP |
| 30 | 5 / 27.0% | 0% / 389% | 352% | 0% | 100% / 11 | 0% | PPPPP |
| 40 | 5 / 27.5% | 0% / 390% | 350% | 0% | 100% / 11 | 0% | PPPPP |
| 50 | 5 / 27.0% | 0% / 389% | 348% | 0% | 100% / 11 | 0% | PPPPP |

### Step 1: S7, kept (PUBLISH_TRUST 0.25 × 8/N, SAFETY_DRAW_EFF 0.35), 200 seeds

| N | C1 | C2 | C3 | C4 | C5 | obs. human | result |
|---|---|---|---|---|---|---|---|
| 4 | 5 / 43.5% | 0% / 378% | 657% | 1.0% | 100% / 10 | 47.0% | PPPPP |
| 6 | 5 / 40.5% | 0% / 379% | 453% | 0% | 100% / 10 | 52.5% | PPPPP |
| 8 | 5 / 40.5% | 0% / 378% | 404% | 0% | 100% / 10 | 45.5% | PPPPP |
| 10 | 5 / 38.5% | 0% / 376% | 387% | 0% | 100% / 10 | 50.0% | PPPPP |
| 12 | 5 / 38.0% | 0% / 376% | 377% | 0% | 100% / 10 | 48.5% | PPPPP |
| 16 | 5 / 40.5% | 0% / 376% | 366% | 0% | 100% / 10 | 57.0% | PPPPP |
| 20 | 5 / 40.5% | 0% / 376% | 363% | 0% | 100% / 10 | 55.5% | PPPPP |
| 30 | 5 / 41.0% | 0% / 376% | 356% | 0% | 100% / 10 | 63.5% | PPPPP |
| 40 | 5 / 41.5% | 0% / 376% | 354% | 0% | 100% / 10 | 83.5% | PPPPP |
| 50 | 5 / 43.0% | 0% / 376% | 352% | 0% | 100% / 10 | 93.5% | PPPPP |

**Observed-human room in full** (200 seeds; `reports/calibration.md`):

| N | by 12 | by 14 | by 20 | median quarter |
|---|---|---|---|---|
| 4 | 34.5% | 47.0% | 59.5% | 16 |
| 6 | 38.0% | 52.5% | 62.5% | 14 |
| 8 | 35.5% | 45.5% | 59.5% | 16 |
| 10 | 40.5% | 50.0% | 58.5% | 14.5 |
| 12 | 35.5% | 48.5% | 61.0% | 15 |
| 16 | 39.5% | 57.0% | 68.5% | 13 |
| 20 | 44.0% | 55.5% | 62.0% | 13 |
| 30 | 53.5% | 63.5% | 70.0% | 12 |
| 40 | 73.5% | 83.5% | 89.0% | 11 |
| 50 | 85.0% | 93.5% | 95.5% | 10 |

- **Against the session table** (52% / 53% / 54% / 65% / 92% at N = 4 / 6 / 10 / 20 / 50): this run gives 47% / 52.5% / 50% / 55.5% / 93.5%. The gap at N = 20 is about 3 standard errors at 200 seeds. At 1,000 seeds the room gives 48.0% (N = 4), 52.9% (N = 10) and 61.9% (N = 20), so the difference is sampling noise. The 500-seed run gives 48.6% / 50.6% / 52.6% / 59.8% / 93.4%.
- **The room cannot measure SHARE or RUSH.** They do not appear in the live data. It also does not react to the new PUBLISH value: the live classes might play PUBLISH less now that it adds less trust.

**Diagnostics after the change** (200 seeds):
- **C1 margin.** C1 by quarter 4 rises from 23–35.5% to 38–43.5% (limit 50%). At 500 seeds it is 43–48.6%; 48.6% at N = 4 is the closest to the limit.
- **C5.** The median quarter moves from 10–11 to 10 at every N; by quarter 11 rises from 67–81% to 82.5–98.5%.
- **C2.** The all-sustainable mean firm value at quarter 14 falls from about 740 to about 710 (−4%). The gain over C1 falls from 389–393% to 376–379%. There is still no moratorium by quarter 30.
- **A third of the room greedy, moratorium by quarter 14:** before 0–25%, after 1–58.5% (58.5% at N = 8, 30.5% at N = 20, 16.5% at N = 50).
- **All Aggressive (pace 3):**
  - safety 15: the median moratorium quarter moves from 8 to 7
  - safety 30: before 0% by quarter 30, after 43–48% at every N. The §8.2 diagnostic "safety substitutes for restraint" now holds only partly. The report predicted 16–21% at SAFETY_DRAW_EFF 0.4 and 60–69% at 0.3; 0.35 lies between.
- **Passive path:** stable at every N; lowest p10 trust 69.85 at N = 4 (was 70.02).
- **Card dominance** (myopic best response, greedy field), share of all quarters:
  - RUSH is chosen in 9.9–21.1%, SHARE in 0.3–0.5%, BLITZ in 0–7.1%, PUBLISH in 0–1.5%; NONE in 71.5–87.0%.
  - Maximum card share 21.1% (N = 50). Pass at every N (limit 60%).
  - Share of the quarters in which the card was legal: RUSH 24.0% (N = 4) rising to 64.5% (N = 50); SHARE 0.5–0.9%.
  - Before (Session 16 values): NONE 91.6–92.4%, maximum card 7.0% (BLITZ).

### Step 2: RUSH_INC_MULT 3, measured and not kept, 200 seeds

- C1–C5 are unchanged by construction: no bot plays RUSH. The tables match step 1 exactly.
- **Card dominance:** RUSH 7.8–20.3% of all quarters (×2: 9.9–21.1%); 17.7% (N = 4) to 61.3% (N = 50) of the quarters in which it was legal (×2: 24.0–64.5%).
- The owner chose ×2 at this point. ×3 lowers RUSH's best-response share by only 1–6 points: an incident costs the firm only INC_REV_LOSS (15%) of that quarter's revenue, while the +4 capability is permanent.
- Superseded by step 5: the strategy audit showed that both ×2 and ×3 let one firm trigger the moratorium alone far more often (REVIEW M1).

### Step 3: EXPO_CUTS [0.15, 0.55, 1.21] → [0.19, 0.908, 1.21] (display only)

The exposure label (§6.5) is a threshold on d_i, so the cutoffs follow SAFETY_DRAW_EFF as well as DRAW.
- **Without a change:** under the Session 16 cutoffs, pace 2 would read MED and pace 3 HIGH at every safety level, because safety now lowers d_i less.
- **Reference points kept:** at safety 0, paces 1–4 read LOW, MED, HIGH and SEVERE; pace 4 at safety 30 reads HIGH (d_i 0.91 ≥ 0.908).
- Pace 1 and pace 2 match the spec's original label at every safety from 0 to 30.
- RUSH doubles d_i, so the ticket shows it: pace 3 at safety 13 reads HIGH, and SEVERE with RUSH.

Label by safety level (0–30):

| pace | spec starting scale | Session 16 | Session 17 |
|---|---|---|---|
| 1 | LOW throughout | LOW throughout | LOW throughout |
| 2 | MED up to 20, then LOW | MED up to 20, then LOW | MED up to 20, then LOW |
| 3 | HIGH up to 18, then MED | HIGH up to 27, then MED | HIGH up to 20, then MED |
| 4 | SEVERE up to 16, then HIGH | SEVERE up to 6, then HIGH | SEVERE up to 11, then HIGH |

- **Pace 3 and pace 4 cannot both match the spec.** Pace 3 reading MED from safety 19 would need a cutoff of 0.934–0.948. That is above pace 4's d_i at safety 30 (0.91), which would then read MED. The reference point wins, and pace 3 reads HIGH up to safety 20.
- This step does not affect C1–C5.

### Step 4: kept values at 500 seeds (`reports/calibration-500.md`)

- **C1–C5 pass at every N.**
  - C1: median quarter 5 everywhere; by quarter 4, 43.2–48.6%.
  - C4: at most 1.2% (N = 4).
  - C5: 99.8–100% by quarter 14; median quarter 10.
- **Observed-human room, by quarter 14:** 48.6% (N = 4), 50.6% (6), 45.8% (8), 52.6% (10), 49.0% (12), 58.0% (16), 59.8% (20), 71.6% (30), 86.2% (40), 93.4% (50).
- **Card dominance:** maximum card share 21.0% (RUSH, N = 50); pass.

### Test change: calibration smoke seeds 40 → 100

- **The failure.** With about 43% of all-greedy seeds reaching the moratorium by quarter 4, a 40-seed sample at N = 50 gives a C1 median of 4.5. Seeds 1–40 and 1–60 both do this.
- **The fix.** Seeds 1–80 and 1–100 give 5, as do the 200- and 500-seed runs. `tests/engine/calibration.test.ts` now runs 100 seeds, with a 60-second limit per test. This makes the test stricter, not weaker.

### Step 5: RUSH draw ×2 → ×1.5 and incident ×2 → ×1.5 (owner decision 2026-10-10)

**Why.** The strategy audit (`tools/audit-strategies.ts`, section 4, 500 seeds) found one firm alone triggering the moratorium far more often with RUSH. The worst single-firm strategy, the other firms restrained or on the defaults, gave these shares by quarter 14 / by quarter 30:

| N | Session 16 values | RUSH draw ×2, incident ×2 | RUSH draw ×2, incident ×3 |
|---|---|---|---|
| 4 | 22–31% / 99.6–100% | 100% / 100% | 100% / 100% |
| 5 | 1–3% / 65–97% | 81–90% / 100% | 98–99% / 100% |
| 6 | 0–0.2% / 16–68% | 20–33% / 100% | 48–64% / 100% |
| 8 | 0% / 0–2.4% | 0–0.2% / 54–97% | 0–1% / 91–100% |

The worst strategy is pace 4 (pace 3 at N ≤ 3), safety 0, RUSH every other quarter, in every cell.

**Variants measured** (500 seeds; one firm at pace 4, safety 0, RUSH every other quarter; the worse of the restrained and defaults fields; by quarter 14 / by quarter 30; the last column is a pace 2, safety 15 firm's V end with RUSH every other quarter against no card, N = 8 restrained field, 100 seeds):

| RUSH variant | N = 4 | N = 5 | N = 6 | N = 8 | gain of RUSH for a restrained firm |
|---|---|---|---|---|---|
| draw ×2, incident ×2 (step 1) | 100% / 100% | 90.0% / 100% | 32.8% / 100% | 0.2% / 97.0% | +79% |
| draw ×1.5, incident ×2 | 97.0% / 100% | 44.2% / 100% | 5.8% / 99.6% | 0% / 57.6% | +81% |
| **draw ×1.5, incident ×1.5 (kept)** | **90.6% / 100%** | **30.0% / 100%** | **2.4% / 99.0%** | **0% / 39.8%** | **+81%** |
| draw ×1.25, incident ×1.5 | 65.2% / 100% | 13.0% / 99.4% | 1.0% / 87.0% | 0% / 14.6% | +81% |
| draw ×2, incident ×2, cost 15 | 100% / 100% | 90.0% / 100% | 32.8% / 100% | 0.2% / 97.0% | +65% |
| draw ×2, incident ×2, capability +3 | 100% / 100% | 90.0% / 100% | 32.8% / 100% | 0.2% / 97.2% | +58% |
| no RUSH (pace 4, safety 0, LOBBY every other quarter; S7 values) | 41.0% / 100% | 5.2% / 99.4% | 0.4% / 84.6% | 0% / 11.2% | — |

- **The single-firm risk comes only from RUSH's public costs** (the extra draw and the extra incidents). Its cost and its capability gain change the attractiveness of the card, not the single-firm risk.
- **The owner chose draw ×1.5 and incident ×1.5** (option B), over keeping ×2 with an 8-firm minimum (A) and draw ×1.25 (C). This reverses the earlier rise of the incident multiplier from ×1.5 to ×2.
- **C1–C5 and every diagnostic before the card check are unchanged:** no bot plays RUSH. Identical tables in `reports/calibration.md`.
- **Card dominance, 200 seeds:** RUSH is chosen in 13.7–21.4% of all quarters (×2: 9.9–21.1%) and in 35.6–65.4% of the quarters in which it was legal (×2: 24.0–64.5%). The maximum card share is 21.4%: pass. At 500 seeds, 13.8–21.4%: pass.
  - RUSH is chosen more often at ×1.5 because its own incident risk is lower.
- **Exposure label:** pace 3 at safety 13 with RUSH reads SEVERE (d_i 1.53); without RUSH it reads HIGH.
