# Design Premise

Why the engine is shaped the way it is. Read this before adding scoring logic anywhere.

## What broke the old engine

The original engine used hardcoded composition rules and named synergies. Nangong broke it. She
is a hybrid stun-and-anomaly unit, and no archetype-level rule can describe her — she is a
stunner for the purposes of the stun slot, an anomaly agent for the purposes of reactions, and
both at once.

So the engine was rebuilt so that scoring **emerges from pairwise mechanical interactions**
rather than from template matching.

## The guiding constraint

> A mechanic's existence has no value. Points are only awarded when something consumes it.

The single exception is foundational stats — ATK, crit rate, crit damage — which have automatic
role-gated value because every carry intrinsically benefits from them.

A closely related rule, which has its own history of being violated:

> A unit must never be given a need it did not declare.

See [the ultimates two-channel model](ultimates-two-channel.md) for what happened when that was
broken.

## The one deliberate exception

`mechanics.archetypes` — support fit by carry archetype — is **declared**, not derived. Eight
attempts to derive it from mechanics failed on the same rock. It is the one place the engine is
told an archetype-level judgement rather than working it out.

Everything else remains emergent. See
[declared archetypes](../data-model/declared-archetypes.md).

## What this buys you when debugging

If a team scores wrongly, the cause is a mechanic that is mis-annotated, mis-weighted or read
in the wrong channel. It is almost never a missing rule about that team shape. Start in
`units.json`, not in the scorer.
