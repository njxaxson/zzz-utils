# Anomaly (triple)

**Shape:** three primary-anomaly units, enabled by Remielle.

Traditional anomaly [wheelchairs](wheelchairs.md) are strongly *sub*optimal for Remielle. She
wants two more anomaly agents, not a stunner and a buffer, because her damage comes from
[rebounding teammate procs](../concepts/lumen.md) but also because the caliber of her capabilities is explicitly dependent 

on having a triple-anomaly agent team composition. Without two other native anomaly members 

(i.e. not pseudoanomalies) on the team, Remielle is significantly hamstrung. 

## Remielle has two tracks

Vivian and Velina are the only *fully dedicated* anomaly sub-DPS units in the game — everyone
else is conditional — so each anchors one track.

| Track | Trades on |
|----|----|
| Remielle + Velina | vortex and abloom |
| Remielle + Vivian | disorders |

These are not interchangeable, and the engine prices the two axes through very different
channels. Disorders get a dedicated team-wide need computation
([disorder supply](../concepts/disorder-supply.md)); vortex and abloom go through the
ordinary buff and damage-need channels.

Burnice is an less-optimal alternative to Vivian for disorder-based compositions; e.g. Miyabi/Burnice/Remielle.

## Third-slot ordering on the Velina track

Playtested, best first:

> Aria, Promeia, Alice, Burnice, Jane

Burnice and Jane are close to each other. `Miyabi / Vivian / Remielle` sits below the whole
Velina track.

## The Miyabi/Velina correction

**Miyabi is one of Remielle's weakest natural partners, and Velina one of her strongest.** The Miyabi lines survive purely because both units are individually enormous, not because they fit together particularly well.

The engine measures individual power well, and that was the problem. Velina's entire value is making Remielle work; measured on her own she prices out as a half-tier secondary sub-DPS. (This is a known issue of the scoring engine, but it remains for now.) Left alone, the engine ranked the Miyabi track above the Velina track for every carry except Aria and Promeia.

The fix is two **declared** relationships:

* a mutual Remielle ↔ Velina pair, and
* Alice's conjunctive `"Remielle+Velina"` group.

Note what this is *not*: it is not a model of anomaly buildup cadence. Nobody worked out how the gauges actually interleave. Two declared relationships paper over a gap the mechanics-emergent model could not close, which is honest but leaves the underlying blindness in place — the engine still cannot see an enabler whose value is entirely relational until someone declares it.

**Test 116 pins the resulting ladder.** It is boss-conditional and asserted only on the two
element-neutral bosses, because elemental scoring legitimately reorders the lower rungs.

## Related

* [Lumen](../concepts/lumen.md) — Attribute Mutation, Refringe and Luminize.
* [Declared archetypes](../data-model/declared-archetypes.md) — the other place the engine
  is told something rather than deriving it.


