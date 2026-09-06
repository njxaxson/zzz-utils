# Team Archetypes

These are the shapes good teams take. Read them as *expected output*, not as rules the engine
follows.

## They are emergent, not templated

The engine hardcodes no composition templates beyond a structure classifier that counts how
many carries, stunners and supports a team has. Every pattern below falls out of the
mechanical interactions modelled in the data.

That matters when you are debugging. If Astra + Nicole scores highly behind an attacker, that
is *evidence the mechanics are modelled well* — nobody told the engine that pairing was good.
If it stops scoring highly, the fault is in a mechanic, not in a missing template.

There is exactly one deliberate exception to this, `mechanics.archetypes`, which declares
support-by-carry fit directly. See
[declared archetypes](../data-model/declared-archetypes.md) for why it exists and what it is
allowed to do.

## The roster

| Archetype | Shape |
|----|----|
| [Attack](attack.md) | Stunner + attacker + support or defense |
| [Anomaly (modern)](anomaly.md) | Stunner + anomaly carry + anomaly support (also documents double-anomaly teams) |
| [Anomaly (triple)](triple-anomaly.md) | Three primary-anomaly units, enabled by Remielle |
| [Rupture](rupture.md) | Stunner + rupture carry + sheer support |
| [Totalize](totalize.md) | Carry + **double stunner** |
| [Stunless](stunless.md) | Carry + **double support**, no stunner at all |
| [Monoshock](monoshock.md) | Hybrid anomaly and attack |

## The seven classes

Every unit has exactly one role, and each role has a page here. The first four deal the damage;
the last three fill the other slots.

The distinction to keep straight: the four carry classes each *imply* a team shape, so their
pages double as archetype pages. The three enabler classes do not — they are slots that the
shapes above are built around.

| Class | Page | What it is for |
|----|----|----|
| Attack | [attack.md](attack.md) | On-field damage from basics, chains and ultimates, mostly inside a stun window |
| Anomaly | [anomaly.md](anomaly.md) | Damage from anomaly buildup and reactions |
| Rupture | [rupture.md](rupture.md) | Sheer damage, which ignores enemy defense |
| Armorer | [armorer.md](armorer.md) | Laceration damage, scales off DEF, detonates a shared meter |
| Stun | [stun.md](stun.md) | Creates the damage window — and deals real damage besides |
| Support | [support.md](support.md) | Buffs and utility; judged on fit, not on size |
| Defense | [defense.md](defense.md) | Shields and mitigation, in practice an alternate support |

The role definitions themselves live in
[elements and roles](../concepts/elements-and-roles.md); a unit can also gain a second role at
runtime through [pseudoRole](../data-model/pseudorole.md).

## Wheelchairs

[Wheelchairs](wheelchairs.md) are support pairings that uplift almost any compatible carry.
They cut across the archetypes above.