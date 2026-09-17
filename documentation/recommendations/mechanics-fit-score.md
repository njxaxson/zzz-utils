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
