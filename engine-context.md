# Team Scoring Engine Context

This document provides domain knowledge for the ZZZ team scoring engine (`app/public/lib/common/team-scorer.js`). It is the primary reference for understanding the game mechanics, data model, engine architecture, and diagnostic tooling needed to implement new features or fix scoring issues.

**Source of truth for tier rankings:** `app/public/data/units.json`
**Source of truth for boss data:** `app/public/data/bosses.json`
**Source of truth for scoring logic:** `app/public/lib/common/team-scorer.js`

This document captures gameplay mechanics and design decisions. Specific scoring numbers mentioned are illustrative only and may differ from the current implementation — always consult the code for exact values.


---

## Game Fundamentals

### Elements

The game has five standard elements: **Fire**, **Ice**, **Electric**, **Ether**, and **Physical**. A sixth element, **Wind**, is arriving in version 2.8 (see Upcoming Features section).

Each element has standard interactions with boss weaknesses and resistances. A DPS unit whose element matches a boss weakness receives a bonus; a DPS unit whose element is resisted by a boss is disqualified (with limited exceptions for pseudosupports).

### Element Variants

Some exceptionally powerful characters - “titled” units Miyabi, Yixuan, and YSG - have unique element variants that behave like their base element for weakness/resistance purposes but track anomaly buildup separately:

| Unit | Base Element | Variant | Disorder Interaction |
|----|----|----|----|
| Miyabi | Ice | Frost | Frost + Ice = disorder (e.g., Miyabi + Soukaku) |
| Yixuan | Ether | Auric Ink | Auric Ink + Ether = disorder (rarely relevant) |
| YSG | Physical | Honed Edge | Honed Edge + Physical = disorder (rarely relevant) |

The `mechanics.elementalVariant` flag marks this; right now only titled units have elemental variants but it could be expanded to others in the future. Currently a boolean, it is used in disorder generation checks. When vortex mechanics are implemented, this may need to become a named string to distinguish variant types.

### Roles

Every unit has a primary role in their `tags` array:

* **Attack** — On-field DPS dealing damage through standard attacks, chains, and ultimates during stun windows
* **Anomaly** — DPS dealing damage through anomaly buildup, disorders, and enhanced attacks
* **Rupture** — DPS dealing sheer damage (a special classification of damage) that ignores enemy defense entirely
* **Stun** — Creates high-damage windows by stunning enemies; stunners also deal meaningful damage
* **Support** — Buffs teammates and provides utility; negligible personal damage
* **Defense** — Provides shields, healing, damage mitigation and often buff teammates; negligible personal damage

The first three (attack, anomaly, rupture) are **DPS roles**. Units can have additional roles via `pseudoRole` in their mechanics data (see Role Activation below).

### Mindscapes, Weapons, and Potential Silhouettes

Units range from M0W0 to M6W5.

* **Mindscapes (M0–M6):** Each pull beyond the first adds a mindscape. M1/M2/M4/M6 add unique abilities; M3/M5 increase skill levels. M6 S-ranks are extremely powerful but require heavy investment. For many DPS units, M2 is a substantial power spike (e.g., M2 Miyabi generates her own disorder fuel, reducing teammate dependency).
* **Weapons (W0–W5):** W0 = no signature weapon; W1 = signature weapon equipped (often \~20% DPS increase). W2–W5 provide diminishing stat returns. For non-DPS agents, even W1 may not be worth the investment.
* **Potential Silhouettes (P0–P6):** Supplemental buffs unlocked at M0+. P1/P2 add new capabilities and even potentially new joins to expand their legal teammates; P3–P6 are stat increases. Impact varies by unit (e.g., P6 SAnby is significant; P6 Grace is negligible). For units with available silhouettes, the algorithm assumes P6.

**Scoring assumptions:** S-rank DPS at M0W1, non-DPS S-ranks at M0W0, A-rank units at M6W5. Mindscape-specific synergies (e.g., M2 Alice/Jane/Yuzuha being one of the best teams in the game) are deliberately not modeled because the engine cannot accept mindscape levels as input.

### Additional Abilities (`join`)

Each unit has a `join` array representing the tags required to activate their Additional Ability. At least one teammate must carry a matching tag. The team-builder uses `join` as a **hard prerequisite** — teams that don't satisfy every unit's `join` condition are never formed or scored.

A small number of "flex" units (e.g., Nicole, Lucy) provide enough value even without their additional ability activated, but these are exceptions.

### Defensive Assists

When an enemy telegraphs an attack (gold flash), the player can switch in a teammate. Each unit carries either `assist:defensive` or `assist:evasive` in their tags. Some bosses require a minimum number of defensive assist units; teams that don't meet the requirement are disqualified. Boss `assists` field specifies the requirement (0 = no requirement, 3 = all three must be defensive).


---

## Team Archetypes

These are the common gameplay patterns that the engine recognizes through its mechanics-driven architecture. The engine does not hardcode composition templates — these patterns emerge from mechanical interactions scored in Layers 1–4.

### Attack Teams

**Typical:** Stunner + Attacker + Support/Defense

Attackers need stun windows to deal damage. The stunner creates vulnerability periods; the support amplifies the attacker's output during those windows. Double attacker is viable when one has `subdps` pseudoRole.

**Stunless Exception (YSG):** YSG has a built-in stun damage multiplier, so she doesn't need a stunner. Her ideal composition is double-support (YSG + 2 supports). Having a stunner with YSG is suboptimal — except Dialyn, who provides free ultimate attacks. YSG's double-ultimate is the highest burst damage in the game, making Dialyn's ultimate provision uniquely valuable.

### Anomaly Teams

**Modern meta:** Stunner (Nangong/Lycaon) + Anomaly DPS + Support (Yuzuha/Sunna)
**Classic:** Anomaly DPS + Anomaly SubDPS (Vivian/Burnice) + Support (Yuzuha)

Nangong's release fundamentally changed anomaly team building. As a T0 hybrid stun/anomaly unit, Nangong provides anomaly buffs, extended stun windows, and polarity disorder triggers — making `Nangong/<Anomaly DPS>/Yuzuha` the strongest anomaly template, replacing `<Anomaly DPS>/Vivian/Yuzuha`. Lycaon (at P1+) serves as a budget alternative with ice defense shred.

**Disorder generation:** When two anomaly-typed units of different elements are on the same team, they naturally generate disorders for bonus damage. This is especially critical for units with transformative scaling (Miyabi converts disorders into enhanced attacks).

### Rupture Teams

**Typical:** Stunner + Rupture DPS + Support/Defense (Lucia, Pan Yinhu)

Rupture deals Sheer damage that **ignores enemy defense**. This means defense debuffs (Nicole's 40% defense shred) are useless for rupture teams, and PEN ratio is irrelevant. The primary support is Lucia (specialist, +1200 Sheer) or Pan Yinhu (A-rank specialist).

**Synergistic stunners:** Dialyn and Ju Fufu (who has `synergy.tags: ["rupture"]`) are preferred over generic stunners. Dialyn's free ultimates are particularly valuable. Ordering: Dialyn > Ju Fufu > Astra for rupture teams.

### Totalize Teams (Hugo)

**Typical:** DPS + Double Stunner

Hugo converts accumulated stun time into damage (totalize mechanic). More stun uptime = more totalize damage. Hugo prefers two stunners over a stunner + support, even if the second stunner is low-tier. Hugo is marked `onfield: false` because he enters briefly for chain attacks and totalize bursts, then returns field time to his stunners.

### “Monoshock” Teams

**Typical:** Same-element Stunner + Anomaly + Attacker (all three share one element)

There are technically the possibility to have hybrid attack+anomaly compositions; the classic example is the long-outdated  Grace/Harumasa/Rina team. This "monoshock" team — named because it is a triple-electric team whose strategy is to keep ongoing shock bonuses during the whole fight — is no longer all that competitive, but hybrid anomaly+attack compositions are technically still possible and can be used in some niche cases.  The “monoshock” moniker is typically used to refer to these hybrid anomaly/attacker teams (because of the original team that met this composition) but it does not need to be a triple-electric team; it is just a nickname for an unusual hybrid archetype. 


---

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
| **Harumasa** | T1.5 | Attack (Electric) | `synergy.tags: ["anomaly"]` | Currently the only attack agent who supports hybrid anomaly/attack compositions.  |
| **Soukaku** | T1.5 | Support (Ice) + pseudoAnomaly | `buffs.ice:3, atk:3` | Ice specialist only. Frost/ice disorder with Miyabi. On-field status derived dynamically from role activation. |
| **Orphie** | T1 | Attack (Fire) + pseudoSupport/SubDPS | `buffs.atk:2, damage.aftershock:3` | Support-like attacker. Scored as T1 support (not T1 DPS) in L2. Cannot satisfy attack shill as pseudosupport. SubDPS still benefits from stun bonuses. |
| **Caesar** | T0 | Defense + pseudoStun | `buffs.atk:2, utility.shields:2` | Pseudo-stun always activates. Provides daze + ATK buff + interrupt resistance. |
| **Lycaon** | T1 | Stun (Ice) | `debuffs.ice:2, buffs.stun-multiplier:2` | At P1+, `join` expands to anomaly agents. Ice defense shred benefits Miyabi/Promeia. Budget Nangong alternative. |
| **Cissia** | T1.5 | Attack (Electric) + SubDPS | `buffs.cr:1, debuffs.electric:2, utility.daze:1` | Seed's ideal partner. Can function support-like on electric teams. |
| **Vivian** | T0.5 | Anomaly (Ether) + SubDPS | `damage.abloom:3, scaling.am:2, onfield:false` | Was Miyabi's best partner before Nangong. Still strong but dropped from T0. |

### SubDPS Units

Units with `pseudoRole: "subdps"` need a main DPS teammate (any DPS without subdps tag). SubDPS units receive 50% tier multiplier but still benefit from offensive buffs and stun infrastructure. They do NOT receive implicit ultimates scaling (ultimates are a limited resource reserved for the primary DPS), but DO receive quick-assists baseline. (These are engine scoring mechanics that will be explained later.)

Current subdps units: Burnice (fire anomaly), Grace (electric anomaly), Vivian (ether anomaly), Orphie (fire attack, also pseudosupport), Cissia (electric attack).

### Support Classification

Conceptually, many support agents are effectively designed to be either specialists or generalists, and their mechanics reflect this. Sometimes, their specialist domain is not broadly applicable and so they can be excellent in some cases and near-useless in others. 

| Type | Units | Notes |
|----|----|----|
| **Specialists** | Lucia (rupture), Yuzuha (anomaly), Pan Yinhu (rupture) | Are typically found in best available teams for their archetype |
| **Conditional** | Zhao (YSG/attack/anomaly), Nicole (defense shred, avoid rupture), Sunna (AoD/YSG, veils), Rina (electric PEN) | Strong in niche, weak/useless elsewhere |
| **Universal** | Astra (ATK+CD, chains), Caesar (ATK, shields, pseudo-stun), Lucy (ATK, fire) | Work with almost any team, although not necessarily are the optimal support unit |


---

## Boss Reference

### Notable Bosses

| Boss | Weak | Resist | Shill | Anti | Assists | Key Mechanics |
|----|----|----|----|----|----|----|
| **Discordant Solo** | ether | ice, fire | anomaly | rupture | 2 | `shillIntensity:2`. Favors Aria, Sunna, Nangong. Sunna's ether veil stacking creates unique multiplicative debuffs — this boss was designed to require Sunna. One of only two bosses with dual resistance. |
| **Sacrifice Bringer** | ice | physical | anomaly | — | 0 | `shillIntensity:2`. Favors Miyabi. Vulnerable to Freeze status; Miyabi trivializes this fight. |
| **Sanguine Sweeper** | electric, ether | fire | anomaly | rupture | 2 | `shillIntensity:2`. Favors Nangong. Benefits heavily from stunners on anomaly teams. |
| **Primordial Nightmare** | physical | ice, ether | attack | rupture, anomaly | 0 | Favors YSG. Anti-rupture AND anti-anomaly — only attack teams viable. Dual resistance. |
| **Wandering Hunter** | fire, ice | physical | rupture | anomaly, attack | 2 | Anti-anomaly AND anti-attack — only rupture teams viable. Physical resistance hurts YSG from trying to brute force it. |
| **The Defiler** | electric, physical | ice | attack | anomaly | 2 | Attack-shill. Anti-anomaly. Ice resistance hurts Miyabi. |
| **Thrall & Sobek** | ice, physical | electric | stun | anomaly | 2 | Stun shill is a **hard requirement** — teams without a stunner are disqualified. |
| **Typhon Slugger** | electric | fire | — | — | 3 | All three units must have `assist:defensive`. Fire resistance. No shill. |
| **Miasma Priest** | ether | ice | rupture | — | 2 | Ice resistance hurts Miyabi. Rupture shill means rupture teams get bonus. |

### Shill Behavior

* **DPS shills** (attack, anomaly, rupture): Matching the shill gives a flat bonus. Not matching gives no bonus — but no penalty either. Teams compete on their own merits.
* **Non-DPS shills** (stun): Hard requirement. No stunner = disqualified. These bosses have mechanics that make the shilled role essential.

### Shill Intensity

Bosses with `shillIntensity > 1` (Solo, Bringer, Sweeper) have fight mechanics that make their favored units disproportionately valuable. The first favored unit gets the full amplified bonus; additional favored units receive diminishing returns.


---

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
  "faction": "Angels of Delusion"
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
* `faction` — Faction name (informational)

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
* `synergy.avoid` — Largely retired. Used to express conflicts that cannot easily be modeled. For example, Dialyn and Pan cannot be used on the same team because they invalidate each others' buffs due to teammate ordering, which is not something that is currently modeled. 

### Unit Mechanics Object

The `mechanics` object describes what is **distinctive** about a unit beyond its role baseline. Units with no distinctive mechanics have `mechanics: {}`.

```json
{
  "mechanics": {
    "pseudoRole": "anomaly",
    "elementalVariant": true,
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
* `elementalVariant` — Marks units with alternate element tracking. Currently boolean; may become a named string for vortex mechanics.
* `onfield` — Explicit on-field demand override. Defaults: attack/anomaly/rupture/stun = `true`; support/defense = `false`. When a unit's pseudoRole activates as a different role, on-field status is derived from the activated role unless explicitly overridden.
* `damage` — Distinctive damage types. Keys: `enhanced`, `ultimate:strong`, `ultimate:double`, `chain`, `aftershock`, `abloom`, `polarity`, `totalize`.
* `buffs` — What the unit buffs for teammates. Keys: `atk`, `anomaly`, `aftershock`, `chain`, `sheer`, `pen`, `stun-multiplier`, `cr`, `cd`, and element names.
* `debuffs` — What the unit debuffs on enemies. Keys: `defense`, `recovery`, and element names.
* `utility` — Non-stat team contributions. Keys: `disorders`, `quick-assists`, `chains`, `ultimates`, `heal:team`, `heal:self`, `shields`, `interrupt-resistance`, `kaleidoscope`, `veils`, `daze`, `stunless`.
* `scaling` — What the unit benefits from. Overrides role baseline when present. Non-stat keys go through Need Fulfillment; stat keys enhance Baseline Affinity.

**Override rule:** When `scaling` is present, it replaces the role-baseline scaling for Need Fulfillment. An attacker with no `scaling` gets baseline (cr:2, cd:2). An attacker with `scaling: { "ultimates": 3 }` scales ONLY with ultimates through Need Fulfillment. ***{TODO: This might be incorrect!!!}*** Baseline Affinity rules (ATK, defense shred, element matching, stun infrastructure) still apply regardless.

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
  "weaknesses": ["ether"],
  "resistances": ["ice", "fire"],
  "shill": "anomaly",
  "anti": ["rupture"],
  "assists": 2,
  "favored": ["Aria", "Sunna", "Nangong"],
  "shillIntensity": 2,
  "available": true
}
```

* `weaknesses` / `resistances` — Element arrays
* `shill` — DPS archetype or non-DPS role the boss prefers
* `anti` — DPS archetypes disqualified against this boss
* `assists` — Required number of defensive assist units
* `favored` — Named units with enhanced bonuses on this boss
* `shillIntensity` — (optional, default 1) Amplifies favored unit bonuses
* `available` — (optional, default `true`) When `false`, boss is unreleased

Boss data currently does not express mechanical levers like units do. This may likely need to change in the future.



---

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
   * **Baseline Affinity**: Broad stat interactions (ATK/CR/CD help DPS; anomaly buffs help anomaly agents; defense/element debuffs help damage contributors; stun infrastructure helps attackers/rupture)
   * **Damage Amplification**: Supplier buffs a damage type the consumer deals
   * **Need Fulfillment**: Supplier provides something the consumer explicitly scales with (highest-value matches)
   * **Stun Emergence**: Consumer has burst damage that benefits from stun infrastructure
   * **Diametric Synergy**: Multiplicative buff/debuff interaction bonus (see below)
   * **L4 Element Modifier**: On-element pairs get amplified L4 scores; off-element get reduced
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


---

## Scoring Engine Design Principles

These principles govern how the mechanics-driven engine evaluates teams. They are grouped thematically for reference.

### Buff and Damage Mechanics

**Mechanics Only Score When Consumed (P1):** A mechanic's existence has no inherent value. Points are only awarded when consumed by another unit's scaling or need. Exception: foundational mechanics (ATK, CR, CD) have automatic value through baseline affinity because every DPS intrinsically benefits from them, gated by role.

**Damage Buffs on Non-DPS Are Negligible (P2):** Offensive buffs landing on pure support/defense units are strategically irrelevant. The engine does not count element buffs as "relevant" for non-damage-contributor units. This extends to buff utilization — a support's matching element does not inflate a supplier's utilization score.

**Damage Contribution Determines Buff Relevance (P26):** Units divide into damage contributors (any unit with a DPS or stun role) and non-damage contributors (pure support/defense). SubDPS units are always damage contributors even with a support pseudoRole. Only pure non-DPS units get zeroed out for offensive buff relevance.

**Wasting Buffs = Wasting DPS Potential (P3):** When a DPS provides buffs (SAnby's aftershock buff, Cissia's electric debuff), teammates must consume them. Unused buffs indicate the DPS was fielded in the wrong team, and the engine applies a cohesion penalty proportional to the unused buff weight.

**CR/CD Role Asymmetry (P9):** CR/CD are critical for attackers and rupture. For anomaly agents, damage comes primarily from ATK/AP/disorders, not crits — CR/CD return only 0.3 weight. Exception: Miyabi has effectively 100% crit rate and explicit `scaling: { cr: 3, cd: 3 }`, making CR/CD fully valuable for her.

**Stun Multiplier Is a Real Buff (P12):** The `stun-multiplier` buff (Dialyn, Sunna, Lycaon) increases damage during stun windows. It benefits all DPS units, not just specific archetypes. Scored in baseline affinity.

### Need Fulfillment and Scaling

**Scarcity Determines Value (P4):** Foundational stats (ATK, CR, CD) are common and replaceable through equipment — scored at lower multipliers. Specialist mechanics (veils, chains, aftershock, abloom) are rare and irreplaceable — scored at higher multipliers. This structural premium means a unit providing a rare mechanic matching a consumer's scaling always outscores one providing a common stat buff, all else equal.

**Need Fulfillment Supply/Scaling Gating (P5):** Supplier must provide sufficient supply to satisfy the consumer's scaling need. Fulfillment score is multiplied by `min(1, supply / scaling)`. Sunna (veils:3) gets full credit for YSG (veils:2); Lucia (veils:1) gets only 50%.

**Buff Utilization Gates Support Quality (P6):** A support's tier/rank only matters to the extent their buffs are utilized. Utilization is the weighted proportion of buffs/debuffs that fire for at least one consumer, with squared gating. A support with 30% utilization sees quality crushed to 9%.

**Scaling Types (P10):** Three flavors:

* *Direct* (scaling matches damage type): Evelyn's `scaling.chains:3` + `damage.chain:3`. Doesn't change frequency, amplifies existing high-multiplier damage.
* *Transformative* (scaling feeds enhanced attack frequency): Miyabi's `scaling.disorders:3` + `damage.enhanced:3`. Disorders are converted into enhanced attack resources. Missing this is very impactful — the unit will function at a significant gap from their potential damage ceiling.
* *Constant* (steady stat amplification): Alice/Vivian's `scaling.am` converts AM into AP passively.

**Ultimates Are a Primary DPS Resource (P28):** Free ultimates (Dialyn, Ju Fufu) are limited — only one unit gets them per stun window. SubDPS units do not receive implicit ultimates scaling. Quick-assists are NOT limited and benefit all DPS including subdps.

**Ultimates Provision Scales with Burst Potential (P13):** Free ultimates are worth more for high-burst DPS (Evelyn 4000% multiplier ultimate vs. a basic 1000% ultimate). Scaled by consumer's `getMaxBurstWeight`.

**Naturally Available Needs (P19):** Ultimates and chains are always available via normal gameplay. Having a dedicated provider (Ju Fufu's `utility.ultimates`) makes them available faster, which is correctly rewarded in L4. But the DPS reception cohesion check skips these keys — not having a provider is not a cohesion failure.

**Self-Provision Excludes Needs from Cohesion (P22):** When a DPS scales with a mechanic it also provides to itself (Banyue has both `scaling.interrupt-resistance:2` and `utility.interrupt-resistance:2`), the cohesion check doesn't count it as unmet.

### Role and Structure Rules

**A Pseudorole IS a Role (P25):** Activated pseudoroles become the unit's identity for scoring. All role functions check `_activatedRoles` first. See Role Activation section for full implications across L1–L3.

**Pseudo-DPS Role Activation Requires Team Context (P23):** DPS pseudo-roles (attack, anomaly, rupture) only activate when a teammate has that DPS type in primary tags. Non-DPS pseudo-roles (stun, support, defense, subdps) always activate.

**Tier Degradation Rates Differ by Role (P8):** DPS tier quality matters enormously (T2 DPS = significant compromise). Stunner tier matters less (stun is stun). Support/defense tier matters least (buffs are buffs). Penalty curves are steeper for DPS.

**DPS Reception and Team Completeness (P14):** DPS units without buff contributions are checked for what fraction of their scaling needs are met by the team. A "duo + deadweight" team gets penalized for the third member riding free.

**Stunner Value Discount on Stunless Teams (P16):** When all DPS are stunless (YSG), stunner tier/rank bonuses are multiplied by 0.4. Their L4 contributions (stun-multiplier, ultimates) still score normally.

**synergy.avoid as Near-Disqualification (P17):** Explicit `avoid` annotations represent game-mechanically-rooted anti-synergy (e.g., Dialyn + Pan Yinhu). Normal mode: disqualification. Lenient mode: massive penalty.

### Anomaly-Specific Rules

**Implicit Disorder Generation (P15):** When two anomaly-typed units of different elements are on the same team, both receive a flat disorder bonus. Units with explicit `scaling.disorders` (Miyabi) are excluded to prevent double-counting with need fulfillment.

**Dual-Anomaly Teams Are Inherently Cohesive (P24):** Primary anomaly DPS + off-field anomaly subdps of different element = inherently cohesive. No cohesion penalty for the subdps "not providing buffs."

**Totalize and Stun Dependency (P11):** Totalize units (Hugo) convert stun time into damage. They want double-stun teams. The engine applies non-linear penalties when stun infrastructure is below 2.0 credits (proper stunner = 1.0, pseudo-stunner = 0.9, high-daze support = 0.4).

### Structural Principles

**Faction Synergies Require Explicit Modeling (P7):** Some synergies are faction-based and don't emerge purely from mechanics (e.g., the full AoD trio). These are expressed through `synergy.units`.

**Quick-Assists Baseline Value (P18):** Quick-assists are useful but not transformative. Implicit scaling baseline is 0.25 — modest need fulfillment credit. Units with explicit `scaling['quick-assists']` override this.

**Defense Element Irrelevance (P20):** Pure defense units provide value through buffs and utility, not damage. Element resistance penalties are removed for defense units. A small on-element bonus is retained.

**Element Resistance and SubDPS/PseudoSupport Handling (P21):** Standard subdps units are disqualified when resisted, like any DPS. Only pseudosupports bypass disqualification (they still contribute as supports when their damage element is resisted), but receive a damage-proportional penalty.

**Shill Is a Bonus, Not a Penalty (P27):** DPS shill matching gives a flat bonus. No penalty for mismatching. Non-DPS shills (stun) remain hard requirements.


---

## Wheelchair Compositions

Powerful support/utility pairings that uplift almost any compatible DPS:

* **Astra + Nicole** — Universal attack/anomaly wheelchair. ATK buff + defense shred = massive damage differential. Not for rupture (defense shred useless).
* **Nangong + Sunna** — Attack/anomaly wheelchair. Anomaly procs + stun + ATK buff + stun multiplier. Not for rupture.
* **Nangong + Yuzuha** — Anomaly-specific wheelchair. Stun + anomaly buffs + kaleidoscope element flex. Replaced Vivian's slot in the top anomaly template.
* **Dialyn + Lucia** — Definitive rupture wheelchair. Free ultimates + stun + rupture specialist support. Best-in-slot for all rupture agents.

These emerge naturally from the mechanics engine — their high scores are evidence of well-modeled mechanics.


---

## Scoring Results Scale

Rough boundaries for team quality:

* 500+ — Exceptional matchup, essentially best possible team of choice
* **400+** — Great matchup, near-optimal/optimal
* **300–399** — Ideal; solid team for this boss and can achieve full clear with minimal skill required
* **230–299** — Playable; can achieve full clears with sufficient skill
* **145–229** — Suboptimal; full clears may be difficult even with great skill
* **Below 145** — Nigh unplayable for endgame content

These boundaries are approximate and shift as the scoring algorithms are tuned.


---

## DPS Bucketing and Diversity Selection

(This section describes `app/public/lib/common/dps-buckets.js`, which consumes team scores as inputs — not the scoring engine itself.)

When optimizing 3 teams for Deadly Assault's 3 bosses, raw top scores tend to be near-identical — the same DPS with minor support variations. Showing five "options" that differ only by swapping one support is not useful.

Results are grouped by which type of DPS is assigned to each boss (considering role, element, and power tier). The algorithm selects one representative from each distinct DPS assignment pattern, preferring the highest-scoring realization. The webapp provides a toggle between this diversity-aware view (default) and the raw score-sorted view.


---

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


---

## Upcoming Features

### Wind Element and Vortex (Version 2.8+)

Version 2.8 (releasing very soon) introduces the **Wind** element. The codebase already supports adding new elements via the `ELEMENTS` constant.

**Vortex mechanic:** When two different anomaly types are applied simultaneously and one of them is Wind, the reaction triggers **vortex** instead of **disorder**. Vortex has different effects depending on the paired element, with different damage multipliers per element pair. Notably, Frost (Miyabi's variant) has deliberately flat vortex damage compared to standard elements — a game design choice to discourage reliance on existing titled units.

**Key unknowns:**

* Exact vortex damage multipliers per element pair
* Whether Auric Ink and Honed Edge variants are similarly flat (likely matters less since those units rarely inflict anomalies)
* Identity of future wind agents beyond initial releases
* Full boss mechanic interactions with wind

**Patch 2.8 boss:** An anomaly-shill boss weak to ice (designed for Promeia). It afflicts wind anomaly on itself, meaning teams need to interact with the wind anomaly it applies. Additional weaknesses and resistances are not yet confirmed.

**Architectural implications:** The engine will need:

* An element interaction matrix for asymmetric vortex damage per element pair
* Per-element-pair scoring modifiers for team composition
* Integration of `elementalVariant` (potentially as a named string) into the vortex interaction matrix
* Boss-side properties for wind/vortex-specific mechanics


The following units are already modeled in `units.json` as preview units (`available=false`):

### Promeia (Releasing Very Soon)

Ice anomaly DPS. Key mechanics:

* Abloom buffer — buffs abloom damage for teammates (like SAnby buffs aftershock)
* Stun-synergy anomaly — benefits from stun windows (like Aria), emergent from mechanics
* Wind/vortex interaction synergy — bridge character between current meta and wind meta
* Positioned as an alternative to Miyabi in certain content (abloom-specific support that Miyabi cannot benefit from)

### Starlight Billy (Releasing \~4 Weeks)

Conventional physical rupture agent. Expected to be strong against Fiend, Thrall, and Defiler. Best-in-slot teammates: Dialyn + Lucia (like every rupture agent), with Ju Fufu and Pan as alternatives. Should slot cleanly into existing rupture scoring without engine changes.