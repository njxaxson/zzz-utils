# Result cards

Shared CSS lives in one place: the **RESULT CARDS (shared)** section of
`app/public/styles/style.css`. A page adds only layout.

## Markup contract

```html
<div class="<page-class> result-card band-good"> ... </div>
```

`result-card` supplies the background, the 1px outline, the 4px left accent and the 8px radius.
The second class picks the accent. Page classes (`recommendation-row`, `da-row`, `ad-row`,
`pull-rec-card`, `team-grid-row`) must **not** redeclare background, border or radius.

| Accent class | Used by | Meaning |
|----|----|----|
| `band-excellent` … `band-bad` (and `band-abysmal`) | Team Recommendations, Deadly Assault, Agent Teams | Team strength, from `getStrengthRating()` in `strength-rating.js` |
| `priority-high` / `-medium` / `-low` (on `.pull-rec-card`) | Pull Recommendations | Pull priority |
| `element-fire` … `element-lumen` (on `.result-card`) | Team Builder | The element the card groups |

Tier colours come from `STRENGTH_TIERS` in `strength-rating.js`. `bad` renders as `risky` red
because the tier's own dark red disappears on the page background. If you change a tier colour,
change it in both places.

**A lenient result never reads better than OK.** `getStrengthRating(score, team, { lenient })` holds
the label (and so the band accent) at OK for any lenient-scored team, whatever its number, and the
label keeps its `*`. Every page that shows a strength label passes the flag ([LEN-04](../engine/element-resistance.md)).

**Abysmal** sits below Bad and is not a score band: it has no cutoff and is only returned when a
result is flagged `unscorable`, i.e. a team the player pinned on Deadly Assault that the engine
cannot score even leniently (no DPS, an illegal join with no valid pair, triple DPS, or two or
more defensive assists short; see [lenient mode](../engine/element-resistance.md#lenient-mode)).
It never shows a lenient asterisk.

## How the accent is wired

Each accent class sets custom properties; `result-card` reads them.

| Variable | Effect |
|----|----|
| `--band` | Accent colour (left bar on desktop, top bar on mobile) |
| `--band-rgb` + `--band-tint` | Optional faint left-to-right tint. Only the top tiers set it |
| `--band-edge` | Outline colour on mobile. Defaults to `--border-color` |

To add an accent type, add a selector that sets `--band`. Do not add new border rules.

## Sections and rules

A card is cut into sections with shared tokens (in `:root`):

* `--panel-dark` — the darker panel behind tiles
* `--rule-soft` — a hairline between sections on desktop
* `--rule-strong` — the solid rule between boss and team on mobile

A rule that lands between two *short* items reads badly (a vertical rule either side of a label
looked like an "H"). Use spacing there, not a rule.

## Desktop and mobile

| | Desktop | Mobile (≤600px) |
|----|----|----|
| Accent | 4px left bar | 4px top bar, soft outline |
| Card layout | Page-specific, content left-aligned | Stacked: header strip, then the tile panel |
| Between cards | 0.75rem | **1.75rem** — the gap is what shows where one result ends |

`agent-detail.html` switches to the stacked layout at 900px instead of 600px because its bosses
need the room, and keeps its own small rule for that (it still reads the same variables).

## Hover

Result cards have **no hover effect**. They are not clickable, and a highlight implies they are.
Do not add one unless the card becomes interactive.
