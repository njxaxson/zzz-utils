# UX conventions

How team and pull results look, and why. Read this before touching the markup or CSS of any
results display. The scoring side is in [`../engine/`](../engine/); none of this changes a score.

| If you are... | Read |
|----|----|
| Adding or restyling a results card | [result-cards](result-cards.md) |
| Touching a unit or boss tile, or its image | [tiles](tiles.md) |
| Changing widths, breakpoints or spacing | [responsive](responsive.md) |
| Adding a page, or touching colours, fonts, `<head>` or base styles | [style-guide](style-guide.md) |
| Working on one specific page | [pages](pages.md) |
| Working on favorite teams (star, Favorites page, share link) | [favorites](favorites.md) |
| About to try a layout that feels obvious | [decisions](decisions.md) — several have already been tried and rejected |

## The five result pages

| Page | File | What a result is |
|----|----|----|
| Team Builder | `team-builder.html` | Teams grouped by element, then DPS type |
| Team Recommendations | `team-recommendations.html` | Ranked teams against one custom boss |
| Deadly Assault Matchups | `deadly-assault.html` | An option = one team per boss, three bosses |
| Agent Teams | `agent-detail.html` | A team, with the bosses it is best against |
| Pull Recommendations | `pull-recommendations.html` | A gap, with the agents that would fill it |

## The one idea

Every result is a **card with a coloured accent and a darker panel of portrait tiles**.

* The **accent** says how good the result is (or which element it is). It is a left bar on
  desktop and a top bar on mobile.
* The **tiles** are square portraits with the name on them. Units are always tiles, never pills,
  bars or avatars in circles.
* The **darker panel** holds the tiles and is cut off from the text or boss above it by a rule.

The Agent Teams page was the model; the other four were brought into line with it.
