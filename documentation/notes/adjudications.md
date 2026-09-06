# Adjudications

Settled calls, kept so the same argument is not had twice. Each entry is the complaint, the
verdict, and the reason. Several of these are cases where the **engine turned out to be
right** and the objection was withdrawn.

Every score quoted here is a raw score. See
[../engine/calibration.md](../engine/calibration.md).


---

## Game-knowledge rulings

### The Evelyn stunner ladder on fire-weak Pompey — ruled, then reversed

**First ruling (2026-08-31).** A test asserted that Dialyn beats Lighter as Evelyn's stunner
on Pompey; the engine had Lighter ahead by 30 points. The owner was shown the engine's full
nine-rung ladder and called it "100% correct", so the test was rebuilt to match all nine
rungs.

**Reversed (2026-09-01).** The owner checked aggregated player statistics and corrected
themselves: **Dialyn is definitively better than Lighter.** The true ladder is Norma > Dialyn

> Lighter, with Norma and Dialyn inside one band and Lighter clearly outside it.

The verdict that stands is the reversal. The *method* lesson is the more valuable half and is
in [known-pitfalls.md](known-pitfalls.md#confirming-engine-output-is-much-weaker-evidence-than-an-independent-spec):
confirming an engine-produced ordering is much weaker evidence than a specification stated
independently of the engine. Every adjudication obtained the confirming way carries the same
risk.

### Burnice versus Yanagi as Miyabi's anomaly partner

**Complaint:** a test asserted Yanagi beats Burnice on every boss and in every third slot; the
engine had Burnice ahead by a uniform 10–11 points. Was the off-field bonus over-paying?

**Ruling: the assertion was wrong, but only outside teams containing Yuzuha.** The owner's
expectation came from thinking of Yuzuha as the default third, which is exactly the one case
where Yanagi wins.

Miyabi's disorder supply is 4 with either partner, by two different routes — Yanagi through
cycling plus her own forced polarity, Burnice through off-field parallel buildup. So disorder
is a wash and the comparison is decided by everything else: Burnice owns the screen alone
(+15), is half a tier higher (+1.5), and loses 5.5 to Yanagi's disorder-damage buff. Net
Burnice by 11.

Yuzuha inverts it, and that is real: she buffs disorders, polarity is a subclass of disorders,
and Yanagi deals polarity damage — so Yuzuha pays 18 into Yanagi's own damage and Yanagi wins
by 4.3. Burnice's abloom damage gets nothing from her, and **that is not a data gap** — the
abloom amplifier is Promeia, and the engine already pays that pairing.

The rung is keyed off the third slot's *disorder buff* rather than off Yuzuha's name, so a
newly added disorder buffer makes a real prediction instead of silently landing in the wrong
branch.

Worth remembering: being off-field pays a unit twice on a Miyabi team — the disorder-rate
doubling and the sole-carry bonus. Different effects of the same fact, judged not to be
double counting, but it is why off-field status dominates this comparison.

### Crit damage on anomaly agents stays at 30%

The owner raised it on seeing a test explained: *"Crit Damage buffs on anomaly aren't fully
wasted. They are like ATK buffs on rupture. CD on anomaly has about 15% efficiency, EXCEPT on
Miyabi where it has 100%."*

Two things were already true and only needed confirming. The generic figure was 0.3 rather
than zero, and Miyabi already reads 100% — not by name, but because the relevant branch
short-circuits on a declared crit scaling that she carries. The exception is declared in the
unit data, which is where it belongs.

**Ruling: 30% stands. The property that matters is that it is not zero.** Offered the choice
between the stated 15% and the existing 30%, the owner took the existing value: *"if anomaly
already credits CD buffs at 30%, use that over my stated 15%. As long as it isn't zero."*
Applying 0.15 was measured first — 1,569 rows, all downward — and reverted.

What survives is the naming: the figure now sits in a named constant alongside its siblings,
carrying the reasoning and the Miyabi note.

Note this makes the affected test *harder*, not easier. Astra loses to Nicole on one anomaly
core only through cohesion — her raw score is 30 points higher — and crit-damage relevance is
exactly what is costing her. The owner declined to move a corpus-wide constant to chase one
rung, which is the same instinct that keeps the sole-carry bonus ring-fenced.

### Remielle off triple anomaly

**The rule, in the owner's words:** "Remielle without triple anomaly is like a slightly better
version of Lucy... MAYBE hitting 220-240 IF THE STARS ALIGN." The evidence from the game
itself is decisive — her M6, the highest mindscape unlock there is, does nothing but remove the
triple-anomaly restriction. A whole M6 spent on lifting one gate is how large the gap is.

The two questions a team asks, also in the owner's words:

> Support asks "Did my flagship buff land?" **DEFINITELY NO.** 
>
> Team asks "Did the buffs I care about land?" **NO, NOT REALLY** (1600 ATK → 700 is 45%,
> which we have rounded to 50%).

Two general rules came out of this and both outlive the case. First, *"for damage-dealing
calcs she is a sub-DPS, for buff relevance she is support — but generally speaking, **support
wins**."* Second, a team-scoped conditional **is** the unit's declared flagship: the gate is
the designer saying "this unit is built around this", and it must land strictly above the
threshold. At two anomaly bodies she unlocks exactly half, and half is a miss.

The engine work is in
`../issues/resolved/high-remielle-kept-full-cohesion-off-triple-anomaly.md`.

### Same element is not interaction

Two attack carries were keeping a favourable structure tier purely for sharing an element —
`Norma/Ellen/Sigrid` (both ice), `Nekomata/Ye Shunguong/Sunna` (both physical),
`Norma/Evelyn/Soldier 11` (both fire).

**Ruling: same element is not interaction.** Two carries of one element cannot disorder with
each other and still cannot both hold the field. A second attacker counts only when it is
explicitly a sub-DPS or a pseudo-support.

**Do not generalise this to anomaly.** Anomaly is the role that genuinely wants two bodies, and
the two concepts must not be collapsed.

Also settled in the same ruling: anomaly *mastery* and *proficiency* are **stats, not
mechanics**, and must never be read as evidence that a kit runs on anomaly.

### A missing stunner costs different amounts to different archetypes

**Complaint:** on Miasma Priest, two supports and no stunner earned the identical structural
credit as stunner-plus-support.

**Ruling, graded rather than blanket.** An attacker without a stunner is badly off, because an
attacker's damage lives inside the window. A rupture carry without one is worse off than with
one, but not as badly — so rupture-plus-double-support still outranks a stunnerless attacker.
Anomaly needs no such tier at all, because anomaly teams lean on reactions rather than burst
and want supports more than stunners.

Settled in the same ruling: **rupture never accepts a second carry.** Both branches had been
testing "at least one rupture unit", so two rupture carries plus a stunner plus a support was
scoring as a fully conventional team.

### A stunner's daze is not charged on a stunless carry

Ye Shunguong inherits the stun damage multiplier without ever opening a window, so Qingyi's
daze finds no consumer on a team built around her. That is Ye Shunguong's property, not
Qingyi's mismatch, and the freed slot is already priced by the credit a stunless team earns
elsewhere. Charging it read the game's premier stun unit at 63% on a team she suits, 70 points
behind a unit offering the same package who escaped only through an explicit exemption.

### Lycaon's cohesion exemption is deliberate

He is exempt from cohesion entirely. Owner: he is one of only two anomaly stunners and should
not be punished when his ice debuff is useless, *"since he is what there is."*

This is a **scarcity exemption**. The engine has no mechanism for that concept, so it is
hand-encoded. Recorded here rather than buried in the data so that nobody later "fixes" it as
an inconsistency.

### Miyabi's ladder may reorder on element-neutral bosses

The disputed rung held on two element-favourable bosses and failed on two neutral ones,
because it rests on a \~21-point elemental advantage. Forcing it everywhere was proven
impossible with any uniform lever: a lift big enough for the neutral boss breaks the rung above
it on the favourable one, and lowering the other side fails for the mirror reason.

**Ruling (2026-09-02):** *"I can accept that the ordering is different based on elemental
weakness. Assume the laddering as I expressed is definitive for Butcher/Marionettes, and accept
that it can switch for Girta/Neutral. As long as \[the top two\] are the top 2 in all cases."*

So the test has two parts: the full ladder on element-favourable bosses only, and the top two
asserted across the **whole corpus** of Miyabi teams on every boss. The corpus-wide half is the
stronger claim, it already held, and it is what actually protects the two wheelchairs.

### Orphie beating Sunna for Harumasa was correct

**Complaint:** with Trigger as the stunner, Orphie outranked Sunna, who is plainly the better
unit. Sunna carries +15 of tier credit in every case and the engine knows it; what changed was
Orphie's damage-pair credit, +9.2 beside one stunner and +22.7 beside Trigger.

The mechanism is that Orphie's aftershock buff was paid **three times more for buffing the
stunner's damage than the carry's**, because Trigger deals a lot of aftershock damage and
Harumasa barely any.

**Ruling (2026-09-03), and it separates the two questions cleanly:** *"there is a bug here, but
the result is correct. Orphie's aftershock buff correctly makes her the better support here
because she buffs Trigger, who does meaningful damage output. That being said, Trigger's
benefit for receiving the buff should be scaled to her damage weight (2 instead of the full 3
because she is a stunner, not a dps)."*

So the ordering was never the defect; the defect was pricing a stunner's damage share as a
carry's. Damage-type buffs never got the role weighting the generic ATK buff has always had.
After the fix Orphie still wins, with the margin tightening from 7.7 to 1.7.

### Sacrifice Bringer was fixed in the boss data, not the engine

**Complaint:** Bringer is ice-weak and anomaly-shill, so an all-ice anomaly base should be
excellent there. It scored 417–493 against a top twelve starting at 528.

The diagnosis held up: the owner's intuition was right on the axis they were reasoning about —
that pairing earns +43 of elemental credit — and it loses anyway on two other axes, both
tracing to the same single difference. One partner declares a sub-DPS role and the other does
not, which is worth 15% of the whole score; and one is off-field, which doubles disorder rate,
while the other is on-field and forfeits it. So the on-field carry is charged twice for being
an on-field carry.

**Ruling (2026-09-03): none of the three engine levers was taken.** The owner adjusted the boss
data instead: *"I checked the scoring on Bringer, and it required severe adjustments. I added
Bringer.favored = Miyabi and shillIntensity = 6 (sheesh) to have the ranks properly favor
Miyabi alongside the hyperinflated Vel/Rem teams."*

Two things to keep from that. The intensity of 6 against a default of 1 is an admission that
the fix had to be blunt. And "alongside the hyperinflated Vel/Rem teams" names the real
pressure — a declared pair lifted that whole track by 80 points, so anything competing with it
on an ice-weak boss needs a large counterweight.

### One withdrawn complaint

Adding favoured units to Miasmic Fiend also flipped a pair the owner had originally
complained about, lifting a supportless team over a supported one. On review the owner
**withdrew the complaint** — "NAJ > JVY is very valid. My original complaint was not correct."

The structural lesson survives regardless and is general: boss favouritism is additive and
lands before the multiplier, while the no-support demotion is multiplicative, so a favoured
bonus can mask a structural verdict. See
[known-pitfalls.md](known-pitfalls.md#boss-favored-and-shillintensity-can-mask-a-structural-verdict).


---

### Claret ranking behind Roxy and Caesar on Typhon Slugger

**Complaint:** `Roxy/Claret/Caesar` ranks high, and Seth and Anby appear on Claret's ladder at
all. This was the last release blocker.

**Ruling (2026-09-02): the engine is correct**, on three separate counts.

* Typhon is **fire-resistant**, so Koleda is rightly punished and cannot be Claret's stunner
  there.
* Caesar ranks where she does because her **general damage debuff is worth more to an armorer
  than to a normal carry** — armorers have so few levers that each remaining one counts for more.
* Seth and Anby appear because the roster genuinely runs out. With Koleda punished for fire and
  Rina punished for her evasive assist, Claret's good partners are Roxy, Trigger and Nicole, then
  Caesar and Orphie, and after that there is nothing. **The tail of that ladder is
  barrel-scraping by construction, not by defect** — a one-unit class has nowhere else to go.

### Ju Fufu beating Dialyn for Banyue on Notorious Pompey

**Complaint:** `Ju Fufu/Banyue/Lucia` over `Dialyn/Banyue/Lucia`, when Dialyn outclasses Ju Fufu
almost everywhere else.

**Ruling: the engine is correct.** Ju Fufu edges Dialyn on fire weakness plus her off-field
bonus, and that is the right answer here because **Banyue is field-hungry** — she wants the field
to herself, so an off-field stunner suits her.

Field hunger is distinct from [`scaling.greedy`](../data-model/scaling.md), which is about
needing the *stun window* to oneself rather than the field. It is
[deliberately not modelled](../engine/deliberately-unmodeled.md). **Do not add it.**

### Norma beating Lighter for Evelyn on Notorious Pompey

**Complaint:** `Norma/Evelyn/Zhao` over `Lighter/Evelyn/Astra` — close, but read as the wrong way
round.

**Ruling (2026-09-02): the engine is correct.** The team survives on Norma, who so drastically
outweighs Lighter that the support slot cannot make up the difference. Not a defect.

Note this is a different question from [the Evelyn stunner ladder on fire-weak
Pompey](#the-evelyn-stunner-ladder-on-fire-weak-pompey--ruled-then-reversed), which is about the
rung rather than the stunner.

### Pan Yinhu outranking Koleda for Starlight Billy on The Defiler

**Complaint:** a defender outranking a real stunner, against the owner's stated rule that with
Starlight Billy and Lucia in the team, Pan should never beat Norma, Dialyn, Ju Fufu or Koleda.

**Ruling (2026-09-02): the complaint was right and it was a real bug.** Koleda's chain **buff**
was being priced as a chain **provision**. After the fix the ladder reads
Dialyn > Norma > Ju Fufu > Koleda > Pan, so all four named stunners clear Pan.

The margin TEST 62 guards was relaxed from 20 to 15 to allow it, on the standing position that
[correct ordering beats margins](#favour-correct-ordering-over-margins). Sigrid also declares a
chain need, so she moves with the same dial — the ordering the test guards is intact, but the
dial is shared and is not free.

## Calibration and tuning rulings

### Rupture's mid-range being 28% below attack is not a defect

A median rupture team rated 28% below a median attack team looks serious. Pulling the actual
teams at that depth shows the two medians are not comparable objects: there are only five
rupture units, so most "rupture teams" in the corpus have to borrow a second carry from another
archetype. Rupture's mid-distribution measures mixed teams while attack's measures cohesive
ones, and the gap is the engine correctly punishing the mixture.

**Ruling: ship the linear form. Do not add a per-archetype curve to chase this.** Those rupture
teams genuinely are worse, and the corpus median is not a meaningful object anyway — it ranks
every legal team, including ones no player would build.

Surfaced by this work and genuinely open: mixed anomaly/rupture teams exist at all, despite
rupture being meant to accept one carry. That is an engine question, not a calibration one.

### Favour correct ordering over margins

Owner's standing position, given while settling the chain-buff rate. A test margin of 20 points
was relaxed to 15 so that a ranking could come out right.

The reasoning: 20 was never a calibrated figure. It was "Dialyn is comfortably ahead of a
low-tier stunner, because tier still matters" written down as a number, and that claim is
entirely intact at 15. Trading it for a wrong ranking row would have been the worse deal.

### Two calibration anchors were retuned on game grounds

When burst throughput was rebuilt, two absolute thresholds became unreachable. In both cases
the behaviour the test exists to pin still passed and only the magnitude anchor failed, and
both were adjusted by owner decision rather than to make the suite green:

| test | was | now | why |
|----|----|----|----|
| Sigrid + wind | floor 350 | floor 340 | The assertion's content is that wind is a bonus and never a penalty, which held throughout. The floor was a proxy calibrated against the inflated burst figure. |
| Sigrid's stunners | Dialyn beats Koleda by 30 | by 20 | Koleda's mindscape and damage buff have closed much of the gap, *and* Sigrid cannot exploit Dialyn's ultimate provisioning at all. A 30-point tier gap was never warranted for this carry specifically. |

A sweep across three constants confirmed neither anchor was reachable by any dial — they were
pinning the old flat rate, not a tuning error.

### "Least hungry pays the most" is correct for ultimates

An issue was once filed on the grounds that a supplier earned more from the carry who wants
ultimates *least*. **The owner rejected the framing, not the ordering.** The intended semantics
are fraction of the need met:

> Ju Fufu fully covers Miyabi's need of 1, half of Yixuan's 2 and a third of Ye Shunguong's 3,
> and should earn credit in roughly a 6 / 3 / 2 shape. Every case is a bonus; the bonus is
> smaller when the need is under-met. Unmet ultimate scaling is never penalised — ultimates
> occur naturally, and only two units in the roster provision them at all.

The arithmetic meant to express that was broken, which is a separate resolved issue.

**Scope was also ruled on:** fraction-of-need semantics apply to ultimates only. The other need
keys keep the flat discount. Generalising the shape would move every undersupplied pair in the
roster by 10–20 points, and the rationale is ultimates-specific anyway.

### Annotating an ultimate need above the maximum provision is intended

Under fraction-of-need semantics, credit peaks where supply meets need. So a consumer annotated
above the largest provision in the data is under-covered by everyone, and every supplier's bonus
scales down proportionally. **That is intended, not a bug.** It stays a bonus in every case.

What the fix removed was the *cliff*: the same step used to be a discontinuous −40% and is now a
smooth −25%.

### The undersupply arithmetic collapse: closed as a nonissue

The formula is still wrong in principle — an undersupplied consumer collects a flat term
regardless of appetite, because the appetite factor cancels. When it was written up it was
reported as affecting seventeen pairs across five keys. That figure went stale as the data
moved. Enumerating who actually declares an affected need key today leaves exactly **one** live
pair type, and it makes that unit slightly *worse*, by about 4 points.

**Owner closed it** after checking the one affected team across every boss and finding it scores
where it belongs. A 4-point under-payment on a single unit does not justify touching a formula
shared by every need key.

If you do ever fix it, the change is one line and the predicted delta is that one pair type and
nothing else. Filed as
`../issues/deferred/low-ye-shunguong-underpaid-four-points-on-veils.md`.
**Do not re-derive the "seventeen pairs" objection** — it was true of a different roster.

### Stunners and supports already differ; do not add a second penalty constant

Worth knowing before anyone reaches for one. The intuition — a stunner with nothing landing
still drives stuns, chain attacks and burst windows, while a support with nothing landing does
literally nothing — is already encoded in three places: a bare stunner never falls into the
"supplies nothing" trap, a stunner with any carry beside him earns baseline window value before
any buff is considered, and every cohesion penalty is damped to two-thirds strength for
stunners.

If more separation is wanted, lowering the stun default in that damping is a smaller and more
principled lever than a second constant. It is already the single source of truth for "how much
does this unit's kit landing matter".

### Remielle rating Medium without Velina is correct

The pull engine rates her Medium with Velina and Medium without, which is a real blind spot —
it cannot tell those two rosters apart. But the *Medium without* half was accepted as correct.
The old fixture asserted High because it was blind to the distinction, not because the engine
was wrong.