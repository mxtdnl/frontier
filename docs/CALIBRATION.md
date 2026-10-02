# Calibration log

Every change to a value in `src/engine/params.ts` is recorded here with before and after results (spec §8.3). Full results for the current values are in `reports/calibration.md` (`npm run calibrate -- --seeds 200`).

How to read the result tables:
- C1: the median quarter of the moratorium, then the % of seeds with a moratorium by quarter 12. Pass requires a median of 5–9 and at least 90%.
- C2: the % of seeds with a moratorium by quarter 30, then the median gain in valuation over C1. Pass requires at most 1% and a gain of at least 40%.
- C3: the median gain of the greedy firm over the rest. Pass requires at least 25%.
- C4: the % of seeds with a moratorium by quarter 14. Pass requires at most 5%.

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
