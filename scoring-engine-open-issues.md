# Scoring engine — what is open

Short by design. Long-form history, mechanisms and recorded wrong turns live in
`scoring-engine-internals.md`.

Last reviewed 2026-08-31. Branch `wide-blast-radius-recovery` — **not mergeable yet**, see
*Where this stands* at the bottom.

## Test status

| suite | state |
|----|----|
| scoring | **103 of 109 pass.** 1 red on purpose (101). 5 need attention — 3 bands, 1 issue-8 question, 1 blocked on two ring-fenced constants |
| recommendations | 43 of 44. TEST 43 red on purpose |
| bucketing | **6 of 6** |

The 15 split roughly in half: about six are numeric bands that moved when the engine was
rescaled and just need re-anchoring; the rest are orderings that may be real. They have not been
triaged since the cohesion rework.

TEST 7 joined that list rather than leaving it. Its fire-weak rung is now adjudicated and green;
what still fails is the **Neutral** rung, and that is a genuine defect — see issue 8.


---

## Open

### 8. Cohesion — mostly rebuilt, needs calibration

**What it is.** Whether a support "fits" a team is judged per unit and then multiplies the
*whole team's* score. That multiplication is correct and deliberate — a team slot is scarce, so
a member who contributes nothing does not merely fail to help, they make the team bad. The
problem was **what fed it**: the engine measured how much a support *brought* rather than
whether it was *doing its job*.

Two teams made it obvious. Both have a small third member; one is fine and one is a wasted slot:

|    | delivers | doing its job? | read as |
|----|----|----|----|
| Qingyi on YSG/Sunna | 2.0 | yes — her one buff lands and it is her whole purpose | 63% ✗ |
| Yuzuha on Yixuan/Lucia | 1.9 | no — her defining kit lands on nobody | 55% ✗ |

Nearly identical on size, opposite on job, scored the same.

**What changed.** Cohesion now asks whether the unit's *defining* offering found a home, and
what fraction of the kit this team can actually use is arriving. Size still costs a unit — it is
already paid in their tier credit and in what each buff is worth to each teammate — it just
stops being charged a third time against everyone else's damage.

|    | before | now |
|----|----|----|
| Qingyi on YSG/Sunna | 220.0 | **352.2** — now above Lycaon's 323.2 |
| Yuzuha on Yixuan/Lucia | 303.7 | **156.5** — flagship misses, team collapses |
| Lucia on YSG/Zhao | 190.9 | **114.1** — she is delivering Koleda's package, priced as such |

**Still to do.** Calibration. 15 scoring tests need triage, and the numeric ones need
re-anchoring against the new scale (only orderings matter, so this is bookkeeping). Bucketing is
at 4/6.

**The clearest witness for what is left.** Evelyn on the Neutral boss, with Astra third and the
stunner varying. The damage estimate and the final score disagree completely:

| stunner | damage the team does | cohesion | final |
|----|----|----|----|
| Dialyn | **365.8** | 0.75 | 293.4 — *3rd* |
| Lighter | 347.1 | 0.82 | 296.2 — *2nd* |
| Trigger | 335.3 | 0.90 | **308.5** — *1st* |
| Ju Fufu | 316.5 | 0.82 | 270.2 — *4th* |

**The damage column is the owner's ladder exactly.** Everything that reorders it happens after,
in the multiplier. Dialyn is measured at 92% fit and Lighter and Trigger at 100%; the fit is
squared and then geometric-meaned, so eight points of fit swing the whole team by twenty-six and
an eighteen-point damage lead becomes a three-point deficit. Trigger additionally collects +15 for
being the only agent on the field.

Two dials are implicated and it is not yet clear which one is wrong: the **squaring** of a
non-DPS unit's fit, and the **spread** of the fit measure itself (92% versus 100% may simply be
too wide a gap for what separates Dialyn from Lighter here). TESTs 7 and 108 both pin this.


### 3. Remielle off triple-anomaly — mechanism fixed, ceiling still short

**Closed:** the headline defect. Remielle's cohesion used to read **100% whether or not her
triple-anomaly condition was met** — the engine never asked whether her defining buff landed.
It now reads 33% when the condition fails and 100% when it holds.

|    | before | now |
|----|----|----|
| `Nangong/Miyabi/Remielle` (2 anomaly) on Butcher | 502.4 | **273.8** |
| `Miyabi/Vivian/Remielle` (3 anomaly) on Butcher | 574.7 | 574.7 — untouched |

Her best teams did not move at all: 114 rows of `Remielle/Velina/X` and `Miyabi/Vivian/Remielle`
across all 19 bosses, **zero changed**. Teams at or above the Miyabi ladder floor went 22→6, 22→4,
13→1 and 14→1 on the four ladder bosses.

Three things were wrong and each needed its own fix — full write-up in the internals doc:
she was judged as a damage dealer rather than a support; the conditional was measured *after*
being shrunk; and a gated buff was not treated as her flagship.

**Still open — needs your review.** Your bar was that a non-triple-anomaly Remielle team reaching
200 has to justify itself, and that 220–240 is the ceiling if the stars align. **Sixteen teams
still reach 200 somewhere across the 18 bosses, and six clear 240:**

| peak | team | on |
|----|----|----|
| **288.8** | Nangong / Promeia / Remielle | Scorched Horizon (ice-weak) |
| **273.8** | Nangong / Miyabi / Remielle | Butcher |
| **271.5** | Nangong / Aria / Remielle | Discordant Solo |
| **255.4** | Nangong / Remielle / Velina | Discordant Solo |
| **250.2** | Promeia / Remielle / Nicole | Scorched Horizon |
| **244.4** | Nangong / Remielle / Yanagi | Sanguine Sweeper |
| 236.4 | Promeia / Remielle / Yuzuha | Scorched Horizon |
| 234.3 | Nangong / Alice / Remielle | Miasmic Fiend |
| 220.7 | Nangong / Jane Doe / Remielle | Miasmic Fiend |
| 220.5 | Nangong / Grace / Remielle | Sanguine Sweeper |
| 218.6 | Miyabi / Remielle / Nicole | Sacrifice Bringer |
| 212.1 | Promeia / Remielle / Zhao | Scorched Horizon |
| 209.0 | Lycaon / Promeia / Remielle | Scorched Horizon |
| 206.6 | Miyabi / Remielle / Soukaku | Sacrifice Bringer |
| 204.3 | Nangong / Remielle / Vivian | Discordant Solo |
| 203.8 | Remielle / Yanagi / Yuzuha | Stagnant Aberrant |

Two things to notice before deciding. Every peak is on a boss that favours the team's element —
Scorched Horizon is fire-weak and lifts Promeia, Discordant Solo lifts Nangong. And **Nangong is
in eleven of the sixteen**, which is the same signature the original defect had: he brings
pseudo-anomaly structure that pays the team while not counting toward Remielle's gate.

The question for you: is 240 a hard ceiling on every boss, or a neutral-boss figure that a
favourable matchup is allowed to exceed? On the synthetic neutral boss the highest is 203.4, which
is inside your band.


---

### 7. The Miyabi ladder

Owner-supplied target for every team buildable from
`[Miyabi, Vivian, Nangong, Yuzuha, Remielle, Sunna]`, against where the engine puts them now:

| target | current | team |
|----|----|----|
| 1 | 1 ✓ | Nangong / Miyabi / Yuzuha |
| 2 | 2 ✓ | Miyabi / Remielle / Vivian |
| 3 | **4** ✗ | Nangong / Miyabi / Sunna — Miyabi favours stun-based anomaly when close |
| 4 | **3** ✗ | Miyabi / Vivian / Yuzuha — should be same band, just below |
| 5 | 5 ✓ | Nangong / Miyabi / Vivian |
| below 7 & 8 | **6** ✗ | Nangong / Miyabi / Remielle — see issue 3 |
| 6 | 7 | Nangong / Vivian / Yuzuha — score still too high |
| 7 | 8 | Nangong / Vivian / Sunna — score still too high |
| bottom | 9–11 ✓ | the remaining Remielle teams |

Three things are wrong: the 3/4 inversion, Remielle at 6, and ranks 7–8 scoring too high. The
last is suspected to be **an anomaly subdps serving a *pseudo*-anomaly getting full structural
credit** — Vivian serving Miyabi should count for more than Vivian serving Nangong. Also
suspected: disorder *buffs* paying richly on a team that generates little disorder.

**Closed:** all of TEST 100. The `Yanagi > Burnice` rung was adjudicated — Burnice is the better
partner except on Yuzuha teams — and Remielle was removed as an invalid third. See the
adjudication log in the internals doc.


---

### 10. Astra is Evelyn's best support and the engine ranks her tenth

Owner-confirmed: **Astra is Evelyn's best-in-slot support.** The engine disagrees badly. Asking
for Evelyn's best teams on fire-weak Pompey across every stunner, Astra's first appearance is rank
10:

| rank | team | score |
|----|----|----|
| 1 | Norma / Evelyn / Sunna | 424.6 |
| 2 | Norma / Evelyn / Orphie | 419.4 |
| 3 | Lighter / Evelyn / Sunna | 412.0 |
| … |    |    |
| 8 | Norma / Evelyn / **Soldier 11** | 376.5 |
| 10 | Norma / Evelyn / **Astra** | 366.1 |

Sunna, Orphie and a second attacker all outrank her. The stunner ordering in that same output is
correct throughout, so this is specific to the support slot.

Note that Sunna over Astra here is the *opposite* of the Sunna/Yixuan adjudication, where Astra
correctly wins on a rupture carry. Evelyn is an attack carry, and phase 3 deliberately put Sunna
ahead of Astra on attack carries — so this may be that change reaching too far, or it may be Astra
being under-valued generally. Not yet diagnosed.

```bash
node matchups.js -t "Dialyn/Evelyn,Norma/Evelyn,Lighter/Evelyn,Trigger/Evelyn,JF/Evelyn,Koleda/Evelyn,Caesar/Evelyn" -o -b Pompey -50
```


---

### 11. Two attackers on one team are not penalised

`Norma / Evelyn / Soldier 11` scores 376.5 and sits at rank 8 for Evelyn on Pompey. Soldier 11 and
Evelyn are both attack carries; they cannot both have the field. Dual-attacker teams are supposed
to be bad for the same reason dual-rupture teams are, and the engine is not charging for it at all.

The burst-window contention rule from issue 7 (`scaling.greedy`) does not reach this — it only
fires when two units are annotated greedy above 1, and Soldier 11 is not. This is a *role*
collision rather than a window collision, and it wants its own check.

Owner: "that's definitely a bug."


---

### 9. The pull engine cannot see partner quality

Remielle's ceiling depends on one partner. Her best teams are all `Remielle/Velina/X`; without
Velina the best line is around `Alice/Vivian/Remielle`, which is good but not the same thing.

**The pull engine rates her identically either way.** It never calls the scorer — it reasons
about scaling keys, role coverage and codependency, none of which Velina changes on a roster
already heavy in anomaly. Recommendations TEST 43 pins this and is red on purpose.

Annotating `synergy.units` on the pair was tried and rejected: it does not move the
recommendation, and it lifts `Promeia/Remielle/Velina` by 80 points in the scorer.

Closing this means teaching the pull engine to weigh partner *quality*. That is a feature, not a
fix, and it does not block a merge.


---

### 5. Disorder supply — one loose end

The fix landed and is correct. What remains: for an under-met need the arithmetic cancels the
appetite term, so a supplier earns the same whether the consumer wanted a little or a lot.
`ultimates` and `disorders` each got a *different* fix for documented reasons, so a third
blanket one across the remaining six need types is probably wrong. **Investigate per key before
changing anything** — the long form has the reasoning.


---

## Adjudications

Settled, and now pinned by a test rather than sitting here:

| what | owner's call |
|----|----|
| ~~The Evelyn stunner ladder on fire-weak Pompey~~ | **REOPENED 2026-09-01 and reversed.** Owner checked aggregated player statistics: Dialyn is definitively better than Lighter. True ladder is `Norma > Dialyn > Lighter > …`, Norma and Dialyn inside one epsilon band, Lighter clearly outside it. TEST 7 now asserts that and is red — a real engine defect, not a band |
| **Burnice vs Yanagi as Miyabi's partner** | Depends on the third slot. Disorder supply is equal either way (Burnice cycles in parallel off-field; Yanagi cycles serially but forces polarity), so Burnice wins on tier and field time — **except with Yuzuha third**, where Yuzuha's disorder buff amplifies Yanagi's own polarity damage and Yanagi wins. Abloom is a separate mechanic that Promeia, not Yuzuha, amplifies. TEST 100's rung is now keyed off `buffs.disorders` and passes in both branches |
| **Remielle as a third slot in the partner ladder** | Removed. A third slot has to be a control and she is not one — with Nangong the team has two anomaly bodies, with Vivian three, so swapping the partner changed the team archetype rather than the partner. TEST 100 is now fully green and out of `KNOWN_RED` |

Still waiting:

| test | question |
|----|----|
| 101 | The remaining Miyabi ladder rungs |
| 13, 14, 18, 74, 75, 80 | Numeric bands that moved with the rescale. Re-anchor rather than tune toward |
| **3** | `Ju Fufu / Orphie / SAnby` and `Dialyn / Orphie / SAnby` now score **exactly 331.80** on UCC, and the test wants Dialyn strictly ahead. Caused by routing Orphie to the support branch. Their raw scores still differ (345.5 vs 361.1) so it is a coincidence at the final score, not a collapse — a tie-break question, not a defect |
| **Remielle ceiling** | Is 240 a hard cap on every boss, or a neutral-boss figure a favourable matchup may exceed? See issue 3 |


---

## Shelved deliberately

Recorded so nobody re-opens them as findings.

* **Lighter and Dialyn are \~30 points apart for Evelyn on Pompey.** They arguably belong inside one
  epsilon band for bucketing purposes rather than being cleanly separated. Owner: "I am not going
  to hold up the engine on that; this is fine for now." The *order* is confirmed correct; only the
  gap is arguable.


## Plan to full green

Written 2026-09-01 after the owner objected — correctly — that 92/109 was being reported as
though it were nearly done, and that the split between "adjust a number" and "real regression"
was an estimate rather than a measurement. It is now a measurement.

### What the 16 failures actually are

| kind | tests | count |
|----|----|----|
| **Ordering inversions** — the engine disagrees about which team is better | 4, 7, 9, 22, 63, 64, 108 | **7** |
| Numeric bands and margins | 13, 14, 18, 62, 74, 75, 80, 81 | 8 |
| Exact tie | 3 | 1 |

Plus TEST 101 (the Miyabi ladder), red by design.

TEST 62 is a margin, not an inversion: it wants `Dialyn > Koleda + 20` and the gap is **19.9**.

### The bands are NOT a rescale

This was the assumption in every previous status write-up and it is false. Scoring the corpus with
the engine as it stood at the branch point and comparing:

| | |
|----|----|
| rows compared | 125,476 |
| unchanged | 64,276 — over half |
| median delta | **0.0** |
| median of the top 500 scores | 460.0 → **470.6**, i.e. *up* |

So there is no global drift to re-anchor against. The bands that fail low are failing because
those specific teams dropped a long way:

| test | team | branch point | now | |
|----|----|----|----|----|
| 14 | `Banyue / Astra / Lucia` on Pompey | 432.5 | 260.8 | **−171.7** |
| 63 | `Norma / Evelyn / Astra` on Pompey | 454.8 | 366.1 | **−88.7** |
| 80 | `Lighter / Sigrid / Astra` | 353.9 | 287.8 | **−66.1** |
| 62 | `Dialyn / Sigrid / Soukaku` | 318.2 | 273.3 | −44.9 |

### One root cause under most of it

Mean score change per unit since the branch point, across viable teams:

| biggest losers | | biggest gainers | |
|----|----|----|----|
| Lucia | −52.6 | Seth | **+86.7** |
| **Astra** | **−38.2** (5,286 rows) | Lucy | +41.3 |
| Komano | −31.3 | Yanagi | +20.6 |
| Remielle | −30.9 | Miyabi | +19.2 |
| Orphie | −30.8 | | |
| Pan Yinhu | −27.8 | | |
| Dialyn | −22.9 | | |
| Norma | −20.8 | | |

Lucia and Remielle are **intended** — the Lucia/YSG "wrong tool" fix and today's Remielle work.
Astra is not. She is the reference-quality support and she lost 38 points on average.

**The bug.** Astra's largest cohesion offering is her generic damage buff (`dmg`, magnitude 3.00 —
her flagship). Its relevance reads **0.50 on `Norma/Evelyn/Astra` and 1.00 on `Nangong/Miyabi/Astra`.**

`getBuffRelevance('dmg', …)` returns `dps ? 1 : 0` and carries the comment *"generic damage: never
misses on any DPS."* But `dmg` is not in `STAT_BUFF_KEYS`, so it takes the **average** relevance
path instead of the max path: relevance is averaged across every teammate, including ones that are
not damage dealers. Evelyn returns 1, Norma the stunner returns 0, and Astra is charged 0.5. On the
Miyabi team Nangong is pseudo-anomaly and so counts as a DPS, both consumers return 1, and she gets
full marks.

So **a support is penalised for her team containing a stunner**, on the one buff that by its own
rule cannot miss. That is not a calibration question.

### Step 1 executed 2026-09-01 — two fixes, 16 unexpected failures down to 5

**P1. Relevance is a MAX over the team, never an average.** `getBuffRelevance('dmg')` returns
`dps ? 1 : 0` under a comment reading *"never misses on any DPS"* — but `dmg` is not in
`STAT_BUFF_KEYS`, so it took the averaging path. On `Norma/Evelyn/Astra` that meant Evelyn
returned 1, Norma the stunner returned 0, and Astra's largest offering was charged **0.50**.
A support was being punished for the composition of her own team.

Checked per key rather than blanket, as issue 5 insists. Every key that reached the averaging path
— `dmg`, `aftershock`, `disorders`, `abloom`, `def` — asks the same per-consumer capability
question: did *anyone* here want it. There was no correct member of that path, so the two paths are
now one. The DPS/non-DPS half-credit split is unchanged; only the average became a max.

Prediction — every moved team contains one of the 17 units carrying such a buff — **held, zero
exceptions**. 18,796 rows moved, 18,771 of them up.

**P2. No penalty for an off-element stunner.** An on-element stunner's own damage really is
amplified by the boss weakness, so the +15 bonus stands. The symmetric −15 does not: an
off-element stunner has lost nothing relative to baseline, he simply does not collect the bonus.
Charging both made the swing between two stunners **30 points** on a unit whose job is dazing.

The evidence was clean. On the NEUTRAL boss, where the term never fires, Evelyn's stunner ladder
was already exactly the owner's — Norma > Dialyn > Lighter > Ju Fufu. On fire-weak Pompey the swing
lifted Lighter past Dialyn. *A term that is right in its presence and wrong in its magnitude
reorders only where it fires* — that is the signature to look for.

A resisted element still costs 80; that is a real damage loss, not a missed bonus.

**Prediction failed once and was corrected.** Predicting "every moved team contains a stun-tagged
unit" produced 1,456 exceptions, all Caesar — she is a *pseudo*-stunner, in `stunUnits` by
effective role but not by tag. This is the second time in two days the same mistake was made
(Soukaku, in the Remielle work). **When a gate reads effective roles, never enumerate the
prediction by tag.**

**Result across all three suites:**

| | before step 1 | after |
|----|----|----|
| scoring | 92 of 109, 16 unexpected | **103 of 109, 5 unexpected** |
| bucketing | 4 of 6 | **6 of 6** |
| recommendations | 43 of 44 | 43 of 44 (unchanged) |

The Remielle work was re-verified afterwards and is bit-identical: triple-anomaly controls
unmoved, `Nangong/Miyabi/Remielle` still 273.8 on Butcher.

### What the remaining five are

| test | kind | detail |
|----|----|----|
| **7** | needs two ring-fenced constants | Only the band assertion now fails. Norma leads Dialyn by 28.7 where the owner says they share a band (eps 9.3). Cause is known exactly: **+15 sole-on-field-carry** (Norma is off-field, worth 14.4 of it) plus **+15 stunner on-element** (worth the rest on Pompey). The *ordering* Norma > Dialyn > Lighter > Ju Fufu is now correct on both bosses |
| **9** | adjudication, issue 8 | `Astra > Nicole` for Nangong/Aria. Astra's **raw score is 30 points higher**; she loses only on the cohesion multiplier, 0.812 vs 0.985, because her crit-damage buff is genuinely wasted on an anomaly carry. Whether a 17-point fit difference should cost 58 net points is the issue-8 question, not a new bug |
| **13** | band | `Dialyn/Evelyn/Pan Yinhu` wants < 100, reads 140.7. The engine already punishes him — util 40%, structure downgraded to +0, tier +1, rank −5 — but a Dialyn+Evelyn duo plus dead weight still clears 140 off a base of 175 |
| **18** | band | `YSG/Zhao/Soukaku` wants ≥ 250, reads 169.1. Already documented as a re-anchor: Soukaku's lone ice buff genuinely lands on nobody there, which is a real mismatch and deserves the hit |
| **74** | band | `Koleda/Claret/Rina` wants ≥ 315, reads 306.8. Short by 8.2 |

Three of the five are numeric bands, one is an issue-8 calibration question, and one needs two
constants the plan deliberately ring-fenced. **None is an unexplained regression.**

### The sequence

**P1 — fix the `dmg` averaging.** A buff that lands on the carry has landed; it should not be
diluted by non-DPS teammates. Check the other keys on the average path at the same time (`chains`,
`defense`, `disorders`, `abloom`, `recovery`) and decide per key, the way issue 5 was handled —
some genuinely are team-wide and averaging may be right for those.
*Prediction to state before running:* every team containing a `dmg` buffer or debuffer moves.
*Expected to clear or move:* 4, 7, 9, 14, 22, 63, 80, 108, and issue 10 (Astra ranked tenth as
Evelyn's support).

**P2 — re-triage from scratch.** Re-run the per-unit drift against the branch point. The remaining
list will be smaller and different, and anything still red gets classified again. Do not carry
forward the classification above.

**P3 — account for the other movers.** `Seth +86.7` was not asked for by any change on this branch
and is the largest single-unit move in the corpus; Komano −31.3, Pan Yinhu −27.8, Orphie −30.8 and
Piper −21.7 are likewise unexplained. Each needs a one-line justification or a fix. An unexplained
+86 is as much a defect as a red test.

**P4 — re-anchor what is genuinely a band**, one at a time, with the before/after numbers shown and
owner sign-off. No band moves silently.

**P5 — TEST 101 and bucketing.** The ladder rungs and 4/6 → 6/6.

**P6 — correctness sweep, not just green.** Green tests are not the goal; the owner's original
complaint was found by reading `compositions.js -10` output, not by a test. Dump the top ten for
every boss and read them. Anything that looks wrong becomes a new test.

### Reporting rule going forward

Lead with the aggregate and the ordering/band split, not with what was closed. "92 of 109" without
"seven of the failures are ordering inversions" is a misleading way to describe this state, and it
was the framing the owner objected to.

---

## Where this stands

Sound and settled:

* Deleting a badly-fitting buff no longer improves a team. That was issue 3's headline symptom
  and the acid test now passes.
* Element buffs are a menu — a unit is not charged for an arm with no target.
* Quick assists are a small benefit that always lands.
* `damage.basic` distinguishes a support who deals damage from one who does not.
* Burst-window contention (`scaling.greedy`): two greedy carries cannot both own the stun
  window, and a greedy carry gets more from a shortened enemy recovery.
* A measurement harness that catches this class of mistake — `score-dump.mjs` and
  `score-delta.mjs`, plus `KNOWN_RED` in two suites so exit codes mean something.

Not mergeable until the 16 scoring tests are triaged and re-banded, bucketing is back to 6/6,
and the remaining Miyabi ladder errors are closed.

Closed this session: the Evelyn stunner ladder on Pompey (now a nine-rung positive assertion),
all of TEST 100, and issue 3’s mechanism. Issue 3’s remaining question is a number, not a
mechanism.

**Suggested order.** Triage and re-band first — it is cheap and it shrinks the red list to the
genuine defects. Then the ladder (3/4 inversion, Remielle, the subdps/pseudo-anomaly credit).
Issue 9 last, or never, since it blocks nothing.


---

## Working notes

* `scoring-diff.js` compares *rankings* and hides shuffles inside tie groups. It reports "no
  material changes" for a change that moved every score. Use the dump/delta pair instead, and
  state a prediction before each change.
* A green suite is not evidence. A prediction with zero exceptions is.
* `matchups/` is gitignored; dumps go there.

```bash
node score-dump.mjs > matchups/before.txt
# ...change...
node score-dump.mjs > matchups/after.txt
node score-delta.mjs matchups/before.txt matchups/after.txt --predict Lighter
```


