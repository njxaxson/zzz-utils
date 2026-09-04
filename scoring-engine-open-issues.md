# Scoring engine — status

Concise by design. Deep history, post-mortems, measurements and the reasoning behind every fix live
in `scoring-engine-internals.md`; this doc is only "where do things stand and what is left."

Last reviewed 2026-09-03. Branch `wide-blast-radius-recovery` — not merged to `main`.

**Scores now come on two scales.** The engine returns *raw*; anything comparing archetypes against
each other reads *calibrated*. Check which one you are holding before drawing a conclusion from a
number — see *Archetype calibration* below.

## Test status

| suite | state |
|----|----|
| scoring | **118 pass, exits 0.** `KNOWN_RED` is empty |
| cohesion fixture | **11/11** — owner judgements on support fit |
| bucketing | **6/6** |
| recommendations | **44/44, exits 0.** `KNOWN_RED` is empty |
| calibration certification | **0 rank inversions**, 44 (boss × archetype) groups, 61,423 teams |

```bash
node test-scoring.mjs && node test-recommendations.mjs && node test-bucketing.mjs && node cohesion-fixture.mjs
node generate-calibration.mjs --check   # calibration.json vs current engine/data fingerprint
node calibration-check.mjs              # certifies calibration reorders nothing within an archetype
```

Support fit is resolved and the Miyabi ladder is closed (internals §8d, §8e). The rankings pass —
every complaint in `rankings-open-issues.txt`, start to finish — is internals §Ra–§Rm.

## Open

| # | issue | status |
|----|----|----|
| 16 | **Sub-DPS tier is halved beside a same-type carry** | A double count: a unit's tier already prices the fact that it plays sub-DPS, so halving it again rates Velina as half a primary carry. This is why the Miyabi track outranked the Velina track until it was corrected by declaration instead. Do not confuse it with the `isForcedSecondaryDPS` halving, which is a real role-collision charge and is correct. Wide blast radius; **post-release**. Internals §Rj. |

### Open per-agent rankings complaints

**None. Every complaint in** `rankings-open-issues.txt` is closed — see *Recently closed* and the
*Parked / adjudicated* list for which were engine defects and which were the engine being right.

## Archetype calibration (shipped 2026-09-03)

**The engine still returns raw scores and nothing about its mechanics changed.** Calibration is a
boundary layer: `calibrated = raw × factor[archetype]`, one factor per archetype, applied by the
tools that compare teams of *different* archetypes against each other. Full derivation, and the
three approaches that failed, in internals §C.

Why it exists: on Fiend the three teams the owner plays as near-equivalent scored 671 (anomaly),
554 (rupture) and 530 (attack). That 141-point spread measures how many mechanics an archetype
has, not how good the teams are. Calibrated they land at 424 / 414 / 413.

| archetype | anchor | factor |
|----|----|----|
| anomaly | 633.5 | ×0.631433 |
| attack | 514.5 | ×0.777514 |
| rupture | 535.1 | ×0.747552 |
| armorer | 417.3 | ×0.958635 — **preview only** until Claret ships |

**Operational rules, in order of how badly it goes if you skip one:**


1. **Regenerate after any change to** `team-scorer.js`, `units.json` or `bosses.json`.
   `node generate-calibration.mjs` (add `-p` for the preview file). `--check` compares the
   committed file's fingerprint against those three inputs and exits 1 when it is stale.
2. **Re-certify before trusting anything.** `node calibration-check.mjs` asserts that within any
   one archetype, the calibrated ranking is identical to the raw ranking on every boss. That is
   true by construction, which is exactly why it is a good trap — it catches a clamp, a leaked
   per-boss term, or rounding applied to the result instead of the factor.
3. **Never clamp to the target.** An archetype's best teams are *meant* to land slightly above
   400\. Clamping is the one change that would genuinely flatten the top of the ladder.
4. **Round the factor, never the result**, and sort on unrounded values.

**Which scale each tool speaks** — getting this backwards is the easiest mistake available:

| calibrated (compares across archetypes) | raw (same-unit / same-archetype only) |
|----|----|
| `matchups.js`, `deadly-assault.js` | `rankings.js`, `compositions.js` |
| Deadly Assault solver, `dps-buckets.js`, `findExclusiveCombinations` | `test-scoring.mjs` and every other suite |
| all four web pages, `strength-rating.js` | `pull-engine.js` (never calls the scorer at all) |

`rankings.js` staying raw is deliberate, not an oversight: it only ever compares same-unit
variations, prints no scores, and raw is what resolves the fine ordering between them.

**What calibration does not fix.** Rupture's mid-range still sits low — a median "rupture team" in
the corpus is usually a mixed team that borrowed a second carry from another archetype, because
there are only five rupture units. Owner ruling: those teams genuinely are worse, and the corpus
median is not a meaningful object anyway. Do not tune to it. Internals §C.4.

## Parked / adjudicated (don't re-open)

* **Issue 3 (Remielle ceiling) and issue 14 (score inflation at the top of the corpus)** —
  **CLOSED 2026-09-03. The future feature shipped: it is archetype calibration** (see *Archetype
  calibration* below). Both were the same complaint seen from two angles — anomaly teams ceiling
  far above attack and rupture ones because anomaly has more mechanics to score, not better teams.
  Calibration divides that out at the boundary instead of inside the scorer, which is why neither
  was ever chaseable in the mechanics.
* **Issue 15 (**`true` vs `1` in need severity) — closed in favour of the documented weight
  convention: `true` behaves as weight 1 ("minor"), per `engine-context.md` §3. If a unit's need is
  genuinely defining, the data should say `3`, not `true`.
* **Miyabi ladder (TEST 101)** — closed. Below the top two the order is **boss-conditional** and the
  test asserts it narrowly on purpose. `NMAstra`/`MVYuzuha` are an unordered rung. Internals §8e.
* **Remielle/Velina ladder (TEST 116)** — same shape: the full ladder is asserted only on the two
  element-neutral bosses, because elemental L3 legitimately reorders the lower rungs elsewhere.
  Do not widen it. Internals §Rj.
* **TEST 7** — Evelyn stunner ladder. Ordering is correct and pinned. Parked: the Norma/Dialyn band
  mandate (dropped), and the Dialyn-beats-Lighter *margin* (closing it means moving a ring-fenced
  constant).
* **Lighter vs Dialyn for Evelyn on Pompey** — order confirmed, gap arguable, not worth holding the
  engine.
* **Nangong/Yixuan/Sunna** — the **flagship proof** of emergent scoring: owner play-tested it, the
  engine was right and prevalent thought wrong. Internals §8d.
* **Jane on Miasmic Fiend** — `Nangong/Aria/Jane Doe` (430.6) over `Jane/Vivian/Yuzuha` (423.9).
  **Complaint closed 2026-09-03: the owner withdrew it** — "NAJ > JVY is very valid. My original
  complaint was not correct." The supportless team *is* demoted to the `NO_SUPPORT` tier; what
  carries it is `Fiend.favored = ["Alice","Aria"]`, worth `Favored: Aria +22`.

  Structural fact worth keeping regardless: **favored is additive and lands pre-multiplier, while
  the no-support demotion is multiplicative**, so a large enough favored bonus will outrun a
  structural tier. Here +22 survives as 22 × 0.80 = 17.6 against a 6.7-point gap. That is by design,
  but it means boss `favored` and `shillIntensity` are strong levers — strong enough to mask a
  structural verdict — so change them deliberately.
* **Evelyn on Notorious Pompey** — `Norma/Evelyn/Zhao` over `Lighter/Evelyn/Astra`. **Complaint
  closed 2026-09-02: the engine is correct.** It survives on Norma, who so drastically outweighs
  Lighter that the support slot cannot make up the difference. Not a defect.
* **Starlight Billy on The Defiler** — Pan Yinhu outranking Koleda. **Closed 2026-09-02.** Two
  changes: Koleda's chain **buff** was being priced as a chain **provision** (a real bug, internals
  §Rl), and `MULT.CHAINS_BUFF` was then set to 8. The ladder is now Dialyn > Norma > Ju Fufu >
  Koleda > Pan, so all four stunners named in the owner's rule clear Pan. TEST 62's
  Dialyn-over-Koleda margin was relaxed 20 → 15 to allow it — owner: favour correct ordering over
  margins. Sigrid declares `scaling.chains: 3`, so she is chain-relevant and that margin moves with
  the same dial; the ordering TEST 62 guards is intact.
* **Claret on Typhon Slugger** — `Roxy/Claret/Caesar` ranking high, and Seth/Anby appearing at all.
  **Complaint closed 2026-09-02: the engine is correct**, and it was the last release blocker.
  Typhon is **fire-resistant**, so Koleda is rightly punished and cannot be Claret's stunner there.
  Caesar ranks where she does because her **general damage debuff is worth more to an armorer than
  to a normal carry**. And Seth and Anby appear because the roster genuinely runs out: with Koleda
  punished for fire and Rina for her evasive assist, Claret's good partners are **Roxy, Trigger,
  Nicole**, then **Caesar and Orphie**, and after that there is nothing left — so the tail of the
  ladder is barrel-scraping by construction, not by defect.
* **Banyue on Notorious Pompey** — `Ju Fufu/Banyue/Lucia` over `Dialyn/Banyue/Lucia`. **Complaint
  closed 2026-09-02: the engine is correct.** Ju Fufu edges Dialyn on fire weakness plus her
  off-field bonus, and that is the right answer here because **Banyue is field-hungry** — she wants
  the field to herself, so an off-field stunner suits her. Field hunger is distinct from
  `scaling.greedy` (which is about needing the *stun window* to oneself) and is **deliberately not
  modelled**. Do not add it. Owner ruling.
* `Trigger/SAnby/Seed` on UCC — settled by declaration rather than by inference. Seed is tagged
  `attack` but plays support, and the engine cannot see that because she declares no `pseudoRole`;
  instead SAnby and Seed each declare a conjunctive synergy group and the test floor came down. It
  is a **carve-out, not an emergent result**, and the margin is thin. The principled fixes remain
  open: give Seed a support `pseudoRole`, or infer pseudosupport from buff supply. **Do not** close
  it by restoring the same-element escape — that re-breaks three filed complaints. The real solution likely involves a team composition carve-out that would uniquely land on Seed. Because Seed mandates that a second attacker be present - her only join is on attack agents with no alternatives - then she has many compositions where a support unit just doesn't fit over the stunner. The correct solution is that for any attack/rupture/armorer agent that explicitly and only has a single join on the same role - i.e. Seed is an attack agent who only joins with another attack agent - then they are EXEMPT from the NO_SUPPORT penalty, similar to the same way a totalize team with two stunners is exempt from the NO_SUPPORT penalty. To be addressed as an engine expansion in a future release; not for now. Internals §Rk.
* **Issue 5 (an under-met need ignores the consumer's appetite)** — **closed 2026-09-02 as a
  nonissue.** The arithmetic is real: `scoreNeedFulfillment`'s undersupplied branch multiplies by
  `coverage` on top of `supply x need`, which cancels the need term, so a supplier is paid
  `keyMult x supply² x 0.6` whatever the appetite. But the surface is **one pair type on the whole
  roster** — Ye Shunguong's `veils: 2` beside a weight-1 veils supplier collects 4.2 where
  appetite-respecting arithmetic gives 8.4. Nobody declares `ablooms` or `vortex`; Aria's `veils`,
  Anton's `quick-assists` and Banyue's `interrupt-resistance` can never be undersupplied at current
  supplier weights; `ultimates` escapes via `FRACTIONAL_COVERAGE_KEYS` and `disorders` via
  team-wide pricing. Owner checked the one affected team, `Nangong/Ye Shunguong/Astra`, across every
  boss: it sits in \[225, 285\] where it should. Not worth touching a shared formula. Internals §5.
* `ablooms` / `vortex` plurals — dormant *need* keys, not typos for the singular damage keys.
  See the comment above `NEED_FULFILLMENT_KEYS`.

## Recently closed

**2026-09-03 — issue 9, the pull engine and partner quality. Closed for release, with a
stopgap.** Remielle only works inside a triple-anomaly team, and how good that team is
depends enormously on one partner. The engine could not tell those rosters apart, so it
rated her identically whether or not Velina was owned. Recommendations TEST 43 pinned it
and is now green; `KNOWN_RED` is empty.

What shipped, all inside `pull-engine.js` — the scorer, `units.json` and `bosses.json`
were not touched:

* **A partner ladder.** Owned partners are scored from declared data only —
  `tierToQuality(tier)`, +25 when the two units name each other in `synergy.units`, +10
  when the partner's `subdps` pseudoRole is unconditional. Velina 130, Vivian 65,
  Burnice 55, Yanagi 40, Grace 40; cutoffs at 100 / 60 / 50 give High / Medium / Low and
  no recommendation below that. Only sub-DPS *bases* are eligible (tagged anomaly AND
  declaring a `subdps` pseudoRole), so anomaly carries like Aria and Promeia are not
  enablers even though Aria is a declared mutual pair.
* **A third-slot check.** The pair is two thirds of a team and Remielle starts no reaction
  herself, so the rung drops one level unless some other *native* anomaly agent has a
  different disorder element — Vivian beside only Aria is ether on ether, Velina beside
  another wind agent triggers no vortex. Native only: a pseudo-anomaly such as Nangong
  does not fill one of the three slots, matching how the conditional-buff check already
  counts them.
* **Cards now split by unit.** The codependency penalty used to drop the whole card, so
  Remielle demoted Aria, Jane Doe and Yanagi beside her, and Ye Shunguong demoted Seed,
  Cissia, Sigrid and Evelyn. A penalised unit is now emitted as its own card and its
  neighbours keep theirs. That was a pre-existing bug, not something the ladder introduced.
* **The nameless note is gone.** `Needs  to reach full potential` came from walking
  Remielle's `scaling.greedy` (a self-descriptor nobody can supply — now skipped) and
  `scaling.anomaly` (a real need, but looked up against `buffs.anomaly`, which is an
  anomaly *damage* buff). The anomaly lookup now mirrors `team-scorer.js:4138-4176`:
  supply is additive across the roster, one per non-lumen agent with an effective anomaly
  role plus any `utility["anomaly:<element>"]` surplus.

**The cutoffs are fitted, not derived.** They reproduce the owner's ordering over the five
anomaly sub-DPS that exist today; a sixth should be re-checked by hand. And the engine
still never calls the scorer — this is a proxy for partner quality, so issue 9's real
content is deferred rather than solved. The element-scoped keys
(`scaling["anomaly:wind"]`, `scaling["anomaly:electric"]`) still fall through the old
lookup; nothing regresses because no unit declaring one is codependent.

**2026-09-03 — archetype calibration, shipped end to end.** Closes issues 3 and 14, and the
`Lighter/Burnice/Promeia` on Horizon complaint. Details in the section above and internals §C; the
short version is that raw scores are untouched and every cross-archetype consumer now reads a
calibrated score instead.

* `Lighter/Burnice/Promeia` on Scorched Horizon. The complaint was that it scored 380+ and
  looked inflated there. It scored **raw 370.8, rank #158** of 3,788 viable teams — sitting level
  with rupture and attack teams on 365–370 raw that were *not* its equal. Calibrated it is
  **234.1, rank #239**: `Ju Fufu/Yidhari/Astra` (raw 369.9 → 276.5) and `Ju Fufu/Sigrid/Astra`
  (raw 367.5 → 285.7) now correctly sit above it. Nothing about the team's own scoring changed —
  it was only ever being read against the wrong yardstick. Horizon's #1 is
  `Promeia/Remielle/Velina` at 376.7.
* **Strength labels re-derived** on the calibrated scale, 5 tiers → 7: Excellent 354.4 / Great
  299\.7 / Good 229.0 / OK 203.4 / Tough 189.5 / Risky 157.3 / Bad below. The old 375/300/195/145
  cutoffs were fit to a corpus topping out near 713 and were badly archetype-skewed — 1,327
  anomaly teams earned "Excellent" against 356 attack teams, on numbers rather than merit. The
  A-rank-carry demotion is unchanged in spirit but now drops exactly one tier (to *Great*) rather
  than being hardcoded to whichever tier is called "Good".
* **Rank bands re-derived** from a real case, not in the abstract: `RANK_BAND_RATIO` 0.02 → 0.011,
  `RANK_BAND_FLOOR` 5 → 4.5. On Thrall, `Dialyn/Ye Shunguong/Sunna` (409.4) and the best
  non-Dialyn alternative `Ye Shunguong/Zhao/Sunna` (405.2) are 4.2 apart; that gap has to fall
  inside one band or the solver will not give Dialyn up even when the three-boss total is better.
  0\.011 × 409.4 = 4.50 is the smallest ratio that clears it. Verified end to end: the solver now
  frees Dialyn for `Dialyn/Yixuan/Lucia` on UCC at ranks 1+1+1.
* **Monoshock teams label as attack, not anomaly.** `getPrimaryCarry` picks by tier, so a team
  built around a quirky attacker scaling off anomaly procs used to label anomaly whenever its
  anomaly unit outranked the attacker. 78 teams, all of them; overridden in `getTeamArchetype`
  only, leaving `getPrimaryCarry` alone because `scoreArchetypeFit` depends on its tier-first rule.

**2026-09-02 to 09-03 — the rankings pass, complete.** **All \~25 complaints in**
`rankings-open-issues.txt` are closed, plus tracked issue 11 and issues 12–13, 15 and 5. Roughly
half were engine defects and half were the engine being right and the intuition wrong — the split is
in *Parked / adjudicated* above. Full record with measurements in internals §Ra–§Rm; the short
version:

* Structural fixes: the no-support demotion is no longer gated on `CONVENTIONAL`; graded no-stunner
  tiers, with the stunless carve-out made role-agnostic; rupture accepts only one carry; element
  resistance reads damage dealers, so a resisted sub-DPS is disqualified while a pure stunner is
  only penalised; same element is no longer "interaction" for two attack carries; the monoshock
  carve-out stops reading `am`/`ap` stats as anomaly mechanics; and an unmet need is charged in
  proportion to the weight the unit declared.
* Declared L5 relationships, deliberate exceptions to emergence: a mutual **Aria↔Remielle** pair, a
  mutual **Remielle↔Velina** pair, and a new **conjunctive** `synergy.units` form (a `"+"`-joined
  group that pays only when every named unit is present).
* Rankings regenerated and screened. **Final screen, 2026-09-03, against the pre-change CSVs: 48
  ladders got a new #1 and not one violates a rule this pass enforced.** 48 distinct teams newly
  reached a top-3, one flagged; widened to top-5, three flagged. All three are **supportless Nangong
  teams** — `Nangong/Miyabi/Promeia` (promeia #3), `Nangong/Aria/Grace` (grace #5),
  `Nangong/Jane Doe/Velina` (jane-doe #5) — and each *did* take the `NO_SUPPORT` tier. The screen
  reports team **shape**, so "a supportless team placed third" is what it is telling you, not "the
  rule failed"; and the owner has since ruled that a supportless Nangong team outranking a supported
  one can be correct (see the Jane-on-Fiend entry). The screen tests structural rules, not game
  sense, so it cannot rule out a judgement error only the owner would see.
* **Damage-type buffs are role-weighted.** A supplier buffing a damage type is now scaled by how
  much damage the consumer actually deals (`getBasicDamage/3`), the same way the generic `atk` buff
  already was. Orphie's aftershock buff on Trigger goes 18.0 → 12.0 — a stunner reads 2 rather than
  a DPS's 3 — while the carry's share is untouched. Orphie still correctly beats Sunna for Harumasa;
  2,756 movers, all in the predicted set, no boss's top-3 changed. The channel was also renamed
  `MULT.DAMAGE_NEED` → `MULT.DAMAGE_TYPE_BUFF` with the debug label `need(damage:…)` →
  `buff(damage:…)`, because the old naming twice drew suspicion of a bug that was not there.
  Internals §Rm.1.
* **Boss data tuning closed two complaints** (owner, 2026-09-03): `Bringer.favored = ["Miyabi"]`
  with `shillIntensity: 6` for the Miyabi-on-Bringer complaint, and
  `Fiend.favored = ["Alice","Aria"]`, which put `Alice/Remielle/Vivian` (526.4) over
  `Miyabi/Remielle/Vivian` (504.8) and closed the Remielle-on-Fiend complaint.
* A chain **buff** is no longer read as a chain **provision**. Koleda declares `buffs.chains` and was
  the only unit affected: she was paid a fraction of a `chains` need she cannot satisfy, and the buff
  was credited nowhere. Now priced off the consumer's chain magnitude, so it lands on every DPS and
  scales with how hard that carry's chains hit. Internals §Rl, TEST 118.

**2026-09-02** — TEST 101, the Miyabi ladder. A dedicated `NO_SUPPORT` structure tier closed the
four `Nangong/Miyabi/Vivian` rungs.

**2026-09-01** — the support-fit rebuild and its run-up (19 tests, plus bucketing 4/6 → 6/6).
Mechanisms: relevance is a max not an average; off-element stunners aren't penalised; baseline buffs
are flagship-eligible; chains/ultimates land on any DPS; archetypes declared in data;
`fit = delivered/achievable`, the acid test. Internals.

## For release

**Nothing is release-blocking, and every rankings complaint is closed.** Claret was the last
blocker and the engine turned out to be right about her.

Remaining, all optional:


1. **A human read of the rankings.** Regenerated and screened 2026-09-03 after the last change
   (`node rankings.js -15`, 30 CSVs in `matchups/`), so they are current and structurally clean —
   but no person has read them since. This is the only thing standing between here and a release.
2. Issue 16 (sub-DPS tier double count) — post-release.

**Step 4, re-anchoring the numeric bands, is dropped** — owner's call, obviated as long as the suite
stays green and the rankings read correctly. Issue 14 (top-of-corpus inflation) is no longer parked:
archetype calibration closed it. Internals §Rm.2 records a place where that inflation was forcing
boss data to compensate — worth re-reading now that the inflation itself is handled outside the
scorer, since the compensation may no longer be pulling its weight.

**Two boss-data levers are now working around problems rather than fixing them**, and both are
easier to see with calibration in place:

* **Bringer's** `shillIntensity: 6` is pure number-fudging to force Miyabi to the top. It is the
  reason Bringer alone stays a 10/0/0 anomaly sweep, and the anchor rule has to exclude favored
  teams specifically to stop that fudge from setting anomaly's whole scale. Note it does *not*
  lock out other archetypes — attack has 2,055 viable teams there and rupture 780.
* **Aberrant's** `shillIntensity: 3` should become a mechanic instead: making him uniquely
  vulnerable to lumenize damage, which only Remielle delivers, turns a thumb on the scale into a
  mechanics-emergent driver.

## Working notes

* **A green suite is not evidence; a prediction with zero exceptions is.** Write down which teams
  are allowed to move *before* the change, then make `score-delta.mjs` list the exceptions. Two
  predictions failed during this pass and each caught a real defect the suite missed (internals §Rc,
  §Rg).
* **Do not use** `scoring-diff.js` to check whether a change did anything — it hides shuffles inside
  tie groups and reports "no changes" for a change that moved the whole corpus. Use the dump/delta
  pair.
* **Predict by effective role, never by tag.** That produced two false predictions in two days.
* **Favour correct ORDERING over MARGINS.** Owner's standing position. When a margin assertion
  and an ordering pull against the same constant, the ordering wins and the margin gets relaxed —
  margins in this suite are almost never calibrated figures, they were "comfortably ahead" written
  as a number. Say so in the test comment when you move one, and keep the ordering it was guarding.
  TEST 62's Dialyn-over-Koleda margin went 20 → 15 for exactly this reason.
* **Assert the mechanism, not the total.** Absolute-score fixtures move on every unrelated change,
  and re-pinning one silently codifies whatever the engine currently does — including orderings the
  owner rejects. TEST 107 reads `trace.contention` instead. See `engine-context.md` §7.
* **Adding a structure tier is never local.** Every `=== STRUCTURE.X` comparison is a place where a
  new tier changes behaviour by *not* matching, and that fails silently and upward. Internals §Rc.
* **A calibration change is judged on the neutral boss at p85, not on the pooled corpus.** Pooling
  every boss lets anomaly-shill bosses inflate anomaly's own baseline, and below about p90 the
  corpus is full of teams nobody would build. Internals §C.5.
* **Two docs, two scales.** When you quote a score in a write-up, say which scale it is on. Most
  of the numbers in this file and in internals predate calibration and are raw.
* `matchups/` is gitignored. `calibration.json` is **not** — it is generated data that ships.

```bash
node score-dump.mjs > matchups/before.txt
# ...change...
node score-dump.mjs > matchups/after.txt
node score-delta.mjs matchups/before.txt matchups/after.txt --predict <Unit,Unit>
node cohesion-fixture.mjs   # the objective function for support fit
node rankings.js -15        # per-agent CSVs into matchups/ (raw — same-unit comparisons)

node generate-calibration.mjs          # regenerate after ANY engine/data change
node calibration-check.mjs             # certify: 0 within-archetype rank inversions
node calibration-check.mjs --alignment  # neutral-boss p85 spread + per-boss matchup signal
node calibration-check.mjs --mix        # per-boss top-10 archetype mix, raw vs calibrated
```


