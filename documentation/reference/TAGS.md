# Tag registry

Production code carries short references instead of essays. `[COH-04]` in a source file means
"the reasoning is in the cohesion doc, under the heading `[COH-04]`."

This file is the flat index of every tag. It exists so two greps answer the two questions that
go stale:

```bash
# every tag used anywhere in the repo
grep -roh '\[[A-Z]\{3,5\}-[0-9]\{2\}\]' documentation/ app/public/lib lib ./*.js ./*.mjs | sort -u

# every tag this registry claims exists
grep -o '^| `\[[A-Z]*-[0-9]*\]`' documentation/reference/TAGS.md
```

A tag in the first list but not the second is an orphaned reference. A tag in the second but not
the first is a note nobody points at any more — delete the note, leave the number retired.

## Rules

* Format is `[PREFIX-NN]`. Two digits, zero-padded.
* Numbers are allocated in order within a prefix and **never reused**, even after a note is
  deleted. A retired number costs nothing; a recycled one silently points old commits at the
  wrong note.
* The note lives at the bottom of the prefix's owning file, under `## Code notes`, as
  `### [PREFIX-NN] Short title`.
* One line of plain English in the code, then the tag:
  ```javascript
  // Lycaon is exempt from the stunless carve-out. [COH-04]
  ```
* If the code comment needs more than that one line to make sense at the call site, the comment
  is wrong, not too short — say what the code *does* in that line and let the tag carry why.

## What earns a tag

A tag is for reasoning that a maintainer needs *occasionally* and that would otherwise be
deleted by someone who thought it was noise.

| Stays in the code, untagged | Becomes a tag |
|----|----|
| What a non-obvious line does, in one line | Anything narrating a past state of the code |
| A magic number's units or range | Anything arguing against a change ("do not rename it back") |
| A `TODO` naming a real, current gap | Anything with dates, test numbers, or defect history |
| The file header — one sentence | Anything over about four lines |

The test: if it explains **the code**, it stays and gets shorter. If it explains **why the code
isn't something else**, it becomes a tag.

## Prefixes

| Prefix | Owning file |
|----|----|
| `FUND` | `../concepts/elements-and-roles.md` |
| `ANOM` | `../concepts/anomaly-reactions.md` |
| `DISO` | `../concepts/disorder-supply.md` |
| `LUM` | `../concepts/lumen.md` |
| `ARM` | `../concepts/armorer-laceration-gash-maim.md` |
| `ARCH` | `../archetypes/README.md` |
| `DATA` | `../data-model/mechanics-overview.md` |
| `CLS` | `../data-model/mechanics-overview.md` |
| `PRED` | `../data-model/predicates.md` |
| `SCAL` | `../data-model/scaling.md` |
| `BUFF` | `../data-model/buffs-and-debuffs.md` |
| `BOSS` | `../data-model/boss-object.md` |
| `WEAK` | `../data-model/boss-object.md` |
| `PIPE` | `../engine/layers.md` |
| `CTX` | `../engine/unit-context.md` |
| `FIELD` | `../data-model/pseudorole.md` |
| `COMP` | `../engine/l4-components.md` |
| `ULT` | `../engine/ultimates-two-channel.md` |
| `COH` | `../engine/cohesion.md` |
| `TWM` | `../engine/teamwork-multiplier.md` |
| `DIAM` | `../engine/diametric-synergy.md` |
| `CAL` | `../engine/calibration.md` |
| `READ` | `../engine/reading-scores.md` |
| `PULL` | `../recommendations/pull-engine.md`, or `../recommendations/partner-ladder.md` for ladder-specific notes and `../recommendations/mechanics-fit-score.md` for fit-score ones |
| `GAP` | `../recommendations/coverage-and-gaps.md` |
| `CODEP` | `../recommendations/codependency-gating.md` |
| `BUCK` | `../bucketing/deadly-assault.md` |
| `TEST` | `../tooling/verification-loop.md` |

## Registry

Populated during the comment pass. One row per tag, newest last within a prefix.

| Tag | File | Summary |
|----|----|----|
| `[FUND-01]` | `../concepts/elements-and-roles.md` | `isDamageDealer` is narrower than `isDPS` — a subdps is a damage dealer even when tagged `stun` |
| `[LUM-01]` | `../concepts/lumen.md` | Lumen is exempt from the subdps "no reaction" cohesion charge |
| `[LUM-02]` | `../concepts/lumen.md` | No proc-damage buff reaches lumen, by any route |
| `[DISO-01]` | `../concepts/disorder-supply.md` | Do not net polarity provision against element-cycling supply |
| `[ARM-01]` | `../concepts/armorer-laceration-gash-maim.md` | Defense shred is a full-value armorer lever, not a `pen`-tier one |
| `[ARM-02]` | `../concepts/armorer-laceration-gash-maim.md` | `CONTROL_QUICKTIME` is 17, just above the rest of its family |
| `[ARCH-01]` | `../archetypes/README.md` | Stunless shill credit sizing |
| `[ARCH-02]` | `../archetypes/README.md` | Primary carry selection ignores pseudo-DPS |
| `[ARCH-03]` | `../archetypes/README.md` | The monoshock calibration override |
| `[ARCH-04]` | `../archetypes/README.md` | Archetype fit calibration (`intended` = 0, `avoid` = -40); notes a stale comment contradiction |
| `[ARCH-05]` | `../archetypes/README.md` | The titled off-shill bonus is half the shill bonus, and used to be double it |
| `[BUFF-01]` | `../data-model/buffs-and-debuffs.md` | Supplier buffs a damage type the consumer deals — not a need/provision channel |
| `[BUFF-02]` | `../data-model/buffs-and-debuffs.md` | Anomaly crit-damage efficiency is 30%, not 0% |
| `[BUFF-03]` | `../data-model/buffs-and-debuffs.md` | Chain damage buff priced on its own dial, not the provision rate |
| `[BUFF-04]` | `../data-model/buffs-and-debuffs.md` | `BUFF_IMPACT` is one table sourced from `MULT`, so L4 and cohesion cannot disagree |
| `[BUFF-05]` | `../data-model/buffs-and-debuffs.md` | The three senses of an anomaly buff, and the traps on the bare `anomaly` key |
| `[BUFF-06]` | `../data-model/buffs-and-debuffs.md` | A damage-type buff is rated by how central the type is to its kit |
| `[BUFF-07]` | `../data-model/buffs-and-debuffs.md` | Three anomaly buffs, three gates, all flat — "anomaly affinity" was an engine invention |
| `[BUFF-08]` | `../data-model/buffs-and-debuffs.md` | A proc-damage buff landing on its own owner counts at 15% |
| `[COH-01]` | `../engine/cohesion.md` | A unit PLAYING support is judged as one, even with a DPS tag (Remielle/Orphie/Cissia) |
| `[COH-02]` | `../engine/cohesion.md` | The element-buff menu, and why only Lighter can be moved by it |
| `[COH-03]` | `../engine/cohesion.md` | Delivery is priced at the square root of the L4 coefficient |
| `[TWM-01]` | `../engine/teamwork-multiplier.md` | Pseudo-role stat alignment, and why SAnby is not double-charged |
| `[TWM-02]` | `../engine/teamwork-multiplier.md` | Two views of cohesion, so an unmet weight-2 need does not cost the boss matchup |
| `[ULT-01]` | `../engine/ultimates-two-channel.md` | Frequency is its own axis, and `chain:extra` is self-provision |
| `[ULT-02]` | `../engine/ultimates-two-channel.md` | `getUltimateMagnitude`'s zeroing is load-bearing for Sigrid and Pyrois |
| `[SCAL-01]` | `../data-model/scaling.md` | The plural need keys (`ablooms`, `vortex`) are not typos |
| `[SCAL-02]` | `../data-model/scaling.md` | `needSeverity` is convex, and reads the coerced weight |
| `[SCAL-03]` | `../data-model/scaling.md` | Exploiting a longer stun window needs two gates |
| `[SCAL-04]` | `../data-model/scaling.md` | A need of 1 is an appetite, not a dependency, and is never charged |
| `[CODEP-01]` | `../recommendations/codependency-gating.md` | The scorer reads `scaling.codependent` as a discount, not a gate |
| `[CLS-01]` | `../data-model/mechanics-overview.md` | `:` is a classifier, and `ultimate` is exempt because its keys are orthogonal axes |
| `[FIELD-01]` | `../data-model/pseudorole.md` | Conditional `onfield` needs a raw resolver, and `isSharedField` reads it too |
| `[WEAK-01]` | `../data-model/boss-object.md` | A boss weakness understands element variants; a variant weakness pays a plain-element unit half |
| `[AP-01]` | `../data-model/stats.md` | Effective Proficiency is a property of the UNIT: base `ap` plus what its own `scaling.am` converts from its own `stats.am` |
| `[AP-02]` | `../data-model/stats.md` | Disorder damage reads proc damage; the disorder NEED deliberately does not |
| `[AP-03]` | `../data-model/stats.md` | Luminize and Refringe scale on Proficiency, never on raw proc damage |
| `[AP-04]` | `../data-model/stats.md` | Mastery is geometric, buildup buffs saturate, and the curve is anchored at the class baseline |
| `[VTX-01]` | `../concepts/anomaly-reactions.md` | The vortex tier is a pooled mean of the team's non-wind elements, not a max |
| `[VTX-02]` | `../concepts/anomaly-reactions.md` | The vortex-carry gate reads a carry's OWN element tier, never the pooled one |
| `[VTX-03]` | `../concepts/anomaly-reactions.md` | AP scales the vortex PAYOUT, never the stored tier |
| `[VTX-04]` | `../concepts/anomaly-reactions.md` | Tier values are compressed at the square root before payout, anchored at 2 |
| `[VTX-05]` | `../concepts/anomaly-reactions.md` | A vortex event has one damage number; the wind enabler is paid for events, not damage |
| `[ANOM-01]` | `../concepts/anomaly-reactions.md` | Abloom is damage AND a reaction; `ABLOOM_BONUS` is capped by the Miyabi ladder, not by principle |
| `[CODEP-02]` | `../recommendations/codependency-gating.md` | `anomalyProcSupply` mirrors team-scorer's anomaly-quantity rule, not `buffs.buildup` |
| `[PULL-01]` | `../recommendations/partner-ladder.md` | The partner ladder block in `pull-engine.js` is this whole page in code |
| `[PRED-01]` | `../data-model/predicates.md` | `optional` — a conditional buff allowed not to fire, and why waiving the penalty alone is not enough |
| `[PRED-02]` | `../data-model/predicates.md` | `allOf`, `othersDisorder`, and two-pass role activation — the Soukaku backfill |
| `[PRED-03]` | `../data-model/predicates.md` | `hasRole`, the shared evaluator, and the no-team defaults |
| `[PULL-02]` | `../recommendations/pull-engine.md` | The codependency/ladder penalty is per unit, not per card |
| `[BUCK-01]` | `../bucketing/deadly-assault.md` | The rank band 0.011/4.5 is derived from one Thrall & Sobek allocation case |
| `[PIPE-01]` | `../engine/layers.md` | The solo-carry bonus is sized against the mechanics it sits beside |
| `[PIPE-02]` | `../engine/layers.md` | The supportless structure factor is the whole judgement now the L4 cap is gone |
| `[PIPE-03]` | `../engine/layers.md` | A `join` that mandates a second carry — why it waives rather than grants |
| `[AOD-01]` | `../data-model/unit-object.md` | Angels of Delusion are declared, not modelled; `CONJUNCTIVE_SYNERGY_BONUS` re-derived 55 → 45 against them |
| `[PULL-03]` | `../recommendations/mechanics-fit-score.md` | The recovery debuff reads the scorer's burst model, not a MAX over `damage` values |
| `[GAP-01]` | `../recommendations/coverage-and-gaps.md` | An element covered only by a sub-DPS gets its own reason line, not "no DPS options" |
| `[CAL-01]` | `../engine/calibration.md` | The synthetic neutral boss is not in the fitting corpus |
| `[CAL-02]` | `../engine/calibration.md` | Archetype pooling, and why the map is a second staleness axis |
| `[CAL-03]` | `../engine/calibration.md` | `MIN_SELF_ANCHOR_CARRIES` is 3 |
| `[CTX-01]` | `../engine/unit-context.md` | Resolving onto the unit was shared mutable state, and nothing pinned the cleanup |
