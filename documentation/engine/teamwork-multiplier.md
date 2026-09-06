# The Teamwork Multiplier

The final score is `raw × teamworkMultiplier`, and the multiplier is
`structureFactor × f(cohesion)`.

`f` maps cohesion onto a floored range, so a bad team is crushed but never zeroed.

## Structure factor

Comes from the [L1.5 classification](layers.md). Because L1.5 adds nothing to the raw score, a
structural demotion is a pure multiplier effect.

### The mismatched-support override

A team whose factor is better than unconventional-viable is **downgraded** to it if any
support-like member's buff utilisation falls below half. A conventional shape staffed by a
mismatched support is not really conventional.

**The test is on the factor, not on the tier's identity.** When the no-stunner tiers were
added, a tier sitting between conventional and unconventional-viable slipped through an
identity check — and teams with an ill-fitting support went *up*.

## Cohesion

The other half. See [cohesion](cohesion.md) for what feeds it and why it is a geometric mean.

## What is applied outside the multiplier

The [declared-archetype](../data-model/declared-archetypes.md) `avoid` penalty is applied
**after** the multiplier, deliberately, so a wrong-tool verdict bites the same regardless of how
cohesive the rest of the team is. The two must never charge the same judgement twice.

## Code notes

### [TWM-01] Pseudo-role stat alignment, and why SAnby is not double-charged

A non-DPS unit with an active pseudo-role (Nangong, Soukaku, ...) that carries big stat buffs
(`atk`, `cr`, `cd`, ...) is checked in `computeTeamworkMultiplier` for whether those buffs
actually align with a teammate who can use them. If the best-aligned relevance across all such
buffs is below half, the unit's pseudo-DPS credit is discounted (×0.65) for any pseudo-role it
has not otherwise activated — a unit whose "support" half of its kit does not land is not really
playing support, so it should not get full credit for its DPS half either.

Separately: how much a buff whiff costs is a property of the unit's kit (`scaling.buffs`), not
its role tag — support/defense default to 3, stun to 2, DPS to 0, with explicit overrides
(SAnby's 3) winning. A DPS that opts in via an explicit override still takes the lighter DPS
weight (0.5) in the geometric mean; the severity of its whiff is already applied inside
`computeBuffUtilization`, which damps by `scaling.buffs / 3`, so charging it again in the
per-unit weight here would double-count it.
