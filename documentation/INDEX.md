# Index

**This is a routing table, not a table of contents.** Find the row that matches what you are
about to do, read those files, and stop. The docs are split small on purpose — you should not
need more than two or three for any one task.

If you are just orienting: [engine/design-premise.md](engine/design-premise.md) is the shortest
thing that will make the rest make sense, and [GLOSSARY.md](GLOSSARY.md) defines the vocabulary.

## By task

| If you are... | Read |
|----|----|
| Adding or editing a unit's `mechanics` | [mechanics-overview](data-model/mechanics-overview.md), then the specific field's page |
| Editing a unit's **stat line** (`ap`, `am`, ATK…) | [stats](data-model/stats.md) — and note it is *not* `damage.basic` |
| Writing a conditional (`when`, `cases`) | [predicates](data-model/predicates.md) |
| Adding or editing a boss | [boss-object](data-model/boss-object.md) |
| Giving a unit a second role | [pseudoRole](data-model/pseudorole.md) + [role activation ripple](engine/role-activation-ripple.md) |
| Changing **cohesion** | [cohesion](engine/cohesion.md), then [known pitfalls](notes/known-pitfalls.md) — this has been rebuilt once and the wrong designs are recorded |
| Changing **disorders** | [disorder supply](concepts/disorder-supply.md) + [known pitfalls](notes/known-pitfalls.md) |
| Changing the **teamwork multiplier** | [teamwork multiplier](engine/teamwork-multiplier.md) + [known pitfalls](notes/known-pitfalls.md) |
| Changing anything in `team-scorer.js` | [layers](engine/layers.md) first — to know which layer owns the change |
| Resolving a new per-team value onto a unit | [unit context](engine/unit-context.md) — it goes on the context, never on `units.json` data |
| Working out why a team scores as it does | [reading scores](engine/reading-scores.md), then the relevant [archetype](archetypes/README.md) |
| Comparing scores across archetypes | [reading scores](engine/reading-scores.md) and [calibration](engine/calibration.md) — check which scale you are holding |
| Working on pull recommendations | [pull engine](recommendations/pull-engine.md) |
| Working on gap detection or coverage | [coverage and gaps](recommendations/coverage-and-gaps.md) |
| Working on Deadly Assault allocation | [deadly assault](bucketing/deadly-assault.md) |
| Running or debugging a CLI script | [CLI reference](tooling/cli-reference.md) |
| **Verifying a change** | [verification loop](tooling/verification-loop.md) and [measuring a change](tooling/measuring-a-change.md) |
| Chasing a `[TAG]` you found in the source | [reference/TAGS.md](reference/TAGS.md) |
| Deciding whether something is already settled | [adjudications](notes/adjudications.md) — do not re-litigate these |
| About to try something clever | [known pitfalls](notes/known-pitfalls.md) — it may already have been measured and rejected |
| Wondering what is broken right now | [STATUS.md](STATUS.md) and [issues/open](issues/open/) |
| Wondering when and why something changed | [CHANGELOG.md](CHANGELOG.md) |

## The map

**[STATUS.md](STATUS.md)** — current state only: test state, what is open, what is deferred.
**[CHANGELOG.md](CHANGELOG.md)** — what shipped, newest first. History, not status.
**[GLOSSARY.md](GLOSSARY.md)** — one-line definitions.

### `concepts/` — game domain

What the game does, independent of how this engine models it.
[Elements and roles](concepts/elements-and-roles.md) ·
[Anomaly reactions](concepts/anomaly-reactions.md) ·
[Disorder supply](concepts/disorder-supply.md) ·
[Lumen](concepts/lumen.md) ·
[Armorer, laceration, gash and maim](concepts/armorer-laceration-gash-maim.md) ·
[Additional abilities (`join`)](concepts/additional-abilities-join.md) ·
[Defensive assists](concepts/defensive-assists.md) ·
[Investment assumptions](concepts/investment-assumptions.md)

### `archetypes/` — the seven classes and the team shapes

Start at the [roster](archetypes/README.md). One page per class, plus the shapes that are
defined by slot count rather than by carry:
[totalize](archetypes/totalize.md) (double stunner),
[stunless](archetypes/stunless.md) (no stunner),
[triple anomaly](archetypes/triple-anomaly.md),
[monoshock](archetypes/monoshock.md),
[wheelchairs](archetypes/wheelchairs.md).

### `data-model/` — how units and bosses are written

[Unit object](data-model/unit-object.md) ·
[mechanics overview](data-model/mechanics-overview.md) ·
[stats](data-model/stats.md) ·
[predicates](data-model/predicates.md) ·
[pseudoRole](data-model/pseudorole.md) ·
[damage and burst](data-model/damage-and-burst.md) ·
[buffs and debuffs](data-model/buffs-and-debuffs.md) ·
[utility](data-model/utility.md) ·
[scaling](data-model/scaling.md) ·
[declared archetypes](data-model/declared-archetypes.md) ·
[boss object](data-model/boss-object.md)

### `engine/` — how the score is produced

[Design premise](engine/design-premise.md) ·
[layers](engine/layers.md) ·
[unit context](engine/unit-context.md) ·
[L4 components](engine/l4-components.md) ·
[ultimates two-channel](engine/ultimates-two-channel.md) ·
[cohesion](engine/cohesion.md) ·
[teamwork multiplier](engine/teamwork-multiplier.md) ·
[diametric synergy](engine/diametric-synergy.md) ·
[role activation ripple](engine/role-activation-ripple.md) ·
[element resistance](engine/element-resistance.md) ·
[calibration](engine/calibration.md) ·
[reading scores](engine/reading-scores.md) ·
[deliberately unmodeled](engine/deliberately-unmodeled.md)

### `recommendations/` — the pull engine

[Pull engine](recommendations/pull-engine.md) ·
[coverage and gaps](recommendations/coverage-and-gaps.md) ·
[mechanicsFitScore](recommendations/mechanics-fit-score.md) ·
[codependency gating](recommendations/codependency-gating.md) ·
[partner ladder](recommendations/partner-ladder.md) ·
[cards and priority](recommendations/cards-and-priority.md)

### `bucketing/` — Deadly Assault

[Deadly assault](bucketing/deadly-assault.md) — marginal value, rank bands, allocation.

### `tooling/`

[CLI reference](tooling/cli-reference.md) ·
[verification loop](tooling/verification-loop.md) ·
[measuring a change](tooling/measuring-a-change.md)

### `notes/` — what the code cannot tell you

[Guiding principles](notes/guiding-principles.md) — the rules the engine is built on.
[Known pitfalls](notes/known-pitfalls.md) — what has been tried and failed, with the numbers.
[Lessons learned](notes/lessons-learned.md) — how the big reworks actually went.
[Adjudications](notes/adjudications.md) — settled calls; do not re-open these.
[Agent notes](notes/agent-notes.md) — how to work in this repo without breaking it.

### `issues/`

[How the issue system works](issues/README.md) ·
[open](issues/open/) · [deferred](issues/deferred/) · [resolved](issues/resolved/)

### `reference/`

[TAGS.md](reference/TAGS.md) — resolve a `[COH-04]` style reference from the source.
