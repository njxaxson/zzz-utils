# The Pull Recommendation Engine

`pull-engine.js` answers a different question from the scorer: **which unowned unit would most
improve this roster?**

## Why it shares the scorer's vocabulary

A unit is worth pulling because of the teams it lets you build. So roster gaps are expressed in
the same terms the scorer uses to reward teams.

The engine imports directly from `team-scorer.js` — the effective-scaling and effective-role
lookups, the conditional resolvers — so a data change propagates to both. The connection is
conceptual, not merely mechanical.

**It never calls `scoreTeamForBoss`.** It reasons about mechanics, not about matchups, so it has
no notion of a raw or calibrated score.

## The flow

1. Bucket the roster
2. Score [coverage](coverage-and-gaps.md)
3. [Detect gaps](coverage-and-gaps.md#gap-detectors)
4. Rank candidates per gap, using [`mechanicsFitScore`](mechanics-fit-score.md)
5. Regroup gaps into [per-unit cards](cards-and-priority.md)
6. Assign [priority](cards-and-priority.md#priority)
7. Apply [codependency gating](codependency-gating.md)
8. For units that grow one, apply the [partner ladder](partner-ladder.md), which replaces
   step 7 for those units rather than stacking on top of it

## Running it

`pull-debug.js` drives it from the CLI. See the
[CLI reference](../tooling/cli-reference.md#pull-debugjs).

## Code notes

### [PULL-02] The codependency/ladder penalty is per unit, not per card

`analyze()`'s card-splitting step used to run over finished [cards](cards-and-priority.md) and
drop the whole card whenever any one of its units had an unmet dependency. A card is a group of
candidates sharing a gap, so on an anomaly roster Remielle's codependency was quietly demoting
Aria, Jane Doe and Yanagi, who shared her Anomaly Depth card and had nothing wrong with them.

The penalty is now computed per unit and the card is split afterward, so a hobbled unit carries
its own verdict out with it instead of dragging its card-mates down.
