# Known pitfalls

Things that have already cost someone a day, with the concrete case attached so you can
check whether you are about to repeat one. A pitfall stripped of its instance is worthless,
so the instances are kept.

Organised as: wrong diagnoses that looked right; levers that were measured and rejected;
predictions that failed; and traps in the tooling.


---

# Wrong diagnoses, recorded so they are not repeated

## The Fiona and Marissa cases — a ratio always rewards deleting a buff

For a long time the register said the culprit in cohesion was a term called `threshold`: a
raw quantity with no denominator, blind to waste, which usually won the `max` it sat in.
Deleting it made everything worse, and that reading was the single most damaging wrong
diagnosis in this file.

The owner settled it with two hypothetical units:

* **Fiona** buffs sheer, laceration, elemental damage, disorder damage, and debuffs wind. On
  any real team exactly one lands and four miss — and she is still a tier-zero support,
  because the one that landed is enormous. Nobody was ever going to want all five.
* **Marissa** buffs laceration hugely, plus small ATK, crit damage and a unique ultimate
  buff. On an attack team her laceration is wasted *and* it is her defining feature. Delete
  her laceration buff from the data and she gets **better** on that team, because her flagship becomes the ultimate buff, which lands. That’s because deleting the laceration a buff is a *game design decision,* not a mechanical one: Marissa without the huge laceration buff may become a lower-value unit overall (i.e. she may drop several tiers), but it *does* change her intended focus: she now becomes the only provider of a unique ultimate buff. This is why deleting a buff is not a realistic engine comparison: buffs either land or don’t land, but their presence implies a game design decision that is outside the purview of the scoring engine.

Marissa is the whole argument. Adding an offering that does not land leaves the numerator
alone and raises the denominator, so a ratio necessarily rewards removing it. The real
measurement was blunt: `YSG/Zhao/Lucia` improved by **126 points** when Lucia's defining
sheer buff was deleted from `units.json`.

So there are two questions, and *what fraction of your kit was wasted* is neither of them:

| who asks | question | shape |
|----|----|----|
| the team | do the buffs **I** care about land? | absolute — how much arrived, no denominator |
| the unit | did **my flagship** land? | identity — not a quantity at all |

**Do not re-derive the ratio.** Waste is not charged; only mismatch is, once, on identity.

A second, subtler version of the same cliff survived into 2026-09-01. `fit` was computed over
offerings with `relevance > 0`, which meant a buff the team could not use *at all* was free
while one it could *partly* use was charged for the remainder — so making Astra's crit-damage
buff strictly worse **raised** her team by 94.6 points. The denominator is now the relevance
before any conditional gate, so a partly-converting buff contributes equally to both sums and
only a partly-*gated* buff (Remielle off triple anomaly) is charged.

## Three wrong cohesion designs, two of them proposed in the same session


1. **"Remove per-unit fit from the team multiplier entirely."** Would have deleted
   opportunity cost, and made every carry-plus-carry-plus-passenger team score fine. Caught
   by the owner, not by any measurement.
2. **"Removing a term from the mean can only raise scores."** False, and the probe that
   showed it was nearly reported as a finding. The mean carries a no-information default of
   **0.5**, so stripping cohesion made clean teams default to *mediocre*:
   `Nangong/Miyabi/Yuzuha` fell from 533 to 325.
3. **"Charge every offering, landing or not."** This is the Fiona case again. It also let
   Nicole's tiny kit out-fit Astra's broad one. The code comment claimed "only what the team
   can use" while the code charged everything.

## The disorder model: three wrong diagnoses in one issue

**"The disorder need is paid twice."** It is not. One channel prices a teammate's declared
`utility.disorders` provision; the other prices natural element cycling. Nangong beside
Miyabi produces ether/frost cycling disorders *and* Nangong's own polarity disorders on top,
and a consumer should be paid for both. A prototype that subtracted the teammate's provision
from the cycling supply passed all three suites and was still wrong — it deleted the cycling
credit precisely when a polarity unit was present, which is backwards.

**"A disorder is a team reaction, so no unit can disorder alone."** False. Yanagi and Nangong
each generate polarity disorders on their own, with no second anomaly agent. This was offered
as the principled reason to exclude disorders from a shortcut elsewhere; applied anywhere
else it would treat Yanagi's solo disorders as non-existent.

**"Alice generates polarity disorders she cannot consume."** A game-mechanics error, not a
modelling one. Alice generates polarity **assaults** — extra anomaly procs of her own
element — and an assault is not a disorder. There was no exception to model, and the
per-unit bypass being designed for it was withdrawn. `units.json` was corrected instead.

## The symptom stated as an equality invited the wrong repair

The disorder defect first surfaced as a footnote: *"a* `scaling.disorders` of 2 and 3 pay
identically". That phrasing frames the comparison as being between two consumers, so the
obvious repair is to make a 3 out-earn a 2. That target is not defensible — the field
declares a **need**, and a need of 3 against a supply of 2 genuinely is undersupplied, so the
consumer's score *should* suffer.

The right measurement is one consumer across a supply gradient. Doing that showed the actual
defect immediately: every team that generated any disorder at all paid the same 28.0, because
supply was a hardcoded constant.

**When a symptom is an equality, check which of the two variables should have been varying.**
Here it was neither of the two named — it was the supply they silently shared.

## Nangong/Miyabi/Remielle: two wrong diagnoses before the trace

The gap on that team was blamed first on disorder enablement and then on Remielle being paid
as an anomaly body. Both wrong. A layer-by-layer diff against the same team with Lucy in the
slot showed raw scores of 503.1 against 502.4 — **identical** — and cohesion of 0.40 against
1\.00. The whole gap lived in the multiplier. The lumen handling was correct on both sides.

## Orphie's aftershock buff looked like the Koleda chain bug and was not

A debug line reading `need(damage:aftershock): 18.0` drew the suspicion twice that a buff was
being read as a provision, which is exactly what had just been fixed for Koleda's chains. It
was not. That channel reads the supplier's buffs on one side and the consumer's damage types
on the other; no `scaling.<type>` is consulted anywhere.

It was **pure mislabelling** — a constant named `DAMAGE_NEED`, a debug line saying `need(...)`
and a comment about "implicit scaling", none of which described what the code did. All three
now say *buff*, at zero behaviour change. Bad naming cost two investigations.

## Every "natively lumen" rule was inverted, and `--debug` hid it

`getElement()` returns a lumen unit's morph target once the morph search has assigned one,
and the search assigns it *before* re-entering the scorer. So `isLumenUnit()`, defined as
`getElement(unit) === 'lumen'`, was false on the entire real scoring path. Every rule meaning
*natively lumen* was written element-first, so every one of six sites inverted.

`--debug` skipped the morph loop, which is why the guards appeared to work when traced. If a
lumen team's traced score cannot reproduce its live score, that is the bug, not a rounding
artifact.

The one that cut the opposite way is worth knowing: Refringe filtered for lumen units on a
list that could never contain one, so the bonus Remielle's kit exists to provide had **never
once fired**, and rankings TEST 55 was passing for a reason unrelated to its own comment.

The fix was naming. `isLumenUnit` is deleted so no caller can retain the ambiguous reading;
`isNativeLumen` reads tags and `isUnmorphedLumen` is for the morph search alone.


---

# Levers that were measured and rejected — do not repeat

## Calibration: do not anchor on each archetype's global ceiling

The obvious first move — divide each archetype by its own best score — **suppressed anomaly
on exactly the bosses that favour anomaly.** Eight of seventeen bosses declare `shill: anomaly`, so anomaly's ceiling is built mostly from those, and dividing by it applies the
boss's own favouritism as a penalty where anomaly should be winning.

| anchor rule | anomaly anchor | Fiend #1 |
|----|----|----|
| global top-10 | 690.1 | rupture ✗ |
| excluding `shillIntensity > 3` | 664.6 | rupture ✗ |
| **excluding any** `favored` team | **633.5** | **anomaly ✓** |

The rule that works is the third. Excluding only the extreme shill (Sacrifice Bringer alone)
is not enough.

## Calibration: do not anchor on pre-cap scores, even though the argument is correct

The concern was real and correctly reasoned. Anchors are means of an archetype's top ten
teams, those are exactly the teams the L4 soft cap bites hardest, so the anchor is measured on
already-compressed scores. Measured distortion: anomaly 3.83%, attack 1.33%, rupture 5.02%,
against a Fiend margin of 2.3%. Decisive, and it says plainly: anchor on pre-cap scores.

**Doing so made things worse, in the direction opposite to the argument.** Anomaly's top teams
sit deepest in cap territory, so removing the cap's effect inflates anomaly's anchor *more*
than the others', which shrinks anomaly's factor and undoes the favored-exclusion fix on the
exact cases it was built for.

Do not revisit this on the distortion table alone. The two tables have to be read together.

Also tried and rejected: a piecewise curve fitted on the neutral boss (it has to extrapolate
exactly where it matters, and produced 931.3 on a 400 scale), and a per-archetype power curve
(fixes anomaly to within 7% at every depth, over-rates weak rupture teams by 48%).

## Do not raise the L4 soft cap to fix a Miyabi ordering

It helps the ladder and **un-fixes the supportless rungs** at the same time.
`Nangong/Miyabi/Vivian`'s raw L4 of 234.5 is exactly what the cap is holding down. The two
defects pull the cap in opposite directions, which is why no single value serves both.
Removing the cap entirely still nets Nangong only +9.5, short of the 19.3 needed.

## Do not halve sub-DPS rank, and do not un-halve the sub-DPS tier

There is a genuine inconsistency here — Vivian reads `T1 → +9 (subdps ×0.5)` and yet banks the
full +22 of S-rank credit — and closing it recovers 11 of the gap. But it lowers *every*
Vivian team uniformly, and the ladder interleaves them: some Vivian teams must stay above
certain Nangong teams while others must drop below. **A uniform lever cannot change the
relative order of an interleaved ladder.** It broke four other rungs.

The mirror move — un-halving the sub-DPS tier bonus so Velina is not re-priced as half a
primary carry — is filed separately and was not taken either: it lifts Vivian as well (+9
against Velina's +20, so only \~11 net), does nothing for the Alice ordering since the whole
Velina track gains equally, and its blast radius is every team with a sub-DPS beside a
same-type carry. The *other* halving, for a forced secondary carry, is a genuine
role-collision charge and is correct; do not conflate the two.

## The +15 sole-carry bonus is usually a red herring

Removing it entirely still leaves the disputed Miyabi rung 4.3 points the wrong way. It was
the genuine cause in three other orderings, which is exactly why it keeps getting blamed. The
owner called this one in advance: *"on many previous occasions you assigned it to on-field
status and it turned out to be a red herring."* Check the arithmetic before blaming it.

## Cohesion approaches measured against the full suite and rejected

All of these were tried while the fit ratio was still assumed to be the right shape. The
table is kept because it is what established that the residue was never a tuning problem.

| attempt | result |
|----|----|
| make fit authoritative over the absolute-supply term | 76 of 86 pass. Strips the rescue from every support |
| blanket waste multiplier with a floor | best 80 at floor 0.7; never reached parity |
| provision whiff over all need keys at weight ≥2 | 80. Treats Astra's chain provision as dead weight |
| per-key partial-relevance charge on every stat buff | any strength above 0 drops Astra below Nicole |
| "headline buff" charge — bill the shortfall on the largest | passed 86 and was removed anyway; see below |
| generalising the total-whiff rule at weight ≥2 | 85. Charges Rina's `atk: 2` on an armorer team |

The residue was then measured against four independent dials — delivery scale, delivery
reference, flagship band, and the non-DPS exponent. The two failing tests failed at **every
value of every one**. Softening the exponent, the obvious move, makes the overall picture
strictly worse (4 unexpected failures at 2, 7 at 0.5).

## Do not invent an abstraction to route around a structural problem

The "headline buff" charge picked a supplier's single highest-impact stat buff and billed the
shortfall. It passed 86 tests and was removed:

* It needed two special-case patches within one session (element grouping, then breaking a tie
  between ATK and crit damage, which share an impact weight exactly).
* It did not do what it claimed. Sunna's headline is her stun multiplier, not ATK, so she was
  never charged by it at all.
* Its only real effect was catching buffs that land on nobody, which the general rule does
  directly.

Removing it changed no score and no test result — the clearest possible evidence it was the
wrong abstraction.

## A penalty on a niche key fires constantly and means nothing

Before adding a charge keyed on "no consumer scales for X", count how many units scale for X
at all:

| provision | units that scale for it (of 60) |
|----|----|
| `quick-assists` | 38 |
| `ultimates` | 27 |
| `chains` | 2 |
| `veils` | **2** |
| `disorders` | 1 |
| `ablooms`, `vortex` | 0 |

The provision-whiff charge was first written over every need key. "No consumer scales for
veils" is the normal case for about 97% of teams and says nothing about fit, yet it was doing
all the work holding up one test. It could not distinguish *a broadly-wanted provision this
carry actively cannot use* from *a provision nobody wants anyway*. It is now scoped to
ultimates, where declaring a weak ultimate is an explicit statement that the carry cannot use
them.

## The chain-buff rate has no value that satisfies both requirements

The owner authorised raising Koleda's chain buff so she would beat Pan Yinhu for Starlight
Billy on The Defiler. It is a narrow tweak — she is the only unit that buffs chains — and it
still cannot get there:

| rate | Defiler ordering | Dialyn > Koleda margin |
|----|----|----|
| 3 | no | 24.7 |
| **7** | **no, short by 0.3** | **20.1** |
| 8 | **yes** | 19.0 — under the old 20 bar |
| 10 | yes | 16.7 |

Sigrid also declares a chain need, so every point the dial gives Koleda beside Billy it also
gives her beside Sigrid. Settled at 8 by relaxing the margin to 15, on the standing position
that ordering beats margins. 

## Stun emergence does not close the Miyabi gap

The hypothesis was that Miyabi wants stun windows unusually badly, so Nangong is worth more to
her than the engine pays. Swept: at 1.0 the gap is −4.8, at 2.5 it is −1.7, and it breaks
other tests from 1.5 upward. It never closes at any value. Left at 1.0.


---

# Predictions that failed, and what they caught

Both of these caught real defects that a green suite did not.

## A new structure tier slipped past an identity check and sent teams UP

The prediction said every team affected by a new no-stunner tier would move **down**. The
first measurement returned **574 movers up** and eight teams becoming viable.

Cause: a support-fit override read `if (structureScore === STRUCTURE.CONVENTIONAL_BONUS)`. The
new tier sits *between* conventional and unconventional-viable, so a stunnerless rupture team
with an ill-fitting support no longer matched the identity test, escaped the downgrade
entirely, and went from 0.85 to 0.92.

**Adding a structure tier is never local.** Every `=== STRUCTURE.X` comparison in the file is a
place where a new tier changes behaviour by *not* matching, and "did not match" fails silently
and upward. Grep the identity comparisons before adding a tier, and prefer comparing factors.

## `w(true)` is 1, not 3

A convex severity curve was keyed off the *coerced weight* of a declared need. Anton declares
`scaling['quick-assists']: true`, and `true` coerces to weight **1**, so the curve read the
engine's own documented "this unit depends on this" as the weakest possible need and nearly
zeroed it. The prediction failed with **800 exceptions, every one containing Anton.**

The fix reads the declared value rather than its weight: `true` gives full severity, and only
an explicit number is graded. That contradicts the documented weight convention, and the
inconsistency is accepted rather than resolved.

## Predicting by tag, twice, plus once inside a verification script

Both predictions below were otherwise sound and both failed for the same reason.

| change | predicted | actual exceptions |
|----|----|----|
| route support-playing units to the support cohesion branch | Remielle, Orphie, Cissia | **225, all Soukaku** — support-*tagged* with an anomaly pseudo-role |
| remove the off-element stunner penalty | the 12 stun-tagged units | **1,456, all Caesar** — a pseudo-stunner |

Then it happened a third time inside a checker rather than the engine: a verification script
reported 882 false exceptions because it counted Cissia's *conditional* support pseudo-role as
unconditional. The engine was right and the check was wrong.

When a gate reads effective roles, enumerate the prediction the same way — and check both
directions.


---

# Tooling and method traps

## Confirming engine output is much weaker evidence than an independent spec

The Evelyn stunner ladder on fire-weak Pompey was obtained by showing the owner the engine's
own output and asking whether it looked right. They said "100% correct". It was not — checked
later against aggregated player statistics, Dialyn is definitively better than Lighter, and the
ruling was reversed.

Recognising output is not the same as checking it. Ask for the expected ordering *before*
showing scores, or ask for an external source. Every adjudication obtained the confirming way
carries the same risk, and the cohesion fixture marks each entry `stated` or `confirmed` for
exactly this reason.

## Re-measure before quoting a number out of a `KNOWN_RED` entry

A `KNOWN_RED` note said the Dialyn/Lighter gap on Pompey was 1.7 points and that any greed
bonus at all would flip it. That measurement predated the cohesion rework and was no longer
true: the gap was double digits and came from a fire unit facing a fire-weak boss. These notes
go stale silently.

## A test that cannot fail proves nothing

Four instances, all in this repo:

* A disorder test written as a supply gradient **passed against the unfixed engine**, because
  the old flat model produced the same ordering out of a separately-priced channel. Rewritten
  to clone a unit onto a second element, which the flat model provably cannot handle.
* Another disorder test's first draft passed through a completely different mechanism than the
  one under test, and was not sensitive to breaking the intended one.
* An ultimate test compared Evelyn against Ellen, who differ by \~90 points for unrelated
  reasons; it passed just as happily with the mechanism collapsed. It now compares Evelyn
  against a clone of Evelyn with one field stripped.
* The Remielle triple-anomaly test was anchored to the ladder floor (\~385–495) rather than the
  owner's stated bar (\~240). It went green after two of the three changes, before the one that
  did most of the work — so it could not tell a large fix from a small one.

Mutation-check new tests: break the mechanism deliberately and confirm the right test goes red.

## Score-neutrality can be evidence a fix is empty

An early attempt kept both ultimate axes and combined them with `max` rather than letting the
annotation override. It was provably score-neutral across all three suites, which felt like a
clean landing. It was worthless: `max(magnitude 2, annotated 1)` means the annotation can never
change anything, so "the data edit is now safe" was true only because the edit did nothing.

When a structural fix moves no scores, ask whether it changed any behaviour at all.

## Measure element-sensitive deltas on the neutral boss

The L4 element modifier multiplies the pair total (×1.15 on-element, ×0.85 off), so the same
three numbers come out scaled on a real boss. While measuring the chain buff, Evelyn and
Starlight Billy's ordering inverted on a physical-weak boss — that was the element modifier,
not chains, and it cost several minutes to see.

## Two tables price crit damage on anomaly

The efficiency figure was introduced into the L4 damage-weight table while its comment
described the cohesion relevance table. Both independently held the same value, so no score
moved and nothing broke — but the documentation sat on the wrong function and the two sites
could have drifted. They now share one constant. If you change one, check the other.

## Cohesion's unmet-need charge is presence-based, not weight-based

Lowering Aria's declared veil need from 2 to 1 moved 916 rows and left cohesion **completely
untouched**, because the weight only gates entry to the charge and the supply match only tests
for a non-zero supplier. Only the L4 payout is weight-scaled. So reducing a declared weight
cannot help a team that has no supplier at any weight; that needs a change to the severity
curve instead.

## Remielle's number-two rung is decided by noise, not by any constant

`Miyabi/Remielle/Vivian` must be Miyabi's second-best team (rankings TEST 82, mechanics TEST 24).
Once Remielle's channels were weighted by her teammates' Anomaly Proficiency — which is correct,
and is why she dislikes Miyabi — that rung became a coin flip. Measured across the whole range of
`ANOMALY_SUPPLY_PRESENCE`:

| presence | margin over `Miyabi/Vivian/Yuzuha` |
|----|----|
| 0.50 | **-0.2** |
| 0.60 | +0.2 |
| 0.65 | +0.4 |
| 0.70 | +0.6 |

Under a point everywhere. **A passing TEST 82 is not evidence that the constant is right.**

Two real forces pull against each other and both are the owner's own statements: Miyabi is one of
Remielle's weakest partners *because* Remielle scales on AP and Miyabi's is low, and yet
`Miyabi/Remielle/Vivian` is Miyabi's number two. The documented resolution is that those lines
"survive purely because both units are individually enormous, not because they fit" — so the
engine must discount the fit while individual power carries the rung. It currently does, by a
hair.

**The structural cause, which a constant cannot fix.** Remielle's Luminize rebound fires off her
own meter, not inside a stun window. The burst model pays burst only inside a window
(`getMaxBurstWeight` feeds stun emergence and recovery, nothing else), so on a stunless team like
`Miyabi/Remielle/Vivian` her single biggest hit scores **nothing**. Wiring `damage.luminize` into
burst moved 9,282 rows elsewhere and exactly 0.0 on this rung, for that reason.

Do not chase this rung with the presence constant. If it needs fixing properly, the question is
whether a burst instrument that is not window-gated should be priced outside the stun channel —
which is an architectural change, not a tuning one.

## `MULT` is not a damage scale

It is a table of L4 pair-term coefficients, multiplied by a consumer weight and then
soft-capped. L4 pays sheer 81.0 into Yixuan and ATK 0.7 — a 116× spread that is survivable
inside a capped additive layer and catastrophic inside an uncapped multiplier. Used raw as
delivery weights, every ATK support collapsed and every sheer support saturated. Delivery uses
the square root of the coefficient.

## A pull-engine verdict is not a scorer verdict

Declaring the Remielle/Velina pair in `synergy.units` was tried once and rejected on the note
that "it does not move the recommendation and it lifts `Promeia/Remielle/Velina` by 80 points
in the scorer". Both halves of that were true; the conclusion was not. The 80 points turned out
to be exactly the desired effect, and the same declaration later fixed the whole Velina track
in the scorer. Measure both engines separately and rule on each.

## Boss `favored` and `shillIntensity` can mask a structural verdict

`favored` is additive and lands before the multiplier, while the no-support demotion is
multiplicative. Adding +22 of favored survives a 0.80 structural demotion as +17.6 — more than
enough to lift a supportless team over a supported one. That is by design, and it is exactly
why those two fields should be changed deliberately rather than reached for to move one row.

## Two harness traps that produced misleading numbers

* `parseTeams` **auto-fills under-specified specs**. `'Dialyn/Yixuan'` silently becomes
  `[dialyn, ju-fufu, yixuan]`, adding a second ultimate provider. Always print
  `team.map(u => u.id)`.
* **Disqualified teams score −1** and never reach L4, so they emit no debug lines at all. If a
  trace is empty, check for disqualification before concluding the channel is dead.

## The delta tool and a property check will disagree on structural changes

`score-delta.mjs` excludes rows that were already non-viable from "scores moved", so a
structural change reports fewer movers than a property check over the corpus. One measurement
saw 7,164 against 7,575; the 411-row difference was entirely non-viable teams. Expect that gap
on every structural change — it is not a discrepancy.