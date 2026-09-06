# Deadly Assault Allocation

Deadly Assault asks for three teams against three bosses with **no unit used twice**. That is a
different problem from scoring one team, and the difference is scarcity.

## Marginal value, not absolute score

`scoreTeamForBoss` is a pure function of one team and one boss, so it cannot see that a unit is
scarce.

The property that matters in an allocation is a unit's **marginal** value: how much better the
best team containing it is than the best team without it, *for that boss*.

> A unit belongs to the boss where its **marginal** value is highest, which is generally **not**
> the boss where its team scores highest.

Maximising the sum of the three team scores gets this right automatically. The failure mode is
anything that lets a per-boss preference override the total.

Dialyn is the standing example. She is the best stunner for several carries at once, and
hoarding her for the boss where her team scores highest can starve a team that needs her far
more. See [stunless](../archetypes/stunless.md) for the case where that bites hardest.

## Two mechanics guard this

### Rank bands

Each boss's teams are ranked as **epsilon-banded equivalence classes**, not by raw list index.
Teams scoring within a band of each other share a rank.

This exists because the solver's priority formula weights the worst rank across the three bosses
so heavily that a single extra rank step outranks *any* total-score advantage. Without banding, a
fractional score difference — well inside the engine's precision — could bury a strictly better
allocation below a worse one.

The band is ratio-based with an absolute floor, so it keeps its meaning as scores drift upward
across patches and stays meaningful on low-scoring matchups. The constants live in
`team-builder.js`.

**The band width is derived from a real allocation, not chosen in the abstract.** Re-derive it
the same way if it ever moves:


1. Find the case where the best team on a boss and the best team *without the contended unit*
   are close enough that giving the unit up ought to be free.
2. Make sure that gap fits inside one band.

Widen it past that and genuinely different teams start sharing a rank. Narrow it and the solver
refuses to release a unit it should.

The band operates on the **calibrated** scale, so regenerating
[calibration](../engine/calibration.md) can change what it means. Re-check the case, not just
the tests.

### Scorer parity for genuinely equal archetypes

Banding only absorbs *noise*.

If two teams the game treats as equivalent score tens of points apart, that is a **scoring
error**, and no allocation tolerance can paper over it. The fix belongs in the scorer. The
[stunless stun-shill credit](../archetypes/stunless.md#the-stun-shill-boss-interaction) is
exactly this case.

## A trap worth recording

**Discounting a shared need does not help reallocate the unit that supplies it.**

Dialyn's ultimates feed both YSG and Yixuan, so cheapening the ultimates need lowers her value
on both bosses at once.

Worse, the L4 soft cap damps reductions harder on the team that sits deeper into the cap. So the
discount can shrink the *wrong* marginal faster and move the allocation the wrong way.

> Reallocation comes from raising the alternative, not from cheapening the contended resource.

## Related

* [DPS bucketing](../engine/reading-scores.md#dps-bucketing) — the diversity view that sits
  downstream of allocation.
* `test-bucketing.mjs` — the suite that guards marginal value and rank bands. It once caught a
  structural change that had inverted an allocation. See
  [the verification loop](../tooling/verification-loop.md).


