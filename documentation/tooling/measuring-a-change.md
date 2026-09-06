# Measuring a Scoring Change

A green test suite tells you nothing about whether your change did what you intended. This page
is about how to find out.

## Do not use `scoring-diff.js` for this

`scoring-diff.js` compares saved *ranking* outputs and deliberately hides shuffles inside tie
groups.

That means it will happily report **"no material changes"** for a change that moved every single
score in the corpus. It is a tool for asking "did the recommended teams change", not "did the
engine change".

## Use the dump/delta pair, and state a prediction first

Before you make the change, write down which teams are **allowed** to move. Then make
`score-delta.mjs` list the exceptions.

```bash
node score-dump.mjs > matchups/before.txt
# ...make the change...
node score-dump.mjs > matchups/after.txt
node score-delta.mjs matchups/before.txt matchups/after.txt --predict Lighter
```

`score-delta.mjs` exits 1 when the prediction fails. `matchups/` is gitignored.

> A green suite is not evidence. A prediction with zero exceptions is.

### What `score-dump.mjs` produces

A full-corpus TSV: one row per (boss, team), carrying the raw score, thirteen layer columns and
the team's archetype. `score-delta.mjs` reads the layer list off the header rather than
hardcoding it, so adding a layer needs no change on the delta side.

The corpus is **fixed and takes no roster flags on purpose**. A baseline you can accidentally
narrow is not a baseline.

### `--predict` and friends

| Flag | Meaning |
|----|----|
| `--predict NAME[,NAME…]` | A team counts as predicted if it contains **any** of these units |
| `--predict-none` | Nothing at all may move |
| `--eps N` | Movement threshold in points. Default 0.05 — one display step, since the engine rounds to 0.1 |
| `--top N` | How many biggest movers to list each way. Default 20 |
| `--exceptions N` | Cap on exceptions listed. Default 40 |

### When the prediction is a property, not a unit list

For a structural change the prediction is usually a *property* of the movers rather than a list
of units — "every mover is a supportless team, and all of them moved down".

Read that off the changed-layer grouping, and where the property needs it, write a throwaway
script over the two dumps.

## Why this is worth the trouble

Two failed predictions in this repo each caught a real over-reach that the test suite did not:

| What the prediction caught | Why the suite missed it |
|----|----|
| A new structure tier slipping past an identity check and sending teams **up** | The affected teams still passed every assertion; nothing pinned the direction |
| A severity curve that nearly zeroed a need Anton genuinely declares | Anton is not in any assertion |

Neither would have been found by reading a green suite.

## Related

* [The verification loop](verification-loop.md) — the four suites and calibration.
* [Reading scores](../engine/reading-scores.md) — raw versus calibrated, and why a
  cross-boss comparison is meaningless.


