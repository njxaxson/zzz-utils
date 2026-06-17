# Team Scoring Engine Context

This document provides domain knowledge for the ZZZ team scoring engine (`app/public/lib/common/team-scorer.js`). It is the primary reference for understanding the game mechanics, data model, engine architecture, and diagnostic tooling needed to implement new features or fix scoring issues.

**Source of truth for tier rankings:** `app/public/data/units.json`
**Source of truth for boss data:** `app/public/data/bosses.json`
**Source of truth for scoring logic:** `app/public/lib/common/team-scorer.js`

This document captures gameplay mechanics and design decisions. Specific scoring numbers mentioned are illustrative only and may differ from the current implementation — always consult the code for exact values.

## Game Fundamentals

### Elements

The game has six standard elements: **Fire**, **Ice**, **Electric**, **Ether**, **Physical**, and **Wind** (added in version 2.8).

Each element has standard interactions with boss weaknesses and resistances. A DPS unit whose element matches a boss weakness receives a bonus; a DPS unit whose element is resisted by a boss is disqualified (with limited exceptions for pseudosupports).

### Element Variants

Some exceptionally powerful characters - “titled” units Miyabi, Yixuan, and YSG - have unique element variants that behave like their base element for weakness/resistance purposes but track anomaly buildup separately:

| Unit | Base Element | Variant | Disorder Interaction |
|----|----|----|----|
| Miyabi | Ice | Frost | Frost + Ice = disorder (e.g., Miyabi + Soukaku) |
| Yixuan | Ether | Auric Ink | Auric Ink + Ether = disorder (rarely relevant) |
| YSG | Physical | Honed Edge | Honed Edge + Physical = disorder (rarely relevant) |

The `mechanics.elementalVariant` variable marks this; right now only titled units have elemental variants but it could be expanded to others in the future. It is used in disorder generation checks and vortex tier determination. Some elemental variant units receive only flat/negligible vortex damage in comparison to their base element — a deliberate design choice that limits or enhances their synergy with the wind/vortex mechanic. For example, Remielle, a future ether anomaly void hunter, may be released with a unique elemental variant that has particularly strong synergy with wind.

### Roles

Every unit has a primary role in their `tags` array:

* **Attack** — On-field DPS dealing damage through standard attacks, chains, and ultimates during stun windows
* **Anomaly** — DPS dealing damage through anomaly buildup, disorders, and enhanced attacks
* **Rupture** — DPS dealing sheer damage (a special classification of damage) that ignores enemy defense entirely
* **Stun** — Creates high-damage windows by stunning enemies; stunners also deal meaningful damage
* **Support** — Buffs teammates and provides utility; negligible personal damage
* **Defense** — Provides shields, healing, damage mitigation and often buff teammates; negligible personal damage

The first three (attack, anomaly, rupture) are **DPS roles**. Units can have additional roles via `pseudoRole` in their mechanics data (see Role Activation below).

### Anomaly Reactions

When two different-element anomalies are applied to the same target simultaneously, a reaction occurs:

* **Disorder**: Both anomalies are non-wind. Standard reaction. Bonus damage dealt.
* **Vortex**: Exactly one anomaly is wind. Damage depends on the non-wind element's tier:

| Non-wind element | Tier | Relative weight |
|----|----|----|
| Ice | High | 3 |
| Fire, Physical | Medium | 2 |
| Ether, Electric | Low | 1 |
| Elemental variants (Frost, Auric Ink, Honed Edge) | Flat/negligible | <1 |

Same-element pairs (including wind+wind) produce no reaction.

**Boss anomaly state**: A boss with `mechanics["anomaly:state"]` permanently has that element's anomaly applied. The boss's anomaly immediately consumes every team-applied anomaly, suppressing all team-side reactions between agents. Each agent only reacts with the boss's anomaly (one reaction per agent). Same-element agents get nothing.

**Critical distinction**: Boss weakness to wind (just a `weaknesses[]` entry) does NOT affect anomaly reactions. Boss anomaly state (`mechanics["anomaly:state"]`) does. A boss can have wind weakness without wind anomaly state, or vice versa.

### Polarity and Disorders

Polarity disorders are a subclass of disorders. Any buff that targets disorders (e.g., Yuzuha's `buffs.disorders: 3`) directly buffs polarity disorder damage. In the engine, `buffs.disorders` supplies both the baseline affinity `disorder-buff` path AND `damage.polarity` need fulfillment (via the damage-type loop, where `damage.polarity` checks `supplierBuffs.disorders` as a fallback). Polarity providers (`utility.disorders`) generate forced disorder occurrences regardless of boss anomaly state, but on vortex bosses (wind anomaly state), polarity disorder *damage* is reduced to \~25% (`POLARITY_VORTEX_DISCOUNT`). Their occurrence still fully feeds `scaling.disorders`.

### Mindscapes, Weapons, and Potential Silhouettes

Units range from M0W0 to M6W5.

* **Mindscapes (M0–M6):** Each pull beyond the first adds a mindscape. M1/M2/M4/M6 add unique abilities; M3/M5 increase skill levels. M6 S-ranks are extremely powerful but require heavy investment. For many limited DPS units, M2 is a substantial power spike (e.g., M2 Miyabi generates her own disorder fuel, reducing teammate dependency).
* **Weapons (W0–W5):** W0 = no signature weapon; W1 = signature weapon equipped (often \~20% DPS increase). W2–W5 provide diminishing stat returns. For non-DPS agents, even W1 may not be worth the investment.
* **Potential Silhouettes (P0–P6):** Supplemental buffs unlocked at M0+. P1/P2 add new capabilities and even potentially new joins to expand their legal teammates; P3–P6 are stat increases. Impact varies by unit (e.g., P6 SAnby is significant; P6 Grace is negligible). For units with available silhouettes, the algorithm assumes P6.

**Scoring assumptions:** S-rank DPS at M0W1, non-DPS S-ranks at M0W0, A-rank units at M6W5. Mindscape-specific synergies (e.g., M2 Alice/Jane/Yuzuha being one of the best teams in the game) are deliberately not modeled because the engine cannot accept mindscape levels as input.

### Additional Abilities (`join`)

Each unit has a `join` array representing the tags required to activate their Additional Ability. At least one teammate must carry a matching tag. The team-builder uses `join` as a **hard prerequisite** — teams that don't satisfy every unit's `join` condition are never formed or scored.

A small number of "flex" units (e.g., Nicole, Lucy) provide enough value even without their additional ability activated, but these are exceptions.

### Defensive Assists

When an enemy telegraphs an attack (gold flash), the player can switch in a teammate. Each unit carries either `assist:defensive` or `assist:evasive` in their tags. Some bosses require a minimum number of defensive assist units; teams that don't meet the requirement are disqualified. Boss `assists` field specifies the requirement (0 = no requirement, 3 = all three must be defensive).

## Team Archetypes

These are the common gameplay patterns that the engine recognizes through its mechanics-driven architecture. The engine does not hardcode composition templates — these patterns emerge from mechanical interactions scored in Layers 1–4.

### Attack Teams

**Typical:** Stunner + Attacker + Support/Defense

Attackers need stun windows to deal damage. The stunner creates vulnerability periods; the support amplifies the attacker's output during those windows. Double attacker is viable in some scenarios, such as when one has `subdps` pseudoRole.

**Stunless Exception (YSG):** YSG receives the same stun damage multiplier even when the enemy is stunned; so inflicting stuns does not actually increase her damage output like it would for other attackers. (She does signficantly benefit from any increase to the stun damage multiplier, though, for this same reason - the increased multiplier is applied all of the time, not just during stun windows.) Her ideal composition is double-support (YSG + 2 supports). Having a stunner with YSG is suboptimal — except Dialyn, who provides free ultimate attacks and a stun multiplier increase. YSG's double-ultimate is the highest burst damage in the game, making Dialyn's ultimate provision uniquely valuable.

### Anomaly Teams

**Modern meta:** Stunner (Nangong/Lycaon) + Anomaly DPS + Support (Yuzuha/Sunna)
**Classic:** Anomaly DPS + Anomaly SubDPS (Vivian/Burnice) + Support (Yuzuha)

Nangong's release fundamentally changed anomaly team building. As a T0 hybrid stun/anomaly unit, Nangong provides anomaly buffs, extended stun windows, and polarity disorder triggers — making `Nangong/<Anomaly DPS>/Yuzuha` the strongest anomaly template, replacing `<Anomaly DPS>/Vivian/Yuzuha`. Lycaon (at P1+) serves as a budget alternative with ice defense shred. Interestingly enough, Promeia is the latest anomaly agent and in some cases she prefers Vivian over Nangong because of the higher quantity of abloom-specific damage, which Promeia buffs. So both compositions exist in modern play.

**Disorder generation:** When two anomaly-typed units of different elements are on the same team, they naturally generate disorders for bonus damage; unless one of them is wind, in which they generate a vortex instead. Disorders are especially critical for units with transformative scaling that is based on disorders, such as Miyabi who converts disorders into enhanced attacks.

### Rupture Teams

**Typical:** Stunner + Rupture DPS + Support/Defense (Lucia, Pan Yinhu)

Rupture deals Sheer damage that **ignores enemy defense**. This means defense debuffs (Nicole's 40% defense shred) are useless for rupture teams, and PEN ratio is irrelevant. The primary support is Lucia (specialist, +1200 Sheer) or Pan Yinhu (A-rank specialist).

**Synergistic stunners:** Dialyn and Ju Fufu (who has `synergy.tags: ["rupture"]`) are preferred over generic stunners. Dialyn's free ultimates are particularly valuable. Ordering: Dialyn > Ju Fufu > Astra for rupture teams. Norma, an upcoming stun unit, has a unique feature that allows her to convert sheer damage buffs from Lucia or Pan back into her own personal attack buffs, and will likely make her the second-best stunner for rupture teams after Dialyn.

### Totalize Teams (Hugo)

**Typical:** DPS + Double Stunner

Hugo converts accumulated stun time into damage (totalize mechanic). More stun uptime = more totalize damage. Hugo prefers two stunners over a stunner + support, even if the second stunner is low-tier. Hugo is marked `onfield: false` because he enters briefly for chain attacks and totalize bursts, then returns field time to his stunners.  Pyrois, a free agent who will be available in an upcoming release, also deals totalize damage, although is not as reliant upon it as Hugo as his main damage output.

### “Monoshock” Teams

**Typical but not essential:** Anomaly + Attacker + Stunner or Support

There is technically the possibility to have hybrid attack+anomaly compositions; the classic example is the long-outdated  Grace/Harumasa/Rina team. This "monoshock" team — named because it is a triple-electric team whose strategy is to keep ongoing shock bonuses during the whole fight — is no longer all that competitive, but hybrid anomaly+attack compositions *are* technically still possible and can be used in some niche cases.  The “monoshock” moniker is typically used to refer to these hybrid anomaly/attacker teams (because of the original team that met this composition) but it does not need to be a triple-electric team; it is just a nickname for an unusual hybrid archetype.

## Notable Units Reference

| Unit | Tier | Role | Key Mechanics | Notes |
|----|----|----|----|----|
| **Miyabi** | Titled T0 | Anomaly (Frost) | `scaling.disorders:3, damage.enhanced:3` | Transformative scaling — disorders fuel enhanced attacks. Can execute \~5 ultimate-equivalent attacks in one stun window. Frost variant triggers disorders with ice units (Soukaku). |
| **Yixuan** | Titled T0 | Rupture (Auric Ink) | `damage.ultimate:double` | Best-in-slot with Dialyn+Lucia. |
| **YSG** | Titled T0 | Attack (Honed Edge) | Stunless, `scaling.veils:2, damage.ultimate:double` | Built-in stun multiplier. Double-support ideal; Dialyn exception for free ultimates. |
| **Nangong** | T0 | Stun + pseudoAnomaly | `buffs.anomaly:3, debuffs.recovery:3, utility.disorders:2` | Hybrid stun/anomaly. Replaces Vivian as Miyabi's best teammate. Forms the Nangong+Yuzuha and Nangong+Sunna wheelchairs. |
| **Hugo** | T1 | Attack (Ice) | `damage.totalize:3` | Totalize mechanic. Wants double-stun. `onfield: false`. |
| **Aria** | T1 | Anomaly (Ether) | `damage.enhanced:2, abloom:2, scaling.veils:2` | Plays like an attacker (wants stun windows). Ether veil scaling makes Sunna her best support. AoD faction. |
| **Evelyn** | T0.5 | Attack (Fire) | `damage.chain:3, scaling.chains:3, scaling.recovery:1` | Chain attack specialist. Strongly prefers Astra (chain provision). Benefits from recovery debuffs (Lighter). |
| **SAnby** | T0.5 | Attack (Electric) | `damage.aftershock:2, buffs.aftershock:3` | Buffs aftershock teammates (Trigger, Orphie). Teams without aftershock consumers waste her buff. |
| **Seed** | T1 | Attack (Electric) | `join: ["attack"]` | Requires a second attacker. Best with Cissia (burst duo) or Orphie. |
| **Harumasa** | T1.5 | Attack (Electric) | `synergy.tags: ["anomaly"]` | Currently the only attack agent who supports hybrid anomaly/attack compositions. |
| **Soukaku** | T1.5 | Support (Ice) + pseudoAnomaly | `buffs.ice:3, atk:3` | Ice specialist only. Frost/ice disorder with Miyabi. On-field status derived dynamically from role activation. |
| **Orphie** | T1 | Attack (Fire) + pseudoSupport/SubDPS | `buffs.atk:2, damage.aftershock:3` | Support-like attacker. Scored as T1 support (not T1 DPS) in L2. Cannot satisfy attack shill as pseudosupport. SubDPS still benefits from stun bonuses. |
| **Caesar** | T0 | Defense + pseudoStun | `buffs.atk:2, utility.shields:2` | Pseudo-stun always activates. Provides daze + ATK buff + interrupt resistance. |
| **Lycaon** | T1 | Stun (Ice) | `debuffs.ice:2, buffs.stun-multiplier:2` | At P1+, `join` expands to anomaly agents. Ice defense shred benefits Miyabi/Promeia. Budget Nangong alternative. |
| **Cissia** | T1.5 | Attack (Electric) + SubDPS | `buffs.cr:1, debuffs.electric:2, utility.daze:1` | Seed's ideal partner. Can function support-like on electric teams. |
| **Vivian** | T0.5 | Anomaly (Ether) + SubDPS | `damage.abloom:3, scaling.am:2, onfield:false` | Was Miyabi's best partner before Nangong. Still strong but dropped from T0. |
| **Promeia** | T0.5 | Anomaly (Ice) | `damage.abloom:3, buffs.abloom:3, debuffs.defense:2` | Ice anomaly with tier-3 vortex. Abloom buffer. Direct Miyabi alternative on Scaled Horizon — pure ice vortex vs. frost variant. |
| **Jane Doe** | T1.5 | Anomaly (Physical) | `buffs.vortex:3` | Physical anomaly with a retroactive vortex buff. Contextual bonus — no cohesion penalty when inactive. When Jane causes a physical anomaly that triggers a vortex, the vortex is considered a critical hit and gets the crit damage modifier. This is modeled as a generic vortex buff rather than to complexly model a narrow game mechanic, and so it provides a modest boost to average out its actual value. |
| Norma | T0.5 | Stun (Fire) | `damage.chains, scaling.sheer, scaling.quick-assists` | Norma is a stunner designed as a subdps. She is intended to work with attack and rupture teams. She has two unique features: she can upgrade quick assists into chain attacks (a huge damage boost when paired with Astra) and she converts sheer buffs into ATK (so huge damage boost when paired with Lucia).  She also has chain attack damage modifiers almost as high as Evelyn. This gives her two very capable wheelchair compositions for attack and rupture.  |

### SubDPS Units

Units with `pseudoRole: "subdps"` need a main DPS teammate (any DPS without subdps tag). SubDPS units receive 50% tier multiplier but still benefit from offensive buffs and stun infrastructure. They do NOT receive implicit ultimates scaling (ultimates are a limited resource reserved for the primary DPS), but DO receive quick-assists baseline. (These are engine scoring mechanics that will be explained later.)

Example subdps units: Burnice (fire anomaly), Grace (electric anomaly), Vivian (ether anomaly), Orphie (fire attack, also pseudosupport), Cissia (electric attack).

### Support Classification

Conceptually, many support agents are effectively designed to be either specialists or generalists, and their mechanics reflect this. Sometimes, their specialist domain is not broadly applicable and so they can be excellent in some cases and near-useless in others.

| Type | Units | Notes |
|----|----|----|
| **Specialists** | Lucia (rupture), Yuzuha (anomaly), Pan Yinhu (rupture) | Are typically found in best available teams for their archetype |
| **Conditional** | Zhao (YSG), Nicole (defense shred, avoid rupture), Sunna (AoD/YSG, veils), Rina (electric PEN) | Strong in niche, weak/useless elsewhere |
| **Universal** | Astra (ATK+CD, chains), Caesar (ATK, shields, pseudo-stun), Lucy (ATK, fire) | Work with almost any team, although not necessarily as the optimal support unit |

## Boss Reference

### Notable Bosses

| Boss | Weak | Resist | Shill | Anti | Assists | Key Mechanics |
|----|----|----|----|----|----|----|
| **Dead End Butcher** (Notorious) | ice, ether | — | anomaly | — | 0 | Weak to disorders. Debuffs daze accumulation (`debuffs.daze:2`), penalizing attack/rupture teams; mitigated by high-daze stunners. Anomaly teams unaffected. |
| **Discordant Solo** | ether, wind | ice, fire | anomaly | rupture | 2 | Favors Aria, Sunna, Nangong. Weak to ether veils. Sunna's ether veil stacking creates unique multiplicative debuffs — this boss was designed to require Sunna. One of only two bosses with dual resistance. |
| **Sacrifice Bringer** | ice | physical | anomaly | — | 0 | Favors Miyabi and Promeia. Vulnerable to Freeze status; Miyabi/Promeia trivializes this fight. |
| **Sanguine Sweeper** | electric, ether | fire | anomaly | rupture | 2 | Weak to stun. Benefits heavily from stunners on anomaly teams. |
| **Primordial Nightmare** | physical | ice, ether | attack | rupture, anomaly | 0 | Heavily shills YSG: Anti-rupture AND anti-anomaly — only attack teams viable. Dual resistance against ice and ether was designed to lock out brute force attempts from Miyabi and Yixuan. |
| **Wandering Hunter** | fire, ice | physical | rupture | anomaly, attack | 2 | Anti-anomaly AND anti-attack — only rupture teams viable. Physical resistance hurts YSG from trying to brute force it. |
| **The Defiler** | electric, physical | ice | attack | anomaly | 2 | Attack-shill. Anti-anomaly. Ice resistance hurts Miyabi. |
| **Thrall & Sobek** | ice, physical, wind | electric | stun | anomaly | 2 | Stun shill is a **hard requirement** — teams without a stunner are disqualified. |
| **Typhon Slugger** | electric, wind | fire | — | — | 3 | All three units must have `assist:defensive`. Fire resistance. No shill. |
| **Miasma Priest** | ether | ice | rupture | — | 2 | Ice resistance hurts Miyabi. Rupture shill means rupture teams get bonus. |
| **Scorched Horizon** | wind, ice | electric | anomaly | — | 2 | `mechanics["anomaly:state"]: "wind"`. Permanent self-applied wind anomaly. All team anomalies react with the boss (vortex for non-wind, nothing for same-element). Disorders replaced by vortex; polarity disorder damage severely reduced. Also debuffs CD (`debuffs.cd:2`). Designed to favor Promeia over Miyabi. |

### Shill Behavior

* **DPS shills** (attack, anomaly, rupture): Matching the shill gives a flat bonus. Not matching gives no bonus — but no penalty either. Teams compete on their own merits.
* **Non-DPS shills** (stun): Hard requirement. No stunner = disqualified. These bosses have mechanics that make the shilled role essential.

### Shill Intensity

Bosses with `shillIntensity > 1` have fight mechanics that make their favored units disproportionately valuable. The first favored unit gets the full amplified bonus; additional favored units receive diminishing returns. At the moment, this is no longer in use as it has been replaced by mechanics-driven scoring instead.

## Data Model

### Unit Data Object

```json
{
  "id": "aria",
  "name": "Aria",
  "aliases": ["..."],
  "image": "./assets/characters/aria.webp",
  "rank": "S",
  "limited": true,
  "tier": 1.0,
  "tags": ["anomaly", "ether", "aod", "assist:defensive"],
  "join": ["stun", "support"],
  "available": false,
  "synergy": { "units": ["Sunna", "Nangong"], "tags": [], "avoid": [] },
  "mechanics": {
    "damage": { "enhanced": 2, "abloom": 2 },
    "scaling": { "veils": 2 }
  },
  "faction": "Angels of Delusion",
  "displayText" : "Free character text"
}
```

* `id` — Unique identifier
* `name` — Display name
* `aliases` — Common abbreviations (e.g., "S11" for Soldier 11, "YSG" for Ye Shunguong). Used by CLI tools for fuzzy name matching.
* `image` — Path to portrait image (used directly by UI)
* `rank` — `"S"` or `"A"`
* `limited` — Whether the unit is gacha-limited
* `tier` — Numeric tier (T0 = best, T4 = worst)
* `tags` — Role, element, faction, and assist type tags
* `join` — Tags at least one teammate must have for Additional Ability activation; also a hard prerequisite for team formation
* `available` — (optional, default `true`) When `false`, unit is unreleased. Added to JSON with preliminary data for pre-release testing.
* `synergy` — Synergy configuration (see below)
* `mechanics` — Mechanics object (see below)
* `faction` — Faction name (used as part of team construction with the `faction` keyword in the join array.
* `displayText` — Free text that is displayed on the character summary

### Synergy Object

```json
{
  "units": ["Specific unit names"],
  "tags": ["DPS roles or special tags"],
  "avoid": ["DPS roles to avoid"]
}
```

* `synergy.units` — Named partnerships scored in Layer 5. Currently only used for **Angels of Delusion** (Aria/Nangong/Sunna) whose faction cohesion is deliberately strong. All other unit synergies are expressed through mechanics.
* `synergy.tags` — Largely retired. Only Ju Fufu retains `["rupture"]` as a stopgap for rupture-team optimization that is not easily modeled in mechanics.
* `synergy.avoid` — Largely retired. Used to express conflicts that cannot easily be modeled.

### Unit Mechanics Object

The `mechanics` object describes what is **distinctive** about a unit beyond its role baseline. Units with no distinctive mechanics have `mechanics: {}`.

```json
{
  "mechanics": {
    "pseudoRole": "anomaly",
    "elementalVariant": "variant-type",
    "onfield": false,
    "damage": { "polarity": true, "abloom": true },
    "buffs": { "anomaly": 3 },
    "debuffs": { "recovery": 3 },
    "utility": { "disorders": 2, "daze": true },
    "scaling": { "am": 3 }
  }
}
```

All fields are optional. Values are weighted: `true` (or 1) = minor, `2` = strong, `3` = defining.

**Fields:**

* `pseudoRole` — Secondary roles, comma-separated: `"subdps"`, `"anomaly"`, `"stun"`, `"support"`, `"attack"`, `"defense"`. DPS pseudo-roles require team context to activate (see Role Activation). Non-DPS pseudo-roles always activate.
* `elementalVariant` — Marks units with alternate element tracking.
* `onfield` — Explicit on-field demand override. Defaults: attack/anomaly/rupture/stun = `true`; support/defense = `false`. When a unit's pseudoRole activates as a different role, on-field status is derived from the activated role unless explicitly overridden.
* `damage` — Distinctive damage types. Keys: `enhanced`, `ultimate:strong`, `ultimate:double`, `chain`, `aftershock`, `abloom`, `polarity`, `totalize`, etc.
* `buffs` — What the unit buffs for teammates. Keys: `atk`, `anomaly`, `aftershock`, `abloom`, `chain`, `sheer`, `pen`, `stun-multiplier`, `cr`, `cd`, `disorders`, element names, and `vortex`. The `vortex` key is a **contextual bonus** — it is excluded from DPS cohesion evaluation (added to `GENERIC_DPS_BUFFS`) and scores in L4 baseline affinity only when consumers actually generate vortex reactions this fight, tier-scaled so high-tier vortex generators (ice) receive proportionally more benefit.
* `debuffs` — What the unit debuffs on enemies. Keys: `defense`, `recovery`, and element names.
* `utility` — Non-stat team contributions. Keys: `disorders`, `quick-assists`, `chains`, `ultimates`, `heal:team`, `heal:self`, `shields`, `interrupt-resistance`, `kaleidoscope`, `veils`, `daze`, `stunless`.
* `scaling` — What the unit benefits from. Overrides role baseline when present. Non-stat keys go through Need Fulfillment; stat keys enhance Baseline Affinity.
  * `scaling.codependent` (boolean) — When `true`, the **pull recommendation engine** (not the team scorer) runs team dependency checks before finalizing the unit's recommendation. The checks verify: (1) specialist scaling providers exist in the player's roster (excluding naturally-available keys like `chains`/`ultimates` and foundational stats like `cr`/`cd`/`atk`/`pen`/`hp`/`def`/`ap`/`am`), (2) disorder feasibility if `scaling.disorders` is present (a different-base-element, non-wind anomaly/pseudo-anomaly partner must exist), and (3) at least one valid 3-person team can be formed via `getTeams()`. If any dependency is unmet, the unit's pull recommendation priority drops one rank (High→Medium, Medium→Low, Low→removed) and a note is attached naming the missing providers. This flag is opt-in per unit; currently only YSG has it set.

**Override rule:** When `scaling` is present, it replaces the role-baseline scaling for Need Fulfillment. An attacker with no `scaling` gets baseline (cr:2, cd:2). An attacker with `scaling: { "ultimates": 3 }` scales ONLY with ultimates through Need Fulfillment. ***{TODO: This is almost certainly incorrect!!! But it hasn’t been changed because scoring currently works as-is; but it may need to change in the future!}*** Baseline Affinity rules (ATK, defense shred, element matching, stun infrastructure) still apply regardless.

**Role baselines (implicit when no explicit scaling):**

* Attacker: cr:2, cd:2
* Anomaly: am:2, ap:1, anomaly:2
* Rupture: sheer:3, hp:2, cr:2, cd:2
* Stunner: daze:1

### Boss Data Object

```json
{
  "id": "vesper",
  "name": "Discordant Solo",
  "shortName": "Discordant Solo",
  "image": "./assets/bosses/solo.webp",
  "favored": ["Aria", "Sunna", "Nangong"],
  "available": true,
  "mechanics": {
    "weaknesses": ["ether", "wind"],
    "resistances": ["ice", "fire"],
    "shill": "anomaly",
    "anti": ["rupture"],
    "assists": 2,
    "shillIntensity": 2,
    "anomaly:state": "wind",
    "weak": ["veils"],
    "debuffs": { "cd": 2 }
  },
  "variations": {
    "example": {
      "enabled": false,
      "mechanics": {
        "anti": null
      }
    }
  }
}
```

* `favored` — Named units with enhanced bonuses on this boss (top-level; not overridden by mechanics)
* `available` — (optional, default `true`) When `false`, boss is unreleased
* `mechanics` — Boss mechanics block. All gameplay properties live here:
  * `weaknesses` / `resistances` — Element arrays
  * `shill` — DPS archetype or non-DPS role the boss prefers
  * `anti` — DPS archetypes disqualified against this boss
  * `assists` — Required number of defensive assist units
  * `shillIntensity` — (optional, default 1) Amplifies favored unit bonuses
  * `"anomaly:state": "<element>"` — Boss permanently has the specified element's anomaly applied. Changes how anomaly reactions work against this boss (see Anomaly Reactions section).
  * `freezable` — Boss is particularly vulnerable to ice anomalies; ice anomaly units receive a very significant bonus. Pseudo-anomaly agents get half the bonus.
  * `weak` — Array of mechanic weaknesses. Each entry gives teams that leverage that mechanic a bonus. Supported values: `"disorders"`, `"veils"`, `"stun"`, `"abloom"`. (Array format allows a boss to be weak to multiple mechanics simultaneously.)
  * `debuffs` — Boss inflicts debuffs on the player team. Supported keys:
    * `"cd"` — Critical Damage debuff. Penalizes DPS agents that scale with CD when the boss's CD debuff exceeds the team's total CD buff supply.
    * `"daze"` — Daze debuff. Slows daze accumulation, making stun windows harder to trigger. Penalizes attack and rupture DPS proportionally to the shortfall between the debuff level and team daze supply. High-daze stunners mitigate the effect. Anomaly DPS are not penalized since their damage is less stun-window-dependent. Unlike anti-shill, this penalty can be fully eliminated by bringing a sufficiently high-daze stunner.
* `variations` — (optional) Named alternate configurations for the boss. Each key is a variation ID (e.g. `"raging"`). Variation objects are merged onto the base boss using shallow merge semantics: omitted keys inherit from the base; an explicit `null` value erases the corresponding base property. The `mechanics` sub-object is merged key-by-key with the same semantics.
  * `enabled` — (optional, default `true`) When `false`, the variation is **UI-only hidden**: it will not appear in the boss selection UI, the orange dot indicator, or the cycling affordance. **CLI tools ignore this flag entirely** and will always resolve a variation when explicitly requested (e.g. `--bosses "butcher:raging"`). Set to `false` for variations that are defined but not yet active in the current game rotation.

**Boss property accessors:** All boss gameplay properties are accessed via exported helper functions (`getBossWeaknesses`, `getBossResistances`, `getBossShill`, `getBossAnti`, `getBossAssists`, `getBossShillIntensity`) from `team-scorer.js`. These centralize access and support boss variation resolution transparently via `resolveBossVariation(boss, variationId)`.

## Engine Architecture: Five-Layer Scoring

### Design Evolution

The original scoring engine relied on hardcoded composition rules, synergy tags, and named unit synergies. The release of Nangong Yu exposed a fundamental limitation: archetype-level rules couldn't handle units with cross-archetype mechanical synergies. The engine was rebuilt around a mechanics-driven architecture where scoring emerges from pairwise mechanical interactions rather than template matching.

### Layer Overview

The scoring engine evaluates a team of 3 units against a boss through five sequential layers, producing a raw score that is then adjusted by a teamwork multiplier:


1. **Layer 1: Disqualifications** — Hard failures that return score -1: boss `anti` matching team's DPS archetype, resisted DPS element, insufficient defensive assists, no DPS, non-DPS shill role missing. Minimal and deliberately narrow.
2. **Layer 1.5: Team Structure** — Classifies the team composition (anomaly hypercarry, double anomaly, rupture + stunner + support, etc.) and determines the structural factor for the teamwork multiplier. Also scores field-time economy based on how many agents demand on-field time.
3. **Layer 2: Inherent Quality** — Individual unit power independent of team context. DPS tier/rank scored at full weight; support/defense/stun tier/rank scored at reduced weight gated by buff utilization. Titled units receive a bonus. SubDPS units receive 50% tier multiplier.
4. **Layer 3: Boss Matchup** — Element weakness/resistance scoring, shill preference bonuses, favored unit bonuses (amplified by `shillIntensity`), defensive assist bonus.
5. **Layer 4: Mechanical Synergy** — The core of the engine. Pairwise directional evaluation of all teammate pairs using the `mechanics` object. Components:
   * **Baseline Affinity**: Broad stat interactions (e.g. ATK/CR/CD help attackers; anomaly buffs help anomaly agents; defense/element debuffs help damage contributors; stun infrastructure helps attackers/rupture, etc.)
   * **Damage Amplification**: Supplier buffs a damage type the consumer deals
   * **Need Fulfillment**: Supplier provides something the consumer explicitly scales with (highest-value matches)
   * **Stun Emergence**: Consumer has burst damage that benefits from stun infrastructure
   * **Diametric Synergy**: Multiplicative buff/debuff interaction bonus (see below)
   * **L4 Element Modifier**: On-element pairs get amplified L4 scores; off-element get reduced
   * **Anomaly Reaction Scoring**: Per-agent vortex/disorder bonuses computed via `computeAnomalyReactions()` based on team composition and boss anomaly state
6. **Layer 5: Additional Synergies** — Hand-curated `synergy.units` bonuses and `synergy.tags` bonuses for edge cases that mechanics alone can't fully capture. Lower-weighted than in the old algorithm.

**Final score:** `raw_score × teamwork_multiplier`

### Teamwork Multiplier

The teamwork multiplier combines two factors:

* **Structure factor**: Based on team composition classification from L1.5. Conventional compositions (standard archetypes) get 1.0; unconventional compositions get reduced multipliers.
* **Cohesion factor**: How well the team's buff providers serve the team. Computed from buff utilization across all providers as a geometric mean. Low cohesion (mismatched buffs) crushes the score multiplicatively.

The multiplier is `structureFactor × cohesion²` (cohesion is squared for stronger gating).

### Diametric Synergy

When a team has suppliers contributing through complementary dimensions — specifically, generic damage amplification (ATK and/or crit damage buffs) combined with generic defense debuffs, or same-element buff + same-element debuff — the combined effect is multiplicative in-game.

The engine recognizes **diametric pairs**:

* ATK/CD buff (from supplier A) + defense debuff (from supplier B)
* Same-element buff + same-element debuff (e.g., Lycaon's `debuffs.ice` + Soukaku's `buffs.ice`)

The strength of the diametric pair determines a **cohesion floor**: the team's cohesion cannot drop below this floor regardless of other factors. Scaling:

* 3 & 3 (e.g., Astra ATK/CD:3 + Nicole defense:3): floor = 1.0
* 2 & 3 or 3 & 2: floor = 0.9
* 2 & 2: floor = 0.8
* Below 2 & 2: no guaranteed floor

**Anti-rupture suppression:** Diametric synergy from defense debuffs is suppressed on anti-rupture bosses (Nightmare, Solo, Sweeper), because the defense debuff cannot be fully utilized.

### Role Activation

At the start of scoring, each unit's activated roles are computed and cached as `_activatedRoles`. All role-checking functions (`isDPS`, `isAttacker`, `isAnomaly`, `isRupture`, `isSupport`, `isDefense`, `isStun`) check `_activatedRoles` first, falling back to tags when activated roles haven't been computed (e.g., during team formation).

**DPS pseudo-roles** (attack, anomaly, rupture) only activate when a teammate's primary tags include that same DPS type. This prevents units from "casting themselves" into roles the team doesn't support.

**Non-DPS pseudo-roles** (stun, support, defense, subdps) always activate unconditionally.

Examples:

* Soukaku (`pseudoRole: "anomaly"`, tags: support) on a Miyabi team: Miyabi has `anomaly` tag → Soukaku's anomaly activates → she participates in disorder generation
* Soukaku on a Lycaon/Yixuan team: no `anomaly` tag → anomaly does NOT activate → she's a pure support
* Nangong (`pseudoRole: "anomaly"`, tags: stun) on Nangong/YSG/Sunna: no `anomaly` tag → Nangong is just a stunner
* Caesar (`pseudoRole: "stun"`, tags: defense): pseudo-stun always activates unconditionally

**On-field derivation:** When a unit's pseudoRole activates as a different role, on-field status is derived from the activated role's default unless the unit has an explicit `mechanics.onfield` override. For example, Soukaku has no explicit `onfield` flag — when her anomaly pseudoRole activates, she's on-field (anomaly default); when it doesn't, she's off-field (support default).

### Scoring Ripple Effects of Role Activation

* **L1 Disqualifications**: Only "pure DPS" units (those without concurrent support, defense, or stun roles) count toward triple-DPS disqualification.
* **L1.5 Structure**: Stun units are excluded from attacker/anomaly/rupture DPS category counts to prevent double-classification. Nangong is counted as a stunner, not a second anomaly.
* **L2 Tier/Rank**: Units are scored in their primary role category. Attackers, anomaly units, and rupture unit lists for forced-secondary-DPS detection exclude stun/support/defense units. A unit scored in the DPS loop is excluded from the non-DPS loop.
* **L3 Boss Matchup**: Pseudosupports cannot satisfy DPS archetype shills. Element resistance disqualification skips support/defense units (they are penalized, not disqualified).

### Off-Field / On-Field Scoring

The engine scores field-time economy based on how many agents demand on-field time:

* **1 on-field (solo carry):** Bonus — efficient field economy
* **2 on-field (standard):** No modifier
* **3 on-field (crowded):** Penalty — field-time competition
* **0 on-field:** Penalty — no primary damage dealer

Units with explicit `onfield: false`: Ju Fufu, Trigger, Pulchra (off-field stunners via aftershocks); Burnice, Grace, Vivian (off-field anomaly subdps); Orphie (off-field pseudosupport).

### Lenient Mode

The engine supports a "lenient" mode for players with limited rosters. In strict mode (default), hard violations (resisted DPS, etc.) result in disqualification. In lenient mode, these become steep score reductions instead, keeping teams in the ranking so players can see their relative quality.

Within the five-layer architecture, lenient mode affects:

* L1: Most disqualifications become large penalties instead of hard returns of -1
* L2: Tier penalties for low-tier units are reduced
* L5: `synergy.avoid` pairs apply large penalties instead of disqualification

## Scoring Engine Design Principles

These principles govern how the mechanics-driven engine evaluates teams. They are grouped thematically for reference.

### Buff and Damage Mechanics

**Mechanics Only Score When Consumed (P1):** A mechanic's existence has no inherent value. Points are only awarded when consumed by another unit's scaling or need. Exception: foundational mechanics (ATK, CR, CD) have automatic value through baseline affinity because every DPS intrinsically benefits from them, gated by role.

**Damage Buffs on Non-DPS Are Negligible (P2):** Offensive buffs landing on pure support/defense units are strategically irrelevant. The engine does not count element buffs as "relevant" for non-damage-contributor units. This extends to buff utilization — a support's matching element does not inflate a supplier's utilization score.

**Damage Contribution Determines Buff Relevance (P26):** Units divide into damage contributors (any unit with a DPS or stun role) and non-damage contributors (pure support/defense). SubDPS units are always damage contributors even with a support pseudoRole. Only pure non-DPS units get zeroed out for offensive buff relevance.

**Wasting Buffs = Wasting DPS Potential (P3):** When a DPS provides buffs (SAnby's aftershock buff, Cissia's electric debuff), teammates must consume them. Unused buffs indicate the DPS was fielded in the wrong team, and the engine applies a cohesion penalty proportional to the unused buff weight.

**CR/CD Role Asymmetry (P9):** CR/CD are critical for attackers and rupture. For anomaly agents, damage comes primarily from ATK/AP/disorders/vortex, not crits — CR/CD return only 0.3 weight. Exception: Miyabi has effectively 100% crit rate and explicit `scaling: { cr: 3, cd: 3 }`, making CR/CD fully valuable for her.

**Stun Multiplier Is a Real Buff (P12):** The `stun-multiplier` buff (Dialyn, Sunna, Lycaon, etc) increases damage during stun windows. It benefits all DPS units, not just specific archetypes. Scored in baseline affinity.

### Need Fulfillment and Scaling

**Scarcity Determines Value (P4):** Foundational stats (ATK, CR, CD) are common and replaceable through equipment — scored at lower multipliers. Specialist mechanics (veils, chains, aftershock, abloom) are rare and irreplaceable — scored at higher multipliers. This structural premium means a unit providing a rare mechanic matching a consumer's scaling always outscores one providing a common stat buff, all else equal.

**Need Fulfillment Supply/Scaling Gating (P5):** Supplier must provide sufficient supply to satisfy the consumer's scaling need. Fulfillment score is multiplied by `min(1, supply / scaling)`. Sunna (veils:3) gets full credit for YSG (veils:2); Lucia (veils:1) gets only 50%.

**Buff Utilization Gates Support Quality (P6):** A support's tier/rank only matters to the extent their buffs are utilized. Utilization is the weighted proportion of buffs/debuffs that fire for at least one consumer, with squared gating. A support with 30% utilization sees quality crushed to 9%.

**Scaling Types (P10):** Three flavors:

* *Direct* (scaling matches damage type): Evelyn's `scaling.chains:3` + `damage.chain:3`. This indicates that because the unit deals high damage of that type, feeding that type just leverages an existing high-multiplier damage output. Unit does X, so giving it more X than normal is a direct benefit.
* *Transformative* (scaling feeds enhanced attack frequency): Miyabi's `scaling.disorders:3` + `damage.enhanced:3`. Disorders are converted into enhanced attack resources. Missing this is very impactful — the unit will function at a significant gap from their potential damage ceiling.
* *Constant* (steady stat amplification): Alice/Vivian's `scaling.am` converts AM into AP passively. This means that bonuses to AM benefit both AM and AP for these units, not just AM.  So for these units, buffs to AM are twice as valuable as other common buffs.

**Ultimates Are a Primary DPS Resource (P28):** Free ultimates (Dialyn, Ju Fufu, etc) are limited — only one unit gets them per stun window. SubDPS units receive implicit ultimates scaling, but additional ultimates scaling above the implicit scaling only goes to the primary DPS. For example - anything that boosts ultimate damage will benefit a subDPS, because they implicitly improve when ultimates occur. But Dialyn’s free ultimates are only going to the primary DPS, because it is a highly limited resource and you want to allocate it to the optimal damage dealer. By comparison, quick assists are NOT limited and benefit all DPS including subdps.

**Ultimates Provision Scales with Burst Potential (P13):** Free ultimates are worth more for high-burst DPS (Evelyn 4000% multiplier ultimate vs. a basic 1000% ultimate). Scaled by consumer's `getMaxBurstWeight`.

**Naturally Available Needs (P19):** Ultimates and chains are always available via normal gameplay. Having a dedicated provider (Ju Fufu's `utility.ultimates`) makes them available faster, which is correctly rewarded in L4. But the DPS reception cohesion check skips these keys — not having a provider is not a cohesion failure.

**Self-Provision Excludes Needs from Cohesion (P22):** When a DPS scales with a non-damage mechanic it also provides to itself (Banyue has both `scaling.interrupt-resistance:2` and `utility.interrupt-resistance:2`), the cohesion check doesn't count it as unmet. This is different than damage mechanics like aftershock or abloom, where a significant part of the damage ceiling for that DPS is the damage dealt by buffed teammates.

### Role and Structure Rules

**A Pseudorole IS a Role (P25):** Activated pseudoroles become the unit's identity for scoring. All role functions check `_activatedRoles` first. See Role Activation section for full implications across L1–L3.

**Pseudo-DPS Role Activation Requires Team Context (P23):** DPS pseudo-roles (attack, anomaly, rupture) only activate when a teammate has that DPS type in primary tags. Non-DPS pseudo-roles (stun, support, defense, subdps) always activate.

**Tier Degradation Rates Differ by Role (P8):** DPS tier quality matters enormously (T2 DPS = significant compromise). Stunner tier matters less (stun is stun). Support/defense tier matters least (buffs are buffs). Penalty curves are steeper for DPS.

**DPS Reception and Team Completeness (P14):** DPS units without buff contributions are checked for what fraction of their scaling needs are met by the team. A "duo + deadweight" team gets penalized for the third member riding free.

**Stunner Value Discount on Stunless Teams (P16):** When all DPS are stunless (YSG), stunner tier/rank bonuses are multiplied by 0.4. Their L4 contributions (stun-multiplier, ultimates) still score normally.

**synergy.avoid as Near-Disqualification (P17):** Explicit `avoid` annotations represent game-mechanically-rooted anti-synergy that is hard (or excessively complicated) to model via mechanics. Normal mode: disqualification. Lenient mode: massive penalty.

### Anomaly-Specific Rules

**Anomaly Reactions Are Boss-Context-Dependent (P15):** When two anomaly-typed units of different elements are on the same team, both receive a reaction bonus. Against normal bosses, team-side pairs react independently: wind+non-wind = vortex; non-wind+non-wind = disorder. Against anomaly-state bosses, the boss intercepts all applied anomalies — each agent reacts with the boss (one reaction per agent), and team-side reactions are suppressed. Units with explicit `scaling.disorders` (Miyabi) are excluded from the implicit bonus to prevent double-counting with need fulfillment.

**Vortex Rewards Element-Specific Tiers (P29):** Vortex bonuses are tiered by element: ice highest, fire medium, physical/ether/electric low, elemental variants with custom rates. This creates meaningful differentiation between ice anomaly agents (Promeia, Soukaku) and frost-variant agents (Miyabi) against wind-anomaly-state bosses, because frost has a miniscule vortex damage multiplier while ice has one of the highest.

**Boss Anomaly State Suppresses Team-Side Reactions (P30):** A boss with permanent self-applied anomaly intercepts and consumes every team-applied anomaly. This suppresses all team-side disorder/vortex generation between agents. Each agent reacts directly with the boss's anomaly only.

**Polarity Disorders Survive Anomaly State (P31):** Polarity disorders are forced occurrences that bypass anomaly state suppression. They still feed `scaling.disorders` at full weight (feeding Miyabi's transformative scaling). However, their `damage.polarity` contribution is reduced to \~25% on vortex bosses, reflecting heavily nerfed polarity damage.

**Polarity Is a Subclass of Disorder (P32):** `buffs.disorders` supplies both `damage.polarity` (via the damage-type fallback in need fulfillment) and the disorder-buff baseline affinity path. Any unit buffing disorders (e.g., Yuzuha) inherently buffs polarity damage.

**Dual-Anomaly Teams Are Inherently Cohesive (P24):** Primary anomaly DPS + off-field anomaly subdps of different element = inherently cohesive. No cohesion penalty for the subdps "not providing buffs."

**Totalize and Stun Dependency (P11):** Totalize units convert stun time into damage. They want double-stun teams. For agents heavily dependent on totalize (e.g. Hugo), the engine applies non-linear penalties when stun infrastructure is below 2.0 credits (proper stunner = 1.0, pseudo-stunner = 0.9, high-daze support = 0.4). For agents who deal some totalize damage but it is not an essential part of their damage output (e.g. Pyrois), then this penalty is waived.

### Structural Principles

**Faction Synergies Require Explicit Modeling (P7):** Some synergies are faction-based and don't emerge purely from mechanics (e.g., the full AoD trio). These could be expressed through `synergy.units` if they don’t naturally emerge from the mechanics alone.

**Quick-Assists Baseline Value (P18):** Quick-assists are useful but not transformative. Implicit scaling baseline is 0.25 — modest need fulfillment credit. Units with explicit `scaling['quick-assists']` override this.

**Support Element Irrelevance (P20):** Pure support and defense units provide value through buffs and utility, not damage. Element resistance penalties are removed for support and defense units. For defense agents, a small on-element bonus is retained (unlike support agents, defense agents can deal small quantities of material damage). Despite the name, defense units’ value typically does not come from defensive strategies as the game does not really reward defensive approaches and instead heavily rewards aggressive offense. So even though some units are ‘defense’ units, their primary purpose is an alternate form of support agent that is typically capable of slightly higher damage output; albeit a negligible difference for modeling purposes. For example, T4 fire defense unit Ben converts his defense stat into a critical damage multiplier, and players who actually run Ben typically build him as a DPS rather than a support.

**Element Resistance and SubDPS/PseudoSupport Handling (P21):** Standard subdps units are disqualified when resisted, like any DPS. Only pseudosupports bypass disqualification (they still contribute as supports when their damage element is resisted), but receive a damage-proportional penalty.

**Shill Is a Bonus, Not a Penalty (P27):** DPS shill matching gives a flat bonus. No penalty for mismatching. Non-DPS shills (stun) remain hard requirements.

## Wheelchair Compositions

Powerful support/utility pairings that uplift almost any compatible DPS:

* **Astra + Nicole** — Universal attack/anomaly wheelchair, although better for attack. ATK buff + defense shred = massive damage differential. Not for rupture (defense shred useless).
* **Nangong + Sunna** — Attack/anomaly wheelchair, although better for Aria specifically than others. Anomaly procs + stun buffs amd benefits + ATK buff + stun multiplier. Not for rupture.
* **Nangong + Yuzuha** — Anomaly-specific wheelchair. Stun buffs and benefits + ATK buff + anomaly buffs + kaleidoscope element flex to help disorder generation. Replaced Vivian's slot in the top anomaly template.
* **Vivian + Yuzuha** — Anomaly-specific wheelchair (for non-ether anomaly agents). ATK buff + anomaly buffs + lots of disorder generation.
* **Dialyn + Lucia** — Definitive rupture wheelchair. Free ultimates + stun + rupture specialist support. Best-in-slot for all rupture agents.  (The upcoming stunner Norma may also form a wheelchair with Lucia.)
* Upcoming: Norma/Astra | Norma/Lucia - Stun+Support that self-reinforces with Norma acting as a secondary DPS for attack and rupture teams due to Norma’s interactions with quick assists and sheer buffs. 

These emerge naturally from the mechanics engine — their high scores are evidence of well-modeled mechanics.

## Scoring Results Scale

Rough boundaries for team quality:

* 500+ — Exceptional matchup, essentially best possible team of choice
* **400+** — Great matchup, near-optimal/optimal
* **300–399** — Ideal; solid team for this boss and can achieve full clear with minimal skill required
* **230–299** — Playable; can achieve full clears with sufficient skill
* **145–229** — Suboptimal; full clears may be difficult even with great skill
* **Below 145** — Nigh unplayable for endgame content

These boundaries are approximate and shift as the scoring algorithms are tuned.

## DPS Bucketing and Diversity Selection

(This section describes `app/public/lib/common/dps-buckets.js`, which consumes team scores as inputs — not the scoring engine itself.)

When optimizing 3 teams for Deadly Assault's 3 bosses, raw top scores tend to be near-identical — the same DPS with minor support variations. Showing five "options" that differ only by swapping one support is not useful.

Results are grouped by which type of DPS is assigned to each boss (considering role, element, and power tier). The algorithm selects one representative from each distinct DPS assignment pattern, preferring the highest-scoring realization. The webapp provides a toggle between this diversity-aware view (default) and the raw score-sorted view.

## Diagnostic Tooling

### Debugging Workflow

When investigating a scoring issue, the typical workflow may include any of the following diagnostic tool commands:


1. **Reproduce the issue** — Use `node matchups` with explicit teams to see the scores:

   ```
   node matchups -t "Nangong/Aria/Sunna,Aria/Burnice/Sunna" -b Priest
   ```
2. **Examine the scoring breakdown** — Add `--debug` (or `-d`) to see the full layer-by-layer scoring:

   ```
   node matchups -t "Nangong/Aria/Sunna,Aria/Burnice/Sunna" -b Priest --debug
   ```

   This shows L1.5 structure classification, L2 tier/rank scoring per unit, L3 element/shill/favored bonuses, L4 pairwise mechanical synergy with individual pair scores, L5 synergy bonuses, and the final teamwork multiplier breakdown.
3. **Compare across bosses** — Use comma-separated boss names:

   ```
   node matchups -t "Dialyn/Evelyn/Astra,Lighter/Evelyn/Astra" -b "Neutral,Pompey,Corruption"
   ```
4. **Review full landscape for a unit** — Use `-i` (include) to see all teams containing a specific unit:

   ```
   node matchups -i Miyabi -b Butcher -10
   ```

   (Shows top 10 teams including Miyabi against Butcher)
5. **Generate per-agent matchup files** — Run `agent-matchups.mjs` to produce a `matchups/<unit-id>.txt` for every limited S-rank, showing their top teams against all bosses:

   ```
   node agent-matchups.mjs -7
   ```

   (Depth 7 per boss, writes to `matchups/` folder)
6. **Run the test suite** — Verify all assertions pass:

   ```
   node test-scoring.mjs
   ```

### CLI Reference (`matchups.js`)

| Flag | Short | Description |
|----|----|----|
| `--teams` | `-t` | Explicit teams: slash-separated units, comma-separated teams |
| `--bosses` | `-b` | Boss name filter (comma-separated, fuzzy-matched) |
| `--debug` | `-d` | Show full scoring breakdown per team |
| `--include` | `-i` | Teams must include at least one of these units (comma-separated) |
| `--depth` | `-N` | Number of results per boss (shorthand: `-10` for top 10) |
| `--only-mine` | `-m` | Use personal roster from `roster.json` |
| `--preview` | `-p` | Include unreleased/unavailable units |
| `--units` | `-u` | Comma-separated unit whitelist |
| `--exclude` | `-x` | Comma-separated units to exclude |
| `--score` | `-s` | Minimum raw team score filter |
| `--range` | `-r` | Inclusive raw score range (two integers) |
| `--flat` |    | Output teams in condensed format for use as `-t` value |
| `--query` | `-q` | Share URL query string for roster/bosses |

Unit additions/removals: `+Unit` adds a unit, `-Unit` removes one from the roster override.

### Test Suite (`test-scoring.mjs`)

The test suite contains assertion-based test cases that verify scoring behavior. Each test case:

* Constructs specific teams using `scoreForTeamString` (which parses slash/comma-separated unit names)
* Scores them against specific bosses using `scoreTeamForBoss`
* Asserts ordering relationships (team A > team B), score thresholds (score >= X), or count-based checks (at least N teams above threshold)

**Running:** `node test-scoring.mjs`

**Adding a test case:**


1. Add a new `run('TEST N: description', () => { ... })` block before the Summary section
2. Use `scoreForTeamString('Unit1/Unit2/Unit3,Unit4/Unit5/Unit6', allUnits)` to parse teams
3. Use `withBosses(bosses, 'BossName')` to filter bosses
4. Use `scoreMapForBoss(teams, boss)` for easy score lookups by team label
5. Use `assert(condition, failureMessage)` for assertions — failure messages should include actual scores for debugging

**Conventions:** Test numbers are sequential. Each test has a comment block explaining what it checks and why. When a test needs threshold adjustment (due to engine changes), update the threshold and note why.

### Generating a Full Scoring Report

For a comprehensive review of the engine's output:

```
node matchups -20 > deep-scoring.txt
node agent-matchups.mjs -7
```

The first command produces a top-20-per-boss report across all bosses. The second produces per-agent files in `matchups/`. Together, these provide a complete picture for manual review.

There is a `scoring-baseline.txt` file that can be compared to. It establishes the baseline list of matchups and scores so that there is what to compare to when making changes. The `scoring-diff.js` script can be used to compare two scores files and highlight what actually changed.

## Latest Mechanics

The game is currently in version 2.8. This is a summary of the key changes in recent updates to the scoring engine.

### Wind Element and Vortex (Implemented for 2.8)

The **Wind** element was added in version 2.8 alongside a full anomaly reaction system:

* `ELEMENTS` array now includes `'wind'`
* `VORTEX_TIERS` maps element → vortex damage tier (ice: 3, fire: 2, etc.)
* `VORTEX_DEFAULT_TIER` (0.08) covers any untagged element (for code safety only)
* `VORTEX_BASE` (16) × tier = per-agent vortex bonus in L4
* `POLARITY_VORTEX_DISCOUNT` (0.25) reduces polarity damage on anomaly-state bosses
* `computeAnomalyReactions(team, boss)` resolves per-agent reactions (vortex, disorder, or none) from team composition + boss anomaly state
* Boss `mechanics["anomaly:state"]` drives the anomaly-state system; currently only Scorched Horizon uses it
* Vortex is also a need-fulfillment key in `NEED_FULFILLMENT_KEYS`

**Future wind agents** (e.g., Velina, confirmed wind anomaly agent for 3.0) will trigger vortex against normal bosses when paired with non-wind anomaly teammates, using the same `computeAnomalyReactions` system.

These upcoming units are already modeled in `units.json` as preview units (`available=false`):

### Promeia (2.8 first banner)

Ice anomaly DPS (just released). Key mechanics:

* Abloom buffer — `buffs.abloom: 3`, directly empowers teammates with abloom damage (Burnice, Vivian, Grace)
* Abloom self-buff — `damage.abloom: 3`, benefits from her own abloom buffs
* Stun-synergy anomaly — benefits from stun windows (like Aria), emergent from mechanics due to having an enhanced attack
* Positioned as a direct alternative to Miyabi against Scorched Horizon: pure ice anomaly (strong vortex tier of 3) vs. frost variant (weak vortex tier of 0.001)

### Starlight Billy (2.8 second banner)

Conventional physical rupture agent; only real feature is that he has relatively strong chain attacks. Expected to be strong against Fiend, Thrall, and Defiler. Best-in-slot teammates: Dialyn + Lucia (like every rupture agent), with Ju Fufu and Pan as alternatives. Should slot cleanly into existing rupture scoring without engine changes.  Norma, an upcoming stun agent that can uniquely benefit from sheer damage buffs, will likely pair well with him as an alternative to the current suite of rupture stunners.