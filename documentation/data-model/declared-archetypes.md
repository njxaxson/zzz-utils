# `mechanics.archetypes` — Declared Support Fit

A support says outright which carry archetypes it is built for and which it is the wrong tool
for. This is the **one deliberate exception** to the engine's
[mechanics-emergent premise](../engine/design-premise.md).

## Shape

```json
"archetypes": { "intended": ["anomaly"], "avoid": ["rupture"] }
```

Roles are drawn from the four carry archetypes: `attack`, `anomaly`, `rupture`, `armorer`.

Unlisted archetypes are **neutral**, and so are units with no annotation at all — Ben and
Caesar, neither of whom plays a support role.

## Why it is declared rather than derived

Eight attempts to derive support fit from buff lists all failed on the same rock: a ratio over
a support's own kit cannot distinguish

* **wrong tool** — Yuzuha's anomaly kit on a rupture carry — from
* **narrow but right** — a support who lands one huge buff and is tier zero.

Declaring it is more honest than a model that produces wrong answers for opaque reasons.

## How it scores

Judged against the **primary carry only** — the highest-tier real DPS. A pseudo-anomaly
stunner is never the hub.

| Verdict | Effect |
|----|----|
| `intended` | Pays nothing. Fitting the carry is the baseline, not a bonus |
| neutral | Nothing |
| `avoid` | A flat penalty, applied **after** the teamwork multiplier |

Applying the penalty after the multiplier means a wrong-tool verdict bites the same regardless
of how cohesive the rest of the team is. The penalty is deliberately separate from the
[cohesion](../engine/cohesion.md) multiplier — the two must never charge the same judgement
twice.

Every support's verdict is printed in the `--debug` trace, so a wrong or missing annotation is
visible rather than silently neutral.

## An `avoid` can look right in a vacuum and be wrong in play

`avoid` is for a unit that is genuinely the wrong tool, not for a team that merely looks
unconventional.

**The Sunna case.** Sunna carried `avoid: ["rupture"]` because an attack-and-anomaly support on
a rupture carry looks like a mismatch. It was removed after playtesting, for a reason that is
worth internalising:

* Sunna can only reach a rupture carry alongside Nangong, because of
  [join rules](../concepts/additional-abilities-join.md).
* Nangong + Sunna is exactly the stun [wheelchair](../archetypes/wheelchairs.md) — fast tier-0
  stun, extra daze, stacking stun multiplier — that a greedy-window rupture carry like Yixuan
  wants.

The emergent logic had this right the whole time. The `avoid` tag was suppressing the engine's
own correct answer.

> When the engine confidently disagrees with your intuition about a support, test it in play
> before overriding it with an `avoid`.

## What this does not fix

Declaring fit tells the engine *which* archetype a support belongs to. It says nothing about
*how much* the support contributes within that archetype, and nothing about relationships
between two supports. Those still have to be emergent, or declared separately through
[`synergy.units`](unit-object.md#synergyunits--the-named-partner-bonus).
