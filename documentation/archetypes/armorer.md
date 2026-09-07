# Armorer

**Shape:** builder + armorer + a shred or crit-rate support. Explicitly **not** double support.

The fourth and newest DPS class, and a deliberate inversion of the standard model: it scales off
DEF, receives almost no buffs, and detonates a shared meter. Claret is currently the only one.

The mechanics — Laceration, the two crit checks, Gash into Maim, the reduced-lever problem — are
documented in full under
[armorer, laceration, gash and maim](../concepts/armorer-laceration-gash-maim.md). This page is
about what the *team* looks like.

## Why the team shape is unusual

Two facts drive it, and they push in the same direction.

**Gash marks come from a shared pool.** Stun agents and armorers both build it; only armorers
detonate it. More builders fill the pool faster, so an armorer wants a stun-dense or
armorer-dense team — the opposite of the double-support wheelchair that suits most carries.

**The buff surface is tiny.** An armorer's entire lever set is crit rate, Laceration, PEN,
defense shred, and elemental or generic damage. Crit *damage* and ATK do nothing at all, which
disqualifies most of the strongest supports in the game. Astra earns essentially nothing here.

What is left is a support chosen for shred or crit rate specifically:

| Team | What it is actually doing |
|----|----|
| Trigger / Claret / Nicole | Stacking defense shred first, crit rate second — roughly 60% shred between the two |
| Roxy or Koleda P6 + Claret | The only Laceration buffs on the roster |
| Rina + Claret | DEF buffs, which route through a dedicated higher-multiplier path that makes Rina best-in-slot |

Defense shred is worth special notice: it raises armorer damage **without the armorer receiving a
buff at all**, which matters exactly because so little else can reach them.

## What does not exist yet

* **No armorer sub-DPS.** Every armorer team is a hypercarry team by default. `pull-engine.js`
  carries a TODO for the bucket and detector that a second one would need.
* **The element diametric pair is unreachable.** Claret is electric, and the roster's only
  electric-element supplier is a *debuff*, so there is no electric buff to pair it against. The
  code path is correct and simply cannot fire. See
  [deliberately unmodeled](../engine/deliberately-unmodeled.md).

## The roster

| Tier | Armorers |
|----|----|
| T0.5 | Claret |

## Related

* [Armorer, laceration, gash and maim](../concepts/armorer-laceration-gash-maim.md) — the mechanics
* [Rupture](rupture.md) — the other bespoke damage type, and the instructive contrast: Sheer
  ignores defense, Laceration is applied against it, so the two classes want opposite supports
* [Stun](stun.md) — the class that supplies both Gash builders and the two Laceration buffs

## Evolution

* 3.1
  * Rina receives a potential vision unlock that makes her the only support to buff teammates’ defense stat. This hints at her being best-in-slot for a defense-scaling DPS in a future release. 
* 3.2
  * The armorer class is introduced with Claret, an electric limited S-rank. She arrives as a
    hypercarry with no sub-DPS counterpart and a very light kit of her own — a Laceration buff
    for fellow armorers, plus a token crit-damage conversion that overrides the class default of
    no CD scaling.
  * Roxy releases in the same patch, intended as an armorer-centric stunner.
  * Koleda receives a potential vision unlock that cements her as the best stun alternative to Roxy.


