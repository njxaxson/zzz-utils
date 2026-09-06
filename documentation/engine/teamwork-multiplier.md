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
