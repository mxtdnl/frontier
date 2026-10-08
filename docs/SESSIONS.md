# Build sessions

Each session is started in Claude Code on the web with a one-line instruction: "Read docs/SESSIONS.md and carry out Session N exactly." The full instructions live here so the owner never has to paste long prompts.

Rules that apply to every session:
- Follow CLAUDE.md (including the Environment section and the session protocol).
- Before writing any code, present a short plan (files to create or change, tests to add) and wait for the owner to reply "go".
- Finish by running typecheck and tests, updating docs/PROGRESS.md, committing, and opening a pull request with a plain-English summary of what changed and anything the owner must do manually.

---

## Session 1 — Scaffold, design system, static screens (model: Sonnet 5.5)

Read docs/spec.md §3, §14, §15, §16, §17. Do not add Firebase.

1. Scaffold Vite + React + TypeScript (strict) with a hash router. Set Vite `base: './'`. Use vite-plugin-singlefile so `npm run build` emits one dist/index.html with fonts inlined. Add every npm script listed in CLAUDE.md; stub test:rules, calibrate and bots with "not yet implemented" exits.
2. Implement src/ui/tokens.css and src/ui/grid.css exactly per spec §16.1–16.2, including a `.lit-room` mode class. Self-host IBM Plex Mono (400/500/600) via @fontsource with tabular figures. Use integer ch units for all layout dimensions, with a fixed line height.
3. Build every component in §16.3. Add a #/kit route showing each component in all states.
4. Build static versions of the following screens, driven by src/mock/fixtures.ts with 8 firms. Select states with a ?state= query parameter.
   - #/screen: lobby, briefing, open, reveal, summit, and disclosure on/off.
   - #/play: tabs DESK, BOOK, PACTS and WIRE; states open, committed, reveal, summit and ended.
   - #/control.
   - #/new.
   - #/results: all six panels.
5. Make the CommandLine and F-key bar work locally:
   - Commands: BOARD, TRST, PACT, WIRE, FIRM <TICKER>, HELP. Esc returns to the board.
   - Every F-key has a Shift+letter alternative.
   - Never bind F5, F11 or F12.
6. Implement the reveal motion per §16.5, triggered by a "Simulate reveal" control on #/kit. Honour prefers-reduced-motion.
7. Implement `npm run lint:copy` (scripts/lint-copy.ts) per CLAUDE.md and wire it into `npm run build`.
8. Add .github/workflows/pages.yml that builds on every push to main and deploys dist to GitHub Pages.
9. Install Playwright with Chromium. If the browser download is blocked by the network proxy, stop and tell the owner the exact blocked host name so they can allow it.

Acceptance:
- The single-file build succeeds.
- There are no hex colour values outside tokens.css.
- lint:copy passes.
- #/play is usable at 360x640, 390x844 and 1440x900.
- #/screen is legible at 1280x720 and 1920x1080.

Screenshot every screen and state at those sizes with Playwright. Review the screenshots against the §16.4 forbidden list and the §16.2 grid, and fix any problems. In the pull request, tell the owner the GitHub Pages URL the site will appear at once merged.

---

## Session 2 — Engine and calibration (model: Opus 5.5)

Read docs/spec.md §5, §6, §7, §8, §9, §10, §15.4. Do not touch UI or Firebase. This is the most important session: think carefully and present a detailed plan first.

1. Implement src/engine/{types,params,rng,resolve,cards,pacts,headlines,counterfactual,policies,data}.ts, exactly following the resolution order in §6.3.
   - Every number from §6.2 and §5.2 goes in params.ts and nowhere else.
   - Use mulberry32 seeded by hash(gameSeed, round, stream), with the streams in §6.8.
   - Index incident draws by (round, firm order) so the counterfactual uses the same random draws.
2. Export the following:
   - `createGame(settings, firms, seed)`: returns the initial state, including tau and endRound.
   - `resolveRound(state, decisions, params)`: returns `{state, outputs, dataLines}`.
   - `runCounterfactual`: per §10.
   - attribution: per §10.
   - bot decisions: per §7.
3. Implement pact compliance, manual and automatic audits, graduated sanctions and the LOBBY waiver per §9.2, plus the disclosure snapshot per §9.3.
4. Implement the headline template engine (§15.4) and extend the bank to at least 40 templates in the same register. Use fictional entities only.
5. Unit-test each resolution step. Add these property tests:
   - T stays within [0,100].
   - Shares sum to 1 ± 1e-9.
   - The same seed gives identical output.
   - The counterfactual's incident draws match the actual run's.
6. Build tools/calibrate.ts (npm run calibrate).
   - Run scenarios C1–C4 and the §8.2 diagnostics for N ∈ {4,6,8,10,12}, with 200 seeds each.
   - Use 14 rounds by default, and 30 where the spec says so.
   - Write reports/calibration.md with pass/fail tables, percentile summaries and the passive-path trace.
7. Tune parameters in the order given in §8.3 until C1–C4 pass for every N.
   - Log every change, with before and after results, in docs/CALIBRATION.md.
   - If passing needs a structural change to the model, stop and explain the options to the owner in plain English rather than making the change.

Acceptance:
- All tests pass.
- C1–C4 pass for every N.
- The reports are committed.
- The pull request summarises, in plain English, how the market behaves: for example, how many quarters greedy play takes to cause a moratorium.

---

## Session 3 — Firebase data layer and security rules (model: Opus 5.5)

Read docs/spec.md §3, §11, §12, §13. The owner will paste their Firebase project ID and web config into the message that starts this session.

1. Write firebase.json and .firebaserc non-interactively.
   - firebase.json: the database rules file, plus emulators for auth and database only.
   - .firebaserc: the owner's real project ID.
   - Put the web config in src/firebase/config.ts. It is not a secret; access is enforced by the rules.
2. Use the project ID `demo-frontier` for all emulator work so no login or credentials are needed. Never run firebase login or firebase deploy.
3. Implement the following:
   - src/firebase/init.ts: connects to the emulators when VITE_USE_EMULATOR=1.
   - paths.ts: the only place database paths are built.
   - api.ts: typed read/write/subscribe helpers for every node in §12.
   - presence.ts: onDisconnect presence plus a /.info/serverTimeOffset helper.
4. Write database.rules.json implementing every requirement in §13. This includes:
   - the decision deadline check using `now`
   - the PIN-checked membership join
   - pact membership edits limited to a firm's own entry
   - results readable only when the phase is 'ended'.

   The facilitator check reads `/facilitators/{uid}` and must equal the boolean true.
5. Write tests/rules with @firebase/rules-unit-testing covering every allow and deny case in §13. These must include the following denied cases:
   - a participant reading engine, pactsPrivate, or another firm's firmsPrivate or decisions
   - a late decision write
   - a decision for the wrong round
   - a wrong PIN
   - a join after joinLocked (a rejoin is allowed).
6. Add src/state/ subscription hooks for public, firms, firmsPublic, rounds, pacts, the participant's own firm private data, own decision, and presence.

When the tests pass, end the pull request description with the complete final database.rules.json in a code block, headed "Paste this into Firebase → Realtime Database → Rules, then click Publish".

---

## Session 4 — Facilitator flows and round orchestration (model: Opus 5.5)

Read docs/spec.md §3, §4, §5.4, §11, §14.1, §14.2, §14.5. Replace mock data with live subscriptions on the facilitator routes.

1. Facilitator sign-in (email/password), gated on the /facilitators allowlist. Show a clear message if the account is not on the allowlist.
2. #/new: create a game with the §5.4 settings.
   - Generate a unique 4-letter code (A–Z without I and O) in /codes.
   - Initialise state via the engine's createGame.
   - Store tau and endRound only under engine/.
3. #/screen lobby: show the join code, a client-side QR code (qrcode-generator) and the URL. Firms appear live with member counts.
4. Implement the phase machine per §4: lobby → briefing → open → resolving → reveal → … → ended. It must include:
   - F9 advance
   - F10 double-press end
   - F8 summit enter and exit
   - timer controls and a server-time countdown
   - optional auto-resolve at the deadline
   - the hidden end round
   - a hard stop after round 30.
5. Build src/firebase/orchestrator.ts exactly per §11:
   - lock transaction
   - single read
   - engine resolveRound
   - one atomic multi-path update
   - retry if incomplete.

   Missing decisions get defaults per §6.4 and are flagged AUTO. Bot firms are resolved from their policies.
6. #/control:
   - a game panel, with tau and endRound masked until a hold-to-reveal
   - firm submission and presence panel
   - controls
   - a "Resolution incomplete — retry" state.
7. #/screen live:
   - the board, trust panel, ticker, F-key bar and command line, running on live data
   - the reveal motion on each reveal
   - hidden values never rendered on #/screen.

Test against the emulator with Playwright, using separate browser contexts for the facilitator and for scripted participants. Add Vitest tests for the orchestrator's lock and retry behaviour. In the pull request, tell the owner exactly how to try the facilitator screens on the live site after merging: which URL, how to sign in, and what to press.

---

## Session 5 — Participant join and control centre (model: Sonnet 5.5)

Read docs/spec.md §3, §5.1, §6.5, §14.3.

1. #/ landing and the #/j/:code join flow.
   - Anonymous sign-in; the participant enters or confirms the game code.
   - **Found a firm**: name of 2–20 characters and a ticker of 3–6 letters A–Z. An auto-generated 4-digit PIN is shown prominently for teammates.
   - **Join a firm**: pick from the list and enter the PIN.
   - Optional device initials, with a note not to enter a full name.
   - Rejoining on the same device restores membership.
2. #/play live:
   - Header: ticker, quarter, countdown, cash, last profit.
   - DESK: pace, safety and the card picker. Show the POACH target list and the cooldown and insolvency rules inline.
   - Estimated cost and the public exposure label per §6.5.
   - Commit, and recommit until the round closes, showing which device committed.
   - A locked state after the deadline.
3. Reveal state: a quarter result card and headlines.
   - BOOK tab: the participant's own history table and step sparkline.
   - WIRE tab: the live feed.
4. Summit: a banner, with the PACTS tab auto-selected. Show existing pacts read-only; Session 6 completes this.
5. Show a visible offline state with automatic reconnection. Never show other firms' private data.

Acceptance: a 3-quarter loop works with the facilitator screens at phone and desktop sizes (Playwright), keyboard-only use works on #/play, and lint:copy passes. In the pull request, give the owner a step-by-step test script using their own phone and laptop on the live site.

---

## Session 6 — Pacts, audits, cards, disclosure, summit (model: Sonnet 5.5)

Read docs/spec.md §5.2, §5.3, §9, §14.1, §14.2, §15.4.

1. PACTS tab: propose a pact (maxPace and/or minSafety, auto-named PACT-A, PACT-B…), join, leave, and view members and terms. A participant can only write their own firm's membership.
2. Projector: a PACT command-line view, pact tags on board rows, and BREACH tags for 2 rounds after detection.
3. Control: unaudited violation counts per pact, a manual Audit action (F6 / Shift+F), and display of automatic audit outcomes.
4. Disclosure toggle (F7 / Shift+D) on both screen and control. The PACE, SAFE and EXPO columns appear only while it is on, using the round's disclosure snapshot. The toggle headlines fire.
5. Verify all four cards end to end, including the POACH target, the cooldowns and the LOBBY fine waiver. Show participant notices when a card is invalidated.
6. Wire every event headline from the engine outputs into the ticker and the WIRE tab.

Write emulator integration tests for:
- pact join and leave permissions
- an audit with graduated sanctions across three violations
- disclosure rendering, on and off.

---

## Session 7 — Results, counterfactual, export (model: Sonnet 5.5)

Read docs/spec.md §10, §14.4, §15.5, §8.4.

1. When the phase becomes 'ended', the facilitator client computes the final results, counterfactual and attribution with the engine, and writes /results in one update.
2. #/results on the projector has six panels stepped with F9. Use step charts and horizontal bars only.
   1. FINAL BOARD
   2. TRUST TRACE: collapse marker, plus a tau line only if the "Reveal threshold" setting is on
   3. COUNTERFACTUAL
   4. ATTRIBUTION
   5. PACT RECORD: reveals undetected violations
   6. DEBRIEF
3. Participant results card: final rank, valuation actual vs counterfactual, the firm's own exposure share, and its own undetected violations.
4. Export on #/control: download a JSON file of the full game history and a .txt file of all DATA lines per §8.4.
5. A "Delete game" control with double confirmation.

The results screen is the only place the non-telegraphing vocabulary is allowed; limit the lint:copy exclusion to src/screens/Results. Add tests checking that results numbers match engine outputs for a fixed seed.

---

## Session 8 — Rehearsal, end-to-end tests, hardening, launch (model: Sonnet 5.5)

Read docs/spec.md §7, §18.

1. tools/bots.ts (npm run bots): spawns N anonymous clients against the emulator. They join a game and submit decisions by policy (cautious, standard, greedy, mimic-leader, mixed) with random delays. Live rehearsal uses the in-app bot firms from §7 instead, because the cloud container cannot reach the live database.
2. Playwright end-to-end tests against the emulator:
   - A facilitator plus 8 bot clients plus 1 scripted human, running 14 quarters. Include a summit, two audits, a disclosure toggle, a forced collapse (fixed seed), the counterfactual and the results panels.
   - A 30-quarter manual-mode run that must end automatically.
3. Hardening. The app must cope with:
   - a facilitator tab refresh mid-round (state recovers from the database)
   - duplicate facilitator tabs (the lock prevents double resolution)
   - clock skew
   - participants rejoining.
4. Verify every acceptance criterion in §18, including Lighthouse accessibility ≥ 95 on #/play and lint:copy. Fix any failures.
5. Write docs/RUNBOOK.md for the facilitator in plain English:
   - a pre-class checklist
   - how to create a game
   - the key map
   - what to do if something goes wrong
   - the debrief flow
   - how to run a solo rehearsal with bot firms on the live site.
6. Confirm that the GitHub Pages workflow deploys, and that the built page makes no network requests other than to Firebase.

The pull request includes an acceptance-criteria checklist.

---

## Session 9 — Independent audit (model: Opus 5.5)

Read all of docs/spec.md, docs/PROGRESS.md and docs/CALIBRATION.md. Act as an independent reviewer and do not add features.

1. Security. Test each of these threats against database.rules.json and the client code:
   - a participant using browser devtools to read hidden values
   - writing other firms' decisions
   - late writes
   - forging results
   - guessing PINs.

   Confirm that tau and endRound never reach #/screen or #/play.
2. Model.
   - Re-run calibration with 500 seeds.
   - Search for dominant strategies, such as a card or pact exploit that beats both sustainable and greedy play.
   - Confirm that no single firm can trigger a moratorium at N=4.
3. Copy and design. Audit:
   - every participant and projector string against the CLAUDE.md copy rules
   - every screen against §16.4 and the character grid, at the three viewport sizes.
4. Write docs/REVIEW.md with findings ranked by severity. Each finding needs a reproduction and a proposed fix. Fix only critical and high issues; list the rest, in plain English, for the owner to decide.

---

## Session 10 — Scale to 40–50 participants (model: Opus 5.5)

Added after Session 8. Read docs/spec.md §2, §6.2 (DRAW scale), §8, §13, §14.1, §14.4 and docs/PROGRESS.md (Session 8, "Defects found"). Present a detailed plan first and wait for "go".

**Why.** Session 8 found that layouts clip as the firm count grows. It fixed them up to the spec's maximum of 16 firms, using one-line rows (board above 12 firms) and two columns (results panels 3 and 4 above 8 firms). That does not scale to 40–50 participants if each participant is a firm. The fixes were tuned for 16 and have no headroom beyond it.

**First question to ask the owner (one question, before the plan).** Is the target 40–50 *participants* in teams of 3–5 (10–16 firms, already supported), or 40–50 *firms* of one person each? The spec supports 2–16 firms with 1–5 devices each, and calibration covers 4–12 firms. 40–50 firms is outside both, so it needs a spec change and a new calibration. The proposals below assume the harder case, 40–50 firms. Skip any step the owner's answer makes unnecessary.

**Proposed fixes (to confirm in the plan; do not start without "go").**

1. **Raise the limit deliberately.** Today `MAX_FIRMS` is 16 in `src/firebase/orchestrator.ts`, and the spec says 2–16. Raise it to 50 only with the owner's approval, and update spec §2 and §5.4. Check the engine (every loop is per firm, so cost is small), the `DRAW_REF_N / N` scaling, and the exposure cutoffs, which were scaled for N = 8.
2. **Re-run calibration for large N.** Extend `tools/calibrate.ts` to N ∈ {20, 30, 40, 50} (C1–C4 and the §8.2 diagnostics, 200 seeds). Log changes in docs/CALIBRATION.md. If C1–C4 cannot pass without a structural change, stop and explain the options in plain English.
3. **Projector board.** Choose one, in order of preference:
   - **Paged board.** Show 10 rows at a time and rotate every 8 s with a page marker (for example `PAGE 2/5`). Rows stay two lines tall and legible from the back of the room. Pause rotation while the facilitator uses a key. Always show the leader and any firm that changed rank by 3 or more.
   - **Multi-column board.** Single-line rows in 2 columns up to about 32 firms and 3 columns up to 50 at 1920×1080. At 1280×720 fall back to paging.
   - **Top and bottom summary.** Show the top 10, the bottom 5 and the count in between. Full list on FIRM and a new `LIST` command.
4. **Results panels.** FINAL BOARD, COUNTERFACTUAL and ATTRIBUTION need a rule that depends on the count, not fixed thresholds:
   - columns = ceil(firms / 8), capped at 3, with single-line rows;
   - above that, page the panel with F9 sub-steps (for example `3/6 · 2/3`), or show the top 10 and bottom 10 plus a distribution bar;
   - ATTRIBUTION above 24 firms: show the 12 largest contributors to depletion and a "rest of market" line.
5. **Lobby.** Firm list in columns with member counts, so 50 firms and their join progress fit. Keep the code and QR code visible.
6. **Console.** Firms panel as a compact sortable table (scrolls inside the panel), with filters for "not committed" and "offline". Keep the F9 ADVANCE controls always visible, never scrolled away.
7. **PACT view and PACTS tab.** Member lists for pacts with 20 or more firms need truncation (`+14 more`). The POACH target picker on `#/play` needs a search field or a scrollable list with the ticker typed to filter, because 49 radio buttons will not fit on a phone.
8. **WIRE and ticker.** At 50 firms the engine may emit more headlines per quarter than the ticker shows. Check the headline priority list and the participants' WIRE tab for volume.
9. **Connection budget.** Every device holds a live connection. 50 firms with several devices each, plus the projector and console, may approach the free plan's simultaneous connection limit. I believe the Spark plan limit is 100 simultaneous connections, but that is from memory, not verified. Read the current Firebase documentation and report the real figure to the owner before the plan is finalised. If the limit is a risk, options are the Blaze plan, one device per firm, or fewer subscriptions per page (for example, participants no longer subscribe to every firm's public data).
10. **Reads per page.** Participants subscribe to `firms`, `firmsPublic` and `rounds`. At 50 firms check payload size per quarter and whether `rounds/{r}` can be split so phones download only their own rows.

**Tests to add.**
- Layout checks parametrised by firm count (17, 24, 32, 40, 50) on the board, lobby, console and all six results panels at 1280×720 and 1920×1080, using the existing clipping checks (`checkProjector`). Seed the database with synthetic results through the admin write path so these run in seconds rather than as full sessions.
- A 14-quarter run with 50 bot clients (`npm run bots -- --firms 49`) plus one human, in the style of `scripts/e2e-rehearsal.ts`. Record the time each resolution takes and the size of the largest write.
- Unit tests for the paging and column rules (pure functions, so they can be tested without a browser).
- Rules tests if `MAX_FIRMS` is enforced in the rules (it is not today; decide whether it should be).
- A phone check at 360×640 with 49 POACH targets.

**Acceptance.** No clipped panel at 1280×720 or 1920×1080 for any firm count from 2 to the new maximum. Calibration passes at the new maximum. A 14-quarter rehearsal with the new maximum runs without errors. Phone screens stay usable at 360×640. The pull request states, in plain English, the connection limit that applies and the facilitator-visible changes (paging, new commands).

---

# Interface redesign (Sessions 11–15)

Added after the UI audit of 2 and 3 October 2026. The audit is saved in this repository at `docs/ui-audit/index.html` (open it in a browser, or read the HTML source: every mock-up is drawn by the script at the bottom of the file, and its layout and labels are the reference). The owner approved all of it on 3 October 2026, including the five decisions in its section 11.

**Goal for every session.** Each screen must be understood without the facilitator explaining it. Someone who missed the briefing must be able to tell, within a few seconds, what is happening, what it means for them and what to do next. Judge every change against this, not only against looks.

**Rules for Sessions 11–15.**
- Each session updates the spec sections it changes before changing code, and logs each change in docs/PROGRESS.md as "spec change approved by the owner on 2026-10-03 (UI audit)". After each session the spec and the code must agree.
- Keep the terminal identity: one monospace face, square corners, flat fills, 1 px rules, ▲/▼ with every coloured delta. `npm run lint:design` and `npm run lint:copy` must pass; the design linter forbids `box-shadow`, so draw underlines and selection bars with borders.
- Hidden values never reach the projector or phones. No chart on `#/screen` or `#/play` may receive τ, even as an unused prop. τ is drawn only on the results trust trace when the "Reveal threshold" setting is on.
- Layouts must work for every firm count the code supports (`MAX_FIRMS`). If Session 10 has run, keep its paging and column rules and build on them.
- Before opening the pull request, run `npm run test:e2e` and `npm run test:e2e:rehearsal`, look at the screenshots of every screen the session changed, and list in the pull request what the owner should look at on the live site.

**Order.** Run 11, 12, 13, 14, 15 in that order. Session 11 does not depend on Session 10. Sessions 12–15 change the board, results and console layouts that Session 10 also changes, so run Session 10 first if it is going ahead.

---

## Session 11 — Chart foundation and results defects (model: Opus 5.5)

Read docs/spec.md §10, §14.1, §14.3, §14.4 and §16; docs/ui-audit/index.html sections 02, 05, 07 and 11; docs/PROGRESS.md.

**Why.** The charts are bare stepped strokes whose labels do not line up with the data, and three results panels are blank or misleading when valuations are negative (audit section 02, the three HIGH defects).

1. **Spec.** Update §16.3 and §16.4: `StepSparkline` is replaced by `LineChart` (below); a flat 45° hatch in a token colour is allowed between two compared series; `HBar` has a zero baseline. Update §10 and §14.4 with the negative-total display rules in step 6.
2. **Chart geometry module** `src/ui/chart.ts`, pure functions only: linear scales, "nice" tick values, the line path (straight segments between quarter points), year and quarter ticks, the change-per-quarter values, and label placement that keeps labels inside the plot and apart from each other.
3. **`LineChart` component** replacing `StepSparkline`:
   - one SVG with axes, ticks and labels drawn on the same scale as the data, sized from its container with a `ResizeObserver` (no more labels laid out beside the SVG);
   - horizontal gridlines only; value axis on the right; one tick per quarter, longer ticks and Y1, Y2… labels at year boundaries;
   - straight segments with a square marker at each quarter; quarters that lost 5 or more trust drawn as red markers; the largest drop labelled;
   - a solid tag at the end of the line carrying the latest value;
   - optional change strip under the plot: one bar per quarter from a zero line, green with ▲ for a rise, red with ▼ for a fall;
   - optional labelled horizontal reference line and labelled vertical marker; optional hatch between two series;
   - y domain is `trust` (always 0–100) or `zero` (always includes 0); never min-to-max of the data;
   - a series with one point shows the text "1 quarter resolved" instead of a line.
   Use the new token names from the audit only if Session 12 has already added them; otherwise use the current tokens.
4. **Replace every use of `StepSparkline`**: projector trust panel and `TRUST` view (change strip on, no τ), `FIRM` view (zero-based), results trust trace (τ line and hatched band below it only when revealed; moratorium as a labelled vertical marker), phone BOOK, and the kit.
5. **`HBar`**: draw from a visible zero line; negative values extend left in the down colour with a − sign.
6. **Results panels 1, 3 and 4** (follow the audit mock-ups):
   - FINAL BOARD: a dumbbell per firm from peak (hollow square) to final (solid square) on one axis that includes zero; final value and drop from peak on the right; final values below zero in red.
   - COUNTERFACTUAL: three headline figures (industry value, alternative, value lost); the trust chart with both lines labelled at their ends and the gap hatched; per-firm comparison on a zero-based axis.
   - ATTRIBUTION: a butterfly chart, share of damage extending left in red and share of value extending right in amber, ticker in the middle, values at the bar ends.
   - Negative totals (decision 5): keep the engine definitions. Show the value-destroyed percentage only when the actual industry total is positive; otherwise the sub-label reads "industry finished below zero". If the actual total exceeds the alternative, label the figure VALUE ADDED with ▲. When no firm finishes above zero, the value side of ATTRIBUTION shows the single line "No firm finished with positive value" instead of 0.0% bars.
   - Remove the abbreviations SUST, ACT and DEPL; label series on the chart instead.

**Tests.** Unit tests for every function in `src/ui/chart.ts` (scales, ticks including a domain that crosses zero, path, change values, one-point series). Results model tests for negative valuations, a negative industry total, actual above the alternative, and no firm above zero. A test that the projector trust components are never given τ. Replace `tests/ui/sparkline.test.ts`.

**Acceptance.** In the rehearsal screenshots every results panel shows visible marks, including when every final valuation is negative. Chart labels sit on the values they name at 1280×720 and 1920×1080. No chart line stops short of its axis.

---

## Session 12 — Colour, chrome and screen-level clarity (model: Sonnet 5.5)

Read docs/spec.md §14, §15 and §16; docs/ui-audit/index.html sections 01, 03, 04, 09 and 10; docs/REVIEW.md L7.

**Why.** Amber fills every bar and key, so nothing stands out; panels are almost invisible against black; and the projector uses abbreviations the room cannot decode.

1. **Spec.** Update §16.1 (token table and top bar) and §16.2 (labels: full words in uppercase are allowed where a mnemonic would need explaining, which also settles REVIEW L7). Re-check WCAG AA for `--dim` on `--panel` and record the ratios.
2. **Tokens v2** in `src/ui/tokens.css`: `--panel #1C1B14`, `--rule #3A3729`, `--dim #9A947C`, and new `--raise #24231B` (header rows, alternate rows, selection), `--grid #2A2820` (gridlines, row rules) and `--signal-dim #8A6400` (outlines, hatches, inactive key caps). Adjust lit-room values so they stay brighter than the new base values.
3. **Amber budget.** Solid amber only for the brand block, the one primary action on screen, the selected option, the countdown, the trust numeral and the reveal invert. Pact tags and other amber marks become amber text or `--signal-dim` outlines.
4. **Top bar** on projector, results and phone: dark `--panel` bar with a 2 px amber bottom rule; brand block in solid amber; the phase as a coloured status block (each phase distinct, always with its word); the countdown large and right-aligned. The command line is visible only while the facilitator is typing.
5. **Status sentence** under the projector top bar, written from the phase, e.g. "Q3 Y2 · Decisions open. Set pace, safety and a card, then commit. 1:42 left." Write one sentence per phase and check each with `lint:copy`.
6. **Reveal headline.** During reveal the status line summarises the quarter from the data, e.g. "Q3 Y2 resolved · Trust ▼5.9 to 45.6 · BTC takes 1st · 2 incidents."
7. **Board readability.** Row rules and alternate-row fill; panel titles in `--text` at weight 600; column headers in `--dim` on a `--raise` header row; full-word column headers where width allows (CHANGE, PACE, SAFETY, EXPOSURE, COMMITTED). Keep the tag key, as a one-line strip at the foot of the board listing only the tags on screen.
8. **Trust panel copy.** Subtitle "Total market revenue tracks public trust." (existing briefing copy); "QoQ" becomes "since last quarter"; `DISCL` becomes `DISCLOSURE` everywhere.
9. **F-key bar.** Outlined key caps; the next expected action as the one solid key; keys that do nothing on the current screen are hidden (results shows only F9 and F2).
10. **Ticker.** 2ch gap after the label; each item prefixed with its quarter; coloured by headline kind with ▼ for incidents and breaches.
11. **Notices and banners.** Notices get half-line vertical padding and a 2 px left rule coloured by kind instead of a full box. The summit banner uses a colour distinct from the top bar.
12. **Lobby.** Number the join steps: 1 scan or enter the code, 2 form or join a firm, 3 wait for the briefing.

**Tests.** Update the contrast test for the new tokens. Unit tests for the status sentence and reveal headline builders (every phase; ties; no incidents). Layout checks still pass at every supported firm count.

**Acceptance.** On the board screenshot, solid amber appears only on the brand block, the primary key, the countdown and the trust numeral. Every projector label is a word or is explained by the key strip.

---

## Session 13 — Firm performance views (model: Opus 5.5)

Read docs/spec.md §14.1, §14.2, §14.3 and §16; docs/ui-audit/index.html section 06.

**Why.** Firm performance is a column of numbers. Four views make it readable at a glance.

1. **Spec.** Add the new components and the `FIRMS` and `RANKS` commands to §14 and §16.3, and to the HELP screen.
2. **Board.** Market value share strip across the top of the board (cyan segments faded by rank, ticker and percentage printed in each segment wide enough to hold them, firms below zero counted in the caption). Per row: rank, places gained or lost since last quarter (▲/▼ with a number), ticker, a valuation bar drawn from zero (negative bars red to the left), value, change, and a 14-quarter trend line on a scale shared by all rows.
3. **`FIRMS` view.** Small multiples: one card per firm with rank, ticker, value, change and a line chart; every card on the same y-scale with a dotted zero line and a hollow square at the peak. 3 × 3 up to 9 firms, 4 × 4 up to 16; follow Session 10's rules above that.
4. **`RANKS` view.** Rank by quarter as connected lines. Highlight two firms automatically: the current leader in amber and the firm with the largest fall from its best rank in red. Other firms dim, labels at the line ends, a headline sentence such as "HUMN rose to 1st. BTC fell from 1st to 2nd." Ties broken by ticker so the chart is deterministic.
5. **Phone BOOK.** "You against the field": every other firm as a thin dim line, your firm in amber with its value tag, a dotted zero line, and a sentence such as "Rank 1 of 9. Highest valuation for 13 quarters running." Phones already receive every firm's public valuation; confirm this and confirm no private data is used.

**Tests.** Unit tests for rank-by-quarter (ties), rank movement, largest-faller selection, share-strip segment widths (sum to 1, negatives excluded) and the BOOK sentence. Layout checks for the board, `FIRMS` and `RANKS` at every supported firm count.

**Acceptance.** From the board screenshot alone, a reader can name the leader, the biggest mover this quarter and any firm below zero.

---

## Session 14 — Results narrative (model: Sonnet 5.5)

Read docs/spec.md §10, §14.4 and §15.5; docs/ui-audit/index.html sections 07 and 09.

**Why.** After Session 11 the results charts are correct, but the room still needs the facilitator to say what each panel shows.

1. **Spec.** Update §14.4 with the panel headlines and the pact quarter strip.
2. **Headlines.** Each results panel opens with one sentence written from the data, for example: "8 of 9 firms finished below their peak. 2 finished below zero."; "Trust fell from 72.0 to 45.6 over 14 quarters."; "Holding pace 2 and safety 15 would have left the industry worth 3.2× what it kept."; "HUMN caused 24.8% of the damage and kept 29.9% of the value." Write a builder per panel with careful wording for edge cases (no moratorium, no pacts, ties, negative totals).
3. **Pact record.** Under the table, one row of quarter cells per member: solid red for a detected breach, red outline for an undetected breach, a dim dot for a compliant quarter, blank before the firm joined. If `FinalResults` does not hold breaches by quarter, add them in `buildResults` (keep it deterministic and add engine tests), and confirm with the owner before changing anything the participant results card reads.
4. **Fill the screen.** Size every results panel to use the projector height; no panel uses only a third of the screen.
5. **Participant results card.** Opens with one sentence ("You finished 2nd of 9, 12.5% below your peak."), then the figures; damage and value shares shown as two short bars.

**Tests.** Unit tests for every headline builder and its edge cases; engine tests if `buildResults` changes; the rehearsal screenshots for all six panels.

**Acceptance.** Each results panel's main point can be read from its headline alone.

---

## Session 15 — Phone and plain pages (model: Sonnet 5.5)

Read docs/spec.md §3, §14.2, §14.3 and §16.6; docs/ui-audit/index.html sections 08, 09 and 10; docs/REVIEW.md L8.

**Why.** On the phone the countdown is small, cost and risk sit below the commit button, and first-time players get no picture of how a quarter works.

1. **Spec.** Update §14.3 with the decision ticket, commit status bar, result sentence and three-step strip.
2. **Header.** The countdown is the largest element, right-aligned.
3. **DESK.** Selected pace option shown as raised fill with an amber bottom border instead of a solid amber block. SAFETY label reads "SAFETY · share of reference budget" with 0% and 30% at the ends. The selected card's one-line effect (already in `CARD_INFO`) shown under the card name. Cost and exposure grouped in a bordered decision ticket directly above COMMIT, with exposure as a four-step meter plus the word; on a 360×640 screen the ticket and COMMIT are visible together (settles REVIEW L8). The rules paragraph under CARD moves into the card sheet.
4. **Commit state.** After committing, COMMIT becomes a full-width status bar: "COMMITTED 14:02:31 · edit until close", with "changes not committed" when the draft differs.
5. **Tabs.** Active tab shown with an amber top border and amber text instead of a solid block.
6. **Quarter result.** Opens with one sentence ("You ranked 2nd of 9, ▲1. Profit 57.7."), then the figures, then notices with coloured left rules.
7. **Three-step strip.** In lobby, briefing and quarter 1: DECIDE → COMMIT → REVEAL, one line each.
8. **Summit.** Remove the duplicate notice under the banner; show pact terms as "pace ≤ 2 · safety ≥ 15%".
9. **Landing and join.** "FRONTIER" as a wordmark with the Office of Frontier Systems line beneath; a four-cell code field; the button the same width as the field.
10. **Control console.** Group buttons by consequence: routine (timer), session flow (F8, F9) and irreversible (END, TAU), with the irreversible group outlined in red; a "NEXT" line naming the expected key; firm presence as a row of dots.

**Tests.** Phone screenshots at 360×640, 390×844 and 1440×900 for every DESK state; a check that the ticket and COMMIT are both inside the viewport at 360×640; unit tests for the result sentence.

**Acceptance.** A first-time participant can commit a decision without asking, and can see whether it was committed and how much time is left without scrolling.

---

# Recalibration (Session 16)

Added after Session 10 at the owner's request (2026-10-04). Run it **after Sessions 11–15** (the interface redesign), so the debrief screens it affects are final.

## Session 16 — Earlier moratorium under greedy play (model: Opus 5.5)

Read docs/spec.md §5, §6, §7, §8, §10 and §15.4; docs/CALIBRATION.md (all entries, especially Session 10); docs/REVIEW.md M1–M3; `reports/calibration.md`. Present a detailed plan first and wait for "go".

**Why.** The moratorium must arrive within a normal session when a large part of the room plays greedily, at every class size. Session 10 found that it does not. The §8.2 diagnostic "half greedy, half sustainable" gives a moratorium by quarter 14 in these shares of seeds:

| N | 4 | 8 | 12 | 20 | 30 | 50 |
|---|---|---|---|---|---|---|
| by quarter 14 | 34.5% | 26.0% | 21.5% | 10.5% | 5.0% | 2.5% |

The owner finds both 2.5% at N = 50 and 21.5% at N = 12 unacceptably low.

**Likely causes (to confirm, not assume).**
1. The 8/N factor (§6.3 steps 4 and 5) makes total draw depend on the share of greedy firms. A half-greedy room draws about halfway between the sustainable and greedy rooms, and logistic regeneration (R = 0.25) nearly offsets it.
2. Incident losses are independent per firm and scaled by 8/N, so their variance falls as N grows. Small rooms reach τ partly by chance; large rooms follow the average path and rarely do.

**First question to ask the owner (one question, before the plan).** What is the target for the half-greedy room? Proposed new condition **C5** for every N from 4 to 50: a moratorium by quarter 14 in at least 80% of seeds, with the median moratorium quarter at 11 or earlier. The owner may choose different numbers; use theirs.

**Constraints that still hold.**
- **C1:** the all-greedy median moratorium quarter stays within 5–9, so greedy rooms do not collapse before anyone can react.
- **C2:** sustainable rooms never collapse.
- **C3:** greed still pays for one firm alone.
- **C4:** one greedy firm alone cannot trigger the moratorium.

Tightening the model makes REVIEW M1 (one firm can trigger the moratorium at N ≤ 4) worse. If C4 cannot hold at N = 4 together with C5, stop and ask the owner whether C4 should apply from N = 6 (the runbook already recommends at least 6 firms).

**Steps.**
1. **Add C5 to the spec** (§8.1) with the owner's numbers, and to `tools/calibration/scenarios.ts`, `tools/calibrate.ts` and `tests/engine/calibration.test.ts`. Also report the share of seeds with a moratorium by quarter 10, 12 and 14 for rooms with a quarter, a third, half and two thirds of firms greedy, at every N.
2. **Tune parameters only, in the §8.3 order** (R, DRAW, INC_TRUST, COMPUTE_COST, CAP_GAIN, γ). Options to try first:
   - lower R
   - make DRAW steeper between pace 2 and paces 3–4, so a mixed room out-draws regeneration while one greedy firm in a large room stays small.
   Run 200 seeds per change and log each attempt, kept or not, in `docs/CALIBRATION.md` with before and after tables.
3. **If no parameter set passes C1–C5 at every N,** stop and explain the structural options to the owner in plain English before changing the engine. For example, an industry-wide incident shock whose size does not shrink with N, or a regeneration rate that weakens as trust falls. Any engine change is a spec deviation that needs the owner's approval, with engine unit tests and the property tests (T in [0, 100], shares sum to 1, determinism, identical counterfactual draws).
4. **Re-run and update everything that depends on the parameters:**
   - `npm run calibrate -- --seeds 200` and the 500-seed report
   - `tools/audit-strategies.ts`; check that no dominant strategy appears, and record M1–M3 again
   - the rehearsal replica: `tests/tools/rehearsal-model.test.ts` expects the seed-5 moratorium in quarters 8–11; choose a new fixed seed if needed and update `scripts/e2e-rehearsal.ts` to match
   - `npm run test:e2e:rehearsal`, `test:e2e:long` and `test:e2e:scale-run`
   - the exposure label cutoffs (§6.5) if DRAW changes; keep each pace and safety combination on the label the spec intends, as Session 2 step 3 did
   - RUNBOOK sections 4 and 9 (the moratorium timing advice).

**Acceptance.**
- C1–C5 pass at N = 4, 6, 8, 10, 12, 16, 20, 30, 40 and 50 over 200 seeds, and the 500-seed run agrees.
- Every parameter change is logged in docs/CALIBRATION.md.
- All test suites pass.
- The pull request states, in plain English:
  - how early a half-greedy room now reaches the moratorium at 12 and at 50 firms
  - what changed for an all-sustainable room
  - whether M1 changed.

---

# Live-session feedback (Sessions 17–18)

Added on 2026-10-08 after four live sessions without bot firms. The evidence is in `reports/live-sessions-2026-10-08.md`. The owner's feedback from those sessions:
- show greedy play against play that benefits the whole market on the results screen
- make incidents clearer on the projector
- give the facilitator a complete wire log
- add two new action cards.

**Order.** Run Session 17, then Session 18. Session 17 changes the engine, the parameters and the card set; Session 18's results panel counts the cards and uses the new parameters.

## Session 17 — Recalibration from live play and two new cards (model: Opus 5.5)

Read:
- `reports/live-sessions-2026-10-08.md` (all of it)
- docs/spec.md §5.2, §6.2–§6.5, §7, §8, §14.3, §14.5 and §15.4
- docs/CALIBRATION.md (the Session 16 entry)
- docs/REVIEW.md M1–M3.

**Why.**
- **No moratorium.** None of the four live rooms reached it. The closest finished 14 trust points above τ.
- **Cause.** The report traces this to two parameters:
  - PUBLISH adds +1.0 trust per card, not scaled by 8/N, and no calibration policy plays it.
  - Safety removes up to 60% of a firm's draw, and students pair high pace with moderate safety.
- **Effect.** Replaying the students' own decisions under the current parameters gives a moratorium by quarter 14 in 0–13% of seeds.

**Owner decisions already made (2026-10-08).**
- **PUBLISH is weakened, but less than the report's S2.** Its trust effect falls. It must still count strongly on the results recalculation, which Session 18 handles with a separate research credit.
- **Proposed set S7:**
  - PUBLISH_TRUST 1.0 → 0.25, and the PUBLISH term in §6.3 step 6 becomes PUBLISH_TRUST × 8/N per card: 0.25 per card at 8 firms, 0.2 at 10, 0.5 at 4.
  - SAFETY_DRAW_EFF 0.6 → 0.35.
  - LOBBY_TRUST stays 0.5, unscaled.
- **S7 against the current values** (200 seeds; M1 500 seeds):

| | Current | S7 |
|---|---|---|
| Observed-human room, moratorium by quarter 14, N = 4 / 6 / 10 / 20 / 50 | 13% / 7% / 1% / 0% / 0% | 52% / 53% / 54% / 65% / 92% |
| Median moratorium quarter, N = 4–20 | none | 13–14 |
| C1–C5 | pass | pass at N = 4, 6, 10, 20, 50 |
| C1 by quarter 4 (limit 50%) | 26–36% | 39–44% |
| M1 at N = 4 by quarter 14 | 22–31% | 29–41% |

**Two new cards (proposed 2026-10-08; owner to confirm or change at the start of the session).** The costs and effects are starting values; the card dominance check and the strategy audit decide whether they stand.

| Card | Cost (cash) | Effect | Constraint | Conduct ledger |
|---|---|---|---|---|
| `SHARE` Share safety tooling | 15 | Every firm's incident probability, yours included, ×0.75 this quarter (§6.3 step 5; stacks with PUBLISH) | Not in consecutive quarters | For the market |
| `RUSH` Rush a release | 0 | You +4 capability this quarter (step 3, before POACH). Your trust draw d_i ×2 and your incident probability ×1.5 this quarter (steps 4 and 5) | Not in consecutive quarters | Against the market |

- **Why these two.** The live sessions had cards for racing (BLITZ, POACH) and one for the market (PUBLISH). Neither new card tests what the lesson needs:
  - `SHARE` is a public good. The firm pays the full cost, and every other firm gets the same protection for free. It tests free-riding (§1 objective 2).
  - `RUSH` is a free private gain whose cost lands on public trust. It is the externality in its plainest form.
- **Headlines (§15.4):**
  - `SHARE`: "{FIRM} releases safety tooling to the industry"
  - `RUSH`: "{FIRM} ships model ahead of evaluation schedule".
  Both follow §15.3: no banned words before the results screen.
- **Effect on the calibration checks.** Neither card changes C1–C5, because no bot plays them. Check them with the card dominance diagnostic and `tools/audit-strategies.ts`:
  - `RUSH` is most at risk of dominating
  - `SHARE` is most at risk of never being worth playing.
- **If either fails,** ask the owner before changing the cost or effect.

**Questions to ask the owner, one at a time, before the plan.** First, confirm S7 or name another set from the report or the table above. Then confirm or change `SHARE`, then `RUSH`.

### Steps

1. **Spec, before code.** Log each change in docs/PROGRESS.md as an owner-approved spec change.
   - §5.2: the two new cards, and PUBLISH's new effect wording ("public trust +0.25 per card, scaled by firm count").
   - §6.2: the new values.
   - §6.3 step 6: the PUBLISH term scaled by 8/N, plus each new card's step in the resolution order.
   - §6.6 and §14.5: the briefing line for each new card. The briefing still shows no parameter numbers.
   - §8.2: the observed-human room diagnostic. If the owner sets a target for it, add it to §8.1 as C6 instead.
   - §15.4: a wire headline per new card, in the same register.
2. **Engine and cards:**
   - `src/engine/types.ts` (`CARDS`), `cards.ts`, `resolve.ts`, `headlines.ts` and `params.ts` (costs and effects).
   - `validateCard`: the cooldown and any target rule.
   - The DATA line card field.
   - The database rules' card enum, with rules tests for both new cards.
   - The phone card sheet and `CARD_INFO`.
   - The briefing.
   - The bot policies are unchanged unless the owner asks.
3. **Observed-human room** in `tools/calibration/scenarios.ts` and `tools/calibrate.ts`:
   - Data: `tools/calibration/observed-human.json` holds 37 anonymised firm trajectories from the live sessions, as `pace,safety,card,auto` per quarter.
   - For each seed, draw N trajectories with replacement using a seeded generator, and play them for 30 quarters. A trajectory shorter than 30 quarters repeats its last 5 quarters. A POACH target is a seeded random other firm.
   - Report the share of seeds with a moratorium by quarters 12, 14 and 20, and the median moratorium quarter, at every N.
   - Under S7 the result should match the table above within sampling noise.
   - The new cards do not appear in the live data. Note in the report that the scenario cannot measure them.
4. **Parameters** in `src/engine/params.ts`. Re-derive EXPO_CUTS so each pace keeps the label the spec intends (as in Sessions 2 and 16); the safety change moves d_i at every safety level above 0.
5. **Re-run and log:**
   - `npm run calibrate -- --seeds 200`, then 500 seeds. C1–C5 must pass at every N.
   - Watch C1 by quarter 4: S7 measured 39–44%, against the limit of 50%.
   - The card dominance check (§8.2) with the new cards. No card may exceed 60% of best-response rounds.
   - `tools/audit-strategies.ts`, including strategies that use the new cards. Re-measure M1–M3.
   - The rehearsal seed and `tests/tools/rehearsal-model.test.ts`.
   - RUNBOOK §4 and §9.
   - Record every attempt in docs/CALIBRATION.md with before and after tables. Note that PUBLISH_TRUST and SAFETY_DRAW_EFF are outside the §8.3 order, with the owner's approval and the reason: the §8.3 levers move bots and human rooms together, and C1 binds.
6. **If a new card breaks C1–C5 or dominates the card choice,** stop and explain in plain English what fails and the smallest change to the card that would fix it. Do not tune the card without the owner's approval.

**Tests.**
- **Engine:** each new card's effect, cooldown and constraint; insolvent firms cannot play it; determinism.
- **Properties:** T in [0, 100], shares sum to 1, the counterfactual uses identical incident draws.
- **PUBLISH:** the 8/N scaling in `cardTrustDelta`.
- **Labels:** updated EXPO_CUTS tests.
- **Observed-human room:** determinism, a trajectory longer than 30 quarters, and the cycling of a short trajectory.
- **Rules:** tests for the card enum.
- **Phone:** card sheet screenshots at 360×640.
- **Suites:** `npm run typecheck`, `npm test`, `npm run test:rules`, `lint:copy`, `lint:design`, `test:e2e`, `test:e2e:rehearsal`, `test:e2e:long` and `test:e2e:scale-run` all pass.

**Acceptance.**
- C1–C5 pass at every N over 200 seeds, and the 500-seed run agrees.
- No card exceeds 60% in the dominance check.
- The observed-human room's moratorium share by quarter 14 is reported at every N.
- **Pull request.** States, in plain English:
  - the parameter values used
  - what changed for a class like the four live rooms
  - what each new card does, as a participant sees it
  - whether M1 changed.

## Session 18 — Incidents, facilitator wire, net contribution (model: Opus 5.5)

Run after Session 17. Read:
- `reports/live-sessions-2026-10-08.md` §2 (F6–F8)
- docs/spec.md §3, §5.2, §6.3, §6.5, §10, §12, §13, §14.1, §14.2, §14.4, §15 and §16.5
- the Session 17 entry in docs/PROGRESS.md.

**Why.**
- **Incidents.** They are easy to miss. An incident appears only as one of 2–4 headlines, and the headline cap can drop it.
- **Wire log.** The facilitator has no complete wire log. The projector `WIRE` view shows the latest 14 items.
- **Results.** The results screen ranks firms only by their own valuation. Nothing shows what each firm's decisions did to everyone else.

**Owner decisions.** Ask them one at a time, in this order, before presenting the plan.

1. **Incident cause when disclosure is off.** A firm's pace and safety are private while disclosure is off (§6.5). Recommended: with disclosure on, show the firm's pace, safety and incident risk. With disclosure off, show the firm, the effect, and the general cause ("Incident risk rises with pace and falls with safety spend."). The alternative is to always show pace and safety for a firm that had an incident; this is a §6.5 change. Also ask whether the projector may show each incident's trust cost as a number, which reveals INC_TRUST × 8/N.
2. **Research credit for PUBLISH.** Proposed: RESEARCH_CREDIT = 1.0 trust-point equivalents per PUBLISH card, × 8/N, priced like any trust point (Part C).
   - That is 4 times PUBLISH's real trust effect after Session 17, and equal to its effect before Session 17.
   - It is not money. It appears on the results screen only and never changes the engine.
   - Ask the owner for the number, and whether `SHARE` also earns a research credit. Proposed: no, because its benefit is already valued in Part C.
3. **Net contribution method.** Confirm the method in Part C, its baseline (the ALTERNATIVE policy of §10), that BLITZ counts as rivalry alongside POACH, and where each new card sits on the conduct ledger.

### Part A — Incidents on the projector

1. **Spec:** update §12 (`rounds/{r}/incidentFirms`), §14.1 (the incident block, the `INCID` tag and the `INCID` command), §15.4 (incident cause lines) and §16.5. The incident block appears instantly when the reveal sequence ends; there is no new motion.
2. **Engine:** add `incidentFirms: string[]` (firm ids, creation order) to `RoundRecord` and to the public `rounds/{r}` write in the orchestrator.
   - Do not change `roundHeadlines`. The block is built from `incidentFirms`, so it never depends on the headline cap, and the headline random draws stay unchanged.
   - Check whether `database.rules.json` validates the `rounds` node. Add a rules test that a participant cannot write it.
3. **Projector, reveal state.** One line per incident in an `INCIDENTS` block:
   - ▼, the ticker and the incident's wire headline (or the first incident template when it was not headlined)
   - the effect: "trust −1.2 · BTC revenue −15% this quarter" (the trust number only if the owner allows it)
   - the cause, as decided in owner decision 1.
   Requirements:
   - With disclosure on, the cause comes from `rounds/{r}/disclosure` (pace, safety, exposure) and the incident probability formula in §6.3 step 5, including PUBLISH halving.
   - It must fit at 1280×720 without moving the board rows. Show at most 4 lines, then "+N more · INCID for the full list".
   - With no incidents, show nothing.
4. **Board tag** `INCID` on the firm's row for the reveal and the following open phase, in the tag priority order after `BREACH`.
5. **`INCID` command** (and HELP): every incident of the session by quarter, with the same three parts. Esc returns to the board.
6. **Phones** are unchanged; the firm already receives its own incident notice. No τ, no other firm's cash, and no pace or safety while disclosure is off (unless owner decision 1 allows it) reach the projector.

### Part B — Facilitator wire screen

1. **Spec:** §3 (route) and §14.2. Add a facilitator-only route `#/wire`, behind the facilitator gate, linked from `#/control`. It works on a second laptop or tab while `#/control` stays open.
2. **Content:**
   - every wire entry of the session, grouped by quarter, newest quarter first:
     - round headlines from `rounds/{r}/headlines`
     - pact and disclosure events from `wire`
     - entries before quarter 1 under `PRE`
   - each line: quarter, time, kind and text, coloured by kind as on the ticker.
3. **Quarter selector:**
   - ◀ ▶ buttons and the arrow keys
   - a quarter number field
   - `ALL`
   - The selector opens on the current quarter, and every earlier quarter stays available.
4. **Below the quarter's entries:** a facilitator-only section, "NOT ON THE WIRE". It lists that quarter's events that the headline cap left out (incidents, cards played, audits, insolvencies), built from `engine.history`. It is never rendered on `#/screen` or `#/play`; add a test for that.
5. **`COPY` button:** copies the selected quarter (or all) as plain text, for the debrief.
6. **Scale:** with 50 firms and 30 quarters, the list scrolls inside the panel and stays responsive. Check with the `test:e2e:scale-run` data.

### Part C — NET CONTRIBUTION results panel

1. **Spec:**
   - §10: the definitions below.
   - §14.4: the new panel 5, NET CONTRIBUTION, after ATTRIBUTION. PACT RECORD and DEBRIEF become 6 and 7.
   - §15: the panel copy. The results screen may use the §15.3 words; nothing before it may.
   - Add RESEARCH_CREDIT to `params.ts` as a display-only value, logged in docs/CALIBRATION.md like EXPO_CUTS.
2. **Definitions** (computed in `buildResults`, pure and deterministic, from the stored engine history, with no replays):
   - **Trust effect of firm i in quarter t (points).** The firm's own terms of the §6.3 step 6 update:
     − d_i × 8/N − (incident ? INC_TRUST × 8/N : 0) + PUBLISH term − LOBBY term, plus any trust term of the new cards.
     Subtract the same quantity for the ALTERNATIVE policy (pace 2, safety 15, no card), using its expected incident loss. This gives the firm's trust effect **against the alternative**:
     - positive for restraint and publishing
     - negative for racing and incidents.
   - **Value of one trust point in quarter t.** The whole market's revenue per trust point, γ × M_t / T_t, for every quarter from t to the end: × (quarters played − t + 1). Use M_t as resolved; after a moratorium it already includes the moratorium multiplier.
   - **Market effect** of firm i = Σ_t (trust effect × value of a trust point).
   - **Research credit** of firm i = Σ over its PUBLISH quarters of RESEARCH_CREDIT × 8/N × the value of a trust point in that quarter. It is shown separately and labelled as not money.
   - **Moratorium cost**, if the moratorium happened. Three parts, from the stored history:
     - the market revenue lost to the moratorium multiplier in the quarters after it
     - the cash haircut
     - the capability writedown.
     Allocate it to firms with a negative cumulative market effect up to the moratorium quarter, in proportion to that negative effect. Subtract each firm's allocation from its market effect.
   - **Rivalry taken.** Value moved from other firms by the firm's own cards:
     - BLITZ: the firm's revenue that quarter minus its revenue without the BLITZ multiplier (shares recomputed exactly).
     - POACH: POACH_LOSS × CAP_MULT × T_final / 100 for each completed POACH.
     - RUSH: the capability it added, × CAP_MULT × T_final / 100 (permanent share gained against rivals). Its extra draw and incident risk are already in the market effect.
   - **SHARE benefit.** The trust loss SHARE saved the other firms in expectation: Σ over other firms j of q_j × 0.25 × INC_TRUST × 8/N, × the value of a trust point that quarter. Here q_j is j's incident probability before the SHARE multiplier. It is added to the market effect: the firm's own trust terms cannot show it, because the benefit lands on other firms.
   - **Value created** = final valuation + max(0, market effect) + research credit.
   - **Damage created** = max(0, −market effect) + rivalry taken.
   - **Net contribution** = final valuation + market effect + research credit − rivalry taken. Rank firms by net contribution, with the engine's tie-break.
   - **Conduct ledger**, counted per firm and shown with the figures:
     - for the market: PUBLISH cards, restraint quarters (pace ≤ 2 and safety ≥ 15), and compliant quarters as a member of a pact with 2 or more members
     - against it: POACH and BLITZ cards, LOBBY cards, pact breaches (detected and undetected) and incidents
     - the new cards, placed as the owner decided.
3. **Why this method.** Before writing this session, both methods below were applied to the four live sessions.
   - **Rejected: per-firm replays.** Re-running the game with one firm switched to the alternative policy re-ranks strongly. But once a moratorium is near it is unstable: switching one firm can move the moratorium by a quarter and swing other firms' values by thousands.
   - **Chosen: the additive method above, without the research credit.** It gave similar rankings and stays stable.
   - **Effect on the live sessions.** In all four, the valuation leader fell to between 5th and 9th by net contribution. In RBZE, the firms ranked 8th and 9th by valuation rose to 1st and 2nd.
4. **Panel layout:**
   - A slope chart from valuation rank (left) to net-contribution rank (right). Firms whose rank changes by 3 or more places are highlighted: ▲ in `--up`, ▼ in `--down`. The others are dim.
   - Beside it, per firm, on one zero-based axis:
     - final valuation
     - the market effect (▲ or ▼ with a sign)
     - research credit (with its own label, never merged into valuation)
     - rivalry taken (with a − sign)
     - net contribution.
   - Under each firm, its conduct ledger as short counts, for example "PUBLISH 6 · restraint 9 · POACH 2 · BLITZ 3 · breaches 1".
   - The negative-total and many-firms rules follow ATTRIBUTION (§14.4): 24 rows, then `OTHERS`.
5. **Headline sentence**, written from the data and checked with `lint:copy`. For example: "Ranked by value created for the whole market, HUMN falls from 1st to 8th and ARCN rises from 9th to 2nd."
   - Edge cases: no rank changes, ties, every net contribution below zero, and a moratorium.
6. **Participant results card:** add the firm's net contribution, its rank by net contribution, its research credit and its conduct ledger.
7. **Debrief:** in §15.5 prompt 3, refer to the new panel. Ask the owner for the exact wording.

**Tests.**
- **Part A:**
  - `incidentFirms` is in creation order and empty with no incidents
  - the incident line builder, with disclosure on and off; with disclosure off, the output contains no pace or safety
  - the 4-line cap with `+N more`
  - the `INCID` view
  - layout at 1280×720 and 1920×1080 for 4, 16 and 50 firms with 1 and with 8 incidents.
- **Part B:**
  - wire grouping by quarter
  - the "NOT ON THE WIRE" builder
  - a test that the projector and phone bundles never import it
  - an e2e check that `#/wire` refuses a non-facilitator.
- **Part C** (engine unit tests):
  - a firm on the ALTERNATIVE policy with no incident has a market effect of exactly 0
  - PUBLISH raises both the market effect and the research credit
  - BLITZ revenue taken equals the exact share difference
  - the moratorium allocation sums to the moratorium cost
  - determinism, ties, negative totals, and N = 2 and 50
  - the results model and headline builder edge cases
  - the rehearsal screenshots of all 7 results panels.
- **Suites:** `npm run typecheck`, `npm test`, `npm run test:rules`, `lint:copy`, `lint:design`, `test:e2e` and `test:e2e:rehearsal` all pass.

**Acceptance.**
- **Part A.** In the rehearsal screenshots, every incident of the reveal quarter is named on the projector with its effect and cause. Nothing private shows while disclosure is off.
- **Part B.** `#/wire` shows every wire entry of every quarter in the rehearsal, and refuses non-facilitators.
- **Part C.**
  - The panel's main point can be read from its headline alone.
  - An observed-human room (fixture, seed 1, N = 10) run through the new builder gives a net-contribution ranking that differs from the valuation ranking.
  - The live exports are not in the repository, so the figures in Part C step 3 cannot be re-run here.
- **Pull request.** States, in plain English:
  - what the projector now shows when an incident happens
  - how to open the wire screen (exact URL and clicks)
  - what the new results panel shows, and how the research credit is labelled
  - what the owner should look at on the live site.

**Commits.** Commit each part separately, in the order A, B, C.
