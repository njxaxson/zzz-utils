# Role Activation Ripple Effects

Activated roles are computed once per team, cached on the unit, and then cleaned up. Because a
[pseudo-role](../data-model/pseudorole.md) *is* a role, activating one ripples across every
layer of the pipeline. This page is the checklist.

## What each layer does differently

**L1** — only "pure DPS" — a unit with no concurrent support, defense or stun role — count
toward the triple-DPS disqualification. The `anti` check reads base **tags**, not effective
roles.

**L1.5** — stun units are excluded from the carry category counts, to prevent
double-classification. Nangong is counted as a stunner, not as a second anomaly agent.

**L2** — units are scored in one category only. A unit scored in the carry loop is excluded
from the non-carry loop. Forced-secondary detection excludes stun, support and defense units.

**L3** — four separate effects:

* A pseudo-support cannot satisfy a DPS shill.
* A stunless carry *can* satisfy a stun shill, standing in for the stunner the boss would
  otherwise demand.
* The element-resistance disqualification skips support and defense units.
* A *pseudo*-role matching the boss's `anti` is a penalty, not a disqualification.

## Two families of role predicate, and they differ

| Predicate | Reads |
|----|----|
| `isEffectiveSupport` / `isEffectiveDefense` | Base tags **and** activated pseudo-roles |
| Plain `isSupport` / `isDefense` | Tags and the activated-roles cache only |

Structure classification, inherent quality, disqualification and the teamwork multiplier all use
the **effective** wrappers.

## Before you add a pseudo-role

A new pseudo-role is never a local change. It moves the unit between the carry and non-carry
halves of L1, L1.5, L2 and L3 simultaneously, and it changes the unit's on-field status unless
`mechanics.onfield` overrides. Check all four layers plus
[field-time economy](layers.md#field-time-economy-l15).
