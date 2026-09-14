# Armorer, Laceration, Gash and Maim

The armorer is the fourth DPS class and a deliberate inversion of the standard model. It
scales off DEF, has almost no buffs it can receive, and detonates a shared meter. Claret is
the current example.

## Laceration damage

Laceration is the armorer's damage type — parallel to rupture's Sheer, **but applied against
normal enemy defense**. So unlike a rupture carry, an armorer *does* benefit from defense
shred and PEN.

## Two crit checks, no crit damage

| Check | Crit rate range | Laceration dealt |
|----|----|----|
| First | 0–100% CR | 150% |
| Overcritical | 100–200% CR | 300% |

So crit rate stays useful all the way to 200% instead of dying at 100%. But crit *damage* is
fixed, so CD buffs do nothing at all. Astra earns essentially nothing next to an armorer.
ATK scaling is likewise zero.

## The reduced-lever problem

An attacker can stack ATK, CR and CD. An anomaly agent can stack ATK plus AM and AP. An
armorer's entire lever set is:

> CR, Laceration, PEN, defense shred, and generic or elemental damage.

Because the set is so small, each remaining lever is worth *more* to an armorer than to
anyone else. That is why the baseline weighting gives armorers an elevated weight on PEN and
on defense shred, and why DEF buffs route through a dedicated higher-multiplier path that
makes Rina best-in-slot for the class.

## Defense shred stacks

Shred is cumulative across suppliers. Trigger and Nicole together reach roughly 60% between
them. Critically, shred raises armorer damage **without the armorer receiving a buff at all**,
which matters exactly because their buff-receiving surface is so narrow.

Trigger / Claret / Nicole is a stacked-shred team first and a crit-rate team second.

## Laceration buffs

`buffs.laceration` is the armorer analogue of `sheer` for rupture: a direct amplifier on the
class's own damage type. Almost nobody supplies it — Claret, plus Koleda and Roxy's
armorer-only P6 conditionals.

It is priced above a DEF buff because it is rare, and below a Sheer buff because an armorer
still keeps CR, PEN and shred while a rupture carry has fewer alternatives.

## Damage-lever dependency

A team supplying **none** of an armorer's levers takes a dedicated cohesion hit. It is
**graded, not binary**. Total supply is summed as:

> Σ max(CR, Laceration) + a secondary factor × Σ (PEN + defense shred)

and compared against a "fully supplied" threshold.

| Lever | Suppliers on the roster |
|----|----|
| Laceration | Koleda, Roxy |
| Crit rate | Nicole, Cissia |
| PEN, Defense | Rina |
| Defense shred | Nicole, Trigger |

A plain stunner like Lighter supplies nothing on that list.

## Diametric pairing is armorer-adjusted

The usual ATK-or-CD × defense-shred [diametric pair](../engine/diametric-synergy.md) would
hand an armorer a cohesion floor for buffs it cannot use. So for an armorer consumer, the
buff half of that pair becomes PEN, CR or Laceration instead.

The element buff × element debuff pair is left untouched, because elemental damage is a
full-value armorer lever. In practice that pair is currently *unreachable* for an armorer:
Claret is electric, Cissia's electric debuff is the roster's only electric-element supplier,
and there is no electric element **buff** to pair it with. See
[deliberately unmodeled](../engine/deliberately-unmodeled.md).

## Control skills

Armorers intercept a boss control skill and reduce it to a simple quicktime event, so their
value rises with the boss's `mechanics.control`. See the
[boss object](../data-model/boss-object.md).

## Laceration and Maim are role-inherent

A vanilla armorer needs no `scaling` and no `damage` entry at all — the role carries both.
Claret declares only a Laceration buff for fellow armorers and `scaling.cd: 1`, a token
conversion of crit damage into Laceration that overrides the class's default of no CD
scaling.

## Gash into Maim

Only armorers **open** Gash meters, and all meters share **one pool of marks**.

* Stun agents and armorers both **build** the pool.
* Only armorers **detonate** it, into a **Maim** — a burst parallel to a disorder.

More builders fill the shared pool faster, which is why an armorer wants a stun-dense or
armorer-dense team rather than double support. The engine models this as a builder-scaled
bonus with the builder count capped, representing the shared ceiling.
## Code notes

### [ARM-01] Defense shred is a full-value armorer lever

`resolveBaselineWeight(consumer, 'defense')` returns **3** for an armorer against 1 for an
ordinary DPS or stunner — the same tier as `cr`, `def` and `laceration`, and one step above
`pen`.

It sat at 2, level with `pen`, and the two are not comparable. `pen` earns its armorer premium
defensively: ATK and CD are dead for an armorer, so PEN is one of the few levers *left*. Defense
shred earns a premium on its own merits — it stacks across suppliers (Trigger plus Nicole is
roughly 60% shred), and it raises Laceration damage without the armorer receiving a buff at all,
so it costs the team nothing in buff-utilisation fit.

Reachable only by a team pairing Claret with Nicole or Trigger — the roster's only two defense
debuffers. Measured across the released corpus at the time of the change: 415 team-boss rows
moved, every one of them a Claret line, all upward, nothing else in the corpus touched.

The immediate cause for revisiting it was TEST 71, where Trigger's lead over Roxy on
electric-weak UCC turned out to rest on the solo-carry bonus rather than on any part of her kit.
See [PIPE-01](../engine/layers.md#pipe-01-the-solo-carry-bonus-is-sized-against-the-mechanics-it-sits-beside).
