# Responsive rules

## Breakpoints

| Width | What changes |
|----|----|
| ≤900px | Agent Teams stacks its rows (only that page) |
| ≤768px | Full tiles step down to 104px / 100px; Deadly Assault boss to 124px |
| ≤600px | **Mobile.** Accent moves to a top bar; cards stack; tiles go to a 3-column grid |
| ≤480px | Container padding shrinks; small type tweaks |

## Page body width

The header and footer stay wide. The page body is capped so a single column of results is not
stranded in empty space. Put the class on `<main>`:

| Class | Max width | Pages |
|----|----|----|
| `main-narrow` | 880px | Team Builder, Team Recommendations, Pull Recommendations |
| `main-narrow main-da` | 940px | Deadly Assault (its bigger boss tile does not fit in 880) |
| *(none — `container extra-wide`, 1400px)* | 1400px | Agent Teams, whose rows carry a full boss list |

Do not solve "too much blank space" by shrinking tiles or adding a second column of cards — both
were tried (see [decisions](decisions.md)). Narrow the body.

## Mobile rules

* **No horizontal scrolling inside a page.** If it would, wrap to a grid instead. (The pull
  banner strip used to scroll; it now stacks.)
* **Tiles share the card width.** Three tiles per row, `minmax(0, 1fr)`, never a fixed pixel width.
* **Between cards: 1.75rem.**
* **Deadly Assault must fit on one phone screen.** An option is three boss rows and the user
  needs to compare all three at once. The design budget is about 210px per row, which is why the
  boss is a banner and the unit names overlay the portraits. Measure with a 375×700 window; if you
  add height to a row, you are spending that budget.
