# FRONTIER facilitator runbook

Plain-English guide for running a class session. Nothing here needs a terminal.

- **Live site:** https://mxtdnl.github.io/frontier/
- **Facilitator pages** (sign-in needed): `#/new` creates a session, `#/screen/…` is the projector, `#/control/…` is your private console, `#/results/…` is the results sequence.
- **Participant page:** `#/j/CODE`, or type the four-letter code on the landing page.

A session runs in one of two modes, chosen on `#/new`:
- **Team mode:** 2 to 16 firms, each with 1 to 5 devices (teams of people share a firm).
- **Multiplayer mode:** 2 to 50 firms, one person each.

A typical session is 8 to 14 quarters (35 to 60 minutes) plus a 20 to 30 minute debrief.

---

## 1. One-time Firebase set-up

1. Open the Firebase console, project **frontier-sim**.
2. **Authentication → Sign-in method:** both **Anonymous** and **Email/Password** must show *Enabled*. If Anonymous is off, participants see "Anonymous sign-in is switched off for this project" and cannot join.
3. **Authentication → Users → Add user:** create your facilitator email and password. Copy the **User UID** shown in the list.
4. **Realtime Database → Data:** add a top-level node `facilitators`. Under it add a child named with your UID and set its value to `true` (the boolean, not the text "true"). Without this, sign-in works but the app says the account is not on the facilitator list, and it shows the UID it needs.
5. **Realtime Database → Rules:** paste the full contents of `database.rules.json` from the repository (each pull request that changes the rules lists the new text), then click **Publish**. Re-do this whenever a pull request says the rules changed.

## 2. Pre-class checklist

Do this the day before, then again 15 minutes before class.

- [ ] Open https://mxtdnl.github.io/frontier/ on the projector laptop. The landing page shows a "Session code" box.
- [ ] Sign in at `#/new` with your facilitator email. If you see "not on the facilitator allowlist", repeat set-up step 4.
- [ ] Run a **solo rehearsal** (section 8) at least once with the same laptop and projector. It takes about 10 minutes.
- [ ] Projector set to 1280×720 or 1920×1080, browser full-screen (F11 is for the browser, not the app). Zoom 100%.
- [ ] Second device for the console: your own laptop or phone, signed in with the same account.
- [ ] Phone on the room Wi-Fi opens the site and reaches the landing page.
- [ ] Decide the settings (section 3) and write the end rule down. The app never shows participants how many quarters there are.
- [ ] Keep the debrief prompts (section 7) ready. They appear on results panel 6.
- [ ] Browser: use a private window or a different browser for any device that will play as a firm. A browser signed in as the facilitator cannot also be a participant.

## 3. Create a session

1. Open `#/new` and sign in.
2. Choose settings, then press **Create session**:

| Setting | What it does | Suggested |
|---|---|---|
| Mode | **Team mode**: up to 16 firms, teams share a firm. **Multiplayer mode**: up to 50 firms, one person each. The mode name shows only on `#/new` and the console. | Team for teams of 3 to 5; Multiplayer when each person plays alone |
| Round timer (s) | Time to decide each quarter. You can add or remove 30 s later. | 120 |
| Auto-resolve at deadline | Resolves by itself when the timer ends. Off means you press F9. | Off for the first class |
| End mode | *Random within a range*: hidden end between the two numbers. *Fixed quarter*: you choose the end. *Manual*: runs until you press END, or quarter 30. | Random, 10 to 14 |
| Disclosure at start | Shows each firm's pace, safety and exposure on the board from the start. | Off |
| Automatic audit probability | Chance each pact is audited by itself each quarter. | 0.25 |
| Reveal TAU line on results screen | Draws the hidden collapse line on the trust trace at the end. | Off until the debrief decision |
| Lit-room display mode | Slightly larger type and stronger rules and secondary text, for a bright room. | As needed |
| Seed | Random, or a fixed number to replay the same market. | Random |
| Bot firms | Computer-run firms (labelled BOT) for small classes and rehearsal. **Add 10 mixed** adds ten at once with mixed policies. Bots count towards the mode's firm limit. | 0 to 4 |

3. The projector page opens (`#/screen/…`) showing the **join code**, a QR code and the address. Leave it on the projector.
4. On the second device open `#/control/<same session id>`. The address of the projector page contains the id; replace `screen` with `control`.

## 4. Running the session

**Lobby.** Teams scan the QR code or type the code. One person founds the firm (name, ticker, PIN). Teammates join with the PIN. Firm names appear on the projector with a member count. Wait until every team shows. You need at least 2 firms (bots count).

- **Multiplayer mode:** each person presses **Found your firm**. The PIN they are shown lets them rejoin from another phone (**Rejoin your firm with its PIN**) if theirs dies. Nothing stops a second phone joining someone's firm with their PIN, so tell the room to keep PINs to themselves.
- **Above 16 firms** the lobby lists firms in up to 4 columns: ticker and devices joined, or BOT.

- **Use at least 6 firms.** With 4 firms, one firm playing flat out can trigger the moratorium on its own in about 1 session in 5 (Session 9 review, finding M1). Add bot firms on `#/new` to reach 6 if the class is small.
- **Check the console's FIRMS panel before the briefing.** A firm whose PRESENCE reads *none* has no devices: its founder founded or joined another firm. Press **REMOVE** on that row twice within 3 seconds. Otherwise it plays on AUTO defaults all session. REMOVE works only in the lobby.
- **Press LOCK JOINS** (DANGER panel) as soon as every team has formed. This stops anyone founding extra firms or trying more PINs (Session 9 review, findings H1 and H2). **REOPEN JOINS** undoes it while you are still in the lobby.

**Briefing.** Press **F9**. This locks firm creation: nobody new can join after this point. A new device cannot be added later; a team that missed the lobby must be added by starting a new session. Read the briefing aloud.

**Each quarter.**
1. Press **F9** (or **Shift+A**) to open the quarter. The timer starts.
2. Watch the COMMITTED count on the board. Teams can change their decision until the timer ends.
3. Press **F9** to resolve. Teams that did not commit get the default decision and are marked AUTO. The board reveals the new results.
4. Press **F9** again for the next quarter.

**Reading the projector (Session 12).** The top bar shows the quarter, the phase as a coloured block with its word, the commit count, disclosure, and the countdown on the right. The line under it says in one sentence what is happening and what teams should do; after each reveal it summarises the quarter (trust change, who is 1st, incidents). The bar at the bottom shows only the keys that do something right now; the solid key is the one you most likely want next (usually **F9**, **F8** during a summit). Hidden keys still work if pressed. To type a command (`TRST`, `FIRM BTC`, `HELP`), just start typing: the command line appears in the top bar.

**Board pages (above 16 firms).** The board shows 10 firms at a time and turns to the next page every 8 seconds; the heading reads `PAGE 2/5`. Above the page, the leader and the firm that moved most (3 places or more) stay pinned. Rotation holds for 30 seconds after you press any key, and while you type a command. Each reveal starts on page 1. Use `FIRM <TICKER>` for any one firm's history.

**Summit.** Press **F8** during an open quarter or a reveal. The timer pauses and decisions are refused ("Industry summit in session"). Teams can propose, join and leave pacts. Press **F8** again to return.

**Audit.** Press **F6** (**Shift+F**), then the number of the pact. The audit runs when the quarter resolves. The result appears in the wire, on the board as a BREACH tag, and on the console.

**Disclosure.** **F7** (**Shift+D**) turns the PACE, SAFETY and EXPOSURE columns on or off. In lit-room mode they are headed SAFE and EXPO, explained in the key strip under the board. They fill in at the next resolution.

**Collapse.** When trust falls below the hidden line, the reveal shows the moratorium headline. Press **F9** to continue under the moratorium or **F10** to end.

**Ending.** The session ends by itself at the hidden end quarter, or after quarter 30. Press **F10** twice within 3 seconds to end early. If you press it during an open quarter, that quarter is discarded.

### Key map

| Key | Alternative | Action |
|---|---|---|
| F2 | Shift+B | Board |
| F3 | Shift+T | Trust history |
| F4 | Shift+P | Pacts |
| F6 | Shift+F | Audit a pact |
| F7 | Shift+D | Disclosure on or off |
| F8 | Shift+S | Summit in or out |
| F9 | Shift+A | Advance: lobby → briefing → quarter → resolve → reveal → next quarter. After the session ends, opens and steps the results. |
| F10 | Shift+E | End the session (press twice within 3 s) |
| Esc | | Back to the board |

Type in the command line at the top of the projector, then press Enter: `BOARD`, `TRST`, `PACT`, `WIRE`, `FIRM <TICKER>`, `HELP`. F1, F5, F11 and F12 do nothing in the app, so the browser keeps them.

If a key press shows "Working on the last key. Press again in a moment.", the previous action is still finishing. Wait a second and press again.

### The console (`#/control/…`)

- **Control strip** at the top stays in view however far you scroll: **F7 DISCLOSURE**, **F8 SUMMIT**, **F9 ADVANCE**, **F10 END**, **F6 AUDIT**, the phase, the quarter, the commit count and the latest message.
- **Session panel:** phase, quarter, trust, timer, **−30 s**, **+30 s**, **Pause** and **Resume**, and the **MODE** with its firm limit.
- **Hold to reveal TAU** and the end quarter: they show only while you hold the button down. Use them privately. Never show the console on the projector.
- **Firms panel:** who is online (**ON** shows devices online out of joined), who has committed, when, AUTO forecast, bot policy. In the lobby each row also has **REMOVE** (press twice within 3 s). The table scrolls inside the panel. **SORT** by **FIRM**, **CMT** (firms still to commit first) or **ONLINE** (fewest online first). **SHOW** **NOT COMMITTED** (during an open quarter) or **OFFLINE** (human firms with no device online).
- **LOCK JOINS / REOPEN JOINS** (DANGER panel, lobby only): closes or reopens joining before the briefing.
- **Pacts panel:** unaudited counts, an **AUDIT** button per pact, audit outcomes.
- **Export:** **DOWNLOAD HISTORY (.json)** and **DOWNLOAD DATA LINES (.txt)**. Download both before you delete the session.
- **DELETE SESSION:** press it, type the four-letter code, then press **CONFIRM DELETE**. It cannot be undone.

## 5. If something goes wrong

| What you see | What to do |
|---|---|
| The projector page was refreshed or the laptop slept | Reload the page and sign in if asked. The quarter, countdown and committed ticks come back from the database. Nothing is lost. |
| Two windows open for the same session | Safe. Pressing F9 in both resolves a quarter once. The second press is refused. |
| Console says **Resolution incomplete — retry** | The quarter did not finish writing. Press **Retry resolution** once. Nothing was written, so no results are half-saved. |
| Results do not appear after the session ends | The console shows "Results are not written yet". Press **Retry results**. Check the connection. |
| A team says "Joining is closed" | Joining closes at the briefing. A team that missed the lobby cannot be added to a running session. A returning device that was already in a firm can always reconnect. |
| A team's phone shows "Offline. Reconnecting automatically." | It reconnects by itself. Their last commit is kept. Committing is paused until the connection returns; they can recommit afterwards if the timer is still running. |
| A phone clock is wrong | Not a problem. The countdown and the deadline use the server clock. |
| A team did not commit in time | They receive the default decision, marked AUTO, and the quarter proceeds. |
| You pressed END by mistake | A single press only arms it for 3 seconds. A second press ends the session and cannot be undone. |
| The wrong person is on the facilitator list | Remove their UID under `facilitators` in the Realtime Database data tab. |
| A firm you do not recognise, or an unexpected device in a firm, appears in the lobby | Press **REMOVE** on that firm. If a device appears in the wrong firm, remove the firm and ask the team to found it again with a new PIN. Then press **LOCK JOINS**. |
| More firms formed than the mode allows (16 in team mode, 50 in multiplayer mode), so F9 refuses to start | Press **REMOVE** on the extra firms (start with those whose PRESENCE reads *none*). The mode cannot be changed after creation; create a new multiplayer session if a team session is too small. |
| In multiplayer mode, someone's phone died | On another phone they open the site, type the code, press **Rejoin your firm with its PIN**, pick their ticker and enter the PIN they were shown when they founded it. |
| A phone says "Another device is joining this firm. Wait a few seconds and try again." | Several teammates joined the same firm in the same second; each join takes its turn, one per second. Ask them to press **Join the firm** again. If it keeps happening, press **LOCK JOINS** once every team has formed. |
| A wrong PIN always shows "Another device is joining this firm" after about 10 seconds | The Firebase rules are older than the app. Paste the current `database.rules.json` (set-up step 5). |
| A team cannot join with the PIN | Check that they chose the right firm. The PIN is shown on the founding phone and on its DESK tab. |
| "Anonymous sign-in is switched off for this project" on a phone | Anonymous sign-in is off. See set-up step 2. |
| The board lags behind after a network drop | Wait a few seconds. If a tick stays missing, reload the console. Committed ticks need one open projector or console window. |
| Anything else | Reload the page. If a quarter is stuck in RESOLVING, use Retry. If the database is unreachable, pause the class and check the Firebase status page. |

Never ask a participant to read out a hidden value. The projector and the participants' phones never show τ, the end quarter or unaudited violations.

## 6. After the last quarter

1. When the session ends, press **F9** on the projector to open the results.
2. Download both exports from the console, **before** deleting anything.
3. Participants see their own results card on their phones (rank, valuation compared with the sustainable path, their exposure share, their own undetected violations).

## 7. Debrief flow

Allow 20 to 30 minutes. On the projector, press **F9** to step forward and **Esc** to step back. The step is saved, so a reload returns to the same panel.

With about 20 firms or more, two panels hold a list that scrolls inside the panel (the heading and the axis stay in view):
- **FINAL BOARD**: every firm in rank order.
- **COUNTERFACTUAL**: the per-firm comparison on the right.
- Scroll with the mouse wheel or trackpad, or with **↓ ↑**, **Page Down**, **Page Up**, **Home** and **End**. F9 and Esc still move between panels.
- **ATTRIBUTION**: above 24 firms, the 12 firms with the largest share of the damage, then one **OTHERS** line that adds up the rest.

1. **FINAL BOARD.** Who finished first? Each firm has a line from its peak (hollow square) to its final valuation (solid square); red squares finished below zero. Ask which teams peaked early.
2. **TRUST TRACE.** Point at the labelled MORATORIUM line if there was one, and at the red squares (quarters that lost 5 or more trust). If you want the hidden threshold shown (a dashed red line with a hatched band below it), it must have been switched on at creation.
3. **COUNTERFACTUAL.** Three figures: the industry's actual value, the ALTERNATIVE (every firm at pace 2, safety 15) and the VALUE LOST between them. If the industry finished below zero, no percentage is shown. The hatched area on the chart is the trust lost. Ask whether any single firm could have prevented it.
4. **ATTRIBUTION.** Each firm's share of the damage (red, to the left) against its share of the value (amber, to the right). If no firm finished above zero, the right side says so. This is the fairness conversation.
5. **PACT RECORD.** Violations that no audit caught are now shown. Ask what the pacts did and did not achieve.
6. **DEBRIEF.** Five prompts, shown on screen:
   1. When did your firm first notice trust falling, and what did you change?
   2. Which pacts held and which broke? Was the difference monitoring, sanctions or trust?
   3. Compare your share of the damage with your share of the value. Is that outcome fair, and who should pay?
   4. Would disclosure from quarter 1 have changed your decisions? Why?
   5. Where does this pattern appear in the real AI industry, and which of Ostrom's design principles would you add to the market?

The results screen is the only screen where the app's wording may name the commons problem directly. Use that vocabulary freely once you reach it.

## 8. Solo rehearsal with bot firms (on the live site)

The computers in the cloud cannot reach the live database, so a live rehearsal uses the **in-app bot firms**. You need only your laptop, and optionally your phone.

1. Sign in at `#/new`.
2. Set **Round timer** to 30, **Auto-resolve at deadline** on, **Fixed quarter** 6, **Fixed, for rehearsal** seed 7 (the same market every time).
3. Under **BOT FIRMS** press **Add bot firm** six times. Give them different policies (cautious, standard, greedy, mimic-leader).
4. Press **Create session**. On your phone, in a private browser tab, open the site, type the code and found a firm named Test Works with ticker TEST.
5. On the laptop press **F9** (briefing), **F9** (quarter 1). Commit a decision on the phone. Watch the board: all bots count as committed.
6. During a quarter, press **F8** (summit) and back, **F7** (disclosure) and **F6** (audit) once you have proposed a pact on the phone's PACTS tab.
7. Let auto-resolve run through the quarters. When the session ends, press **F9** to step through the six results panels and check the card on the phone.
8. On the console download both exports, then **DELETE SESSION**.

What to check: the countdown is the same on laptop and phone; the board is readable from the back of the room; your phone's result card appears at each reveal; the results panels fit the screen.

## 9. Running 40 to 50 people

- **Teams of 3 to 5** (10 to 16 firms): use **team mode**. A test with 16 firms on 50 devices ran 14 quarters without errors (`reports/scale-run.md`).
- **One person each** (up to 50 firms): use **multiplayer mode**. A test with 50 firms on 50 devices ran 14 quarters without errors. Until Session 16 recalibrates the model, expect a mixed room to reach the moratorium later than a small class, and often not within 14 quarters (`docs/CALIBRATION.md`, Session 10).
- **Connection limit (check before the class).** Every open browser tab holds one live connection to the database: about 50 phones plus the projector and the console. The free (Spark) plan has a limit on simultaneous connections. This was **not verified** in Session 10 because the Firebase documentation could not be reached from the build environment. The limit is believed to be 100, but that has not been checked. To check it, open https://firebase.google.com/pricing and find the Realtime Database limit on simultaneous connections for the plan your project is on (the Firebase console shows which plan the project uses). The exact console clicks were not checked in Session 10.
- Ask participants to keep one tab open each. A second tab, or a laptop and a phone at the same time, counts twice.

## 10. Where the technical details are

- Full rules and numbers: `docs/spec.md`.
- What each build session did, and what is still open: `docs/PROGRESS.md`.
- How the market was tuned: `docs/CALIBRATION.md` and `reports/calibration.md`.
- Automated checks (developer commands, run in Claude Code): `npm test`, `npm run test:rules`, `npm run test:e2e`, `npm run test:e2e:rehearsal`, `npm run test:e2e:long`, `npm run test:e2e:hardening`, `npm run test:a11y`, `npm run audit:build`.
