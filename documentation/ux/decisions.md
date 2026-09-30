# Settled UX calls

Things that were tried and are not coming back. Each one was judged by looking at it.

| Idea | Why it was rejected |
|----|----|
| Units as pills / bars on mobile | Inconsistent with every other page; the whole redesign exists to remove them |
| Small tiles with lots of black around them (desktop) | Reads as lost. Fix the layout or narrow the body — do not shrink the tile |
| Two result cards per line on wide screens | Reads across rows and leaves the last card alone. Narrow the body instead |
| Vertical rules either side of the strength label | The label looked like an "H" between two bars. Use spacing |
| Strength shown first, before the boss (Deadly Assault) | A strength rating means nothing without its boss. Order is boss, strength, team |
| Boss and three units as four equal tiles on a phone | ~70px tiles make the boss art jagged and the names unreadable |
| Boss as a small tile or round thumbnail on mobile | Same pixelation. A boss is large, or it is a cropped banner |
| Boss and team side by side on mobile (team as a vertical stack) | Too tall, and not consistent with the other pages |
| Tall boss tile on mobile with the strength beside it | ~310px per row; three rows no longer fit one phone screen |
| Horizontally scrolling strips on mobile | Wrap to a grid instead |
| Column labels painted by CSS on mobile (Team Builder) | A leftover rule duplicated the real label. There is one label per cell, emitted by the markup |
| Deadly Assault is still a carousel; the other pages list results vertically | This is because each result in DA is a multi-row answer, and the carousel is used to avoid conflating answers |

## Open

* The Deadly Assault mobile banner crops the boss art. It is an experiment; if it is replaced,
  the constraint in [responsive](responsive.md) (all three bosses on one screen) still applies.

