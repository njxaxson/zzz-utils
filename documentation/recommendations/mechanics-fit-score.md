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
