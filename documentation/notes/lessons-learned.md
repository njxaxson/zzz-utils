# Lessons learned

The longer stories. Resolved issues link here when someone wants to know how a change
actually went rather than what it did. For the specific traps, see
[known-pitfalls.md](known-pitfalls.md); for settled arguments, [adjudications.md](adjudications.md).

---

## Archetype calibration, and why it lives outside the engine

**The complaint.** On Miasmic Fiend, three teams the owner plays as near-equivalent scored
671.4 (anomaly), 554.4 (rupture) and 530.5 (attack). A 141-point spread between teams of
comparable real strength.

The cause is not a bug. Anomaly has more mechanics than attack or rupture, so an anomaly team
accumulates more scoring events, and getting anomaly's *internal* ordering right has meant
letting those totals run. The spread measures mechanic count, not team strength. But the
Deadly Assault allocator, the ladders and the strength labels all compared those totals
directly, so anomaly won boss assignments it should not have.

**What shipped.** `calibrated = raw × factor[archetype]`, applied at the boundary. The engine
returns raw and knows nothing about calibration.

That placement is not stylistic. If calibration lived inside the scorer, regenerating the
anchors from a score dump would be a fixed-point problem — the anchors are fitted to scores
that the anchors change. It also keeps roughly forty absolute thresholds in the test suite
valid.

**Three wrong anchoring schemes were tried first**, and all three are recorded in
[known-pitfalls.md](known-pitfalls.md#calibration-do-not-anchor-on-each-archetypes-global-ceiling)
because each looked obviously correct. The one that works: an archetype's anchor is the mean
of its global top ten teams, *excluding any team containing one of that boss's favoured
units*. That generalises the owner's observation that a 713.5 on Sacrifice Bringer is
**forced** by the boss's shill rather than earned.

**The objective function had to be corrected too.** The natural instinct is to compare the two
archetypes' whole distributions. That confounds two problems: it pools all bosses together, so
anomaly-shill bosses inflate anomaly's own baseline, and below about the 90th percentile it
measures teams nobody would ever build. The measurement that means something is the 85th
percentile **on the synthetic neutral boss** — high enough that the teams are pure
single-archetype and plausible, low enough that it is not the ceiling again, and with no boss
shill to confound it.

| | calibrated p85 | example teams at that depth |
|----|----|----|
| anomaly | 192.8 | Grace / Miyabi / Caesar |
| attack | 197.6 | Sigrid / Zhao / Astra |
| rupture | 191.1 | Koleda / Norma / Yidhari |

A 3.7% spread on recognisably comparable teams. And the matchup signal survives: the same
measurement on a boss that favours anomaly gives anomaly a 15% lead.

**The certification is worth the trouble even though it is trivially true.** The checker
asserts that within one archetype on one boss, the calibrated ranking equals the raw ranking.
Multiplying a group by a positive constant cannot reorder it — which is precisely what makes
it a good trap. It fails on a clamp, on a factor that leaked a per-boss term, on rounding
applied to the result instead of the factor, and on a mislabelled archetype.

**The corollary that surprised everybody:** a per-agent ladder does not move under
calibration. Alice's top fifteen on Fiend are all anomaly-carried, so all fifteen take the
same factor. Calibration only reorders a ladder where it *mixes* archetypes — for Alice on
Fiend, the first change is at rank 85. That is why `rankings.js` stays raw.

One anchor is a guess: armorer exists only in the preview corpus, because Claret is the only
armorer unit.

---

## The cohesion rebuild — nine attempts at one question

The question is "does this support belong on this team?", and it took nine tries.

### What was actually wrong

Cohesion was driven by how much a support *brought*, not by whether it was *doing its job*:

| unit on team | delivers | flagship | old read |
|----|----|----|----|
| Qingyi on YSG/Sunna | 2.00 | **lands** — her one buff is her whole purpose | 63% |
| Yuzuha on Yixuan/Lucia | 1.85 | **misses** — her defining kit lands on nobody | 55% |

Nearly identical on size, opposite on job, scored the same. The thing separating them was
already being computed and was drowned out by the size term.

The owner's Lucia case says it from the other side. Lucia is tier zero *because of* her sheer
buff. On a team where it misses she is delivering a much lesser unit's package at that unit's
value — but the engine saw "she still brought crit damage and a damage buff, that is a decent
amount of stuff" and did not collapse her. A unit's worth is packed into layers outside
cohesion, and the tier credit assumes the defining buff lands.

### What it became

Only offerings the team can actually use are charged. The flagship test asks whether the
largest offering, or one close to it, substantially reached a real carry. Size is not
ignored — it is already paid in the unit's tier credit and in what each buff is worth to each
teammate — it simply stops being charged a third time as a team-wide multiplier.

| | before | after |
|----|----|----|
| Qingyi on YSG/Sunna | 220.0 | 352.2 |
| Yuzuha on Yixuan/Lucia | 303.7 | 156.5 |
| Lucia on YSG/Zhao | 190.9 | 114.1 |

### The follow-up pass found four more, all of the same shape

Each was a rule that was right for the case it was written for and silently wrong everywhere
else.

1. **Relevance must be a MAX over the team, never an average.** On `Norma/Evelyn/Astra`,
   Evelyn returned full relevance for a generic damage buff and Norma the stunner returned
   zero, so Astra's largest offering was charged at **half**. A support was being punished for
   the composition of her own team. Every key that reached that path asks the same
   per-consumer capability question, so the two paths were merged. One change took unexpected
   failures from 16 to 5 and bucketing from 4/6 to 6/6.
2. **An off-element stunner loses nothing, so he should not be penalised.** The on-element
   bonus is defensible — his own damage is amplified. The symmetric penalty is not. Together
   they swung 30 points on a unit whose job is dazing. The diagnostic is reusable: on the
   neutral boss, where the term never fires, the stunner ladder was already exactly the
   owner's. **A term that is right in its presence and wrong in its magnitude reorders only
   where it fires.**
3. **A baseline buff is flagship-eligible.** See "rarity is not importance" in
   [guiding-principles.md](guiding-principles.md#rarity-is-not-importance).
4. **Chains land on every carry.** A provision's relevance only counted on a consumer who
   *declares* a need for it. Ultimates had already been carved out of that rule with a comment
   explaining why; chains had not, so a chain provision read as a total miss on every team
   without one of the two units that annotate the need. Watch for a third member of this
   family: any provision that is universally usable but rarely declared has the same latent
   bug.

### Archetypes had to be declared

Eight attempts tried to *derive* archetype fit from a support's buff list. None worked,
because a ratio over a unit's own kit cannot separate "wrong tool" from "narrow but right" —
that is the Fiona case again.

So fourteen supports were annotated with the carry archetypes they suit and the ones they are
wrong for. Three decisions inside that are load-bearing:

* **The hub is the primary carry only** — the highest-tier real damage dealer. A
  pseudo-anomaly stunner is never the hub. Owner: *"even on Miyabi/Vivian/Remielle, Rem is the
  support agent."*
* **Fitting the carry pays zero.** It is the baseline, not a bonus. A positive value was not
  load-bearing for any judgement and inflated well-matched teams past their ceilings. Only
  mismatch is priced.
* **The mismatch penalty is flat and applied after the team multiplier.** "Wrong tool" is a
  property of the pairing, not of how cohesive the rest is. A multiplier-scaled penalty
  punished a mismatch *less* on a cohesive team, which is backwards.

The instrument mattered as much as the change. Every prior attempt had been judged against the
109-test suite, where unrelated bands move on any change and drown the signal — so a change
that FIXED the mechanism could read as a regression. `cohesion-fixture.mjs` holds about eleven
owner judgements as ordered pairs and prints one number: how many hold. It is the objective
function. Each entry is marked `stated` or `confirmed`, because a confirmed-from-engine-output
target has been reversed once already.

---

## The team that was supposed to be the bane

For most of the cohesion work, `Nangong/Yixuan/Sunna` was treated as the engine's worst case.
Sunna is an attack and anomaly support; Yixuan is rupture; so an archetype mismatch was
supposed to cap the team. It resisted every attempt to make the cap clean.

The arithmetic said why. Sunna's stun multiplier stacks additively with Nangong's and
genuinely lands on Yixuan, so the team was around 340 before any penalty. Reaching the desired
cap needed a penalty of about 75, which sank a different team below its own floor. One scalar
could not serve both, because **Sunna genuinely contributes more to a rupture carry than the
alternative support does.**

The reason it would not close is that the belief being enforced was wrong. The owner played
about seven matches and reported back:

> "That team actually kinda rocks against Butcher... Yixuan REALLY loves the stacking stun
> multipliers and her greedy stun windows rack up huge burst damage. The engine showcased a
> team that prevalent thought would have dismissed, and despite that it consistently insisted
> the team was good — AND YET, the engine was right and prevalent thought was wrong."

So the resolution was not a cap. Rupture came out of Sunna's avoid list and the test was
reversed from "this team is capped" to "this team rises".

**Why the blanket removal is safe rather than coarse.** Sunna joins on attack and faction, so
the only way she reaches a rupture carry at all is alongside Nangong — every rupture unit
joins on stun or support. And Nangong plus Sunna is exactly the stun wheelchair that makes
rupture work. The join rules already restrict her to the good rupture teams, so a per-unit
"avoid rupture" tag was wrong in practice even though it looks right in a vacuum.

This is the clearest vindication of the emergent-scoring premise in the record. An override
had been added specifically to suppress the engine's own correct answer.

---

## Disorder supply was never measured

Found while scoping Alice, and it invalidated three confident-sounding diagnoses before it was
understood. The symptom, once measured properly:

```
lighter/miyabi/astra       Miyabi's disorder credit  0     no source
miyabi/vivian/yuzuha                                 28.0  cycling
nangong/miyabi/yuzuha                                28.0 + 16.8
nangong/miyabi/yanagi                                28.0 + 16.8  (cycling ×2, polarity ×2)
```

**28.0 in every team that generates any disorder at all.** The engine had no notion of *how
much* disorder a team produces. Four defects, one root cause:

* The needs side never read team-wide generation, so a consumer that is not itself half of a
  reacting pair read as unmet on a team swimming in disorders.
* Supply was a hardcoded constant, so one cycling partner paid the same as three and Miyabi's
  need of 3 sat permanently at 67% coverage, unreachable by any composition.
* Two disorder detectors disagreed and the live one was wrong: it compared *base* elements, so
  frost and plain ice read as identical and Miyabi beside Soukaku or Promeia generated **no
  disorders at all**. This was the largest single mover and had never been recorded.
* Reaction partners were enumerated as anomaly-*role* agents only, so a unit that supplies
  extra procs without holding the role contributed nothing.

The fix is one measured quantity consulted everywhere it matters, plus one function that owns
both "which element does this unit contribute" and "which element is it excluded from reacting
with" — a mutation that changed only one side once made Miyabi disorder with herself.

**The game facts underneath this have not changed.** Disorders arise two independent ways:
element cycling between two anomaly sources of different non-wind elements, *and* solo
polarity generation, where Yanagi and Nangong each disorder entirely on their own with no
second anomaly agent required.

**Why the suites stayed green through all of it** is worth understanding, because it is
structural luck rather than a rule. The only two units that scale on disorders are anomaly
agents, and the only two solo-polarity units are anomaly agents who share no base element with
them. So every pairing that would have exercised the bug also satisfied element cycling. Two
of the four defects needed synthetic units to be testable at all.

### And then it reopened

The fix priced oversupply linearly and uncapped, so a third anomaly agent was paid like the
second: `Nangong/Miyabi/Yanagi` collected +168 of disorder credit against
`Nangong/Miyabi/Yuzuha`'s +84. In the game the *second* anomaly agent establishes cycling; a
third adds far less and costs field time and a support slot.

That, plus two other mechanisms, is the Miyabi composition ordering work —
[`../issues/resolved/medium-nangong-miyabi-yuzuha-ranked-fourth-among-miyabi-teams.md`](../issues/resolved/medium-nangong-miyabi-yuzuha-ranked-fourth-among-miyabi-teams.md).
The step at coverage became a ramp and the consumer's credit became logarithmic in oversupply.

**The correction inside that correction is worth keeping.** Removing the undersupply step
first removed *any* penalty for missing a need, so an unmet need of 5 paid more than a met need
of 4. That contradicts the semantics the whole issue rests on. The replacement is a ramp,
continuous at full coverage so no cliff returns — but the ramp **cannot** restore the original
assertion that a bigger need earns less at equal supply, and that is arithmetic rather than
tuning: making it true requires a form that collapses to supply squared and deletes the
appetite term entirely, which is the exact collapse this issue existed to remove.

---

## The rankings pass — what a green suite was hiding

`rankings.js` produced a per-agent list of top teams per favoured boss. Reading those files
surfaced about twenty-five complaints. The suite was green with an empty `KNOWN_RED` at the
time, **which is the whole point**: every complaint was a case no test pinned, so the engine
was free to be wrong there.

Five changes landed. Each had a prediction written down before the change and checked
afterwards; all five ended with zero exceptions. Two of the predictions failed on the first
attempt, and each failure caught a real defect the green suite did not — those are in
[known-pitfalls.md](known-pitfalls.md#predictions-that-failed-and-what-they-caught) and they
are the most useful part of the record.

Four tests were changed during the pass, each with a stated reason, because "the test went red
so I moved the number" is how a suite stops meaning anything. The instructive one is a test
that was **rewritten rather than re-baselined**: it pinned four absolute totals to assert
something about burst contention, those totals moved twice in one day for unrelated reasons,
and re-pinning them would have codified a team ladder the owner rejects. It now reads the
contention value off the trace directly and asserts zero for the teams that should have none.

Another was passing on a **0.2-point margin** that only existed because of a defect elsewhere
in the same pass. When that defect was fixed the margin became 70 points in the wrong
direction and no constant could rescue it. It was rebuilt around a different unit so the
deciding margin is about 30 points instead of 0.2.

---

## Declared relationships fixed what no constant could

**The situation.** Miyabi is one of Remielle's weakest natural partners and Velina one of her
strongest, and the engine had the ranking inverted for every carry except two. The Miyabi
lines survive purely because both units are individually enormous, not because they fit. The
engine measures individual power well and measures "this unit is the reason the carry works"
not at all.

The arithmetic is entirely in the tier layer:

| | with Velina | with Miyabi |
|----|----|----|
| the carry (Burnice) | T1 → +18 | T1 → **+9** (halved as sub-DPS) |
| the other body | Velina T0 → **+20** (halved) | Miyabi T0 → **+40, +15 titled** |
| layer total | 111 | **152** |

Two effects compound. Velina's tier bonus is halved because she is a sub-DPS standing beside
another anomaly agent, and swapping Miyabi in *demotes the carry* as well, because Burnice's
sub-DPS role is conditional on Velina's absence. Miyabi brings +45 more raw quality than
Velina, which pays for Burnice's lost 9 and still wins by 23.

**What fixed it was two declared relationships, not a constant.** A mutual Remielle/Velina
pair lifts the whole track at once, which is exactly the point — the track rises together
because the pair is what all of those teams are built on. And a new conjunctive form pays out
only when *every* unit named in it is present, because Alice's partner is the pair rather than
either unit. A group that paid out on a partial match would be indistinguishable from two bare
names and would lift teams nobody asked to lift.

The conjunctive mechanism was built general rather than as a special case, which paid off
immediately: it was reused to settle an unrelated complaint. It is now carrying two unrelated
jobs, and a third use should prompt a look at whether the underlying inference is worth doing
properly.

**A separate requirement fell out of the same change.** Two teams needed to move in opposite
directions relative to a third, and it had already been proved that **no uniform value could
satisfy both** — the same unit is on both teams. Declaring the pair rather than tuning the
constant satisfies both, because it lifts one track without touching the other.

The resulting ladder is boss-conditional and its test asserts it narrowly on purpose: on two
anomaly-shill bosses that are effectively element-neutral to every unit involved. It breaks
elsewhere for legitimate reasons — a fire-weak boss lifts the fire unit, an ice-weak boss lifts
the ice one, and that is what the owner wants there. **Do not widen the test.**

---

## When a carve-out is a carve-out, say so

`Trigger/SAnby/Seed` fell below its floor as a side effect of a correct change. Seed is tagged
as an attacker but plays support, and the engine cannot see that: she declares no pseudo-role,
and she is the only attack-tagged unit supplying two or more baseline buffs at defining
weight.

The team was brought back over the floor with two declared synergy groups. That is fine, and
the entry recording it states plainly what it is:

* It is a **declared carve-out, not an emergent outcome.** The engine still classifies the
  shape as two attack carries with no interaction. Nothing was learned about Seed's role.
* The margin is **2.1 points**. That floor is a viability statement, not a calibrated number.
  It has since been adjusted a third time.
* The principled fixes remain open: give Seed a support pseudo-role, or infer pseudo-support
  from buff supply — the discriminator is clean, since every attacker in the filed complaints
  supplies zero baseline buffs and Seed supplies two at defining weight.
* Do **not** close it by restoring the same-element escape, which re-breaks three other teams.

The owner's own preferred solution is recorded in the deferred issue:
[`../issues/deferred/medium-trigger-sanby-seed-clears-its-floor-only-by-declaration.md`](../issues/deferred/medium-trigger-sanby-seed-clears-its-floor-only-by-declaration.md).

---

## `KNOWN_RED` earned its keep, and then emptied

The map held one real disagreement visible for exactly as long as the disagreement existed,
and the suite kept distinguishing "still broken as expected" from "something else changed"
throughout. Then the disagreement was settled and the entry came out.

That is the desired end state. An entry that stays after the test starts passing stops the map
meaning anything, which is why the suite fails when a listed test goes green.

---

## Reviewing the code found a bug the corpus could not

While reading regenerated rankings, the owner spotted that the stunless exemption lived
*inside* the branch for attack carries — so a stunless rupture or armorer carry would have been
charged for a stun window it never wanted. Every other stunless read in the engine was already
role-agnostic; the classifier was the only place that assumed a role.

It was **latent**: the only stunless unit in the data is an attacker, so the predicted delta was
exactly zero movers and the measured delta was zero. The test synthesises the case by cloning a
rupture carry with the stunless flag rather than waiting for the unit that would expose it, and
asserts the **structure key via the trace** rather than the score — declaring a carry stunless
also changes two other things, so the score moves for several reasons and only the tier is
under test.

Note the fixture needs supports that actually fit the carry, or an unrelated downgrade fires
and masks the thing under test.
