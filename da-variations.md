# Deadly Assault — "Filter Out Variations" Feature

## Status: SHELVED (architecture correct, tuning needed)

The "Show variations" checkbox on the Deadly Assault page is partially implemented. The checkbox, UI, localStorage persistence, and the "variations ON" path all work correctly. The "variations OFF" path — which should show substantively different **global deployment strategies** rather than minor support-swap variations — does not yet produce satisfactory results.

This document captures all requirements, principles, design decisions, attempted approaches, test results, and open problems so that future work can pick up without losing context.


---

## 1. Feature Purpose

The Deadly Assault page finds optimal team allocations across 3 bosses. Without the variations filter, the top 5-10 results are typically the same DPS agents on the same bosses with minor support swaps (e.g., YSG/Zhao/Astra vs YSG/Zhao/Sunna on Defiler). This is unhelpful to users who already know which DPS to use and want to explore **alternative deployment strategies**.

### What users want from "variations OFF":

* **Different global DPS-to-boss mappings**: each result should answer "where do I send my key DPS agents?" differently
* **Unit redeployment awareness**: if YSG is freed from Defiler (replaced by SAnby), the algorithm should actively consider putting YSG on Vesper — not just leave YSG unused
* **Creative/unexpected options**: a T1.5 unit like Harumasa on Vesper (Discordant Solo) is off-element but potentially still viable — the tool should surface these matchups because users might not have considered them
* **Holistic allocation quality**: three tough-but-winnable fights is better than dominating one boss while flailing on the other two

### What users want from "variations ON":

* Raw top-N results sorted by quality, including support swaps
* The nitty-gritty: "is YSG/Zhao/Astra or YSG/Zhao/Sunna or YSG/Astra/Sunna better?"
* No bucketing, no diversity filtering — just the best possible options
* Display limit increases by 5 (5→10) to give room for these micro-optimizations


---

## 2. Key Principles (from user feedback)

### 2.1 What counts as a "variation" vs. a "different strategy"

* **Variation (should be filtered out)**: Same primary DPS on the same boss, different supports. "A Yixuan team with two supports is going to play the same: buff Yixuan with both supports, swap them out and let Yixuan annihilate everything. Same strategy, same gameplay, same bottleneck."
* **Different strategy (should be shown)**: Different primary DPS assignment to a boss, OR the same DPS redeployed to a different boss. The entire 3-boss allocation changes in a meaningful way.

### 2.2 "Mechanically identical" definition for primary DPS

A unit's mechanical identity for fingerprinting purposes:

* **Primary DPS**: `role:element:tier_bucket` where:
  * `role` = attack | anomaly | rupture
  * `element` = fire | ice | electric | physical | ether
  * `tier_bucket` = "hi" (tier < 2) | "lo" (tier >= 2)
  * Example: YSG = `attack:physical:hi`, Nekomata = `attack:physical:lo` (different — tier gap too big)
  * Example: Harumasa and Trigger/Harumasa team: only Harumasa is primary DPS (Trigger is stun)
* **Subdps units** (units with `synergy.tags.includes("subdps")`) are NOT primary DPS and are excluded from fingerprinting
* **Supports, stunners, defense** units are excluded from fingerprinting entirely

### 2.3 A "different strategy" must change MULTIPLE bosses

Changing just one boss's DPS while keeping the other two identical is still a variation, not a new strategy. The user repeatedly rejected results that only varied Defiler while keeping Hunter and Vesper identical. **At minimum, 2 out of 3 bosses should have different DPS** from every previously shown result.

Ideally, result #2 should be **maximally different** from result #1 — preferably all 3 bosses change (a completely different global allocation).

### 2.4 Stronger options first, but not at the cost of diversity

* Users should see stronger options before weaker ones
* But diversity trumps pure score for this mode: a slightly lower-scoring allocation that shows a genuinely different strategy is more valuable than a higher-scoring allocation that just tweaks one boss
* Creative T2 DPS options are acceptable after conventional ones have been presented
* T3+ DPS options likely don't have high enough scores to warrant inclusion unless in lenient mode (limited roster)

### 2.5 T0/titled units are viable off-element — this is a FEATURE

A fundamental insight: titled T0 units (Miyabi, YSG, Vivian, Yixuan, etc.) are so powerful that their tier score overwhelms element mismatch penalties. Deploying them off-element against a boss that doesn't actively resist them is a **legitimate and valuable strategy**. This is true regardless of investment level (M0W0 or M6W5) — it is the unit's tier and title status that matters, and these are already modeled in the scoring algorithm.

Examples of valuable off-element matchups the tool should surface:

* **Miyabi on Typhon Slugger**: Typhon wants electric, Miyabi is ice. But Typhon doesn't resist ice or anti-anomaly. Miyabi will annihilate Typhon.
* **Yixuan on Dead End Butcher**: Butcher wants ice/ether anomaly. Yixuan is ether/rupture. Butcher doesn't resist ether. Yixuan will demolish Butcher.
* **Yixuan on Miasmic Fiend**: Fiend wants ether/physical anomaly. Yixuan is ether/rupture. Ether matches weakness. Yixuan tears Fiend apart.
* **YSG on almost anything**: Physical attack, no element to resist. Viable against any boss without physical resistance.
* **Alice/Vivian on UCC**: UCC has electric/ether weakness. Vivian is ether (matches!), Alice is physical (off-element but T0.5).

The tool should communicate: "Your T0 unit can stomp this boss even though it's off-element — consider this deployment." This is *exactly* the kind of insight users are looking for from the diversity mode.

**Important**: Investment levels (M0W0, M2W1, etc.) are NOT an input to this principle. The algorithm already handles tier and title. Don't confuse "high investment makes off-element viable" (wrong framing) with "high tier makes off-element viable" (correct framing, already modeled).

### 2.6 Invalid teams must be caught by the scorer, not the diversity filter

Komano/Yixuan/Lucia (two primary rupture DPS + one support) was appearing in results because double-rupture without synergy only received a -200 penalty instead of disqualification. **This was fixed** — double-rupture and double-attack without synergy (and without subdps) now return -999 (hard disqualify) in `calculateDPSMixingPenalty` in `team-scorer.js`.


---

## 3. Architecture Overview

### 3.1 Pipeline

```
User roster + 3 selected bosses
  → getTeams() generates all valid 2/3-person teams
  → extendTeamsWithUniversalUnits() adds FLEX units to 2-person teams
  → scoreTeamForBoss() scores each team against each boss
  → viableTeamsByBoss: Map<bossName, Array<{label, team, score}>> (sorted by score desc)
  → findExclusiveCombinations(): finds non-overlapping 3-team allocations
  → [diversity filter]: selects which combinations to display
```

### 3.2 findExclusiveCombinations (team-builder.js)

* Takes top 20 teams per boss (`TOP_N = 20`)
* Assigns ranks based on position (1 = best)
* Triple-nested loop: tries all non-overlapping triples
* Sorts by `priority = maxRank * 100 + rankSum` (lower = better), then by `totalScore` (higher = better)
* The priority formula **heavily penalizes** combos where ANY one boss uses a low-ranked team: {rank 1, rank 1, rank 5} gets priority 508 vs {rank 3, rank 1, rank 1} gets priority 305

**Critical constraint**: The TOP_N=20 limit means that if a boss has 50+ viable teams but only 3 DPS buckets, all 20 slots may be consumed by the top 3 DPS buckets' support variants. Lower-ranked DPS options (needed for redeployment combos) get cut off entirely.

### 3.3 Current state of diversity code (deadly-assault.js)

The old diversity code (`ensureDpsDiversity`, `filterDiverseStrategies`, etc.) has been **removed and replaced** with the "DPS assignment as first-class decision" approach. Two functions now handle diversity:


1. `teamDpsFingerprint(team)`: Returns the mechanical identity of a team's primary DPS units as `role:element:tier_bucket` strings joined by `|`. Excludes subdps and non-DPS roles.
2. `findDiverseStrategies(viableTeamsByBoss, bossNames, limit)`: Implements the DPS-assignment-first approach:
   * **Phase 1 — Bucket**: Group each boss's viable teams by DPS fingerprint. Cap each bucket at `BUCKET_CAP = 15` teams.
   * **Phase 2 — Enumerate & Realize**: Triple-nested loop over all DPS fingerprint combinations (one per boss). For each DPS assignment triple, find the best non-overlapping team realization by searching within the respective buckets. Uses `teamsOverlap()` to ensure no unit is shared across bosses.
   * **Phase 3 — Rank & Filter**: Sort realized strategies by `totalScore` descending. Apply a quality floor (currently 70% of the top strategy's score). Return up to `limit` results.

This bypasses `findExclusiveCombinations` entirely for the diverse path. The variations-ON path still uses `findExclusiveCombinations` as before.


---

## 4. Approaches Tried and Their Failures

### Attempt 1: Per-boss primary DPS uniqueness filter (post-filter)

**Approach**: After getting 25 combinations, filter so that once a primary DPS name appeared for a boss, no other combination could use that same DPS on that boss.
**Result**: Only 1 result survived. Too aggressive — if a boss had only one viable DPS archetype, ALL combinations got filtered out.

### Attempt 2: Novelty-maximizing greedy selection (post-filter)

**Approach**: Greedily select combinations that bring the most "new" primary DPS names across all bosses.
**Result**: Accepted minor support swaps as "novel" (Alice→Piper counted as new). Missed strategic redeployments entirely. "Terrible results."

### Attempt 3: DPS fingerprinting with `role:element` + progressive relaxation

**Approach**: Introduced `unitSignature` (role:element for DPS, name for others) and `teamFingerprint`. Used progressive filtering: first try strict dedup, then relax.
**Result**: All 5 results identical (YSG/Yixuan/Alice with minor support swaps). The fingerprinting alone wasn't enough because `findExclusiveCombinations` only saw the top 20 teams per boss, which were all from the same DPS bucket.

### Attempt 4: Tier bucketing added (`role:element:tier`)

**Approach**: Added tier bucket (hi/lo) to fingerprint to distinguish YSG (T0) from Nekomata (T3).
**Result**: Still 5 identical results. Same underlying TOP_N=20 bottleneck.

### Attempt 5: Interleave teams by DPS bucket before findExclusiveCombinations

**Approach**: Pre-sort each boss's team list to interleave different DPS buckets, ensuring diversity in the top 20.
**Result**: "Bonkers, absolutely off the mark." Over-prioritized diversity, resulting in absurdly low-quality teams (Trigger/Harumasa/Zhao on Vesper while YSG sat unused).

### Attempt 6: buildDiverseResults — multiple constrained runs

**Approach**: Run `findExclusiveCombinations` multiple times: first unconstrained (best overall), then for each boss, constrain that boss to exclude previously-used DPS fingerprints while leaving other bosses unconstrained.
**Result**: Better diversity but still produced invalid teams (Komano/Yixuan/Lucia — fixed separately), duplicates, and missed redeployments. YSG never moved to Vesper when freed from Defiler. Each constrained run optimized independently, so there was no holistic view of the allocation landscape.

### Attempt 7: ensureDpsDiversity + filterByGlobalStrategy (unique fingerprint)

**Approach**: Preprocess each boss's teams so one rep per DPS bucket floats to top (ensuring findExclusiveCombinations sees diverse options). Post-filter by unique global DPS fingerprint (per-boss fingerprints concatenated).
**Result**: Diversity only happened on Defiler. All 5 results had the same Hunter (Yixuan) and Vesper (Alice) teams, with only Defiler's DPS changing. The filter treated single-boss changes as "unique strategies."

**Root cause**: `findExclusiveCombinations` sorts by `priority = maxRank * 100 + rankSum`. Redeployment combos (e.g., YSG on Vesper = rank 5+) get priority 500+, far behind "vary one boss" combos at priority 200-300. The global fingerprint filter saw each single-boss change as unique.

### Attempt 8: filterDiverseStrategies — require 2+ boss differences

**Approach**: Re-sort pool by `totalScore` instead of priority. Require each new result to differ from ALL previous on 2+ bosses.
**Result**: Significant improvement! Result 2 finally showed Trigger/Haru on Defiler + Yixuan on Hunter + YSG on Vesper (2 bosses changed). But still kept Yixuan on Hunter (dominant T0), missing the full redeployment (Trigger/Haru + Komano + YSG). The 2-diff threshold was met by changing Defiler + Vesper while keeping Hunter's dominant option.

### Attempt 9: Maximize minDiffs, then sumDiffs, then totalScore

**Approach**: Instead of a 2-diff threshold, greedily pick the combo with the HIGHEST minimum boss-differences from all previous results, breaking ties by total differences, then by totalScore.
**Result**: Result 2 became excellent (all 3 bosses changed: Trigger/Haru, Komano, YSG). But results 3-5 degraded — showed unrealistic allocations benching T0 titled units, wrong ordering (result 5 was more interesting than result 3).

### Attempt 10: Added sumDiffs tiebreaker + 50% score floor

**Approach**: Among same minDiffs, prefer higher sumDiffs (more total diversity). Exclude combos below 50% of result 1's totalScore.
**Result**:  User did not provide details why, but felt the solution was still not satisfactory. Shelved.

### Attempt 11: DPS assignment as first-class decision (current implementation)

**Approach**: Complete architectural rethink. Instead of generating all teams, finding non-overlapping triples, and post-filtering for diversity, treat "which DPS goes to which boss?" as the primary decision. Group each boss's teams by DPS fingerprint into buckets. Enumerate all possible DPS-assignment triples (one fingerprint per boss). For each triple, find the best non-overlapping team realization. Sort by totalScore, apply 70% quality floor.

**Result — Test A (Defiler/Hunter/Vesper)**: Promising but incomplete.


1. YSG/Yixuan/Alice (optimal baseline, good)
2. YSG/Komano/Alice (Hunter changed, good)
3. Haru/Yixuan/Alice (Defiler changed, good)
4. Haru/Yixuan/YSG (Vesper changed to YSG, good — redeployment!)
5. Evelyn/Yixuan/Alice (creative Evelyn on Defiler, good)

Positive: DPS diversity appeared, redeployment (YSG to Vesper) surfaced. But only Defiler showed real creativity; Hunter and Vesper were mostly locked.

**Result — Test B (Butcher/Pompey/Thrall)**: Good diversity for Pompey, but locked elsewhere.


1. Miyabi+Vivian/Evelyn/YSG (excellent baseline)
   2-5: Miyabi always on Butcher, Pompey showed variety (Evelyn, Yixuan, YSG, Komano, Soldier 11), Thrall oscillated between YSG and Yixuan.

**Missing**: No Yixuan on Butcher (would demolish it). No Alice/Vivian on Butcher. Miyabi dominance prevented redeployment exploration.

**Result — Test C (Typhon/Fiend/UCC)**: Worst showing.


1. YSG/Alice/Yixuan (baseline)
   2-5: Rotated YSG/Haru/Yixuan across Typhon and UCC. Alice never moved off Fiend.

**Missing**: No Miyabi on Typhon (she annihilates it — ice isn't resisted, anomaly isn't anti'd). No Alice/Vivian or Miyabi/Vivian on UCC. No Yixuan on Fiend (ether matches weakness). No Evelyn on Typhon.

**Analysis**: The architecture is correct but the results are still incomplete — see section 5 for root cause analysis.


---

## 5. The Unsolved Problem (Updated Understanding)

The DPS-assignment-first architecture (Attempt 11) is structurally correct but many viable, valuable strategies fail to appear in the top 5 results. The problem is NOT the algorithm's logic — it correctly enumerates DPS assignment triples and finds optimal realizations. The problem is that **viable strategies get buried by structural scoring biases**, not because they're bad, but because the totalScore ranking favors certain patterns.

### 5.1 Root Cause: Support Contention

Multiple anomaly DPS units (Miyabi, Alice, Vivian-as-subdps) compete for a small pool of anomaly supports (Vivian, Yuzuha, Soukaku). When the algorithm deploys two anomaly DPS to different bosses, one team gets Vivian/Yuzuha and the other gets weaker supports. This drags down the totalScore of multi-anomaly-DPS strategies.

Meanwhile, attack DPS (YSG, Harumasa, Evelyn) use a completely different support pool (Zhao, Astra, Sunna). Strategies with one attack DPS + one anomaly DPS per boss avoid support contention entirely, so they rank highest.

**Example**: (Miyabi on Typhon, Alice on Fiend, Yixuan on UCC) — both Miyabi and Alice want Vivian. One gets her, the other gets weaker supports. TotalScore drops below strategies where YSG (no Vivian contention) takes Typhon instead. But the Miyabi-on-Typhon matchup is genuinely strong and users would want to see it.

### 5.2 Root Cause: Boss Dominance Creates Score Gravity Wells

When one boss has a dominant matchup (e.g., Alice on Fiend: anomaly-shilled + ether weakness + explicitly favored), the score gap between the dominant team and the next-best alternative is enormous. Any strategy that moves the dominant unit off that boss drops massively in totalScore.

The algorithm therefore "refuses" to move Alice off Fiend, even though "what if Alice goes to UCC instead, and Yixuan takes Fiend?" is exactly the strategic question users want answered. The Yixuan-on-Fiend matchup (ether matches weakness) is perfectly viable, but its totalScore can't compete with Alice-on-Fiend.

### 5.3 Root Cause: DISPLAY_LIMIT and Quality Floor

With `DISPLAY_LIMIT = 5` and a 70% quality floor, there's limited room for creative strategies. The top 4-5 by totalScore tend to share the same dominant allocations (Alice always on Fiend, Miyabi always on Butcher). Creative redeployments that score 65-80% of the top strategy get cut or pushed to positions 6-10.

### 5.4 Boss Flexibility Spectrum

Not all bosses are equal in how many viable DPS options they accept:

* **Locked bosses** (Defiler, Hunter, Vesper): Narrow viable DPS pools due to resistances and anti-types. Creativity is limited by design.
* **Flexible bosses** (Pompey, UCC, Butcher, Fiend, Marionettes): Many viable DPS options because they have few/no resistances and T0 units can fight them off-element. Diversity should flourish here.

The algorithm doesn't distinguish between these. It shows the same number of strategies regardless of how much "strategy space" each boss combination offers.

### 5.5 What's NOT the Problem

* **The architecture is sound.** Treating DPS assignment as the first-class decision is correct.
* **teamDpsFingerprint works correctly.** DPS buckets are properly identified.
* **The enumeration is complete.** All DPS assignment triples are generated. Miyabi-on-Typhon strategies DO exist in the `strategies` array — they just rank below position 5.
* **Scoring is not the issue.** T0 units off-element DO score positively. The individual matchup scores are reasonable. It's the totalScore *comparison* across strategies that buries them.

### 5.6 Possible Next Steps

The architecture is right. The remaining work is strategy **selection** — how to pick which 5 strategies to show:


1. **Lower or remove the quality floor**: 70% is too aggressive. Many "interesting" strategies score 60-75% of the top. Consider 50%, or remove it and let the diversity selection itself handle quality.
2. **Don't just rank by totalScore**: Pure totalScore ranking produces the boss-dominance and support-contention problems above. Consider a greedy selection that picks each successive strategy to maximize DPS diversity from all previous strategies, subject to a minimum quality bar.
3. **Increase display limit**: 5 may not be enough. Consider 8-10 for diverse mode, or make it dynamic (show all strategies above a quality floor).
4. **Per-boss score floor instead of total**: Reject strategies where any individual boss's team scores below, say, 50% of that boss's best available team. This prevents "sacrifice one boss to boost total" without penalizing creative redeployments evenly.
5. **Weight redeployments**: Strategies that use all 3 DPS fingerprints differently from all previously-shown strategies should get a diversity bonus (or be guaranteed a slot).
6. **Know when to stop**: Some boss combinations genuinely have only 2-3 useful strategies. Better to show fewer high-quality results than pad with weak ones. Consider stopping when the next-best strategy offers no new DPS matchups worth showing.


---

## 6. What IS Working (keep these)

### 6.1 Scoring bug fix (team-scorer.js)

Double-rupture and double-attack without synergy (where neither unit has `subdps` tag) now returns -999 (hard disqualify) instead of -200 penalty. This eliminates invalid teams like Komano/Yixuan/Lucia from ever appearing. If one unit IS subdps, the -200 penalty is preserved (valid pattern like Grace+Harumasa).

### 6.2 UI infrastructure (deadly-assault.html + deadly-assault.js)

* Checkbox in results-header, persisted to localStorage
* `showVariations` state drives `displayResults` to pick either `combinations` (raw) or `diverseResults` (filtered)
* When variations ON: `DISPLAY_LIMIT + 5` results shown (10 total)
* When variations OFF: `DISPLAY_LIMIT` results from diversity filter

### 6.3 DPS-assignment-first architecture (findDiverseStrategies)

The core approach is correct: bucket teams by DPS fingerprint, enumerate all DPS-to-boss assignment triples, find the best non-overlapping realization for each, then select which to display. This bypasses `findExclusiveCombinations` entirely (and its TOP_N=20 bottleneck) for the diverse path. The `ensureDpsDiversity` preprocessing function has been removed — it is no longer needed.

### 6.4 teamDpsFingerprint

The `role:element:tier_bucket` fingerprint correctly captures "mechanical identity" of primary DPS. The hi/lo tier split (threshold at tier 2.0) was validated: YSG (T0) and Nekomata (T3) are correctly distinguished. Subdps exclusion is correct.

### 6.5 Team Recommendations page (team-recommendations.js)

The simpler single-boss "Show variations" feature on Team Recommendations works correctly using `filterUniqueDps` — a straightforward name-based dedup of primary DPS. This is viable because it's a single-boss page without the multi-boss allocation complexity.


---

## 7. Test Configurations and Results

Testing roster defined in `roster.json`.

### Test A: Defiler / Hunter / Vesper (narrow bosses)

**Boss details**: The Defiler (electric/physical, anti-anomaly, ice-resist, attack shill), Wandering Hunter (fire/ice, anti-anomaly/attack, phys-resist, rupture shill), Discordant Solo (ether, anti-rupture, ice/fire-resist, anomaly shill).

**Expected ideal results**:


1. YSG on Defiler, Yixuan on Hunter, Alice on Vesper (optimal baseline)
2. Trigger/Haru on Defiler, Komano on Hunter, YSG on Vesper (full redeployment)
   3-5. Creative options: Yixuan on Defiler, Harumasa on Vesper, etc.

**Actual results (Attempt 11)**: Defiler showed diversity (YSG, Haru, Evelyn). Hunter/Vesper mostly locked. YSG-to-Vesper redeployment appeared (result 4). Acceptable for narrow bosses — limited strategy space by design.

### Test B: Butcher / Pompey / Thrall (flexible bosses)

**Boss details**: Dead End Butcher (ice/ether, anomaly shill, no resist), Pompey (fire, electric-resist), Thrall & Sobek (ice/physical, electric-resist, stun shill, anti-anomaly).

**Expected missing strategies that should appear**:

* Yixuan on Butcher (ether matches weakness, T0 titled, would demolish it)
* Alice/Vivian on Butcher (anomaly shilled, ether matches)
* More variety on Thrall (not just Yixuan/YSG)

**Actual results (Attempt 11)**: Miyabi always locked on Butcher. Pompey showed excellent variety (best part). Thrall only showed Yixuan/YSG. Miyabi's dominance prevented the tool from showing the Yixuan-on-Butcher option, which is exactly the kind of creative insight users want.

### Test C: Typhon / Fiend / UCC (mixed flexibility)

**Boss details**: Typhon Slugger (electric, fire-resist), Miasmic Fiend (ether/physical, fire-resist, anomaly shill), Unknown Corruption Complex (electric/ether, neutral).

**Expected missing strategies that should appear**:

* Miyabi on Typhon — she annihilates it (ice not resisted, anomaly not anti'd). **Note: Vivian is ether, NOT fire — there is no fire-resistance issue for a Miyabi/Vivian team on Typhon.**
* Alice/Vivian on UCC (Vivian is ether, matches UCC weakness)
* Miyabi/Vivian on UCC (both anomaly, Vivian ether matches)
* Yixuan on Fiend (ether matches weakness)
* Evelyn on Typhon (fire IS resisted, but Evelyn is T0.5 — user says she can still kick Typhon to the curb)

**Actual results (Attempt 11)**: Alice always locked on Fiend. Typhon rotated YSG/Haru/Yixuan only. UCC rotated Yixuan/YSG/Haru only. None of the expected creative options appeared. Worst showing of the three tests.

**Root cause**: Alice dominates Fiend so hard (anomaly shill + ether weakness + explicitly favored) that any strategy moving her off Fiend drops massively in totalScore. Miyabi on Typhon + Alice on Fiend involves support contention (both want Vivian/Yuzuha), pushing the total below strategies where attack DPS (no support contention) takes Typhon instead.

### Cross-test observations:

* **Flexible bosses are where diversity matters most**, but the algorithm shows the LEAST diversity on them (ironic).
* **Support contention is the primary structural barrier** preventing multi-anomaly strategies from surfacing.
* The **70% quality floor and DISPLAY_LIMIT=5** together are too restrictive for the breadth of viable strategies.
* The algorithm's pure totalScore ranking naturally gravitates toward no-contention strategies (one attack DPS + one anomaly DPS per boss), burying legitimate multi-anomaly or redeployment options.


---

## 8. Key Files

| File | Relevance |
|----|----|
| `app/public/deadly-assault.js` | Main page logic, diversity filter functions, display logic |
| `app/public/deadly-assault.html` | Checkbox markup in results-header |
| `app/public/lib/team-builder.js` | `findExclusiveCombinations` — TOP_N=20, priority formula, overlap checking |
| `app/public/lib/team-scorer.js` | `scoreTeamForBoss`, `calculateDPSMixingPenalty` (double-rupture fix) |
| `app/public/team-recommendations.js` | Simpler single-boss `filterUniqueDps` for reference |
| `engine-context.md` | Team composition rules, scoring guidelines, unit mechanics |
| `app/public/data/units.json` | Unit definitions (tags, tier, synergy, join conditions) |
| `app/public/data/bosses.json` | Boss definitions (weaknesses, resistances, shill, anti) |
| `roster.json` | Test roster with investment levels (for reference only — investment doesn't affect scoring) |


