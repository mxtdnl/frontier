# Progress log

## 2026-10-01 — Session 1: scaffold, design system, static screens

**Done**
- Moved `spec.md`, `SESSIONS.md` and `PROGRESS.md` from the repository root into `docs/`, where CLAUDE.md expects them.
- Vite + React + strict TypeScript with a hash router; `base: './'`; single-file build (`dist/index.html`, about 387 kB, fonts inlined as woff2).
- All npm scripts from CLAUDE.md. `test:rules`, `calibrate` and `bots` exit with "not yet implemented". Added `typecheck`, `lint:copy`, `lint:design` and `shots`.
- `src/ui/tokens.css`, `grid.css` (character grid, `.lit-room`), IBM Plex Mono 400/500/600 latin, woff2 only.
- All §16.3 components, with a `#/kit` route showing each in all states and a "Simulate reveal" control.
- Static screens driven by `src/mock/fixtures.ts` (8 firms): `#/screen` (lobby, briefing, open, reveal, summit, disclosure on/off, plus TRST, PACT, WIRE, FIRM and HELP views), `#/play` (DESK, BOOK, PACTS, WIRE; open, committed, reveal, summit, ended), `#/control`, `#/new`, `#/results` (six panels, `?panel=1..6`).
- CommandLine and F-key bar: BOARD, TRST, PACT, WIRE, FIRM <TICKER>, HELP. Esc returns to the board. Every F-key has a Shift+letter alternative. F1, F5, F11 and F12 are never bound.
- Reveal motion per §16.5 (roll, 300 ms row swap, trust inversion at a fall of 5 or more; at most 1200 ms). Instant under `prefers-reduced-motion`; the ticker becomes a static list of 3 headlines.
- `lint:copy` (wired into `build`) and `lint:design` (no hex colours outside `tokens.css`, no gradients, shadows, blur or radius above 2 px).
- `.github/workflows/pages.yml`: typecheck, test and build on every push to `main`, then deploy `dist` to GitHub Pages.
- Playwright installed. The container's pre-installed Chromium is used through `executablePath`; no download was needed and nothing was blocked.
- `scripts/screenshots.ts` captures every screen and state at 360×640, 390×844, 1440×900 (participant) and 1280×720, 1920×1080 (projector), and fails on clipping, horizontal scroll, targets under 44 px, text under 14 px, console errors, outside network requests and animation under reduced motion. All checks pass. Screenshots were reviewed against §16.4 and the §16.2 grid.
- 47 Vitest tests: command parser, key map, reveal timing and roll, number formatting, step path, lint rules, WCAG AA contrast of every token pair (including lit-room `--dim`).

**Spec deviations (with reasons)**
1. The IBM Plex Mono subsets carry no ▲, ▼ or ✓ glyphs. These are drawn as CSS shapes (`Glyph.tsx`) so the single typeface rule holds. Δ, τ, ≤, ≥, →, │ and box-drawing characters are also absent; the board uses `CHG`, `TAU`, plain words and `|`.
2. Facilitator pages avoid the words "game" and "threshold" because `lint:copy` scans all of `src/screens` and only `Results` is exempt. Labels read "New session", "Delete session" and "Reveal TAU line on results screen" rather than the spec's wording.
3. `lint:copy` also scans `src/mock`, since fixture strings reach the UI. It scans `.ts` and `.tsx` only, not CSS.
4. `#/new` and `#/control` are reachable without sign-in in this static build. Auth arrives in Session 4.
5. Rows on `#/screen` are 2 lines tall so 12 firms still fit.

**Open issues**
- The QR code and join address use the current page URL; on GitHub Pages this becomes `https://mxtdnl.github.io/frontier/#/j/KXMT`.
- Pace cost, exposure and card costs in the mock are illustrative and live in `src/mock` only. The engine owns the real values from Session 2.
- Lighthouse accessibility has not been run yet (Session 8).
- No `!` check exists in `lint:copy` for exclamation marks in copy.

**Next steps**
- Session 2: engine and calibration.

## 2026-10-01 — Session 2: engine and calibration

**Done**
- `src/engine/` modules, all pure TypeScript: `types`, `params`, `rng`, `resolve`, `cards`, `pacts`, `headlines`, `counterfactual`, `policies`, `data`, and `index` for the public API.
  - None of them use Firebase, the DOM, `Date.now` or `Math.random`. A test enforces this.
- `createGame(settings, firms, seed)`:
  - draws τ ~ U[30, 40] and the end round once from the `setup` stream
  - stores both only in the engine state.
- `resolveRound(state, decisions, params)`:
  - follows steps 1–16 of §6.3 in order
  - returns `{state, outputs, dataLines}`
  - never changes its input.
- Randomness: `mulberry32(hash(seed, round, stream))`, with streams `setup`, `incident`, `headline`, `audit` and `bot`.
  - Every firm takes one incident draw and one bot draw per quarter, in creation order. Every pact takes one audit draw per quarter, in creation order. Draws therefore never shift between the actual run and the counterfactual.
- Pacts (§9.2, §9.3):
  - compliance checks and manual and automatic audits
  - graduated fines with a minimum of 10, and expulsion at the third detected violation
  - LOBBY waiver, BREACH flag and dissolution
  - disclosure snapshot.
- Headline engine with 57 templates (at least 40 required). Fictional entities only. A test checks every template against the copy rules.
  - Exported helpers produce the pact form, join and leave headlines and the disclosure headlines for Session 6.
- `runCounterfactual`, `attribution` and `compareIndustry` (§10). Bot policies `cautious`, `standard`, `greedy` and `mimic-leader`, plus an internal `sustainable` policy.
- Helpers for Session 5: `exposureOf`, `exposureLabel`, `estimatedCost`, `allowedCards` and `nextPactName`.
- Tests: 80 engine tests in 10 files, 127 including Session 1.
  - Each resolution step has its own tests.
  - Property tests over 84 random games, with random pacts, audits and disclosure toggles:
    - T stays within [0, 100]
    - shares sum to 1 ± 1e-9
    - the same seed gives identical output
    - the counterfactual's incident draws match the actual run's.
  - A 40-seed calibration smoke test guards C1–C4.
- `tools/calibrate.ts` (`npm run calibrate -- --seeds 200`) runs C1–C4 and every §8.2 diagnostic for N = 4, 6, 8, 10 and 12. It writes:
  - `reports/calibration.md`
  - a DATA-line sample in `reports/calibration-data.txt` (seed 1, N = 8, C1–C3).
  - Options: `--params` for overrides, `--json`, `--no-diagnostics` and `--data-all`.
- Calibration: C1–C4 pass for every N at 200 seeds, and again at 500 seeds. Changes are logged in `docs/CALIBRATION.md`:
  - R 0.16 → 0.25
  - DRAW × 1/8.

**Interpretations agreed with the owner before coding**
1. **C2 value test.** It compares quarter-14 valuations against C1 on the same seed. "≥ X% higher" is measured as (X − Y) / |Y|, because C1 valuations are negative. C3 uses the same rule. Both tests use the median across seeds.
2. **Counting audit findings.** One audit counts as one detected violation per firm, however many quarters it finds.
   - The audit still fines a firm that has since left the pact.
   - Expulsion applies only if the firm is still a member.
3. **Manual audits.** The facilitator queues them in `state.pendingAudits`, and they run at step 11 of the next resolution, together with automatic audits. This gives the LOBBY waiver ("the quarter of detection") a clear meaning.
4. **POACH target.** The target may not be the firm's previous POACH target.
5. **Live-event headlines.** Pact form, join and leave headlines and the disclosure headlines are exported functions for live events. Resolution produces 2–4 headlines in this priority:
   - moratorium start
   - moratorium continuing
   - final quarter
   - breach
   - clean audit
   - insolvency
   - incident
   - rank change
   - card
   - pace 4
   - trust band
   - general news as filler.
6. **Fines.** Fine = max(10, rate × cash after profit and loss).
7. **Mimic-leader bot.** It copies the previous rank-1 firm's pace only if the previous quarter's disclosure snapshot exists. Its safety is always 8.
8. **Attribution.** Value share counts negative valuations as 0.
9. **Exposure cutoffs.** They are scaled with DRAW. See the spec deviations below.
10. **Moratorium haircut.** It applies to positive cash only. Negative balances are unchanged (owner decision).

**Further implementation choices (spec silent; no mechanics added)**
- **Pact age.** A pact's age counts its creation quarter. A pact created in quarter r with fewer than 2 members is dissolved at the resolution of quarter r + 1.
- **BREACH flag.** `breachUntilRound = detection round + 1`. The board should show BREACH while `round ≤ breachUntilRound`, which covers 2 quarters.
- **Rank changes.** `rankDelta` is 0 in quarter 1. The rank headline names the largest climber and the firm it passed.
- **DATA lines.** `draw=` in DATA lines is the firm's actual trust draw d_i × 8/N. The disclosure snapshot's `expo` is d_i.
- **Counterfactual valuations.** Per-firm counterfactual valuations differ slightly because each firm keeps its own incident draws. `perFirm` reports the mean.
- **Card dominance diagnostic.** It uses a myopic best response: the card that maximises the firm's own valuation at the end of that quarter.

**Spec deviations (with reasons)**
1. **Exposure cutoffs.** `EXPO_CUTS` was scaled from [1.5, 3.5, 6] to [0.1875, 0.4375, 0.75] to match the DRAW calibration. Without this every decision would show LOW. Each pace and safety combination keeps the label the spec intended.
2. **Moratorium haircut.** The cash haircut skips negative cash (owner decision). The spec says every firm.

**Open issues**
- **Weak cards.** In the myopic card search, firms choose no card in about 87% of quarters. The 60% dominance check passes, but cards look weak under short-term valuation, and LOBBY is never chosen when no pact exists. Worth watching in Session 9's dominant-strategy search.
- **Stable rankings.** Leaderboard volatility in a mixed field is low: 0.07–1.15 firms change rank per quarter.
- **Large temptation.** One greedy firm ends at 4.5–5.3 times the others' median valuation. C3 passes by a wide margin, which may make defection very attractive in class.
- **DRAW scale.** After calibration, DRAW is exactly 1/8 of the spec values. This may mean the spec intended total draw to be the average d_i rather than 8 × the average. Behaviour is the same; owner confirmation is welcome.
- **Firebase arrays.** Engine state uses arrays for firms, pacts, history and headlines. Firebase drops empty arrays and objects, so Session 3's API layer must normalise them when reading back.

**Market behaviour (200 seeds per N)**
- **All firms greedy:** the moratorium comes in quarter 6 (median). 80% of games fall in quarters 4–8 (3–9 at N = 4), and every seed reaches one by quarter 12.
- **All firms restrained (pace 2, safety 15):** no moratorium in 30 quarters. Median valuation per firm at quarter 14 is about 845, against about −231 in the greedy field, where firms end in debt.
- **One greedy firm:** it does not cause a moratorium alone (1% of seeds at N = 4, 0% otherwise), and it ends at 4.5–5.3× the others' median valuation (5.3× at N = 4, 4.5× at N = 12).
- **Half greedy:** a moratorium by quarter 14 in 22–35% of seeds, and by quarter 30 in 72–74%.
- **Everyone keeps the defaults:** trust rises from 72 to about 85 and holds there.

**Next steps**
- Session 3: Firebase data layer and security rules.

## 2026-10-01 — Session 3: Firebase data layer and security rules

**Done**
- `firebase.json`: the rules file, plus the auth and database emulators. `.firebaserc`: project `frontier-sim`.
- `src/firebase/config.ts`: the web config, plus the emulator constants (project `demo-frontier`).
- `src/firebase/init.ts`: connects to the emulators when `VITE_USE_EMULATOR=1`.
- `src/firebase/paths.ts`: the only place paths are built.
  - It rejects any key containing `. $ # [ ] /`.
  - It rejects any join code that is not four letters A–Z without I or O.
- `src/firebase/schema.ts`:
  - typed shapes for every §12 node
  - normalisers that restore `null` fields, empty lists and empty maps, which Firebase drops on write
  - round-keyed maps that come back as arrays become maps again.
- `src/firebase/api.ts`: typed read, write and subscribe helpers for every §12 node.
  - The facilitator-only helpers are grouped under a FACILITATOR heading.
  - Founding a firm and creating a game with its code are each one multi-path update.
- `src/firebase/presence.ts`:
  - onDisconnect presence
  - a connected flag
  - the `/.info/serverTimeOffset` subscription
  - `serverNow` and `remainingMs` helpers.
- `src/state/` hooks:
  - `usePublic`, `useFirms`, `useFirmsPublic`, `useRounds` and `usePacts`
  - `useOwnMember`, `useOwnFirmPrivate` and `useOwnDecision`
  - `usePresence`, which publishes your own presence and reports the connected state
  - `useServerTimeOffset`.
  - No hook reads a facilitator-only node.
- `database.rules.json` implements every requirement in §13.
- Tests:
  - 98 rules tests in `tests/rules`.
  - 10 tests in `tests/emulator/api.test.ts`. They drive `api.ts` and `presence.ts` through the real Firebase SDK, the auth emulator and the real rules. This includes a full engine-state round trip that compares the raw stored value with the unit-test simulation.
  - 19 unit tests in `tests/firebase` cover paths, the read-back normalisers and the server-time helpers.
  - `npm test`: 146 passed. `npm run test:rules`: 108 passed. Typecheck, `lint:copy` and build pass.
- Mutation check: three rules were weakened by hand (deadline, PIN check, results phase). The rules tests failed in each case, and the rules were restored.

**Choices where the spec is silent (agreed with the owner before coding)**
1. **Ticker length.** The ticker follows §13 `^[A-Z]{3,6}$`. §12 says 4–6.
2. **Reading `members/{uid}`.** You can read your own entry and your teammates' entries, so §14.3 can show the committing device's label. You cannot read the list.
3. **Presence.** Anyone signed in can read `presence/{uid}/online`. Only the facilitator and the user themselves can read `lastSeen`.
4. **Join codes.**
   - Anyone signed in can read one code, but cannot list codes.
   - Only a facilitator can create a code, and only for a game they created.
   - Codes can be created or deleted, but never changed. This guarantees uniqueness: a combined game-and-code update fails if the code is taken, so Session 4 can retry with a new code.
   - `facilitators/{uid}` can be read only by that user, and never written from the app.
5. **Creating a game.** It is allowed only if the game does not exist and `meta/facilitatorUid` is the creator.
6. **Firms created by participants.**
   - `isBot` must be false and `createdAt` must equal the server time.
   - A firm and its PIN cannot be changed after creation.
7. **Pacts.**
   - Creating one requires the phase to be `open` or `summit`, the proposer firm as the only initial member, and `status` set to `active`.
   - Terms need `maxPace` and/or `minSafety`.
   - Joining stores the current round. Joining and leaving are allowed in any phase.
8. **The membership label** is optional, with a maximum of 12 characters.
9. **Decisions** are validated as §13 says. A POACH without a target is allowed; the engine already handles it.

**Spec deviations (with reasons)**
- **None in the data model.** The `engine` node stores the full engine state plus `params`, `rngNotes` and `cfCache`. §12 lists only some of those fields, but the orchestrator needs the full state.

**Environment notes**
- **The Firebase CLI ignores `NO_PROXY`.** It sends its own local request to the emulator (127.0.0.1) through the container's outbound proxy, which refuses it with "request blocked: no rule allows host 127.0.0.1". The proxy was not bypassed or changed. Instead:
  - `firebase.test.json` is an emulator-only config with no rules entry, so the CLI starts the emulators without loading rules.
  - The rules tests load `database.rules.json` themselves through `@firebase/rules-unit-testing`, into namespace `demo-frontier`.
  - `scripts/emulator-rules.ts` (`npm run emulators:rules`) loads the rules into `demo-frontier-default-rtdb`, the namespace the app's SDK uses. The emulator test and Session 4's Playwright runs need this.
  - The real `firebase.json` is unchanged and correct for the live project.
- The database emulator JAR downloaded without being blocked. Fetching the CLI's message of the day from `firebase-public.firebaseio.com` is blocked (403), and the CLI treats that as non-fatal.

**Open issues**
- **PIN guessing.** The rules cannot rate-limit writes, so a scripted client could try all 10,000 PINs while joins are open. Joins close at the end of the lobby, so the window is short. Session 9 should assess this (spec §13 relies on the PIN alone).
- **Dissolved pacts.** A firm can join a dissolved pact. The spec does not say whether this is allowed. The engine ignores it if the orchestrator copies only active pacts, which is a Session 4 decision.
- **Firm order.** The `order` written by a participant is only a display hint. The facilitator should assign engine order (incident-draw order) from `createdAt` when it creates the engine state (Session 4).
- **Public settings.** `meta.settings` holds only the public subset (timer, auto-resolve, reveal-threshold flag, lit-room). End mode, end range, seed and the audit probability stay in `engine`.
- **Pause and summit.** `public` has no field for the phase to return to after a summit, and none for the remaining time while paused. Session 4 must add them (§4, F8). The rules already refuse decisions outside `open`, and whenever the deadline is missing.
- **CI.** The rules tests are not run in the GitHub Pages workflow, because it has no Java or emulator.

**Next steps**
- Session 4: facilitator flows and round orchestration.
  - Use `createGameRecord`, `updateGame` with `rel` paths, and `toPactNode` when writing pacts.
  - Load rules with `npm run emulators:rules` before Playwright runs.

## 2026-10-02 — Session 4: facilitator flows and round orchestration

**Done**
- **Sign-in** (`src/firebase/auth.ts`, `src/screens/Auth/FacilitatorGate.tsx`): email and password, then the `/facilitators/{uid}` check. `#/new`, `#/screen/:id` and `#/control/:id` all sit behind it.
  - A wrong password gets a plain explanation.
  - An account that is not on the allowlist is told so, and sees its own user ID so the owner knows what to add.
- **`#/new`** (`createSession`): writes the game, its join code, the hidden `engine` node (τ and end round) and any bot firms in one atomic update.
  - The code is 4 letters A–Z without I and O. If it is taken, a new code is tried (up to 12 times).
  - A fixed seed may be a whole number or any text (text is hashed).
- **Phase machine** (`src/firebase/phases.ts`, pure, one function per transition) and **orchestrator** (`src/firebase/orchestrator.ts`).
  - Every transition is a transaction on `public`, so a second window that arrives late is refused rather than applied twice.
  - F9: lobby → briefing → open → resolve → reveal → next open, or ended at the hidden end round or after round 30.
  - F8: summit from open or reveal, and back.
  - F10: needs a second press within 3 s; an open quarter is discarded unresolved.
  - Timer: +30 s, −30 s, pause, resume.
  - Optional auto-resolve at the deadline.
- **Resolution (§11)**: lock transaction, one read, engine `resolveRound`, one atomic multi-path `update()`.
  - If the write fails the phase stays `resolving`, nothing is written, and `#/control` shows "Resolution incomplete — retry".
  - Retry takes over only the lock holder it saw, so two windows cannot both retry.
  - Missing decisions take the engine defaults and are flagged AUTO. Bot firms resolve from their policies.
- **`#/screen`, live**: lobby (code, client-side QR, address, firms with live member counts), briefing, board, trust panel, ticker, F-key bar and command line, all on public nodes. The reveal motion plays once per quarter that the page watches resolve.
- **`#/control`, live**: session panel (phase, quarter, trust, timer, controls), hold-to-reveal for τ and the end round, firms panel (presence, committed, received time, AUTO forecast, bot policy), pacts with unaudited counts, retry state.
- **Static preview screens removed** from `#/screen`, `#/control` and `#/new`. `#/kit`, `#/play` and `#/results` still use fixtures until Sessions 5 and 7.
- **Tests**
  - `tests/firebase/orchestrator.test.ts` (32): phases, lock, failed write and retry, duplicate windows, defaults, bots, pacts merge, auto-resolve, round 30 stop. Removing the lock fails two of them.
  - `tests/emulator/orchestrator.test.ts` (12): the same flows through the real SDK and the real rules.
  - `tests/ui/screen-model.test.ts` (9): board rows, previous values for the reveal, series.
  - `npm run test:e2e` (`scripts/e2e.ts`): Playwright. The facilitator has its own browser context. Each scripted participant has its own context (`tests/e2e/harness`, served only by the dev server) and signs in anonymously, founds or joins a firm and commits through the real data layer. It covers the sign-in gate, session creation, lobby, a 4-quarter run with summit, pause, two windows pressing F9 together, a refresh mid-round, F10 double press, auto-resolve, the retry state, reduced motion, and the check that τ never appears on the projector or in any participant-readable node. Screenshots go to `shots/e2e-*.png` at 1280×720 and 1920×1080 (console at 390×844 and 1440×900). I reviewed them against §16.4 and the grid; no gradients, glow, rounded corners or emoji, and no clipped panel.
  - `npm run shots` now covers only the static screens.
  - Totals: `npm test` 188, `npm run test:rules` 120, e2e passes (run twice in a row).

**Spec deviations and additions (with reasons)**
1. **Two fields added to `public`: `resumePhase` and `pausedRemainingMs`** (owner approved). §12 has no field for the phase to return to after a summit, nor for the time left while the timer is paused. `database.rules.json` is unchanged: `public` has no validation rules.
2. **Pausing removes the deadline**, so decisions are refused while the timer is paused (a missing deadline always denies a write, §13). A summit freezes the timer the same way.
3. **`firmsPrivate` and `pactsPrivate` are not read at resolution.** The `engine` node holds the full state, so it is the one source. The orchestrator writes `firmsPrivate`, `firmsPublic`, `rounds`, `pacts`, `pactsPrivate`, `engine` and `public` each quarter, as §11 lists.
4. **Live pact membership overrides the engine's copy** at resolution (participants edit it). Pacts created since the last quarter are appended in creation order with an empty private record. A dissolved pact is never reopened.
5. **The engine is built at the briefing, not at creation**, because firms form in the lobby. `#/new` writes τ and the end round from `createGame` with an empty firm list. The setup stream does not depend on the firm list, and the values are copied across so they cannot change (a test checks this).
6. **The committed tick on the board is mirrored by the facilitator window.** Participants cannot write `firmsPublic` or read each other's decisions, so an open `#/screen` or `#/control` window writes `firmsPublic/{firm}/submittedRound` as decisions arrive. Bot firms always count as committed. Without an open facilitator window, no tick appears.
7. **Auto-resolve fires 3.25 s after the deadline**, once the 3 s grace window for late decisions has closed, so no accepted decision is missed.
8. **F6 (audit) and F7 (disclosure) are not connected**; they show a notice. Session 6 builds them. A disclosure setting chosen at creation does show the PACE, SAFE and EXPO columns from the published snapshot.
9. **F10 is also accepted from a running summit**, and not before the first quarter opens.
10. **Copy**: the trust chart's left label reads START (the opening value comes before Q1).

**Open issues**
- **Participants cannot join on the live site yet.** The join flow is Session 5. Until then the live site is tried with bot firms only (at least two).
- **Private card notices are not stored.** The engine returns them; §12 has no node for them. Session 6 must decide where they go.
- **Retry window.** If a window finishes the quarter between another window's read and write, both write identical data (the engine is deterministic). A test covers the usual order.
- **Two windows of one account share a user ID**, so the lock holder is told apart by a per-window token on retry only.
- **Auth persistence**: the facilitator stays signed in on that browser until Sign out.
- **`results` is not written** when a session ends. Session 7 computes it.

**Next steps**
- Session 5: participant join and control centre.

## 2026-10-02 — Session 5: participant join and control centre

**Done**
- **Landing (`#/`)**: a session-code field, a resume link for the last session on this device, and the facilitator sign-in link. It uses no Firebase, so it loads instantly. The old developer links (kit, static previews) are gone from the page; `#/kit` still works by address.
- **Join flow (`#/j/:code`)**: anonymous sign-in, then the participant confirms or types the code.
  - **Found a firm**: name of 2–20 characters, ticker of 3–6 letters A–Z (forced to capitals; a ticker already in the session is refused), optional device initials with a warning not to enter a full name. A 4-digit PIN is generated and shown in large type before founding, and again afterwards.
  - **Join a firm**: pick from the list of human firms (bots are not listed), enter the PIN. A wrong PIN or a closed session gets a plain explanation.
  - A device that is already in a firm sees "Open the desk" first, and may switch firm until joining closes.
  - After the briefing starts, an open form is replaced by "Joining is closed".
- **Control centre (`#/play/:gameId`)**, live on the public nodes and the firm's own private node only.
  - Header: ticker, quarter, server-time countdown (frozen while paused or in a summit), cash, last profit.
  - DESK: pace, safety, card picker with the POACH target list. The cooldown, repeat-target and insolvency rules are written inline. Estimated cost and the public exposure label come from the engine (`estimatedCost`, `exposureOf`, `exposureLabel`).
  - Commit and recommit until close. The status line reads "Committed hh:mm:ss · edit until close · device XX". A teammate's commit shows their device initials, and their settings load on your desk. Unsent edits are flagged "changes not committed".
  - Locked states: lobby, briefing (shows the briefing lines), paused, closed after the deadline, resolving, summit.
  - Reveal: quarter result card (revenue, costs, profit, share, share change, valuation, rank change), notices (AUTO, incident, insolvency, audits that name the firm) and the quarter's headlines.
  - BOOK: own history table and step sparkline. WIRE: headlines from every quarter. PACTS: existing pacts, read only; the tab is selected automatically when a summit starts. Ended: own rank and valuation, and "Watch the board".
  - TEAM panel on the DESK shows the firm's PIN for teammates.
  - Offline: a banner after 2 s without a connection, commit paused, automatic reconnection.
- **Tests**
  - `tests/ui/join-validate.test.ts` and `tests/ui/play-model.test.ts` (26 tests): input rules, §6.4 defaults, card cooldown and target rules, estimate and label, view by phase and deadline, history, notices, wire. `npm test`: 214 passed. `npm run test:rules`: 120 passed (rules unchanged).
  - `npm run test:e2e` (`scripts/e2e.ts`) now ends with a participant run on a fresh 3-quarter session. Real browsers: phone A (390×844), phone B (second device of the same firm), desktop C (1440×900, keyboard only from the desk on). It covers code validation, founding, wrong then right PIN, duplicate ticker, closed joining, commit and recommit from two devices, a keyboard-only commit (Tab, arrow keys, Enter), a reload restoring the firm, the resume link, reveal, BOOK, WIRE, PACTS, summit lock, POACH target rules, the card cooldown, offline and reconnect, the locked state after the deadline, the ended state, and that a non-member cannot read `engine`, other firms' private data or decisions, pact private records, members or PINs. Screenshots at 360×640, 390×844 and 1440×900 check horizontal scroll, 44 px targets and 14 px text. I reviewed them against §16.4 and the grid: no gradients, glow, rounded corners or emoji; columns sit on whole `ch` widths.
  - `npm run shots` no longer includes `#/play` (it needs the database); the e2e run replaces it.

**Spec deviations and choices (with reasons)**
1. **Copy**: "Join a session" and "Found the firm" replace the spec's "Join a game", because `lint:copy` bans "game" in screens.
2. **Rejoin on the same device** is restored by Firebase's persistent anonymous user (same `members/{uid}` entry), not by stored data. The only item the app stores on the device is the last session's code and id, for the resume link. The PIN is never stored.
3. **Facilitator browser guard**: a browser still signed in as the facilitator cannot be used as a participant, because anonymous sign-in would replace that session. The page says to use a private window or another browser.
4. **Device initials** are limited to 4 characters in the form; the rules allow 12.
5. **Share change** shows "–" for the first quarter, because no earlier share is recorded.
6. The card-validity rules on the desk mirror the engine's (`allowedCards`): the card played last quarter and every non-NONE card when insolvent.

**Open issues**
- **Anonymous sign-in must be enabled** in the Firebase console (Authentication → Sign-in method → Anonymous). Without it the participant pages show an explanatory message. This is a manual owner step.
- **No rejoin from a different browser or after clearing site data once joining closes.** The rules treat only the same user as a rejoin (spec §13). A teammate's second device must join during the lobby.
- **Card notices.** Participants are not told why a card was dropped (§6.3 step 2), because the engine's notices are not stored (Session 4 open issue). Session 6 owns this.
- **Ended card** shows rank and valuation only. The counterfactual figures arrive in Session 7.
- **Projector key presses during an action.** `#/screen` silently ignores a key pressed while the previous action is still finishing. The e2e run flaked on this once (F9 right after a reveal) and now waits 600 ms. Session 8 could show a "working" notice or queue the key.
- **Committed tick** still needs an open facilitator window (Session 4).
- **Lighthouse accessibility** has not been run (Session 8).

**Next steps**
- Session 6: pacts (propose, join, leave), audits, cards end to end, disclosure and summit wiring.

## 2026-10-02 — Session 6: pacts, audits, cards, disclosure, summit

**Done**
- **PACTS tab** (`src/screens/Play/PactsTab.tsx`, `pacts.ts`):
  - propose a pact with a maximum pace, a minimum safety spend, or both (auto-named PACT-A, PACT-B…)
  - join, leave, and view terms and members
  - a participant writes only their own firm's membership; the rules already enforce this
  - proposals are open only while a quarter is open or in a summit; joining and leaving are always open
  - a dissolved pact is shown but cannot be joined from the app.
- **Projector (`#/screen`)**:
  - the PACT view lists terms, members, the BREACH tag and the latest published audit per pact
  - pact tags and BREACH tags on board rows (BREACH lasts 2 quarters from detection)
  - **F6 / Shift+F** opens an audit picker (press the pact's number)
  - **F7 / Shift+D** toggles disclosure; the top bar always shows `DISCL ON` or `DISCL OFF`
  - the PACE, SAFE and EXPO columns appear only while disclosure is on, filled from the round's published snapshot.
- **Console (`#/control`)**: an AUDIT button per pact (queued audits show `QUEUED`), unaudited counts (unchanged), an AUDIT OUTCOMES panel listing every published automatic and manual audit with fines, waivers and expulsions, and the F7 toggle. F6 queues directly when one pact exists; with several it moves focus to the pact list.
- **Orchestrator** (`src/firebase/orchestrator.ts`): `toggleDisclosure`, `queueAudit` (a transaction on `engine/pendingAudits`, so two windows cannot lose each other's request) and `publishWire`. Card notices are stored on each resolution.
- **Wire**: the ticker, the PACT view's headlines and the participants' WIRE tab merge the engine's quarterly headlines with live events, newest first (`mergeWire`).
- **Card notices**: when a card is dropped at resolution (§6.3 step 2), the reason is stored at `firmsPrivate/{firm}/notices/{round}` and shown on the firm's quarter result card.
- **Tests**
  - `npm test`: 255 passed (was 214). New: wire derivation and merge, pact form validation, card notice text, the result card rendering, disclosure columns on and off, projector pact rows, console audit outcomes, and orchestrator-level tests for the audit queue, three-violation sanctions (10%, 25%, 40% with the minimum of 10, expulsion on the third), the LOBBY waiver, POACH target and cooldown rules, and disclosure publication.
  - `npm run test:rules`: 140 passed (was 120). New `tests/emulator/pacts.test.ts` runs against the real rules and SDK: pact join and leave permissions, a three-violation audit sequence, disclosure on and off, a summit proposal and the live wire. Rules tests cover the new `wire` node. Mutation check: removing the `wire` rule fails three tests; the rule was restored.
  - `npm run test:e2e` passes. The participant run now proposes a pact from a phone, joins from the desktop, queues an audit with Shift+F, toggles disclosure with Shift+D, and checks the result card, the BREACH tag and the PACE, SAFE and EXPO columns. Screenshots reviewed against §16.4 and the grid; no forbidden styling, and nothing clipped at 360, 390 or 1440 wide.

**Spec deviations and additions (with reasons)**
1. **New `wire/{key}` node** (owner approved). §12 has no place for headlines published outside resolution (a pact formed, joined or left, the disclosure toggle), and `rounds/{r}` is overwritten at resolution. The node is readable by any signed-in user and written only by the facilitator. **`database.rules.json` gained one block (`"wire": { ".read": "auth != null" }`); the owner must paste the updated rules into the Firebase console.**
2. **`firmsPrivate/{firm}/notices/{round}`** holds dropped-card notices. No rules change: members already read their own firm's private node and only the facilitator writes it.
3. **Pact formed headline** is published when the pact is proposed, naming the proposer alone. §15.4 words it for several firms ("{FIRMS} sign voluntary release accord"); with one firm it reads slightly oddly. Later members get a "joins" headline.
4. **Audit timing** is unchanged from Session 2: an audit queued with F6 runs at the next resolution, together with the automatic audits.

**Open issues**
- **Live pact headlines need an open facilitator window** (`#/screen` or `#/control`), like the committed ticks. They are derived from the current pacts, so a window opened late publishes what is missing, and two windows never duplicate an entry.
- **An audit requested during the moment of resolution can be lost.** Queueing is refused while the quarter is RESOLVING, but a request written between the resolution read and write is overwritten. The window is well under a second.
- **Two firms proposing at the same instant could both be named PACT-C.** The name comes from the pacts the proposer can see. The rules accept any `PACT-A`–`PACT-ZZZ` name.
- **An expelled firm can rejoin the pact.** The spec is silent. Its sanction count persists, so a further breach is fined at 40% and expels it again.
- **The rules still accept a membership write on a dissolved pact** (Session 3 open issue). The app does not offer it, and the engine never reopens a dissolved pact.
- **Disclosure columns show `–` until the next resolution** if the toggle is switched on after a quarter resolved with it off, because the snapshot is published only at resolution (§9.3).
- **Dropped-card notices** appear only when the client allowed an invalid card to be committed (for example, after a teammate's commit on another device). The desk already blocks repeats, missing targets and insolvent plays.
- Lighthouse accessibility has not been run (Session 8).

**Next steps**
- Session 7: results, counterfactual and export.

## 2026-10-02 — Session 7: results, counterfactual, export

**Done**
- **Results builder** (`src/engine/results.ts`, pure): `buildResults(state, {revealTau})` returns the final board (rank, valuation, peak), the trust series with the collapse quarter, the counterfactual (`runCounterfactual`), attribution, the pact record (detected and undetected violation-quarters, per firm and per pact), per-firm own figures, and every DATA line. `dataLinesOf(state)` rebuilds the §8.4 lines from the stored history; a test checks they equal the lines `resolveRound` emitted.
- **Writing `/results`** (`orchestrator.ts`): `publishResults` reads the engine node once and writes `results` in one `update()`. It runs at the end of `endSession`, and any open `#/screen`, `#/results` or `#/control` window runs `ensureResults` whenever the phase is `ended` and the node is missing (retried up to 5 times). The output is deterministic, so two windows write identical data. `#/control` shows "Results are not written yet" with a **Retry results** button if all attempts fail.
- **`#/results/:gameId`** (facilitator sign-in): six panels from the live `/results` node. F9 steps forward, Esc steps back, and the step is stored in `public.revealStep` (0 to 5), so a reload restores it. Step charts and horizontal bars only.
  1. FINAL BOARD: bar for final valuation, marker for peak.
  2. TRUST TRACE: collapse marker; the tau line only when `results.tau` is published.
  3. COUNTERFACTUAL: INDUSTRY VALUE, SUSTAINABLE, VALUE DESTROYED; trust paths; per-firm bars.
  4. ATTRIBUTION: share of depletion against share of value.
  5. PACT RECORD: terms, members, detected, undetected, and which firms.
  6. DEBRIEF: the five §15.5 prompts.
- **Projector**: after the session ends, F9 on `#/screen` opens the results screen. F9 on `#/control` steps the panels.
- **Participant card** (`src/screens/Results/OwnResultsCard.tsx`): final rank, valuation actual vs counterfactual and the difference, exposure share and value share, and own detected and undetected violations. It shows only the firm's own row.
- **Export** on `#/control`: `DOWNLOAD HISTORY (.json)` (meta, firms, every quarter's record, decisions, pacts with private violation records, results, and the hidden seed, TAU and end quarter) and `DOWNLOAD DATA LINES (.txt)` (one §8.4 line per firm per quarter). Both read the engine node and work in any phase.
- **Delete session**: press DELETE SESSION, type the join code, press CONFIRM DELETE. It removes `games/{g}` and `codes/{code}` in one update, then returns to `#/new`.
- **Copy lint**: the non-telegraphing exclusion is still limited to `src/screens/Results/`. The participant card lives there so it may use results vocabulary; Play and Control stay clean.
- **Tests**
  - `npm test`: 295 passed (was 255). New: `tests/engine/results.test.ts` (results equal engine outputs for a fixed seed: final board, counterfactual, value destroyed, attribution, trust series, pact record, DATA lines, tau masking, determinism), `tests/firebase/export.test.ts`, `tests/ui/results.test.ts` (panel and card rendering against the builder), and ten results tests in `tests/firebase/orchestrator.test.ts` (write on end, one update, tau and end round masked, F10 mid-quarter, failed write then retry, duplicate windows, panel stepping, delete).
  - `npm run test:rules`: 142 passed (was 140). The emulator tests now check that participants can read `/results` once ended, cannot write it, and that step and delete work through the real rules.
  - `npm run test:e2e` passes (237 checks). The 3-quarter participant run now covers the participant card on phones, F9 into the six panels at 1280×720 and 1920×1080 (no clipping), the stored step and Esc, a reload, both downloads (JSON and DATA lines compared with the results), and the double-confirmed delete. Screenshots (`shots/e2e-results-*`, `e2e-play-results-card-*`) reviewed against §16.4 and the grid: no gradients, glow, rounded corners or emoji; columns on whole `ch`.

**Spec deviations and choices (with reasons)**
1. **`/results` shape.** §12 gives `{final, counterfactual, attribution, dataLines}`. Added `rounds`, `collapseRound`, `tau`, `startTrust`, `trust`, `industry` and `pacts`. The counterfactual is stored without its incident draws (not needed after the run).
2. **`revealStep` is zero-based** (0 is panel 1).
3. **Violations are counted in quarters.** Detected means an audit published the quarter; undetected means none did (including quarters older than the 3-quarter audit window).
4. **Final rank** is the engine's rank at the last resolved quarter. An F10 end discards the open quarter, so results cover resolved quarters only.
5. **Counterfactual per firm** is the firm's own counterfactual valuation (each firm keeps its own incident draws).
6. **Value share** counts negative valuations as 0 (Session 2 decision), so every firm in debt gives 0% value shares.
7. **Results are written in a second step after the phase becomes `ended`**, not in the same update, because the phase change is a `public` transaction. Participants see "Full results are being prepared" until the node exists.
8. **Delete confirmation** is: arm, type the join code, confirm (two presses plus the typed code).
9. **Labels.** "Delete session" and "Counterfactual" follow the copy rules (no "game"). The mock results fixtures and the `npm run shots` results screenshots are removed; the e2e run covers `#/results` with live data.

**Open issues**
- **Results are readable by every signed-in user once ended** (spec §13), so all firms' final figures, per-firm violation counts and the published tau (only if the setting is on) can be read with developer tools. The participant screen shows only the own row. Session 9 should judge whether this is acceptable.
- A participant device that last joined a deleted session still holds its resume link; opening it says no session exists.
- If a facilitator window is never open after the session ends, `/results` is not written until one is opened (it self-heals on the next open).
- Lighthouse accessibility has not been run (Session 8).

**Next steps**
- Session 8: bots tool, end-to-end tests, hardening, runbook.

## 2026-10-02 — Session 8: rehearsal, end-to-end tests, hardening, launch

**Done**
- **Bot clients** (`tools/bots.ts`, `tools/bots/`, `npm run bots -- --game <id or code> --firms 8 --policy mixed`): anonymous participants that found firms in the lobby and commit by policy (cautious, standard, greedy, mimic-leader, mixed) after random delays, through the real data layer and rules. Options: `--delay 1-6`, `--seed`, `--found-only`, `--join-pacts` (restrained bots join any active pact). Per-bot seeded randomness, so a run repeats. Emulator only (see deviations).
- **Rehearsal run** (`npm run test:e2e:rehearsal`, `scripts/e2e-rehearsal.ts`): facilitator (projector and console) plus 8 bot clients plus 1 scripted human, 14 quarters, fixed seed 5. It covers a summit with a pact (human and four bots join), two manual audits (quarters 5 and 8, both publish a breach), disclosure on for quarters 4 to 9 and off again (columns appear and go), a forced moratorium in quarter 10, the counterfactual, all six results panels and the human's results card. Stored results are compared with a fresh engine computation. 123 checks.
- **30-quarter run** (`npm run test:e2e:long`): 15 bot clients plus 1 human (16 firms, the maximum), manual mode, F9 only. The session ends by itself after quarter 30, no quarter 31 exists, results hold 480 DATA lines. 117 checks.
- **Hardening run** (`npm run test:e2e:hardening`, 44 checks): refresh mid-round; refresh while a resolution is stuck; three windows pressing F9 together resolve and open each quarter exactly once (also when opening the next quarter); two consoles pressing Retry together resolve once; clock skew (projectors 7 minutes fast and slow, phones 10 minutes fast and slow: the countdown follows the server and commits are accepted, stored with server time); rejoin after joining closed (same device back in, a different firm, a new device and a new firm all refused).
- **Shared test helpers** (`scripts/lib/e2e-kit.ts`) now hold what `scripts/e2e.ts` had inline. Every e2e page fails the run on any request to a host outside the local machine.
- **Replica** (`scripts/lib/rehearsal-model.ts`, `tests/tools/rehearsal-model.test.ts`): an engine-only copy of the rehearsal. A unit test checks that seed 5 ends in a moratorium between quarters 8 and 11.
- **Lighthouse** (`npm run test:a11y`, `scripts/lighthouse.ts`): a real participant joins through the UI; Lighthouse snapshots 15 states (landing, join ×3, lobby, briefing, DESK open and committed, card picker, BOOK, PACTS, WIRE, summit, reveal, results card) at 390 and 1440 px. First run: 96 to 98 (one failing audit, "no main landmark"). After the fix, all 30 snapshots score 100.
- **Build audit** (`npm run audit:build`, `scripts/audit-build.ts`): builds, serves `dist/index.html` under `/frontier/`, loads every route with outside traffic blocked. Checks no outside script, stylesheet, font or image tag, and that every host contacted is Firebase.
- **`docs/RUNBOOK.md`**: facilitator guide in plain English (Firebase set-up, pre-class checklist, creating a session, key map, console, what to do when something goes wrong, debrief flow, solo rehearsal with bot firms on the live site).

**Defects found by the new tests, and fixed**
1. **Results panels clipped at 9 or more firms** (COUNTERFACTUAL, ATTRIBUTION, FINAL BOARD). Panels 3 and 4 now flow into two columns above 8 firms; panel 1 uses one-line rows above 8.
2. **Projector board clipped at 13 to 16 firms** (14 of 16 rows visible at 1280×720). Above 12 firms the board uses one-line rows.
3. **No main landmark** on `#/`, `#/j/…` and `#/play/…` (the tab panel's role replaced the landmark). `<main>` now wraps each; the tab panel sits inside it.
4. **Silent key press on the projector** while the previous action finishes (Session 5 open issue). It now shows "Working on the last key. Press again in a moment."

**§18 acceptance criteria**
1. Calibration C1 to C4 pass for N = 4, 6, 8, 10, 12 at 200 seeds (rerun this session; `reports/calibration.md` unchanged and committed). PASS.
2. Rules tests: 142 pass (`npm run test:rules`), covering participants' reads and writes, and late decisions. PASS.
3. Full rehearsal, 8 bots plus 1 human, 14 quarters with summit, two audits, disclosure toggle, collapse and counterfactual. PASS (the "2 human test devices" are one scripted human here; see deviations).
4. 30-quarter manual run ends automatically. PASS.
5. Participant UI at 360×640, 390×844, 1440×900 and projector at 1280×720 and 1920×1080: checks for clipping, horizontal scroll, 44 px targets and 14 px text pass in `npm run test:e2e` and the new runs, including 16 firms. PASS.
6. Copy: `npm run lint:copy` passes (49 files). PASS.
7. Lighthouse accessibility on `#/play`: 100 in every state at both widths. PASS.
8. Built page, no requests other than Firebase: PASS with a limit stated below.

**Spec deviations and limits (with reasons)**
1. **Scripted human.** Criterion 3 says "2 human test devices". The rehearsal uses one scripted human who commits through the data layer, not through the UI, because the UI paths are already covered in `npm run test:e2e` (3-quarter phones and desktop run). The results card is read through the real participant screen.
2. **Bots tool is emulator-only.** `--live` is not implemented: the container cannot reach the live database, so it could not be tested. Live rehearsal uses the in-app bot firms (RUNBOOK section 8).
3. **Bot clients' mimic-leader** reads the published disclosure snapshot and rank (all a participant can read) and falls back to pace 3 and safety 8, as §7 says. The in-app version reads the engine state, with identical rules.
4. **§18.8 evidence.** With the live Firebase config, the built page cannot sign in from the container, so the build audit sees only the first sign-in request (`identitytoolkit.googleapis.com`). The database and token hosts are allowed by name in the audit. A second check covers the app's own code: in every e2e run (dev server, emulators) any request to a non-local host fails the run, and none occurred. Not observed: a live session against the real Firebase hosts.
5. **GitHub Pages.** `.github/workflows/pages.yml` is unchanged. GitHub's own run history shows its deploy succeeded for the last five merges (run 7 on merge of Session 7). Whether this pull request deploys is known only after merging. The workflow runs typecheck, unit tests and the build, not the emulator suites (no Java or emulators there).

**Open issues**
- `npm audit` reports 4 high-severity findings in production dependencies, all through `firebase` → Firestore → `@grpc/grpc-js` (Firestore is not used or bundled). The suggested fix downgrades Firebase to version 9, a breaking change, so it is left for the owner.
- The facilitator pages (`#/new`, `#/control`, `#/screen`, `#/results`) were not Lighthouse-audited; criterion 7 names `#/play`.
- **Scale beyond 16 firms.** Session 8's clipping fixes are tuned for the spec maximum of 16 firms and do not scale to 40–50. The owner wants to scale to 40–50 participants. The plan, with proposed fixes and the questions to settle first (participants versus firms, connection limit, calibration), is **Session 10** in `docs/SESSIONS.md`.
- A device that was not in the lobby cannot be added once joining closes (spec §13, unchanged).
- Anonymous sign-in must be enabled in the Firebase console (Session 5 item, in the RUNBOOK).
- The pending Session 6 database rules change (the `wire` block) still needs pasting into the Firebase console if not already done.

**Next steps**
- Session 9: independent audit.

## 2026-10-02 — Session 9: independent audit

Full findings, with reproductions and proposed fixes: `docs/REVIEW.md`.

**Done**
- **Security**
  - Each Session 9 threat was attacked against the rules in the emulator (`tests/rules/audit.test.ts`) and against the client code (`tests/ui/hidden-paths.test.ts`). The threats were reading hidden values with developer tools, writing other firms' decisions, late writes, forging results and guessing PINs.
  - Every read and write is refused as the spec requires, except PIN guessing (H2, now fixed).
  - τ and the end round never reach `#/screen` or `#/play`:
    - the participant pages' whole import graph excludes the facilitator hooks and the orchestrator
    - the projector's own code never subscribes to `engine`
    - a mutation check confirms the test catches a violation.
- **H1 fixed.** A device that founds or joins a second firm leaves the first with no members. Such a firm played AUTO all session, and more than 16 firms blocked the start; nothing could remove them. Changes:
  - `#/control` has **REMOVE** per firm in the lobby (two presses within 3 s)
  - the DANGER panel has **LOCK JOINS** / **REOPEN JOINS**, lobby only (spec §14.2 named both; neither existed)
  - code: `removeFirm` and `setJoinsLocked` in the orchestrator, `setJoinLock` in `phases.ts`.
- **H2 fixed (owner chose the join throttle).** A 4-digit PIN could be guessed in about 9 s on the emulator. Now:
  - a join first records the guess at `joinRequests/{firm}/{uid}` with a `joinThrottle/{firm}` stamp, which the rules accept once per firm per second
  - the membership PIN must match both the recorded guess and the firm's PIN
  - measured: 1.00 recorded guess per second with 20 parallel writers, so about 2.8 hours for all PINs (`scripts/audit-pin.ts`)
  - founding and rejoining are unchanged; the app retries a busy slot.
- **Model**
  - Calibration at 500 seeds: all C1–C4 pass (`reports/calibration-500.md`).
  - New `tools/audit-strategies.ts` (`reports/strategy-audit.md`) runs four checks: a best-response search over 199 strategies in 4 fields at N = 4, 8 and 12; symmetric play; pact breach; and the worst single-firm moratorium at N = 2–8.
  - No dominant strategy. Findings M1–M3 are for the owner.
- **Copy and design**
  - `lint:copy`, plus a pass over strings from outside `src/screens` and `src/ui`: no violations.
  - Screenshots at all five sizes reviewed against §16.4 and the grid: no violations. Low items are L6–L8.
- **Runbook:** use at least 6 firms; check for firms with no devices and REMOVE them; LOCK JOINS once teams form; what the "Another device is joining" message means.
- **Tests:** `npm test` 316 passed; `npm run test:rules` 160 passed (was 142); `npm run test:e2e` 252 checks passed (was 237); `npm run test:e2e:hardening` 44 passed. Typecheck, `lint:copy` and `lint:design` pass.

**Defects found in the e2e script while adding checks, and fixed**
- The TAU hold check measured the button while the console was scrolled (after the new LOCK JOINS click) and while a notice was about to clear. It now scrolls the button into view and waits for the notice.
- The two "−30 s" presses could arrive while the first was still running; the console ignores a press while busy. The script now waits for the first to finish.

**Spec deviations (with reasons)**
1. **New nodes `joinRequests/{firm}/{uid}: {pin, at}` and `joinThrottle/{firm}: serverTime`** (§12), and a stricter `members/{uid}` rule (§13): the PIN must also match the recorded guess, except when founding or rejoining the same firm. Owner approved this fix for H2. **`database.rules.json` changed; the owner must paste it into the Firebase console.**
2. **REMOVE works only in the lobby.** The market is built from the firm list at the briefing, and the orchestrator would rebuild it if the count changed later.

**Open issues (owner decisions; see `docs/REVIEW.md`)**
- M1: one firm can trigger the moratorium alone at N ≤ 4 (17–22% by quarter 14 at N = 4). The runbook recommends at least 6 firms.
- M2: POACH dominates the card choice over a whole session.
- M3: pact sanctions do not deter a breach.
- M4: tickers are not unique in the rules (a test documents it).
- L1–L10: low items, including other firms' cash and capability being derivable from public profit and valuation.
- Someone repeatedly writing a firm's join stamp can delay real joins to that firm. The app retries, and LOCK JOINS ends it.
- Lighthouse (`npm run test:a11y`) was not re-run. The only participant-page change is one error message on the join form.
- The 14-quarter rehearsal and the 30-quarter run were not re-run. Neither uses the join path, and the engine is unchanged.

**Next steps**
- Owner: paste `database.rules.json` into the Firebase console, then decide M1–M4.
- Session 10: scale to 40–50 participants.

## 2026-10-03 — UI audit and redesign plan (Sessions 11–15 added)

**Done**
- Audited every screen for looks and for how well it can be understood without the facilitator. Evidence: screenshots from `npm run test:e2e` and `npm run test:e2e:rehearsal` (both passed, no code changed).
- The audit, with before and after mock-ups drawn from engine output, is saved at `docs/ui-audit/index.html`. The owner approved it on 2026-10-03, including its five decisions.
- Added Sessions 11–15 to `docs/SESSIONS.md`: chart foundation and results defects; colour, chrome and screen-level clarity; firm performance views; results narrative; phone and plain pages.

**Defects found (to be fixed in Session 11)**
- When final valuations are negative, results panels 1 and 3 draw empty bars and panel 4 shows 0.0% value share for every firm. The 14-quarter rehearsal reproduces this.
- Chart lines stop short of their x-axis labels and y labels do not sit at their values, because chart widths are fixed in `ch` and labels are laid out beside the SVG.

**Spec deviations approved, to be written into the spec by the session that implements each**
- New tokens and a dark top bar (§16.1); full-word uppercase labels where a mnemonic needs explaining (§16.2, settles REVIEW L7).
- Straight-segment line chart with quarter markers and a change strip instead of square steps; a flat hatch between two compared series; new components for firm performance (§16.3).
- Negative totals: engine definitions unchanged; display rules in Session 11 step 6 (§10, §14.4).

**Open issues**
- Sessions 12–15 change layouts that Session 10 (scaling) also changes. Run Session 10 first if it is going ahead.

**Tests:** `npm run typecheck` passes; `npm test` 316 passed.

**Next:** Session 11.

## 2026-10-03 — Session 11: chart foundation and results defects

**Spec changes** (each one is a spec change approved by the owner on 2026-10-03 (UI audit); written into `docs/spec.md` before the code):
- §16.3: `StepSparkline` replaced by `LineChart` (straight segments, quarter markers, in-chart axes on the data's scale, right-hand value axis, end tag, optional change strip, reference line, vertical marker and hatch; y domain `trust` 0–100 or zero-based; "1 quarter resolved" for a single point; τ never passed to a projector or phone chart). `HBar` is drawn from a visible zero line, negatives to the left in `--down`.
- §16.4: a flat 45° hatch in a token colour is allowed between two compared series and below a revealed τ line.
- §14.1 (trust region) and §14.3 (BOOK) now name the line chart.
- §10: headline figures are INDUSTRY VALUE, ALTERNATIVE and VALUE LOST (VALUE ADDED ▲ when the actual total beats the alternative). The percentage appears only when the actual industry total is positive; otherwise "industry finished below zero". When no firm finishes above zero, the attribution value side reads "No firm finished with positive value". Engine definitions unchanged.
- §14.4: panels 1–4 described as dumbbell, line chart with labelled moratorium marker and τ band, three figures with a hatched gap and a zero-based per-firm comparison, and a butterfly. No SUST, ACT or DEPL.

**Done**
- `src/ui/chart.ts` (pure): `linearScale`, `niceStep`, `niceDomain`, `niceTicks`, `tickDecimals`, `yDomain`, `xPositions` (first point on the left end of the axis, last on the right end), `linePath`, `bandPath`, `quarterTicks`, `changes`, `largestDrop`, `alarmIndices`, `placeLabels`, `clampSpan`, `fitLabels`.
- `LineChart` (`src/ui/components/LineChart.tsx`) with `useChartSize` (ResizeObserver; the SVG is laid out in real pixels, so labels, ticks and data share one scale). `StepSparkline` and its test are deleted.
- `HBar` takes a signed value and a domain; the zero line is always drawn.
- Uses replaced: projector trust panel and `TRUST` view (change strip on, red markers for falls of 5 or more, largest fall labelled, no τ), `FIRM` view (zero-based), phone BOOK (zero-based; one quarter shows "1 quarter resolved"), the kit.
- Results (`src/screens/Results/`): FINAL BOARD dumbbell; TRUST TRACE line chart with change strip, labelled MORATORIUM marker, τ line plus hatched band only when published; COUNTERFACTUAL three figures, trust chart with both lines labelled at their ends and the gap hatched, per-firm comparison (actual bar from zero, cyan tick at the alternative); ATTRIBUTION butterfly. New pure builders `headlineFigures`, `finalBoardRows`, `attributionRows`; `barFraction` and `destroyedShare` removed.
- RUNBOOK debrief notes for panels 1–4 updated to the new charts.
- **Tests**
  - `tests/ui/chart.test.ts` (31 tests) replaces `tests/ui/sparkline.test.ts`: scales, nice ticks including a domain crossing zero and an all-negative domain, path, band, quarter ticks, changes, drops, alarms, one-point series, label placement.
  - `tests/ui/results.test.ts`: negative valuations, a negative industry total, actual above the alternative, no firm above zero, the abbreviations gone, the τ band only when published, the moratorium marker.
  - `tests/ui/trust-charts.test.ts`: renders the projector trust panel, the `TRUST` view and the `FIRM` view with "Reveal threshold" on and records every `LineChart` prop: no reference line, band or τ.
  - e2e: new `checkCharts` runs at every projector and phone screenshot size. It fails if a chart's line does not reach both ends of its axis, a y label is more than 0.2 em from the gridline it names, a chart overflows its container, or a results chart lacks a mark for any firm. Panel text checks updated; a τ-revealed screenshot of panel 2 added.

**Choices (spec silent)**
1. A trust chart before quarter 1 has one point (the opening value) and shows "No quarter resolved yet"; "1 quarter resolved" is shown when the one point is a resolved quarter (phone BOOK after quarter 1).
2. The x axis labels the first point (`START`, or the quarter for BOOK) and each year boundary (`Y2` after Q4, as in the audit mock-up); labels that would overlap are dropped.
3. The hatch uses `--dim` (and `--down` under τ) because `--signal-dim` arrives in Session 12.
4. The results trust trace also shows the change strip, as in the audit mock-up.
5. Panel headline sentences and filling the projector height are left to Session 14, which names them; panels 1 and 4 still leave space below the chart.

**Defect found in the e2e script, and fixed**
- "the summit selects the PACTS tab" read the tab's state the instant the summit banner appeared. The phone switches tab in an effect just after that render, so the check could run first. It now waits up to 5 s for the tab to be selected. The app is unchanged.

**Test results**
- `npm run typecheck` passes. `npm test`: 354 passed (was 316). `lint:copy` and `lint:design` pass. `npm run build` succeeds.
- `npm run test:e2e`: 253 checks passed (was 252), including the new chart checks at 1280×720, 1920×1080, 360×640, 390×844 and 1440×900.
- `npm run test:e2e:rehearsal`: 123 checks passed. Every final valuation in the rehearsal is negative; panels 1, 3 and 4 now show marks for all nine firms, and panel 4 shows "No firm finished with positive value".
- `npm run test:rules`, `test:e2e:long`, `test:e2e:hardening` and `test:a11y` were not re-run: no rules, data paths or participant controls changed. The BOOK chart is the only phone change.
- Screenshots reviewed (`shots/e2e-results-*`, `e2e-rehearsal-results-*`, `e2e-trust-*`, `e2e-reveal-*`, `e2e-firm-*`, `e2e-play-book-*`, `e2e-rehearsal-collapse-*`): labels sit on their gridlines, lines reach both ends of the axis, no gradients, glow or rounded corners. One fix made during review: change-strip bars were narrowed so the last bar no longer touches the strip's 0 label.

**Open issues**
- Results panels 1 and 4 use the top half of the projector with few firms; Session 14 sizes panels to the screen height.
- Near the bottom of the trust axis, the lower series' end label (ACTUAL at 0.0 in the rehearsal) sits close to the last marker. Readable, but tight.
- The firebase CLI was missing from the container at the start of this session and was installed with `npm install -g firebase-tools` as CLAUDE.md says. The environment setup script may need checking.

**Next steps**
- Session 12: colour, chrome and screen-level clarity. When it adds `--signal-dim` and `--grid`, switch the chart hatch (`.lc-hatch`) and gridlines (`.lc-grid`) in `src/ui/components.css` to them.

## 2026-10-04 — Session 10: scale to 40–50 participants (team and multiplayer modes)

**Owner decisions (2026-10-04)**
- Keep the current game as **team mode** (2–16 firms, 1–5 devices each) and check that 50 devices across 16 teams works. Add **multiplayer mode**: up to 50 firms of one person each.
- Multiplayer mode does not stop a second device joining a firm (option A). The PIN lets a person rejoin from a replacement device. No rules change.
- After reviewing the first version: long results lists scroll in one column rather than using two columns and pages.
- Half the room greedy must reach the moratorium much sooner than now (2.5% of seeds by quarter 14 at 50 firms, 21.5% at 12). Session 16, added to `docs/SESSIONS.md`, recalibrates after the interface sessions 11–15.

**Spec changes** (written into `docs/spec.md` before the code): §2 and §5.4 (mode setting and limits), §8.1 (calibration at N = 16, 20, 30, 40, 50), §12 (`meta.settings.mode`), §14.1 (board rows by count, paged board, board tags on one line, lobby columns, long member lists), §14.2 (console control strip, firms table sort and filters), §14.3 (POACH filter, pact member expand, join flow by mode), §14.4 (long results lists scroll), §16.5 (board page cut).

**Done**
- **Mode.** A MODE panel on `#/new`. The firm limit is per mode (16 or 50, bots included); the lobby refuses to start above it. The mode and its limit show on the console. **Add 10 mixed** adds bot firms quickly. There are now 50 fictional bot firm names. In multiplayer mode the join screen leads with **Found your firm** and offers **Rejoin your firm with its PIN**; the PIN panel explains the rejoin. Long join lists gain a ticker filter.
- **Calibration.** No parameter change. C1–C4 pass at every N from 4 to 50 (200 seeds). Logged in `docs/CALIBRATION.md`.
- **Layout rules** (`src/ui/layout.ts`, pure, unit-tested): board capacity and pages, pinned rows, board tags, lobby columns, list truncation, ticker filter, results pages and stepping.
- **Projector board.**
  - Above 16 firms: pages of 10, two-line rows, an instant cut every 8 s, and a `PAGE 2/5` marker.
  - Rotation holds for 30 s after a key and while the command line is focused. Each reveal starts on page 1.
  - The leader and the largest mover (3+ places) are pinned above the page.
- **Lobby:** above 16 firms, ticker and device count in up to 4 columns.
- **Results** (owner decision 2026-10-04, after a first version with two columns and pages: one scrolling column instead):
  - FINAL BOARD: one row per firm. When rows would fall below 1.2 lines (about 20 firms) the list scrolls inside the panel, with the heading, axis values and key kept in view and the hint "N firms · arrow keys scroll".
  - COUNTERFACTUAL: the per-firm comparison scrolls in its column; figures and trust paths unchanged.
  - Arrow keys, Page Up/Down and Home/End scroll on the results page; F9 and Esc still step whole panels.
  - ATTRIBUTION: above 24 firms, the top 12 plus an OTHERS row.
  - PACT RECORD: long member lists truncated.
- **Console.**
  - A control strip (F6–F10, phase, quarter, commit count, notice) stays at the top of the window.
  - The Firms table scrolls inside its panel (at most 20 rows), with an **ON** column, **SORT** FIRM / CMT / ONLINE, and **SHOW** NOT COMMITTED / OFFLINE.
- **Phone.** The POACH picker gains a ticker filter above 8 targets and scrolls inside the sheet. A pact with more than 12 members shows `+N more`, a button that expands the list.
- **Bot clients.** `--firms` up to 50; new `--devices-per-firm 1-5` (teammates join with the PIN, every device commits).
- **New runs**
  - `npm run test:e2e:scale` (661 checks)
    - Sessions of 2, 12, 16, 17, 24, 32, 40 and 50 firms are built by the real orchestrator in memory and written to the emulator in one admin write each.
    - Projector checks cover the lobby, open and reveal boards (pages 1, 2 and last), summit, the PACT view and all six results panels (scrolling to the last firm and back where a list scrolls), plus lit-room mode at 12, 16, 24 and 50 firms. They run at 1280×720 and 1920×1080, including a check for cut-off table cells.
    - Console strip and filters are checked.
    - A phone at 360×640 founds the 50th firm through the multiplayer join screen and uses POACH with 49 targets and a 30-member pact.
    - The board was also observed rotating after 8 s and holding after a key press.
  - `npm run test:e2e:scale-run` (182 checks, `reports/scale-run.md`): two 14-quarter sessions created through `#/new`, each with a summit and pact.
    - Multiplayer: 49 bot clients plus 1 human, 50 firms on 50 devices.
    - Team mode: 15 bot firms × 3 devices plus a human firm on 5 devices, 16 firms on 50 devices.
    - Every quarter's stored result equals an in-memory replay.

**Measurements** (emulator, cloud container; the live database adds network time)
- **F9 to reveal:** slowest 317 ms at 50 firms, 194 ms at 16 firms.
- **Largest resolution write:** 361 KB at 50 firms (quarter 14), 121 KB at 16 firms. It grows about 19 KB per quarter at 50 firms, because the facilitator-only `engine` node carries the history. A 30-quarter session at 50 firms was not measured; extrapolated, about 670 KB.
- **What each phone downloads per quarter at 50 firms:** `rounds/{r}` about 6.3 KB and `firmsPublic` about 10 KB. `rounds/{r}` was not split: every value in it is already public, and the size is small.
- **Wire:** 26 entries in the 50-firm session. The ticker shows the latest 3 and the WIRE view the latest 14, so no change was needed. The pact-formed headline names only the proposer.

**Defects found by the new runs, and fixed**
1. **Board clipped under the summit banner at 12 firms**, and **at 16 firms in lit-room mode with disclosure on** (tags wrapped and grew the rows). Both predate this session.
   - Two-line capacity now depends on the grid (36 or 32 rows) and the banner: 12 / 11 / 10 / 9.
   - Board tags stay on one line in priority order (BREACH, INSOLV, AUTO, BOT, pacts), with a dim `+N` for the rest.
2. **PACT view:** the AUDIT cell ("Q1 Y2 AUTO · 2 breaches") and the PACT tag cell cut off their text. Columns widened. The narrow summit pact table drops the AUDIT column so members have room. Member lists wrap without indenting.
3. **Console:** a panel edge showed beside the new control strip. It is now covered.

**Choices and deviations from the Session 10 proposals (with reasons)**
1. **Results columns.** The proposal was "ceil(firms / 8) columns, capped at 3". Since Session 11 the panels are full-width SVG charts that would be too narrow in columns. A first version used two columns and pages; the owner chose one scrolling column instead (2026-10-04).
2. **Pinned rows** are capped by the free two-line slots: 2 as standard, 1 under the summit banner, none in lit-room mode. Showing every firm that moved 3 places is impossible at 50 firms (about 15 change rank per quarter).
3. **`?page=N` on `#/screen`** opens the paged board on page N. It is used by the layout checks; rotation continues from there.
4. **MAX_FIRMS is not enforced in the database rules.** Counting children is not possible in Realtime Database rules without a counter node (from memory, not re-checked). The lobby start check and REMOVE cover it, as for 16 firms before.
5. **Mode names appear only on `#/new` and `#/control`.** "Player" is banned on the projector and phones (§15.3).

**Test results**
- `npm run typecheck` passes. `npm test`: 388 passed (was 354). `lint:copy` and `lint:design` pass. `npm run build` succeeds.
- `npm run test:rules`: 160 passed.
- `npm run test:e2e`: 253 passed. `test:e2e:rehearsal`: 123 passed. `test:e2e:hardening`: 44 passed. `test:e2e:long`: 117 passed.
- `npm run test:a11y`: 100 in all 30 snapshots.
- New: `test:e2e:scale` 661 passed; `test:e2e:scale-run` 182 passed.
- After the switch to scrolling results, `npm test`, `test:e2e`, `test:e2e:rehearsal`, `test:e2e:scale` and `test:e2e:scale-run` were run again and pass. `test:rules`, `test:e2e:hardening`, `test:e2e:long` and `test:a11y` were not re-run after that change: it touches only the projector's results panels, which those runs do not check.
- Two fixes to the e2e scripts during the session:
  - The rehearsal and 30-quarter scripts matched the bot clients' old "ready" message. Updated.
  - In team mode a bot's third device can still commit after the board shows every firm committed, so the scale run waits 3.5 s before pressing F9.

**Open issues**
- **Firebase connection limit not verified.** The Firebase documentation host (`firebase.google.com`) is blocked by this environment's network proxy. From memory (unverified): the Spark plan allows 100 simultaneous Realtime Database connections. Either mode at 50 people needs about 52–55 (one per open tab). The owner must confirm the figure (RUNBOOK section 9).
- **Firebase single-write size limit not verified** (same reason). The largest measured write is 361 KB.
- **Mixed rooms reach the moratorium too late**, worst at large N (`docs/CALIBRATION.md`, Session 10). The owner finds this unacceptable; Session 16 recalibrates it.
- In lit-room mode with disclosure on, the board has room for one tag per row; the rest show as `+N`.
- Sessions 12–15 change the board, results and console layouts. They must keep these paging and column rules (SESSIONS.md says so).

**Next steps**
- Owner: confirm the connection limit; try a multiplayer session on the live site with in-app bot firms (`#/new` → Multiplayer mode → **Add 10 mixed** four or five times).
- Session 12: colour, chrome and screen-level clarity. Then 13–15, then Session 16 (recalibration).

## 2026-10-05 — Favicon

**Done**
- Replaced the empty favicon (`data:,`) in `index.html` with the owner's supplied image, resized to 64×64 and embedded as a PNG data URI (about 1.6 kB). A data URI is used because the build is a single file and nothing else is deployed alongside `index.html`.

**Spec deviations (with reasons)**
1. The favicon carries brain imagery, a blurred edge and a glow-like halo, which spec §15 (brain imagery) and §16 (glow, blur) forbid. The owner approved the deviation on 2026-10-05: the favicon is a browser tab icon, not a core component of the exercise or the tool. The spec text was not amended. `lint:design` and `lint:copy` do not scan `index.html`, so neither check is affected.

**Open issues**
- None. `tests/e2e/harness/participant.html` still has an empty favicon; it is a test harness page and was left unchanged.

**Next steps**
- Owner: after merging, hard-refresh the live site and confirm the icon appears in the browser tab. Browsers cache favicons, so it may take a reload or a new tab.

## 2026-10-05 — Session 12: colour, chrome and screen-level clarity

**Spec changes** (each approved by the owner on 2026-10-03 in the UI audit; written into `docs/spec.md` before the code):
- §16.1: tokens v2 (`--panel #1C1B14`, `--rule #3A3729`, `--dim #9A947C`, new `--raise #24231B`, `--grid #2A2820`, `--signal-dim #8A6400`); the amber budget; a phase-block table; notices with a left rule; the summit banner in `--wire`; lit-room values for `--grid` and `--raise`.
- §14.1: new top-bar diagram; top bar, status line and reveal headline, F-key bar rules (which keys show, which is solid), ticker, board readability, numbered lobby steps; the command line is visible only while it has focus.
- §16.2: full words in uppercase are allowed where a mnemonic would need explaining. This settles REVIEW L7: DETECTED, UNDETECTED, BRIEFING and RESOLVING are accepted as they are.
- §16.3: `PhaseBlock` and `StatusLine` added. §16.6: the measured contrast ratios. §14.2: F7 reads DISCLOSURE.

**Contrast (WCAG AA, computed in `tests/ui/contrast.test.ts`)**
- `--dim` on `--panel` 5.67:1, on `--raise` 5.18:1, on `--base` 6.90:1. Lit-room `--dim` on `--panel` 8.20:1, on lit `--raise` 6.76:1.
- `--down` on `--raise` 4.79:1 (the lowest text pair that passes). Black text on the solid phase blocks: 6.90:1 (`--dim`) to 16.14:1 (`--text`).
- `--signal-dim` is 3.21:1 on `--panel`, below AA, so it is used only for outlines, hatches and key-cap borders, never for text. A test asserts this.

**Done**
- `src/ui/tokens.css` tokens v2. Chart gridlines now use `--grid` and the hatch uses `--signal-dim` (the follow-up Session 11 left).
- **Top bar** (projector, results, phone): `--panel` bar with a 2 px amber rule, the `FRONTIER` brand block in solid amber, the quarter, the phase as a coloured block with its word, and the countdown right-aligned at 1.5× in amber. On the phone the brand block carries the firm's own ticker (see choices). The results bar reads `FRONTIER · RESULTS · 3/6 · COUNTERFACTUAL`.
- **Command line** stays in the page but is hidden until the facilitator types. Typing any letter shows it in the top bar, as before.
- **Status line** under the projector top bar (`src/ui/status.ts`, pure): one sentence for each phase, plus paused, time up, moratorium and ended. During reveal it carries the reveal headline, e.g. "Q1 Y2 resolved · Trust ▲1.3 to 60.8 · HUMN holds 1st · No incidents." ▲ and ▼ are drawn as glyphs in the up and down colours.
- **F-key bar**: outlined key caps. The next expected action is the one solid key: F9, or F8 during a summit, none while resolving. Keys that do nothing are hidden (`projectorKeys`, `resultsKeys` in `src/ui/keys.ts`). The results screen shows only F2 and F9. Hidden keys still work when pressed.
- **Ticker**: 2ch gap after WIRE; each item starts with its quarter. Incidents, breaches, insolvency and the moratorium are red with ▼, clean audits green, the rest cyan.
- **Board**: headers CHANGE, COMMITTED, PACE, SAFETY and EXPOSURE; a `--raise` header row; row rules in `--grid` drawn inside the row height; alternate-row fill. Panel titles are in `--text` at weight 600. The two-line legend is now a one-line key strip that lists only the tags on screen, plus `+N` when tags are cut.
- **Trust panel**: the subtitle "Total market revenue tracks public trust."; "since last quarter"; labels in full (MARKET, INCIDENTS, PACTS, DISCLOSURE). The TRST view gets the same copy.
- **DISCL → DISCLOSURE** in the F-key bar, top bar, trust panel, console and RUNBOOK. Other projector labels written out in full: MAX PACE, MIN SAFETY, MANUAL (audit cell), VALUE (firm view), DEVICES (lobby).
- **Amber budget**:
  - Pact tags are amber text in a `--signal-dim` outline.
  - The summit banner is solid cyan; the phone's offline banner is red.
  - The lobby join code and the firm-view ticker are now `--text`.
  - The results counterfactual "actual" bars are amber outlines instead of fills.
- **Notices**: half-line padding and a 2 px left rule (dim for status, red for errors) instead of a box.
- **Lobby**: join steps numbered 1–3.
- Kit (`#/kit`) shows the new top bar, status line, every phase block and the F-key bar.
- RUNBOOK: a "Reading the projector" note; F7 and the disclosure columns renamed.

**Choices (spec silent)**
1. **Phase colours.** LOBBY: outline. BRIEFING: outline. OPEN: solid green. RESOLVING: amber outline. REVEAL: solid `--text`. SUMMIT: solid cyan. ENDED and RESULTS: solid `--dim`. None is solid amber, because the budget reserves solid amber.
2. **The F9 label stays ADVANCE.** The audit mock-up's "OPEN NEXT QUARTER" would be wrong on the last quarter, and choosing a label for the last quarter would reveal the hidden end round.
3. **Mnemonics in lit-room mode.** With disclosure on in lit-room mode, the full-word headers would leave no room for tags. In that one case the board uses CMT, SAFE and EXPO, and the key strip explains them, so every label is either a word or keyed. To keep two tags visible with disclosure on in standard mode, SHARE, PROFIT, VALUE and CHANGE are each 1ch narrower (they still fit six-character values such as `−104.8`).
4. **Phone brand block** is the firm's own ticker, not FRONTIER. The own firm is an amber use the spec allows, and FRONTIER plus the ticker does not fit on one line at 360 px.
5. **Countdown keeps the `T-` prefix**, as in the original spec.
6. **The alarm headline kinds** (`isAlarmKind`) live in `src/firebase/wire.ts`. One of the engine's kind names is a word that `lint:copy` bans in screen code.
7. **The status line takes one grid row.** The board legend shrank from two lines to one, so board capacity is unchanged: 12 / 11 / 10 / 9 two-line rows.

**Acceptance against the session criteria**
- On the board screenshots, the solid amber HTML fills are the brand block, the primary key, the countdown and the trust numeral; the new `checkAmber` e2e check enforces this on every projector screenshot. **Exception, reported rather than changed:** the trust chart's end tag (a small solid amber box carrying the latest trust value, added by Session 11's `LineChart` spec) and the amber trust line are SVG and are not counted by the check. I treated both as part of the trust value. Owner decision 2026-10-05: keep the end tag as it is.
- Every projector label is a word, or a tag or mnemonic explained by the key strip.

**Tests**
- New: `tests/ui/status.test.ts`. It covers the reveal headline: the spec example, a rise and a held lead, unchanged trust, no incidents, ties for 1st (two and three firms), losing a shared lead, quarter 1, no leader, and the moratorium. It also covers the status sentence for every phase, paused, time up, the moratorium and ended. Every variant is run through the `lint:copy` rules.
- `tests/ui/keys.test.ts`: which keys show and which is solid in every phase; F6 needs an active pact; results keys; the DISCLOSURE label.
- `tests/ui/screen-model.test.ts`: reveal input (leaders, ties, previous leader), ticker tones, and the key strip (only tags on screen, the pact entry, `+N`).
- `tests/ui/screen-pacts.test.ts`: full-word headers; the lit-room mnemonic fallback; tag width matches the columns built; a BREACH tag and a pact tag fit with disclosure on.
- `tests/ui/contrast.test.ts`: tokens v2 pairs including `--raise` and the phase blocks; the ratios recorded in §16.6; `--signal-dim` below AA; lit-room values brighter than standard.
- The layout tests (board capacity at every firm count) pass unchanged.
- e2e: new `checkAmber` on every projector screenshot. The join code is located by `data-join-code` instead of its amber class. The checks for DISCL, SAFE and EXPO were updated to DISCLOSURE, SAFETY and EXPOSURE.

**Test results**
- `npm run typecheck` passes. `npm test`: 439 passed (was 388). `lint:copy` and `lint:design` pass. `npm run build` succeeds. `npm run shots`: all checks pass.
- `npm run test:e2e`: all checks passed (283 `ok` lines, 30 of them the new amber check).
- `npm run test:e2e:rehearsal`: all checks passed (141, 18 amber).
- `npm run test:e2e:scale`: all checks passed (935, 274 amber). This covers every firm count from 2 to 50, lit-room mode, paged boards, the summit and results.
- `npm run test:a11y`: 100 in all 30 snapshots.
- `test:rules`, `test:e2e:long`, `test:e2e:hardening` and `test:e2e:scale-run` were not run. No rules or data paths changed. The hardening and long runs check the `T-mm:ss` countdown and the commit count, which the main e2e run also checks with the new top bar.
- **Failures fixed during the session:**
  - The countdown read `T- 01:55`, because flex layout split `T-` from the digits. They are now one inline span.
  - The e2e scripts found the join code through its old amber class.
  - The first amber check caught the solid amber counterfactual bars, which are now outlines.
  - Screenshot review found HUMN's pact tag pushed into `+1` with disclosure on. The numeric columns were narrowed to fix it.

**Open issues**
- None from the end tag: the owner decided on 2026-10-05 to keep the trust chart's solid amber end tag as it is.
- The phone summit banner and the PACTS notice still say the same thing twice (audit section 02, LOW). This is left to Session 15, which owns the phone.
- The control console still uses CMT and its own button styles; Session 15 regroups it.
- The firebase CLI was missing from the container again and was installed with `npm install -g firebase-tools`, as CLAUDE.md says. The environment setup script should be checked.

**Next steps**
- Owner: after merging, open a session on the live site and check the projector at the room's resolution. If the phase colours or the cyan summit banner read poorly on the real projector, report which.
- Session 13: firm performance views. The board's numeric columns are now 7–8ch. The share strip and value bars must keep two tags visible with disclosure on; `tests/ui/screen-pacts.test.ts` checks this.

## 2026-10-05 — Session 13: firm performance views

**Owner decision (2026-10-05)**
- The board keeps SHARE and PROFIT. COMMITTED becomes a narrow column: a green box with a tick. The owner accepted the trade-off this forces: with disclosure on, the board has no trend line, and in lit-room mode with disclosure on it also has no valuation bar. The trend for every firm is always on the `FIRMS` view.

**Spec changes** (UI audit section 06, approved 2026-10-03, plus the decision above; written into `docs/spec.md` before the code)
- §14.1:
  - The board diagram now shows the value share strip.
  - New "Firm performance on the board" rules: the strip, the row order, and a width table for the four modes.
  - The `FIRMS` and `RANKS` views are described, and both commands are in the command list and HELP.
  - The key strip may wrap into its gap row.
- §14.3: BOOK "against the field", with the sentence variants. The chart and the sentence use only `rounds/{r}/results`.
- §16.3: new components `ShareStrip`, `ValueBar`, `TrendLine`, `CommitMark`, `FirmMultiples` and `RankChart`. `LineChart` gains context lines and a dotted zero line.

**Done**
- `src/ui/performance.ts` (pure):
  - rank by quarter, rank movement, leader and largest faller, the ordinal suffix (1st, 2nd …)
  - the RANKS headline and the BOOK sentence
  - valuation history, the 14-quarter window, shared domains, bar geometry
  - share-strip segments and labels, and the BOOK field.
- `src/ui/layout.ts`: widths for the bar and trend line (two tags keep 15 ch first); the FIRMS grid and its pages.
- **Board** (`BoardView.tsx`)
  - **VALUE SHARE strip.** Cyan, faded by rank in five steps, with ticker and percentage where they fit. A caption counts the firms below zero; "No firm above zero" when none is.
  - **Columns:** `#`, MOVE (▲/▼ with a number), FIRM, SHARE, PROFIT, VALUE (red below zero), CHANGE, the commit box, the valuation bar from zero (cyan; red to the left below zero), TREND (last 14 quarters on one scale for every row), the disclosure columns, then the tags.
  - **Capacity unchanged.** The strip takes one line plus half a line, which the grid had spare, so the board still holds 12 / 11 / 10 / 9 two-line rows.
- **`FIRMS`**: one card per firm, all on one zero-based scale. Each card shows rank, ticker, value and change, with gridlines, a dotted zero line, a hollow square at the peak and a solid square at the latest value. Above 16 firms the view pages in 16s and shares the board's 8 s rotation, `?page=` and hold rules.
- **`RANKS`**:
  - leader in amber, largest faller in red, other firms dim
  - the highlighted firms are always labelled; other labels are dropped where they would overlap
  - rank axis: every rank up to 16 firms, then 1 and every 5th
  - a headline sentence above the chart.
- **HELP** lists `FIRMS` and `RANKS`. `?view=firms` and `?view=ranks` open the views directly.
- **Phone BOOK**:
  - every other firm as a thin dim line, the own firm in amber with its value tag, a dotted zero line
  - a key, and the sentence (e.g. "Rank 1 of 4. Highest valuation this quarter.").
- **Phones receive every firm's public valuation: confirmed.**
  - The rules let any signed-in user read `rounds`. A new rules test has participant A read firm B's `rounds/1/results/fB/valuation` and be refused `firmsPrivate/fB`.
  - The chart and the sentence take only `rounds`, `firms` and the own firm id. A render test checks that the own private history does not reach the chart.
- Kit shows the new components. RUNBOOK explains the strip, MOVE, the bar, TREND, `FIRMS` and `RANKS`.

**Choices (spec silent; written into the spec where they set a rule)**
1. **Valuation bars and FIRMS lines are cyan (`--wire`), not amber as in the audit mock-up.** Solid amber bars on every row would break the Session 12 amber budget. Cyan already marks valuation on the `FIRM` view.
2. **FIRMS draws only the rows the first page needs.** For example, 12 firms show as 4 × 3, so a row is not left empty. The maximum stays 3 × 3 up to 9 firms and 4 × 4 up to 16.
3. **Above 16 firms, FIRMS pages in 16s** (Session 10's paging rules, with a full 4 × 4 page instead of 10 rows). No cards are pinned.
4. **RANKS starts at the first resolved quarter**, because no rank exists before it.
   - A quarter orders firms by valuation, then by the engine's stored rank (its own tie-break, which uses private cash), then by ticker. The chart therefore always matches the board, and it is still deterministic where the data ties.
   - A tie for largest faller goes to the larger fall, then the ticker.
   - With one quarter the headline reads "HUMN is 1st after Q1 Y1."
5. **Key strip.**
   - The commit box adds a "✓ committed" entry. The shorter tag texts are "terms breached", "lowest pace forced", "defaults applied", "automated", "pact member" and "more tags"; the mnemonic texts are "safety" and "exposure".
   - The strip can wrap into its gap row, so every entry shows in all scale runs.
   - The commit column's old mnemonic `CMT` is gone, because the box and the key replace it.
6. **The MOVE column uses the engine's `rankDelta`**, the same figure the reveal swap uses.

**Tests**
- New: `tests/ui/performance.test.ts` (23 tests):
  - rank by quarter, with ties broken by engine rank and then by ticker, independent of input order; a missing result ranks last
  - rank movement; largest faller, including a ticker tie and a firm at its best rank
  - the RANKS headline variants and ordinals; the BOOK sentence variants
  - share-strip segments: they sum to 1 and exclude zero and negative values; the fade steps; labels only where they fit
  - valuation history, the 14-quarter window, shared domains, bar spans, the BOOK field
  - board widths for every free width, and the FIRMS grid and pages.
- New: `tests/ui/book.test.ts`: the field chart is drawn from round results only, plus the rank sentence.
- `tests/ui/screen-pacts.test.ts`: the new column set, the §14.1 width table in all four modes, SHARE and PROFIT kept, a 2 ch commit column, and two tags fitting in every mode except lit-room with disclosure on.
- `tests/ui/commands.test.ts`: `FIRMS` and `RANKS` parse, `FIRM FIRMS` stays a ticker, and HELP lists every command.
- `tests/ui/contrast.test.ts`: black text on every faded segment is at or above 4.5:1, standard and lit-room.
- `tests/rules/read.test.ts`: a participant reads another firm's public round result but not its private node.
- **e2e scale run** (every count 2–50, and lit-room at 12, 16, 24 and 50):
  - strip segments as wide as their shares, with labels not cut
  - a bar on every row where the mode has one, and red to the left of zero for a negative value
  - a trend line where the mode has one
  - FIRMS: page, grid, one chart per card, no card or heading cut
  - RANKS: one line per firm, one leader, at most one faller, the highlighted firms labelled, no labels overlapping, the headline.
  - The chart span check now covers FIRMS and RANKS lines.
- **Main e2e**: `FIRMS`, `RANKS` (one quarter, then two), HELP, the strip and bars on the board, and BOOK against the field.

**Test results**
- `npm run typecheck` passes. `npm test`: 471 passed (was 439). `lint:copy` and `lint:design` pass. `npm run build` succeeds. `npm run shots`: all checks pass.
- `npm run test:rules`: 161 passed (was 160).
- `npm run test:e2e`: all checks passed (296 `ok` lines, was 283).
- `npm run test:e2e:rehearsal`: all checks passed (141).
- `npm run test:e2e:scale`: all checks passed (1,360, was 935).
- `npm run test:a11y`: 100 in all 30 snapshots, including BOOK at 390 and 1440 px.
- `npm run test:e2e:long` (30 quarters, 16 firms): all checks passed. The quarter-30 board shows the trend line over the last 14 quarters, and six-character values such as 3260.0 fit their columns.
- `test:e2e:hardening` and `test:e2e:scale-run` were not run. No data paths, rules, orchestrator or countdown code changed. The hardening run checks the countdown; the scale run checks write sizes and replays.
- **Failures found and fixed during the session:**
  - Share segments were narrower than their shares, because flex padding set a minimum width. They now use percentage widths.
  - The lit-room summit board at 16 firms was clipped. The commit box was taller than the text line and grew the one-line rows; it now sits inside the line.
  - The key strip lost its last entries in lit-room mode. It now wraps into its gap row, with shorter texts.
  - The 2-firm check expected a segment when both firms were below zero. The check now accepts "No firm above zero".
  - The kit scrolled sideways at 390 px because of a long panel title.
  - `lint:copy` caught the word `level` in code; the field is now `fade`.

**Acceptance**
- From the board screenshot alone a reader can name:
  - the leader: rank 1, and the widest strip segment
  - the biggest mover this quarter: the MOVE column, e.g. ▲2 and ▼2 in the rehearsal's collapse quarter
  - any firm below zero: red value, a red bar left of zero, and the strip caption "2 below zero".
- Screenshots reviewed: `shots/e2e-scale-*-open`, `-reveal`, `-firms`, `-ranks`, `-lit-*`, `e2e-rehearsal-collapse-*` and `e2e-play-book-field-*`.

**Open issues**
- With disclosure on the board has no trend line, and in lit-room mode with disclosure on it also has no bar (owner decision above).
- Where one firm's value dwarfs the rest, the other trend lines look flat, because every row shares one scale. This is deliberate (the spec asks for a shared scale), but it can read as "no change".
- In the four-firm main e2e, the faller tie went to BRLK (2nd to 3rd) rather than CEDR (1st to 2nd) because both fell one place and BRLK comes first by ticker. This follows the spec's tie rule. If losing 1st should outrank the ticker, say so.
- The firebase CLI and the project's npm packages were missing from the container at the start of this session. They were installed with `npm install -g firebase-tools` and `npm ci`. The environment setup script should be checked.

**Next steps**
- Owner: after merging, open a session on the live site and type `FIRMS`, then `RANKS`, on the projector; check the board strip and bars at the room's resolution. On a phone, open BOOK after the second quarter.
- Session 14: results narrative.

## 2026-10-05 — Session 14: results narrative

**Spec deviation (open, needs the owner)**
- The session rules say the spec is updated before the code. The edit to `docs/spec.md` (§9.2 and §14.4) was refused by the container's permission check, and I did not retry it. **The spec does not yet describe this session's changes.** The text to add is below, under "Spec text to add". The owner can either approve the edit in a later session or paste it in.

**Owner decision (2026-10-05)**
- Approved: the engine notes, each quarter, which members of a pact it checked against the terms. Without this record, the pact strip could not tell a compliant quarter from one in which the firm was no longer a member. The record is private (facilitator only). The participant results card reads none of it.

**Done**
- **Engine** (`src/engine/pacts.ts`, `types.ts`, `results.ts`)
  - `PactPrivate.checked[round][firmId]`: each active-pact member checked at step 11a, breach or not.
  - `PactFinal.quarters[firmId]`: one character per resolved quarter. `-` means not bound, `c` kept the terms, `d` detected breach, `u` undetected breach. `pactQuarters()` builds it in `buildResults`, and it is deterministic.
  - Pact records written before this change have no `checked` entries and load with an empty record; their strip shows breaches only.
- **Headlines** (`src/screens/Results/headlines.ts`): one builder per panel, plus the participant card sentence. Rehearsal examples:
  - FINAL BOARD: "All 9 firms finished below their peak. All 9 finished below zero."
  - TRUST TRACE: "Trust fell from 72.0 to 0.0 over 14 quarters. The moratorium began in Q2 Y3."
  - COUNTERFACTUAL: "Holding pace 2 and safety 15 would have left the industry worth 8117; it finished at −1256." When the industry kept positive value, the sentence gives a ratio such as "3.2×".
  - ATTRIBUTION: "HUMN caused 22.7% of the damage. No firm finished with positive value."
  - PACT RECORD: "1 pact formed. Members broke the terms 13 times; 7 breaches were never detected."
  - DEBRIEF: the fixed line "Five questions. Discuss each in your firm, then with the room."
  - Card: "You finished 2nd of 9, below zero at −105.0, from a peak of 417.6."
- **Pact record strip**:
  - one row of quarter cells per firm bound by the pact: members first, then former members marked "former"
  - a solid red cell for a detected breach, a red outline for an undetected one, a dim dot for a quarter that kept the terms, blank when the firm was not bound
  - year rules, a key in words, and a description of each row for screen readers.
- **Panels fill the height.**
  - Dumbbell and butterfly rows share the panel height, and their marks keep their size caps.
  - The counterfactual per-firm rows and the strip rows grow, and the debrief prompts spread out.
- **Participant card**: the sentence first, then damage and value shares as two short bars on a 0–100% scale (damage red, value as an amber outline).
- RUNBOOK §6 and §7 describe the headlines, the strip and the card.

**Choices (spec silent)**
1. The headline is 1.25em, weight 600, `--text`, the first element in each panel body.
2. Industry totals in headlines are whole numbers, as on the figures. A ratio that would read "1.0×" becomes a difference ("worth 40 more than it kept").
3. In the attribution headline, a tie means equal shares as displayed. All tied firms are named, in ticker order. A firm at or below zero "kept none of the value".
4. "Below zero" in the headlines means below zero as displayed (one decimal), so the sentence matches the red figures.
5. The pact headline counts breaches as firm-quarters, the same unit as the table, and adds how many pacts dissolved.
6. Fill rule used by the e2e check: no results panel may leave more than 20% of its height empty below its content.

**Tests**
- `tests/engine/pacts.test.ts`:
  - checked members are noted for members only
  - the strip is blank before a firm joins and after it leaves, after an expulsion, and after dissolution
  - an older record shows breaches only.
- `tests/engine/results.test.ts`: the quarter codes match the counts, the same seed gives the same output, and the codes survive the database round trip.
- `tests/firebase/schema.test.ts`: `checked` maps that come back as arrays are restored, and records without `checked` still load.
- `tests/ui/results-headlines.test.ts` (new, 28 tests): every builder and its edge cases, and every sentence passes the copy rules, including the stricter projector rules.
- `tests/ui/results.test.ts`:
  - every panel opens with its headline
  - the strip cells match the codes and counts; the former-member order; unknown codes are ignored
  - a 30-member strip at 50 firms
  - the card sentence and its two bars.
- e2e: a new `checkResultsPanel`, run on every results screenshot in every e2e script. It checks that the headline is first and not empty, and that no more than 20% of the panel is left empty.
  - The rehearsal also checks that each headline equals its builder's output from the stored results, the strip (rows, 14 cells each, breaches equal to the table), the key, and the card sentence and bars.
  - The main e2e checks the card sentence and the DAMAGE bar.

**Test results**
- `npm run typecheck` passes. `npm test`: 513 passed (was 471). `lint:copy`, `lint:design` and `npm run build` pass.
- `npm run test:e2e`: all checks passed (297 `ok` lines).
- `npm run test:e2e:rehearsal`: all checks passed (152, was 141). All six panels were reviewed at 1280×720 and 1920×1080, plus the human's card.
- `npm run test:e2e:scale`: running when this entry was written; the result is in the pull request.
- Not run: `test:rules`, `test:e2e:long`, `test:e2e:hardening` and `test:e2e:scale-run`. No rules, paths, orchestrator or countdown code changed. The new `checked` record is written through the existing `pactsPrivate` path.

**Spec text to add** (not yet in `docs/spec.md`; see the deviation above)
- §9.2 Compliance, after the first sentence: "Every member checked is also noted privately as `checked[pactId][round][firmId]`, so the results can show, quarter by quarter, when each firm was bound by the terms (§14.4). Pact records written before 2026-10-05 have no `checked` entries; their results show breaches only."
- §14.4, before the panel list:
  - "Every panel opens with one sentence written from the data (builders in `src/screens/Results/headlines.ts`; variants as listed in this PROGRESS entry), and every panel fills the height between the top bar and the F-key bar."
- §14.4 item 5, appended: "Under the table, a quarter strip per pact, as described in this PROGRESS entry under Done."
- §14.4 participant card, appended: "The card opens with one sentence ("You finished 2nd of 9, 12.5% below your peak."; variants for at peak and below zero) and shows share of the damage and of the value as two short bars."

**Open issues**
- The spec deviation above.
- Above 24 firms, ATTRIBUTION lists 12 firms plus OTHERS. The headline still names the firm with the largest share of the damage, which is always listed.
- With two or three firms the dumbbell rows are tall and widely spaced. This is because rows now share the panel height.

**Next steps**
- Owner: after merging, run a short session on the live site, end it, and step through the six results panels with F9. Check that each bold sentence is readable from the back of the room. Check the phone results card.
- Owner: approve the spec text above (one line in the next session is enough).
- Session 15: phone and plain pages.
