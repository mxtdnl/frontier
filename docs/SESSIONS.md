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
