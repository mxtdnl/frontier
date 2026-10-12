# Observer feedback on the live sessions (2026-10-12)

Feedback from an observer of the live sessions, triaged against the spec, the code and Sessions 17–18. No code or parameter changed. Session 19 (docs/SESSIONS.md) builds the accepted items. Section 4 lists the recommendations that need owner decisions before any session builds them.

## 1. The feedback (verbatim)

> **Overall:**
>
> Clarity for ourselves (Facilitator notes for less smart people) on what are we telling them to do vs. what we are actually trying to teach them --> Pushing them into the Tragedy of the Commons trap through manufactured stress
>
> We tell them the overall outcome is to build public trust in AI for the betterment of the overall market which will grow. We then make students fall into the trap of prioritizing market share nurturing activities, which will increase public trust. You win the battle but lose the war because the overall market size is smaller than it could have been.
>
> We then need outcome slides which makes it clear what the learning objective was. The edutainment(!) reveal, if you will, where we flip the math and show the true winner.
>
> 1. The team with the fastest pace, spend less on research, breaks pacts, lobby politicians etc. will win the largest market share, but ruin public trust in the process. Bad behavior is seemingly rewarded and as a result, other teams will start to copy the bad behaviour of leaders on the board, rather than sticking true to values.
> 2. The team who engage in good activities (Not max pace and not minimum pace, spend on safety, publish safety research in combination with marketing as amplifier) will end up being the true winner because whilst they did not get the largest market share, they still did ok whilst ALSO growing the overall public trust in the process.
>
> **Proposed gaming tweaks:**
>
> - Tweak mechanics so that when the end conclusion comes, we can build a clearer narrative between "who won the battle" = the market value/share vs. "who won the war" = the team with the most positive overall outcome when factoring in market value with damage caused.
>   - Good Behaviour Examples (to drive hidden public trust, i.e. minimize damage)
>     - Invest in safety of X and above (but can be offset with too aggressive "pace")
>     - Make a pact and stick to it (assuming minimum value of X on safety and not being too aggressive on progress)
>     - Publish "Research Card"
>       - If the above is true AND you play marketing card, it should BOOST your value (because the marketing high-lights your companies good behaviour)
> - Bad Behavior
>   - Aggressive pace without offsetting safety investment of X
>   - Making a pact and breaking it
>   - Poach staff
>   - Lobby Politicians
>     - If the two above are true AND you play the marketing card, it should DETRACT from your value (because the marketing amplifies your brand recognition whilst you are in the news for doing bad and or non-collaborative things (Poach staff and lobby politicians).
> - Neutral behavior
>   - Slow pace on its own is not a negative, but firm should risk going broke by losing all its market share
>   - Marketing spend can be neutral if team is not engaging in bad or good behaviour. Playing marketing card is meant to boost in either direction.
> - It does not have to be exactly this logic, but some mechanics we can use to explain that the true winner is the team who created the largest net positive when comparing market value - (minus) damage caused to market.
>
> **Presentation tweak to the introduction/brief**
>
> - I would high-light how the budget works a bit clearer in beginning broef. The money you spend playing a card or the investment you make in safety or pace etc. It does not feel like that spend "means" anything right now (until you go bankrupt). Spending 10 on publishing research or 15 on marketing? The cost of safety? It feels like it does not matter during the game itself.
> - I would also high-light that if you spend nothing on pace and just play it safe, you will also go bankrupt because you lose all market share (to force the tragedy of the commons narrative). You cannot just sit back and do as little as possible and win the game.
>
> **Tech Side of things:**
>
> - If you make a pact with safety spending at 25, and then spend 25 on safety in the round, you are still in breach of pact as you need to spend "more" than pact.
>   - Can we change rule to be "equal or more than agreed pact amount"?
> - In order to lead students into the trap, you would first high-light "bad behaviour" from top half of the leaderboard in the scrolling feed showing the incidents (because it allows the moderator to show case that teams behaving poorly is stealing market share and that will in turn trigger other teams to copy bad behaviour)
> - To help facilitator, I would separate "incidents" which were a result of a Teams bad behaviour in the game (impacting only that team) vs. market incidents which impact all teams (because sometimes shit happens and every team goes down in a quarter, but it is generated by chance for everyone equally).
> - I would just give them different colours or something in the scrolling text. Something that helps the facilitator to easily identify a narrative for that particular quarter.

## 2. Triage

### Already built (Sessions 17–18)

| Feedback | What exists |
|---|---|
| "Battle vs war" reveal; true winner | Results panel 5, NET CONTRIBUTION (§10, §14.4): valuation + market effect + research credit − rivalry taken; slope chart from rank by valuation to rank by net contribution; headline from the data. Panels 3 (COUNTERFACTUAL) and 4 (ATTRIBUTION) already existed |
| Good and bad conduct counted | Conduct ledger per firm. For the market: PUBLISH, SHARE, restraint quarters (pace ≤ 2, safety ≥ 15), quarters that kept a pact's terms. Against: POACH, BLITZ, LOBBY, RUSH, breaches (detected and undetected), incidents |
| Safety offset by aggressive pace | Already the trust-draw formula (§6.3 step 4) |
| PUBLISH counted strongly | Research credit (Session 18), display only |
| Incidents clearer to the facilitator | INCIDENTS block with effect and cause, `INCID` tag and command (Session 18 Part A). The ticker already marks incidents, breaches, insolvency and the moratorium ▼ in `--down` |
| A narrative per quarter for the facilitator | `#/wire` with every entry by quarter and NOT ON THE WIRE (Session 18 Part B) |
| Pact "equal or more" | Already the rule: `src/engine/pacts.ts:22` records a breach only when safety < minimum |

**The reported pact breach.** The live export is not available, so the cause cannot be confirmed. The most likely cause: the pact form opens with "Maximum pace 2" ticked (`src/screens/Play/pacts.ts:15`), and typing a minimum safety leaves it ticked. A pact proposed as "safety 25" then also caps pace at 2, and pace 3 is a breach. Other possible causes: a teammate's later commit (last commit wins), AUTO defaults, or an audit covering up to 3 earlier quarters.

### Accepted for Session 19

- Pact form with no terms ticked by default, a terms preview before SIGN, and a warning on the decision ticket when a decision would break a pact the firm belongs to.
- Briefing lines on spending and insolvency, true and without numbers.
- A facilitator-only QUARTER BRIEF on `#/wire`: where the quarter's trust change came from, which firms drew most, and the conduct of top-half against bottom-half firms.
- Teaching notes for facilitators in the runbook.
- A facilitator guide (PDF): a detailed walkthrough for someone new to FRONTIER.

### Not built, and why

| Proposal | Reason |
|---|---|
| Telling students the objective is to build public trust | §1 non-telegraphing rule. The game presents itself as a competitive business simulation; the briefing says only that market revenue tracks public trust. A warned room plays differently. The facilitator guide says what not to say |
| Marketing (BLITZ) that adds value after good conduct and removes it after bad | There is one shared trust pool and no per-firm reputation. If good conduct pays on the scoreboard, restraint is individually rational and there is no dilemma to teach (§8.1 C3: greed must pay for one firm alone). The "war" is scored outside the game, on panel 5 |
| Extra private penalties for POACH, LOBBY or breaches | Same reason. Breaches are already fined when audited (§9.2) |
| "A slow firm goes bankrupt" in the briefing | False in the current model (section 3), and the briefing must be true (§6.6). Making it true needs a recalibration, and C1 is near its limit (48.6% against 50% at N = 4) |
| Separating market-wide incidents from firm incidents | The model has no market-wide incidents. Every incident is drawn per firm from its own pace and safety; its trust cost falls on every firm, its revenue loss on that firm. A quarter in which every firm falls is the shared trust pool shrinking, which is the lesson. Labelling it chance would teach the opposite. The QUARTER BRIEF shows the facilitator where each quarter's loss came from |
| Colouring good and bad conduct on the projector ticker, or favouring top-half firms' card headlines | Marking conduct as good or bad before the results screen tells the room the lesson (§1, §15.3). The same facts go on the facilitator's `#/wire` screen instead |
| A cost for pact breaches in net contribution | A breach's damage is its trust draw, which is already counted. Any extra figure would be arbitrary |

## 3. Checking the feedback's claims (scratch simulation)

One firm (firm 0) plays a scripted strategy against fixed rivals. 8 firms, fixed 14-quarter end, disclosure off, audit probability 0.25, seeds 1–60, medians. The script is in the appendix; it is not a calibration tool. Ranks among identical rivals depend on the tie-break, so the table shows net contribution figures, not ranks.

**Rivals at pace 2, safety 10, no card (a calm room; no moratorium in any seed):**

| Firm 0 strategy | Value | Cash | Insolvent | Net contribution | Rivals' net contribution | Rivals' value |
|---|---|---|---|---|---|---|
| pace 1, safety 0 | 617 | 505 | 0% | 706 | 824 | 839 |
| pace 1, safety 30 | 90 | −5 | 0% | 230 | 844 | 859 |
| pace 1, safety 20, PUBLISH every other quarter | 203 | 101 | 0% | 1031 | 854 | 869 |
| pace 2, safety 15 (the ALTERNATIVE) | 660 | 502 | 0% | 660 | 766 | 781 |
| pace 2, safety 20, PUBLISH and BLITZ alternating ("good") | 551 | 395 | 0% | 1121 | 768 | 783 |
| pace 2, safety 25, PUBLISH and SHARE alternating | 286 | 133 | 0% | 1075 | 808 | 824 |
| pace 3, safety 5, BLITZ and LOBBY alternating | 1263 | 1045 | 0% | −236 | 475 | 490 |
| pace 4, safety 0, POACH and BLITZ alternating ("bad") | 2354 | 2010 | 0% | 457 | 249 | 266 |
| pace 2, safety 0, RUSH and POACH alternating | 1963 | 1687 | 0% | 1718 | 578 | 599 |

In two rooms that reached the moratorium in every seed (half the rivals at pace 3–4 with safety 5, half at pace 2 with safety 15; and all rivals at pace 3 with safety 15), most strategies ended insolvent. Pace 1 with safety 0 kept the highest value (40 and 13). The "good" firm had a positive net contribution (283 and 169) against rivals at about −1,050 and −820. The "bad" firm was far below its rivals (−1,324 and −1,121).

**Findings**
1. **A slow firm does not go bankrupt in a calm room.** In rooms that reach the moratorium, almost every firm becomes insolvent, and the slowest keeps the most value. The feedback's premise is false in the current model.
2. **Spending already matters.** Each unit of cash spent is a unit of valuation (V = cash + capability term). The "good" firm finished on 551 against about 780 for its rivals. The problem is that the screens do not make this felt.
3. **The "good" firm wins on net contribution in all three rooms. So does a passive firm** (pace 1, safety 20, PUBLISH), against the feedback's "you cannot sit back and win".
4. **In a calm room, the reveal can fail.** The "bad" firm still beat its rivals on net contribution (457 against 249), and RUSH with POACH led both rankings. Rivalry taken values each POACH or RUSH as a one-off capability amount (POACH_LOSS or RUSH_CAP_GAIN × CAP_MULT × T_final/100: about 6 or 8 per card at trust 70). It ignores the market share that capability wins in every later quarter, so the re-ranking depends mostly on the moratorium charge. In the four live rooms the valuation leader still fell to 5th–9th (Session 18), so this did not happen there. Confidence that the direction holds generally is moderate: these are scripted rooms, not the observed-human room.

## 4. Recommendations that need owner decisions (not in Session 19)

1. **Measure first.** Add a net-contribution diagnostic to `tools/audit-strategies.ts`: for each strategy and field, rank by valuation and by net contribution, over 100 seeds and in the observed-human room. Findings 3 and 4 should rest on that, not on this scratch run.
2. **Rivalry over the remaining quarters.** If the diagnostic confirms finding 4, value POACH and RUSH rivalry as the revenue the moved capability earned in every later quarter (shares recomputed without it, as BLITZ already is), not as a one-off capability value. This is display only (§10); the engine does not change.
3. **The passive firm.** Decide whether a firm that sits at pace 1 with high safety and PUBLISH should be able to top net contribution. Restraint does preserve trust, and the firm paid for it on the board, so leaving it is defensible. The research credit (1.0 per card, 4 times PUBLISH's real trust effect) is what lifts it most; re-measure before changing it.

## Appendix: scratch script

Run from the repository root with `npx tsx <file>`.

```ts
import { createGame, resolveRound } from './src/engine/resolve';
import { computeContribution } from './src/engine/contribution';
import type { Card, Decision, EngineState, Pace } from './src/engine/types';

type Strat = (q: number, s: EngineState) => Decision;
const d = (pace: Pace, safety: number, card: Card = 'NONE', target: string | null = null): Decision => ({ pace, safety, card, target });
const alt = (a: Card, b: Card) => (q: number) => (q % 2 ? a : b);
const strats: Record<string, Strat> = {
  'p1 s0': () => d(1, 0),
  'p1 s30': () => d(1, 30),
  'p1 s20 publish/none': (q) => d(1, 20, alt('PUBLISH', 'NONE')(q)),
  'p2 s15 (ALTERNATIVE)': () => d(2, 15),
  'p2 s20 publish/blitz': (q) => d(2, 20, alt('PUBLISH', 'BLITZ')(q)),
  'p2 s25 publish/share': (q) => d(2, 25, alt('PUBLISH', 'SHARE')(q)),
  'p3 s5 blitz/lobby': (q) => d(3, 5, alt('BLITZ', 'LOBBY')(q)),
  'p4 s0 poach/blitz': (q, s) => (q % 2 ? d(4, 0, 'POACH', s.firms[1 + (q % 7)]!.id) : d(4, 0, 'BLITZ')),
  'p2 s0 rush/poach': (q, s) => (q % 2 ? d(2, 0, 'RUSH') : d(2, 0, 'POACH', s.firms[1 + (q % 7)]!.id)),
};
const fields: Record<string, (i: number, q: number) => Decision> = {
  'standard p2 s10': () => d(2, 10),
  'half greedy': (i, q) => (i % 2 ? d(q % 2 ? 3 : 4, 5) : d(2, 15)),
  'all p3 s15': () => d(3, 15),
};
const N = 8, Q = 14, SEEDS = 60;
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2]! : (b[b.length / 2 - 1]! + b[b.length / 2]!) / 2; };
for (const [fname, field] of Object.entries(fields)) {
  console.log(`\n## ${fname}`);
  for (const [sname, strat] of Object.entries(strats)) {
    const V: number[] = [], C: number[] = [], n0: number[] = [], nf: number[] = [], vf: number[] = [];
    let ins = 0, mor = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      let s = createGame({ label: 'X', endMode: 'fixed', minEnd: Q, maxEnd: Q, fixedEnd: Q, disclosure: false, autoAuditP: 0.25 },
        Array.from({ length: N }, (_, i) => ({ id: `f${i}`, ticker: `F${i}`, isBot: false, botPolicy: null })), seed);
      for (let q = 1; q <= Q; q++) {
        const dec: Record<string, Decision> = {};
        s.firms.forEach((f, i) => { dec[f.id] = i === 0 ? strat(q, s) : field(i, q); });
        s = resolveRound(s, dec).state;
      }
      const f0 = s.firms[0]!;
      const cc = computeContribution(s);
      V.push(f0.valuation); C.push(f0.cash); if (f0.insolvent) ins++; if (s.collapsed) mor++;
      n0.push(cc.firms['f0']!.netContribution);
      nf.push(med(s.firms.slice(1).map((f) => cc.firms[f.id]!.netContribution)));
      vf.push(med(s.firms.slice(1).map((f) => f.valuation)));
    }
    console.log(`| ${sname} | ${med(V).toFixed(0)} | ${med(C).toFixed(0)} | ${(ins / SEEDS * 100).toFixed(0)}% | ${med(n0).toFixed(0)} | ${med(nf).toFixed(0)} | ${med(vf).toFixed(0)} | moratorium ${(mor / SEEDS * 100).toFixed(0)}% |`);
  }
}
```
