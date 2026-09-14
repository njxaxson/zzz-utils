# Status

Where things stand. Everything here is measured, not remembered — if you change the engine,
re-run the commands and update the numbers.

**Last verified:** 2026-09-14.

## Scores come on two scales

The engine returns **raw**. Anything comparing archetypes against each other reads
**calibrated**. Check which one you are holding before drawing a conclusion from a number — see
[reading scores](engine/reading-scores.md).

## Test status

| Suite | State |
|----|----|
| mechanics | **28 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| rankings | **89 pass, 2 KNOWN_RED**, exits 0. TESTS 9 and 90 — the anomaly ladder |
| recommendations | **44 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| bucketing | **6 pass, 0 fail** |
| cohesion fixture | **11/11** owner judgements hold |
| calibration freshness | `calibration.json` matches the current engine and data fingerprint |
| calibration certification | **CERTIFIED** — 0 within-archetype rank inversions across 60 (boss × archetype) groups and 67,026 teams |

```bash
node test-mechanics.mjs && node test-rankings.mjs && node test-recommendations.mjs && node test-bucketing.mjs && node cohesion-fixture.mjs
node generate-calibration.mjs --check
node calibration-check.mjs
```

`test-mechanics.mjs` and `test-rankings.mjs` are the split of what used to be one `test-scoring.mjs`
(118 tests total, same as before) — mechanics tests pin isolated engine rules independent of
roster content, rankings tests pin score floors/orderings/ladders for the live roster.

`KNOWN_RED` is empty for mechanics and recommendations, and holds **two entries** for rankings:
TESTS 9 and 90, the anomaly ladders that were being held up by declared `synergy.units`
relationships until phase 3 removed them. Phase 4 closed most of two rungs on mechanics alone
and made a third worse; the entries carry the current margins, not the phase-3 ones. That is one disagreement, opened deliberately and
visible for exactly as long as it lasts — the suite goes red on a stale entry the moment a
mechanic closes one, which is what the map is for. See
[the verification loop](tooling/verification-loop.md) for why an empty map still matters, and why
a green suite is not evidence on its own.

## Open

**None as issue files.** Both boss-data levers were converted to mechanics in phase 3 of the
anomaly overhaul; see [adjudications](notes/adjudications.md).

What IS open is the anomaly ladder itself, held in `KNOWN_RED` rather than in an issue file
because it is a live measurement rather than a defect to be described. See below.

## Deferred

Seven. These are known, understood, and deliberately not being chased.

| Issue | Priority | Why it is parked |
|----|----|----|
| [Sub-DPS tier halved beside a same-type carry](issues/deferred/high-sub-dps-tier-is-halved-beside-a-same-type-carry.md) | high | Wide blast radius; post-release |
| [The partner ladder is a fitted stopgap](issues/deferred/medium-the-partner-ladder-is-a-fitted-stopgap.md) | medium | The honest fix is a feature, not a repair |
| [Trigger/SAnby/Seed clears its floor only by declaration](issues/deferred/medium-trigger-sanby-seed-clears-its-floor-only-by-declaration.md) | medium | A join-shape exemption is specified as the real fix, scheduled as a future engine expansion |
| [Greed value-scaling cannot be tested](issues/deferred/low-greed-value-scaling-cannot-be-tested-on-todays-roster.md) | low | No fixture can distinguish it until a `greedy: 2` unit exists |
| [Ye Shunguong under-paid on veils](issues/deferred/low-ye-shunguong-underpaid-four-points-on-veils.md) | low | One pair type, about four points, in the safe direction |
| [`utility.kaleidoscope` is read only by the UI](issues/deferred/low-kaleidoscope-is-read-only-by-the-ui.md) | low | Only a support declares it, so no fixture could tell a fix from a no-op |
| [The `ultimate:double` weight is discarded](issues/deferred/low-ultimate-double-weight-is-discarded.md) | low | Every declarer means the same thing, so grading it would move nothing |

`issues/resolved/` is empty by design. A closed issue gets a file only when its history would
change what a future reader does; otherwise it is deleted and git holds it. The durable reasoning
lives in [notes/](notes/) instead — see [the issue system](issues/README.md).

## For release

**Nothing is release-blocking.** Every rankings complaint is closed, and the two open items are
data tuning rather than engine defects.

## What shipped last

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
