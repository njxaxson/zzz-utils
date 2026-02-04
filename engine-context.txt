# Team Scoring Engine Context
# ===========================
# This file contains domain knowledge for the ZZZ team scoring algorithm.
# Include this file when making modifications to app/public/lib/team-scorer.js

## UNIT CLASSIFICATION

### DPS Roles (Primary Damage Dealers)
- attack: Traditional attackers, need stunner to function (except "stunless" units)
- anomaly: Disorder/anomaly damage dealers, prefer double anomaly compositions
- rupture: Break damage dealers, benefit from stun windows

### Support Roles
- support: Buff/utility providers
- defense: Defensive supports, provide shields/damage reduction
- stun: Stun providers, create damage windows for DPS

### Tier System
- T0: Elite tier (titled units are always T0)
- T0.5: Near-elite
- T1: Good
- T1.5: Decent
- T2: Mediocre
- T3: Bad (e.g., Nekomata)
- T3.5: Very bad
- T4: Terrible (e.g., Ben) - near-disqualifying

### Titled Units (Extra Powerful S-Ranks)
Current titled units:
- Miyabi (ice anomaly) - T0
- Ye Shunguong/YSG (physical attack) - T0
- Yixuan (ether rupture) - T0

Titled units are significantly stronger than non-titled units of the same tier.
They can partially overcome element mismatches through raw power.


## IDEAL TEAM COMPOSITIONS

### Ideal Anomaly Team
Miyabi / Vivian / Yuzuha
- Miyabi: Primary anomaly DPS (titled)
- Vivian: Secondary anomaly DPS (subdps role)
- Yuzuha: Anomaly SPECIALIST support (+35 bonus)

NOTE: Miyabi/Vivian/Astra is WORSE than Miyabi/Vivian/Yuzuha by a significant margin.
Yuzuha (specialist) >>> Astra (generalist) for anomaly teams.

### Ideal Rupture Team
Dialyn / Yixuan / Lucia
- Dialyn: Synergistic stunner (has rupture synergy tag)
- Yixuan: Primary rupture DPS (titled)
- Lucia: Rupture SPECIALIST support

### Ideal Attack Team
Ye Shunguong / Zhao / Sunna (or Dialyn/YSG/Sunna)
- YSG: Primary attack DPS (titled, stunless)
- Zhao: YSG's best-in-slot partner (unique mutual synergy)
- Sunna: YSG specialist support (unique mutual synergy, replaces Astra)

Alternative compositions (roughly equal):
- Dialyn/YSG/Sunna: Stunner for free ultimates (Sunna slightly better than Zhao here - buffs Dialyn)
- YSG/Zhao/Astra: Still excellent if Sunna unavailable

#### Why YSG + Double Support is So Powerful
YSG has incredible crit damage multipliers (+240%) with guaranteed crits.
She also gets a "stun multiplier" of 200% FOR FREE (doesn't need stunner).
Double-buff (Zhao+Astra) gives ~45% attack boost.
When pumped through crit multiplier and free stun multiplier = stratospheric damage.

Most attackers can't take advantage of this because they NEED a stunner first.
YSG gets the stun multiplier without needing to stun the enemy.

Dialyn is the only stunner that helps YSG - provides FREE ULTIMATE attacks.
YSG has a double-ultimate (both are highest damaging attacks in the game).
Dialyn/YSG with constant ultimates = absurd damage output.

Comparable output: Dialyn/Yixuan/Lucia (Yixuan also has double-ultimate, bypasses defense)
Comparable output: Miyabi teams (pseudo double-ultimate, lots of defense penetration)


## SPECIFIC UNIT RULES

### Zhao
- Good generalist support for attack and anomaly teams
- BAD for rupture teams (has avoid:rupture tag)
- BEST-IN-SLOT for YSG specifically due to unique mutual synergy
- Not as universally good as Astra, but better than Astra when paired with YSG

### Orphie
- Technically an ATTACKER but functions as "support in disguise"
- Has "subdps" in synergy tags
- When paired with another attacker, acts as support (reduced tier contribution)
- Valid compositions: stunner/attacker/Orphie (Orphie is the "support")
- Synergizes specifically with Seed and SAnby

### Seed
- REQUIRES a second attacker to function (unique mechanic)
- Best paired with Orphie (who acts as her support)
- Seed+Orphie is a valid and strong pair, but NOT competitive with titled units

### SAnby
- NOT a subdps - she is the best electric attacker and a strong primary DPS
- Only Orphie is a true subdps among attackers

### Burnice
- Has "subdps" synergy tag - needs a MAIN DPS teammate
- T1 anomaly, not as strong as T0 units
- Should not dominate rankings over titled units

### Vivian
- T0 anomaly, serves as subdps to Miyabi in double anomaly compositions
- Not a standalone hypercarry like Miyabi

### Nekomata
- T3 garbage, should rarely appear in rankings
- Only "real" use is as emergency enabler for Seed, but not her intended role

### Aria
- T1 ether anomaly DPS with unique "stun synergy" mechanic
- Has "stun" in synergy.tags - enables stun/anomaly/support compositions
- Valid compositions:
  - stun + Aria + support/defense (unique among non-titled anomaly)
  - Aria + explicit synergy unit + support (e.g., Aria/Sunna/Yuzuha)
  - Aria + anomaly + support (traditional double-anomaly)
- INVALID: Aria + double support WITHOUT stunner or explicit synergy (e.g., Aria/Astra/Nicole)
- Scores lower than Miyabi in equivalent compositions due to tier gap (T1 vs T0)
- Future-proofed: Any anomaly with `synergy.tags.includes("stun")` gets same treatment
- Mutual synergy with Sunna (both list each other) - enables Aria/Sunna/support compositions
- Part of AoD faction with Sunna (future unit Nangong Yu expected to complete the trio)

### Sunna
- T1 physical support with mutual synergy to YSG and Aria
- Better than Astra when paired with YSG or Aria (mutual synergy bonus)
- synergy.tags includes "attack" and "anomaly" - works with Dialyn's attack damage
- Dead weight on rupture teams (has avoid:rupture tag)
- Part of AoD faction with Aria
- YSG's ideal teams now include Sunna:
  - YSG/Zhao/Sunna (double-support, Sunna replaces Astra)
  - Dialyn/YSG/Sunna (Sunna slightly better than Zhao when using Dialyn)


## SUPPORT UNIT REFERENCE

### Attack Buff Comparison (for reference)
- Astra: +1200 ATK (highest)
- Zhao: +1000 ATK
- Yuzuha: +1000 ATK
- Lucia: +1200 Sheer (rupture-only stat)
- Pan: +720 Sheer (rupture-only stat)
- Lucy: +600 ATK (small)
- Caesar: Medium ATK buff

### Universal Generalists (work with ANY archetype)
These supports work with attack, anomaly, AND rupture teams.

**Astra (T0)** - Best all-around support
- Provides largest attack bonus of all supports (+1200)
- Best for attack teams where no specialist exists
- Good for anomaly (but Yuzuha is better)
- Good for rupture (but Lucia is better)
- ESPECIALLY synergizes with Evelyn (chain attack mechanics)
- The default "if you don't have the specialist, take Astra"

**Caesar (T1.5)** - Pure generalist
- Medium attack buff, universally useful
- Particularly helpful for Banyue (prevents combo interruption)
- Otherwise truly generic - works anywhere equally

**Lucy (T1.5)** - Pure generalist
- Small attack buff (+600), universally useful
- Slightly better with fire agents (consistent anomaly application)
- Otherwise truly generic - works anywhere equally

### Archetype Specialists

**Yuzuha (T0)** - Anomaly Specialist
- Best-in-slot for anomaly teams
- Provides powerful anomaly-specific buffs that outweigh Astra's higher ATK
- Technically usable on attack teams as generic attack buffer (but wasteful)
- Essentially wasted outside anomaly but can still be useful on attack teams if you don't have better options
- Element synergy with ALL elements (fire, ice, electric, physical, ether) - she can change her element to match the DPS's element

**Lucia (T0)** - Rupture Specialist
- Best-in-slot for rupture teams
- Buffs Sheer damage (+1200) - stat unique to rupture
- Almost entirely useless outside rupture
- Has avoid:attack and avoid:anomaly tags

**Pan (A-rank)** - Rupture Specialist
- GOOD on rupture teams but not as good as Lucia
- Buffs Sheer damage (+720)
- Only viable on rupture, useless elsewhere
- Male character (one of the few)

### Partial/Conditional Supports

**Zhao (T0.5)** - YSG Specialist / Good Generalist
- "Ether Veil Specialist" - YSG is currently the only unit using this mechanic
- BEST-IN-SLOT for YSG specifically (unique mutual synergy)
- When Sunna is available: YSG/Zhao/Sunna is ideal (Sunna replaces Astra)
- GOOD (not just acceptable) for other attackers and anomaly
- Provides +1000 ATK, increases general damage output
- Astra is better than Zhao for non-YSG units
- BAD for rupture (has avoid:rupture tag)

**Nicole (T0.5)** - Attack/Anomaly Support, Rupture Excluded
- Provides 40% defense debuff (ENORMOUS)
- However: Rupture deals Sheer damage which IGNORES defense
- Nicole's debuff is literally USELESS for rupture
- Small ether damage buff and crit buff (minor synergy with Yixuan, not enough)
- On anomaly: Synergizes with Vivian (ether) - comparable to Zhao, often given edge
- Against high-defense bosses: Nicole's defense debuff is harder to come by
- HARD DISQUALIFY for rupture teams (would rather take A-rank Pan)

**Rina (T0.5)** - Electric Specialist / Anomaly Viable
- Provides defense penetration (useful for attack/anomaly generally)
- High anomaly output - works as pseudo-anomaly unit
- Very good on electric teams (Shock damage synergy) but might still be outclassed by Astra or Yuzuha
- Electric units get buffs for attacking shocked enemies (Monoshock teams)
- Ultimate damage on par with DPS units against electric-weak bosses
- Grace+Rina constantly shock → Harumasa gets big bonuses
- Can work with Miyabi (defense pen + disorder from electric anomaly), although unconventional
- Against non-electric bosses: still good, just not as impactful

**Soukaku (T0.5)** - Ice Specialist
- Specifically buffs ice damage output for a single unit
- Extraordinarily high anomaly output (practically pseudo-anomaly unit)
- TOTALLY USELESS without an ice DPS
- Amazing partner for Miyabi, works great with Ellen
- Acceptable alternative for Yidhari
- "No-other-choice" support for Hugo
- Ice element synergy ONLY

**Seth (T3)** - Desperate Option
- Passable on electric teams and anomaly teams
- Relatively high anomaly output for a non-anomaly unit
- You would NEVER want him with better options available
- Only use: new accounts with few limited characters
- Near-disqualifying tier

**Sunna (T1)** - YSG/Aria Specialist
- Mutual synergy with YSG and Aria (both list each other in synergy.units)
- BETTER than Astra when paired with YSG or Aria (mutual synergy bonus)
- For YSG: Sunna replaces Astra in double-support comps (YSG/Zhao/Sunna)
- When using Dialyn with YSG: Sunna slightly better than Zhao (buffs Dialyn's attack damage)
- synergy.tags: ["attack", "anomaly"] - works with any attacker or anomaly DPS
- BAD for rupture (has avoid:rupture tag) - dead weight, 0 contribution
- Astra remains better generalist for non-YSG/non-Aria units

### Attack Teams Have No True Specialist
- Unlike anomaly (Yuzuha) and rupture (Lucia), attack has no dedicated specialist
- Astra is the best support for attack teams BY DEFAULT
- This creates a scoring imbalance vs specialist-equipped teams
- Consider compensating bonus for attack teams to balance


## SCORING PHILOSOPHY

### Scoring is Objective, Not Roster-Relative
Team scoring operates in a vacuum: given three units, return an objective score.
- Same team = same score for everyone, regardless of individual rosters
- Do NOT assume better units are available when evaluating
- Roster-specific optimization happens at higher level (e.g., Deadly Assault algorithm)
- The scoring function should NOT take roster as input

### Core Principle: DPS Quality Dominates
The DPS unit's tier matters MUCH MORE than support tier.
A great support helping a garbage DPS = mediocre result at best.
Supports ENHANCE good teams but cannot CARRY bad DPS.

Support tier should be weighted at ~35% of DPS tier.

### Element Priority
1. On-element + On-shill = Best
2. On-element + Off-shill = Still competitive (especially for titled units)
3. Off-element + On-shill = Not ideal but can range from good to only viable, depending on quality of units
4. Off-element + Off-shill = Bad
5. Resisted element = Near-disqualifying (return -1)

### Titled Unit Advantage
Titled units (Miyabi, YSG, Yixuan) should:
- Dominate over lower-tier units even with element disadvantage
- Get reduced off-element penalties (50% reduction)
- Be able to compete with shill-matching teams when on-element

### Specialist vs Generalist Supports
Matching specialist > Generalist > Mismatched specialist

Examples:
- Lucia (rupture specialist) on rupture team: BEST
- Astra (generalist) on rupture team: GOOD
- Lucia on attack team: BAD (heavy penalty)

### Support Philosophy
Supports ENHANCE teams but do NOT BREAK them.
- An uncohesive support misses damage potential but doesn't ruin the team
- Dialyn+Yixuan will destroy enemies regardless of third unit
- Even bringing Soukaku (who does nothing for rupture) won't stop the team from winning
- Supports can MAKE a fight (enable clearing harder content) but not BREAK it


## BOSS MECHANICS

### Boss Attributes
- weaknesses: Elements boss is weak to (on-element bonus)
- resistances: Elements that deal reduced damage (near-disqualifying)
- shill: Preferred DPS type (attack/anomaly/rupture) - bonus for matching
- anti: DPS types that are ineffective (disqualifying)
- assists: Defensive assist requirement (0, 1, 2, or 3)

### Neutral Boss (No Weaknesses or Shills)
- All elements are equally viable
- NO element bonuses should be given (teams compete on tier/composition)
- Anomaly teams should NOT get "all on-element" treatment
- All archetypes should compete fairly on neutral boss

### Shill vs Element Priority
Element matching is MORE important than shill matching.
A titled on-element unit that doesn't match shill is still very competitive.
Example: YSG (physical attack) vs Fiend (anomaly shill, physical weak)
- YSG is on-element but off-shill
- Should still rank well because of element match + titled power


## COMMON SCORING MISTAKES TO AVOID

### 1. Support Tier Overshadowing DPS Tier
WRONG: T0 support + T3 DPS scoring higher than T1 support + T0 DPS
RIGHT: DPS tier should be the primary factor

### 2. Same-Element Requirement for DPS Role Synergy
WRONG: Ju Fufu (fire) only synergizes with fire rupture units
RIGHT: Ju Fufu synergizes with ANY rupture unit (element doesn't matter for role synergy)

Element synergy (like Soukaku's "ice") is different from role synergy (like "rupture").

### 7. Confusing Element Synergy with Archetype Synergy
Example: Miyabi (ice anomaly) + Rina (electric support)
- Rina works with "anomaly" archetype ✓
- Rina does NOT provide "ice" element synergy ✗
- Result: Acceptable but suboptimal - Rina provides defense pen + potential disorder damage with additional electric units (both good), so Trigger+Rina+Miyabi can work
- Better: Miyabi + Soukaku (ice specialist) or Miyabi + Yuzuha (anomaly specialist)

### 8. Treating Zhao and Nicole as Interchangeable
Both work on anomaly teams but in different ways:
- Zhao: Buffs attack and general damage output
- Nicole: Debuffs enemy defense by 40%, small ether/crit buffs
- Nicole's defense debuff is RARER than Zhao's attack buff
- Against high-defense bosses (like Hunter): Nicole is clearly better
- General case: Nicole often given slight edge
- With Vivian (ether): Nicole's ether synergy is slightly advantageous
- Exception: Never take anomaly team against rupture-shill boss anyway

### 3. Neutral Boss Giving Full Element Bonuses
WRONG: Anomaly teams get full double-anomaly bonuses on neutral boss
RIGHT: Neutral boss = no element bonuses, pure tier/composition competition

### 4. Double DPS Getting Double Tier Value
WRONG: Orphie+Evelyn both get full tier bonuses (+55+55=+110)
RIGHT: Subdps attackers (Orphie) get reduced tier when paired with another attacker (50%)

### 5. Off-Element Titled Losing to On-Element Non-Titled
Context matters, but generally:
- T0 titled off-element should compete with T0.5 on-element
- The tier gap matters more than element alignment in many cases
- Yixuan (T0 titled) should beat Komano (A-rank) even when Komano is on-element

### 6. Ignoring Anti-Archetype Mechanics
Boss with anti:anomaly should heavily penalize/disqualify anomaly teams.
This is more severe than just shill mismatch.


## TEAM COMPOSITION RULES

### Attack Teams
- Standard: stunner + attacker + support/defense
- Stunless exception: YSG can skip stunner (has "stunless" synergy tag)
- Double attacker is BAD unless one has "subdps" synergy (Orphie)

### Rupture Teams
- Standard: stunner + rupture + support/defense
- S-rank rupture CAN use double support composition
- A-rank rupture REQUIRES a stunner (unless boss shills rupture)
- Synergistic stunners (Dialyn, Ju Fufu) are better than generic stunners

### Anomaly Teams
- Ideal: double anomaly + specialist support (Yuzuha)
- Valid: single titled anomaly + support/defense (+ stun OR explicit synergy unit)
- Valid: stun-synergy anomaly + stunner + support/defense (see below)
- Solo non-titled anomaly (without stun synergy) is DISQUALIFIED
- Anomaly teams prefer support/defense over stun (EXCEPT stun-synergy anomaly)
- Having a stunner on regular anomaly team is a minor penalty

#### Stun-Synergy Anomaly Pattern
Some anomaly units have "stun" in their synergy.tags (e.g., Aria).
These units can work in compositions similar to titled anomaly (like Miyabi):
- Detection: `unit.synergy?.tags?.includes("stun")` AND unit is anomaly
- Valid: stun + stun-synergy-anomaly + support/defense
- Valid: stun-synergy-anomaly + explicit unit synergy + support (e.g., Aria/Sunna/Yuzuha)
- INVALID: stun-synergy-anomaly + double support WITHOUT stunner or explicit synergy
- Stun-synergy anomaly teams do NOT receive stunner penalty (stunner is intended)
- Scores lower than titled anomaly (e.g., Miyabi) due to tier difference, not the mechanic


## ARCHETYPE BONUS BALANCE

Each archetype should get roughly comparable total bonuses when properly composed:
- Anomaly: ~40-60 points (composition) + specialist
- Rupture: ~60 points (composition + stun comp + synergistic stunner) + specialist
- Attack: ~45 points (stunner + support) - boosted to match other archetypes

Archetype sections should run based on team composition (e.g., anomalyUnits.length > 0),
NOT based on boss shill. This allows on-element off-shill teams to get their bonuses.


## DATA STRUCTURE NOTES

### Unit Synergy Object
```json
{
  "units": ["Specific unit names"],
  "tags": ["DPS roles", "elements", "subdps", etc.],
  "avoid": ["DPS roles to avoid"]
}
```

- synergy.tags: What this unit synergizes WITH
- synergy.avoid: What this unit should NOT be paired with
- "subdps" in tags means unit synergizes with subdps, OR is a subdps (context dependent)
- "stun" in tags (for anomaly units) enables stun/anomaly/support compositions

### Mutual Synergy Mechanics
When both units list each other in synergy.units, this creates a "mutual synergy":
- Base synergy bonus: +5 when unit synergizes with teammate
- Mutual synergy bonus: Additional +25 when DPS unit has mutual synergy (enables DPS)
- Non-DPS mutual synergy: Additional +5

Examples of mutual synergy pairs:
- YSG + Zhao (both list each other - YSG gets +5 + +25 = +30)
- Aria + Sunna (both list each other - Aria gets +5 + +25 = +30)
- Seed + Orphie (both list each other - Seed gets +5 + +25 = +30)

Mutual synergy indicates a specifically designed tag-team duo that performs
significantly better together than either would with generic partners.

### Specialist Detection
A specialist has:
- Exactly ONE DPS role in synergy.tags
- The other TWO DPS roles in synergy.avoid

Example: Lucia
- synergy.tags includes "rupture"
- synergy.avoid includes "attack" and "anomaly"


## TESTING EXPECTATIONS

When testing scoring changes, verify these scenarios:

1. Hunter (fire/ice weak, rupture shill, anti:anomaly):
   - Yixuan (T0 titled) should beat Komano (A-rank on-element)
   - Banyue and Yidhari should score similarly (element doesn't matter for synergy)

2. Pompey (fire weak, anomaly shill):
   - Evelyn (T0.5 fire) should be competitive
   - Off-element titled shouldn't dominate on-element non-titled

3. Butcher (ice/ether weak, anomaly shill):
   - Miyabi/Vivian teams should dominate
   - Solo on-element Miyabi should beat off-element Alice pairs

4. Neutral Boss (no weaknesses):
   - Top teams should be: ideal rupture, ideal anomaly, ideal attack
   - Burnice (T1) should NOT dominate over titled units
   - All archetypes should compete fairly

5. Thrall (stun shill):
   - Ben (T4 defense) should NOT appear in top rankings

6. Aria Stun-Synergy Compositions (ether-weak boss):
   - Stun/Aria/Sunna - Valid, should score well (mutual synergy bonus)
   - Stun/Aria/Astra - Valid, slightly lower than with Sunna
   - Aria/Vivian/Yuzuha - Valid double-anomaly
   - Aria/Sunna/Yuzuha - Valid (explicit synergy with Sunna enables double-support)
   - Aria/Astra/Nicole (no stun, no explicit synergy) - DISQUALIFIED
   - Stun/Miyabi/support - Should score higher than Stun/Aria/support (T0 vs T1)

7. YSG Teams with Sunna:
   - YSG/Zhao/Sunna - Very high score (double mutual synergy)
   - Dialyn/YSG/Sunna - Should score similarly to YSG/Zhao/Sunna
   - YSG/Zhao/Astra - Should score lower than YSG/Zhao/Sunna
