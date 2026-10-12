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

### [PULL-07] Who can play together is decided by legal teams

`makeTeamLegality(ownedUnits)` answers "can these two share a real 3-unit team, with an owned unit
in the third slot?" through `isValidTeam`, faction joins included. Two rules keep "legal" honest:

* the third slot may not hold a unit of another archetype — Claret/Nangong/Grace is legal in game
  but is not an armorer team with Nangong as its stunner;
* no member may declare the carry's archetype in [`archetypes.avoid`](../data-model/declared-archetypes.md)
  — Lucia can join an attack team through her `stun` join, but declares attack as the wrong tool.

It replaced three guesses. The support gaps read join tags alone (`canJoinArchetype`), so Sunna
never counted for anomaly even with Nangong owned to bring her in. The stunner gaps ignored joins,
so an anomaly-only Nangong counted as the stunner for every team type. And `canJoinWith`, which
gates mechanical-synergy pairs, fell back to "either unit's join matches the other's tags", which
paired Nangong with Sigrid, Evelyn and Hugo.

It is legality only — no scoring, no bosses — so it scales with roster size, not with content.
