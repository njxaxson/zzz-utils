# Status

Current state only. Everything here is measured, not remembered — if you change the engine,
re-run the commands and update the numbers.

**Keep this file short.** It is a status report, not a history. Anything that describes a past
change belongs in [CHANGELOG.md](CHANGELOG.md); anything that explains a settled ruling belongs
in [notes/adjudications.md](notes/adjudications.md) behind a tag.

**Last verified:** 2026-10-12.

## Test status

| Suite | State |
|----|----|
| mechanics | **41 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| rankings | **95 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| recommendations | **51 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| bucketing | **14 pass, 0 fail** |
| cohesion fixture | **11/11** owner judgements hold |
| calibration freshness | both files match the current engine/data fingerprint **and** the current `pools` map |
| calibration certification | **CERTIFIED** — 0 within-archetype rank inversions across 60 (boss × archetype) groups and 71,318 teams |

```bash
node test-mechanics.mjs && node test-rankings.mjs && node test-recommendations.mjs && node test-bucketing.mjs && node cohesion-fixture.mjs
node generate-calibration.mjs --check && node generate-calibration.mjs --check --preview
node calibration-check.mjs
```

All three `KNOWN_RED` maps are empty — there are no known disagreements between the engine and
the owner's playtested orderings. See [the verification loop](tooling/verification-loop.md) for
why an empty map still matters, and why a green suite is not evidence on its own.

## Open

**None as issue files.** Nothing is release-blocking and nothing is outstanding.

## Deferred

Ten. Known, understood, and deliberately not being chased.

| Issue | Priority | Why it is parked |
|----|----|----|
| [Sub-DPS tier halved beside a same-type carry](issues/deferred/high-sub-dps-tier-is-halved-beside-a-same-type-carry.md) | high | Wide blast radius; post-release |
| [The partner ladder is a fitted stopgap](issues/deferred/medium-the-partner-ladder-is-a-fitted-stopgap.md) | medium | The honest fix is a feature, not a repair — and must scale |
| [Vortex teams are not a pull-engine team shape](issues/deferred/medium-vortex-teams-are-not-a-shape-the-pull-engine-knows.md) | medium | A model addition; the banner-T0 rule covers today's case |
| [Grace at T1.5 holds the anomaly sub-DPS slot shut](issues/deferred/low-grace-t15-holds-the-anomaly-subdps-slot-shut.md) | low | A threshold question, not a defect |
| [Velina listed only as a Wind fallback](issues/deferred/low-velina-listed-only-as-a-wind-fallback.md) | low | No verdict depends on it now |
| [Roxy and Norma not counted as sub-DPS](issues/deferred/low-roxy-and-norma-are-not-counted-as-sub-dps.md) | low | No reported wrong verdict yet |
| [Greed value-scaling cannot be tested](issues/deferred/low-greed-value-scaling-cannot-be-tested-on-todays-roster.md) | low | No fixture can distinguish it until a `greedy: 2` unit exists |
| [Ye Shunguong under-paid on veils](issues/deferred/low-ye-shunguong-underpaid-four-points-on-veils.md) | low | One pair type, about four points, in the safe direction |
| [`utility.kaleidoscope` is read only by the UI](issues/deferred/low-kaleidoscope-is-read-only-by-the-ui.md) | low | Only a support declares it, so no fixture could tell a fix from a no-op |
| [The `ultimate:double` weight is discarded](issues/deferred/low-ultimate-double-weight-is-discarded.md) | low | Every declarer means the same thing, so grading it would move nothing |

`issues/resolved/` is **gitignored**: closing an issue means moving its file there for the owner
to read and delete when ready, not deleting it yourself. See [the issue system](issues/README.md).

## Reading a number

The engine returns **raw**; anything comparing archetypes reads **calibrated**. Check which one
you are holding — see [reading scores](engine/reading-scores.md) for the scales and the strength
labels, and [calibration](engine/calibration.md) for the anchors.

## What shipped last

**Rankings TEST 94 asserts AoD's median gap, not its mean**, 2026-10-12. The frost fix
([WEAK-01]) lifted Nangong/Miyabi/Yuzuha by 110.7 on Bringer alone, dragging the mean past the
floor with AoD unchanged; the test had been red on develop since that commit. Before that: the
pull engine's priority budget (2 High, 4 Medium, ranked greedily).

Full history in [CHANGELOG.md](CHANGELOG.md).
