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
