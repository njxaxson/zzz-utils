# Scoring engine — what is open

Short by design. Long-form history, mechanisms and recorded wrong turns live in
`scoring-engine-internals.md`.

Last reviewed 2026-09-01. Branch `wide-blast-radius-recovery` — **not mergeable yet**, see
*Where this stands* at the bottom.

## Test status

| suite | state |
|----|----|
| scoring | **107 of 109 pass.** 1 red on purpose (101). **1 needs attention: TEST 9** |
| bucketing | **6 of 6** |
| recommendations | 43 of 44. TEST 43 red on purpose, parked behind the scoring work |

Closed on 2026-09-01, in order: TESTs 13, 74 and the `Lycaon/Yixuan/Soukaku` half of 18 by owner
recalibration; TESTs 4, 14, 22, 62, 63, 64, 75, 80, 81 and 108 by the relevance-is-a-max fix;
TEST 3's tie by the same; TEST 7 by the off-element stunner fix plus two owner rulings; TEST 100
entirely; TEST 18 by the baseline-buff rule; and bucketing from 4/6 to 6/6.

| test | what it is |
|----|----|
| **9** | **Genuine regression** (owner's ruling). `Astra > Nicole` for Nangong/Aria. Astra's raw score is 30 points higher and she loses only on the cohesion multiplier. The one clean fix was built and reverted — see issue 13 |
| 101 | The Miyabi ladder. Direction still unsettled; see issue 7 |

### TEST 7 — two parked assertions, both recorded in the test itself

**The Norma/Dialyn band mandate: dropped.** Asserted for one day, then removed at the owner's
direction. The band matters for **bucketing** — teams inside one band share a rank, so a banded
pair does not consume a rank slot — but that only bites when *Dialyn* is on top: "with Norma on
top Dialyn will naturally be free to be taken to a Yixuan team while leaving Norma for Evelyn."
The allocator gets what it needs from the ordering alone.

**The Dialyn-beats-Lighter margin: parked, 0.6 points short.** The owner's spec is that Lighter
sits *outside* Dialyn's epsilon band. The engine separates them by **8.1** against an epsilon of
**8.7**. The ordering is asserted and green; only the margin is parked, because closing 0.6 points
means moving one of the two ring-fenced constants that produce it.

**Both hinge on the same two constants**, and if either is ever reopened this is the evidence:

| term | what it does here |
|----|----|
| **+15 sole on-field carry** | Norma is off-field, so Evelyn owns the screen. Worth 14.4 of the Norma/Dialyn gap |
| **+15 on-element stunner** | fires only on a boss weak to the stunner's element; the rest of the Pompey gap |

The sole-carry bonus has now been the deciding term in **three** separate owner-specified
orderings — Burnice vs Yanagi, Norma vs Dialyn, and Trigger vs Lighter for Evelyn. That is the
strongest single argument on file for reopening it, and also the reason not to touch it casually.

---

## Open

### 8. Cohesion — rebuilt; the acid test still does not hold in general

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

**What changed.** Cohesion now asks whether the unit's *defining* offering found a home, and what
fraction of the kit this team can actually use is arriving. Size still costs a unit — it is already
paid in their tier credit and in what each buff is worth to each teammate — it just stops being
charged a third time against everyone else's damage.

|    | before | now |
|----|----|----|
| Qingyi on YSG/Sunna | 220.0 | **352.2** — now above Lycaon's 323.2 |
| Yuzuha on Yixuan/Lucia | 303.7 | **156.5** — flagship misses, team collapses |
| Lucia on YSG/Zhao | 190.9 | **114.1** — she is delivering Koleda's package, priced as such |

**The old witness here is RESOLVED.** This section used to carry the Evelyn/Neutral stunner ladder
as evidence that the multiplier was reordering a correct damage estimate — Dialyn 3rd behind
Trigger despite an 18-point damage lead. The relevance-is-a-max fix and the off-element stunner fix
closed it. The ladder now reads `Dialyn 378.8 > Lighter 356.1 > Trigger 344.3 > Ju Fufu 325.5`,
which is the owner's ordering, and TESTs 7 and 108 both pass.

**What is still to do.**

1. **The acid test does not hold in general.** A buff the team cannot use at all is free; one it
   can *partly* use is charged for the remainder — so making Astra's crit damage strictly worse
   raises her team by 94.6 points. This is the last red scoring test. **Issue 13 has the full
   diagnosis and the record of a fix that was built and reverted**; read it before attempting
   anything here, because the obvious repairs each move the problem rather than solve it.
2. **The multiplier's depth is still uncalibrated.** A 17-point difference in measured fit costs
   Astra 58 points of final score against Nicole. Whether that is the right exchange rate has never
   been decided; it is the question behind both remaining cohesion issues.
3. **Two dials have never been examined:** the squaring of a non-DPS unit's fit before it enters
   the geometric mean, and the spread of the fit measure itself.

---

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

### 10. ~~Astra is Evelyn's best support and the engine ranks her tenth~~ — CLOSED 2026-09-01

Re-measured and closed. The relevance-is-a-max fix did it: Astra's generic damage buff had been
charged at 0.50 whenever a stunner was on the team, which is every Evelyn team.

| | before | now |
|----|----|----|
| Astra's first appearance as Evelyn's support on Pompey | rank **10** | rank **1** |
| the teams above her | Sunna, Orphie, and a second attacker | — |

She now holds ranks 1, 3, 5 and 12 of the top twelve. No further action.

---

### 11. Two attackers on one team are not penalised

Still open, and less severe than when it was filed — `Norma / Evelyn / Soldier 11` has fallen from
rank 8 to rank **15** (376.5) as a side effect of the support fixes, but it is still there, along
with `Dialyn / Evelyn / Soldier 11` at 18 and `Lighter / Evelyn / Soldier 11` at 29.

Soldier 11 and Evelyn are both attack carries and cannot both have the field. Dual-attacker teams
should be bad for the same reason dual-rupture teams are, and the engine does not charge for it.

The burst-window rule from issue 7 (`scaling.greedy`) does not reach this — it fires only when two
units are annotated greedy above 1, and Soldier 11 is not. This is a **role** collision rather than
a window collision and wants its own check.

Owner: "that's definitely a bug."


---

### 12. ~~Soukaku on YSG/Zhao~~ — CLOSED 2026-09-01
### FIXED 2026-09-01 — rarity is not importance

The owner supplied the missing distinction:

> "Almost all support agents buff ATK. That means the buff isn't RARE. From a fit perspective, when
> you are trying to decide who is better — Yuzuha or Astra — you aren't looking at ATK as the
> discriminator... But an attack buff not fully landing is like yoinking the rug out from underneath
> the support. The baseline is 'I buff ATK and X,Y,Z' and you're picking which support is best based
> on XYZ because everyone is offering ATK."

The engine was conflating two different questions. **"Which support is best here?"** is answered by
the discriminating buffs — crit damage for attackers, anomaly and disorder buffs for anomaly teams.
**"Is this support doing their job?"** is answered by the baseline. The flagship test asks the
second question and was using a heuristic built for the first: largest offering by damage weight.

So `atk` — and `sheer`, the rupture-side equivalent that Lucia carries instead — is now
flagship-eligible at weight ≥ 3 regardless of whether it is the unit's largest offering.

For Soukaku this settles it. Her dead ice arm is **the Fiona case**: a unit is not punished for
carrying something this particular team cannot use. Her ATK buff lands fully on Ye Shunguong, so
she is doing her job.

**Weight 3 is the bar and it is load-bearing in both directions**, which is what keeps this from
becoming a blanket amnesty:

| unit | baseline | on an attack carry | outcome |
|----|----|----|----|
| Soukaku | `atk: 3` | lands fully | penalty lifted — correct |
| Lucia | `sheer: 3`, no ATK at all | does **not** land | penalty kept — the Lucia/YSG "wrong tool" case stays broken, as it must |
| Pan Yinhu | `sheer: 2` | below the bar | penalty kept — stays useless on an attack team |
| Yuzuha | `atk: 3` | reaches a rupture carry at 0.33, below threshold | penalty kept — deserved collapse preserved |

**Blast radius: 114 rows, every one containing both Zhao and Soukaku.** An earlier attempt that
admitted *any* top-annotation-weight buff moved 4,192 rows and re-broke TESTs 5 and 13; scoping the
rule to the baseline keys avoids that entirely.

**Result.** `YSG/Zhao/Soukaku` goes 169.1 → **382.7** on Nightmare (owner floor 250) and
142.4 → **322.1** on Butcher.

**Still open: the Butcher band.** TEST 18 wants [180, 275] there and now reads 322.1 — it was
failing the 180 FLOOR before and now exceeds the 275 ceiling. For scale, YSG's best line on Butcher
is 426.5 and his top seventeen all sit above 333, so 322.1 lands just below that pack — which does
read as "mid" for him. The band predates several engine changes. **Owner call: re-anchor, or is
322.1 genuinely too high?**


**Owner ruling 2026-09-01: genuine failure, not a band.** `YSG/Zhao/Soukaku` reads **169.1** and
should be **≥ 250**.

> "This is similar to the Qingyi/YSG/Sunna case: YSG/Zhao is a sound core and Soukaku brings a
> meaningful attack bonus to YSG. She isn't the best in the universe — neither would Qingyi be —
> but she helps and contributes."

That is the same shape the cohesion rebuild was supposed to have fixed. Qingyi on YSG/Sunna used to
read 63% and 220.0; after the rebuild she reads 352.2, because cohesion started asking *is this unit
doing its job* rather than *how much did it bring*. Soukaku here is the case that did not come
along.

**Why she is being charged.** Soukaku's element buff is ice. YSG is physical; Zhao is ice but is a
defence unit who deals little damage. So her one element buff genuinely lands on nobody, and the
engine treats that as a total mismatch. The previous plan explicitly recorded this as correct
behaviour and marked the 250 floor as a band to re-anchor. **The owner has now ruled the opposite**,
and the reasoning is that her ATK buff to YSG is real and meaningful, so she is a contributor whose
flagship missed — not dead weight.

The distinction the engine is failing to draw: **a missed flagship is not the same as a wasted
slot.** Soukaku still delivers a meaningful ATK buff to the carry. Compare Yuzuha on Yixuan/Lucia,
which correctly collapsed to 156.5 — there the defining kit lands on *nobody* and nothing else
lands either.

Related and probably the same mechanism: `FLAGSHIP_MISS_PENALTY` is a flat ×0.4 on a unit's
utilisation regardless of what else that unit is still delivering. See the internals doc, issue 8.

### Diagnosis (2026-09-01) — the flagship test is a cliff, and one dial serves three cases

**Soukaku's fit is 1.000.** Everything this team can use from her arrives; her ATK buff lands fully
on Ye Shunguong. Her *entire* penalty is the flat `FLAGSHIP_MISS_PENALTY` of ×0.4, applied because
her ice buff has no target. Two further penalties then compound off the same number: rank −5, and
the **structure downgrade** — a hard cliff that strips the team's +35 and its structure factor
whenever any support-like member measures below 50%. She sits at 40%.

The four neighbouring cases, measured:

| unit | fit | flagship | landed | util | owner's verdict |
|----|----|----|----|----|----|
| Qingyi on YSG/Sunna | 1.000 | `stun-mult` 2.00 | **yes** | 1.000 | correct, 352.2 |
| **Soukaku on YSG/Zhao** | **1.000** | `ice` 3.00 | no | 0.400 | **too low, wants ≥ 250** |
| Remielle on Nangong/Miyabi | 0.835 | `atk`, gated | no | 0.334 | correct, 273.8 |
| Yuzuha on Yixuan/Lucia | 0.722 | `anomaly` 3.00 | no | 0.289 | correct, 156.5 |

**Soukaku misses the existing band mechanism by 0.03.** `FLAGSHIP_BAND` already forgives a miss
when another offering sits within 60% of the flagship. Her ATK offering is **1.77** against a
threshold of 0.6 × 3.00 = **1.80**. Her data reads `atk: 3, ice: 3` — the two are equally central
by annotation, and only the damage pricing separates them.

#### Four designs tried and rejected, all measured

1. **Scale the penalty by delivered share.** Soukaku delivers 2.02 of 5.02 magnitude = **0.402** —
   it reproduces the current 0.4 exactly. A no-op.
2. **Scale by flagship share.** Yuzuha's flagship is only 30% of her kit, so she would be *rescued*.
   Wrong direction.
3. **Judge the band on annotation weight, not damage-weighted magnitude.** Principled — identity is
   a kit question — and it does fix Soukaku. But it **overshoots to 382.7** (owner floor 250) and
   puts her at 322.1 on Butcher against the owner's own [180, 275] band, while re-breaking TESTs 5
   and 13. Corpus mean +62.6, max +356.7.
4. **`FLAGSHIP_BAND` 0.60 → 0.55.** Identical overshoot, 382.7, because the test is BINARY: crossing
   it removes the penalty entirely *and* clears the structure cliff, taking her util from 0.400 to
   1.000 in one step.

#### Why one dial cannot do it

Sweeping `FLAGSHIP_MISS_PENALTY` with everything else held fixed:

| penalty | Soukaku (want ≥250) | Yuzuha (want ~156) | Remielle (want ≤250) |
|----|----|----|----|
| **0.40 (today)** | 169.1 ✗ | 169.4 ✓ | 273.8 |
| 0.50 | 229.6 ✗ | 192.9 | 297.0 ✗ |
| 0.55 | 244.9 ✗ | 204.3 | 308.1 ✗ |
| 0.60 | 260.2 ✓ | 216.6 ✗ | 375.7 ✗ |
| 0.70 | 290.8 ✓ | 283.0 ✗ | 398.0 ✗ |

Reaching Soukaku's floor costs Yuzuha her deserved collapse and pushes Remielle far past her
ceiling. **The flat penalty is a single dial serving three cases that need different answers**, and
that — not its value — is the thing to fix.

#### Where this points

The unresolved question is what separates Soukaku from Yuzuha, given both have a missed flagship.
Fit does order them correctly (1.000 vs 0.722) but not by nearly enough, and no smooth function of
fit alone can lift Soukaku without also lifting Remielle, who sits between them at 0.835.

Worth noting for whoever picks this up: Soukaku's contribution to Ye Shunguong is priced at **3.8**
in layer 4 against Zhao's 37.9, and her signature ATK buff — the thing the owner calls "a meaningful
attack bonus" — pays **2.1**. If the engine's own damage layer thinks she brings almost nothing,
cohesion is not the only place to look.


---

### 13. Astra loses to Nicole on Nangong/Aria (TEST 9)
#### Part one, FIXED 2026-09-01 — chains land on every DPS

Owner: *"Of course anomaly teams can use free chains; every DPS loves a free chain. Why would
Astra's offered chains be relevance=zero to an anomaly team?"*

They were, and the reason was a rule the engine had already decided was wrong elsewhere. A
provision's cohesion relevance was `Math.min(1, w(scaling[key]))` — it landed only on a consumer
who **declares** a scaling need. `ultimates` was explicitly carved out of that, with a comment
saying judging it by declared need "would read Dialyn's provision as landing on nobody... which is
wrong: they use the free ultimate, they just don't get anything extra from it."

Chains are the same and never got the same treatment:

| | |
|----|----|
| provide `utility.chains` | Astra, Norma |
| declare `scaling.chains` | Evelyn, Sigrid |

So on every team without Evelyn or Sigrid, Astra's and Norma's chain provision was scored as a
**total miss**. Astra appears in 5,286 team-boss rows.

Fixed: chains land on any DPS consumer. The declared scalers lose nothing — they already earn the
extra through the L4 need channel. Prediction "every moved team contains Astra or Norma" held with
**zero exceptions**; 1,674 rows, mean +3.8, max +10.0.

`Nangong/Aria/Astra` 413.9 → **423.3**. Nicole still leads at 472.2, so this was real but not the
main cause.

**Watch for a third member of this family.** `ultimates` and `chains` are both fixed; any other
provision key that is universally usable but rarely declared has the same latent bug.


### Diagnosis (2026-09-01) — a partially-useful buff costs more than a useless one

**The acid test fails again.** Make Astra's crit-damage buff strictly worse and her team scores
strictly better:

| Astra's `cd` relevance to an anomaly carry | `Nangong/Aria/Astra` | `Nangong/Aria/Nicole` |
|----|----|----|
| **0.30** — 30% useful, today | **413.9** — loses | 472.2 |
| **0.00** — completely useless | **508.5** — wins | 472.2 |

**+94.6 points for making a buff worse.** That is the same rule issue 3 was opened to enforce —
"removing a badly-fitting buff must not improve a team" — failing in a new place.

**The mechanism is a discontinuity in the fit ratio.** `fit` is computed over *landing* offerings
only, where landing means `relevance > 0`:

| Astra's offering | magnitude | relevance | treated as |
|----|----|----|----|
| `atk` | 1.77 | 1.00 | delivered (baseline) |
| `dmg` | 3.00 | 1.00 | delivered |
| `cd` | 1.77 | **0.30** | **70% charged as waste** |
| `chains` | 0.89 | **0.00** | **dropped — inapplicable, free** |
| (quick assists) | 0.75 | 1.00 | delivered |

A buff the team cannot use at all is free. A buff the team can *partly* use is charged for the
part it cannot. So the cheapest thing a support can carry is something completely worthless to
this team, which is precisely backwards.

**And she is not delivering less than Nicole — she is delivering more:**

| | brings | delivers | fit | util |
|----|----|----|----|----|
| Astra | 8.18 | **6.05** | 0.830 | 0.830 |
| Nicole | 4.44 | 4.44 | **1.000** | 1.000 |

Astra delivers 36% more and is scored lower, because fit is a ratio and a ratio punishes breadth.
Layer 2 also prefers Astra — tier +9 / rank +10 against Nicole's tier +7 / rank **−5** — and her
raw score is 30 points higher. The engine agrees she is the better unit and that she contributes
more, then reverses both on fit.

#### The design fork

The question is what `relevance` below 1 actually means, and the answer differs by cause:

- **Conversion efficiency.** Aria converts 30% of a crit-damage buff into damage. Astra delivered
  every bit of the 30% that was ever available. She did not fail at anything — this is the Fiona
  case, one step short of a total miss.
- **An unmet gate.** Remielle's ATK is unlocked at three anomaly bodies and the team supplied two.
  The team *wanted* the whole buff and got half. That is a real shortfall.

The engine currently charges both identically. Three ways out:

1. **Charge every offering, drop the landing filter.** Removes the discontinuity, but restores the
   breadth-punishing ratio the Fiona case exists to reject. Astra gets worse, not better.
2. **Drop offerings below a relevance floor.** Removes the discontinuity by moving it. Arbitrary,
   and at a floor of 0.5 it also rescues Yuzuha on `Yixuan/Lucia`, whose collapse is correct.
3. **Weight the denominator by what was achievable.** An offering can only ever deliver
   `relevance × magnitude`, so that is its potential; delivering all of it is a fit of 1. Low
   conversion then stops being charged as waste, while a *gated* shortfall still is, because the
   gate is a team failure rather than a property of the target.

Option 3 is the only one that separates the two causes rather than trading one wrong answer for
another, and it matches the owner's rarity-versus-importance framing: a support is judged on
whether it is doing its job, not on whether this particular team happens to convert every stat.

**It is not free.** Under option 3, Yuzuha's ATK reaching a rupture carry at 0.33 also stops being
charged, so her fit rises to 1.0 and only the flagship penalty holds her down. Her `Yixuan/Lucia`
score would rise from the 156.5 the owner endorsed. The scales have since widened, so that may be
acceptable — but it needs checking, not assuming.


#### Option 3 was BUILT AND REVERTED 2026-09-01 — the record

It fixes TEST 9 and cannot pay for itself. Kept here so it is not re-attempted blind.

**What was built.** `fit` became `Σ(magnitude × relevance) / Σ(magnitude × achievable)`, where
*achievable* is the same relevance before any conditional gate. An offering the team cannot use
contributes zero to both sums; one it can partly use contributes its share to both. The
`relevance > 0` filter was deleted — the cliff it created disappears by construction.

Prediction stated first: **no score may decrease.** Held exactly — 7,841 rows moved, all upward.
TEST 9 went green and the ladder came out as owner-specified.

**What it cost.** Three tests broke, all ceilings. Fixing them took three further changes, each
correct in isolation:

| refinement | why | result |
|----|----|----|
| a baseline buff must reach a **DPS**, not a stunner at half credit | Soukaku's ATK "landed" on `Lycaon/Yixuan/Soukaku` at exactly 1.0 × 0.5 = 0.50 via Lycaon | necessary, insufficient |
| the **band clause** must also reach a DPS | her ice arm then landed at 0.50 the same way, through the element menu | TEST 18 green |
| a unit with a baseline buff is **decided by it** | Astra on a Claret armorer has ATK and CD both converting at 0, yet passed on her generic `dmg` buff — the "rug pulled out" case | TESTs 15, 68 green; **14 and 25 broke** |

**Why it dead-ends.** The last step penalises every ATK support on every rupture carry, because
`RUPTURE_ATK_EFFICIENCY` is 0.33 and the landing threshold is 0.50. `Banyue/Astra/Lucia` fell to
181.4 against a floor of 350.

And the threshold cannot be lowered to rescue it, because **the two cases collide on the same
number**:

| team | Astra's / Soukaku's ATK reach | wanted |
|----|----|----|
| `Banyue / Astra / Lucia` | 0.33 (Banyue is rupture) | **≥ 350** |
| `Lycaon / Yixuan / Soukaku` | 0.33 (Yixuan is rupture) | **≤ 180** |

Identical ATK reach, opposite verdicts. What actually separates them is that Astra's other two
buffs land on Banyue while Soukaku's ice is dead on Lycaon/Yixuan — that is **breadth of usable
kit**, which the old ratio captured badly and which option 3 discards entirely.

**The real lesson.** Option 3 makes `fit` blind to everything except gates, so the whole burden of
discrimination falls on the flagship test — and that test is binary. A binary gate cannot express
"two of my three buffs are dead." Any future attempt needs a continuous measure of usable-kit
breadth that does not punish breadth itself, which is the Fiona constraint. Those two requirements
are in tension and that tension is the actual open problem.

**Net effect measured:** option 3 plus all three refinements left the suite at 2 unexpected
failures against 1 before it. Reverted.

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
| **The Evelyn stunner ladder** | Reopened 2026-09-01 and REVERSED against player statistics: Dialyn is definitively better than Lighter. `Norma > Dialyn > Lighter > Ju Fufu`, now green. The unverified tail of the old ladder (Trigger/Koleda/Caesar/Pulchra/Qingyi ordering) was **dropped**, not re-asserted — it came from the same reversed ruling. Only "all of them sit below Ju Fufu" is asserted |
| **Burnice vs Yanagi as Miyabi's partner** | Depends on the third slot. Disorder supply is equal either way, so Burnice wins on tier and field time — **except with Yuzuha third**, where Yuzuha's disorder buff amplifies Yanagi's own polarity damage. Abloom is separate and Promeia, not Yuzuha, amplifies it. Keyed off `buffs.disorders`; green in both branches |
| **Remielle as a third slot in the partner ladder** | Removed — a third slot has to be a control and she is not one. TEST 100 fully green and out of `KNOWN_RED` |
| **Rarity is not importance** | ATK is the baseline every support pays, not the discriminator between supports. A baseline buff landing answers "is this support doing their job." Drives the `BASELINE_BUFF_KEYS` rule; closed TEST 18 |
| **Crit damage on anomaly** | 30% stands over the owner's stated 15%: "as long as it isn't zero." Miyabi reads 100% through her declared `scaling.cd`, not by name |
| **The Norma/Dialyn band** | Dropped. Bucketing only needs it when Dialyn is on top, and he is not |
| **TESTs 13, 18, 74** | Recalibrated by the owner. Scales have widened; a final correctness pass will re-anchor the numeric bands wholesale |

Still waiting:

| test | question |
|----|----|
| **9** | The only red test. See issue 13 — the clean fix was built and reverted, and the real question is bigger than this rung |
| **101** | The Miyabi ladder. **Do not work on this before re-reading the target.** It was produced the same way the Evelyn ladder was — owner confirmation of engine output — and that method has now been shown to fail once. Ask whether the target is independently derived before making the engine match it |
| **Remielle ceiling** | Is 240 a hard cap on every boss, or a neutral-boss figure a favourable matchup may exceed? See issue 3 |
| **The two ring-fenced constants** | +15 sole on-field carry and +15 on-element stunner. Implicated in three owner-specified orderings; see the TEST 7 note at the top |

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

### What the 16 failures were, as measured on 2026-09-01 (historical)

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

### What the remaining five were (superseded — see Test status at the top)

| test | kind | detail |
|----|----|----|
| **7** | needs two ring-fenced constants | Only the band assertion now fails. Norma leads Dialyn by 28.7 where the owner says they share a band (eps 9.3). Cause is known exactly: **+15 sole-on-field-carry** (Norma is off-field, worth 14.4 of it) plus **+15 stunner on-element** (worth the rest on Pompey). The *ordering* Norma > Dialyn > Lighter > Ju Fufu is now correct on both bosses |
| **9** | adjudication, issue 8 | `Astra > Nicole` for Nangong/Aria. Astra's **raw score is 30 points higher**; she loses only on the cohesion multiplier, 0.812 vs 0.985, because her crit-damage buff is genuinely wasted on an anomaly carry. Whether a 17-point fit difference should cost 58 net points is the issue-8 question, not a new bug |
| **13** | band | `Dialyn/Evelyn/Pan Yinhu` wants < 100, reads 140.7. The engine already punishes him — util 40%, structure downgraded to +0, tier +1, rank −5 — but a Dialyn+Evelyn duo plus dead weight still clears 140 off a base of 175 |
| **18** | band | `YSG/Zhao/Soukaku` wants ≥ 250, reads 169.1. Already documented as a re-anchor: Soukaku's lone ice buff genuinely lands on nobody there, which is a real mismatch and deserves the hit |
| **74** | band | `Koleda/Claret/Rina` wants ≥ 315, reads 306.8. Short by 8.2 |

Three of the five are numeric bands, one is an issue-8 calibration question, and one needs two
constants the plan deliberately ring-fenced. **None is an unexplained regression.**

### The sequence — progress against it

| step | state |
|----|----|
| **P1 — fix the `dmg` averaging** | **DONE.** Checked per key; all five keys on that path wanted a max, so the two paths were merged. Cleared ten tests and took bucketing to 6/6 |
| **P2 — re-triage from scratch** | **DONE**, twice. The list is now one test long |
| **P3 — account for the other movers** | **NOT DONE.** Still outstanding and still worth doing: `Seth +86.7` was the largest single-unit move in the corpus and no change on this branch asked for it; Komano −31.3, Pan Yinhu −27.8, Orphie −30.8, Piper −21.7 are likewise unexplained. **An unexplained +86 is as much a defect as a red test** |
| **P4 — re-anchor genuine bands** | **SUPERSEDED.** The owner has widened the scoring scales and will re-anchor the numeric bands wholesale in a final correctness pass, rather than one at a time |
| **P5 — TEST 101 and bucketing** | Bucketing **done** (6/6). TEST 101 open, and see the warning in *Adjudications* before starting it |
| **P6 — correctness sweep** | **NOT DONE**, and now the most valuable thing left. Green tests are not the goal; the owner's original complaint came from reading `compositions.js -10` output, not from a test |

### Reporting rule

Lead with the aggregate and the ordering/band split, not with what was closed. "92 of 109" without
"seven of the failures are ordering inversions" is a misleading way to describe a state, and it was
the framing the owner objected to. The corollary learned the same day: **do not call a numeric band
a re-anchor without measuring whether the corpus actually moved.** That assumption was made in
every status write-up on this branch and was false — the corpus median delta was 0.0.

---

## Where this stands

Sound and settled:

* Element buffs are a menu — a unit is not charged for an arm with no target.
* Quick assists, ultimates and chains are provisions that land on everyone who can use them,
  not only on units that declare a scaling need.
* `damage.basic` distinguishes a support who deals damage from one who does not.
* Burst-window contention (`scaling.greedy`): two greedy carries cannot both own the stun window,
  and a greedy carry gets more from a shortened enemy recovery.
* Cohesion asks whether a unit is doing its job, not how much it brought, and a **baseline** buff
  is what answers that.
* Remielle collapses off triple-anomaly, and her best teams did not move by a single point while
  it was fixed.
* A measurement harness that catches this class of mistake — `score-dump.mjs` and
  `score-delta.mjs`, plus `KNOWN_RED` in two suites so exit codes mean something.

**One claim that used to be here has been withdrawn.** This section previously said "deleting a
badly-fitting buff no longer improves a team — the acid test now passes." **That is not true.**
Making Astra's crit-damage buff strictly worse raises her team by 94.6 points, because a buff the
team cannot use at all is dropped from the fit ratio for free while a buff it can *partly* use is
charged for the remainder. Issue 13 has the numbers. The acid test passes for the case issue 3 was
opened on and fails for this one.

Not mergeable until TEST 9 is resolved and P3 and P6 have been done.

**Suggested order.** The correctness sweep (P6) first, because the scales have moved a long way
today and reading the tables is the only thing that finds distortions no test covers. Then P3, the
unexplained unit-level movers. TEST 9 and TEST 101 both need design conversations rather than
tuning, and neither blocks the sweep.

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


