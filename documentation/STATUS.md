# Status

Where things stand. Everything here is measured, not remembered — if you change the engine,
re-run the commands and update the numbers.

**Last verified:** 2026-09-10.

## Scores come on two scales

The engine returns **raw**. Anything comparing archetypes against each other reads
**calibrated**. Check which one you are holding before drawing a conclusion from a number — see
[reading scores](engine/reading-scores.md).

## Test status

| Suite | State |
|----|----|
| mechanics | **27 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| rankings | **91 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| recommendations | **44 pass, 0 fail**, exits 0. `KNOWN_RED` empty |
| bucketing | **6 pass, 0 fail** |
| cohesion fixture | **11/11** owner judgements hold |
| calibration freshness | `calibration.json` matches the current engine and data fingerprint |
| calibration certification | **CERTIFIED** — 0 within-archetype rank inversions across 57 (boss × archetype) groups and 64,325 teams |

```bash
node test-mechanics.mjs && node test-rankings.mjs && node test-recommendations.mjs && node test-bucketing.mjs && node cohesion-fixture.mjs
node generate-calibration.mjs --check
node calibration-check.mjs
```

`test-mechanics.mjs` and `test-rankings.mjs` are the split of what used to be one `test-scoring.mjs`
(118 tests total, same as before) — mechanics tests pin isolated engine rules independent of
roster content, rankings tests pin score floors/orderings/ladders for the live roster.

All three `KNOWN_RED` maps are **empty**. That is a real state, not an oversight — every test that
was red on purpose has been closed. See [the verification loop](tooling/verification-loop.md) for
why an empty map still matters, and why a green suite is not evidence on its own.

## Open

Two, both boss-data levers rather than engine defects. Neither is release-blocking.

| Issue | Priority |
|----|----|
| [Bringer's `shillIntensity` 6 forces Miyabi to the top](issues/open/medium-bringer-shill-intensity-forces-miyabi-to-the-top.md) | medium |
| [Aberrant's `shillIntensity` should become a lumenize vulnerability](issues/open/medium-aberrant-shill-intensity-should-be-a-lumenize-vulnerability.md) | medium |

Both are thumbs on the scale doing work that a mechanic should be doing. The Aberrant one is the
more tractable of the two — the underlying game fact is already known.

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
