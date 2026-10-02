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
