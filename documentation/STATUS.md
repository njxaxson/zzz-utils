# Status

Where things stand. Everything here is measured, not remembered — if you change the engine,
re-run the commands and update the numbers.

**Last verified:** 2026-09-06.

## Scores come on two scales

The engine returns **raw**. Anything comparing archetypes against each other reads
**calibrated**. Check which one you are holding before drawing a conclusion from a number — see
[reading scores](engine/reading-scores.md).

## Test status

| Suite | State |
|----|----|
| mechanics | **27 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| rankings | **91 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| recommendations | **44 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| bucketing | **6 pass, 0 fail** |
| cohesion fixture | **11/11** owner judgements hold |
| calibration freshness | `calibration.json` matches the current engine and data fingerprint |
| calibration certification | **CERTIFIED** — 0 within-archetype rank inversions across 57 (boss × archetype) groups and 64,325 teams |

```bash
node test-mechanics.mjs && node test-rankings.mjs && node test-recommendations.mjs && node test-bucketing.mjs && node cohesion-fixture.mjs
node generate-calibration.mjs --check
node calibration-check.mjs
```

`test-mechanics.mjs` and `test-rankings.mjs` are the split of what used to be one `test-scoring.mjs`
(118 tests total, same as before) — mechanics tests pin isolated engine rules independent of
roster content, rankings tests pin score floors/orderings/ladders for the live roster.

All three `KNOWN_RED` maps are **empty**. That is a real state, not an oversight — every test that
was red on purpose has been closed. See [the verification loop](tooling/verification-loop.md) for
why an empty map still matters, and why a green suite is not evidence on its own.

## Open

Two, both boss-data levers rather than engine defects. Neither is release-blocking.

| Issue | Priority |
|----|----|
| [Bringer's `shillIntensity` 6 forces Miyabi to the top](issues/open/medium-bringer-shill-intensity-forces-miyabi-to-the-top.md) | medium |
| [Aberrant's `shillIntensity` should become a lumenize vulnerability](issues/open/medium-aberrant-shill-intensity-should-be-a-lumenize-vulnerability.md) | medium |

Both are thumbs on the scale doing work that a mechanic should be doing. The Aberrant one is the
more tractable of the two — the underlying game fact is already known.

## Deferred

Five. These are known, understood, and deliberately not being chased.

| Issue | Priority | Why it is parked |
|----|----|----|
| [Sub-DPS tier halved beside a same-type carry](issues/deferred/high-sub-dps-tier-is-halved-beside-a-same-type-carry.md) | high | Wide blast radius; post-release |
| [The partner ladder is a fitted stopgap](issues/deferred/medium-the-partner-ladder-is-a-fitted-stopgap.md) | medium | The honest fix is a feature, not a repair |
| [Trigger/SAnby/Seed clears its floor only by declaration](issues/deferred/medium-trigger-sanby-seed-clears-its-floor-only-by-declaration.md) | medium | A join-shape exemption is specified as the real fix, scheduled as a future engine expansion |
| [Greed value-scaling cannot be tested](issues/deferred/low-greed-value-scaling-cannot-be-tested-on-todays-roster.md) | low | No fixture can distinguish it until a `greedy: 2` unit exists |
| [Ye Shunguong under-paid on veils](issues/deferred/low-ye-shunguong-underpaid-four-points-on-veils.md) | low | One pair type, about four points, in the safe direction |

`issues/resolved/` is empty by design. A closed issue gets a file only when its history would
change what a future reader does; otherwise it is deleted and git holds it. The durable reasoning
lives in [notes/](notes/) instead — see [the issue system](issues/README.md).

## For release

**Nothing is release-blocking.** Every rankings complaint is closed, and the two open items are
data tuning rather than engine defects.

## What shipped last

**Archetype calibration**, 2026-09-03. `calibrated = raw x factor[archetype]`, one factor per
archetype, applied at the boundary rather than inside the scorer. The engine still returns raw
scores and nothing about its mechanics changed. See [calibration](engine/calibration.md).

Re-anchoring the numeric bands was considered and **dropped** — owner's call, obviated as long as
the suite stays green and the rankings read correctly.
