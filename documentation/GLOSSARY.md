# Glossary

One line each. Follow the link for the real treatment.

## Game vocabulary

| Term | Meaning |
|----|----|
| **Anomaly** | Damage from filling an element's gauge until it procs. [→](concepts/anomaly-reactions.md) |
| **Disorder** | The reaction when a *different* element's anomaly replaces an existing one. [→](concepts/disorder-supply.md) |
| **Vortex** | A wind reaction that, unlike a disorder, does **not** clear the existing anomaly proc. [→](concepts/anomaly-reactions.md) |
| **Abloom** | A reaction that fires only when an anomaly proc is already present. [→](concepts/anomaly-reactions.md) |
| **Lumen** | Remielle's element. Morphs damage but fills no gauge, so it procs nothing. [→](concepts/lumen.md) |
| **Sheer** | Rupture's damage type. Ignores enemy defense, so shred and PEN are worthless. [→](archetypes/rupture.md) |
| **Laceration** | The armorer's damage type. Applied *against* defense, so shred and PEN do work. [→](concepts/armorer-laceration-gash-maim.md) |
| **Gash / Maim** | The shared mark pool armorers detonate. [→](concepts/armorer-laceration-gash-maim.md) |
| **Stun window** | The interval after a stun when most carry damage lands. [→](archetypes/stun.md) |
| **Totalize** | Converting accumulated stun *time* into damage. [→](archetypes/totalize.md) |
| **Wheelchair** | A support pairing that uplifts almost any compatible carry. [→](archetypes/wheelchairs.md) |
| **Mindscape / potential vision** | Player investment levels the engine holds fixed. [→](concepts/investment-assumptions.md) |

## Data vocabulary

| Term | Meaning |
|----|----|
| `mechanics` | Everything the engine reads off a unit. [→](data-model/mechanics-overview.md) |
| `scaling` | What a unit **needs** from its team. [→](data-model/scaling.md) |
| `buffs` / `debuffs` | What a unit **supplies**. [→](data-model/buffs-and-debuffs.md) |
| `utility` | Provisions — things handed to a teammate outright, not stat buffs. [→](data-model/utility.md) |
| `damage` | The damage types a unit deals, and at what magnitude. [→](data-model/damage-and-burst.md) |
| `pseudoRole` | A second role a unit gains conditionally. Once active it **is** the role. [→](data-model/pseudorole.md) |
| `join` | Legality: who a unit is allowed to be on a team with. [→](concepts/additional-abilities-join.md) |
| `when` / `cases` | The conditional framework every field can use. [→](data-model/predicates.md) |
| `mechanics.archetypes` | The one deliberate declaration of support-by-carry fit. [→](data-model/declared-archetypes.md) |
| `synergy.units` | Hand-curated named-partner bonuses. A low-weight L5 fallback. [→](data-model/unit-object.md) |
| `scaling.codependent` | "This unit is non-functional without specific partners." Pull engine only. [→](recommendations/codependency-gating.md) |
| `scaling.greedy` | How much of a stun window a carry needs to itself. [→](data-model/scaling.md) |
| `shillIntensity` | A boss-side multiplier on favored-unit bonuses. Live, and currently contentious. [→](data-model/boss-object.md) |

## Engine vocabulary

| Term | Meaning |
|----|----|
| **L1–L5** | The five scoring layers. Knowing which one owns a change is most of the work. [→](engine/layers.md) |
| **Cohesion** | A whole-team multiplier for whether the team can *use* what each unit brings. [→](engine/cohesion.md) |
| **Fit** | Delivered magnitude over brought magnitude. A support that brings unusable things scores worse. [→](engine/cohesion.md) |
| **Teamwork multiplier** | The L4 term that scales a team by how well its parts interlock. [→](engine/teamwork-multiplier.md) |
| **Diametric synergy** | Credit for pairing a buff with its matching debuff. [→](engine/diametric-synergy.md) |
| **Raw vs calibrated** | Raw is what the engine returns; calibrated is what compares archetypes. **Always know which you hold.** [→](engine/reading-scores.md) |
| **Anchor / factor** | Per-archetype calibration constants, fitted and certified. [→](engine/calibration.md) |
| **Provision vs need vs buff** | Three distinct channels that share words. Confusing them has caused real bugs. [→](data-model/utility.md) |
| **Partner ladder** | A fitted stopgap letting the pull engine see partner quality. [→](recommendations/partner-ladder.md) |
| `KNOWN_RED` | Tests that are red on purpose. Both maps are currently empty. [→](tooling/verification-loop.md) |
| **Fingerprint** | A hash of `team-scorer.js` + `units.json` + `bosses.json` that marks calibration stale. It hashes **raw bytes**, so even a comment edit trips it. [→](engine/calibration.md) |
