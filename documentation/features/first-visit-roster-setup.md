# FEATURE: First-visit roster setup

**Status:** proposed for 3.4. UI only: no engine, data or calibration change.

## The problem

A first-time visitor gets the default roster: every released A-rank and standard S-rank owned
(Pyrois excepted, since he needs story progress), **no limited S-ranks**, and Nicole as FLEX
(`initializeUnitStates` in `lib/common/roster-ui.js`). Nothing tells them so. Three concrete
failures:

* A player who owns Miyabi opens her Agent Teams page and is told "Miyabi isn't in your roster".
* A player opens Deadly Assault, presses Find, and gets teams built only from standard agents.
  They conclude the site's advice is poor.
* FLEX exists only as a hint inside the roster panel, so most players never find it. Yet Rina
  goes from 3 qualifying teams to the full 5 when she's marked FLEX.

## When it shows

* **Only** when there's no saved roster (`localStorage['zzz-roster']` absent) **and** the page
  wasn't opened from a shared-roster link (`?roster=`). A shared link must open straight to its
  results.
* Once. Finishing or skipping it marks it done in this browser. A small "Set up your roster"
  link in the roster panel lets the player run it again.
* Same behaviour on every page that has the roster panel. It belongs in `roster-ui.js`, not in
  each page.

## Steps

Each step is skippable; **Skip setup** is always visible.

1. **Your limited agents.** A grid of the released limited S-ranks only, unowned by default; tap
   the ones you have. This is the step that matters most. The list comes from the `limited` flag in
   `units.json`, so there's no banner or version data to maintain.
2. **Check the rest.** "Every standard S-rank and A-rank is already marked owned", with a way to
   untick any you don't have, plus a one-line note about Pyrois.
3. **FLEX.** One sentence on what FLEX does (it lets an agent complete any team, even without their
   additional ability), and an offer to mark the player's **support or defense** agents. Never
   suggest DPS or stun agents, matching the FLEX tip rule on Agent Teams.
4. **Keep it safe.** The roster lives in this browser only; **Share** gives a link that restores it.
   (On phones that's the share sheet, once
   [Native share on mobile](mobile-native-share.md) ships.)

Then drop the player into the page they came to.

## Open questions

* **Modal or in-place?** A modal is simpler. Highlighting the real roster panel step by step
  teaches the panel they'll use later, but is more work and fragile on phones. Judge by looking.
* **Where does step 1's grid come from?** It could reuse the roster panel's own limited-S grid,
  or the shared agent picker (`agent-picker.js`) filtered to limited S. Reusing one of them is
  required; a third grid is not.
* Should step 2 exist at all? Most players own nearly every standard and A-rank agent, so it may be
  noise. If it's cut, the Pyrois note moves to step 1.

## What it does not do

* It doesn't import an account or read anything from the game.
* It doesn't change the defaults themselves, or how a roster is stored or shared.

## Verification

Browser only:
* Clear site data, then open each roster page and confirm it shows.
* Open a `?roster=` link and confirm it doesn't.
* Skip, then reload, and confirm it stays gone.
* Run it again from the roster panel.
* Check at 375px and 768px, in Chrome and Firefox.
