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

> Phoenix, Aria, Promeia, Alice, Burnice, Jane, Yanagi, Piper, Miyabi, Vivian

Grace sits between Burnice and Jane, close to Jane — but her team is **non-viable on
Girtablullu**, where `assist:evasive` leaves it one reliable defensive assist short.

Phoenix, Aria and Promeia are within a rank band of each other; the order between them is
asserted, the size of the gap is not. `Miyabi / Vivian / Remielle` sits below the whole Velina
track on Girtablullu, and on Stagnant Aberrant it legitimately climbs past the lower rungs but
must stay distinctly behind the top three.

## The Miyabi/Velina correction

**Miyabi is one of Remielle's weakest natural partners, and Velina one of her strongest.** The Miyabi lines survive purely because both units are individually enormous, not because they fit together particularly well.

The engine measures individual power well, and that was the problem. Velina's entire value is making Remielle work; measured on her own she prices out as a half-tier secondary sub-DPS. (This is a known issue of the scoring engine, but it remains for now.) Left alone, the engine ranked the Miyabi track above the Velina track for every carry except Aria and Promeia.

The first fix was two **declared** relationships — a mutual Remielle ↔ Velina pair, and Alice's
conjunctive `"Remielle+Velina"` group. Both were stopgaps, and the note recorded at the time was
that they papered over a gap the mechanics could not close, leaving the underlying blindness in
place: the engine could not see an enabler whose value is entirely relational until someone
declared it.

**Both have since been deleted, and the ladder holds without them.** Phase 3 of the anomaly
overhaul stripped every declared anomaly `synergy.units` relationship precisely to find out how
much the mechanics could carry, and the answer turned out to be all of it — once vortex, abloom,
proc rate, Luminize rebound and the lumen exclusions were each modelled properly. The one survivor
is a plain Alice → Remielle unit synergy, kept as an acknowledged compromise rather than a model.

What closed the blindness was not a better declaration but the **anomaly-supply channel**: a
partner's worth to Remielle is their Proficiency times their proc rate, summed as a weighted
count. That is why Aria is a strong Remielle partner and Miyabi a weak one, and it is mechanical.

**Rankings TEST 90 pins the resulting ladder.** It is boss-conditional and asserted only on the two
element-neutral bosses, because elemental scoring legitimately reorders the lower rungs.

## Third-slot ordering on the Vivian track

Playtested, best first:

> Miyabi, Alice, Promeia, Yanagi, Jane, Aria, Piper

**Pinned by rankings TEST 93**, on the same two bosses. Swapping Velina for Vivian reorders the
track substantially, and the two big movers are the reason the second ladder exists at all:

* **Miyabi goes from second-from-bottom to first.** Velina is wind and Miyabi is frost, whose
  vortex tier is 0.8 — she wastes a wind enabler, which is the anti-pattern TEST 62 charges for.
  Vivian is ether, so the pair makes **disorders** instead, and disorder damage reads proc damage
  rather than Proficiency. That is the one channel Miyabi's crit-driven procs dominate `[AP-02]`.
  She is the only carry on the roster who prefers the Vivian seat: **+78.0**, where everyone else
  loses 94 to 216 points by the swap.
* **Aria goes from second to sixth.** She is ether, Vivian is ether, and Remielle's lumen morphs
  to ether to follow them — so the team lands three ether elements and generates **no disorder at
  all**. The debug trace prints zero disorder lines, against six for Alice or Yanagi in the same
  seat. The best Proficiency on the roster has nothing to react with.

Grace and Burnice both demote to sub-DPS on this track — their `subdps` pseudo-role fires on
`notPresent: velina` — so neither is the carry being ordered, and neither is a rung. Their teams
are still legal and still score.

Yanagi, Jane and Aria are separated by 0.2 and 3.2 points here against a rank band of ~4.5. The
order is pinned because it is the owner's, but the engine is not claiming they are meaningfully
apart.

## Related

* [Lumen](../concepts/lumen.md) — Attribute Mutation, Refringe and Luminize.
* [Declared archetypes](../data-model/declared-archetypes.md) — the other place the engine
  is told something rather than deriving it.


