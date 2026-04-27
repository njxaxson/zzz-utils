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

* **DPS shills** (attack, anomaly, rupture): These are *preferences*. A team that matches the shill gets a flat bonus; a team that doesn't match simply doesn't receive the bonus — there is no penalty for mismatching. A non-matching team competes on its own merits through element matching, tier quality, and mechanical synergy. See also Principle 27.
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
* **Sanguine Sweeper** (`shillIntensity: 2`): An anomaly-shill boss that heavily
  benefits from being stunned. Nangong is favored because her stun+anomaly hybrid kit
  is uniquely suited to this fight. The higher intensity ensures Nangong teams properly
  outrank non-Nangong anomaly teams (e.g., MVY) on this boss.

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
* **Ether Veil scaling:** Aria's enhanced attacks are fueled by ether veil generations
  (`scaling: { veils: 2 }`). This is a transformative scaling relationship — more veils
  → more enhanced attacks. This is the primary mechanical reason Sunna (`utility.veils:3`)
  is better than Yuzuha for Aria: Sunna directly feeds Aria's enhanced attack frequency
  through veil generation, while Yuzuha provides anomaly buffs but no veils.
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
* Best paired with Cissia (ideal partner) or Orphie (strong alternative)
* Cannot function without another attacker on team
* Key team: Trigger/Seed/Cissia is likely Seed's best team

**Cissia** - Electric Subdps / Seed's Ideal Partner

* T1.5 electric attacker with subdps pseudoRole
* Primarily designed as Seed's best partner (replacing Orphie for Seed teams)
* Can technically be run as a standalone DPS, but is really a subdps for electric attack teams
* Also usable with Harumasa, SAnby (even without aftershock buff), Yanagi, and Grace — anomaly teams can use her more as a support-like unit due to her electric debuff
* Not quite a pseudosupport the way Orphie is, but is usable in a support-like capacity
* Her only truly great home is on a Seed team (e.g., Trigger/Seed/Cissia)
* Provides: cr:1 buff, electric:2 debuff, daze:1 utility

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
* **Obol** - Synergistic (Seed/Orphie mutual synergy, Trigger integration). With Cissia's release, the electric attacker ecosystem now splits: SAnby+Orphie (aftershock duo) and Seed+Cissia (burst duo).
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
  "synergy": { "units": ["Sunna", "Nangong"], "tags": ["stun"], "avoid": [] },
  "mechanics": {
    "damage": { "enhanced": 2, "abloom": 2 }
  }
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
* `mechanics` - Mechanics object describing the unit's game mechanics for scoring (see Unit Mechanics Object below)

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

When BOTH units list each other in `synergy.units`:

* One-directional: +5 (A lists B)
* Mutual bonus: +10 additional (both list each other, +15 total per direction)

Current mutual synergy pairs:

* YSG ↔ Zhao
* Aria ↔ Sunna
* Aria ↔ Nangong
* Nangong ↔ Sunna
* Seed ↔ Orphie
* SAnby ↔ Orphie
* Seed ↔ Nekomata (minor/niche — Seed doesn't want Nekomata unless no better option)

### Unit Mechanics Object

The `mechanics` object describes a unit's game mechanics for the scoring engine. It captures what is **distinctive** about a unit beyond its role baseline. Units with no distinctive mechanics have an empty `mechanics: {}`.

```json
{
  "mechanics": {
    "pseudoRole": "anomaly",
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

* `pseudoRole` - (optional) One or more secondary roles the unit effectively fills, comma-separated: `"subdps"`, `"anomaly"`, `"stunner"`, `"support"`, `"attack"`, `"defense"`. Causes the engine to apply role baselines for each pseudo-role in addition to the tagged role. Examples: Nangong (stunner with `"anomaly"`), Caesar (defense with `"stunner"`), Orphie (attack with `"support,subdps"`), Vivian (anomaly with `"subdps"`).
* `elementalVariant` - (optional) Boolean flag (`true`) marking titled units that have elemental variants. These units have alternate-element versions tracked via the `elementVariant` data, which affects boss element-weakness matching in Layer 3. Currently: Miyabi, Yixuan, YSG.
* `damage` - What distinctive damage types the unit deals. Keys: `enhanced`, `ultimate:strong`, `ultimate:double`, `chain`, `aftershock`, `abloom`, `polarity`, `totalize`.
* `buffs` - What stats or damage types the unit buffs for teammates. Keys: `atk`, `anomaly`, `aftershock`, `chain`, `sheer`, `pen`, `stun-multiplier`, `cr`, `cd`, and element names (`fire`, `ice`, `electric`, `physical`, `ether`).
* `debuffs` - What the unit debuffs on enemies. Keys: `defense`, `recovery`, and element names.
* `utility` - Non-stat team contributions. Keys: `disorders`, `quick-assists`, `chains`, `ultimates`, `heal:team`, `heal:self`, `shields`, `interrupt-resistance`, `kaleidoscope`, `veils`, `daze`, `stunless`.
* `scaling` - What the unit specifically benefits from. Overrides role baseline when present. Non-stat keys (go through Need Fulfillment matching): `disorders`, `ablooms`, `chains`, `ultimates`, `veils`, `quick-assists`, `interrupt-resistance`, `attacker`, `stun`, `anomaly`. Stat keys (enhance Baseline Affinity): `am`, `ap`, `cr`, `cd`, `hp`, `def`, `pen`, `sheer`.

**Override rule:** When `scaling` is present, it replaces the role-baseline scaling for Need Fulfillment purposes. An attacker that omits `scaling` gets the baseline (cr:2, cd:2). An attacker that lists `scaling: { "ultimates": 3 }` scales ONLY with ultimates through Need Fulfillment. Baseline Affinity rules (ATK, defense shred, element matching, stun infrastructure) still apply regardless.

**Role baselines (applied implicitly when no explicit scaling exists):**

* Attacker: cr:2, cd:2
* Anomaly: am:2, ap:1, anomaly:2
* Rupture: sheer:3, hp:2, cr:2, cd:2
* Stunner: daze:1

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
**Abloom buff ecosystem:** Promeia's `buffs.abloom:2` will boost all abloom producers
(Aria, Vivian, Burnice, Grace). This is a deliberate game design choice to carve out a
niche where Promeia (ice anomaly) can justify a team slot over Miyabi in some cases —
by offering abloom-specific support that Miyabi cannot benefit from.
**Note on Aria's abloom:** Aria's enhanced attack is classified as abloom damage, but she
also deals abloom damage outside of her enhanced attacks. These are separate damage
sources (not the same attack described twice), so `damage: { enhanced: 2, abloom: 2 }`
does not represent double-counting.
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

## Mechanics-Driven Scoring Architecture

### Background

The original scoring engine relied on hardcoded composition rules, synergy tags, and named
unit synergies. The Nangong release exposed a fundamental problem: the engine's archetype-level
rules couldn't handle units with cross-archetype mechanical synergies (e.g., Nangong as a
stunner who is superior to a second anomaly DPS on anomaly teams). Surgical fixes caused
cascading side effects in other team compositions.

### Current Architecture: Five-Layer Scoring

The mechanics object (now implemented in `units.json`) enables a mechanics-driven scoring
engine structured in five layers:

1. **Layer 1: Disqualifications** — Boss anti, resisted DPS element, insufficient defensive
   assists, no DPS. Hard disqualifications are minimal; bad combinations (like attack+rupture
   mixing) are not disqualified but instead score low through lack of mechanical overlap.
2. **Layer 2: Inherent Quality** — Tier scoring, rank scoring, titled bonus. These capture
   individual unit power independent of team context.
3. **Layer 3: Boss Matchup** — Shill preference, favored units, element weakness/resistance.
   These capture how well a team fits a specific boss fight.
4. **Layer 4: Mechanical Synergy** — Pairwise directional evaluation of all teammate pairs
   using the `mechanics` object. This replaces synergy scoring, support contribution,
   composition templates, and most hard composition rules. Four scoring components:
   * **Baseline Affinity**: Broad stat interactions (ATK helps DPS, anomaly buffs help anomaly
     agents, defense/element debuffs help DPS and stunners, stun infrastructure helps attackers/rupture)
   * **Damage Amplification**: Supplier buffs a damage type the consumer deals (MULT=3)
   * **Need Fulfillment**: Supplier provides something the consumer explicitly scales with (MULT=4)
   * **Stun Emergence**: Consumer has burst damage that benefits from stun infrastructure (MULT=2)
   * **Diametric Buff Synergy**: When a consumer receives buffs from multiple complementary dimensions across different suppliers (e.g., ATK boost + defense reduction), the combined effect is multiplicative in-game. The engine rewards teams whose suppliers contribute through different baseline affinity categories.
   * Plus general utility (heal:team, shields)
5. **Layer 5: Additional Synergies** — Hand-curated `synergy.units` bonuses for edge cases
   that mechanics alone can't fully capture. Lower-weighted than in the old algorithm.

### What Mechanics Replaces

The following are removed from the scoring engine and subsumed by Layer 4:

* `calculateSynergyScore` (unit synergy, tag synergy, element synergy, subdps pairing, avoid penalties)
* Support contribution scoring (specialist matching, generalist, dead-weight)
* All composition templates (anomaly, attack, rupture, stunless, double-stun)
* Universal support bonus, double-stun penalty
* DPS mixing penalties (attack+rupture, anomaly+rupture, monoshock special case)
* `synergy.avoid` — mechanical incompatibility makes this naturally emergent (e.g., Nicole's
  defense debuff scores 0 on rupture teams because baseline affinity excludes rupture from
  defense shred benefit)

### Relationship to synergy Object

The `synergy` block remains alongside `mechanics`:

* `synergy.units` — Named partnerships scored in Layer 5. Currently only used for **Angels of Delusion** (Aria↔Nangong↔Sunna), whose faction-level cohesion is deliberately strong and unlikely to emerge fully from mechanics alone. All other unit synergies are expressed through mechanics.
* `synergy.tags` — Largely retired. Only Ju Fufu retains `["rupture"]` as a stopgap for off-field stunner / field-time economy modeling not yet expressible in mechanics (see future enhancements).
* `synergy.avoid` — Retired. Mechanical dead-weight handles this naturally.

### Post-Refactoring Calibration

Because the mechanics engine shifts from discrete large-chunk bonuses (+35/+20/-40) toward
many smaller overlapping mechanical contributions, all scoring point allocations will need
recalibration. The current Scoring Results Scale boundaries (300+/230+/145+) will almost
certainly shift and should be re-evaluated against known team rankings once the new engine
is stable.

### Extensibility for Wind/Catalysis

The mechanics infrastructure is designed to accommodate future wind/catalysis modeling:

* Adding catalysis-related mechanics to wind agents' `mechanics` objects
* Using the `elementVariant` data to determine catalysis interaction strength
* Potentially adding an element interaction matrix for asymmetric element-pair reactions
* All without requiring another architectural overhaul

### On-field / Off-field Demand Modeling

The `mechanics.onfield` boolean flag models field-time demand. Defaults: attackers, anomaly, rupture, and stun agents default to `true`; support and defense default to `false`. Units that primarily contribute while off-field override this to `false`.

**Scoring:** The engine awards a bonus when exactly 1 agent demands field time (solo carry — efficient field economy), applies no modifier for 2 on-field agents (standard), and penalizes 3 on-field agents (field-time competition) or 0 on-field agents (no primary damage dealer).

**Units with explicit `onfield: false` overrides:**

* **Off-field stunners:** Ju Fufu, Trigger, Pulchra — apply daze primarily through off-field aftershocks
* **Off-field anomaly subdps:** Burnice, Grace, Vivian — deal damage through off-field DoT/abloom
* **Off-field attacker:** Orphie — pseudoRole support/subdps, provides aftershock damage and buffs while off-field

This directly addresses field-time competition issues (e.g., SAnby + Seed + on-field stunner = 3 competing for field time → penalty) and rewards teams with efficient field economy (e.g., Miyabi + Vivian + Yuzuha = 1 on-field agent → bonus).

---

## Scoring Engine Design Principles

These principles govern how the mechanics-driven scoring engine evaluates team compositions. They emerge from extensive iterative testing and analysis.

### Principle 1: Mechanics Only Score When Consumed

A mechanic's existence on a unit has no inherent scoring value. Points are only awarded when a mechanic is **consumed** by another unit's scaling or need. For example, `heal:team` and `shields` exist in the data model to track what units provide — but since no unit currently declares `scaling.heal` or `scaling.shields`, these mechanics contribute zero score. If a future unit scales off healing, the need fulfillment pathway will automatically capture it without engine changes.

The only exceptions are **foundational mechanics** (ATK, CR, CD, AP, AM, ultimates) that have automatic value through the baseline affinity pathway, because every DPS intrinsically benefits from them. Even these are role-gated (e.g., rupture agents barely benefit from ATK buffs because their damage scales primarily from sheer).

### Principle 2: Damage Buffs on Non-DPS Units Are Negligible

Element damage buffs and similar offensive mechanics that "technically apply" to support/defense units are practically meaningless. A fire damage buff hitting a defense unit with matching element is like doubling a two-dollar salary — the absolute impact is negligible because the unit isn't a damage dealer. The engine should NOT count element buffs as "relevant" for non-DPS units in buff utilization calculations. Only DPS units (and to a lesser extent, stunners) meaningfully convert damage-type buffs into output.

This principle extends to the buff utilization / teamwork multiplier: a support/defense unit whose element matches a teammate's element buff should NOT inflate the supplier's buff utilization score. The buff is mechanically applicable but strategically irrelevant.

### Principle 3: Wasting Buffs = Wasting DPS Potential

When a DPS unit also provides buffs (e.g., SAnby buffs aftershocks, Cissia buffs electric, Promeia buffs abloom), the team must be able to *consume* those buffs. If teammates cannot utilize the buffs, the DPS unit's overall value is diminished — you are not just losing the buff value, you are losing the *reason* to field that DPS over a different one. The engine applies a significant waste penalty proportional to the unused buff weight.

**Examples:**
* SAnby on a team with no aftershock teammates (e.g., Seed + Sunna) wastes her entire aftershock:3 buff → massive penalty
* Cissia on a team with no electric teammates loses much of her kit's advantage
* SAnby on Trigger + Seed wastes half her aftershock buff (only Trigger benefits) → moderate penalty

### Principle 4: Scarcity Determines Value

Not all buffs/needs have equal weight. Foundational stats (ATK, CR, CD) can be sourced from many units and from equipment — they are common and replaceable. Rare or unique mechanics (veils, aftershock buffs, abloom buffs, chains provision, recovery debuffs) can only be provided by a small number of units and cannot be substituted through equipment.

The engine reflects this through the multiplier structure:
* **Foundational stat buffs** (ATK, CR, CD): scored through Baseline Affinity at 0.7× multipliers — intentionally lower than specialist buffs because these stats are common and replaceable through equipment or alternative supports.
* **Specialist stat buffs** (SHEER, PEN, ANOMALY, ELEMENT): scored at 1.5–9× multipliers, reflecting their rarity and the narrow pool of providers.
* **Rare/scaling-driven needs** (veils, chains, aftershock, abloom, etc.): scored through Need Fulfillment at 7× multiplier — the highest value tier, because matching a consumer's declared scaling need is the most impactful synergy in the game.

This means a unit that provides a rare mechanic matching a consumer's scaling will always outscore a unit providing a common stat buff, all else being equal. For example: Zhao providing veils:2 to YSG (veils:2 scaling) generates 28 points via need fulfillment, while Astra providing CD:3 to the same YSG generates ~4.2 points via baseline affinity. The scarcity premium is structural, and it flips ordering for YSG: Zhao > Astra when veils are needed, despite Astra's higher tier/rank.

**Directional asymmetry**: On teams that don't need veils (or any other specialist need Zhao provides), Astra remains better than Zhao. Astra's quick-assists:3 matches every DPS's implicit baseline, and her CD still contributes — just at a reduced rate. The scarcity principle only kicks in when a consumer actually declares a scaling need for the specialist mechanic.

### Principle 5: Need Fulfillment Supply/Scaling Gating

When a consumer declares a scaling need, the supplier must provide sufficient supply to fully satisfy it. A weak provider is penalized: the fulfillment score is multiplied by `min(1, supply / scaling)`. This prevents units with incidental, low-weight mechanics from gaining disproportionate credit.

**Example:** YSG has veils:2 scaling. Sunna provides veils:3 → full credit (oversupply is fine). Zhao provides veils:2 → full credit. Lucia provides veils:1 → only 50% credit, because her supply doesn't meet the scaling need. This naturally stratifies: Sunna >> Zhao >> Lucia for YSG's veil needs.

### Principle 6: Buff Utilization Gates Support Quality

A support/defense unit's inherent quality (tier, rank, titled status) only matters to the extent that their buffs are actually utilized by the team. Buff utilization is calculated as the weighted proportion of a support's buffs/debuffs that fire for at least one consumer. A support with 30% utilization sees their quality score crushed to 9% (squared gating). A support with 0% utilization receives zero quality credit regardless of tier or rank.

This prevents high-tier supports from appearing on teams where their kit doesn't align. It also explains why broadly useful supports (Astra, Yuzuha) rank consistently high — their buffs fire for almost any team — while narrow supports (Rina with only PEN) struggle outside their niche.

### Principle 7: Faction Synergies Require Explicit Modeling

Some synergies are inherently faction-based and cannot be derived purely from mechanics. For example, Sunna is normally not better than Yuzuha on anomaly teams, except when paired with Nangong + Aria (full AoD trio) or against Discordant Solo specifically. These 3-way faction interactions must be expressed through the `synergy` data model rather than emergent mechanics alone.

### Principle 8: Tier Degradation Rates Differ by Role

The impact of falling to a lower tier is NOT uniform across roles:
* **DPS units**: Tier quality matters enormously. A T2 DPS is already a significant compromise; a T3 DPS is nearly unplayable. The gap between T0 and T2 for a DPS is the difference between meta-defining and "use only if you have nothing better."
* **Stunners**: Tier matters less. A T2 stunner is not amazing but still gets the job done — stun is stun, and the damage window they create is valuable regardless of their personal DPS output.
* **Supports/Defense**: Tier matters least. A T2 support is weaker than a better support, but buffs are buffs and every bit helps. The support's value comes from what they provide to the DPS, not from their own damage.

This means the penalty curve for lower-tier units should be steeper for DPS than for stunners/supports.

### Principle 9: CR/CD Role Asymmetry

CR (crit rate) and CD (crit damage) are critical stats for **attackers** and **rupture** agents — the majority of their damage comes from critical hits. For **anomaly** agents, the majority of damage comes from ATK, AP, disorders, and ablooms, NOT critical hits. Anomaly agents typically have very low crit rates, so increases to CD provide minimal benefit.

The exception is **Miyabi**, who is a rare anomaly agent with an extraordinarily high crit rate (effectively 100% crit rate). Her CD hits at full force all the time, making CD as valuable for her as it is for an attacker. This is why the engine gives Miyabi explicit `scaling: { cr: 3, cd: 3 }` — she behaves like an attacker for CR/CD purposes despite being an anomaly agent.

The engine reflects this asymmetry through `resolveBaselineWeight` and `getBuffRelevance`: CR/CD return full weight (1.0) for attackers/rupture but only 0.3 for anomaly agents without explicit CR/CD scaling.

### Principle 10: Scaling Types — Direct, Transformative, and Constant

Scaling entries in unit data come in three flavors with different mechanical implications:

**Direct Scaling** (scaling type matches damage type):
* Example: Evelyn has `scaling.chains:3` and `damage.chain:3`. She deals chain damage A LOT more than normal, so chain buffs are bigger and better for her than for other units.
* Direct scaling does NOT improve frequency of the damage type — Evelyn's chain attacks happen at the same rate regardless. Their value comes from the outsized damage multiplier. Evelyn still does big damage even without chain-specific support, because chain attacks are inherently powerful and other buffs (ATK, CD, fire damage) still help.
* To improve chain attack frequency, you need more stuns (stuns trigger chain attacks) or specific utilities like Astra's ultimate granting two free teammate chain attacks.

**Transformative Scaling** (scaling feeds enhanced attack frequency):
* Example: Miyabi has `scaling.disorders:3` and `damage.enhanced:3`. Disorders don't produce disorder damage — they are **converted** into enhanced attack resources. More disorders → more enhanced attacks. Miyabi's enhanced attacks are on par with ultimates; she can execute the equivalent of 5 ultimate attacks in a single stun window under optimal conditions. Starving her of disorder fuel drastically reduces her output.
* Example: Harumasa has `scaling.anomaly:2` and `damage.aftershock:1`. Anomaly applications are converted into enhanced aftershock attack resources. Without anomaly fuel, his enhanced attacks happen less frequently and his damage output is garbage.
* **Key insight**: Transformative scaling affects FREQUENCY. Meeting the scaling need means enhanced attacks happen more often; not meeting it means they happen less often. This is why need fulfillment for transformative scaling is so critical — it's not just a damage boost, it's the difference between the unit functioning or not.

**Constant Scaling** (scaling provides steady stat amplification):
* Example: Alice/Vivian have `scaling.am:3/2`. AM buffs directly increase both their AM (anomaly application speed) AND their AP (anomaly damage), because these units have a special passive converting AM into AP. This is a constant, steady effect — not frequency-dependent.
* Example: Trigger has `scaling.cr:3`. CR determines the magnitude of her defense debuff — a constant proportional effect.
* Example: Yanagi has `scaling.pen:true`. External PEN amplifies her already-high pen ratio, giving her the highest effective PEN in the game — a constant damage multiplier.

**No Scaling Connection** (enhanced attacks from natural resource building):
* Example: Aria has `damage.enhanced:2` but no scaling that feeds it. She builds resources naturally over time through normal gameplay rotations. Enhanced attacks come out when the meter fills, regardless of teammates.
* Example: Alice has `scaling.am:3` but this is constant scaling (AM→AP conversion), not transformative. Her enhanced attacks are also resource-meter based, building up naturally.

**Engine implications**: The need fulfillment pathway handles all three types, but should weight them differently. Transformative scaling (frequency-dependent) deserves a HIGHER need fulfillment multiplier than direct scaling (multiplier-based), because missing transformative scaling is catastrophic (unit barely functions) while missing direct scaling is merely suboptimal (unit still does big damage). The engine should distinguish between these scaling types and apply different multipliers accordingly.

**Inferring scaling type from data**: If a unit has `damage.enhanced` alongside a non-stat scaling entry (e.g., Miyabi's `scaling.disorders` + `damage.enhanced`), that scaling is likely transformative. If a unit has `damage.X` where X matches `scaling.X` (e.g., Evelyn's `scaling.chains` + `damage.chain`), that's direct. Constant scaling entries (stat-based like `am`, `cr`, `pen`) are identified by being base-stat keys.

---

### Principle 11: Totalize Damage and Stun Uptime Dependency

**Totalize** is a damage mechanic where the unit converts accumulated stun time into damage. The longer the boss is stunned, the more totalize damage is dealt. This makes totalize units (e.g., Hugo) **uniquely dependent on stun infrastructure**.

**Key implications:**
- Totalize units want **double-stun teams** as their conventional composition. A second stunner provides more stun cycles and higher stun uptime, which directly translates to more totalize damage. This preference far outweighs what standard support buffs (ATK, CD) can offer.
- `damage.totalize` implies massive implicit scaling on `recovery` (longer stun windows = more totalize conversion time). In the engine, totalize weight is added as an amplifier to the recovery debuff scoring path, analogous to how chains scaling amplifies recovery value.
- DPS + 2x Stunner is classified as **CONVENTIONAL** team structure when the DPS has totalize damage.
- The `TOTALIZE_QTY` bonus rewards each additional stun-role supplier on the team, reflecting that more stunners = more stun cycles = more totalize opportunities.
- Hugo is ice element (not physical).

**Totalize stun demand penalty:** In Layer 2 (Inherent Quality), totalize units are penalized when they lack stun infrastructure. The engine counts stun-role teammates with differentiated credit:
- **Proper stunner**: 1.0 credit (full stun agent)
- **Pseudostunner** (e.g. Caesar): 0.9 credit — nearly a real stunner, can do the job, just not as well as a premium stunner
- **High-daze support** (e.g. Sunna): 0.4 credit — meaningful daze contribution but nowhere close to a real stunner

If the total infrastructure is below 2.0, the penalty uses a **non-linear formula**: `totalizeWeight × TOTALIZE_PENALTY × deficit × (1 + deficit)`. The `(1 + deficit)` term makes larger deficits disproportionately costly — a small gap (pseudostunner) is barely punished, while a large gap (pure support) is devastating. This means:
- 2 stunners: no penalty (ideal)
- 1 stunner + pseudostunner (deficit 0.1): negligible penalty (~11 for Hugo)
- 1 stunner + high-daze support (deficit 0.6): substantial penalty (~95 for Hugo, below 300 threshold)
- 1 stunner + regular support (deficit 1.0): severe penalty (~198 for Hugo, severely handicapped)
- 0 stunners: devastating penalty (Hugo basically unplayable)

Hugo is also marked `onfield: false` because he comes in briefly for chain attacks and totalize burst, then returns field time to his stunners.

**Design principle:** For totalize units, stun infrastructure scaling far outpaces stat buffs. Hugo should prefer even a low-tier stunner (Koleda) over a high-tier support (Sunna) because more stun uptime = more totalize damage. This emerges from the combination of the stun demand penalty, amplified recovery debuff scoring, and totalize quantity bonuses.

### Principle 12: Stun Multiplier Is a Real Buff

The `stun-multiplier` buff (provided by Dialyn, Sunna, Lycaon) increases the damage dealt during stun windows. It benefits all DPS units, not just specific archetypes. The engine scores it in Layer 4 Baseline Affinity at `STUN_MULT_BUFF` multiplier for each DPS consumer. This is distinct from stun infrastructure (which is about creating stun opportunities) — stun multiplier amplifies the damage you deal once the boss IS stunned.

### Principle 13: Ultimates Provision Scales with Burst Potential

Free ultimates (provided by Dialyn's `utility.ultimates:3`) are worth more for DPS units with powerful ultimates. Evelyn's chain:3 attacks are roughly 1600% multiplier; her ultimates are roughly 4000%. A free ultimate for Evelyn is therefore more impactful than a free ultimate for a unit with a basic 1000% ultimate.

The engine scales `ULTIMATES_PROVISION` by the consumer's `getMaxBurstWeight`. This means Dialyn's free ultimates are most valuable for high-burst DPS (Evelyn, Miyabi, YSG) and least valuable for low-burst DPS. Combined with the burst-weight being the same factor that amplifies recovery debuff value, this creates the correct ordering: Dialyn > Lighter for Evelyn overall (ultimates at 4000% > extra chains at 1600%), while Lighter remains competitive on fire-weak bosses due to elemental alignment.

### Principle 14: DPS Reception and Team Completeness

A DPS unit without buff contributions (no buffs/debuffs to share) is currently skipped in the cohesion calculation. This creates a blind spot: a "duo + deadweight" team gets perfect cohesion because only the buff-providing units are checked, while the deadweight DPS rides for free.

The engine adds a **reception check** for DPS units without buff contributions: for each such DPS, count what fraction of their declared scaling needs (from `NEED_FULFILLMENT_KEYS`, with scaling weight >= 1) are met by the team. If not all needs are met, the DPS is included in the cohesion geometric mean with a reduced utilization. This catches teams like Nangong/Miyabi/Harumasa where Harumasa receives almost nothing useful from the team, while leaving legitimately strong teams (Nangong/Miyabi/Yuzuha) unaffected because their DPS's critical needs ARE met.

### Principle 15: Implicit Disorder Generation on Dual-Anomaly Teams

ALL anomaly DPS units benefit from disorder damage — it is a core source of anomaly damage output. When two anomaly-tagged units of different elements are on the same team, they naturally generate disorders by applying different anomaly types to the boss.

The engine awards a flat `DISORDER_BONUS` per anomaly DPS unit on such teams, **excluding** units with explicit `scaling.disorders` (like Miyabi) who already receive full credit through the need fulfillment pathway. This prevents hyperinflation on teams like Nangong/Miyabi while properly boosting teams like Alice/Vivian/Yuzuha.

**elementalVariant edge case:** Units with `elementalVariant: true` (e.g., Miyabi is "frost" not "ice") are treated as having a different element from their base for disorder generation purposes. Miyabi + Soukaku triggers disorders (frost != ice). Promeia + Soukaku does NOT (both ice, no variant).

### Principle 16: Stunner Value Discount on Stunless Teams

When the primary DPS is stunless (e.g., Ye Shunguong), a stunner's main role contribution — creating stun windows — is unwanted. The engine already gates stun-emergence and recovery debuff scoring on `isStunlessUnit`, but the stunner's inherent quality (tier/rank bonus) was not discounted. A T0.5 stunner like Ju Fufu would receive full tier+rank credit even on a YSG team where stuns are irrelevant.

The fix applies a 0.4x multiplier to stunner tier and rank bonuses when ALL DPS units on the team are stunless. Stunners that provide other value (stun-multiplier buffs, ultimates utility) still contribute through Layer 4 mechanics — this only reduces the "being a good stunner" inherent quality credit.

### Principle 17: synergy.avoid as Near-Disqualification

Explicit `synergy.avoid` annotations represent severe, game-mechanically-rooted anti-synergy where one unit's kit is essentially rendered useless. For example, Dialyn + Pan Yinhu: Pan's contribution is entirely negated by Dialyn's presence. These are not soft penalties — they are fundamental team composition failures.

In normal scoring mode, avoid pairs result in full disqualification (return -1). In lenient mode, a -200 penalty is applied, allowing the team to appear in results at a very low score for informational purposes.

### Principle 18: Quick-Assists Baseline Value

Quick-assists (the ability for a support to quickly swap the DPS back into play) are useful but not transformative for most units. Their implicit scaling baseline is set low (0.25), meaning the need fulfillment credit for providing quick-assists is modest. Units that explicitly declare `scaling['quick-assists']` (like Anton) override this baseline and receive full credit. Even a common ATK buff is more impactful than quick-assists for the majority of DPS units.

### Principle 19: Naturally Available Needs

Some scaling needs — `ultimates` and `chains` — are naturally available to all units without requiring team support. Every unit can use their ultimate; chains always trigger during stun windows. Having a provider (e.g., Ju Fufu's `utility.ultimates`) makes these available *faster*, which is correctly rewarded through L4 Need Fulfillment scoring. However, the DPS reception check in the Teamwork Multiplier must skip these keys: not having a dedicated provider is not a cohesion failure. Without this exclusion, teams like YSG/Zhao/Sunna and Alice/Vivian/Yuzuha are falsely penalized for "unmet needs" that are actually always met by default game mechanics.

### Principle 20: Defense Element Irrelevance

Pure defense units (Pan, Zhao) provide their value through buffs, utility, and damage mitigation — not personal damage. Element resistance penalties on defense units are inappropriate because a defense unit's element being resisted by the boss has negligible gameplay impact. The engine removes the -10 resistance penalty for defense units while keeping the small +3 on-element bonus (which represents minor elemental resonance benefits beyond damage).

### Principle 21: Element Resistance and SubDPS/PseudoSupport Handling

Standard subdps units (Burnice, Vivian, Grace, Cissia) are **disqualified** when their element is resisted by the boss, just like any other DPS unit. They do not bypass resistance disqualification — their damage is their primary contribution, and element resistance makes them ineffective.

The **only** DPS exception is pseudo-support units (e.g., Orphie with `pseudoRole: "support"`). These bypass disqualification because they still contribute meaningfully as supports (buffing ATK, etc.) even when their damage element is resisted. However, they receive a **damage-proportional penalty** if they have significant damage mechanics (`damage` weight > 1). The penalty is `maxDamageWeight * 8`. This affects Orphie (`damage.aftershock:3`, penalty 24 on fire-resistant bosses).

For actual support/defense units, the same damage-proportional penalty applies when their element is resisted AND they have damage mechanics > 1. This affects Rina (`damage.ultimate:strong:2`, penalty 16 on electric-resistant bosses). Support/defense units with low or no damage mechanics continue to ignore element resistance entirely (Principle 20).

### Principle 22: Self-Provision Excludes Needs from Cohesion Check

When a DPS unit scales with a mechanic that it also provides to itself (e.g., Banyue has both `scaling.interrupt-resistance:2` and `utility.interrupt-resistance:2`), the DPS reception check in the Teamwork Multiplier should not count that as an unmet need. The self-provision check looks at the unit's own buffs, debuffs, and utility before counting a need toward the total. This prevents units like Banyue from being penalized for "missing" something they already have.

### Principle 23: Pseudo-DPS Role Activation Requires Team Context

A `pseudoRole` that includes a DPS type (attack, anomaly, rupture) only **activates** when the team contains a teammate whose primary tags include that DPS type. This models the idea that pseudo-roles indicate role flexibility: a unit only "becomes" that role when the team context supports it.

**Examples:**
- Soukaku (`pseudoRole: "anomaly"`, tags: support) on Miyabi/Soukaku/Yuzuha: Miyabi has `anomaly` tag → Soukaku's anomaly activates → she participates in disorder generation. Correct.
- Soukaku on Lycaon/Yixuan/Soukaku: No teammate has `anomaly` tag → Soukaku's anomaly does NOT activate → she's treated as a pure support. No inflated DPS consumer scoring.
- Soukaku on YSG/Zhao/Soukaku: No anomaly tag → she's a support providing ATK buff. Sensible emergent behavior.
- Nangong (`pseudoRole: "anomaly"`, tags: stun) on Nangong/Miyabi/Yuzuha: Miyabi has `anomaly` tag → Nangong's anomaly activates → she generates disorders. Correct.
- Nangong on Nangong/YSG/Sunna: No anomaly tag → Nangong is just a stunner. Correct — she's stunning, not doing anomaly things.
- Nangong/Soukaku/Yuzuha (hypothetical): Neither has `anomaly` in primary tags → neither activates → no DPS unit → disqualified. Correct — they can't "cast" each other.

**Non-DPS pseudo-roles** (stun, support, defense, subdps) always activate unconditionally — they don't require team context. Caesar's pseudo-stun always works; Orphie's pseudo-support always works.

**Implementation:** At the start of `scoreTeamForBoss`, activated roles are computed for each unit and cached as `_activatedRoles`. `getEffectiveRoles` returns these when available, falling back to the unconditional version for non-scoring contexts (team formation, etc.).

### Principle 24: Dual-Anomaly Teams Are Inherently Cohesive

Teams with a primary anomaly DPS + off-field anomaly subdps of a different element (e.g., Alice/Vivian/Yuzuha, Miyabi/Vivian/Yuzuha) are inherently cohesive. The subdps provides disorder triggers, elemental diversity, and off-field damage without competing for field time. These teams should NOT receive cohesion penalties for the subdps "not providing buffs." Nangong is strictly better than Vivian on these teams not because of a cohesion problem, but because Nangong provides anomaly buffs + stun + disorders on top of the same synergy pattern. The difference is a matter of kit breadth, not team incoherence.

### Principle 25: A Pseudorole IS a Role

When the engine computes a unit's activated roles (via `computeActivatedRoles`), those activated roles become the unit's identity for scoring purposes. All role-checking functions (`isDPS`, `isAttacker`, `isAnomaly`, `isRupture`, `isSupport`, `isDefense`, `isStun`) check `_activatedRoles` first, falling back to tags only when activated roles have not yet been computed (e.g., during team formation before scoring begins).

Consequences:
- Orphie (tags: `attack`, pseudoRole: `support,subdps`) → `isSupport(orphie)` returns true, `isAttacker(orphie)` returns true, `isDPS(orphie)` returns true
- Nangong (tags: `stun`, pseudoRole: `anomaly`) → when anomaly activates, `isAnomaly(nangong)` returns true alongside `isStun(nangong)`
- Caesar (tags: `defense`, pseudoRole: `stun`) → `isStun(caesar)` returns true (non-DPS pseudo-roles always activate unconditionally)

This architectural decision ripples through the scoring engine:
- **L1 Disqualifications**: Only "pure DPS" units (those without concurrent support, defense, or stun roles) count toward the triple-DPS disqualification. A team like Nangong/Alice/Vivian has three units with DPS roles, but Nangong also has a stun role — so only two are "pure DPS."
- **L1.5 Structure**: For DPS category counting, stun units are excluded from attacker/anomaly/rupture counts to prevent double-classification. Nangong on Nangong/Miyabi/Yuzuha is counted as a stunner (her primary tag), not as a second anomaly unit, yielding "anomaly hypercarry" structure instead of "double anomaly."
- **L2 Tier/Rank**: Units are scored in their primary role category. Pseudo-DPS stunners (Nangong) receive stun-level tier/rank scoring, not DPS-level. Pseudo-support DPS (Orphie) receive support-level tier/rank scoring. A unit already scored in the DPS loop is excluded from the non-DPS loop to prevent double-counting.
- **L3 Boss Matchup**: Shill matching checks raw tags (not activated roles) — a pseudosupport with `attack` in their tags but playing the support role can't satisfy an attack shill. Element resistance disqualification skips support/defense units entirely (they are penalized, not disqualified).

### Principle 26: Damage Contribution Determines Buff Relevance

Units divide into two fundamental categories based on whether they meaningfully convert offensive buffs into damage output:

- **Damage contributors**: Any unit with a DPS role (attack, anomaly, rupture) or a stun role. These units convert ATK buffs, crit buffs, element damage buffs, and defense shred into meaningful output. Stun units deal less damage than primary DPS but still benefit materially from offensive stats during stun windows and chain attacks.
- **Non-damage contributors**: Pure support and defense units whose personal damage is negligible. Offensive buffs landing on these units are like "doubling a two-dollar salary" — mathematically applicable but strategically irrelevant.

A subdps unit is always a damage contributor, even if it also holds a support pseudorole. Orphie's `pseudoRole: "support,subdps"` means she provides support infrastructure AND contributes meaningful damage. She benefits from ATK buffs, on-element bonuses, and stun multipliers. A hypothetical pure support with zero DPS roles would not.

This principle governs buff utilization calculations, element bonus sizing, and the supplier-side relevance checks throughout the engine. It is the conceptual foundation that makes Principles 2 and 6 consistent: non-damage-contributor supports are gated by buff utilization because their VALUE is in what they provide to damage contributors, not in their own output.

### Principle 27: Shill Is a Bonus, Not a Penalty

Boss shill preferences reward teams that match but do not penalize those that don't. When a team's DPS archetype matches the boss shill, the team receives a flat bonus. When it doesn't match, there is no penalty — the team simply doesn't receive the bonus.

This reflects gameplay reality: a rupture team against an anomaly-shill boss isn't "bad" — it just doesn't have the anomaly advantage. The team competes on its own merits through element matching, tier quality, and mechanical synergy. Shill-matching teams get rewarded; non-matching teams are neutral.

The exception remains non-DPS shills (currently only stun): if a boss requires a stunner and the team has none, the team is disqualified outright because certain boss mechanics make the shilled role mechanically essential to completing the fight.

### Principle 28: Ultimates Are a Primary DPS Resource

Free ultimates (provided by units like Dialyn and Ju Fufu via `utility.ultimates`) are a limited resource: during a stun window, the team can only execute one ultimate at a time, and it should go to the unit with the highest burst potential.

SubDPS units do not declare implicit ultimates scaling and do not receive need fulfillment credit for ultimates provision. The primary DPS consumes all ultimate resources. This prevents subdps units from double-dipping on a resource they wouldn't realistically receive in gameplay.

Quick assists, by contrast, are NOT a limited resource. They benefit all DPS roles including subdps, and all DPS units retain their implicit quick-assists baseline regardless of subdps status.

---

## Known Scoring Issues and Refactoring Status

### Primary Issue: Nangong Scoring Inversion

**Problem:** `<Anomaly DPS>/Vivian/Yuzuha` currently scores higher than
`Nangong/<Anomaly DPS>/Yuzuha` in the old engine for most anomaly bosses.

**Root cause:** The old engine's anomaly composition rules treat stunners as inherently
suboptimal for anomaly teams. The exceptions (stun-synergy tag, titled anomaly, monoshock)
are narrow carve-outs that don't capture the reality that some stunners are genuinely
superior to a second anomaly DPS.

**Status:** Being resolved by the mechanics-driven scoring refactoring. Nangong's mechanics
(`buffs.anomaly:3`, `debuffs.recovery:3`, `utility.disorders:2`, `pseudoRole:"anomaly"`)
directly express why she is valuable on anomaly teams. The mechanics engine's Baseline
Affinity, Need Fulfillment, and Stun Emergence rules combine to score
Nangong/Miyabi/Yuzuha ~60 points higher than Vivian/Miyabi/Yuzuha in Layer 4 alone.

### Secondary Issues (all addressed by mechanics refactoring)

* **Lycaon P1+ anomaly compatibility** — now expressed through `debuffs.ice:2` and
  `buffs.stun-multiplier:2`, providing granular benefit to ice DPS/stunners
* **Lighter's element synergy** — now expressed through `buffs.fire:2, ice:2` and
  `debuffs.recovery:3`, capturing both element buffing and stun extension
* **Abloom damage synergy** — now captured through `damage.abloom` entries on
  Nangong/Vivian/Aria/Burnice/Grace/Promeia
* **Chain attack synergy** — Evelyn's `scaling.chains:3` + Astra's `utility.chains:2`
  creates a 24-point Need Fulfillment match, replacing the `synergy.units` workaround
* **Defense shred incompatibility with rupture** — now emergent: Nicole's `debuffs.defense:3`
  scores 0 on rupture teams because Baseline Affinity excludes rupture from defense shred
* **Cissia incremental electric buff** — uffs.electric:2 naturally gives a small
  Baseline Affinity boost to all electric DPS and stunners on the team, including Rina

### Refactoring Progress

1. ~~Design the `mechanics` object~~ — **DONE** (see mechanics spec plan)
2. ~~Add `mechanics` to all units in `units.json`~~ — **DONE** (44 units with populated mechanics, 9 with empty baseline)
3. ~~Clean up `synergy` blocks in `units.json`~~ — **DONE** (all `synergy.tags` emptied except Ju Fufu's `["rupture"]`, all `synergy.avoid` emptied, all `synergy.units` emptied except data-level faction synergies)
4. ~~Refactor `team-scorer.js`~~ — **DONE** (mechanics-driven 5-layer architecture implemented with iterative tuning)
5. **Validate against scoring baseline** — ongoing iterative tuning
6. **NOT included in this phase:** Wind element, catalysis, element interaction matrices, on-field/off-field modeling


