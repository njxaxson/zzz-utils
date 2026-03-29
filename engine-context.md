# Team Scoring Engine Context

This file provides domain knowledge for the ZZZ team scoring algorithm.
Reference when modifying `app/public/lib/common/team-scorer.js`.

**Important:** `app/public/data/units.json` is the source of truth for tier rankings.
This file captures gameplay mechanics and algorithm design decisions only. Also, although this document outlines some actual scoring numbers, this documenty exists for conceptual background purposes and is not intended to cover implementation details. So therefore any scoring numbers are simply illustrative and may actually differ in the latest implementation of the algorithm.


---

## Unit/Character Guidelines

Units range from M0W0 to M6W5.

M0 means that the basic character is available to the player, because the player pulled the unit from gacha. Every additional pull adds a mindscape. M1, M2, M4, and M6 are unique for each unit and add additional abilities, capabilities, or increase unit stats. M3 and M5 are the same across all characters; both mindscapes increase all of the unit's skill levels by 2. In practice, M6 units are considerably upgraded by comparison to M0, and M6 S-ranks are typically only available to those who invest lots of money into the game. For many limited DPS units, M2 is already a very substantial increase: for example, Miyabi at M0/M1 typically relies on other units to create disorders so that she can build up her resources for an extra-powerful attack. At M2+, Miyabi already generates these resources on her own, making her less reliant on teammates and making her able to produce these high-caliber attacks more frequently.

W0 means that a unit is not using their signature weapon and is instead using an alternate, typically less ideal weapon. W1 means that the unit is equipped with their signature weapon, which usually helps maximize their efficiency with bonus stats or buffs. For primary DPS agents, a signature weapon is often essential to prevent the unit from feeling hamstrung - for most DPS agents, this can be as much as a 20% difference. There are a handful of agents where this is less critical (for example, Yanagi can successfully use Grace's signature weapon instead to great effect; Ye Shunguong can do great with Soldier 11's signature weapon; and Soldier 11 actually prefers to use Evelyn's signature weapon), but for the most part DPS agents want their signature weapon.

Weapons can be overclocked up to 4 times, maximizing at W5. However, for the most part, while the bump from W0 to W1 is significant, the jumps to W2-W5 are typically only minor stat increases on the weapon; and for limited S-rank weapons, considered diminishing returns. For non-DPS characters, even a single signature weapon (W1) may be a luxury not worth investing in. Only players who spend a lot of money typically consider increasing a limited S-rank weapon past W1.

For our part, the scoring guidelines here generally assume the use of either M0W0 or M0W1 S-rank units, and generally assume M6W5 A-rank units. (A-rank units who are not M6 are generally considered unplayable for endgame content, which is what our team scoring algorithm is concerned with.)

The reason for this is that mindscapes can typically create new gameplay styles that are hard to model, and even harder to recommend because there isn't a way for us to accept mindscape levels as input. Doing so would overcomplicate our algorithms and create analysis paralysis. For example, M2W1 Alice / M2W1 Jane / M2W1 Yuzuha (or higher mindscape/weapon values) is considered one of the best teams in the game across the board, even better than baseline titled unit teams that have Miyabi,Yixuan, or YSG; because their M2 mindscapes create an unusually potent synergy that is not available nor relevant when those mindscapes are not unlocked.  Similarly, an M6W1 Miyabi can even steamroll content explicitly designed against her; such as The Defiler, who is both anti-ice and anti-anomaly. An M2W1 Yixuan can fully defeat Discordant Solo, who is anti-rupture; and so on.

For this reason, the scoring algorithm generally assumes that S-rank DPS units are M0W1, non-DPS S-rank units are M0W0, and A-rank units are M6W5 (since their mindscapes and weapons are considerably more common and thus easier to fully unlock). Therefore, the scoring algorithm should always operate under these MxWy assumptions. **Open question:** Whether stun units should be modeled at M0W0 or M0W1 is undecided; for some stunners (e.g. Nangong, Trigger) not having their signature weapon is a real handicap, but this is not uniformly true for all stunners.

Some units also support "Potential Sillouhettes", which is an additional set of buffs that characters can undergo once a player has at least that unit in their roster (i.e. at least M0). This is denoted as MxWyPz, with P ranging from P0 (no potential sillouhettes) to P6 (maximum level). P1 and P2 typically add new capabilities to the unit; P3-P6 tend to be raw stat increases. Unlike mindscapes, potential sillohettes tend to be less impactful and, for the most part, tend to re-align units with their intended tier as the game's mechanics widen. For some few characters (e.g. SAnby), unlocking P6 is actually very significant; for others (e.g. Grace) unlocking P6 does little to help them. For characters that DO have potential sillouhettes available - most do not - then the scoring algorithm assumes that they are fully unlocked to P6. For example, M0W0P0 Harumasa is very difficult to succeed with in endgame content, but M0W0P6 Harumasa can still do well against certain bosses like UCC and Typhon.

### Additional Abilities (`join`)

Each unit in ZZZ has an "Additional Ability" that only activates when certain teammates are present on the team. The game hardcodes which teammate tags activate each unit's ability; this is represented by the `join` array in `units.json`. For example, Miyabi's `join: ["support", "section6"]` means her additional ability only activates if a teammate has the `support` or `section6` tag. Even if Miyabi would benefit from a stunner or from Zhao's buffs, neither a stunner nor Zhao (a defense unit) satisfies her `join` condition — so her additional ability stays locked.

For most characters, this additional ability makes a substantial difference in their effectiveness. The team-builder uses `join` as a hard prerequisite: a team can only be formed if every unit's `join` condition is satisfied by at least one teammate. This filtering happens *before* scoring — invalid team formations are never scored at all.

A small number of "flex" units provide enough value even without their additional ability activated. Nicole is the clearest example: her 40% defense debuff is massive regardless of whether her additional ability triggers. Lucy is another case where the additional ability is often not critical. But these are exceptions — for the vast majority of units, a team that doesn't satisfy their `join` is not viable.

### Defensive Assists

When an enemy attack is telegraphed with a gold flash, the player can switch in a teammate to respond. The incoming character's assist type determines what happens:

* **Evasive assist:** The character dodges the attack, triggering "Vital View" — a slow-motion window where the enemy is vulnerable to rapid attacks.
* **Defensive assist:** The character blocks the incoming attack, with each block inflicting daze on the enemy (building toward a stun).

The game heavily favors defensive assists in endgame content, and some bosses explicitly require them. Each boss has an `assists` field indicating how many defensive assist units the team must have. If the team doesn't meet the requirement, it is disqualified. For example, Typhon Slugger requires 3 defensive assists (the entire team), while The Defiler and Wandering Hunter require 2. Most bosses have no assist requirement (`assists: 0`). Each unit carries either `assist:defensive` or `assist:evasive` in their tags.

## Scoring Philosophy

### Core Principles


1. **DPS Quality Dominates** - The DPS unit's tier matters MORE than support tier. A T0 support with T3 DPS produces mediocre results. Support tier is weighted at \~35% of DPS tier.
2. **Objective Scoring** - Team scoring operates in a vacuum: given three units + boss, return an objective score. Same team = same score for everyone. Roster-specific optimization happens elsewhere.
3. **Supports Enhance, Not Break** - An uncohesive support misses damage potential but doesn't ruin the team. Mismatched supports are "dead weight" (0 contribution), not penalties.

### Priority Order


1. On-element + On-shill = Best
2. On-element + Off-shill = Competitive (especially titled units)
3. Off-element + On-shill = Viable but suboptimal
4. Off-element + Off-shill = Bad
5. Resisted element or Anti-archetype = Disqualified (-1)

### Titled Unit Advantage

Titled units (units with `"title"` tag) are significantly stronger than other T0 units:

* Can partially overcome element mismatches through raw power
* Get reduced off-element penalties (50% reduction)
* Compete with shill-matching teams when on-element

### Neutral Boss Handling

When boss has no weaknesses (neutral):

* NO element bonuses are given
* Teams compete purely on tier and composition quality
* Anomaly teams don't get "all on-element" treatment

### DPS vs Non-DPS Shills

Boss shills fall into two categories with fundamentally different behavior:

* **DPS shills** (attack, anomaly, rupture): These are *preferences*. A team that matches the shill gets a bonus; a team that doesn't match receives a penalty proportional to how far off they are. But a mismatched team is not automatically disqualified — it can still compete if it has strong on-element DPS or titled units.
* **Non-DPS shills** (stun): These are *hard requirements*. If the boss shills a non-DPS role and no unit on the team has that role, the team is disqualified outright. The reasoning is that these bosses have mechanics that make the shilled role essential to completing the fight.

### Shill Intensity

Not all boss shills are created equal. Some bosses have fight mechanics that make
their shill dramatically more impactful than the standard bonuses and penalties suggest.

**Boss-side parameter:** `shillIntensity` (default: 1, implicit for most bosses)

**Current effect:** Amplifies the favored unit bonus. At intensity 2, each favored
unit is worth significantly more than the default bonus. This captures boss-specific
mechanics (like Discordant Solo's Ether Veil stacking) that make certain units
disproportionately valuable against specific bosses.

**Diminishing returns:** When multiple favored units appear on the same team at high
shill intensity, the compounding should not be too aggressive. The first favored unit
gets the full amplified bonus; additional favored units receive a reduced multiplier
to prevent runaway score inflation.

**Future extensibility:** The parameter is designed to also support amplifying the
shill match/mismatch penalties in the future, but currently only affects
favored bonuses.

**Bosses with non-default shill intensity:**

* **Discordant Solo** (`shillIntensity: 2`): Sunna's Ether Veil stacking mechanic
  makes her irreplaceable (see Boss-Specific Knowledge below)
* **Sacrifice Bringer** (`shillIntensity: 2`): This boss is one of the few that is
  vulnerable to the Freeze status effect, so as an ice-anomaly unit Miyabi can easily
  paralyze this boss (literally) and prevent them from acting. This makes the fight
  trivial when using Miyabi.

### Lenient Mode

The scoring algorithm supports a "lenient" mode designed for players with limited rosters — typically newer players who may have very few S-ranks or who simply cannot build ideal team compositions with what they have. In lenient mode, the algorithm avoids disqualifying teams that would normally be invalid, instead applying heavy penalties to produce a ranking of "least awful" options. The idea is that a player with no better choices still needs to know which of their suboptimal teams is the least suboptimal.

In strict (default) mode, violations like solo non-titled anomaly or stunless attack teams result in hard disqualification. In lenient mode, these same violations become steep score reductions, keeping the teams in the ranking so the player can still see their relative quality.

### Titled T0 "Brute Force" Principle

Titled T0 units (YSG, Yixuan, Miyabi) are powerful enough to overcome most
disadvantages unless there is an explicit resistance. They can "brute force" fights
that aren't specifically designed to counter them. For example, against Discordant
Solo, Yixuan is knocked out by anti-rupture and Miyabi by ice resistance, but YSG
(physical) can still compete despite being off-element and off-shill purely through
raw power.


---

## Team Composition Patterns

### Attack Teams

**Standard:** stun + attacker + support/defense

**Key Rules:**

* Attack teams NEED a stunner (creates damage windows)
* Double attacker is bad unless one has `subdps` synergy tag
* Stunless exception: Units with `synergy.tags.includes("stunless")` can skip stunner

**Stunless Composition (YSG):**
YSG has a unique "stunless" tag because she gets stun damage multipliers FOR FREE (200% built-in). This means:

* She doesn't need a stunner to deal maximum damage
* Double-support composition (YSG + 2 supports) is her ideal setup
* The algorithm gives +40 for double support with stunless attacker
* Having a stunner with YSG is actually suboptimal (-10 penalty)

**Why Double Support Works for YSG:**

* Her +240% crit damage with guaranteed crits
* Built-in stun multiplier (no stunner needed)
* Double buff (\~45% ATK boost) pumped through her multipliers = massive damage

**Dialyn Exception:** The only stunner that helps YSG is Dialyn, who provides FREE ULTIMATE attacks. YSG has a double-ultimate (both highest-damage attacks in game). This creates comparable output to ideal Miyabi/Yixuan teams.

### Rupture Teams

**Standard:** stun + rupture + support/defense
**Alternative:** rupture + 2x support/defense (S-rank only)

**Key Rules:**

* A-rank rupture REQUIRES stunner (unless boss shills rupture)
* S-rank rupture can use double-support composition
* Synergistic stunners (Dialyn, Ju Fufu with `synergy.tags.includes("rupture")`) get +20 bonus
* Non-synergistic stunners get -20 penalty on rupture teams

**Important:** Rupture deals Sheer damage which IGNORES enemy defense. Nicole's 40% defense debuff is literally useless for rupture - she's disqualified via `synergy.avoid: ["rupture"]`.

### Anomaly Teams

> **Note:** This section describes the current engine's anomaly composition rules.
> These rules are being rethought as part of a planned refactoring — see
> "Stunner-Anomaly Paradigm Shift" and "Planned Architecture" sections below.

**Ideal:** double anomaly + specialist support (Yuzuha)
**Valid:** titled anomaly + support/defense + (stun OR explicit synergy partner)
**Valid:** stun-synergy anomaly + stunner + support
**Valid:** anomaly/support/support (with explicit synergy - see below)
**Valid:** anomaly-compatible stunner + anomaly DPS + support (Nangong pattern — see Paradigm Shift)

**Key Rules:**

* Solo non-titled anomaly without stun synergy = DISQUALIFIED
* Anomaly teams prefer support/defense over stun (minor penalty for stunner)
  * EXCEPTION: Monoshock compositions can use stunner without penalty (all three must be same element)
* Double anomaly should have different elements (+20) not same element (-15)
* Titled anomaly can solo with support if on-element

**Stun-Synergy Anomaly Pattern:**
Some anomaly units have `synergy.tags.includes("stun")` (e.g., Aria). These units:

* Can work in stun/anomaly/support compositions (like attack teams)
* Do NOT receive the normal stunner penalty
* Can also use explicit unit synergy to enable double-support (e.g., Aria/Sunna/Yuzuha)
* Score lower than titled anomaly due to tier difference, not the mechanic
* **Important:** When stun-synergy anomaly compositions qualify (via stunner OR
  explicit unit synergy), they should ALSO qualify for the full anomaly composition
  bonuses (base comp bonus, support bonus, etc.) - i.e., they should be treated as
  a valid anomaly comp, not just "not disqualified."

**Anomaly/Support/Support Pattern (Explicit Synergy):**
Any non-subdps anomaly unit that has an explicit synergy partner on the team can
use the anomaly/support/support composition pattern. This generalizes the Aria
pattern to any anomaly DPS with named synergy connections.

* Valid: Aria/Sunna/Yuzuha (Aria ↔ Sunna mutual synergy enables this)
* Invalid: Alice/Astra/Yuzuha (Alice has no explicit synergy.units → cannot use
  this pattern; Alice must use double-anomaly comp instead)
* Invalid: Vivian/Astra/Nicole (subdps cannot carry as primary DPS)
* Invalid: Burnice/Lucy/Caesar (subdps cannot carry)
* Invalid: Grace/Rina/Astra (subdps cannot carry)
* The explicit synergy requirement prevents every anomaly unit from using this
  pattern; only those with genuine named partnerships qualify

### Invalid Compositions

* Attack + Rupture mixing = Disqualified (-999)
* Attack + Anomaly without synergy = Disqualified
* Anomaly + Rupture mixing = Disqualified
* 3+ DPS units = Disqualified
* 0 DPS units = Disqualified


---

## Special Unit Mechanics

### Units with Unique Playstyles

**YSG (Ye Shunguong)** - Stunless Attacker

* Has `synergy.tags: ["stunless"]` - doesn't need stunner
* Mutual synergy with Zhao (both list each other)
* Mutual synergy with Sunna (via Sunna listing YSG)
* Ideal teams: YSG/Zhao/Sunna or Dialyn/YSG/Sunna

**Harumasa** - Monoshock Composition

* Has `synergy.tags: ["anomaly"]`
* Monoshock requires ALL THREE team members to share the same element
* Valid: Grace/Harumasa/Rina (all electric), Trigger/Yanagi/Harumasa (all electric)
* Invalid: Yanagi/Harumasa/Astra (Astra is ether, not electric)
* Two composition patterns (both require same-element third):
  * Stun/Anomaly/Attack (e.g., Trigger/Grace/Harumasa) - stunner provides damage windows, anomaly as pseudo-support (+56 bonus)
  * Anomaly/Attack/Support (e.g., Grace/Harumasa/Rina) - support enhances both DPS units, better for hybridization due to element synergy
* The "monoshock" composition is actually a generic rule that can apply to other elements, for example a fire attacker with an anomaly synergy can be paired with a fire anomaly agent and either a fire stun or fire support/defense unit. It just so happens that Harumasa is the only attacker who currently supports hybrid attack+anomaly teams, so the principle example is an electric team; hence the nomenclature.

**Hugo** - Stun-Synergy Attacker

* Has `synergy.tags: ["stun"]`
* NEEDS two stunners for optimal play
* Single stunner is suboptimal (-30)
* Double stun with Hugo gets +70 (compensates for missing support)

**Aria** - Stun-Synergy Anomaly (AoD Faction)

* Has `synergy.tags: ["stun"]` despite being anomaly
* Enables stun/anomaly/support compositions
* Mutual synergy with Sunna (both list each other)
* Valid: Stun/Aria/Astra, Aria/Sunna/Yuzuha
* Invalid: Aria/Astra/Nicole (no stun, no explicit synergy)
* **Unique playstyle:** Aria plays like an attacker despite being anomaly - she wants
  stun windows to unload powerful attacks, rather than relying on disorder reactions
  like most anomaly units. Her stun-synergy tag reflects this attacker-like playstyle.
* With Nangong Yu now released, Aria's best-in-slot team is **Nangong/Aria/Sunna**
  (stun/anomaly/support — the standard stun-synergy anomaly pattern). Aria/Sunna/Yuzuha
  remains a very strong alternative.

**Nangong Yu** - Anomaly-Compatible Stunner (AoD Faction)

* T0 hybrid stun/anomaly unit; classified as stunner but functions as pseudo-anomaly
* At M0W1: massive anomaly buffs, stun window extension, polarity disorder triggers
  during stuns
* Replaces Vivian as Miyabi's best-in-class teammate
* Best teams: Nangong/Aria/Sunna, Nangong/Miyabi/Yuzuha, Nangong/Alice/Yuzuha
* Nangong/Vivian/Yuzuha viable for ether-weak anomaly bosses (unique edge case where
  Nangong's buffs elevate subdps Vivian to functional primary DPS)
* Also produces Abloom damage, sharing this mechanic with Vivian, Aria, and Promeia
* Nangong+Sunna wheelchair: pairs with virtually any attack or anomaly DPS whose
  `join` includes stun or support
* **Key distinction from generic stunners:** Nangong actively engages with anomaly
  mechanics (disorder triggers, anomaly buffs) rather than just providing stun windows.
  This is what makes her superior to a second anomaly DPS for most anomaly teams.
* See "Stunner-Anomaly Paradigm Shift" section for broader impact

**Lycaon** - Anomaly-Compatible Stunner (via Potential Silhouette)

* At P0: standard ice stunner for Victoria Housekeeping and ice teams
* At P1+: `join` expands to include anomaly agents, making him a valid stunner for
  anomaly teams
* His ice defense shred benefits any ice DPS regardless of archetype (attack, anomaly,
  rupture), but is particularly valuable for Miyabi and Promeia (ice anomaly agents)
* Not at Nangong's level of anomaly engagement — Lycaon provides standard stun windows
  plus ice-specific defense shred, but does not trigger disorders or provide anomaly buffs
* Represents the game's pattern of using potential silhouettes to retroactively expand
  older units' team compatibility (future stunners may receive similar anomaly unlocks)
* Lycaon/Miyabi/Yuzuha is a strong team (weaker than Nangong/Miyabi/Yuzuha but
  historically proven due to Lycaon's ice defense shred)

**Seed** - Requires Second Attacker

* Has `synergy.tags: ["attack"]` and `join: ["attack"]`
* Best paired with Orphie (mutual synergy)
* Cannot function without another attacker on team

### Subdps Units

Units with `synergy.tags.includes("subdps")` need a MAIN DPS teammate (any DPS without subdps tag):

* **Burnice** - Fire anomaly subdps
* **Grace** - Electric anomaly subdps
* **Vivian** - Ether anomaly subdps (T0.5; dropped from T0 after Nangong's release largely replaced her role as Miyabi's partner)
* **Orphie** - Fire attack subdps (acts as support for other attackers)

When subdps attacker (Orphie) pairs with another attacker, the subdps gets 50% tier multiplier.

### Support Classification

**Specialists** (exactly ONE DPS role in synergy.tags, other TWO in avoid):

* **Lucia** - Rupture specialist (+1200 Sheer)
* **Yuzuha** - Anomaly specialist (multi-element synergy)
* **Pan Yinhu** - Rupture specialist (+720 Sheer, A-rank)

**Conditional/Partial Supports:**

* **Zhao** - YSG specialist via mutual synergy; good generalist for attack/anomaly; BAD for rupture (avoid tag)
* **Nicole** - 40% defense debuff (huge); BAD for rupture (defense debuff useless); ether synergy with Vivian. **Known issue (future work):** Nicole's defense debuff is less valuable against bosses with already-low defense (e.g., anti-rupture bosses like Primordial Nightmare and Discordant Solo). The algorithm currently has no mechanism to express this; needs a new boss-side property (e.g., `lowDefense`) and a unit-side tag to reduce her contribution on such fights.
* **Sunna** - YSG/Aria/Nangong specialist via mutual synergy; BAD for rupture (avoid tag). Also has unique Ether Veil mechanics that make her irreplaceable against certain bosses (see Boss-Specific Knowledge). Forms the Nangong+Sunna wheelchair pair for attack/anomaly teams.
* **Rina** - Electric specialist; defense penetration generally useful for attack and anomaly teams; useless for rupture. Relatively high ultimate damage for a support unit.
* **Soukaku** - Ice specialist ONLY; useless without ice DPS. Very high anomaly buildup for a support unit; is practically a pseudo-anomaly unit. Uniquely synergistic with Miyabi because Soukaku's Ice anomaly and Miyabi's Frost variant track separately, triggering disorder reactions when they collide (see Element Variants section).

**Universal Generalists:**

* **Astra** - Best all-around (+1200 ATK); default "if no specialist"
* **Caesar** - Medium ATK buff; helps Banyue prevent combo interruption
* **Lucy** - Small ATK buff (+600); slight fire synergy

**Note:** Attack archetype has no true specialist. T0 generalists (Astra) serve as de-facto specialists for attack teams and receive the +35 specialist bonus.

**Favored Support Contribution (High Shill Intensity):**
On bosses with `shillIntensity > 1`, a support that is boss-favored AND synergizes
with the team's DPS archetype should receive an enhanced support contribution bonus
(pseudo-specialist for that fight). This captures fight-specific mechanics where a
support is uniquely valuable against a particular boss without changing their global
specialist classification. For example, Sunna isn't a global anomaly specialist (she
also synergizes with attack), but against Discordant Solo she IS the fight-specialist
due to Ether Veil stacking.


---

## Faction Synergy Notes

Some factions are built to be internally synergistic; others are not. This affects
how mutual synergy and team construction should be evaluated.

**Highly Synergistic Factions:**

* **Angels of Delusion (AoD)** - The most explicitly synergistic faction. Members
  (Aria, Sunna, Nangong Yu) strongly prefer being with each other. The faction is
  designed around a new approach to anomaly team construction where Aria and other
  anomaly agents can use stunner-based compositions rather than requiring double-anomaly.
  Nangong Yu completes the stun/anomaly/support archetype for AoD and has become a
  meta-defining unit (see Stunner-Anomaly Paradigm Shift section).
* **Obol** - Synergistic (Seed/Orphie mutual synergy, Trigger integration)
* **Section 6** - Originally built to be very synergistic
* **Pubsec** - Originally built to be very synergistic

**Anti-Synergistic Factions:**

* **Mockingbird** - Hugo and Vivian don't help each other at all

**Nangong Yu (AoD — Released):**

* T0 ether stunner; hybrid stun/anomaly unit (pseudo-anomaly, similar to how Soukaku
  is classified as support but functions as a pseudo-anomaly unit)
* Best-in-slot: Nangong/Aria/Sunna (stun/anomaly/support)
* Has become Miyabi's best teammate, replacing Vivian in the top anomaly team slot
* Nangong+Sunna serves as a powerful "wheelchair" stunner+support duo for both
  attack and anomaly DPS agents (see Wheelchair Compositions section)
* At M0W1: provides massive anomaly buffs, extends stun windows, triggers polarity
  disorders during stuns — giving disorder-dependent agents like Miyabi constant fuel
  for multiple chains of enhanced attacks during a single stun window
* Nangong/Vivian/Yuzuha is viable for ether-weak anomaly bosses despite Vivian being
  subdps, because Nangong's anomaly buffs can elevate Vivian to functional primary DPS
* Also produces Abloom damage (see Damage Mechanics Taxonomy)


---

## Boss-Specific Knowledge

### Discordant Solo (Vesper)

* **Weaknesses:** ether | **Resistances:** ice, fire | **Shill:** anomaly | **Anti:** rupture
* **Shill Intensity:** 2 (one of only two bosses with non-default intensity)
* **Favored:** Aria, Sunna, Nangong

**Ether Veil Mechanic:** Several units can create Ether Veils (Lucia, Yidhari, Zhao,
Sunna), but most can only create or extend one at a time - by the time it wears off,
so does the associated debuff. Sunna is unique: she *recreates* the Ether Veil each
time, allowing stacking debuffs that drastically increase Discordant Solo's
vulnerability. This boss fight was designed to require Sunna.

**Team Rankings (target ordering):**

* Best overall: **Nangong/Aria/Sunna** is the clear #1 team
* With Aria (no Nangong): **Aria/Sunna/Yuzuha** is next best
* Without Aria: **Nangong/Alice/Yuzuha** is very strong; then **Alice/Vivian/Sunna** ≈
  **YSG/Sunna/Zhao** (roughly equal, both narrowly ahead of Alice/Vivian/Yuzuha)
* Alice and Yanagi are roughly interchangeable in the anomaly DPS slot (both off-element,
  same tier, neither resisted). Alice is slightly better but the difference is not
  material for scoring purposes.
* Narrowed viable pool: only Discordant Solo and Primordial Nightmare resist two
  elements, making team construction unusually restrictive

**Why Yuzuha alone isn't enough:** Yuzuha is still excellent here (and belongs on the
Aria team), but Sunna's Ether Veil stacking provides boss-specific debuffs that
Yuzuha cannot replicate. The ideal Aria team brings BOTH supports.

### Sacrifice Bringer

* **Weaknesses:** ice | **Resistances:** physical | **Shill:** anomaly
* **Shill Intensity:** 2
* **Favored:** Miyabi

Without Miyabi, this boss is quite difficult. With her the fight is trivially easy
(as explained why earlier in this document). Extra Miyabi-dominance in scoring is
intentional and correct.


---

## Data Structure Reference

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
  "synergy": { "units": ["Sunna", "Nangong"], "tags": ["stun"], "avoid": [] }
}
```

* `id` - Unique identifier for the unit
* `name` - Display name
* `aliases` - (optional) Array of common abbreviations or alternate names (e.g., `"S11"` for Soldier 11, `"YSG"` for Ye Shunguong). Used by CLI tools for fuzzy unit name matching alongside the `id` and `name` fields.
* `image` - URL or relative path to the unit's portrait image (used directly by the UI without modification)
* `rank` - `"S"` or `"A"` (S-rank units are inherently stronger and rarer than A-rank)
* `limited` - Whether the unit is limited (only available during specific gacha banners)
* `tier` - Numeric tier ranking (T0 = best, T4 = worst); source of truth for scoring
* `tags` - Array of role, element, faction, and assist type tags
* `join` - Tags that at least one teammate must have for this unit's additional ability to activate (see Additional Abilities above); also used as a hard prerequisite for team formation
* `available` - (optional, default `true`) When `false`, the unit is unreleased and cannot be selected in the production deployment. Unreleased units are added to `units.json` with preliminary data so the scoring algorithm can be tested against them before their release.
* `synergy` - Synergy configuration object (see below)

### Unit Synergy Object

```json
{
  "units": ["Specific unit names"],
  "tags": ["DPS roles", "elements", "subdps", "stun", "stunless"],
  "avoid": ["DPS roles to avoid"]
}
```

* `synergy.units` - Explicit named synergies (e.g., Evelyn lists Astra)
* `synergy.tags` - What this unit synergizes WITH
* `synergy.avoid` - What this unit should NOT be paired with

### Mutual Synergy

When BOTH units list each other in `synergy.units` (scores are illustrative):

* Base synergy: +5
* DPS mutual bonus: +25 (total +30 for DPS)
* Non-DPS mutual: +5 (total +10)

Current mutual synergy pairs:

* YSG ↔ Zhao
* Aria ↔ Sunna
* Aria ↔ Nangong
* Nangong ↔ Sunna
* Seed ↔ Orphie
* SAnby ↔ Orphie

### Boss Data Object

```json
{
  "id": "vesper",
  "name": "Discordant Solo",
  "image": "./assets/bosses/solo.webp",
  "weaknesses": ["ether"],
  "resistances": ["ice", "fire"],
  "shill": "anomaly",
  "anti": ["rupture"],
  "assists": 0,
  "favored": ["Aria", "Sunna"],
  "shillIntensity": 2,
  "available" : true

}
```

* `image` - URL or relative path to the boss's portrait image (used directly by the UI without modification)
* `shillIntensity` (optional, default 1): Amplifies favored unit bonuses. Higher
  values mean the boss fight is more heavily skewed toward its favored units.
  Currently only affects favored bonus; designed to be extensible to also amplify
  shill match/mismatch penalties in the future.
* `available` - (optional, default `true`) When `false`, the boss is unreleased and cannot be selected in the production deployment. Unreleased bosses are added to `bosses.json` with preliminary data so the scoring algorithm can be tested against them before their release.

### Specialist Detection

```javascript
function isSpecialist(unit) {
  const synergyTags = unit.synergy.tags || [];
  const avoidTags = unit.synergy.avoid || [];
  const dpsTypesInSynergy = DPS_ROLES.filter(r => synergyTags.includes(r));
  const dpsTypesInAvoid = DPS_ROLES.filter(r => avoidTags.includes(r));
  return dpsTypesInSynergy.length === 1 && dpsTypesInAvoid.length === 2;
}
```


---

## Algorithm Path Coverage

Key scenarios that exercise distinct algorithm paths:

### Disqualification Paths

* Boss with `anti:[archetype]` + team has that archetype DPS
* Element resistance on DPS
* 3+ DPS or 0 DPS
* Solo non-titled anomaly (without stun synergy)
* Attack + Rupture mixing
* A-rank rupture without stunner (non-rupture-shill boss)
* Insufficient defensive assists for boss requirement
* Non-DPS shill role missing from team (e.g., no stunner on stun-shill boss)

### Archetype-Specific Paths

* Anomaly composition bonus (double anomaly, element diversity)
* Stun-synergy anomaly exception (Aria pattern)
* Stunless attacker exception (YSG pattern)
* Double-stun justified by stun-synergy DPS (Hugo pattern)
* Monoshock composition with support (Anomaly/Attack/Support - Grace/Harumasa/Rina)
* Monoshock composition with stun (Stun/Anomaly/Attack - Trigger/Grace/Harumasa)
* Synergistic vs non-synergistic stunner on rupture

### Support Contribution Paths

* Matching specialist (+35)
* T0 generalist on attack team (de-facto specialist +35)
* Boss-favored support on high-intensity boss (enhanced contribution, pseudo-specialist)
* Dead weight (avoid tag matches team archetype = 0)
* Regular generalist (+8)

### Synergy Scoring Paths

* Mutual synergy bonus (DPS +30, non-DPS +10)
* Subdps without main DPS (-100, or ignored in lenient)
* Element synergy off-element (no bonus, no penalty)
* Avoid tag triggered by DPS = Disqualified (-999)

### Shill Intensity Paths

* shillIntensity > 1: amplified favored bonus (with diminishing returns for multiple)
* Boss-favored support + synergizes with team archetype + shillIntensity > 1: enhanced contribution

### Tier Scoring

* DPS tier: T0/T0.5 elite (+65/+55), T1/T1.5 good (+25/+20), T2+ penalized
* Support/stun tier: \~35% weight of DPS
* Titled bonus: +20 additional
* Subdps attacker with other attacker: 50% tier multiplier

## DPS Bucketing and Diversity Selection

(This section does not describe the algorithm in team-scorer.js, but rather describes the algorithm in app/public/lib/common/dps-buckets.js, which uses the scores as inputs.)

When optimizing 3 teams for Deadly Assault's 3 bosses, the top results by raw score tend to be near-identical — often the same DPS units with minor support or stunner variations. Showing the player five "options" that only differ by swapping one support for another is not useful.

What matters most to a player choosing DA teams is *which DPS units go where*. A result that assigns Miyabi to Boss 1, YSG to Boss 2, and Harumasa to Boss 3 represents a fundamentally different strategy from one using Alice, Yixuan, and Evelyn — even if both score similarly. Support and stunner variations within the same DPS assignment are less strategically important.

To address this, results are grouped by which type of DPS is assigned to each boss — considering the DPS role, element, and power tier. The algorithm then selects one representative from each distinct DPS assignment pattern, preferring the highest-scoring realization. This surfaces meaningfully different strategic options rather than minor variations of the same strategy.

The webapp provides a toggle between this diversity-aware view (default) and the raw score-sorted view. The diversity view answers "what are my fundamentally different options?", while the variations view answers "what are the absolute best-scoring assignments regardless of redundancy?"


---

## Scoring Results Scale

While not definitive, these boundaries tend to give a rough picture of team quality:

* Teams with a score of 300+ are generally considered ideal; 400+ is great and 500+ is considered best possible matchup
* Teams with a score of 230-299 are generally playable. With skill, these teams can still achieve full clears.
* Teams with a score of 145-230 are suboptimal, but if that's all you've got, then you can make do with what you have. Even with skill, full clears might be difficult.
* Teams under 145 are nigh unplayable in endgame content and are unlikely to even get partial clears.
  These boundary numbers are likely to change as the scoring algorithms change, but for now, it provides a decent background.


---

## Stunner-Anomaly Paradigm Shift

### Historical Context

Anomaly team building in ZZZ traditionally followed a clear pattern: the ideal anomaly
team was **double anomaly + specialist support** (typically Yuzuha). The strongest anomaly
teams looked like `<Primary Anomaly DPS>/Vivian/Yuzuha`, where Vivian served as a subdps
anomaly providing disorder reactions and Yuzuha amplified the team's anomaly output.
Stunners were generally considered suboptimal on anomaly teams because they occupied a
slot that would otherwise go to a second anomaly agent or a specialist support.

Exceptions to this rule were modeled through narrow mechanisms:

* **Stun-synergy anomaly units** (Aria) with `synergy.tags: ["stun"]` could opt into
  stunner-based compositions
* **Titled anomaly units** (Miyabi) could run with a stunner + support instead of
  double anomaly
* **Monoshock compositions** allowed attacker+anomaly hybrid teams with same-element
  stunners

### The Nangong Shift (v2.5+)

The release of Nangong Yu fundamentally changed anomaly team building. As a T0 hybrid
stun/anomaly unit, Nangong provides:

* Massive anomaly buffs at M0W1
* Extended stun windows that create sustained damage opportunities
* Polarity disorder triggers during stuns, giving disorder-dependent agents (especially
  Miyabi) constant disorder fuel to power MULTIPLE chains of enhanced attacks during a
  single stun window

The result: **the strongest anomaly teams now look like Nangong/<Anomaly DPS>/Yuzuha**
instead of `<Anomaly DPS>/Vivian/Yuzuha`. Nangong has effectively replaced Vivian as
Miyabi's best-in-class teammate. If forced to choose between Nangong and Yuzuha, Miyabi
prefers Nangong. Alice and other anomaly agents still generally prefer Yuzuha over
Nangong, but the gap is narrow.

Nangong's impact is so significant that Vivian dropped from T0 to T0.5, and the
composition **Nangong/Vivian/Yuzuha** is a viable endgame team despite Vivian technically
being a subdps — because Nangong's anomaly buffs are powerful enough to elevate Vivian
into a functional primary DPS role against ether-weak anomaly bosses (e.g. Miasmic Fiend,
Dead End Butcher, possibly Miasma Priest). This edge case likely works due to a
combination of factors: Nangong's stun-unit anomaly synergy, all three units being
ether-aligned (with Yuzuha's kaleidoscope), and strong element-weakness matching. It is
not a generalizable rule so much as an emergent result of extreme mechanical overlap.

### Why This Can't Be Modeled as an Exception

The old engine approach — a general "stunner penalty on anomaly teams" with narrow
exceptions — is fundamentally insufficient for the new meta:


1. **It's not just Nangong.** Lycaon's potential silhouette (P1+) adds anomaly agents to
   his `join`, making him an anomaly-compatible stunner. His ice defense shred works
   particularly well with Miyabi and Promeia. While not at Nangong's level, Lycaon
   demonstrates that anomaly-compatible stunners are becoming a category, not a one-off.
2. **It's not just Aria.** Promeia (upcoming ice anomaly) also has `synergy.tags: ["stun"]`,
   indicating the game is deliberately expanding the set of anomaly agents that work with
   stunners. The trend suggests more anomaly agents will receive stunner compatibility
   over time, potentially including older agents via potential silhouettes.
3. **The benefit is a spectrum.** Miyabi gets enormous benefit from anomaly-compatible
   stunners. Alice gets moderate benefit (she has enhanced attacks that can be saved for
   stun windows). Yanagi benefits hugely from Nangong's anomaly buffs specifically (but
   not from generic stunners like Lycaon). Burnice and Jane have almost no real synergy
   from stunners. This is not a binary property.
4. **The game is pushing this direction.** Sanguine Sweeper (anomaly-shill boss) has fight
   mechanics that benefit heavily from bringing a stunner to an anomaly team. Future
   bosses may continue this trend.
5. **Element synergy matters.** Lighter has fire+ice element synergy, making teams like
   Lighter/Burnice/Promeia viable — but he doesn't engage with anomaly mechanics the way
   Nangong and Lycaon do. The distinction between "stunner that happens to share elements
   with anomaly agents" and "stunner that actively enhances anomaly gameplay" is important.
6. **Disorder dependency varies by agent.** Some anomaly agents (Yanagi, Miyabi) NEED
   disorders to reach their damage potential, meaning double-anomaly is inherently
   valuable for them — unless the stunner provides disorder fuel (as Nangong does). Other
   anomaly agents (Aria) deal damage through enhanced attacks during stun windows and
   don't rely on disorders at all. This means the tradeoff between "second anomaly agent"
   and "anomaly-compatible stunner" depends on both the stunner's mechanics AND the
   primary DPS's damage model.

### Anomaly Agents and Stunner Compatibility

The following is the current landscape of anomaly agent compatibility with stunners:

| Agent | Stunner Benefit | Why |
|----|----|----|
| Miyabi | Very High | Disorders fuel enhanced attacks; stun windows allow multiple enhanced attack chains to deal damage under the stun window’s additional stun damage multiplier; Nangong provides constant disorder fuel |
| Alice | Moderate | Has enhanced attacks that can be saved for stun windows |
| Aria | High | Plays like an attacker; wants stun windows to unload powerful attacks |
| Promeia | High | Stun-synergy anomaly; benefits from stun windows and Nangong's disorder triggers |
| Yanagi | Low (generic stunner) / High (Nangong specifically) | Needs disorders for damage but standard stunners don't help with anomaly; although Nangong's anomaly buffs specifically are huge |
| Burnice | Low (generic stunner) / Medium (Lighter) / \n High (Nangong specifically) | Continuous off-field damage model has almost no synergy with stun windows; although specifically Nangong’s anomaly buffs still help a lot and Lighter’s fire buffs help her damage output significantly |
| Jane | Low (generic stunner) / High (Nangong specifically) | Continuous on-field damage model has almost no synergy with stun windows but high synergy with Nangong’s buffs; notably M2 Jane has better synergy than other plain anomaly agents with stunners because M2+ Jane can layer crit damage on top of herself and anomaly teammates |


---

## Damage Mechanics Taxonomy

The game has several distinct damage mechanics that create synergies between units. These
are currently modeled implicitly through `synergy.units` and `synergy.tags`, but a more
explicit representation is planned (see Planned Architecture section).

### Aftershock Damage

Off-field damage that units deal while not actively controlled. SAnby significantly buffs
aftershock damage, which is why she has explicit synergy relationships with other
aftershock-producing units.

**Producers:** Trigger, SAnby (also on-field), Orphie, Pulchra, Ju Fufu, Yuzuha, Lucia, Harumasa (also produces on-field aftershock) **Consumers/Beneficiaries:** , SAnby
**Unmodeled synergies:** Harumasa ↔ SAnby (would never realistically team together),
Lucia/Yuzuha → SAnby (too weak to justify modeling)

### Abloom Damage

An anomaly-specific damage type. Currently has no dedicated synergy framework, but this
is expected to change in version 3.0 to signal-boost newer anomaly characters over older
ones. The division between abloom and non-abloom anomaly agents is a key future axis.

**Producers:** Vivian (first abloom unit), Aria, Nangong Yu, Burnice (via potential
silhouettes), Grace (via potential silhouettes), Promeia
**Non-producers (older anomaly agents):** Miyabi, Yanagi, Jane, Alice
**Future significance:** Version 3.0 is expected to introduce abloom-specific synergies
and buffs that differentiate newer anomaly agents from older ones. This will create a
meaningful scoring axis where abloom producers gain advantages in new content.

### Ether Veil

A debuff mechanic where units create veils that increase enemy vulnerability. Most units
can only maintain one veil at a time, but Sunna can stack them by recreating the veil
each time. Already documented in Boss-Specific Knowledge (Discordant Solo).

**Producers:** Lucia, Yidhari, Zhao, Sunna (uniquely stacks)
**Boss relevance:** Critical against Discordant Solo (shillIntensity: 2)

### Chain Attacks

A damage mechanic involving sequential team attacks. Some units have particularly high
chain attack multipliers or generate additional chain attacks.

**Key units:**

* **Evelyn** — Highest chain attack damage multiplier in the game by a very large margin;
  can generate her own chain attacks; Evelyn's optimal play revolves around chain attacks.
  This is a major reason Evelyn strongly prefers Astra (who generates extra chain attacks)
  over other supports.
* **Astra** — Generates extra chain attacks for teammates with her ultimate
* **Koleda** — Buffs chain attack damage

### Polarity Disorder

A specific type of disorder that certain agents can trigger entirely on their own, without
needing a partner with a different anomaly element. This is particularly relevant for
Nangong, who triggers polarity disorders during stuns — effectively giving her
stun-window-based anomaly support capabilities that no other stunner provides.

**Producers:** Yanagi, Alice, Nangong Yu

### Defense Shred / PEN Ratio

Mechanics that reduce enemy defenses or penetrate them. These mechanics are fundamentally
incompatible with rupture (which deals Sheer damage that ignores defense entirely). This
is the mechanical underpinning of why Nicole, Rina, and others have `avoid: ["rupture"]`.

**Defense shred:** Nicole (40% defense debuff), Trigger, Lycaon (ice-specific)
**PEN ratio:** Rina, Grace, Yanagi
**Why rupture-incompatible:** Both mechanics assume the enemy's defense matters. Rupture
bypasses defense entirely, making these bonuses worthless.

### Kaleidoscope (Yuzuha)

Yuzuha's unique mechanic that allows her to change elements dynamically. This is why she
has `synergy.tags` listing all five elements — she can adapt to match any team's element.
Currently modeled implicitly through her broad element synergy tags. May be worth
explicit modeling in the mechanics object to capture the "element-flexible support"
concept for future units that might share this capability.

### Stun Window Extension

Some stunners provide extended stun windows beyond the standard duration. This is
particularly valuable for anomaly agents and attackers with high-damage enhanced attacks
that benefit from longer vulnerability windows.

**Key unit:** Nangong Yu (extends stun windows significantly AND triggers polarity
disorders during stuns — a unique combination that no other unit provides)


---

## Element Variants

### Background

Titled units don't technically use standard elements. Each has a unique variant that
currently behaves very similarly to their "native" element:

| Unit | Standard Element | Variant Name | Hits Same Weaknesses/Resistances |
|----|----|----|----|
| Miyabi | Ice | Frost | Yes |
| Yixuan | Ether | Auric Ink | Yes |
| YSG | Physical | Honed Edge | Yes |

### Why Variants Matter

The key distinction is **anomaly tracking**. The game tracks anomaly buildup separately
per element variant, meaning:

* **Miyabi (Frost) + Soukaku (Ice):** Their anomalies track separately. When both reach
  threshold, they collide and cause a **disorder** — dealing bonus damage. This is the
  fundamental reason Miyabi and Soukaku work so well together despite both targeting "ice"
  weaknesses. Similarly, Miyabi + Promeia would trigger Frost/Ice disorders.
* **Yixuan (Auric Ink) + Vivian (Ether):** Same principle, though Yixuan's primary
  damage strategy doesn't rely on anomaly procs as heavily.
* **YSG (Honed Edge) + Alice/Jane (Physical):** Same principle, but YSG rarely triggers
  anomalies in practice, so the interaction is largely theoretical.

For most scoring purposes, Miyabi is effectively an ice agent: favorable against ice-weak
bosses, poor against ice-resistant bosses. The variant distinction only matters for
disorder mechanics. The current engine does not model it — it treats Miyabi as plain "ice"
and handles the Miyabi/Soukaku disorder synergy through Soukaku's `synergy.units`
listing Miyabi.

### Future Impact: Wind and Catalysis

Version 3.0 will introduce the Wind element with a new reaction type called **catalysis**
(see Wind Element section below). Wind's catalysis mechanics will have **dramatically
reduced interactions with element variants** (Frost, Auric Ink, Honed Edge). This appears
to be a deliberate game design choice to discourage reliance on existing powerhouse titled
units and push players toward pulling newer units (e.g., Promeia over Miyabi for
wind-relevant content).

### Planned Data Model

An `elementVariant` field (or similar) will be added to the unit data object for titled
units. The primary element tag remains as-is for weakness/resistance matching. The variant
field provides the additional specificity needed for reaction mechanics (disorder, and
eventually catalysis).

```json
{
  "tags": ["anomaly", "ice", "section6", "title", "assist:defensive"],
  "elementVariant": "frost"
}
```

Units without an `elementVariant` use their standard element for all purposes (the common
case). This field is not expected to be needed until catalysis modeling begins, but the
architectural plan is documented here so the mechanics object design accounts for it.


---

## Wind Element and Catalysis (Future Consideration)

**Status: NOT being implemented now. Documented here for architectural foresight only.**

### What We Know

Version 3.0 (two patches from now) will introduce a new element: **Wind**. The codebase
has already been refactored to make adding a new element straightforward (the `ELEMENTS`
constant in `constants.js`, element arrays, etc.).

Wind introduces a new reaction type called **catalysis** that differs fundamentally from
the existing **disorder** reaction:


1. **Asymmetric element interactions:** Unlike disorder (where fire/ether collision =
   electric/physical collision = identical damage), catalysis damage varies by element
   pair. Fire/wind catalysis deals different damage than electric/wind catalysis. The
   exact scaling is not yet finalized.
2. **Reduced variant interactions:** Wind catalysis has dramatically reduced power against
   element variants (Frost, Auric Ink, Honed Edge), further distinguishing titled units'
   anomaly behavior from standard units.
3. **Abloom relevance:** Promeia (upcoming ice anomaly, abloom producer) has confirmed
   synergy with wind anomaly damage, positioning her as a bridge character between the
   current meta and the wind meta.

### What We Don't Know

* Exact catalysis damage multipliers per element pair
* Whether catalysis replaces disorder for wind interactions or supplements it
* The identity of wind agents (speculation only at this stage)
* Whether wind agents will have their own element variants
* The full extent of wind's boss mechanic interactions
* Whether the interaction asymmetry extends beyond catalysis (e.g., wind-specific
  resistances that differ from standard element resistances)

### What We Do Know (Concrete)

* The next patch will include a boss that deals wind anomaly damage to itself
* Promeia has synergy with wind anomaly damage
* The mechanics are subject to significant change before release
* The game is deliberately trying to push players toward newer units by making wind
  interactions weaker with existing titled unit variants

### Architectural Implications

The scoring engine's architecture must be prepared to eventually support:

* An **element interaction matrix** that captures asymmetric reaction damage between
  element pairs (currently all disorder pairs are implicitly equal)
* Per-element-pair scoring modifiers for team composition (e.g., "a wind+fire anomaly
  team gets X bonus, a wind+electric team gets Y bonus")
* Integration of element variants into this matrix (Frost ≠ Ice for catalysis purposes)
* Boss-side properties that may express catalysis-specific weaknesses or resistances

The planned mechanics object (see below) is designed to be the vehicle for this future
modeling. By building the mechanics infrastructure now for the Nangong/stunner-anomaly
problem, we create the extensible foundation needed for wind/catalysis later without
requiring another architectural overhaul.


---

## Wheelchair Compositions

"Wheelchair" compositions are support+utility pairings so strong that they can uplift
almost any compatible DPS to viable endgame performance. These compositions should emerge
naturally from good mechanics modeling rather than being explicitly hardcoded — their
emergence from the scoring algorithm is evidence that mechanics are well-modeled.

### Known Wheelchair Pairs

**Astra + Nicole** (Attack/Anomaly)

* Universal pair for attack and anomaly DPS
* Together they uplift even lower-tier DPS like Zhu Yuan or Harumasa to effective clears
* An M2 Miyabi backed by M1 Astra + M6 Nicole can even tackle Wandering Hunter (sharply
  anti-anomaly), demonstrating the pair's uplift power
* NOT for rupture (Nicole's defense debuff is useless; both have `avoid: ["rupture"]`)
* Generally speaking, Astra gives teammate attack buff and Nicole gives an enemy defense debuff, creating a influential damage differential leverage for the DPS unit

**Nangong + Sunna** (Attack/Anomaly)

* Pairs with any attack or anomaly character whose `join` includes stun or support (which
  is most of them)
* Nangong provides: anomaly procs, fast stunning, extended stun windows
* Sunna provides: ATK buffs, additional daze for faster stuns, decent damage output, and an increased stun multiplier
* Anomaly agents love Nangong's powerful anomaly bonuses; attackers love her stun
  extensions and both archetypes benefit from Sunna's attack buffs
* NOT for rupture agents
* Note: while Evelyn's `join` is technically satisfied by Nangong (stun) + Sunna
  (support), Evelyn specifically prefers Astra over Sunna due to chain attack synergy

**Nangong + Yuzuha** (Anomaly Teams)

* A strong wheelchair pairing for anomaly teams specifically
* Nangong provides stunner utility + anomaly buffs; Yuzuha amplifies anomaly output
  with kaleidoscope element flexibility
* `Nangong/<Anomaly DPS>/Yuzuha` has replaced `<Anomaly DPS>/Vivian/Yuzuha` as the strongest anomaly team template (although Vivian is still quite strong)

**Dialyn + Lucia** (Rupture)

* Best-in-slot teammates for all current rupture agents regardless of specific agent (Yixuan, Yidhari, Banyue, Komano equally want this duo), and so does the unreleased future physical rupture agent
* Dialyn provides free ultimates + stun; Lucia provides rupture-specialist support
  (+1200 Sheer)
* The definitive rupture wheelchair

### Design Philosophy

Wheelchair compositions are a sign that the scoring engine's mechanics are well-modeled.
When the engine correctly captures what each unit produces and consumes mechanically,
powerful pairings should emerge as natural high-scoring combinations rather than requiring
explicit rules. The current scoring baseline already shows emergent wheelchair behavior,
and this should be preserved and strengthened as the engine evolves. If the mechanics
object is designed well, future wheelchair compositions (e.g., for wind teams) should
emerge automatically when new units are added.


---

## Planned Architecture: Unit Mechanics Object

### Motivation

The current scoring engine relies on a combination of:

* **Hardcoded composition rules** ("anomaly teams prefer support over stun" with exceptions)
* **Synergy tags** (binary properties like `"stun"`, `"anomaly"`, `"subdps"`)
* **Named unit synergies** (`synergy.units` for specific pairings)

This approach has reached its limits. The Nangong release exposed a fundamental problem:
`<Anomaly DPS>/Vivian/Yuzuha` scores higher than `Nangong/<Anomaly DPS>/Yuzuha` in the
current engine, and fixing this without causing serious side effects in other team
compositions is extremely difficult. The issue is not a missing exception — it's that the
engine's team composition framework was built on broad archetype-level rules that are
increasingly being violated by units with cross-archetype mechanical synergies.

Additionally, the upcoming Wind element and catalysis reactions (v3.0) will introduce
element-pair-dependent damage scaling that the current architecture cannot express at all.

### Design Direction: Mechanics-Driven Scoring

Instead of hardcoded archetype rules with per-unit exceptions, the engine will move toward
**mechanics-driven scoring** where team quality emerges from how well the units' individual
mechanics mesh together.

**Core concept:** Each unit has a `mechanics` object that describes what the unit
**produces**, **consumes**, **buffs**, and **debuffs** — with directionality. The scoring
engine evaluates how well a team's mechanics interconnect rather than checking against
rigid composition templates.

### Mechanics Object Design (Preliminary)

The mechanics object will be added to each unit in `units.json`, coexisting with the
existing `synergy` object. Over time, much of what currently lives in `synergy` will
migrate to `mechanics` and become naturally emergent from mechanical compatibility. The
`synergy` block will remain as a catch-all for one-off relationships that are difficult
to express through mechanics alone.

```json
{
  "mechanics": {
    "produces": ["abloom", "polarity-disorder", "stun-window-extension"],
    "consumes": ["disorder", "stun-window"],
    "buffs": ["anomaly-buildup", "atk"],
    "debuffs": ["defense-shred:ice"]
  }
}
```

**Important:** The exact shape, field names, and vocabulary of the mechanics object are
preliminary. The above is illustrative of the directional concept
(produces/consumes/buffs/debuffs), not a final specification. The precise structure will
be determined during implementation. What IS decided: the mechanics object must express
**directionality** (not flat arrays of tags) so that the engine can evaluate producer → consumer relationships between teammates.

**Scope of the mechanics object:** The mechanics object should be broad enough to capture:

* **Hybrid/pseudo roles:** Nangong and Soukaku as pseudo-anomaly, Orphie as
  pseudo-support, Caesar as pseudo-stunner (she is a defense unit but provides
  meaningful stun contribution, making her more valuable on teams like Hugo's that
  want stun). Role concepts (primary DPS vs. subdps, pseudo roles) help express a lot
  of basic mechanics implicitly without having to spell out every interaction.
* **Key damage types:** Crit damage (attackers), anomaly buildup (anomaly units), Sheer
  (rupture), aftershock, abloom, chain attacks, ultimate damage (e.g., Seed, Rina, and
  YSG have unusually high ultimate damage multipliers).
* **General role mechanics as implicit baselines:** Rather than explicitly stating that
  every anomaly agent "produces anomalies and disorders" (which is obvious and tedious),
  general role guidelines should express basic mechanics implicitly. A stunner obviously
  creates stuns and naturally triggers chain attacks; an anomaly agent obviously produces
  anomaly buildup. The mechanics object should focus on what is **distinctive** about a
  unit beyond its role baseline -- Nangong's stun window extension and polarity disorder
  triggers are distinctive; "she stuns enemies" is not.
* **Incremental contribution modeling:** The mechanics object should enable the scoring
  engine to move away from the current "large-chunk, black-or-white" bonus system toward
  finer-grained, incremental bonuses that emerge from mechanical overlap. For example,
  Cissia's electric damage buff slightly helps Rina (high ultimate damage) on electric
  teams -- this is not worth a dedicated `synergy.units` entry, but a mechanics-driven
  engine should capture it naturally as a small point boost rather than requiring
  explicit modeling for every such interaction.

**Post-refactoring calibration:** Because the mechanics-driven engine will shift from
discrete large-chunk bonuses (+35/+20/-40) toward many smaller overlapping mechanical
contributions, all scoring point allocations will need recalibration after the engine
overhaul. The current Scoring Results Scale boundaries (300+/230+/145+) will almost
certainly shift and should be re-evaluated against known team rankings once the new
engine is stable.

### Relationship to Composition Rules

Mechanics-driven scoring does not completely replace conventional team-building rules.
Instead, it operates in layers:


1. **Base conventions remain as fundamentals.** Most attackers want a stunner. Anomaly
   teams benefit from specialist supports. Rupture ignores defense. These are "default
   mechanics" that apply in the absence of overriding mechanical interactions. Standard
   team archetypes (stun/attack/support, double-anomaly/support, stun/rupture/support)
   represent the baseline expectations — like how Lycaon/Ellen/Soukaku is a conventional
   ice attack team with no unique mechanical interactions beyond being a standard
   archetype done well.
2. **Mechanics can trump convention.** When unit mechanics create cross-archetype
   synergies (e.g., Nangong's anomaly buffs + stun window extension + polarity disorder
   triggers making her superior to a second anomaly DPS), the mechanical compatibility
   should override the default composition penalty. The "stunner on anomaly team" penalty
   should not apply when the stunner's mechanics actively produce what the anomaly DPS
   consumes.
3. **Emergent team quality.** Rather than explicitly coding "Nangong is good with Miyabi,"
   the engine should recognize that Nangong produces disorder fuel + stun windows +
   anomaly buffs, Miyabi consumes disorder fuel + stun windows, and therefore the
   mechanical mesh is excellent. This approach scales to 600+ agents without requiring
   manual synergy entries for every pair.

### What Mechanics Replaces

The following current mechanisms will partially or fully migrate to mechanics-driven evaluation, although many of these are challenging to currently define in a precise manner:

* `synergy.tags: ["stun"]` on anomaly units → replaced by mechanics that express
  "this unit consumes stun windows" or "this unit produces enhanced attacks during stun"
* `synergy.tags: ["anomaly"]` on stunners → replaced by mechanics that express "this
  unit produces anomaly buffs / disorder triggers during stun"
* `synergy.tags: ["subdps"]` → may remain as a role tag, but the subdps's actual
  contribution is better captured by its mechanics
* `synergy.avoid: ["rupture"]` → partially replaced by mechanical incompatibility
  (units that produce defense-shred or PEN bonuses are mechanically useless alongside
  Sheer damage dealers)
* **Specialist detection** → may be expressible through mechanics producing outputs that
  exactly match one archetype's consumption needs
* **Monoshock composition rules** → should emerge from mechanical overlap between
  same-element attacker+anomaly units

The `synergy.units` list and `synergy.avoid` list will likely remain for cases where
named relationships or hard exclusions can't be captured mechanically.

### Extensibility for Wind/Catalysis

By building the mechanics infrastructure now, the engine will be ready to model catalysis
when the time comes through:

* Adding catalysis-related mechanics to wind agents' `mechanics` objects
* Using the `elementVariant` data to determine catalysis interaction strength
* Potentially adding an element interaction matrix that maps element pairs to reaction
  types and power levels
* All without requiring another architectural overhaul of the scoring engine


---

## Known Scoring Issues and Refactoring Motivation

### Primary Issue: Nangong Scoring Inversion

**Problem:** `<Anomaly DPS>/Vivian/Yuzuha` currently scores higher than
`Nangong/<Anomaly DPS>/Yuzuha` for most anomaly bosses.

**Why it's wrong:** Nangong has objectively replaced Vivian as the optimal second slot
on anomaly teams for most compositions. Nangong/Miyabi/Yuzuha should score as the
strongest anomaly team in the game (barring element resistance). The current engine
cannot produce this result without causing cascading side effects in other team
compositions.

**Root cause:** The engine's anomaly composition rules treat stunners as inherently
suboptimal for anomaly teams (applying a -20 to -40 penalty). The exceptions (stun-synergy
tag, titled anomaly, monoshock) are narrow carve-outs that don't capture the broad reality
that some stunners are genuinely superior to a second anomaly DPS on anomaly teams.

**Why surgical fixes fail:** Removing or reducing the stunner penalty for anomaly teams
would also incorrectly boost teams like Koleda/Alice/Yuzuha or Trigger/Burnice/Yuzuha,
where the stunner provides no anomaly-relevant mechanics. The penalty is correct for
generic stunners — it's just wrong for anomaly-synergistic stunners. The current binary
flags (`synergy.tags: ["anomaly"]`) don't capture the *degree* of anomaly synergy a
stunner provides, nor do they capture what specific mechanics make that stunner valuable
for anomaly teams.

### Secondary Issues

* **Lycaon P1+ anomaly compatibility** is modeled only through `synergy.tags: ["anomaly"]`
  and `join` updates — a binary flag that doesn't capture the nuance of his ice-defense-shred
  being specifically good for ice anomaly agents
* **Lighter's element synergy** with fire/ice anomaly agents (e.g., Lighter/Burnice/Promeia)
  is modeled through element tags but not through anomaly-specific mechanics
* **Abloom damage synergy** between Nangong/Vivian/Aria is unmodeled — when abloom becomes
  a scored mechanic (expected v3.0), the engine will need to handle it
* **Chain attack synergy** (Evelyn ↔ Astra/Koleda) is unmodeled — Evelyn's extreme
  preference for Astra is only partially captured by `synergy.units`
* **Defense shred / PEN ratio incompatibility with rupture** is modeled through
  `synergy.avoid` rather than through the actual mechanical reason (Sheer damage ignores
  defense)
* The upcoming agent Cissia is an electric attacker that specifically provides a large buff for electric damage to teammates, meaning that mechanically she best benefits Seed, because <Stun>/Seed/Cissia is the only meaningful composition that enables this.  This niche pigeonholing is easy to model via mutual synergy today, but is not extensible - for example, Cissia’s electric damage actually also boost Rina, who despite being a support unit has one of the highest ultimate damage multipliers in the game after YSG and Seed. Cissia boosting Rina’s value to electric teams is something that would emerge naturally from a mechanics-based model rather than having to be specifically modeled as a unit-to-unit synergy, which is annoying because realistically speaking no one actually makes a team decision to put Rina with Cissia BECAUSE OF that interaction. It’s a nice benefit that might give a small point boost to a team composition but current modeling is very black-or-white rather than emerging from mechanical overlap, which could better model small incremental team composition bonuses rather than the more static large-chunk bonuses in the current model are capable of. 

### Refactoring Scope

The planned refactoring introduces the mechanics object and mechanics-driven scoring to
address these issues holistically. The scope is:


1. **Design and implement the** `mechanics` object on `units.json` entries
2. **Refactor composition rules** in `team-scorer.js` to use mechanics-driven evaluation
   where applicable, while preserving base conventions as defaults
3. **Migrate existing synergy patterns** to mechanics where they represent genuine
   mechanical interactions (vs. one-off relationships)
4. **Validate against scoring baseline** to ensure the refactoring produces correct
   relative ordering of known team compositions
5. **NOT included in this phase:** Wind element, catalysis, element interaction matrices,
   or any speculative future mechanics — architecture only needs to be extensible for
   these


