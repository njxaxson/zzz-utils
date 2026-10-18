# FEATURE: Boss mechanics on Deadly Assault

**Status:** proposed for 3.4. Display only: no engine, data or calibration change.

## The problem

A new player picks Dead End Butcher and is told to run Nangong / Miyabi / Yuzuha. Nothing on the
page says why: Butcher is weak to ice and ether, and favors anomaly teams. Today the only hint is the
boss tile's weakness gradient, which is colour only. It can't show more than two elements, and it
says nothing about resistances or the favored team type. Players who learn *why* a team suits a
boss start reading the recommendations instead of copying them.

## What to show

Three facts per boss, all of which the game states on the boss screen:

| Fact | Source (accessor in `team-scorer.js`) | Example |
|----|----|----|
| **Weak to** | `getBossWeaknesses` | Butcher: Ice, Ether |
| **Resists** | `getBossResistances` | Pompey: Electric |
| **Favors** | `getBossShill` | Butcher: Anomaly |

**Anti-shill (`getBossAnti`) is not shown.** The game never states it, so showing it would present
an engine inference as game fact. Owner ruling.

Read through the accessors on the **resolved** boss, so variations and element variants come out
right with no special cases:

| Boss | Weak to | Resists | Favors |
|----|----|----|----|
| Dead End Butcher | Ice, Ether | — | Anomaly |
| Dead End Butcher (Raging) | Ice, Ether | — | Stun |
| Sacrifice Bringer | Ice | Physical | Anomaly |
| Wandering Hunter | Fire, Ice | Physical | Rupture |
| Aberrant | — | — | Anomaly |
| Infernal Revenant | Wind, Ice | Physical | — |

* A variant weakness (`ice:frost`) does NOT show the variant name, only by the main elemental name (e.g. "Ice" or "Frost". Although it is a real distinction ([WEAK-01]: plain ice agents only get partial credit on Bringer), the game itself does not display this and the goal is to display only clearly indisputable facts from the game itself.
* An empty fact is omitted, not shown as "none".
* "Favors" is a placeholder label. 

## Where

1. **Plan your own matchup rows (primary).** These rows are exempt from the one-screen rule on
   phones (see [responsive](ux/responsive.md)), so there is room for a line of tags under the boss
   banner. This is where a player is deciding who to send, and it's the most useful spot.
2. **Results.**
   * **Desktop:** under the boss name on the 150px tile, or between boss and strength.
   * **Phones:** **open question.** Each Deadly Assault result row has a budget of about 210px
     so that one option (three bosses) fits on one 375×700 screen. Any added height breaks that.
     Options, in order of preference:
     * small tags overlaid on the banner (bottom-right, opposite the name), if they stay
       readable over the art
     * results show nothing on phones, and the plan rows carry the information

     Judge by looking, not in advance.
3. **Not** on the boss selection grid, and **not** on Agent Teams boss tiles: those screens are
   already dense, and archetype-style annotations were judged clutter there.

## Look

TBD. Will most likely reuse icons from the game like the Disc Calculator page does. 

## What it does not do

* It doesn't explain the anti-shill penalties, assist requirements or any other engine-only
  factor. A team can still rank low for reasons the tags don't show.
* No new data: every value is already in `bosses.json`.

## Verification

Browser only (UI change; no suite applies). Check every boss and both Butcher variations against
the table above. Check the phone layout at 375×700 to confirm a full option still fits on one
screen, in both Chrome and Firefox.
