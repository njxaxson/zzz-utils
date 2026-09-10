# Elements and Roles

The two tags every unit carries. Element decides whether a unit is welcome against a
particular boss; role decides what the unit is *for*.

## The seven elements

fire, ice, electric, ether, physical, wind, **lumen**.

A boss lists weaknesses and resistances. A DPS whose element matches a weakness gets a
bonus. A DPS whose element is resisted is **disqualified outright** — the team is not
scored. Supports and defenders are only penalised, never disqualified, because their
damage is not the point (see [element resistance and role](../engine/element-resistance.md)).

No boss in the data has a lumen weakness or a lumen resistance. Lumen is strange enough to
have [its own page](lumen.md).

## Element variants

Three units fill a *separate* anomaly gauge that still counts as their base element when a
boss checks weakness or resistance.

| Unit | Base element | Variant | Why it matters |
|----|----|----|----|
| Miyabi | ice | `frost` | Frost and ice are different gauges, so Miyabi disorders with Soukaku |
| Yixuan | ether | `auricInk` | Rarely relevant |
| Ye Shunguong | physical | `honedEdge` | Rarely relevant |

The flag is `mechanics.elementalVariant`. Variants matter in two places: deciding whether
two units [react](anomaly-reactions.md), and picking a vortex tier.

A variant can be tiered deliberately differently from its base. Miyabi's frost multiplies far
worse than plain ice, which is part of why Promeia outscores her against wind bosses. Only part:
vortex damage also scales on the proccing agent's Anomaly Proficiency, and Miyabi's is low
because her damage runs through crit rather than through AP. See
[anomaly reactions](anomaly-reactions.md#vortex-tiers).

## The seven roles

Four of them deal the damage:

* **Attack** — on-field damage from basics, chains and ultimates, mostly during stun windows.
* **Anomaly** — damage from anomaly buildup, disorders and enhanced attacks.
* **Rupture** — deals Sheer damage, which **ignores enemy defense**. Defense shred and PEN
  are dead weight for a rupture carry.
* **Armorer** — deals Laceration damage and scales off DEF. See
  [armorer, laceration, gash and maim](armorer-laceration-gash-maim.md).

Three of them do not:

* **Stun** — creates the damage window. Stunners also deal real damage; they are not pure
  enablers.
* **Support** — buffs and utility, negligible personal damage.
* **Defense** — shields, healing and mitigation, usually with buffs attached.

Despite the name, defense units are not played defensively. The game rewards aggression, so
in practice a defender is an alternate support that happens to hit slightly harder. Ben is
the clearest case: he converts DEF into crit damage, and the people who run him build him as
a carry.

## Pseudo-roles

A unit can gain extra roles through `mechanics.pseudoRole`. Once a pseudo-role activates, it
**is** the unit's role for scoring purposes — every role test (`isDPS`, `isSupport`, and the
rest) reads activated roles before it reads the printed one. The activation rules and their
knock-on effects are in [pseudoRole](../data-model/pseudorole.md) and
[role activation ripple effects](../engine/role-activation-ripple.md).

## Code notes

### [FUND-01] isDamageDealer is deliberately narrower than isDPS

Used only by the element-resistance disqualification in L1, not as a general widening of
isDPS. Norma is tagged `stun` with an active `subdps` pseudo-role, so `isDPS(Norma)` is false
and she used to survive a boss that resists fire on nothing but the flat -80 stunner penalty.
That is wrong for her specifically: a pure stunner's job is the stun window and survives a
resisted element, but a subdps IS a damage dealer and her value craters.

`DPS_ROLES` itself must not absorb `subdps` for the same reason ultimate provision must stay
limited to one primary carry — see `isBurstDPS` in team-scorer.js and
[the ultimates two-channel model](../engine/ultimates-two-channel.md).
