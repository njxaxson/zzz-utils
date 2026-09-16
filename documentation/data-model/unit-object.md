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

There are three conjunctive declarations today, and they are all the same team:

| Declaration | |
|----|----|
| Nangong's `"Aria+Sunna"` | |
| Aria's `"Nangong+Sunna"` | the Angels of Delusion — see `[AOD-01]` below |
| Sunna's `"Nangong+Aria"` | |

Every earlier conjunctive declaration has been deleted. Alice's `"Remielle+Velina"` went when
phase 3 of the anomaly overhaul stripped the declared anomaly relationships to find out how much
the mechanics could carry; they carried it. The Trigger / SAnby / Seed pair went when the real
cause was fixed — Cissia now resolves her support pseudo-role from a second electric attacker
rather than from Seed's id, so the team stopped classifying supportless and stopped needing a
declaration to clear its floor.

That history is the standard to hold a new one to: **both predecessors turned out to be papering
over something modellable.** Read [the internals notes](../notes/adjudications.md) before adding
a fourth.

Both forms are deliberate exceptions to
[mechanics-emergent scoring](../engine/design-premise.md), in the same spirit as
[declared archetypes](declared-archetypes.md). They exist for relationships whose real cause is
too granular to model — Aria's and Alice's edge beside Remielle and Velina was anomaly-buildup
cadence, and this engine does not simulate cadence.

### `[AOD-01]` Why the Angels of Delusion are declared, and how 45 was arrived at

`Nangong/Aria/Sunna` is the one team in the game carried by declaration rather than by modelled
mechanics. Owner's reasoning: much of its real strength is innate faction synergy that is very
hard to model, and the game is suspected of carrying hidden modifiers that fire only when all
three are together. **A conjunctive group is the literal encoding of that sentence**, which is why
this is a good use of the mechanism rather than a stopgap like the two before it.

**Conjunctive and not mutual, and the distinction is not cosmetic.** A mutual Nangong ↔ Aria pair
reaching the same total would also pay on every *other* team holding those two — `Nangong/Aria/
Yuzuha` and friends — lifting teams nobody asked to lift. The conjunctive form is airtight, and
that was measured rather than assumed: adding these three declarations moved **exactly 14
team-boss rows, every one of them this single team**, with no two-of-three team touched at all.

**`CONJUNCTIVE_SYNERGY_BONUS` was re-derived 55 → 45** as part of this. The 55 had been sized for
the Trigger / SAnby / Seed stopgap, which no longer exists, so by the time this landed the
constant had **no users at all** — its basis was gone, not merely stale. Three declarations at 45
gives 135 raw, which is what the target asked for:

| bonus | L5 raw | AoD vs the better reference, averaged | top non-Miyabi/non-Remielle anomaly team |
|----|----|----|----|
| 35 | 105 | −46.7 | 11 of 14 bosses |
| 40 | 120 | −32.3 | 11 of 14 |
| **45** | **135** | **−17.5** | **12 of 14, never worse than 3rd** |
| 50 | 150 | −2.7 | 14 of 14 |
| 55 | 165 | +12.4 | 14 of 14 |

The references are `Nangong/Miyabi/Yuzuha` and `Aria/Remielle/Velina`, and the average is taken
over the 14 bosses where AoD and at least one reference are both viable. The owner's target was
15–20 points back; 45 is the only half-step value inside it.

**Sized against a ladder, not derived from a mechanic** — say so whenever it moves. Rankings
TEST 94 guards it from both sides: AoD must stay at least 10 points behind on average, because a
declaration-carried team outscoring the modelled ones means the declaration has been oversized,
and no further back than 25. Mechanics TEST 32 pins the *gating* and deliberately knows nothing
about the amount; it used to assert `>= 55` and broke on this re-derivation, which was a hidden
pin rather than a real failure.

### The other two

* `synergy.tags` survives only on Ju Fufu (`["rupture"]`), also as a stopgap.
* `synergy.avoid` is a near-disqualification for anti-synergy too awkward to model
  mechanically — a hard disqualification in strict mode, a large penalty in
  [lenient mode](../engine/element-resistance.md). Currently unused by any unit.


### Additional unit metadata fields

* `displayText` is rendered on the Character Summary page.
* `gender` indicates the unit’s gender (male, female, nonbinary, etc.). Not currently used by the code anywhere. 
* `species` indicates the unit’s species, subspecies, or additional species classifiers. Not currently used by the code anywhere. 


