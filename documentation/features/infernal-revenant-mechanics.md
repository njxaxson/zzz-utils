# FEATURE: Infernal Revenant boss mechanics

**Status:** proposed for the next Deadly Assault release, the one that adds HollowVenger Truvia.
The two ship together but are separate pieces of work. Engine, data and calibration change.
Depends on SCORE-146 (see [Sequencing](#sequencing)).

## The problem

Revenant went into 3.3 at the last minute and is mechanically incomplete. Its entry has only
weaknesses, resistances, assists, `chainParry` and `control`. Nothing says what the boss is
*about*, so it plays like a generic wind/ice boss and anomaly takes the top of the ladder on its
raw ceiling. In 3.3, `Promeia/Remielle/Velina` is #1 at 394.6 calibrated, and the best attack
team is #14.

The boss is an inverse of Scorched Horizon:

| | Scorched Horizon | Infernal Revenant |
|----|----|----|
| Crit damage | `debuffs.cd: 2`: a mitigable **penalty** to crit-scaling carries | Weak to crit damage: a **bonus** to every damage dealer, scaled by how much crit damage they deal |
| Anomaly | the anomaly shill, with wind state | **Anomaly buildup debuff**: a mitigable **penalty** to anything that procs by filling a gauge |
| Intent | favors Promeia over Miyabi | favors attack and rupture without shilling them; indifferent to armorers |

## Acceptance criteria (owner-stated)

* **NMY is the outlier among anomaly teams.** `Nangong/Miyabi/Yuzuha` is strong against Revenant,
  possibly optimal, but it does **not** have to be the absolute #1. It has both halves of the
  answer: buildup buffs that offset the debuff (Nangong 3 + Yuzuha 3), and a carry who scales on
  crit damage despite being anomaly. Other Miyabi teams hold up better than the rest of anomaly,
  but less well than NMY.
* **NMY rates Excellent** (the top band in `strength-rating.js`). Owner: cleared on the first try
  without knowing the boss's attack patterns. It is already Excellent in 3.3 (370.3), so this is a
  guard against the change knocking it down, not a target to climb to.
* **Most anomaly teams are sub-optimal.** NMY is the only *good* anomaly team.
* **Attack and rupture are favored, not shilled.** A strong Sigrid team (e.g.
  `Lighter/Sigrid/Astra`) or a future Severian team (`Roxy/Severian/<support>`) may beat NMY,
  and that is fine.
* **Sigrid is the premier non-Miyabi ice DPS**, with Yidhari close behind. Wind carries such as
  Severian are outside this rung.

## Design

Two new boss mechanics, both general enough for a future boss to declare. Nothing refers to
Revenant by name. Each L3 block goes next to the Horizon CD-debuff and daze-debuff blocks in
`scoreTeamForBoss`.

### 1. `debuffs.buildup` — anomaly buildup debuff (mitigable)

Data: `"debuffs": { "buildup": 6 }` on Revenant.

For a unit that procs by filling a gauge, the shortfall is
`max(0, debuff − teamBuildupSupply(unit, team))`, read through the existing helper.

* **The helper skips the unit's own buff,** which is right: Velina's `buildup: 1` goes to her
  teammates, not to herself.
* **This is stricter than the Horizon CD block,** which counts the whole team's CD supply
  including the consumer. The difference is deliberate, and gets its own sentence under the tag.
* **Mitigable by owner ruling.** NMY pays nothing.

The shortfall reaches two kinds of unit.

**a) Anomaly carries: an L3 penalty.** For each effective-anomaly DPS:
`penalty = shortfall × BOSS_WEAK.BUILDUP_DEBUFF_PER_UNIT`.

* **The gate is the same as `getBuffRelevance('buildup')`.**
* **Lumen is exempt:** Remielle procs nothing, so there is no buildup rate to slow down
  ([BUFF-07] / [LUM-02]).

**b) Proc surplus: cut by the same ratio.** Roxy's `utility["anomaly:wind"]: 1` comes from a high
buildup rate for a stunner. She is just short of being a pseudo-anomaly agent, so the debuff
shrinks the procs she delivers.

* **The cut** is `1 − shortfall / debuff`. Her teammates' buildup buffs offset it the same way
  they offset (a).
* **It goes on the unit context, never into `units.json`,** because it depends on the team and the
  boss (see [unit context](../engine/unit-context.md)).
* **Every reader of the surplus sees the cut:** `computeProcInput`, the wind-element supply count,
  and need fulfilment.
* **Who loses:** Sigrid and Pyrois. Both declare `scaling["anomaly:wind"]` and depend on the
  procs.
* **Who does not:** Severian. His crit-damage condition is having a wind *teammate*
  (`countTag: "wind"`, which reads tags), and Roxy is wind whether or not she procs. He is
  unaffected by construction, and a mechanics test pins it.

**Alice is a known limitation, spelled out on purpose.** Her `utility["anomaly:physical"]: 2` is
a different mechanism. Her polarity assaults come from her enhanced attacks and bypass buildup
entirely, so in game the debuff should not touch them.

**The data model cannot tell the two cases apart today.** Both are a plain
`utility["anomaly:<element>"]` surplus, and nothing records whether a surplus comes from buildup
or from polarity.

**Decision: do not model the distinction now.** The cut applies to every proc surplus, Alice's
included, and is knowingly wrong for her. It does no harm on Revenant:

* **Strict mode:** Revenant resists physical, so Alice, as a resisted damage dealer, is
  disqualified in L1 and never reaches L3 or L4.
* **Lenient mode:** a resisted DPS becomes a cost rather than a disqualification
  ([LEN-01..04]), so a lenient Alice row also carries this small, wrong extra charge. That is
  acceptable on a team already shown as a compromise.

**When to revisit:** a future boss that declares `debuffs.buildup` where Alice is viable. The fix
then is to *declare* the source in data (a marker saying "polarity, not buildup"), not to infer it
from her class. A deferred-issue note in `issues/deferred/` lands with the feature.

**Not routed through `procRate`.** A debuff on the proc curve would spread through every
proc-counting channel. `buildupRate` also saturates with only 0.20 of headroom, so buffs could
barely offset it. That would be hard to measure and hard to size.

### 2. `weak: ["cd"]` — crit-damage weakness (bonus only)

Data: add `"cd"` to Revenant's `weak` array.

* **The key matches the existing `cd` keys** (`buffs.cd`, `scaling.cd`, `debuffs.cd`). Same
  principle as `luminize`: one spelling in the data beats two.
* **Like every other `weak` entry, it carries no size of its own.** The size is
  `BOSS_WEAK.CD_WEAK_PER_UNIT`.

The bonus is paid to each **damage dealer**, `team.filter(isDamageDealer)` ([FUND-01]):
`bonus = critDamageExposure(unit) × CD_WEAK_PER_UNIT`.

* **This is not the L3 `dpsUnits` list,** which leaves out sub-DPS stunners.
* **Owner ruling: every carry and every sub-DPS is credited,** including stunners like Roxy and
  Norma.

`critDamageExposure(unit)` is a new helper, close to `getBuffRelevance('cd')` but **uncapped**, so
Miyabi's declared `cd: 3` comes out above an attacker:

| Unit | Exposure | Why |
|----|----|----|
| declares `scaling.cd` | `cd / 2`, so Miyabi gets **1.5** | declared data, never a name check |
| attack / rupture | 1.0 | role baseline `cd: 2` |
| anomaly, no `cd` declared | `ANOMALY_CRIT_DMG_EFFICIENCY` (0.3) | [BUFF-02]: anomaly damage mostly doesn't crit |
| armorer | 0 | armorer crit damage is fixed. Claret's CD conversion is a separate, known mismodel, ignored here |
| sub-DPS stunner, no `cd` declared (Roxy, Norma) | `STUN_CRIT_EXPOSURE` (start at **0.5**) | a stunner's crit rate is lower, so the extra crit damage lands less often (owner) |
| **plus** an active self-targeted `cd` buff | `+ resolvedSelfCd × SELF_CD_EXPOSURE` (start at 0.25 per point) | owner: Severian's wind-teammate crit damage is something he *has* going into combat, not a buff granted mid-fight, so the boss multiplies it like base crit damage. Read from `_resolvedSelfBuffs.cd`, never by name |
| **times** any active sub-DPS role | × `CD_WEAK_SUBDPS_SHARE` (start at 0.6) | the same ratio as the L3 on-element bonus for a sub-DPS (17/28) |

**Teammates' crit-damage buffs are not amplified,** by owner choice. Supports' `buffs.cd` pay
exactly what they do today.

**Armorers stay indifferent at carry level.** Claret is credited 0. A Claret team still rises a
little if it fields a sub-DPS stunner: Roxy/Claret/Nicole gains about +7 calibrated in the
estimate below. That follows from the sub-DPS ruling and is not a leak.

### Starting constants and projected ladder

The figures below are an in-memory estimate against the 3.3 engine, not a run of the real one.
It leaves out the Roxy cut and the Severian term, and its sub-DPS activation is approximate.

Starting constants:

* `CD_WEAK_PER_UNIT = 30`
* `debuffs.buildup = 6`
* `BUILDUP_DEBUFF_PER_UNIT = 16`
* `STUN_CRIT_EXPOSURE = 0.5`
* `CD_WEAK_SUBDPS_SHARE = 0.6`

| Team | 3.3 | projected |
|----|----|----|
| Nangong / Miyabi / Yuzuha | #2 · 370.3 | #1 · 398.5 |
| Norma / Yidhari / Lucia (best rupture) | #12 · 341.4 | #2 · 369.4 |
| Norma / Roxy / Hugo (best attack) | #14 · 331.5 | #3 · 368.3 |
| Nangong / Miyabi / Sunna | #5 · 352.9 | #6 · 351.0 |
| Norma / Sigrid / Sunna | #26 · 316.0 | #11 · 345.9 |
| Promeia / Remielle / Velina (best non-Miyabi anomaly) | #1 · 394.6 | #15 · 335.9 |
| Miyabi / Vivian / Yuzuha | #7 · 348.5 | #26 · 319.5 |

The anomaly half of the criteria is met. The Sigrid rung is not, because both mechanics pay every
attacker the same and cannot separate Sigrid from Hugo. That gap is SCORE-146. NMY at #1 is not a
requirement: now that SCORE-146 lifts Severian, NMY may drop behind him,
and that is fine.

## Sequencing

**SCORE-146 has landed**
([high-severian-ranks-below-evelyn-for-wanting-nothing](../issues/resolved/high-severian-ranks-below-evelyn-for-wanting-nothing.md),
[COMP-01](../engine/l4-components.md#comp-01-the-conventional-fit-credit)). It turned out narrower
than first expected. The fix credits plain attackers with no declared needs: Severian, Nekomata,
Soldier 11, and a little for Ellen and Zhu Yuan. YSG and Sigrid declare needs, so they did not
move. The attack calibration anchors were unchanged. On Revenant, Severian's best team moved
from #104 to #61.

If the order can't be kept, ship without the Sigrid assertion and add it alongside SCORE-146.
Never park it in `KNOWN_RED`.

## Fitting levers

Fit these after the change is in.

* **Double-sub-DPS teams gain twice** (Norma + Roxy). Tune with `STUN_CRIT_EXPOSURE` and
  `CD_WEAK_SUBDPS_SHARE`, not with `CD_WEAK_PER_UNIT`. A stunner that declares `scaling.cd` drops
  out of the stunner row automatically.
* **"NMY is the only good anomaly team"** is held up by `debuffs.buildup` ×
  `BUILDUP_DEBUFF_PER_UNIT`. At buildup 4 with a per-unit penalty of 12, PRV stayed #2. The binding
  constraint is how far below NMY the other Miyabi lines sit.
* **`SELF_CD_EXPOSURE` has no anchor yet.** It can't be fitted to a stated rung
  (`Roxy/Severian/<support>` against NMY) until Severian is released and SCORE-146 has landed.
* **The calibration anchor may move.** NMY's projected raw score (~627) is close to the anomaly
  anchor (629, a top-10 mean across all bosses). If it enters that top 10, the anomaly factor
  shifts slightly on **every** boss. That is legitimate, but it must be reported.

## Files

| File | Change |
|----|----|
| `app/public/data/bosses.json` | Revenant: `debuffs: { buildup: 6 }`, `weak: ["cd"]` |
| `app/public/lib/common/team-scorer.js` | New `BOSS_WEAK` constants; `critDamageExposure`; two L3 blocks; the proc-surplus cut, resolved onto the unit context. Short comments, each with a tag |
| `documentation/data-model/boss-object.md` | `debuffs.buildup` and `weak: cd` in the field table and the `weak` list. Revenant in "Bosses worth knowing" as the inverse of Horizon. Code notes `[WEAK-02]` (crit weakness: exposure table, sub-DPS, stunner and self-CD rulings) and `[WEAK-03]` (buildup debuff: self-exclusion vs the Horizon CD block, surplus cut, Severian unaffected, Alice limitation) |
| `documentation/engine/unit-context.md` | One line on the boss-dependent proc-surplus field |
| `documentation/issues/deferred/` | Alice's polarity surplus is cut by buildup debuffs. Not modelled; trigger and fix as above |
| `documentation/reference/TAGS.md` | Rows for `[WEAK-02]` and `[WEAK-03]` |
| `test-mechanics.mjs` | **New tests**, as many as is natural; only existing tests must not be split. All on a synthetic boss. *Buildup debuff:* charged when the unit procs, offset by buffs, not charged to lumen or attackers. *Surplus cut:* Roxy is cut, Yuzuha restores her, Severian's wind condition is unchanged. *Crit exposure:* Miyabi 1.5× an attacker, anomaly 0.3×, armorer 0, sub-DPS stunner 0.5 × share, self-CD term only when the self buff is active |
| `test-rankings.mjs` | **New Revenant tests.** NMY is the best anomaly team by a clear margin and rates Excellent (read the cutoff from `strength-rating.js`; don't hard-code it). No other anomaly team sits above the best attack team or the best rupture team. Miyabi lines rank above non-Miyabi anomaly lines that use the same supports. Claret's carry credit is 0. After SCORE-146, the best Sigrid team beats every other ice attacker's best team (Hugo, Ellen). The existing ice-weak-bosses test must stay green |
| `documentation/CHANGELOG.md`, `STATUS.md` | The usual entries |
| `app/public/data/calibration.json` | Regenerate. Never hand-edit |

## What it does not do

* **No display change.** The [Deadly Assault boss-mechanics feature](da-show-weakness-resistance-shill.md)
  deliberately shows only weak to / resists / favors.
* **Teammates' crit-damage buffs are not amplified.**
* **It does not tell buildup-driven procs from polarity procs** (Alice, above).
* **It does not fix SCORE-146** or Claret's CD conversion. Both are separate defects.

## Verification

1. **Prediction first.** Run `score-dump` before and after, then `score-delta`. The prediction is a
   property of the rows, so check it with a short throwaway script over the two dumps:
   * Only `revenant` rows may move. Any other boss moving is a failure.
   * `l3` may move on any Revenant row.
   * `l4` moves **only** on Revenant rows that contain a proc-surplus unit, and only downward.
     That means Roxy; Alice rows exist only in lenient mode.
   * A row's L3 goes **up** only if the team has a damage dealer with crit exposure above 0. It
     goes **down** only if the team has a proccing anomaly DPS with a buildup shortfall.
   * NMY moves only up.
2. **All five suites.** Report in the CLAUDE.md format: new failures first, then `KNOWN_RED`. The
   recommendations and bucketing suites matter here, because pull coverage and DA allocation both
   score through `scoreTeamForBoss`.
3. **Calibration.** Run `node generate-calibration.mjs`, then `node calibration-check.mjs` (0
   inversions). Report whether any anchor moved.
4. **Ladder.** Run `node matchups.js -b revenant -30`. Check it against the acceptance criteria
   and fit the constants with the levers above.
