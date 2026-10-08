# Favorite teams

A player stars a team on any results page and keeps it on the **Favorites** page. A favorite is
then an input (Agent Teams, a Deadly Assault plan slot), is marked wherever the same trio appears,
and can be shared as a link. It remembers; it does not recommend. No engine, data or calibration
change, so the verification loop is unaffected. How the page and the star look:
[pages](pages.md#favorites).

## What the player can do

| Action | Where |
|----|----|
| Star or unstar a team | Every team card (Team Builder, Team Recommendations, Deadly Assault results, Agent Teams results); beside the Agent Teams focus slots once three agents are chosen, so a what-if team can be saved; at the end of a Deadly Assault plan row once a boss has a full team (desktop only) |
| Build a team directly | **Add a team** row at the bottom of the Favorites page: three picker slots, then **Save** |
| Open it in Agent Teams | **Bosses →** on a favorite (`agent-detail.html?agents=a,b,c`) |
| Fill a Deadly Assault boss, or the Agent Teams focus bar | The **Favorite teams** strip in the shared agent picker; one click fills all three slots |
| Share the list | **Share** copies `favorites.html?teams=...` |
| Remove | The star on the Favorites page (a toast offers Undo) |

Saved favorites are never edited: delete one and add a new one. There is no naming, no reordering
(newest first) and no boss scoring on the page; **Bosses →** hands that to Agent Teams.

## Identity and storage [FAV-01]

* A team is **three agent ids, sorted**, joined with `|` (the convention in `team-builder.js`).
  Order never matters, so the same trio is filled-in on every page whichever way it was built.
  Deadly Assault's `threeCharTeams` labels are not id-based and are not reused.
* `localStorage['zzz-favorites'] = { v: 1, teams: [[id, id, id], ...] }`, newest first, **at most 12**.
  Ids only: no names and no scores, so nothing goes stale when the engine, data or calibration changes.
* Ids are resolved at display time. An id missing from `units.json` shows a dashed "Removed agent"
  tile and a note, and the stored data is kept. Such a team is left out of the picker strip, which needs three real agents.
* Bad storage (bad JSON, wrong shape, repeats, wrong length, over the cap) is sanitised on load, in
  the same spirit as `sanitizePicks` for the Deadly Assault plan.
* At the cap an unsaved star does not toggle and a toast says so; a saved star always un-saves.
* Unowned agents are allowed (what-if teams are a main use). They are flagged "Not owned", never removed.
* The data lives in this browser only and is lost if site data is cleared. The page says so, which is
  the reason Share exists.

## Shared lists

* Link grammar matches the Deadly Assault `plan=` parameter: `teams=a.b.c,d.e.f` (`.` inside a team,
  `,` between teams). The decoder drops malformed entries, repeats and anything past 12.
* A `?teams=` link opens the Favorites layout **read-only** and writes nothing on load, for the same
  reason Deadly Assault does not write storage for a shared boss list: a link must not overwrite a viewer's own data.
  Stars on that page save or unsave a team into the viewer's own list; **Add all** adds the lot, skipping repeats and anything past the cap.
* Ownership on a shared list is judged against the viewer's own roster. The link carries no roster.
* The site is static, so a pasted link unfurls with the generic site card and cannot show the teams.
* A `?roster=` link carries no favorites, so stars on a shared-roster page write to the viewer's own list.

## Code map

| File | Role |
|----|----|
| `lib/common/favorites.js` | Pure logic: identity, sanitising, toggle, add-many, share encoding, resolving ids to units |
| `lib/common/favorite-star.js` | The star (an inline SVG, not a text glyph, so it centres against labels), the in-memory list every star reads, toast, tab sync, the third-tile overlay helper |
| `lib/pages/favorites.js` | The Favorites page, its Add a team row and the shared-list view |
| `lib/common/agent-picker.js` | Optional `getPresets`, which renders the Favorite teams strip |

## Not wanted

* **Multiple rosters per player.** Almost no one maintains more than one account.
* **A saved-matchup object** (three teams plus three bosses). Each Deadly Assault row saves one team.
* **Automated tests for the UI helpers.** Tests here guard the engine and solver.
