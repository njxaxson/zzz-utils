# The Boss Object

Read from `app/public/data/bosses.json`. A boss is mostly a set of filters and modifiers
applied to a team that has already been scored on its own merits.

## Shape

```json
{
  "id": "vesper", "name": "Discordant Solo", "shortName": "Discordant Solo",
  "image": "./assets/bosses/solo.webp",
  "released": 2.6,
  "favored": ["Aria", "Sunna", "Nangong"],
  "available": true,
  "mechanics": {
    "weaknesses": ["ether", "wind"], "resistances": ["ice", "fire"],
    "shill": "anomaly", "anti": ["rupture"], "assists": 2,
    "weak": ["veils"], "anomaly:state": "wind",
    "freezable": true, "chainParry": false, "shillIntensity": 2,
    "control": 2,
    "debuffs": { "cd": 2, "daze": 2 }
  },
  "variations": { "raging": { "enabled": false, "mechanics": { "anti": null } } }
}
```

Note that `favored` and `released` are top-level, **not** inside `mechanics`.

## Top-level fields

| Field | Notes |
|----|----|
| `released` | Patch version when the boss was introduced (e.g., 1.0, 2.6, 3.1) |
| `favored` | Array of unit IDs that gain a bonus on this boss |
| `available` | If false, the boss is unreleased and hidden from the UI |

## `shill` — the role this boss prefers

The rule differs by role type, and the difference matters a lot.

**A DPS shill is a bonus with no penalty for mismatching.** Teams compete on merit.

**A non-DPS shill — in practice, stun — is a hard requirement.** No stunner, no score.

The requirement exists because a stun-shill boss gives you few damage openings. You stun it,
and the stun multiplier lets you dump a burst into that window. Without a stunner you cannot
open windows reliably, so your damage never lands.

**A stunless carry is exempt.** It holds the stun multiplier permanently and bursts without
needing a window at all, so it satisfies the shill by itself. It also earns *more* than a
stunner team does, because it keeps the slot — see [stunless](../archetypes/stunless.md).

The exemption is stun-specific and requires an actual stunless **DPS**. Every other stunnerless
team is still disqualified.

## The rest of `mechanics`

| Field | Effect |
|----|----|
| `weaknesses` / `resistances` | Element match bonus; a resisted carry is disqualified. See [element resistance and role](../engine/element-resistance.md) |
| `anti` | Carry archetypes disqualified outright |
| `weak` | Array of mechanic weaknesses — `disorders`, `veils`, `stun`, `abloom`. A boss can have several |
| `assists` | Minimum defensive-assist count. See [defensive assists](../concepts/defensive-assists.md) |
| `anomaly:state` | The boss permanently carries this element's anomaly. See [anomaly reactions](../concepts/anomaly-reactions.md) |
| `freezable` | Ice anomaly agents get a large bonus; pseudo-anomaly agents get half |
| `chainParry` | Blocks the limited-rotation reduction to the assist requirement |
| `debuffs.cd` | Penalises crit-damage-scaling carries when the debuff exceeds the team's CD supply |
| `debuffs.daze` | Slows daze accumulation |
| `control` | Number of control skills over the fight |
| `shillIntensity` | Multiplies the `favored` bonus. See below |

### `debuffs.daze`

Penalises attack, rupture and armorer carries in proportion to the shortfall. Anomaly carries
are exempt, being less window-dependent.

Unlike an `anti` entry, this is **fully mitigable** — bring a high-daze stunner and it goes
away.

### `control`

A control skill locks the player out of everything except dodging, parrying and assisting, and
lands without the telegraph players normally react to. Timing it correctly is a large part of a
good clear.

[Armorers](../concepts/armorer-laceration-gash-maim.md) intercept a control skill and reduce it
to a simple quicktime event, so an armorer's value rises with this count. The bonus scales with
`control` per armorer, with a steep falloff — the second armorer gets 25%, the third nothing —
since one interceptor already covers the fight.

**Bonus only.** A team without an armorer is never penalised for it.

### `shillIntensity` — a working field

`shillIntensity` multiplies the flat `favored` bonus. It defaults to 1, so most bosses are
unaffected.

Two bosses set it today:

| Boss | `shillIntensity` | `favored` |
|----|----|----|
| Sacrifice Bringer | 6 | Miyabi |
| Stagnant Aberrant | 3 | Remielle |

The first favored unit on the team gets the full multiplier; each subsequent one gets half of
the excess above 1. With the base favored bonus at 22 and an intensity of 6, that is:

| Favored units present | Multiplier | Bonus |
|----|----|----|
| First | 6 | +132 |
| Second and later | 3.5 | +77 each |

That is a large number, so if a ladder for Sacrifice Bringer or Stagnant Aberrant looks
lopsided toward one unit, this field is the first thing to check.

## `variations`

Named alternate configurations, shallow-merged onto the base. An explicit `null` **erases** a
base property.

`enabled: false` hides a variation from the **UI only**. CLI tools ignore the flag and will
always resolve an explicitly requested variation, e.g. `--bosses "butcher:raging"`.

All boss properties are read through accessors, so variation resolution stays transparent to
the scoring code.

## Bosses worth knowing by name

| Boss | Why it is interesting |
|----|----|
| **Scorched Horizon** | The wind `anomaly:state` boss. Team-side reactions suppressed, disorders replaced by vortex, polarity damage gutted, plus a CD debuff. Designed to favour Promeia (pure ice vortex) over Miyabi (frost, effectively zero) |
| **Thrall & Sobek** | `shill: stun`, a hard requirement. No stunner is a disqualification unless the team fields a stunless carry |
| **Notorious Dead End Butcher** | The first boss with a variation, one that favors non-anomaly stun-based teams and another that favors anomaly-based disorder teams |
| **Typhon Slugger** | `assists: 3` — every unit must have `assist:defensive` |
| **Girtablullu** | `chainParry: true` — the assist requirement cannot be reduced by limited-rotation units |
| **Sacrifice Bringer** | `freezable`, so ice anomaly agents get a large bonus. Also the highest `shillIntensity` |
| **Discordant Solo** | `weak: veils`, built around Sunna's ether veil stacking. Also `control: 2`, the highest in the roster, so it is the best showcase for the armorer quicktime bonus |
| **Primordial Nightmare / Wandering Hunter / Stagnant Aberrant** | Multiple `anti` entries narrow the field to a single viable archetype |

Full weakness and resistance lists and current `anti` sets belong in `bosses.json`, not here.