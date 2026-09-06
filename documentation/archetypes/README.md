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

## Code notes

### [ARCH-01] Stunless shill credit sizing

`STUNLESS_SHILL_CREDIT` is worth far more than the plain shill match because a stunless carry
meets a stun-shill requirement without spending a team slot on a stunner — the freed slot takes
a second support instead. Sized at roughly what that replacement support contributes
end-to-end: for Ye Shunguong/Zhao/Sunna on Thrall, Zhao is worth ~27 after the L4 element
modifier and soft cap, plus ~21 of L2 tier/rank. Reachable only by a stunner-free team holding a
stunless unit on a stun-shill boss — today that is Ye Shunguong on Thrall and butcher:raging.
Primary calibration dial for the stunless archetype; raising it makes stunless carries compete
with stunner lines.

### [ARCH-02] Primary carry selection ignores pseudo-DPS

`getPrimaryCarry` (team-scorer.js) picks the team's hub by tier among units TAGGED with a DPS
role only. Owner: "we don't build teams around pseudo-DPS agents... even on
Miyabi/Vivian/Remielle, Rem is the support agent." So a pseudo-anomaly stunner (Nangong) is
never the hub, however good its tier.

### [ARCH-03] The monoshock calibration override

`getPrimaryCarry` picks by tier, so a team built around a quirky attacker that scales off
anomaly procs — not a team built around anomaly reactions — can still label `anomaly` whenever
its anomaly unit happens to outrank the attacker. That is wrong for calibration: monoshock
teams belong on attack's scale, because the attacker is genuinely the hub.

`isMonoshockTeam` uses the same definition as the monoshock branch of `classifyTeamStructure`,
but on raw tags rather than activated roles, matching how `carryArchetypes` itself reads tags —
self-contained and auditable without depending on `_activatedRoles` having been populated for
that call. `getTeamArchetype` applies the override; it is deliberately separate from
`carryArchetypes` (which feeds `scoreArchetypeFit` and must keep reading the carry's own tags
unmodified), since conflating the two would change what a monoshock team's supports are charged
for.

Measured against the full released corpus: 78 teams meet the monoshock definition, all 78
currently label `anomaly`. Teams that merely CONTAIN an anomaly unit and an attack unit without
meeting the full predicate (1,103 of them) are ordinary anomaly teams with an attacker along and
must NOT be overridden — only 78 of those 1,103 qualify.

### [ARCH-04] Archetype fit calibration: intended is zero, avoid is -40

`ARCHETYPE_INTENDED_BONUS` is zero on purpose: fitting the carry's archetype is the BASELINE a
support is expected to meet, not a bonus to be stacked — the owner's rarity-vs-importance point
(see [buffs and debuffs](../data-model/buffs-and-debuffs.md)) one level up. Measured: a positive
intended bonus is not load-bearing for any fixture judgement (the avoid penalty carries all the
discrimination) and it inflates well-matched teams past their ceilings.

`ARCHETYPE_AVOID_PENALTY` = -40 is calibrated, not a guess. Two live test constraints bracket it
tightly: one needs the penalty deep enough (`Nangong/Yixuan/Sunna` at or below a ceiling), the
other needs it shallow enough (`Yixuan/Lucia/Yuzuha` at or above a floor on Wandering Hunter).
-40 lands both with room in the fixture.

**The term is applied flat, not scaled by the teamwork multiplier.** `scoreTeamForBoss` computes
`rawScore * teamwork + archetype`, so the archetype adjustment is added *after* the multiplier
and its bite is the same on cohesive and incohesive teams alike. That is deliberate — see
[declared archetypes](../data-model/declared-archetypes.md).

An older comment on the constant claimed the opposite ("scaled by the teamwork multiplier, so its
effective bite is smaller on already-incohesive teams"). It was wrong about the code and has been
removed. If you find that phrasing anywhere else, it is stale.
