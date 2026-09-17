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

## Pooling: an archetype that does not anchor itself

An anchor is a top-K mean, so it measures an archetype's **ceiling**. With a dozen carries that
ceiling is set by the best of them and everyone else sits below it — which is the whole point, and
why a mid-tier attack carry scores 320 rather than 400.

With **one** carry the ceiling *is* that carry. The unit is pinned to the target by construction
and cannot score below it however good the competition is. That is not a smaller version of the
normal case; it is a different thing, and no amount of sample size fixes it. Armorer had 2,090
anchor-pool teams and exactly one carry.

`ARCHETYPE_POOLS` in `generate-calibration.mjs` names archetypes that give up their own anchor and
fold their scores into a host's pool instead:

```javascript
const ARCHETYPE_POOLS = { armorer: 'attack' };
```

A pooled archetype still contributes its scores to the host's pool, so if one ever climbs into the
host's top-K the host's anchor moves — correct, and `anchorFromPooled` on the host is emitted to
make it visible. While that stays `0`, pooling provably cannot move the host's scale.

The artifact says so itself. A pooled row carries `pooledInto` and `selfAnchor` (its own top-K mean,
diagnostic only), while `anchor` holds the anchor it is actually calibrated against, so
`factor === target / anchor` stays true on every row:

```json
"armorer": { "anchor": 521.3, "factor": 0.767298, "pooledInto": "attack", "selfAnchor": 402.9,
             "distinctCarries": 1 }
```

**The map is a human decision, never a threshold.** `distinctCarries` is emitted alongside it and
the generator warns in both directions — a self-anchoring archetype under three carries, a pooled
one at three or more — but the warning nags; it does not act. Pooling and unpooling are rulings.

### What this costs

A pooled archetype is **not self-absorbing**, in both directions. This is the one real price, and
it is a standing maintenance obligation rather than a one-off:

* A retune of the pooled archetype's own output moves its calibrated scores, and therefore its
  strength labels. Previously absorbed by the anchor moving with it; now not.
* A retune of the **host's** ceiling rescales the pooled archetype with no change to it at all.

Companion rule to "a linear retune is absorbed; a non-linear one is not":
**a pooled archetype is not self-absorbing.** See [reading scores](reading-scores.md).

Everything else survives intact. Pooling is still a single positive constant per archetype, so it is
still not per-boss and it still cannot reorder within an archetype — `calibration-check.mjs`
certifies exactly as before.

### Two independent staleness axes

The pooling map lives in a CLI script, which `FINGERPRINT_INPUTS` deliberately excludes so an
unrelated edit cannot manufacture a false stale reading. That exclusion means the fingerprint
**cannot see a pooling change at all**. So `--check` compares two things:

| Axis | Detects |
|----|----|
| `isStale()` | the engine/data fingerprint moved |
| `poolsDiffer()` | the committed `pools` map is not the one now in force |

Without the second, editing the map and forgetting to regenerate would pass `--check` silently —
the exact failure the fingerprint exists to prevent.

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

## Code notes

### [CAL-01] The synthetic neutral boss is not in the fitting corpus

`matchups.js`, `calibration-check.mjs` and the team-builder page each append a weakness-less
synthetic boss as a mechanics-free reference ladder. The **fit** must not use it: it is a
diagnostic, not a matchup, and including it inflated every reported `n` by about 10% — the counts
that `LOW_CONFIDENCE_N` is checked against.

It changed no anchor when it was removed, and that is not an argument for having kept it. A
weakness-less boss scores too low to reach any top-K *today*; the moment an archetype had fewer
than K real-boss viable teams, synthetic teams would set a live anchor. Each consumer keeps its own
copy, so removing it from the generator affects nothing else.

### [CAL-02] Archetype pooling, and why the map is checked separately

See "Pooling" above for the rule and "Two independent staleness axes" for why `poolsDiffer()` is
not folded into `isStale()`.

### [CAL-03] `MIN_SELF_ANCHOR_CARRIES` is 3

Three is the smallest count at which a top-K mean can be set by more than one unit plus a tie.
Rupture sits at 5 and is the weakest self-anchoring archetype in the corpus, so 3 leaves real
headroom below the lowest thing currently considered acceptable.

Both warnings it drives are advisory. Nothing about the number changes a score; it changes whether
a human is told to look.
