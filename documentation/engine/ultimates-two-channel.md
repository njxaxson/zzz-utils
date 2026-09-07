# The Ultimates Two-Channel Model

Ultimate provision is scored through **two distinct channels**, and ultimates are **exempt from
L5 cohesion penalties**. That combination looks like an inconsistency between the layers at
first glance. It is not. It is deliberate and it has been mistaken for a bug at least once.

Read this before "fixing" it.

## The four pieces

| Piece | Fires on | Models |
|----|----|----|
| **Provision** — a large multiplier times the consumer's ultimate magnitude | Any primary carry whose ultimate is a real burst | A free ultimate arrives sooner, and is worth more the harder that ultimate hits. Seed's case, where the benefit stops at the ultimate itself |
| **Need** — a smaller multiplier times the annotated `scaling.ultimates` | **Only** units that annotate `scaling.ultimates` | Ultimates *fuel* the unit — something beyond the ultimate's own damage. YSG's enlightened state, Yixuan's annihilation attack, Miyabi's enhanced-attack gauge |
| **L5 exemption** | L5 only | Ultimates and chains arrive naturally, *and* almost nothing can provision them. Lacking a provider is not a fit failure |
| **Fractional coverage** | A supplier who covers only part of a declared need | Fraction of the need met, not a flat discount. Continuous at full coverage, so there is no cliff |

## The channels do not overlap, and that is the whole point

Magnitude is priced once, in provision. A declared benefit is priced once, in need.

A unit with a big ultimate and no annotation (Seed) collects only the first. A unit with both
(YSG) collects both, which is why she sits clearly at the top.

Worked totals from Dialyn, who carries `utility.ultimates: 3` — the largest provision in the
data:

| Consumer | Magnitude | `scaling.ultimates` | Provision | Need | Total |
|----|----|----|----|----|----|
| YSG | 2.0 | 3 | 46.8 | 28.8 | **75.6** |
| Seed | 2.0 | — | 46.8 | 0 | **46.8** |
| Yixuan | 1.1 | 2 | 25.7 | 19.2 | **44.9** |
| Miyabi | 1.25 | 1 | 29.3 | 9.6 | **38.9** |
| Evelyn | 1.1 | — | 25.7 | 0 | **25.7** |
| Ellen | 1.0 | — | 23.4 | 0 | **23.4** |
| Sigrid | 0 | — | 0 | 0 | **0** |

(These are illustrative arithmetic from a particular tuning. The multipliers live in the code
and move; the *structure* of the table is the part that must stay true.)

## Annotating `scaling.ultimates` above 3 is allowed but self-limiting

Dialyn's `3` is the biggest provision anywhere in the data, so a need above 3 is covered by
nobody and every supplier's bonus scales down proportionally. Dialyn earns about 21.6 from a
hypothetical `4`, against 28.8 from a `3`.

That is fraction-of-need semantics working as designed, not the old cliff, and it stays a bonus
in every case. Mechanics TEST 14 pins it.

## The two calibration dials

Raising the **provision** multiplier lifts every carry, and is what separates Evelyn from
Ellen. Raising the **need** multiplier lifts only the three units that declare a need, and
pulls YSG further clear.

They trade off against each other if you want to hold YSG's total fixed.

### Why the need channel is cheaper than the general need multiplier

It carries its own, smaller multiplier because ultimates are the one need also paid through a
second channel. Charging the full rate on top of provision would let the need side dominate.
Every other key falls through to the shared need multiplier unchanged.

### Why L5 exempts them

The ability to provision ultimates is itself extremely rare — essentially Dialyn and Ju Fufu.
Charging a YSG or Yixuan team a cohesion penalty for lacking a provisioner would punish it for
something almost no teammate could supply, and the resource arrives naturally regardless.

A YSG team without Dialyn is not *incohesive*; it is simply missing an accelerant. So the
upside is rewarded in L4 and the absence is not penalised in L5.

### Cohesion relevance uses magnitude, not need

Buff utilisation asks whether a supplier's utility key lands on anybody. For `ultimates` that
question is answered by the **provision** channel — does any carry have a real ultimate — not by
whether someone declares a need.

Judging it by declared need would read Dialyn's provision as landing on nobody whenever the
carry is Seed or Evelyn. That is wrong: they use the free ultimate, they just get nothing extra
from it.

## Never fabricate a need

This is the rule the whole section exists to protect, and it generalises well beyond ultimates:

> **A unit must never be given a need it did not declare.**

The old model manufactured an `ultimates` need for every primary carry — a floor of 1, plus
bumps from magnitude and frequency — which the annotated value then overwrote. Three things went
wrong at once:

1. Units like Evelyn and Seed, who declare nothing, got a need anyway.
2. The same free ultimate was paid for twice, once per channel, with the fabricated half the
   larger of the two.
3. The fabricated need was exposed to the undersupply gate, so Evelyn was *discounted* for
   being undersupplied on something she never asked for — while collecting full ungated credit
   from Ju Fufu, purely because the fabricated floor of 1 happened to match Ju Fufu's
   `utility.ultimates: 1` exactly.

Mechanics TEST 9 pins the rule directly.

## A trap to avoid

Do not try to use the L5 exemption as an L4 discount to reallocate a contended provider.
Cheapening a *shared* provision lowers its value to every consumer simultaneously, and the L4
soft cap damps the reduction unevenly, so it can move an allocation the wrong way. See
[Deadly Assault allocation](../bucketing/deadly-assault.md).

## Terminology

*Annotated* ultimate scaling is the literal `mechanics.scaling.ultimates` value in `units.json`
— YSG (3), Yixuan (2), Miyabi (1), and nobody else. The effective-scaling lookup now returns
exactly that value, or nothing at all. The two used to differ, and conflating them was an active
defect. They are the same number now, and mechanics TEST 9 keeps them that way.

## Code notes

### [ULT-01] Frequency is its own axis, and chain:extra is self-provision

`ultimate:double` and `chain:extra` say how many times a unit fires an instrument in one
window, never how hard — read only inside `getMaxBurstWeight`, never the provision or need
channels. That leak is what fabricated an ultimate need for 26 of 60 units.

`chain:extra` is Evelyn's self-provisioned chains, deliberately not `utility.chains`: provision
is scored supplier -> consumer with `supplier !== consumer`, so a `utility` entry can never
reach its own owner. Annotating her that way would hand Sigrid free chains and give Evelyn
nothing.

`scaling` is a need, never a frequency: `scaling.chains: 3` means Evelyn wants chains badly, not
that she fires more of them. Same for `scaling.ultimates`. Do not conflate the three axes.

### [ULT-02] getUltimateMagnitude's zeroing is load-bearing for Sigrid and Pyrois

Returns 0 when the unit's ultimate is not a real burst (`ultimate:weak` with no
`ultimate:strong`) — Sigrid, whose burst lives in her enhanced attacks, and Pyrois without a
wind-anomaly teammate. This zeroing is what excludes Sigrid from ultimate provision entirely,
and what implements the intentional design that Pyrois under-benefits from Dialyn (two weak
ultimates sum to one normal one, but Dialyn supplies a single ultimate). A possibly-conditional
`ultimate:strong` overrides `ultimate:weak`, which is exactly how Pyrois's wind condition lifts
the penalty.
