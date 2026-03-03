# Team Scoring Engine Context

This file provides domain knowledge for the ZZZ team scoring algorithm.
Reference when modifying `app/public/lib/team-scorer.js`.

**Important:** `app/public/data/units.json` is the source of truth for tier rankings.
This file captures gameplay mechanics and algorithm design decisions only.

---

## Scoring Philosophy

### Core Principles

1. **DPS Quality Dominates** - The DPS unit's tier matters MORE than support tier. A T0 support with T3 DPS produces mediocre results. Support tier is weighted at ~35% of DPS tier.

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
- Can partially overcome element mismatches through raw power
- Get reduced off-element penalties (50% reduction)
- Compete with shill-matching teams when on-element

### Neutral Boss Handling

When boss has no weaknesses (neutral):
- NO element bonuses are given
- Teams compete purely on tier and composition quality
- Anomaly teams don't get "all on-element" treatment

### Shill Intensity

Not all boss shills are created equal. Some bosses have fight mechanics that make
their shill dramatically more impactful than the standard +15/-10/-35 suggests.

**Boss-side parameter:** `shillIntensity` (default: 1, implicit for most bosses)

**Current effect:** Amplifies the favored unit bonus. At intensity 2, each favored
unit is worth significantly more than the default +25. This captures boss-specific
mechanics (like Discordant Solo's Ether Veil stacking) that make certain units
disproportionately valuable against specific bosses.

**Diminishing returns:** When multiple favored units appear on the same team at high
shill intensity, the compounding should not be too aggressive. The first favored unit
gets the full amplified bonus; additional favored units receive a reduced multiplier
to prevent runaway score inflation.

**Future extensibility:** The parameter is designed to also support amplifying the
shill match/mismatch penalties (+15/-10/-35) in the future, but currently only affects
favored bonuses.

**Bosses with non-default shill intensity:**
- **Discordant Solo** (`shillIntensity: 2`): Sunna's Ether Veil stacking mechanic
  makes her irreplaceable (see Boss-Specific Knowledge below)
- **Sacrifice Bringer** (`shillIntensity: 2`): This boss is one of the few that is 
  vulnerable to the Freeze status effect, so as an ice-anomaly unit Miyabi can easily
  paralyze this boss (literally) and prevent them from acting. This makes the fight 
  trivial when using Miyabi. 

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
- Attack teams NEED a stunner (creates damage windows)
- Double attacker is bad unless one has `subdps` synergy tag
- Stunless exception: Units with `synergy.tags.includes("stunless")` can skip stunner

**Stunless Composition (YSG):**
YSG has a unique "stunless" tag because she gets stun damage multipliers FOR FREE (200% built-in). This means:
- She doesn't need a stunner to deal maximum damage
- Double-support composition (YSG + 2 supports) is her ideal setup
- The algorithm gives +40 for double support with stunless attacker
- Having a stunner with YSG is actually suboptimal (-10 penalty)

**Why Double Support Works for YSG:**
- Her +240% crit damage with guaranteed crits
- Built-in stun multiplier (no stunner needed)
- Double buff (~45% ATK boost) pumped through her multipliers = massive damage

**Dialyn Exception:** The only stunner that helps YSG is Dialyn, who provides FREE ULTIMATE attacks. YSG has a double-ultimate (both highest-damage attacks in game). This creates comparable output to ideal Miyabi/Yixuan teams.

### Rupture Teams

**Standard:** stun + rupture + support/defense
**Alternative:** rupture + 2x support/defense (S-rank only)

**Key Rules:**
- A-rank rupture REQUIRES stunner (unless boss shills rupture)
- S-rank rupture can use double-support composition
- Synergistic stunners (Dialyn, Ju Fufu with `synergy.tags.includes("rupture")`) get +20 bonus
- Non-synergistic stunners get -20 penalty on rupture teams

**Important:** Rupture deals Sheer damage which IGNORES enemy defense. Nicole's 40% defense debuff is literally useless for rupture - she's disqualified via `synergy.avoid: ["rupture"]`.

### Anomaly Teams

**Ideal:** double anomaly + specialist support (Yuzuha)
**Valid:** titled anomaly + support/defense + (stun OR explicit synergy partner)
**Valid:** stun-synergy anomaly + stunner + support
**Valid:** anomaly/support/support (with explicit synergy - see below)

**Key Rules:**
- Solo non-titled anomaly without stun synergy = DISQUALIFIED
- Anomaly teams prefer support/defense over stun (minor penalty for stunner)
  - EXCEPTION: Monoshock compositions can use stunner without penalty (all three must be same element)
- Double anomaly should have different elements (+20) not same element (-15)
- Titled anomaly can solo with support if on-element

**Stun-Synergy Anomaly Pattern:**
Some anomaly units have `synergy.tags.includes("stun")` (e.g., Aria). These units:
- Can work in stun/anomaly/support compositions (like attack teams)
- Do NOT receive the normal stunner penalty
- Can also use explicit unit synergy to enable double-support (e.g., Aria/Sunna/Yuzuha)
- Score lower than titled anomaly due to tier difference, not the mechanic
- **Important:** When stun-synergy anomaly compositions qualify (via stunner OR
  explicit unit synergy), they should ALSO qualify for the full anomaly composition
  bonuses (base comp bonus, support bonus, etc.) - i.e., they should be treated as
  a valid anomaly comp, not just "not disqualified."

**Anomaly/Support/Support Pattern (Explicit Synergy):**
Any non-subdps anomaly unit that has an explicit synergy partner on the team can
use the anomaly/support/support composition pattern. This generalizes the Aria
pattern to any anomaly DPS with named synergy connections.
- Valid: Aria/Sunna/Yuzuha (Aria ↔ Sunna mutual synergy enables this)
- Invalid: Alice/Astra/Yuzuha (Alice has no explicit synergy.units → cannot use
  this pattern; Alice must use double-anomaly comp instead)
- Invalid: Vivian/Astra/Nicole (subdps cannot carry as primary DPS)
- Invalid: Burnice/Lucy/Caesar (subdps cannot carry)
- Invalid: Grace/Rina/Astra (subdps cannot carry)
- The explicit synergy requirement prevents every anomaly unit from using this
  pattern; only those with genuine named partnerships qualify

### Invalid Compositions

- Attack + Rupture mixing = Disqualified (-999)
- Attack + Anomaly without synergy = Disqualified
- Anomaly + Rupture mixing = Disqualified
- 3+ DPS units = Disqualified
- 0 DPS units = Disqualified

---

## Special Unit Mechanics

### Units with Unique Playstyles

**YSG (Ye Shunguong)** - Stunless Attacker
- Has `synergy.tags: ["stunless"]` - doesn't need stunner
- Mutual synergy with Zhao (both list each other)
- Mutual synergy with Sunna (via Sunna listing YSG)
- Ideal teams: YSG/Zhao/Sunna or Dialyn/YSG/Sunna

**Harumasa** - Monoshock Composition
- Has `synergy.tags: ["anomaly"]`
- Monoshock requires ALL THREE team members to share the same element
- Valid: Grace/Harumasa/Rina (all electric), Trigger/Grace/Harumasa (all electric)
- Invalid: Yanagi/Harumasa/Astra (Astra is ether, not electric)
- Two composition patterns (both require same-element third):
  - Stun/Anomaly/Attack (e.g., Trigger/Grace/Harumasa) - stunner provides damage windows, anomaly as pseudo-support (+56 bonus)
  - Anomaly/Attack/Support (e.g., Grace/Harumasa/Rina) - support enhances both DPS units, better for hybridization due to element synergy
- The "monoshock" composition is actually a generic rule that can apply to other elements, for example a fire attacker with an anomaly synergy can be paired with a fire anomaly agent and either a fire stun or fire support/defense unit. It just so happens that Harumasa is the only attacker who currently supports hybrid attack+anomaly teams, so the principle example is an electric team; hence the nomenclature. 

**Hugo** - Stun-Synergy Attacker
- Has `synergy.tags: ["stun"]`
- NEEDS two stunners for optimal play
- Single stunner is suboptimal (-30)
- Double stun with Hugo gets +70 (compensates for missing support)

**Aria** - Stun-Synergy Anomaly (AoD Faction)
- Has `synergy.tags: ["stun"]` despite being anomaly
- Enables stun/anomaly/support compositions
- Mutual synergy with Sunna (both list each other)
- Valid: Stun/Aria/Astra, Aria/Sunna/Yuzuha
- Invalid: Aria/Astra/Nicole (no stun, no explicit synergy)
- **Unique playstyle:** Aria plays like an attacker despite being anomaly - she wants
  stun windows to unload powerful attacks, rather than relying on disorder reactions
  like most anomaly units. Her stun-synergy tag reflects this attacker-like playstyle.
- When Nangong Yu (upcoming AoD ether stunner) is released, the best-in-slot for
  Aria will be Nangong/Aria/Sunna (stun/anomaly/support - the standard stun-synergy
  anomaly pattern). Until then, Aria/Sunna/Yuzuha is her best team.

**Seed** - Requires Second Attacker
- Has `synergy.tags: ["attack"]` and `join: ["attack"]`
- Best paired with Orphie (mutual synergy)
- Cannot function without another attacker on team

### Subdps Units

Units with `synergy.tags.includes("subdps")` need a MAIN DPS teammate (any DPS without subdps tag):
- **Burnice** - Fire anomaly subdps
- **Grace** - Electric anomaly subdps
- **Vivian** - Ether anomaly subdps (T0, serves as subdps to Miyabi)
- **Orphie** - Fire attack subdps (acts as support for other attackers)

When subdps attacker (Orphie) pairs with another attacker, the subdps gets 50% tier multiplier.

### Support Classification

**Specialists** (exactly ONE DPS role in synergy.tags, other TWO in avoid):
- **Lucia** - Rupture specialist (+1200 Sheer)
- **Yuzuha** - Anomaly specialist (multi-element synergy)
- **Pan Yinhu** - Rupture specialist (+720 Sheer, A-rank)

**Conditional/Partial Supports:**
- **Zhao** - YSG specialist via mutual synergy; good generalist for attack/anomaly; BAD for rupture (avoid tag)
- **Nicole** - 40% defense debuff (huge); BAD for rupture (defense debuff useless); ether synergy with Vivian. **Known issue (future work):** Nicole's defense debuff is less valuable against bosses with already-low defense (e.g., anti-rupture bosses like Primordial Nightmare and Discordant Solo). The algorithm currently has no mechanism to express this; needs a new boss-side property (e.g., `lowDefense`) and a unit-side tag to reduce her contribution on such fights.
- **Sunna** - YSG/Aria specialist via mutual synergy; BAD for rupture (avoid tag). Also has unique Ether Veil mechanics that make her irreplaceable against certain bosses (see Boss-Specific Knowledge).
- **Rina** - Electric specialist; defense penetration generally useful for attack and anomaly teams; useless for rupture. Relatively high ultimate damage for a support unit. 
- **Soukaku** - Ice specialist ONLY; useless without ice DPS. Very high anomaly buildup for a support unit; is practically a pseudo-anomaly unit. 

**Universal Generalists:**
- **Astra** - Best all-around (+1200 ATK); default "if no specialist"
- **Caesar** - Medium ATK buff; helps Banyue prevent combo interruption
- **Lucy** - Small ATK buff (+600); slight fire synergy

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
- **Angels of Delusion (AoD)** - The most explicitly synergistic faction. Members
  (Aria, Sunna, and upcoming Nangong Yu) strongly prefer being with each other.
  The faction is designed around a new approach to anomaly team construction where
  Aria doesn't depend on double-anomaly DPS (similar to Miyabi in this regard).
  Nangong Yu will be an ether stunner designed for anomaly teams, completing the
  stun/anomaly/support archetype for AoD.
- **Obol** - Synergistic (Seed/Orphie mutual synergy, Trigger integration)
- **Section 6** - Originally built to be very synergistic
- **Pubsec** - Originally built to be very synergistic

**Anti-Synergistic Factions:**
- **Mockingbird** - Hugo and Vivian don't help each other at all

**Nangong Yu (Upcoming AoD Member):**
- Ether stunner designed for anomaly teams
- Expected best-in-slot: Nangong/Aria/Sunna (stun/anomaly/support)
- May also pair well with Miyabi and other anomaly primary DPS
- Nangong+Sunna may serve as a "wheelchair" stunner+support duo that slots with
  various attackers and primary-dps anomaly agents
- Not yet in units.json; no preview data available

---

## Boss-Specific Knowledge

### Discordant Solo (Vesper)
- **Weaknesses:** ether | **Resistances:** ice, fire | **Shill:** anomaly | **Anti:** rupture
- **Shill Intensity:** 2 (one of only two bosses with non-default intensity)
- **Favored:** Aria, Sunna

**Ether Veil Mechanic:** Several units can create Ether Veils (Lucia, Yidhari, Zhao,
Sunna), but most can only create or extend one at a time - by the time it wears off,
so does the associated debuff. Sunna is unique: she *recreates* the Ether Veil each
time, allowing stacking debuffs that drastically increase Discordant Solo's
vulnerability. This boss fight was designed to require Sunna.

**Team Rankings (target ordering):**
- With Aria: **Aria/Sunna/Yuzuha** is the clear #1 team
- Without Aria: **Alice/Vivian/Sunna** ≈ **YSG/Sunna/Zhao** (roughly equal, both
  narrowly ahead of Alice/Vivian/Yuzuha)
- Alice and Yanagi are roughly interchangeable in the anomaly DPS slot (both off-element,
  same tier, neither resisted). Alice is slightly better but the difference is not
  material for scoring purposes.
- Narrowed viable pool: only Discordant Solo and Primordial Nightmare resist two
  elements, making team construction unusually restrictive

**Why Yuzuha alone isn't enough:** Yuzuha is still excellent here (and belongs on the
Aria team), but Sunna's Ether Veil stacking provides boss-specific debuffs that
Yuzuha cannot replicate. The ideal Aria team brings BOTH supports.

### Sacrifice Bringer
- **Weaknesses:** ice | **Resistances:** physical | **Shill:** anomaly
- **Shill Intensity:** 2
- **Favored:** Miyabi

Without Miyabi, this boss is quite difficult. With her the fight is trivially easy 
(as explained why earlier in this document). Extra Miyabi-dominance in scoring is
intentional and correct.

---

## Data Structure Reference

### Unit Synergy Object

```json
{
  "units": ["Specific unit names"],
  "tags": ["DPS roles", "elements", "subdps", "stun", "stunless"],
  "avoid": ["DPS roles to avoid"]
}
```

- `synergy.units` - Explicit named synergies (e.g., Evelyn lists Astra)
- `synergy.tags` - What this unit synergizes WITH
- `synergy.avoid` - What this unit should NOT be paired with

### Mutual Synergy

When BOTH units list each other in `synergy.units`:
- Base synergy: +5
- DPS mutual bonus: +25 (total +30 for DPS)
- Non-DPS mutual: +5 (total +10)

Current mutual synergy pairs:
- YSG ↔ Zhao
- Aria ↔ Sunna
- Seed ↔ Orphie
- SAnby ↔ Orphie

### Boss Data Object

```json
{
  "id": "solo",
  "name": "Discordant Solo",
  "weaknesses": ["ether"],
  "resistances": ["ice", "fire"],
  "shill": "anomaly",
  "anti": ["rupture"],
  "assists": 0,
  "favored": ["Aria", "Sunna"],
  "shillIntensity": 2
}
```

- `shillIntensity` (optional, default 1): Amplifies favored unit bonuses. Higher
  values mean the boss fight is more heavily skewed toward its favored units.
  Currently only affects favored bonus; designed to be extensible to also amplify
  shill match/mismatch penalties in the future.

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
- Boss with `anti:[archetype]` + team has that archetype DPS
- Element resistance on DPS
- 3+ DPS or 0 DPS
- Solo non-titled anomaly (without stun synergy)
- Attack + Rupture mixing
- A-rank rupture without stunner (non-rupture-shill boss)

### Archetype-Specific Paths
- Anomaly composition bonus (double anomaly, element diversity)
- Stun-synergy anomaly exception (Aria pattern)
- Stunless attacker exception (YSG pattern)
- Double-stun justified by stun-synergy DPS (Hugo pattern)
- Monoshock composition with support (Anomaly/Attack/Support - Grace/Harumasa/Rina)
- Monoshock composition with stun (Stun/Anomaly/Attack - Trigger/Grace/Harumasa)
- Synergistic vs non-synergistic stunner on rupture

### Support Contribution Paths
- Matching specialist (+35)
- T0 generalist on attack team (de-facto specialist +35)
- Boss-favored support on high-intensity boss (enhanced contribution, pseudo-specialist)
- Dead weight (avoid tag matches team archetype = 0)
- Regular generalist (+8)

### Synergy Scoring Paths
- Mutual synergy bonus (DPS +30, non-DPS +10)
- Subdps without main DPS (-100, or ignored in lenient)
- Element synergy wasted (-70)
- Avoid tag triggered by DPS = Disqualified (-999)

### Shill Intensity Paths
- shillIntensity > 1: amplified favored bonus (with diminishing returns for multiple)
- Boss-favored support + synergizes with team archetype + shillIntensity > 1: enhanced contribution

### Tier Scoring
- DPS tier: T0/T0.5 elite (+65/+55), T1/T1.5 good (+25/+20), T2+ penalized
- Support/stun tier: ~35% weight of DPS
- Titled bonus: +20 additional
- Subdps attacker with other attacker: 50% tier multiplier
