ZZZ Engine Context

Domain knowledge for the ZZZ team scoring engine and the pull recommendation engine.
The two are one system: pull recommendations answer "which unit would most improve the
teams you can build", so they reason over the same mechanics vocabulary the scorer does.

**Sources of truth — the code and data win, always:**

| What | Where |
|----|----|
| Scoring logic | `app/public/lib/common/team-scorer.js` |
| Pull recommendations | `app/public/lib/common/pull-engine.js` |
| Team legality (`join`) | `app/public/lib/common/team-builder.js` |
| Unit data, tiers, mechanics | `app/public/data/units.json` |
| Boss data | `app/public/data/bosses.json` |
| Elements / DPS roles | `app/public/lib/common/constants.js` |

**This document deliberately contains no tuning constants, thresholds, or formulas.**
Those live in the code, which is densely commented with its own rationale. What lives here
is the game-domain knowledge and design intent that the code *can't* tell you. Constant and
function names appear only as grep anchors. If a number matters, read it from source.


## 1. Game Fundamentals

### Elements

Seven elements: **fire, ice, electric, ether, physical, wind, lumen**.

A DPS whose element matches a boss weakness gets a bonus; a DPS whose element is resisted is
disqualified (support/defense units are penalized instead, not disqualified — see
*Support element irrelevance* below). No boss currently has lumen weakness or resistance.

**Element variants.** Three "titled" units track anomaly buildup on a separate gauge that still
counts as their base element for weakness/resistance:

| Unit | Base | Variant | Why it matters |
|----|----|----|----|
| Miyabi | ice | `frost` | Frost + ice = disorder (e.g. with Soukaku) |
| Yixuan | ether | `auricInk` | Rarely relevant |
| Ye Shunguong | physical | `honedEdge` | Rarely relevant |

Marked by `mechanics.elementalVariant`. Used for disorder generation and vortex tiering.
A variant can have a deliberately different vortex tier from its base element — Miyabi's frost
is effectively zero, which is the whole reason Promeia (pure ice) beats her on vortex bosses.

### Roles

Every unit's primary role is a tag: **attack**, **anomaly**, **rupture**, **armorer** (the four
DPS roles), plus **stun**, **support**, **defense**.

* **Attack** — on-field DPS through basics, chains, ultimates during stun windows
* **Anomaly** — DPS through anomaly buildup, disorders, enhanced attacks
* **Rupture** — deals Sheer damage, which **ignores enemy defense** (so defense shred and PEN are dead)
* **Armorer** — deals Sharp damage, scales off DEF (see below)
* **Stun** — creates damage windows; also deals meaningful damage
* **Support** — buffs and utility, negligible personal damage
* **Defense** — shields/healing/mitigation, usually also buffs; negligible personal damage

Despite the name, **defense units are not played defensively** — the game rewards aggression,
so they function as alternate supports that happen to deal slightly more personal damage.
(Ben converts DEF into crit damage and is usually built as a DPS by people who run him.)

Units gain additional roles via `mechanics.pseudoRole`. **An activated pseudo-role IS the unit's
role** for scoring — every role predicate (`isDPS`, `isSupport`, …) reads activated roles first.

### Anomaly Reactions

Two *different-element* anomalies on the same target react:

* **Disorder** — both non-wind. The standard reaction.
* **Vortex** — exactly one is wind. Damage scales off the **non-wind** element's tier.

Same-element pairs (including wind+wind) do nothing.

Vortex tiers, highest to lowest: **ice ≫ fire ≈ physical ≈ ether > electric > elemental variants**
(frost is effectively zero; auricInk/honedEdge are low). Exact values: `VORTEX_TIERS`.
This tiering is what differentiates ice anomaly agents from frost-variant Miyabi on wind bosses.

**Boss anomaly state** (`mechanics["anomaly:state"]`) is the big modifier. Such a boss permanently
carries that element's anomaly, and it *immediately consumes every team-applied anomaly*. This
suppresses all team-side reactions: each agent reacts only with the boss, once. Same-element
agents get nothing.

> **Critical distinction:** a boss being *weak to wind* (a `weaknesses[]` entry) does nothing to
> anomaly reactions. A boss having *wind anomaly state* does. These are independent; a boss can
> have either without the other.

**Polarity disorders** are a subclass of disorder. `buffs.disorders` (Yuzuha) buffs them, and
`utility.disorders` providers force disorder occurrences that bypass anomaly-state suppression.
Occurrence still feeds `scaling.disorders` at full weight (so Miyabi's transformative scaling
keeps working), but polarity *damage* is heavily discounted on wind-anomaly bosses
(`POLARITY_VORTEX_DISCOUNT`).

### Lumen (Remielle)

Lumen has three mechanics that make it unlike any other element:

* **Attribute Mutation** — lumen damage morphs to the element of the next agent in team order.
  It counts as that element for weakness/resistance but **does not fill that element's anomaly
  gauge**, so lumen units generate no disorders and no vortex, and are excluded from element-diversity
  checks. The scorer tries every morph target and keeps the best result (assuming the player orders
  their team optimally). A lumen unit is only DQ'd if *all* morph targets are resisted.
* **Lumiflux Buildup → Refringe** — when a *non-lumen* anomaly teammate procs an anomaly while
  Lumiflux is up, that proc deals a large extra hit. Because disorder/vortex damage derives from
  proc damage, Refringe **cascades** into reactions. This is why multi-element partners beat
  same-element ones: Alice/Vivian/Remielle (disorders to cascade into) > Alice/Jane/Remielle.
* **Luminize** — a lumen-only damage type. For Remielle it takes the form of *anomaly rebound*:
  she tracks the last three mutations, combines their Refringe-boosted damage, multiplies by her
  Anomaly Proficiency, and delivers it as one enormous hit. Modeled as `damage.luminize`.

### Armorer / Sharp / Gash / Maim

The fourth DPS class is a deliberate inversion of the standard model:

* **DEF and CR are the only stat levers.** Armorers have **zero ATK scaling**
  (`ARMORER_ATK_EFFICIENCY`), so ATK buffs are worthless. Crit damage is **fixed**, so CD buffs
  are worthless too (Astra earns nothing from an armorer). DEF buffs route through a dedicated
  affinity path (`MULT.DEF_BUFF`), which is what makes Rina best-in-slot.
* **Overcritical crit rate.** Armorers get a second crit check between 100–200%, so CR stays
  useful to 200% rather than dying at 100%. Because they lean so hard on it, an armorer with
  **no CR-supplying teammate** takes a dedicated cohesion hit (`ARMORER_CR_MISS_UTIL`).
  CR suppliers: Koleda's P6 narrow buff, Roxy's, Nicole, Cissia.
* **Sharp damage** is the armorer's damage type — parallel to rupture's Sheer, **but applied
  against normal enemy defense**. So unlike rupture, armorers *do* benefit from defense shred and PEN.
* **Gash → Maim.** Only armorers open Gash meters, and all meters share **one pool of marks**.
  Only stun and armorer agents build that pool, and only they detonate it into a **Maim** (a burst
  parallel to a disorder). More builders fill the shared pool faster, which is why armorers want
  stun/armorer-dense comps rather than double support. Modeled as a builder-scaled bonus
  (`MAIM_BASE`, `MAIM_ENABLER_BONUS`), with the builder count capped to represent the shared ceiling.
* Sharp and Maim are **role-inherent**. A vanilla armorer needs no `scaling` and no `damage` at all —
  Claret's entire kit is `mechanics: {}`.

### Additional Abilities (`join`)

Each unit's `join` array lists tags that at least one teammate must carry to activate its
Additional Ability. `join` is a **hard prerequisite**: illegal teams are never formed and are
disqualified if passed to the scorer directly. `isValidTeam` requires *every* member's join to be
satisfied; the scorer relaxes this slightly for trios, accepting a team where any *pair* mutually
joins (the odd one out is a flex slot). The literal token `faction` in a `join` array expands to
the unit's own `faction` value.

### Defensive Assists

Each unit carries `assist:defensive` or `assist:evasive`. Bosses specify a minimum number of
defensive-assist units via `mechanics.assists`; teams below the threshold are disqualified.
`utility.rotations: "limited"` (Astra, Remielle) means the unit removes itself from the assist
rotation, reducing the boss's effective requirement by one — unless the boss sets `chainParry: true`
(Girtablullu), whose mechanic needs two genuinely off-field defensive assists at once.

### Investment Assumptions

Units range M0W0–M6W5. The scorer **cannot accept investment levels as input**, so it assumes:

* S-rank DPS at **M0W1**, non-DPS S-ranks at **M0W0**, A-ranks at **M6W5**
* Potential Silhouettes at **P6** where available

Consequences worth remembering: mindscape-specific synergies are deliberately unmodeled
(M2 Alice/Jane/Yuzuha is a top-tier team the engine cannot see), and P-level unlocks that expand
a unit's `join` list (Lycaon at P1+) are baked into the data rather than conditional.


## 2. Team Archetypes

The engine hardcodes no composition templates beyond the structure classifier in L1.5 — these
patterns *emerge* from mechanical interactions. They're listed here so you know what "correct"
output looks like.

* **Attack** — Stunner + Attacker + Support/Defense. Attackers need stun windows; the support
  amplifies output inside them.
* **Anomaly (modern)** — Stunner (Nangong/Lycaon) + Anomaly DPS + Support (Yuzuha/Sunna/Astra). Nangong's release changed anomaly team-building: as a hybrid stun/anomaly unit providing anomaly buffs, extended windows, and polarity triggers, `Nangong/<DPS>/Yuzuha` displaced the classic
  `<DPS>/Vivian/Yuzuha`. Both still exist — Promeia sometimes prefers Vivian for abloom volume.
* **Anomaly (triple)** — three primary-anomaly units, enabled by Remielle. Traditional anomaly
  wheelchairs are strongly *sub*optimal for her.
* **Rupture** — Stunner + Rupture DPS + Lucia or Pan Yinhu. Defense shred is useless here. Dialyn or Norma > Ju Fufu > Astra as the stunner; Norma is strong because she converts sheer buffs into personal ATK.
* **Totalize (Hugo)** — DPS + double stunner. Hugo converts accumulated stun *time* into damage,
  so a second low-tier stunner beats a good support. He's `onfield: false` — he enters for chains
  and totalize bursts, then hands field time back.
* **Stunless (YSG)** — YSG + double support. She receives her stun damage multiplier whether or not
  the enemy is stunned, so inflicting stuns gains her nothing (though *raising* the multiplier helps
  her constantly, unlike everyone else). Dialyn is the exception worth bringing: her free ultimates
  feed YSG's double-ultimate, the highest burst in the game. This is also why a stunless DPS clears
  a stun-shill boss's hard stunner requirement (see `shill` under Boss Mechanics) — the boss's
  damage gate *is* the stun window, and YSG doesn't need one.
* **"Monoshock"** — hybrid anomaly + attacker. Named for the old triple-electric Grace/Harumasa/Rina
  team, but the name now just means any hybrid anomaly/attack comp; it need not be electric or triple.
  Niche but legal — Harumasa's `scaling.anomaly` is what makes it score.

**Wheelchairs** — support pairings that uplift almost any compatible DPS: Astra+Nicole (attack), Nangong+Yuzuha and Vivian+Yuzuha (anomaly), Velina+Remielle (anomaly), Nangong+Sunna (attack/anomaly), Dialyn+Lucia (rupture), Norma+Astra (attack) / Norma+Lucia (rupture). These are *emergent*; their high scores are evidence the mechanics are modeled well, not something the engine is told.


## 3. Data Model

This is the contract a human edits by hand. Everything below is read from `units.json` / `bosses.json`.

### Unit object

```json
{
  "id": "aria", "name": "Aria", "aliases": ["..."],
  "image": "./assets/characters/aria.webp",
  "rank": "S", "limited": true, "tier": 0.5,
  "tags": ["anomaly", "ether", "aod", "assist:defensive"],
  "join": ["stun", "support"],
  "faction": "Angels of Delusion",
  "available": true,
  "synergy": { "units": [], "tags": [], "avoid": [] },
  "mechanics": { "damage": { "enhanced": 2, "abloom": 2 }, "scaling": { "veils": 2 } },
  "displayText": "Free text shown on the character summary"
}
```

* `tier` — numeric, **T0 = best**. Tiers change often; never quote them from this document.
* `tags` — role + element + faction + assist type. `title` marks a titled unit.
* `available: false` — unreleased; included for pre-release testing, surfaced by CLI `--preview`.
* `aliases` — used for CLI fuzzy matching ("S11", "YSG").

`synergy` is largely retired — mechanics express nearly everything now.
`synergy.units` is a named-pair bonus (L5), currently only the Angels of Delusion trio and a
couple of one-way entries. `synergy.tags` survives only on Ju Fufu (`["rupture"]`) as a stopgap.
`synergy.avoid` is a near-disqualification for anti-synergy that's too awkward to model
mechanically (hard DQ in strict mode, large penalty in lenient mode) — currently unused.

### `mechanics`

The `mechanics` object describes what is **distinctive** about a unit beyond its role baseline.
Units with nothing distinctive have `mechanics: {}` — and that's a complete, valid kit.

Weights throughout: `true`/`1` = minor, `2` = strong, `3` = defining. (Values above 3 exist where a unit is deliberately off the conventional scale, e.g. Remielle's `atk: 4`.)

| Key | Meaning |
|----|----|
| `pseudoRole` | Secondary roles (see below) |
| `elementalVariant` | Alternate anomaly-gauge tracking |
| `onfield` | Explicit on-field demand override |
| `damage` | Distinctive damage types this unit deals |
| `buffs` | What it buffs for teammates |
| `debuffs` | What it debuffs on enemies |
| `utility` | Non-stat contributions |
| `scaling` | What it benefits *from* |
| `replaces` | Supplier-side: this provision costs the consumer another resource |
| `converts` | Consumer-side: self-conversion of one resource into another |

#### The unified conditional framework

**One predicate vocabulary drives both pseudo-role activation and conditional mechanic values.**
Anything new added to `evaluatePredicate` is automatically available everywhere.

Predicates (`when`):

* `{ "countTag": "<tag>", "minCount": n }` — team (including self) has ≥ n units with that tag
* `{ "hasUnit": "<ident>" }` — a plain id (`"miyabi"`) matches by id; a **colon-qualified**
  `"<role>:<element>"` (`"anomaly:wind"`) matches any unit with that *effective* role and element
* `{ "notPresent": "<ident>" }` — the inverse, same identifier forms
* `{ "role": "<role>" }` — **recipient-scoped**: the *consumer receiving the value* has that
  effective role. Only meaningful for conditional mechanic values, not for pseudoRole activation
  (which is self-scoped). In team-global contexts with no consumer it evaluates false and falls
  through to the default case.

Any mechanic value may be a scalar **or** `{ "cases": [ { "when": …, "value": n }, …, { "value": default } ] }`.
First passing case wins; a case with no `when` always passes.

Two distinct uses:

* **Team-scoped** (`countTag`/`hasUnit`/`notPresent`) — resolved once per team. Remielle's ATK
  curve by anomaly count. These are subject to an **under-activation penalty**: a squared gap
  between the resolved value and the max possible value, so large misses are punished
  disproportionately. This is what pushes Remielle hard toward triple-anomaly comps.
* **Recipient-scoped** (`role` only) — resolved per consumer. This is how **narrow buffs** work:
  Koleda and Roxy give `cr` to armorers and `cd` to everyone else, as two conditionals on the same
  kit. Exempt from the under-activation penalty — a per-recipient buff is never "under-activated",
  and utilization resolves it to the best value that actually reaches a DPS so a correctly-routed
  narrow buff is never charged as unlanded.

#### `pseudoRole`

A mixed array of plain strings (always active) and `{ "role": …, "when": … }` objects.
Activation is **entirely data-driven** — there are no hardcoded activation rules in the engine.

Live examples worth knowing:

| Unit | Definition | Behaviour |
|----|----|----|
| Caesar | `["stun"]` | Always a pseudo-stunner |
| Remielle | `["subdps", "support"]` | Both always active; off-field subdps/support hybrid |
| Roxy | `["anomaly", "subdps"]` | Wind stunner who is also a wind anomaly source |
| Nangong | `[{anomaly, when countTag anomaly ≥1}]` | Anomaly only alongside an anomaly-tagged unit |
| Soukaku | `[{anomaly, when hasUnit miyabi}]` | Anomaly *only* with Miyabi, else pure support |
| Yanagi | `[{subdps, when hasUnit miyabi}]` | Demoted to subdps when Miyabi is present |
| Burnice | `[{subdps, when notPresent velina}]` | *Promoted* to primary DPS when Velina is present |
| Cissia | `[{subdps, when countTag attack ≥2}]` | Subdps only on a double-attacker team |

Yanagi and Burnice are inverse patterns, and their **pull-engine defaults differ accordingly**:
with no team context, `hasUnit` defaults to *not* activating (Yanagi reads as primary DPS) while
`notPresent` defaults to activating (Burnice reads as subdps).

The special `"dps"` pseudo-role marks a support/defense unit as a primary DPS participant for L2
scoring. A unit declaring both `dps` and `support` is always treated as forced-secondary — its kit
is split between personal damage and team support, so it never earns full primary DPS credit.

**On-field derivation:** defaults are attack/anomaly/rupture/armorer/stun = on-field,
support/defense = off-field. When a pseudo-role activates, on-field status follows the *activated*
role unless `mechanics.onfield` overrides explicitly. Soukaku has no override, so she is on-field
exactly when her anomaly role fires.

#### `damage`

Distinctive damage types: `enhanced`, `chain`, `aftershock`, `abloom`, `polarity`, `totalize`,
`luminize`, `sharp`, `maim`, and the ultimate variants.

The ultimate keys are load-bearing:

* `ultimate:strong` / `ultimate:double` raise the unit's implicit ultimate scaling
* `ultimate:weak` marks a unit whose ultimate is *not* a meaningful burst (Sigrid's ultimate is
  weaker than her enhanced attacks; Pyrois uses his as a mode switch). Implicit ultimate scaling is
  zeroed and ultimate-provision bonuses from stunners are suppressed, so ultimate-providing stunners
  don't earn unearned credit. **A** `ultimate:strong` overrides `ultimate:weak` — which is exactly
  how Pyrois's conditional works: his ultimate becomes a real burst when a wind-anomaly unit is
  present, lifting the weak-ultimate penalty.

`sharp` and `maim` are role-inherent to armorers — only list them to override the role default.

Conditional `damage` values are resolved once per team into `unit._resolvedDamage` (damage is
always team-scoped — it's the unit's own output — so no consumer context is needed).

#### `buffs` / `debuffs`

Buff keys: `atk`, `anomaly`, `aftershock`, `abloom`, `chain`, `chains`, `sheer`, `pen`, `def`,
`stun-multiplier`, `cr`, `cd`, `dmg`, `disorders`, `vortex`, element names.
Debuff keys: `defense`, `recovery`, `dmg`, element names.

Two keys behave unlike the rest and are excluded from cohesion (`COHESION_EXCLUDED_BUFFS`):

* `dmg` — generic damage. A universal multiplier on all damage that is relevant to every DPS
  unconditionally. There is no team where it fails to land, so it's scored as a flat term and
  **must not count toward utilization** — otherwise it would rescue the cohesion of a support whose
  *designed* buffs are mismatched (a rupture support's `sheer` on an attack team). This lets an
  otherwise-thin `dmg`-heavy kit like Koleda's be universally valuable without distorting fit.
  Debuff-side `dmg` is worth slightly less than buff-side: a buff helps the team against every
  enemy, a debuff marks only one — irrelevant on single-target Deadly Assault, real on Shiyu Defense.
* `vortex` — a contextual bonus (Jane Doe's retroactive vortex crit, generalized). It scores
  only when consumers actually generate vortex this fight, tier-scaled, and carries no cohesion
  penalty when it doesn't apply.

Buff relevance (`getBuffRelevance`) is where role asymmetries live: rupture units get reduced ATK
efficiency, armorers get zero; anomaly units get low CR/CD relevance because their damage comes from
ATK/AP/reactions rather than crits (Miyabi is the exception — she has effectively 100% crit rate
and explicit `scaling.cr`/`cd`, so both are fully valuable to her). `abloom` and `disorders` are
always relevant to anomaly-role units, and to others only if they have matching damage types.

#### `utility`

`disorders`, `quick-assists`, `chains`, `ultimates`, `veils`, `heal:team`, `heal:self`, `shields`,
`interrupt-resistance`, `kaleidoscope`, `daze`, `stunless`, `rotations`, `gash-build`.

`gash-build` grants Gash buildup to a non-stun/non-armorer teammate — they add to the shared Maim
pool's builder count but still cannot detonate it. *(Engine support exists; no unit uses it yet.)*

#### `scaling`

What the unit benefits from. Non-stat keys go through Need Fulfillment; stat keys feed Baseline
Affinity. Includes element-scoped anomaly quantity scaling: `scaling.anomaly` is fed by *any*
effective anomaly agent, `scaling["anomaly:wind"]` only by wind ones — and since wind anomaly is
still anomaly, a wind source satisfies both. Supply counts anomaly agents *including self*, so a
wind pseudo-anomaly like Roxy self-fulfils.

**How** `scaling` interacts with role baselines — read this carefully, it is easy to get wrong:

`getEffectiveScaling` returns `{ ...roleBaseline, ...explicitScaling }` — a **per-key merge, not a
wholesale replacement**. An attacker with `scaling: { ultimates: 3 }` still has `cr: 2, cd: 2` from
the attack baseline *and* gains `ultimates: 3`. Only keys the unit names explicitly are overridden.

Role baselines:

| Role | Baseline scaling |
|----|----|
| Attack | `cr`, `cd` |
| Anomaly | `am`, `ap` |
| Rupture | `sheer`, `hp`, `cr`, `cd` |
| Armorer | `def`, `cr` (no `cd` — fixed crit damage) |
| Stun | `daze` |

(IMPORTANT HUMAN FEEDBACK FOR LATER ASSESSMENT: Attack and Anomaly should theoretically have `atk`=2 in their baseline scaling, and Rupture should theoretically have `atk`=1. This may be directly modeled in the code rather than through scaling definitions. Needs review.)


Plus, for any DPS: implicit `ultimates` (skipped for subdps — see below), a small implicit
`quick-assists`, and implicit `recovery` scaled off `damage.totalize` if present.

Note that Baseline *Affinity* uses a separate resolver (`resolveBaselineWeight`) with its own
defaults — e.g. armorers get elevated CR weight there. Don't conflate the two paths.

Two `scaling` keys are meta-flags rather than game mechanics:

* `scaling.buffs` (0–3) — how badly this unit suffers when its own buffs/debuffs go unconsumed. Not every buff provider is equally dependent on landing: SAnby without aftershock consumers is significantly hindered from reaching her damage ceiling (3); Nangong needs at least one anomaly teammate (2); Promeia's abloom buff is nice but not critical (1); Lycaon's ice debuff is irrelevant to his job as a generic anomaly stunner (0). Defaults come from the unit's **native role tags** — pseudoRole does *not* override:
  support/defense = 3, stun = 2, DPS roles = 0. At 0 the penalty is skipped entirely.
  Only weight-2+ buffs are evaluated; weight-1 entries are assumed to always land.
* `scaling.codependent` (boolean) — consumed by the **pull engine only**, never the scorer.
  See §5.

#### `replaces` and `converts`

* `replaces` (supplier side) — `{ "cost_resource": "provided_resource" }`, read as "replaces
  cost with provided". Providing the resource *costs* the consumer the other one. Dialyn's
  `{ "chains": "ultimates" }` means her free ultimates consume a chain attack, penalizing her pairing with chain-dependent DPS.
* `converts` (consumer side) — `{ "input": "output" }`. The consumer turns one resource into
  another for itself, so a supplier's input provision augments the output's effective supply in both
  need fulfillment and damage-type scoring. *(Engine support exists; no unit currently uses it.)*

### Boss object

```json
{
  "id": "vesper", "name": "Discordant Solo", "shortName": "Discordant Solo",
  "image": "./assets/bosses/solo.webp",
  "favored": ["Aria", "Sunna", "Nangong"],
  "available": true,
  "mechanics": {
    "weaknesses": ["ether", "wind"], "resistances": ["ice", "fire"],
    "shill": "anomaly", "anti": ["rupture"], "assists": 2,
    "weak": ["veils"], "anomaly:state": "wind",
    "freezable": true, "chainParry": false, "shillIntensity": 2,
    "debuffs": { "cd": 2, "daze": 2 }
  },
  "variations": { "raging": { "enabled": false, "mechanics": { "anti": null } } }
}
```

* `favored` — named units with enhanced bonuses (top-level, not inside `mechanics`)
* `shill` — the role this boss prefers. **DPS shills are a bonus with no penalty for mismatching**
  — teams compete on merit. **Non-DPS shills (stun) are a hard requirement** — no stunner, no score.
  The requirement exists because a stun-shill boss gives you few damage openings: you stun it, and
  the stun multiplier lets you dump a burst into that window. Without a stunner you can't open
  windows reliably, so your damage never lands. **A stunless DPS is exempt** — it holds the stun
  multiplier permanently and bursts without needing a window at all, so it satisfies the stun shill
  by itself and takes the same `+8`. The exemption is stun-specific and requires an actual stunless
  *DPS*; every other stunnerless team is still disqualified.
* `anti` — DPS archetypes disqualified outright
* `weak` — array of mechanic weaknesses (`disorders`, `veils`, `stun`, `abloom`); a boss can have several
* `freezable` — ice anomaly agents get a large bonus; pseudo-anomaly agents get half
* `debuffs.cd` — penalizes CD-scaling DPS when the debuff exceeds the team's CD supply
* `debuffs.daze` — slows daze accumulation, penalizing attack/rupture/armorer DPS proportionally to
  the shortfall. Anomaly DPS are exempt (less window-dependent). Unlike anti-shill this is
  **fully mitigable** by bringing a high-daze stunner.
* `shillIntensity` — amplifies `favored` bonuses; superseded in practice by mechanics-driven scoring
* `variations` — named alternate configurations, shallow-merged onto the base. An explicit `null`
  erases a base property. `enabled: false` hides a variation from the **UI only** — CLI tools ignore
  the flag and will always resolve an explicitly requested variation (`--bosses "butcher:raging"`).

All boss properties are read through accessors (`getBossWeaknesses`, `getBossAnti`, …) so variation
resolution stays transparent.

**Bosses whose mechanics are worth knowing by name:**

| Boss | Why it's interesting |
|----|----|
| **Scorched Horizon** | The wind-`anomaly:state` boss. Team-side reactions suppressed, disorders replaced by vortex, polarity damage gutted, plus a CD debuff. Designed to favour Promeia (pure ice vortex) over Miyabi (frost ≈ 0). |
| **Thrall & Sobek** | `shill: stun` — a hard requirement, not a bonus. No stunner = DQ, *unless* the team fields a stunless DPS (YSG), which bypasses stun windows entirely. |
| **Notorious Dead End Butcher** | `debuffs.daze` — penalizes attack/rupture unless you bring daze. Anomaly teams unaffected. Also `weak: disorders`. |
| **Typhon Slugger** | `assists: 3` — every unit must have `assist:defensive`. |
| **Girtablullu** | `chainParry: true` — the assist requirement cannot be reduced by limited-rotation units. |
| **Sacrifice Bringer** | `freezable` — ice anomaly agents get a large bonus. |
| **Discordant Solo** | `weak: veils` — built around Sunna's ether veil stacking. |
| **Primordial Nightmare / Wandering Hunter / Stagnant Aberrant** | Multiple `anti` entries narrow the field to a single viable archetype. |

Everything else — full weakness/resistance lists, current anti sets — belongs in `bosses.json`, not here.


## 4. The Scoring Engine

### Design premise

The original engine used hardcoded composition rules and named synergies. Nangong broke it: a
hybrid stun/anomaly unit can't be described by archetype-level rules. The engine was rebuilt so that
scoring **emerges from pairwise mechanical interactions** rather than template matching. The guiding
constraint is: *a mechanic's existence has no value; points are only awarded when something consumes
it.* The exception is foundational stats (ATK/CR/CD), which have automatic role-gated value because
every DPS intrinsically benefits from them.

### Pipeline

`scoreTeamForBoss` starts from a base score, resolves activated roles and conditional damage against
the team, then runs:

| Layer | What it does |
|----|----|
| **L1 Disqualifications** | Hard failures returning −1. Deliberately narrow: illegal `join` arrangement, no DPS, three *pure* DPS, a DPS whose tag matches boss `anti`, a DPS whose element is resisted, too few reliable defensive assists. `synergy.avoid` is checked alongside. |
| **L1.5 Structure** | Classifies the composition (anomaly hypercarry, double armorer, rupture + stun + support, …) into conventional / unconventional-viable / no-interaction / wildly-unconventional. Feeds the teamwork multiplier — **it is not added to the score**. Also scores field-time economy. |
| **L2 Inherent Quality** | Individual power independent of team context: tier and rank. DPS at full weight; support/defense/stun at reduced weight **gated by buff utilization**. Titled bonus. Totalize stun-demand penalty. Wasted-DPS-buff penalty. |
| **L3 Boss Matchup** | Shill, favored units, `weak` mechanics, element weakness/resistance, boss debuffs, assist bonus. Also where a **missing non-DPS shill disqualifies** (a stunless DPS exempts a stunnerless team from the stun shill). |
| **L4 Mechanical Synergy** | The core. Directional pairwise evaluation of every ordered teammate pair, plus team-level reaction bonuses. |
| **L5 Additional Synergies** | Hand-curated `synergy.units` / `synergy.tags`. Low-weighted; a fallback for what mechanics can't express. |

Final score = `raw × teamworkMultiplier`.

**Field-time economy:** one on-field agent is a bonus (efficient solo carry), two is neutral, three
or more is a penalty (field competition), zero is a penalty (no primary damage dealer).

### L4 components

Per ordered (supplier → consumer) pair:

* **Baseline Affinity** — broad stat interactions: ATK/CR/CD to attackers, anomaly buffs to anomaly
  agents, DEF buffs to DEF scalers, defense/element debuffs to damage contributors, stun
  infrastructure to window-dependent DPS.
* **Need Fulfillment** — the supplier provides something the consumer explicitly *scales* with.
  The highest-value category, and where `replaces`/`converts` apply.
* **Stun Emergence** — the consumer has burst damage that benefits from the supplier's stun infrastructure.

Then, team-wide: anomaly reaction bonuses (vortex/disorder per agent), Refringe and its cascades,
Maim, anomaly-quantity scaling, diametric synergy, an on/off-element L4 modifier, and the conditional
under-activation penalty. The total passes through a **hyperbolic soft cap** — low scores pass
through untouched, high scores compress — which preserves mid-range differentiation while preventing
runaway mechanical stacking.

Principles that govern L4 scoring:

* **Scarcity determines value.** Foundational stats (ATK/CR/CD) are replaceable through equipment
  and score low. Specialist mechanics (veils, chains, aftershock, abloom) are irreplaceable and score
  high. A rare mechanic matching a consumer's scaling always beats a common stat buff, all else equal.
* **Supply gates fulfillment,** and **undersupply is worse than linear.** Partially meeting a need
  (Lucia's `veils:1` against YSG's `veils:2`) helps, but disproportionately less than half.
* **Ultimates are a limited primary-DPS resource.** Only one unit gets the free ultimate per window,
  so it goes to the best damage dealer — subdps units get **no** implicit ultimate scaling. Quick
  assists are *not* limited and benefit everyone including subdps. Ultimate provision is also scaled
  by the consumer's burst potential: a free ultimate is worth far more to Evelyn than to a unit with
  a basic one.
* **Ultimates and chains are naturally available.** A dedicated provider makes them arrive *faster*,
  which is correctly rewarded — but lacking one is not a cohesion failure.
* **Self-provision excludes a need from cohesion.** Banyue both scales with and provides
  interrupt-resistance, so it never counts as unmet. This differs from damage mechanics like
  aftershock or abloom, where a large part of the ceiling is damage dealt *by buffed teammates*.
* **Scaling comes in three flavours.** *Direct* — scaling matches an existing damage type, so feeding
  it leverages a high multiplier (Evelyn: `scaling.chains` + `damage.chain`). *Transformative* —
  scaling feeds a conversion into something else, and missing it leaves the unit far below its ceiling
  (Miyabi: disorders → enhanced attacks). *Constant* — steady passive amplification, where a buff
  pays twice (Alice/Vivian convert AM into AP, making AM buffs doubly valuable).

### Diametric synergy

When two *different* suppliers contribute through complementary dimensions, the in-game effect is
multiplicative. The engine recognizes two diametric pairs:

* an ATK-or-CD buff from one supplier + a defense debuff from another
* a same-element buff + a same-element debuff (Soukaku's `buffs.ice` + Lycaon's `debuffs.ice`)

A sufficiently strong pair establishes a **cohesion floor** the team cannot drop below, scaling with
the weights of both halves. Defense-debuff diametrics are **suppressed on anti-rupture bosses**,
where the debuff can't be fully exploited.

### Teamwork multiplier

`structureFactor × f(cohesion)`, where `f` maps cohesion onto a floored range so a bad team is
crushed but never zeroed.

**Structure factor** comes from the L1.5 classification. One important override: a team classified
*conventional* is **downgraded** if any support-like member's buff utilization falls below half — a
conventional shape staffed by a mismatched support isn't really conventional.

**Cohesion** is a weighted geometric mean of per-unit buff utilization. Non-DPS units enter squared
and at full weight; DPS enter unsquared at half weight. The geometric mean is the point: one badly
mismatched member drags the whole team down multiplicatively rather than being averaged away.

What feeds utilization (`computeBuffUtilization`):

* **Wasting buffs = wasting DPS potential.** When a DPS provides buffs (SAnby's aftershock, Cissia's
  electric debuff) and no teammate consumes them, that DPS was fielded on the wrong team.
  Severity is controlled by `scaling.buffs`.
* **Buff utilization gates support quality.** A support's tier and rank only matter to the extent
  their buffs are actually used, with squared gating in L2 — a support at 30% utilization keeps
  roughly 9% of their quality bonus.
* **Whiffed directional buffs** (`sheer` with no rupture consumer, `cd` on an all-armorer team) take
  a direct cohesion hit beyond the ratio effect, because the absolute-supply path would otherwise
  mask a wasted specialist buff.
* **Armorer CR dependency** — an armorer with no CR supplier takes a dedicated hit.
* **DPS reception** — a DPS with no buff contributions of its own is instead checked on what fraction
  of its scaling needs the team meets. This is what penalizes "duo + deadweight" teams.
* **Wasted vortex** — a wind anomaly subdps whose vortex generation has no beneficiary (no native
  primary anomaly DPS with a meaningful vortex tier) counts as an unmet need. Velina + Miyabi is
  penalized because frost gains nothing; Velina + Promeia is not. This deliberately ignores
  *pseudo*-anomaly roles — only units natively tagged `anomaly` count as the primary here.
* **Dual-anomaly teams are inherently cohesive** — a primary anomaly DPS plus an off-field anomaly
  subdps of a different element takes no penalty for the subdps "not providing buffs".
* **Damage buffs on pure support/defense are irrelevant** — offensive buffs landing on a non-damage
  contributor don't count, and a support's matching element does not inflate a supplier's utilization.
  SubDPS units are *always* damage contributors even with a support pseudo-role.

### Role activation ripple effects

Activated roles are computed once per team and cached (`_activatedRoles`), then cleaned up. Because
a pseudo-role *is* a role, activation ripples across every layer:

* **L1** — only "pure DPS" (no concurrent support/defense/stun role) count toward the triple-DPS DQ.
  The `anti` check reads base **tags**, not effective roles.
* **L1.5** — stun units are excluded from DPS category counts to prevent double-classification;
  Nangong is counted as a stunner, not a second anomaly.
* **L2** — units are scored in one category only; a unit scored in the DPS loop is excluded from the
  non-DPS loop. Forced-secondary detection excludes stun/support/defense units.
* **L3** — pseudosupports cannot satisfy a DPS shill. A stunless DPS *can* satisfy a stun shill,
  standing in for the stunner the boss would otherwise demand. Element-resistance DQ skips
  support/defense units. A *pseudo*-role matching the boss `anti` is a penalty, not a DQ.

Separately, `isEffectiveSupport` / `isEffectiveDefense` check base tags **and** activated pseudo-roles;
plain `isSupport`/`isDefense` check tags and `_activatedRoles` only. Structure classification,
inherent quality, disqualification and the teamwork multiplier all use the effective wrappers.

### Element resistance and role

* Pure support and defense units are **not disqualified** by element resistance — they contribute
  buffs and utility, not damage. Defense units keep a small on-element bonus (they deal a little
  damage); support units get nothing either way.
* Any support/defense unit with meaningful `damage` still takes a damage-proportional penalty when
  resisted.
* Standard subdps units **are** disqualified when resisted, like any DPS. Only pseudosupports bypass it.

### Lenient mode

For players with limited rosters. Hard violations become steep penalties instead of DQs so teams stay
in the ranking and relative quality remains visible: L1 disqualifications become large penalties,
L2 low-tier penalties shrink, and `synergy.avoid` degrades from DQ to a heavy penalty. The base score
also starts higher.


## 5. The Pull Recommendation Engine

`pull-engine.js` answers a different question — *which unowned unit would most improve this roster?* —
but it reasons over the same mechanics vocabulary, and it imports directly from `team-scorer.js`
(`getEffectiveScaling`, `getEffectiveRoles`, the conditional resolvers) so a data change propagates
to both. The connection is conceptual, not just mechanical: a unit is worth pulling because of the
teams it lets you build, so roster gaps are expressed in the same terms the scorer uses to reward teams.

**Flow:** bucket the roster → score coverage → detect gaps → rank candidates per gap → regroup
gaps into per-unit cards → assign priority → apply codependency gating.

### Coverage

Owned units are bucketed into DPS-by-archetype, subdps, supports, stunners, and by element. Each
bucket's quality is derived from its **best tier** (`tierToQuality`, labeled Elite → Strong → Decent →
Borderline → Weak → Marginal → None). A composite score averages the archetype, support, and stunner
qualities, and drives a **calibration factor** that compresses gap scores for well-developed rosters —
so a player who owns everything isn't told they have five urgent gaps.

Note that only **primary** DPS count toward archetype and element quality: `isSubdps` filters them out,
because owning Vivian doesn't mean you have an ether anomaly carry.

### Gap detectors

Each detector emits a gap with a title, reason, score, and candidate list (drawn from unowned limited
S-ranks): DPS-by-archetype, support, stunner (premium and depth), stunner-element, subdps, anomaly
partner, element coverage, named synergies, mechanical synergies, and a **depth** gap that fires for
titled T0 candidates regardless of archetype quality — recognizing paradigm-shift units that create
entirely new archetypes.

### `mechanicsFitScore`

A lightweight, L4-shaped pairwise heuristic: how well would this supplier serve that DPS? It mirrors
the scorer's relevance rules (rupture/armorer ATK discounts, armorer CR premium with CD excluded,
element buff/debuff matching, need fulfillment, damage-type matching) and resolves conditional buffs
against a conservative two-unit context so narrow and conditional buffs resolve to what *this*
consumer would actually receive.

Two deliberate divergences from the scorer:

* `dmg` is not scored here. It benefits every DPS equally, so it carries no signal for ranking
  *which* support fits a given DPS, and crediting it would drown out specialist synergies.
* **Conditional-buff anti-synergy.** If a consumer's value depends on teammates carrying a specific
  tag (Remielle needing anomaly teammates), a supplier *without* that tag is heavily discounted —
  it's occupying a slot that should go to someone who activates the buff.

Candidate sorting is titled-first, then tier, then accumulated fit against the owned DPS roster.

### Codependency gating (`scaling.codependent`)

Some units are non-functional without specific partners, and recommending them to a roster that can't
support them is actively bad advice. Units flagged `scaling.codependent` (currently Remielle, SAnby,
Ye Shunguong) run a dependency check before surfacing:




1. **Specialist provider check** — does the roster contain a provider for each specialist scaling key?
   Naturally-available keys (`chains`, `ultimates`), foundational stats, and the `buffs` meta-flag are
   skipped, so they never trigger false dependencies.
2. **Conditional buff feasibility** — for team-scoped conditional buffs, compute the best achievable
   level given the roster. At or below half the max, the unit can't function as designed.
3. **Disorder feasibility** — a unit with `scaling.disorders` needs a different-base-element,
   non-wind anomaly (or pseudo-anomaly) partner.
4. **Team formation** — can at least one legal three-person team be built via `getTeams`?

Severity determines the consequence: *cannot form a team* or *cannot activate buffs* → the unit is
**removed from every gap candidate list entirely**, not merely deprioritized, because the gap's
reasoning wouldn't apply. Partial activation → the recommendation drops one priority rank, with a
note naming the missing providers.

### Cards and priority

Gaps are scored, calibrated, and sorted; then the results are **inverted into unit-centric cards**.
Each candidate collects every gap it appears in; its highest-scoring gap becomes its *primary* and
determines which single card it lives in, while the rest surface as "Also:" reasons. This removes all
dedup complexity — a unit appears in exactly one card.

Priority is absolute by default (score thresholds) but switches to **relative** for well-developed
rosters, where calibration compresses everything below the absolute thresholds and the top remaining
gap should still read as the most urgent. A unit accumulating several medium-priority contributions is
promoted, on the theory that broad usefulness beats a single narrow fit.


## 6. Reading Scores

The app's authoritative bands live in `strength-rating.js` (`STRENGTH_TIERS`): **Excellent → Good →
Fair → Tough → Risky**, descending. A team containing an A-rank DPS is capped at *Good* regardless of score.

Interpretively: the top band is a near-optimal matchup; *Good* clears comfortably; *Fair* clears with
skill; *Tough* is difficult even played well; *Risky* is not viable for endgame content. Thresholds
shift whenever the engine is retuned — read them from the file, don't memorize them.

**DPS bucketing** (`dps-buckets.js`) sits downstream of scoring. When optimizing three Deadly Assault
teams, raw top scores cluster around the same DPS with interchangeable supports, so five "options"
that differ by one support are useless. Results are grouped by a DPS *fingerprint* (role + element +
tier band) and one representative is taken per distinct assignment pattern, preferring the
highest-scoring realization. The webapp toggles between this diversity view (default) and raw score order.


## 7. Tooling

All CLI scripts share `lib/cli.js`, so the flag set below is common to them (individual scripts
enable a subset).

| Flag | Short | Purpose |
|----|----|----|
| `--teams` | `-t` | Explicit teams: slash-separated units, comma-separated teams |
| `--bosses` | `-b` | Boss filter, comma-separated, fuzzy-matched (`"butcher:raging"` selects a variation) |
| `--debug` | `-d` | Full layer-by-layer scoring breakdown |
| `--include` | `-i` | Teams must include at least one of these units |
| `--depth` | `-N` | Results per boss (shorthand: `-10`) |
| `--only-mine` | `-m` | Use personal roster from `roster.json` |
| `--preview` | `-p` | Include unreleased (`available: false`) units |
| `--units` / `--exclude` | `-u` / `-x` | Unit whitelist / blacklist |
| `--flex` | `-f` | Universal units that may join any team |
| `--rank` / `--element` | `-R` / `-e` | Filter by rank (S/A) or element |
| `--score` / `--range` | `-s` / `-r` | Minimum raw score / inclusive raw score range |
| `--omit` | `-o` | Suppress headers and context (terse output) |
| `--flat` |    | Emit teams in condensed form, suitable as a `-t` value |
| `--query` | `-q` | Share-URL query string for roster/bosses |
|    | `+Unit` / `-Unit` | Add / remove a unit from the roster override |

`-h` / `--help` on any script prints its actual supported flags.

**Scripts:**

| Script | Purpose |
|----|----|
| `matchups.js` | Top teams per boss. The main diagnostic. Adds a synthetic neutral boss for baseline comparison. |
| `compositions.js` | Pivot of matchups: top teams per *agent*, with the bosses they excel against |
| `deadly-assault.js` | Three-boss allocation with no unit overlap |
| `teams.js` | Valid team enumeration (join conditions only, no scoring) |
| `pull-debug.js` | Runs the pull recommendation engine from the CLI |
| `pulled.js` / `tiers.js` | Roster by mindscape/weapon; units by tier |
| `scoring-diff.js` | Diffs two saved score dumps and highlights what actually changed |
| `test-scoring.mjs` | Scorer assertion suite |
| `test-recommendations.mjs` | Pull engine assertion suite |
| `reformat-units.mjs` | Normalizes `units.json` formatting |

**Typical debugging loop:**

```bash
node matchups -t "Nangong/Aria/Sunna,Aria/Burnice/Sunna" -b Priest --debug
```

Then widen to the full landscape for a unit, and confirm nothing else regressed:

```bash
node matchups -i Miyabi -b Butcher -10
```

```bash
node test-scoring.mjs && node test-recommendations.mjs
```

> **Debug-mode caveat:** lumen morph search is **skipped when** `--debug` is set. Normal scoring tries
> every Attribute Mutation target and keeps the best; the debug path scores one un-morphed pass so the
> trace stays readable. A debug score for a lumen team will therefore not match its real score.

For a full-landscape review, dump scores to a file and diff against a previous dump with
`scoring-diff.js`. (There is no committed baseline file — generate one before a change and compare after.)

**Test conventions:** each case is a `run('TEST N: description', () => { … })` block; build teams with
`scoreForTeamString`, filter bosses with `withBosses`, look up scores with `scoreMapForBoss`, and assert
with `assert(condition, message)`. Failure messages should embed actual scores — that's what makes a
regression diagnosable. Test numbers are sequential; when engine retuning forces a threshold change,
update it and note why in the comment block.


## 8. Known Issues and Dead Mechanics

Kept deliberately — these are things that look wrong when you read the code, and are.

* **Armorer ATK efficiency disagrees between engines.** The scorer treats it as zero — ATK is worthless
  to armorers. `mechanicsFitScore` in the pull engine still applies a partial multiplier, so pull
  recommendations credit ATK supports for armorers that the scorer would not.
* `converts` is implemented but unused. No unit in `units.json` declares it. It was built for Norma (quick-assists → chain attacks) but her unit was changed last minute to upgrade a teammate rather than herself. It is retained for potential future agents that may need it.
* `utility["gash-build"]` is implemented but unused. Built for Claret, whose kit is currently `mechanics: {}`. Her kit is still in early beta and armorer mechanics are still undergoing many changes.
* `shillIntensity` is effectively retired, superseded by mechanics-driven scoring. Still read by
  `getBossShillIntensity` and still amplifies `favored` bonuses where set. Retained for potential future use as a lever that can be activated if necessary.
* **The** `"shared"` field-time model is dead code, retained for possible future use. Remielle used it
  before moving to `onfield: false`.
* **No armorer subdps exists yet.** `pull-engine.js` carries a TODO for the bucket and detector that
  will be needed when one ships.


