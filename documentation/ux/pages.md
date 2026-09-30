# Page by page

Structure only. For the shared pieces see [result-cards](result-cards.md) and [tiles](tiles.md).

## Team Recommendations

One card per ranked team. Desktop: a left column (rank, strength label, score) then three 120px
tiles. Mobile: a header line (rank, strength, score) over a dark panel of three tiles.
Accent: strength band.

## Team Builder

No score, so no strength accent: each **element** is one card (left bar in the element colour;
on mobile a top bar). Inside it each DPS type is a labelled row, and each team in that row is
its own bordered card with three 100px tiles. Desktop puts the label left of its teams, which
wrap; mobile stacks the label above. Element/DPS pairs with no teams emit no cell at all.

## Deadly Assault Matchups

A carousel; each slide is an **option** with three rows, one per boss. Desktop row:
boss tile (150px) · strength · three unit tiles. Mobile row: boss banner with the strength badge
over it, then a dark panel of three tiles under a solid rule. Accent: strength band per row.
Prev/next buttons float over the slide title on mobile so the tiles get the full width.

## Agent Teams

The reference design. Desktop: team on the left, that team's best bosses on the right, divided
by a hairline. Mobile (≤900px): team panel (darker, solid rule beneath), then the boss list.
Accent: the team's best matchup band. Its styles are inline in `agent-detail.html`.

## Pull Recommendations

Three parts: the Roster Health card, the banner strip, and the recommendation cards.

* **Recommendation card:** priority badge, title and reasons on top; a dark panel of 100px
  candidate tiles underneath (they wrap — a gap can have many candidates). Accent: priority.
* **Banner strip:** 84px tiles with the verdict as the last line, border coloured by verdict.
  Desktop scrolls sideways if the list is long; mobile wraps.
