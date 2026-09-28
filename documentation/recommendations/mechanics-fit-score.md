# `mechanicsFitScore`

A lightweight, L4-shaped pairwise heuristic used by the [pull engine](pull-engine.md): **how
well would this supplier serve that carry?**

## What it mirrors from the scorer

* Rupture and armorer ATK discounts
* The armorer crit-rate premium, with crit damage excluded
* Element buff and debuff matching
* Need fulfilment
* Damage-type matching

Conditional buffs are resolved against a conservative two-unit context, so a narrow or
conditional buff resolves to what *this* consumer would actually receive rather than to its best
case. See [predicates](../data-model/predicates.md).

## Two deliberate divergences from the scorer

**`dmg` is not scored here.** Generic damage benefits every carry equally, so it carries no
signal for ranking *which* support fits a given carry. Crediting it would drown out the
specialist synergies that are the whole point of the ranking.

**Conditional-buff anti-synergy.** If a consumer's value depends on teammates carrying a
specific tag — Remielle needing anomaly teammates — then a supplier *without* that tag is heavily
discounted. It is occupying a slot that should go to someone who activates the buff.

A buff the consumer aims at **itself** is not one of these. Severian's wind passive is written
with `target: "self"`, so it never triggers the discount — see [PULL-04].

## Candidate sorting

Titled first, then tier, then accumulated fit against the owned carry roster.

## Where it disagrees with the scorer today

The two engines are supposed to agree on relevance rules and mostly do. There is at least one
place they currently do not — see `documentation/issues/` for what is filed.

## Code notes

### [PULL-03] The recovery debuff reads the scorer's burst model

A recovery debuff is worth what the extra window length buys, so it is priced against the
consumer's burst. This used to be a `Math.max` over the consumer's `mechanics.damage` values,
floored at 1 — the exact anti-pattern
[damage-and-burst](../data-model/damage-and-burst.md) records as "the real content of a whole
issue": it picks the biggest *number*, not the biggest *instrument*, and `chain: 3` and
`ultimate:strong: 3` are four rungs apart.

In practice it saturated at 3 for nearly every carry, so it paid a flat rate and the real
differentiation came from whatever generic stunner terms happened to land beside it. The visible
symptom was a stunner pairing with a carry it has nothing to do with: Severian, whose only
damage keys are `ultimate:strong: 2` and `chain: 3`, cleared the 15-point synergy threshold
against Nangong on exactly 9 points of recovery × 3 plus 6 points of generic daze, and the pull
engine reported "Severian has mechanical synergy with your Nangong". On the burst model he is a
1.33, the pair lands at 10 and never qualifies.

It now calls `getMaxBurstWeight` and mirrors the scorer's recovery branch — burst plus chains
scaling, totalize, and recovery scaling. The scorer's greed bonus is deliberately left out: it
is gated on team context this heuristic does not have.

### [PULL-04] A carry's self-targeted buff is credited to the teammate who switches it on

Severian gives himself crit damage when another teammate is wind. Asked how well Roxy fits him,
the pull engine now counts that passive, because Roxy is what turns it on. Dialyn and Norma do not
switch it on, and their fit for him is unchanged. It is priced with the same per-point crit
weights as a teammate's crit buff, resolved against the two-unit team this heuristic already uses.

Every read of a unit's buffs in `pull-engine.js` goes through `getTeammateBuffs`, which leaves the
self-targeted ones out. Two reads would otherwise have gone wrong:

* the anti-synergy rule above would have read his wind case as a team need and cut every
  non-wind stunner's fit for him to a fifth — Dialyn from 8.7 to 2;
* the dependency check would have told a codependent unit with such a buff to pull a wind
  teammate before it can work.

Recommendations TEST 49 pins both, and was checked by breaking each read in turn. See
[`[BUFF-09]`](../data-model/buffs-and-debuffs.md).

