# Independent review (Session 9)

Date: 2026-10-02. Scope: security, model, copy and design, as set out for Session 9 in `docs/SESSIONS.md`. No features were added. I fixed one high finding (H1). The other high finding (H2) needs a decision from the owner, because every complete fix changes spec §13. Everything else is listed for the owner to decide.

Severity scale:
- **Critical**: breaks a class session or exposes hidden values to participants with no special effort.
- **High**: one participant can spoil a session or another firm's play, or a facilitator cannot recover without starting again.
- **Medium**: a real weakness that needs effort to exploit or has a workaround.
- **Low**: a minor or cosmetic issue, or a spec-level observation.

## Summary

| # | Severity | Finding | Status |
|---|---|---|---|
| H1 | High | Firms left with no members, and extra firms, cannot be removed | **Fixed** (REMOVE and LOCK JOINS on the console) |
| H2 | High | A firm's 4-digit PIN can be guessed in seconds while joining is open | **Partly mitigated** (LOCK JOINS). A full fix needs an owner decision |
| M1 | Medium | One firm alone can trigger the moratorium when there are 4 or fewer firms | Open: runbook advice added; parameter choice for the owner |
| M2 | Medium | Tickers are not unique in the rules | Open |
| M3 | Medium | Pact fines barely touch a firm with little or negative cash | Open |
| L1–L10 | Low | See below | Open |

No critical findings.

---

## 1. Security

Each threat was tested against `database.rules.json` in the emulator (`tests/rules/audit.test.ts`, 11 tests) and against the client code (`tests/ui/hidden-paths.test.ts`, 6 tests).

| Threat | Result | Evidence |
|---|---|---|
| A participant uses developer tools to read hidden values | **Refused.** `engine` (τ, end round, seed), `pactsPrivate`, other firms' `firmsPrivate`, `firmSecrets` and decisions, the member and presence lists and `results` before the end are all denied, to members and non-members alike. No public node contains τ or the end round. | `audit.test.ts` "reading hidden values" |
| τ and the end round reach `#/screen` or `#/play` | **No.** The participant pages (`#/`, `#/j`, `#/play` and the results card) never load the facilitator hooks or the orchestrator: the test walks their whole import graph. The projector runs the orchestrator, because F9 resolves quarters, but its own code never subscribes to or renders `engine` or `pactsPrivate`, and no orchestrator message contains τ or the end round. The e2e run also checks that τ is absent from the projector's page. A mutation check (adding an `engine` hook to the desk) fails the test. | `hidden-paths.test.ts`; `npm run test:e2e` |
| Writing another firm's decision | **Refused**, including for a bot firm, and inside a multi-path update that also writes the member's own decision: that update fails as a whole and writes nothing. | `audit.test.ts` |
| Late writes | **Refused**: more than 3 s after the deadline, while paused (no deadline), while resolving, for a past quarter, and with a back-dated client timestamp. | `audit.test.ts`, `participant.test.ts` |
| Forging results | **Refused.** Participants cannot write `public`, `firmsPublic`, `firmsPrivate`, `rounds`, `results`, `engine`, `pactsPrivate`, `wire`, a pact's status or an existing firm. A participant cannot create a firm marked as a bot. | `audit.test.ts` |
| Guessing PINs | **Possible while joining is open.** See H2. | `scripts/audit-pin.ts` |

### H1 (High, fixed): firms left with no members, and extra firms, could not be removed

**What happened.**
- In the normal join page, a device already in a firm is offered "Found a new firm" and "Join a different firm".
- Doing either leaves the old firm in place. If that device was its only member, the old firm has no members.
- Nothing could remove it. The spec's DANGER panel (§14.2: "remove a firm, lock joins") had only DELETE SESSION.
- A firm with no members plays on AUTO defaults (pace 2, safety 10) for the whole session. It counts in N, takes market share and sits on the board.
- With developer tools, one device can found any number of firms (the rules have no cap). More than 16 firms makes F9 refuse to start, and the only way out was to delete the session.

**Reproduction (before the fix).**
1. On a phone, found firm SPAR, then on the same phone found firm GONE.
2. The projector lobby lists both firms. SPAR's MBRS reads 0, and the console's PRESENCE reads *none*.
3. Press F9. SPAR is in the market for the whole session.

`tests/emulator/orchestrator.test.ts` ("removes a firm left without members…") reproduces steps 1–2 through the real rules.

**Fix.**
- `#/control`, FIRMS panel, lobby only: a **REMOVE** button per firm (press twice within 3 s). One update removes the firm, its PIN and its devices' memberships (`removeFirm` in `src/firebase/orchestrator.ts`).
- Removal is refused after the lobby, because the market is built from the firm list at the briefing.
- DANGER panel: **LOCK JOINS** / **REOPEN JOINS**, lobby only (`setJoinsLocked`). The briefing still locks joining, as before.
- `docs/RUNBOOK.md`: check for PRESENCE *none* before the briefing, and lock joins once teams have formed.
- Tests:
  - 6 orchestrator unit tests
  - 1 emulator test through the real rules
  - an e2e step that founds twice from one device, removes both firms from the console, and locks and reopens joins.
- No rules change was needed: the facilitator could already write these nodes.

### H2 (High, partly mitigated): a firm's PIN can be guessed in seconds while joining is open

**What happens.**
- Joining checks a 4-digit PIN in the rules (§13). The rules refuse a wrong guess but cannot slow guessing down or count failures, because a refused write leaves no trace.
- One anonymous client against the emulator found a PIN after 7,400 guesses in 6.6 s, about 1,100 guesses per second. All 10,000 PINs take about 9 s. The live database's rate was not measured (the container cannot reach it), so I cannot give the real figure; it is likely slower, but not by enough to matter.
- A device that gets in stays a member after joining closes (rejoining is always allowed). For the rest of the session it can read that firm's cash, capability and decisions, and it can overwrite the firm's decision every quarter. The intrusion is visible: the device appears in the console's PRESENCE column, and its device initials appear on the victim's commit line.
- Doing this needs a short script run from the browser's developer tools against the Firebase REST interface. It is not possible from the app's own pages.

**Reproduction.**

```
firebase emulators:exec --config firebase.test.json --only auth,database --project demo-frontier "npx tsx scripts/audit-pin.ts 7391 100"
```

Output: `PIN 7391 after 7400 guesses in 6.6 s (1119 guesses per second, batches of 100).`

**Mitigation in place.**
- **LOCK JOINS** (H1 fix) lets the facilitator close joining as soon as teams have formed, which shortens the window to the minutes teams take to form.
- The runbook says to check the console for unexpected devices and to remove an affected firm in the lobby.

**Full fix options (the owner chooses; each changes spec §13):**
1. **Per-firm join throttle (recommended).**
   - Joining becomes two writes. The first records the guess at `joinRequests/{firm}/{uid}` and stamps `joinThrottle/{firm}`. The rules allow at most one such stamp per firm per second, whoever writes it.
   - The membership write is then accepted only if its PIN matches both the recorded guess and the firm's PIN.
   - Every guess therefore costs one throttled write. 10,000 guesses take about 2.8 hours.
   - Cost: a new node in the data model and the rules, a small change to the join call, rules tests, and the owner pastes new rules. A teammate who joins in the same second as another is told to retry, which the app can do automatically.
   - Side effect: someone spamming the stamp can delay real joins to that firm.
2. **6-digit PINs.** 100 times more guesses: about 15 minutes for every PIN at the emulator's rate. This is simple, but not enough on its own while joining stays open for several minutes.
3. **Accept the risk** with LOCK JOINS and the console check (no further change).

---

## 2. Model

PLACEHOLDER_MODEL

---

## 3. Copy and design

**Copy.**
- `npm run lint:copy` passes (49 files).
- I also checked, by script and by hand, every string that reaches participants or the projector from outside `src/screens` and `src/ui`:
  - engine headlines (57 templates)
  - the live wire
  - orchestrator and Firebase error messages shown on the projector or console.
- No banned or telegraphing term appears outside the moratorium headline and the results screen. There are no exclamation marks, no apologies and no emoji. The hits were internal identifiers only (the `games` database path, the `collapse` headline kind, the `game=` key in exported DATA lines).

**Design.**
- I reviewed screenshots from `npm run test:e2e` against §16.4 and the character grid:
  - participant at 360×640, 390×844 and 1440×900
  - projector at 1280×720 and 1920×1080.
- No gradients, glow, blur, shadows, rounded cards, pie charts, smoothed charts, emoji or decorative icons. Columns sit on whole `ch` widths.
- The automated checks pass: no clipping, no horizontal scroll, touch targets of at least 44 px, text of at least 14 px.

Low findings from this pass are L6–L8 below.

---

## 4. Low findings (for the owner to decide)

PLACEHOLDER_LOW
