# CLAUDE.md — FRONTIER

Multiplayer classroom simulation: teams run AI companies over quarterly rounds. The model is engineered to produce a tragedy-of-the-commons collapse.
The source of truth is `docs/spec.md`. When this file and the spec disagree, the spec wins. When the spec is silent, ask; do not invent mechanics.

## Environment

- All work runs in Claude Code on the web (cloud containers). The owner has no local development setup and no terminal.
- Firebase CLI: installed by the environment setup script. If it is missing, install it with `npm install -g firebase-tools`.
- Emulators always use project ID `demo-frontier`. Never run `firebase login` or `firebase deploy`, and never request credentials.
- Security rules reach production only when the owner pastes `database.rules.json` into the Firebase console.
- The container cannot reach the live Firebase database. All automated testing is against the emulators.
- The owner tests the live site on GitHub Pages after merging your pull request.
- If the network proxy blocks a download, stop and report the exact blocked host name. Do not look for workarounds.
- The owner is not a developer. Pull request summaries and any manual steps must be in plain English, with exact clicks and URLs.

## Session protocol

1. Session instructions are in `docs/SESSIONS.md`. At the start of every session, read this file, `docs/PROGRESS.md`, and the session's section and the spec sections it names.
2. Present a short plan (files to change, tests to add) and wait for the owner to reply "go".
3. Work in small commits with imperative messages (`engine: add incident stream`).
4. At the end of the session:
   - run `npm run typecheck && npm test`
   - append a dated entry to `docs/PROGRESS.md` covering what was done, open issues, spec deviations (with reasons) and next steps
   - commit and open a pull request with a plain-English summary and any manual steps for the owner.
5. Never mark a task done if tests fail. Report failures plainly.

## Commands

- `npm run dev`: Vite dev server
- `npm run build`: single-file build to `dist/index.html`
- `npm test`: Vitest
- `npm run test:rules`: rules tests (requires `firebase emulators:exec`)
- `npm run calibrate -- --seeds 200`: calibration report to `reports/calibration.md`
- `npm run bots -- --game <id> --firms 8 --policy mixed`: emulator or live bot clients
- `firebase emulators:start --only auth,database --project demo-frontier`

## Architecture rules

- `src/engine/` is pure TypeScript.
  - No Firebase, DOM, `Date.now()` or `Math.random()`.
  - All randomness goes through `rng.ts` (mulberry32, seeded per game, round and stream).
  - Every function is deterministic and unit-tested.
- Every tunable number lives in `src/engine/params.ts` and nowhere else. Change values only through the calibration process (spec §8), and log each change in `docs/CALIBRATION.md`.
- The facilitator client is the only writer of resolution results.
  - It uses the lock-transaction plus single multi-path `update()` pattern (spec §11).
  - Never write partial results.
- Participants write only:
  - their own decision
  - their membership
  - their presence
  - pact membership for their own firm.
- Hidden values (τ, endRound, unaudited violations, other firms' private data) must never reach participant or projector code paths. Read them only in `#/control` and in the orchestrator.
- Countdown uses the server deadline and `/.info/serverTimeOffset`. Never write timer ticks to the database.
- RTDB paths are built only through `src/firebase/paths.ts`.
- Strict TypeScript. No `any` without a justifying comment.

## Design rules (spec §16)

- Use only the tokens in `src/ui/tokens.css`. No hex values in components.
- One typeface: IBM Plex Mono (self-hosted via @fontsource), with tabular figures.
- Layout snaps to the character grid: widths, columns and gutters in integer `ch`, and a fixed line height.
- Square corners, 1 px rules, flat fills.
- Forbidden: gradients, glow, blur, shadows, rounded cards, donut or pie charts, smoothed or area charts, emoji, decorative icons, sparkle or brain or circuit imagery, skeleton shimmer, fade-and-slide-up entrances, hover lift.
- Motion: only the single reveal sequence (spec §16.5) and responses to input. Respect `prefers-reduced-motion`.
- Never use colour alone for meaning: positive is `+`/`▲`, negative is `−`/`▼`.
- Touch targets ≥ 44 px. Keyboard focus is always visible.
- Never bind F5, F11 or F12. Every F-key has a Shift+letter alternative.

## Copy rules (spec §15)

- The voice is a financial terminal and wire service. Terse and declarative. Labels are short uppercase mnemonics; body and headlines are in sentence case. No exclamation marks, no emoji, no second-person cheerleading.
- Banned everywhere: unlock, empower, seamless, revolutionary, harness, elevate, supercharge, game-changer, dive in, journey, "welcome to the future", "in today's fast-paced", let's, awesome, great job, oops, "not just X but Y".
- **Non-telegraphing.** Never use these in participant or projector UI outside the results screen: commons, tragedy, sustainable or sustainability, cooperate or cooperation, collective, shared resource, tipping point, threshold, collapse (except the single moratorium headline), game, player, score, win, level.
- `npm run lint:copy` greps `src/screens` and `src/ui` for banned terms and fails the build on a hit. Keep it passing.
- Fictional entities only: Office of Frontier Systems (OFS), the Assembly, Halden Research. No real companies or people.
- Error messages state what happened and what to do next. No apologies.

## Testing expectations

- Engine: unit tests per resolution step, plus property tests:
  - T always stays in [0, 100]
  - shares sum to 1 ± 1e-9
  - same seed produces the same output
  - the counterfactual uses identical incident draws.
- Rules: every allow and deny in spec §13 has a test.
- UI: Playwright smoke test that runs a 3-quarter game with bots against the emulator.

## Owner preferences

- Formal, direct communication. Report uncertainty explicitly; never guess about Firebase or API behaviour. Check the docs or say so.
- Where the spec is ambiguous, stop and ask one question rather than proceeding on an assumption.
