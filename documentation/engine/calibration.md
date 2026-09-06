# Archetype Calibration

Calibration is a **boundary transform**, not part of the engine. `calibrated = raw ×
factor[archetype]`, one factor per archetype.

The engine never sees `calibration.json` and never calibrates its own output.

## Why it exists

Anomaly has more mechanics than attack or rupture, so an anomaly team accumulates more scoring
events and ceilings far higher. That is a difference in how much there is to score, not in how
good the team is — see [reading scores](reading-scores.md).

Each archetype's factor is fitted so that its best teams land near the same target score.

## What it deliberately is not

**Not per-boss.** A per-boss factor would erase exactly the boss-matchup signal the engine
exists to produce. The multiplier is global, so an anomaly team still climbs on an anomaly-shill
boss.

**Not non-linear.** A flat per-archetype scalar was chosen over a non-linear form, which is what
makes the next property true.

**Cannot reorder within an archetype.** A single multiplier applied to a whole archetype
preserves order inside it. That is the property `calibration-check.mjs` certifies, with zero
tolerance.

## Who must not import it

Consumers that only ever compare within one archetype — `rankings.js`, `compositions.js` — must
**not** use calibrated scores. Raw is correct there, and raw is what resolves the fine ordering
between variations of the same carry.

## Staleness is invisible unless you check for it

The anchors are fitted to the corpus that the engine and the data produce. So a change to
`team-scorer.js`, `units.json` or `bosses.json` silently invalidates them.

The staleness check is a SHA-256 fingerprint over exactly those three files:

| Included in the fingerprint | Deliberately excluded |
|----|----|
| `app/public/lib/common/team-scorer.js` | `bosses.json`'s display-only fields |
| `app/public/data/units.json` | Every CLI script |
| `app/public/data/bosses.json` | |

The exclusions exist so an unrelated edit does not manufacture a false stale reading.

**No test suite will catch a stale `calibration.json`.** They all assert against raw scores.
A stale file shows up only as a wrong-looking cross-archetype ladder. See
[the verification loop](../tooling/verification-loop.md).

## Two files

| File | Corpus |
|----|----|
| `calibration.json` | Released units |
| `calibration.preview.json` | Includes unreleased units — generated with `-p` |

Both are generated. Regenerate them; never hand-edit.

The transform itself lives in two copies, `lib/calibration.js` for Node and
`app/public/lib/common/calibration.js` for the browser.
