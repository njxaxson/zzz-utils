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

**Aria** - Stun-Synergy Anomaly
- Has `synergy.tags: ["stun"]` despite being anomaly
- Enables stun/anomaly/support compositions
- Mutual synergy with Sunna (both list each other)
- Valid: Stun/Aria/Astra, Aria/Sunna/Yuzuha
- Invalid: Aria/Astra/Nicole (no stun, no explicit synergy)

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
- **Nicole** - 40% defense debuff (huge); BAD for rupture (defense debuff useless); ether synergy with Vivian
- **Sunna** - YSG/Aria specialist via mutual synergy; BAD for rupture (avoid tag)
- **Rina** - Electric specialist; defense penetration generally useful for attack and anomaly teams; useless for rupture. Relatively high ultimate damage for a support unit. 
- **Soukaku** - Ice specialist ONLY; useless without ice DPS. Very high anomaly buildup for a support unit; is practically a pseudo-anomaly unit. 

**Universal Generalists:**
- **Astra** - Best all-around (+1200 ATK); default "if no specialist"
- **Caesar** - Medium ATK buff; helps Banyue prevent combo interruption
- **Lucy** - Small ATK buff (+600); slight fire synergy

**Note:** Attack archetype has no true specialist. T0 generalists (Astra) serve as de-facto specialists for attack teams and receive the +35 specialist bonus.

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
- Dead weight (avoid tag matches team archetype = 0)
- Regular generalist (+8)

### Synergy Scoring Paths
- Mutual synergy bonus (DPS +30, non-DPS +10)
- Subdps without main DPS (-100, or ignored in lenient)
- Element synergy wasted (-70)
- Avoid tag triggered by DPS = Disqualified (-999)

### Tier Scoring
- DPS tier: T0/T0.5 elite (+65/+55), T1/T1.5 good (+25/+20), T2+ penalized
- Support/stun tier: ~35% weight of DPS
- Titled bonus: +20 additional
- Subdps attacker with other attacker: 50% tier multiplier
