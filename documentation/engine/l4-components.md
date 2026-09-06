# L4: Mechanical Synergy

The core layer. Every ordered supplier → consumer pair in the team is evaluated, then
team-wide bonuses are added on top.

## The three per-pair components

**Baseline Affinity** — broad stat interactions. ATK, crit rate and crit damage to attackers;
anomaly buffs to anomaly agents; DEF buffs to DEF scalers; defense and element debuffs to
damage contributors; stun infrastructure to window-dependent carries.

**Need Fulfilment** — the supplier provides something the consumer explicitly *scales* with.
The highest-value category, and where `replaces` and
`converts` apply.

**Stun Emergence** — the consumer has burst damage that benefits from the supplier's stun
infrastructure.

## Then, team-wide

Anomaly reaction bonuses (vortex and disorder per agent), Refringe and its cascades, Maim,
anomaly-quantity scaling, [diametric synergy](diametric-synergy.md), an on-element /
off-element modifier, and the conditional
[under-activation penalty](../data-model/predicates.md).

The total passes through a **hyperbolic soft cap**: low scores pass through untouched, high
scores compress. That preserves mid-range differentiation while preventing runaway mechanical
stacking.

## Principles that govern L4

### Scarcity determines value

Foundational stats — ATK, CR, CD — are replaceable through equipment and score low. Specialist
mechanics — veils, chains, aftershock, abloom — are irreplaceable and score high.

A rare mechanic matching a consumer's scaling always beats a common stat buff, all else equal.

### Supply gates fulfilment, and undersupply is worse than linear

Partially meeting a need helps, but disproportionately less than the fraction suggests. Lucia's
`veils: 1` against YSG's `veils: 2` is worth well under half.

`ultimates` is the exception. There, partial supply is priced as a straight fraction of the
need met rather than flat-discounted. Ju Fufu's single ultimate earns roughly:

| Consumer | Their `scaling.ultimates` | Ju Fufu covers | She earns |
|----|----|----|----|
| Miyabi | 1 | All of it | 3.2 |
| Yixuan | 2 | Half | 1.6 |
| YSG | 3 | A third | 1.1 |

The reason is the same as the L5 exemption: ultimates arrive naturally and almost nothing
supplies them, so covering a need only partly is a smaller bonus, never a penalty. See
[the ultimates two-channel model](ultimates-two-channel.md).

### Ultimates are a limited primary-carry resource

Only one unit gets the free ultimate per window, so it goes to the best damage dealer. **Sub-DPS
units receive no ultimate provision at all.**

Quick assists are *not* limited and benefit everyone, sub-DPS included.

Provision is scaled by the consumer's ultimate **magnitude**: a free ultimate is worth far more
to Seed than to a unit with a basic one, and nothing at all to a unit whose ultimate is not a
real burst.

### Ultimates and chains are naturally available

A dedicated provider makes them arrive *faster*, which is correctly rewarded — but lacking one
is not a [cohesion](cohesion.md) failure. That produces a deliberate asymmetry between L4 and
L5, explained in [the two-channel model](ultimates-two-channel.md).

### Self-provision excludes a need from cohesion

Banyue both scales with and provides interrupt-resistance, so it never counts as unmet.

This differs from damage mechanics like aftershock or abloom, where a large part of the ceiling
is damage dealt *by buffed teammates* — self-provision does not cover that.

### Scaling comes in three flavours

| Flavour | Meaning | Example |
|----|----|----|
| **Direct** | Scaling matches an existing damage type, so feeding it leverages a high multiplier | Evelyn: `scaling.chains` plus `damage.chain` |
| **Transformative** | Scaling feeds a conversion into something else; missing it leaves the unit far below its ceiling | Miyabi: disorders into enhanced attacks |
| **Constant** | Steady passive amplification, where a buff pays twice | Alice and Vivian convert AM into AP, making AM buffs doubly valuable |


