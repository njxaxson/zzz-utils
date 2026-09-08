# The Unit Object

Everything the engine knows about a unit is read from `app/public/data/units.json`. This is a
contract a human edits by hand.

## Shape

```json
{
  "id": "aria", "name": "Aria", "aliases": ["..."],
  "image": "./assets/characters/aria.webp",
  "rank": "S", "limited": true, "released": "2.6", "tier": 0.5,
  "tags": ["anomaly", "ether", "aod", "assist:defensive"],
  "join": ["stun", "support"],
  "faction": "Angels of Delusion",
  "available": true,
  "synergy": { "units": [], "tags": [], "avoid": [] },
  "mechanics": { "damage": { "enhanced": 2, "abloom": 2 }, "scaling": { "veils": 2 } },
  "displayText": "Free text shown on the character summary",
  "gender" : "female",
  "species" : "robot"
}
```

## The top-level fields

| Field | Notes |
|----|----|
| `tier` | Numeric, **T0 is best**. Tiers change often — read the data, never quote a tier from documentation |
| `released` | Patch version when the unit was released (e.g., "1.0", "2.4", "3.1") |
| `tags` | Role, element, faction and assist type combined. `title` marks a titled unit |
| `join` | Additional Ability prerequisite — see [additional abilities](../concepts/additional-abilities-join.md) |
| `available: false` | Unreleased. Included for pre-release testing, surfaced by the CLI's `--preview` flag |
| `aliases` | Fuzzy CLI matching — "S11", "YSG" |
| `mechanics` | The interesting part. See [mechanics overview](mechanics-overview.md) |

## `synergy` — largely retired

Mechanics express nearly everything now. What survives:

### `synergy.units` — the named-partner bonus

Two forms:

**A bare name** (`"Velina"`) pays when that unit is on the team. When *both* sides of a pair
declare each other, it also earns a mutual bonus — so a reciprocal declaration is worth far
more than a one-way one.

**A** `"+"`-joined group (`"Remielle+Velina"`) is **conjunctive**: it pays only when every unit
named is present, and pays nothing at all on a partial match. This is for a carry whose real
partner is a *pair* rather than a unit. Alice wants Remielle **and** Velina together; neither
alone is what makes her work. It is worth more than a bare name because satisfying it costs
both remaining slots.

There are two conjunctive declarations today:

| Declaration | Status |
|----|----|
| Alice's `"Remielle+Velina"` | Legitimate — see [triple anomaly](../archetypes/triple-anomaly.md) |
| The Trigger / SAnby / Seed trio, where SAnby and Seed each name the other two | A stopgap |

The second one is frankly papering over a misclassification: Seed plays support but is tagged
`attack` and declares no `pseudoRole`, so the engine reads the team's shape wrongly. Read the
internals notes before adding a third.

Both forms are deliberate exceptions to
[mechanics-emergent scoring](../engine/design-premise.md), in the same spirit as
[declared archetypes](declared-archetypes.md). They exist for relationships whose real cause is
too granular to model — Aria's and Alice's edge beside Remielle and Velina is anomaly-buildup
cadence, and this engine does not simulate cadence.

### The other two

* `synergy.tags` survives only on Ju Fufu (`["rupture"]`), also as a stopgap.
* `synergy.avoid` is a near-disqualification for anti-synergy too awkward to model
  mechanically — a hard disqualification in strict mode, a large penalty in
  [lenient mode](../engine/element-resistance.md). Currently unused by any unit.


### Additional unit metadata fields

* `displayText` is rendered on the Character Summary page.
* `gender` indicates the unit’s gender (male, female, nonbinary, etc.). Not currently used by the code anywhere. 
* `species` indicates the unit’s species, subspecies, or additional species classifiers. Not currently used by the code anywhere. 


