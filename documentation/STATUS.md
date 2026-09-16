# Status

Where things stand. Everything here is measured, not remembered — if you change the engine,
re-run the commands and update the numbers.

**Last verified:** 2026-09-16.

## Scores come on two scales

The engine returns **raw**. Anything comparing archetypes against each other reads
**calibrated**. Check which one you are holding before drawing a conclusion from a number — see
[reading scores](engine/reading-scores.md).

## Test status

| Suite | State |
|----|----|
| mechanics | **34 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| rankings | **93 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| recommendations | **44 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| bucketing | **6 pass, 0 fail** |
| cohesion fixture | **11/11** owner judgements hold |
| calibration freshness | `calibration.json` matches the current engine and data fingerprint |
| calibration certification | **CERTIFIED** — 0 within-archetype rank inversions across 60 (boss × archetype) groups and 67,062 teams |

```bash
node test-mechanics.mjs && node test-rankings.mjs && node test-recommendations.mjs && node test-bucketing.mjs && node cohesion-fixture.mjs
node generate-calibration.mjs --check
node calibration-check.mjs
```

`test-mechanics.mjs` and `test-rankings.mjs` are the split of what used to be one `test-scoring.mjs`
(124 tests total) — mechanics tests pin isolated engine rules independent of roster content,
rankings tests pin score floors/orderings/ladders for the live roster. TEST 91 moved from rankings
to mechanics as **TEST 32** when SCORE-140 removed the last live conjunctive declaration: it pins
the mechanism, so it belongs on a synthetic clone rather than on data that keeps being deleted
underneath it.

**All three `KNOWN_RED` maps are empty** — mechanics, rankings and recommendations. There are
no known disagreements between the engine and the owner's playtested orderings.

Four entries passed through the rankings map during the anomaly overhaul and every one was closed
by a mechanic rather than by moving the assertion, with a single deliberate exception:

| | closed by |
|----|----|
| TEST 9 | Sunna's anomaly proc-damage buff being modelled at all |
| TEST 3 | Cissia resolving her support role from a second electric attacker rather than Seed's id, so `Trigger/SAnby/Cissia` stopped classifying supportless (287.4 → 371.2) |
| TEST 35 | *the exception* — its floor was re-derived 345 → 320, on the ruling that a supportless line should not be pinned that tightly |
| TEST 90 | Phoenix's and Aria's stats, and Grace's Proficiency |

Each closure announced itself: the suite exits 1 on a **stale** entry as well as an unexpected
failure, so a test that starts passing cannot quietly stay listed. That is what makes an empty map
worth stating rather than assuming. See
[the verification loop](tooling/verification-loop.md) for why an empty map still matters, and why
a green suite is not evidence on its own.

## Open

**None as issue files.** Both boss-data levers were converted to mechanics in phase 3 of the
anomaly overhaul; see [adjudications](notes/adjudications.md).

The anomaly ladder, which was the last thing held in `KNOWN_RED`, closed on 2026-09-16.

## Deferred

Six. These are known, understood, and deliberately not being chased.

| Issue | Priority | Why it is parked |
|----|----|----|
| [Sub-DPS tier halved beside a same-type carry](issues/deferred/high-sub-dps-tier-is-halved-beside-a-same-type-carry.md) | high | Wide blast radius; post-release |
| [The partner ladder is a fitted stopgap](issues/deferred/medium-the-partner-ladder-is-a-fitted-stopgap.md) | medium | The honest fix is a feature, not a repair |
| [Greed value-scaling cannot be tested](issues/deferred/low-greed-value-scaling-cannot-be-tested-on-todays-roster.md) | low | No fixture can distinguish it until a `greedy: 2` unit exists |
| [Ye Shunguong under-paid on veils](issues/deferred/low-ye-shunguong-underpaid-four-points-on-veils.md) | low | One pair type, about four points, in the safe direction |
| [`utility.kaleidoscope` is read only by the UI](issues/deferred/low-kaleidoscope-is-read-only-by-the-ui.md) | low | Only a support declares it, so no fixture could tell a fix from a no-op |
| [The `ultimate:double` weight is discarded](issues/deferred/low-ultimate-double-weight-is-discarded.md) | low | Every declarer means the same thing, so grading it would move nothing |

`issues/resolved/` is **gitignored**: closing an issue means moving its file there for the owner
to read and delete when ready, not deleting it yourself. The durable reasoning lives in
[notes/](notes/) behind a tag either way — see [the issue system](issues/README.md).

## For release

**Nothing is release-blocking.** Every rankings complaint is closed, and the two open items are
data tuning rather than engine defects.

## What shipped last

**The Angels of Delusion are declared, not modelled**, 2026-09-16. `Nangong/Aria/Sunna` was
underpriced by about 150 points against the two premier anomaly teams, and that is *sensible* —
much of its real strength is innate faction synergy that is very hard to model, and the game is
suspected of carrying hidden modifiers that fire only when all three are together.

A **conjunctive group** is the literal encoding of that sentence, so all three units declare one.
`CONJUNCTIVE_SYNERGY_BONUS` was re-derived **55 → 45** at the same time: its 55 had been sized for
the Trigger/SAnby/Seed stopgap, which no longer exists, so the constant had no users at all when
this landed. Three declarations at 45 is 135 raw.

**Measured: AoD now averages 17.5 points behind the better of `Nangong/Miyabi/Yuzuha` and
`Aria/Remielle/Velina`**, across the 14 bosses where it and a reference are both viable — the
owner's target was 15–20 — and it is the top non-Miyabi, non-Remielle anomaly team on 12 of those
14, never worse than third.

**Conjunctive rather than mutual, and the difference was measured.** A mutual Nangong ↔ Aria pair
would also pay on every other team holding those two. The conjunctive form moved **exactly 14
team-boss rows, all of them this one team** — no two-of-three team touched. Rankings TEST 94 pins
the sizing from both sides; mechanics TEST 32 pins the gating and was corrected in passing, since
its `>= 55` turned out to be a hidden pin on the constant rather than a test of the mechanism.
Full reasoning and the sizing table are in `[AOD-01]`.

**Phoenix tops the anomaly ladder, and the ladder now runs the whole roster**, 2026-09-16. This
closed the last `KNOWN_RED` entry in the engine.

TEST 90 pins the owner's playtested third slot behind Remielle + Velina. It now reads
Phoenix > Aria > Promeia > Alice > Burnice > Jane Doe > Yanagi > Piper > Miyabi > Vivian, with
Grace on a boss-conditional rung. The bottom five were already correct before they were asserted;
they are pinned so they stop being true by accident.

Three data changes, each measured on its own:

* **Phoenix `stats` 2/2 → 2.5/2.5.** She was statted at the anomaly median while being the unit
  the ladder expects to top. 549.4 → **570.0** on Girtablullu. **Zero corpus rows** — she is
  `available: false` and outside the dump's corpus.
* **Aria `tier` 0 → 0.5 and `ap` 3 → 3.75.** The demotion is the point; the Proficiency raise buys
  back enough of the half-tier to clear Promeia. 3,793 rows moved — **2,748 down, 1,045 up, zero
  exceptions** — which is exactly the shape "half a tier lower but a better proccer" should have.
* **Grace `ap` 3 → 2.5.** She carried Aria's old base Proficiency on a tier-1.5 standard-banner
  unit, which lifted her past Burnice. 2,595 rows, all downward, zero exceptions.

4 meaningful adjacent-pair inversions out of 60,858 for Aria, 1 for Grace.

**Phoenix's margin is deliberately thin** — 4.4 and 2.7, inside one rank band. This is early beta
and the magnitude by which she beats Aria and Promeia is not yet knowable, so the ordering is
asserted and the magnitude is not. Measured levers to widen it later are tabulated in
[adjudications](notes/adjudications.md), along with the one that looks obvious and is worst.

**Alice over Burnice stopped being a tossup.** The rung's upper band assertion was retired by
owner ruling: post-overhaul Alice really is the better unit here. Strict ordering stays.

**The Vivian ladder is now pinned too, as TEST 93** — the sister of 90, same two bosses, Vivian in
the Velina seat: Miyabi > Alice > Promeia > Yanagi > Jane Doe > Aria > Piper. It needed no engine
change; the engine already produced it. Two reorderings against TEST 90 carry the content, and
each is asserted separately from the chain so a failure names the mechanism:

* **Miyabi leads here and is second from bottom there.** She is the only carry on the roster who
  prefers the Vivian seat (+78.0, against −94 to −216 for everyone else) — frost vortexes badly,
  so a disorder partner beats a wind one.
* **Aria collapses from second to sixth.** She, Vivian and the ether-morphed Remielle land three
  ether elements, so the team generates no disorder at all: zero disorder lines in the trace
  against six for Alice or Yanagi in the same seat.

**The L4 soft cap is gone**, 2026-09-15 — and with it the ceiling that was making the engine
progressively worse at separating new top-end units.

The cap compressed Layer 4 toward a fixed asymptote of 350. That number never moved; the roster
does. So every release pushed the top of the ladder deeper into the compressed region, and a new
mechanic arrived worth less than the last one. Phoenix was the witness — raising her signature buff
by a third bought **1.5 points**. With the cap gone, a 0.5 step in two of her stats is worth
**20.6**, which is the same fact stated from the other side.

It also buried mistakes. With the cap off, the engine ranked **Astra below Soukaku** behind
Nangong/Miyabi, a plainly wrong answer that had been damped into a 0.3-point margin for as long
as the cap existed. Full reasoning in [adjudications](notes/adjudications.md); read
[known pitfalls](notes/known-pitfalls.md) before proposing anything shaped like a compression
curve, including a scoped one.

**What replaced it is one constant.** `STRUCTURE.NO_SUPPORT` 0.80 → 0.75, in the structure layer
where the supportless judgement belongs. 8,430 rows moved, all downward, zero exceptions.

**Three real defects surfaced and were fixed at the root:**

* **Sunna buffs anomaly proc damage**, and never had. The engine had no first-class way to express
  it until recently. Closes TEST 9, which was failing by **0.1 points**, and produces the owner's
  support rule for free: Yuzuha > Sunna > Astra behind Nangong, except behind Aria where the same
  flat buff flips a 0.1-point gap and nothing else. New TEST 92.
* **Soukaku only plays anomaly when she is BACKFILLING a disorder partner.** She used to promote
  beside Miyabi unconditionally, which made an A-rank support a full third carry. Needed three new
  pieces — an `allOf` combinator, an `othersDisorder` predicate, and two-pass role activation —
  all in `[PRED-02]`. Astra now beats her by **52 points** where she had lost by 0.3.
* **Buildup buffs no longer reach lumen.** Velina was handing Remielle a proc-rate buff for procs
  she does not make. 469 rows.

**Two tests were rewritten rather than re-fitted.** TEST 14 was an absolute score band; an upper
bound pins nothing and breaks on every repricing, so it is now an ordering plus a playable floor,
with Koleda added. TEST 82's two closest rungs are banded, since the order between them was never
a claim.

**And one constant was re-derived because its basis disappeared:** `STUNLESS_SHILL_CREDIT`, whose
documented sizing was quoted "after the L4 element modifier **and soft cap**".

**What it left open, and how that resolved.** Phoenix did not top the Remielle/Velina ladder, and
removing the cap did not by itself change that; Aria also fell below Promeia, which uncapping
caused. Both were closed the next day by the ladder entry above — *not* by anything shaped like
the cap, and the prediction recorded here at the time (that no repricing of Phoenix's kit could
close a half-tier L2 deficit) was measured under the cap and expired with it.

**Not yet done:** the six calibrated cutoffs in `strength-rating.js` drifted harsher (Good 9.9% →
8.1% of the corpus) and have not been re-derived.

**`VORTEX_BASE` re-derived, 15 to 12**, 2026-09-14. A vortex was worth about five times a full
abloom engine, and the scalar in front of the vortex model had never been re-derived after phase 2
stacked Proficiency, proc rate and tier compression on top of it. The physics were **not**
re-litigated — only the constant.

The binding anchor is rankings TESTs 34/44: ice must out-vortex frost on Scorched Horizon, the
boss where vortex is the whole point. That margin falls linearly with the constant and inverts at
9; **12 is the lowest value that keeps it outside one rank band.**

Vortex on `Phoenix/Remielle/Velina` falls 95.3 to 76.3 against an unchanged 26.0 of abloom (4.8x
to 3.8x). Teams above raw L4 200 fall from 295 to 234. Of 67,003 adjacent team pairs, **only 6
invert where the original gap exceeded one rank band** — the other 1,923 are within-band shuffles.

**Mechanics TEST 28 was silently pinning the constant** and has been fixed: its second assertion
compared a team holding an element donor against one without, so it measured pool dilution net of
the donor's own disorder and proc contributions. It now reads the pooled tier the payout used
(4.0 / 3.0 / 2.5), is immune to `VORTEX_BASE`, and is mutation-checked against a `max` pool.

Closes SCORE-143. Full reasoning in [adjudications](notes/adjudications.md).

**Anomaly overhaul, phase 4** — the mechanics take over the ladder, 2026-09-14.

Phase 3 stripped the declarations and asked what the mechanics could carry. Phase 4 is the
answer: `stats.am` became live data, proc rate and Proficiency were separated, and the vortex
event stopped being charged three times over.

* **`stats.am` now does two different jobs, and only one of them is conversion.** A unit's own
  Mastery drives `procRate` — geometric in steps, `1.2 ^ (am - 2)`, so one point of Mastery is
  20% more procs and Aria's defining trait finally pays. Separately, a unit that declares
  `scaling.am` converts its **own** Mastery into Proficiency. `computeEffectiveAP` used to build
  that conversion pool out of the team's `buffs.buildup`, which was wrong on its own terms:
  nobody in the game hands anybody Anomaly Mastery. Supports buff *buildup*, a derived rate.
  Promeia's Proficiency is now a property of how she is built rather than of who she stands
  next to. **Lumen is off the proc curve entirely** — Remielle fills no gauge, so she is
  excluded rather than handed a rate below 1.0.
* **A vortex event is paid once.** The wind agent is credited for *creating* events, not for
  their damage, so Velina scores the same beside Aria as beside Promeia — identical wind in
  both cases. The element difference lands once, on the agent whose proc was consumed.
* **"Anomaly affinity" is gone.** One invented multiplier was scaling three unrelated buffs
  (buildup, disorders, vortex) off the consumer's `scaling.am`. The owner did not recognise the
  concept, which was the tell — it corresponded to nothing in the game. Each buff now gets the
  gate it actually depends on: can this consumer proc, contribute to a disorder, contribute to
  a vortex — present or absent, then a flat amount.
* **`buffs.vortex` is flat.** Velina's vortex buff raises post-calculation vortex damage
  regardless of how the vortex was caused, so tier-scaling it was charging the element a third
  time.
* **Ice fell 4.5 to 4.0**, a deliberate divergence from the in-game ratio on playtesting
  grounds. Recorded in [adjudications](notes/adjudications.md), not left looking like a tuning
  slip.
* **Velina is off-field.** She had no `onfield` flag and defaulted to on-field because she is
  anomaly-tagged, which denied a sole-carry bonus to every team pairing her with a real carry.
  Burnice needed a conditional `onfield` alongside it, since marking Velina off-field otherwise
  leaves `Burnice/Remielle/Velina` with nobody on field at all.
* **The bare `buffs.anomaly` key is wired**, matching procs of every element rather than one.
  Phoenix is its first user.

**Phoenix, modelled from beta information, tops both ladders on a thin kit.** `phoenix.json` is
a probe unit run through `spec-unit.mjs`, not a roster entry. One defining mechanic — a
triple-anomaly-gated proc-damage buff, Jane's gimmick generalised to every element — plus an
abloom, and everything else at class baseline. She reaches **#1 on both Girtablullu and
Stagnant Aberrant** with no declared synergy of any kind, which is what the phase existed to
prove was possible.

**Field-time economy resized**, and two mis-priced mechanics fell out of it. The solo-carry
bonus was consistently outweighing mechanical interactions — worth roughly 38% of the mean L4
total on the 23% of viable rows that collect it. `SOLO_CARRY_BONUS` 15 → 10; the penalties are
untouched. Both suites that went red turned out to be mechanics hiding behind the bonus:
`STUNLESS_SHILL_CREDIT` 48 → 53 (a stunless team is a solo-carry shape by construction) and
the armorer `defense` weight 2 → 3 (Trigger was beating Roxy behind Claret on field time, not
on her defense shred). See [PIPE-01](engine/layers.md#code-notes) and
[ARM-01](concepts/armorer-laceration-gash-maim.md#code-notes).

**Where the ladder stands.** Beside Remielle and Velina on Girtablullu:

| rung | required | phase 3 | phase 4 |
|----|----|----|----|
| Aria > Promeia | yes | no, by 39.8 | **no, by 11.3** |
| Promeia > Alice | yes | yes, by 64.7 | **yes, by 48.5** |
| Alice > Burnice | yes | no, by 20.0 | **no, by 11.8** |
| Burnice > Jane | yes | no, by 6.4 | **no, by 21.9** |

Three of four are still inverted, but two closed most of their gap on mechanics alone. The
Burnice/Jane rung got worse, which the phase-4 plan predicted in advance: the remaining
candidate is that Jane's buff is over-priced rather than anything about Burnice, and neither of
her dials has an anchor. Still held in `KNOWN_RED`.

**The calibration anchor.** Anomaly's anchor is now **571.7** (factor 0.700), against attack's
514.5 and rupture's 533.1. It was 640.2 before the overhaul began.

**Anomaly overhaul, phase 3** — the props came out, 2026-09-10.

Every declared anomaly `synergy.units` relationship is gone: Remielle↔Velina, Aria↔Remielle,
Aria↔Sunna, Aria↔Nangong, Burnice→Velina, and Alice's `"Remielle+Velina"` conjunctive group.
Removed one at a time and measured individually; every strip moved downward only, and the largest
single one (Remielle's pair) was worth up to 78.8 points on one team. The non-anomaly groups
(Trigger/SAnby/Seed, Ye Shunguong/Dialyn, Ju Fufu) are untouched.

**Both boss levers were converted to mechanics.** Bringer's `shillIntensity: 6` became a
`weaknesses: ["ice:frost"]`, which needed boss weaknesses to understand element variants — they
now do, and a variant weakness pays a plain-element unit half. Aberrant's `shillIntensity: 3`
became `weak: ["luminize"]`. Both keep `favored`, which is real modelling. **No boss sets
`shillIntensity` today and the field stays**, by owner ruling: it is the release-deadline lever
and removing the capability would be a mistake. Closes DATA-001 and DATA-002.

**What the mechanics can and cannot carry.** Beside Remielle and Velina, with nothing propping
the ladder up:

| rung | required | actual (Girtablullu) |
|----|----|----|
| Aria > Promeia | yes | **no**, by 39.8 |
| Promeia > Alice | yes | **yes**, by 64.7 |
| Alice > Burnice | yes | **no**, by 20.0 |
| Burnice > Jane | yes | **no**, by 6.4 |

Aberrant gives the same picture. The Aria rung is the buildup question, deliberately left
unsolved. The Burnice/Jane rung inverted because Jane now has a real mechanic instead of a fake
vortex buff. Held in `KNOWN_RED` while the fallout is assessed.

**The calibration anchor tells the story on its own.** Anomaly's anchor fell from 640.2 to
**575.2** and its factor rose from 0.625 to **0.695** — that is the fudging coming out of the raw
scale. Anomaly now sits much closer to attack (514.5) and rupture (535.1) before calibration than
it ever has.

**TEST 91 was rewritten, not disabled.** It pinned the conjunctive-group mechanism through
Alice's declaration; the mechanism is unchanged and still has a live user, so the test moved onto
Trigger/SAnby/Seed.

**A proc-damage buff is no longer paid twice**, 2026-09-10. `buffs["anomaly:<element>"]` was
landing through two channels at once: the general affinity payout ("extra damage against an
afflicted target") and the vortex amplification ("the vortex is built on the proc you buffed").
For a consumer that is actually reacting with wind those are the SAME damage, so the affinity
channel now skips them. A consumer with no vortex — Remielle, or Harumasa in a monoshock team —
still collects it, because their proc damage is not being counted anywhere else.

310 rows, all downward, every one of them a team holding Jane, Grace or Rina **and** a vortex
source. Zero exceptions in both directions.

**Anomaly overhaul, phase 2e-2h** — the rest of the model, 2026-09-10.

* **Disorder damage scales on proc damage.** A disorder's damage comes off the two procs that
  made it, and Miyabi's procs run on crit rather than Proficiency — which is why she is
  simultaneously the best disorder carry and a poor vortex partner. Same fact, opposite
  conclusions. The flat disorder bonus stopped skipping agents who declare a disorders need: that
  skip was fair while both channels were flat and wrong once they answered different questions
  (damage versus the consumer's conversion), and it meant the hardest-hitting procs in the game
  earned nothing.
* **`:` is now a classifier.** `X:Y` is a subclass of `X`, with `ultimate:*` explicitly carved
  out because magnitude and frequency are orthogonal axes, not subclasses. This is what makes the
  abloom split safe: relabelling Velina to `damage["abloom:free"]` moved **0 rows**, and
  disabling the classifier drops `Promeia/Velina/Yuzuha` on Horizon by 21 raw as she falls out of
  the abloom weakness and Promeia's buff stops reaching her.
* **Proc-dependent abloom is discounted by proc persistence** — a discount, not an anti-synergy.
  670 rows, max 3.1 points. Miyabi/Vivian is untouched, as required.
* **`buffs["anomaly:<element>"]` is live** for Grace, Rina and Jane, and Jane's `buffs.vortex`
  stand-in is gone. This is a **monoshock** fix as much as an anomaly one — Grace and Rina
  amplifying shock is how Harumasa's `scaling.anomaly` was always meant to pay off, and none of
  it had ever scored. The buff also amplifies a vortex built on the buffed proc, which is how
  Jane buffs vortexes for real; that restored rankings TEST 49's boss-conditionality from a
  0.8-point margin to 20.8.
* **Remielle's channels read her teammates' Proficiency**, and `damage.luminize` finally feeds
  burst (it was read by nothing at all).

**Two corrections worth keeping.** Scaling the disorder NEED channel by proc damage zeroed a
non-anomaly consumer outright (`ap` 0) and inverted the Yanagi/Burnice rung; that channel prices
the consumer's conversion, not damage. And Remielle's channels were briefly weighted by proc
damage rather than AP, which made crit-driven Miyabi her *best* partner — the exact inversion.
Luminize and Refringe scale on Proficiency; disorder is the channel that reads proc damage.

**Anomaly overhaul, phase 2c/2d** — Anomaly Proficiency, and tier compression, 2026-09-10.

**Vortex damage now scales on the Proficiency of the agent whose proc was consumed.** Effective
AP is base `ap` plus whatever a unit's declared `scaling.am` converts out of the team's buildup
supply, so Alice, Promeia and Vivian improve as their team feeds them Mastery while Miyabi, who
declares no Mastery appetite, gains nothing from a buildup buffer. 1,817 rows moved. The largest
losses are Miyabi and Soukaku teams on Scorched Horizon, both `ap: 1` and both halved — which is
the model doing its job: Miyabi's dislike of wind no longer rests on a suppressed frost tier.

**Tier values are compressed at the square root before payout**, anchored at 2. A tier is a
damage ratio; a team's value is not linear in one damage channel. Same argument and same shape as
buff delivery's `scaleImpact` `[COH-03]`, so it is a principle rather than a fitted constant. Ice
falls 4.5 to 3.00, the ether/fire/physical majority does not move at all, electric rises 1 to
1.41. 1,016 rows moved. Grace beside Remielle and Velina gained 12 points, which is the owner's
stated game fact — her electric is the weakest wind mix-in and she is good there anyway.

Three separate routes to one trap are now closed: AP, compression and pooling all scale the
**payout** and never the stored tier, because the stored tier is what the wasted-vortex charge
compares against `VORTEX_PRIMARY_MIN`. See `[VTX-02]`, `[VTX-03]`, `[VTX-04]`.

**Decision-gate reading, interim.** Beside Remielle and Velina with the declared L5 stripped, the
Aria-to-Promeia gap has closed from **-58.7 to -41.1** on Girtablullu (-42.3 on Aberrant), and
Alice-to-Burnice from -27.9 to -22.5. Both still in the wrong order. Compression did the work;
AP alone made the Aria gap slightly *worse*, because both agents have high Proficiency and
inflating the channel widens an absolute gap. That was the plan's own forecast.

**Anomaly overhaul, phase 2b** — the vortex tier became a pooled mean, 2026-09-10.

Vortex events are gated by the wind agent's cyclones, which the non-wind agents **share**. A
second non-wind element does not add vortex events, it splits them. The tier is now the mean of
the team's distinct non-wind elements rather than the max over them, so a weak element dilutes
the pool for everyone. That is why `Nangong/Miyabi/Velina` is poor despite Nangong plus Velina
looking like a plausible shell — Miyabi's frost drags Nangong down with it.

49 rows moved, all downward, `l4` only. Predicted set was "a wind source, at least two distinct
non-wind elements **with differing tiers**, and not the wind-state boss": **zero exceptions in
both directions**. Remielle teams and Scorched Horizon rows were predicted not to move and did
not — she fills no gauge, and a wind-state boss consumes every proc so nothing is shared.

The prediction needed sharpening once: 42 viable teams matched "two distinct elements" and did
not move, because their pools were all tier 2 (ether, fire, physical) and a mean of equals is the
max. **The pooling only bites when the pool is uneven**, which is when it should.

**One trap, closed.** The reaction object now carries two tiers: `vortexTier`, the pooled mean
that drives payouts, and `ownVortexTier`, read by exactly one thing — the wasted-vortex cohesion
charge. That charge asks whether a carry's *own* element makes vortex worth building around, and
pointing it at the pooled value instead lets Miyabi read 1.4, clear `VORTEX_PRIMARY_MIN`, and
delete the charge silently, worth about **+70** to the team it exists to punish. Mechanics
TEST 28 pins both halves and both mutations were checked; the gate mutation also turns the
rankings suite red.

**Anomaly overhaul, phase 2a** — frost's real vortex multiplier, 2026-09-10.
`VORTEX_TIERS['ice:frost']` went from a synthetic **0.001 to its real 0.8**, the same value the
other elemental variants carry. The 0.001 was suppression of one unit rather than a statement
about the element; the reason Miyabi genuinely dislikes wind is that vortex damage scales on the
proccing agent's Anomaly Proficiency, which phase 2 models next.

276 rows moved, all upward, all `l4` only — cohesion never moved, so the wasted-vortex charge
still fires. Predicted set was "teams containing Miyabi **and** a wind source (Velina, Roxy) or
the wind-anomaly boss": **zero exceptions in both directions**, once already-non-viable rows are
excluded. Calibration anchors did not move; the affected teams are not in anomaly's top ten.

Two things this exposed, both fixed:

* **Rankings TEST 62's fourth assertion went from a 17.8-point margin to exactly 0.00** and was
  passing by coincidence. Its comment claimed a "same class of scores comparative to proper
  vortex teams" judgement while the code asserted a bare 15-point gap between two teams, so it
  now asserts against the proper vortex teams — what was meant, and worth 25.1 points of margin.
  Mutation-checked: disabling the wasted-vortex charge turns it red.
* **Frost at 0.8 clears `VORTEX_PRIMARY_MIN` (1.0) by 0.2**, and that inequality is the whole of
  the Miyabi-wastes-Velina ruling. The scorer now throws at load if anyone closes the gap.

**Anomaly overhaul, phase 1** (data model only), 2026-09-10. Added `mechanics.stats` — a unit's
stat line, distinct from what it needs and what it buffs — with per-role baselines in the scorer
and explicit `am`/`ap` rows on all twelve anomaly agents plus Nangong and Soukaku. Renamed
`buffs.anomaly` to `buffs.buildup`, so the `anomaly:<element>` classifier can mean proc damage
without colliding with buildup. Removed Remielle's `damage.aftershock`, which was simply wrong.

**Nothing consumes `stats` yet**, deliberately: authoring the data and reading the data are two
separately measurable changes. Measured delta over the full preview corpus: **0 of 139,441 rows
moved**, and regenerating `calibration.json` changed only `engineFingerprint` and `generated`.

Removing Remielle's aftershock moved nothing because **no legal team pairs her with either
aftershock buffer** — she joins on anomaly or faction, Orphie and SAnby join on stun or support.
The estimate that it would cost her 12 and 18 points was arithmetic on a pairing that cannot
exist. Worth remembering as a shape: a *reachability* check is cheaper than a magnitude estimate
and settles the question outright.

**Archetype calibration**, 2026-09-03. `calibrated = raw x factor[archetype]`, one factor per
archetype, applied at the boundary rather than inside the scorer. The engine still returns raw
scores and nothing about its mechanics changed. See [calibration](engine/calibration.md).

Re-anchoring the numeric bands was considered and **dropped** — owner's call, obviated as long as
the suite stays green and the rankings read correctly.
