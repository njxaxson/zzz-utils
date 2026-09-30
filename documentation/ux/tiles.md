# Tiles

## Unit tile

A square portrait with the name on it, an element-coloured 2px border and an 8px radius. It is
produced by `createUnitCard()` in `lib/common/team-card.js`; the pull page has its own twin,
`createRecUnitCard()`, because it adds availability badges.

| Context | Desktop | Tablet (≤768px) | Mobile (≤600px) |
|----|----|----|----|
| Team Recommendations | 120px | 104px | 3 equal columns |
| Agent Teams | 120px | 104px | 3 equal columns |
| Deadly Assault (units) | 120px | 100px | 3 equal columns, name overlays the portrait |
| Team Builder | 100px | 100px | 3 equal columns |
| Pull Recommendations | 100px | 100px | 3 equal columns, wraps |
| Pull banner strip | 84px | 84px | 3 equal columns, wraps |

**Full** tiles (120px) are for pages where the tiles *are* the result. **Compact** tiles (100px)
are for pages where several cards sit close together or a card may hold many tiles.

Name text is 0.7rem on desktop and about 0.6rem on mobile everywhere. Long names truncate with an
ellipsis; do not wrap them.

Units are always tiles. Do not use pills, bars, circular avatars or horizontal "chip" layouts —
see [decisions](decisions.md). The one exception is in the Agent Teams page's unit selection popup, 
where units are displayed in circular avatars. This is because this is a different functional metaphor:
it is a unit selection rather than a user result. The visual difference is necessary to create visual
distinction between the roster input and the popup's agent selection.

## Availability badges (Pull Recommendations)

`Available` and `Upcoming` sit **inside** the tile's top-right corner. Tiles use
`overflow: hidden`, so a badge hung off the corner would be clipped.

## Boss tile

The boss art is 484×668 and **loses its detail when shown small** — it goes jagged. So the
boss is never a small tile.

* **Desktop (Deadly Assault):** a 150px tile, larger than the unit tiles (124px on tablet).
  Boss, strength, then team, left to right, separated by spacing.
* **Mobile (Deadly Assault):** a full-width **banner**, 76px tall, cropped from the top of the
  art (`object-position: 50% 22%`). The strength badge floats over its top-right corner and the
  name over its bottom-left. The crop is the trade for fitting all three bosses in one phone
  screen; see [responsive](responsive.md).
* **Agent Teams:** boss tiles carry the matchup rating as an overlaid badge.

The boss tile's background is its weakness gradient (`getWeaknessGradientClass()`), so the
weakness colours show through the border and any missing image.
