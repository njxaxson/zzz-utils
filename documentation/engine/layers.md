# The Scoring Pipeline: L1 to L5

`scoreTeamForBoss` starts from a base score, resolves activated roles and conditional damage
against the team, then runs six layers. This page says what each layer is responsible for, so
you know where a change belongs.

**Final score = raw × teamwork multiplier.**

## The layers

| Layer | What it does |
|----|----|
| **L1 Disqualifications** | Hard failures returning −1. Deliberately narrow |
| **L1.5 Structure** | Classifies the composition and scores field-time economy. Feeds the teamwork multiplier — **it is not added to the score** |
| **L2 Inherent Quality** | Individual power independent of team context: tier and rank |
| **L3 Boss Matchup** | Shill, favored units, `weak` mechanics, element weakness and resistance, boss debuffs, assists |
| **L4 Mechanical Synergy** | The core. Directional pairwise evaluation of every ordered teammate pair, plus team-level bonuses |
| **L5 Additional Synergies** | Hand-curated `synergy.units` and `synergy.tags`. Low-weighted; a fallback for what mechanics cannot express |

### L1 in detail

The full disqualification list: an illegal `join`
arrangement, no DPS at all, three *pure* DPS, a DPS whose tag matches the boss's `anti`, a
**damage dealer** whose element is resisted, or too few reliable defensive assists.
`synergy.avoid` is checked alongside.

### L2 in detail

Carries score at full weight. Support, defense and stun units score at reduced weight **gated
by buff utilisation** — a support at 30% utilisation keeps roughly 9% of their quality bonus,
because the gate is squared. Plus a titled bonus, a totalize stun-demand penalty and a
wasted-DPS-buff penalty.

### L3 in detail

Also where a **missing non-DPS shill disqualifies**. A [stunless](../archetypes/stunless.md)
carry exempts a stunnerless team from a stun shill.

## Field-time economy (L1.5)

| On-field agents | Effect |
|----|----|
| 0 | Penalty — no primary damage dealer |
| 1 | Bonus — an efficient solo carry |
| 2 | Neutral |
| 3+ | Penalty — field competition |

## No support or defense is its own tier

A team with no effective support and no effective defense — pseudo-roles included, so Orphie,
Remielle and Cissia-beside-a-second-electric-attacker all count — is demoted to a dedicated
no-support tier.

Supports exist because buffs matter, and forgoing one is a genuine teambuilding failure rather
than a stylistic choice. The hit is meant to be large.

**Two exemptions, both waivers rather than grants.** A totalize plus double-stun team (below), and
a team holding a carry whose `join` mandates a second carry ([PIPE-03]). Both return the tier the
team already classified as; neither promotes it.

Before this rule, `Nangong/Miyabi/Vivian` and `Nangong/Miyabi/Yuzuha` classified identically,
which is why triple-anomaly lines outranked the [wheelchairs](../archetypes/wheelchairs.md)
they should lose to.

**The demotion applies to every classification and takes the harsher of the two factors.** It
used to fire only on teams that had already classified as conventional, which meant a
supportless team was scored *better* for also being unconventional:

| Team | What happened |
|----|----|
| `Nangong/Alice/Miyabi` | Classified as double-anomaly-plus-stunner, kept the unconventional-viable factor, never reached the no-support tier |
| `Nangong/Alice/Sunna` | The supported counterpart — and it *lost* on Miasmic Fiend |

Taking the harsher of the two rather than overriding is also what stops a supportless *wildly*
unconventional team being promoted **up** to the no-support tier.

## No stunner is its own tier too, graded by carry role

Two tiers, not one:

| Carry role | Without a stunner |
|----|----|
| Attack | Badly off — an attacker's damage lives inside the stun window |
| Rupture | Worse off than with one, but not as badly. Rupture-plus-double-support still ranks above a stunnerless attacker |
| Anomaly | **No such tier at all.** Anomaly teams lean on reactions rather than burst, so they need supports more than stunners |

A `stunless` carry never reaches these, since such a unit receives its stun multiplier whether
or not the enemy is stunned.

**The exemption is role-agnostic.** It reads the attack, rupture *and* armorer carry lists,
because nothing stops a rupture or armorer carry being stunless and such a team must not be
charged for a window it never wanted. Anomaly is deliberately excluded — it has no no-stun tier
to be exempted from, and a stunless anomaly agent would affect reaction cadence too.

Ye Shunguong is the only stunless unit in the data today and she is `attack`, so the rupture
and armorer halves are currently latent. Mechanics TEST 26 synthesises the rupture case rather than
waiting for the unit that would expose it.

Before this tier existed, `Starlight Billy/Pan Yinhu/Lucia` and `Dialyn/Starlight Billy/Lucia`
both classified as conventional at full credit — so two supports and no stunner earned exactly
the same structural credit as stunner-plus-support, and Pan won on raw supply. Pan Yinhu is the
*support* slot in the rupture archetype, not the stunner slot.

## Which compositions accept a second carry

These differ by role and must not be collapsed.

| Shape | Second carry allowed? |
|----|----|
| **Anomaly** | Yes, unconditionally. Most anomaly teams *want* two anomaly bodies, ideally with one a sub-DPS or a pseudo-stunner. That is the baseline assumption, because the team is built to produce reactions |
| **Rupture** | **Never.** One rupture carry only |
| **Attack** | Only on an explicit **declaration**, in one of three forms: the second attacker declares a **sub-DPS** pseudo-role, declares a **pseudo-support** one, or its `join` array offers **no non-carry activation at all** ([PIPE-03]). Sharing an element is *not* interaction — two carries of one element cannot disorder with each other and still cannot both hold the field |
| **Attack + anomaly** ([monoshock](../archetypes/monoshock.md)) | Only when the attacker declares `scaling.anomaly` — Harumasa and Sigrid. `scaling.am` and `scaling.ap` are **stats, not mechanics**, and must never be read as evidence that a kit runs on anomaly |
| **Armorer** | Two armorers are conventional — [Maim](../concepts/armorer-laceration-gash-maim.md) is the shared-resource payoff |

**One exemption: [totalize](../archetypes/totalize.md) plus double stun.** There the second
stunner *is* the support — totalize damage *is* stun uptime, so a second stunner feeds the
carry the way a support otherwise would. This is deliberate; `Anby/Qingyi/Hugo` is a real team.

### [PIPE-03] A `join` that mandates a second carry

Seed's `join` is `["attack"]` and nothing else, so **every legal Seed team holds two attack
agents**. The second carry is mandated by the kit rather than chosen, which is interaction — and
the engine could not see it, because `join` had never been read as a statement about composition.

The rule: a unit tagged **attack or rupture** whose `join` is non-empty and consists *entirely* of
carry-role tags (`attack`/`rupture`/`armorer`/`anomaly`). Two sides, asymmetric on purpose.

*The base must be attack or rupture*, because those classes assume a **solo** carry — the other
two slots are free for a stunner and a support, and a mandated second DPS takes one of them. That
displacement is the whole thing being modelled. Anomaly and armorer assume a DPS partner already
(two armorers are conventional, one row up), so they have nothing to be excused for.

*The join targets may be any carry class.* An attacker that joins only on `rupture` is boxed out
exactly as one that joins only on `attack`; "an agent of the same role" is too narrow a reading.

It applies at **two sites**, and neither alone moves anything:

1. the double-attacker branch, lifting it off no-interaction to `UNCONVENTIONAL_VIABLE`;
2. the no-support gate, waiving the demotion that would otherwise pull 0.85 back to 0.75.

Site 1 deliberately applies to supported teams too. The branch accepts `nSup >= 1`, so without it
a Seed team **with** a support would sit at 0.6 while a supportless one sat at 0.85 — backwards.
What a support buys is the no-support gate returning before site 2 is consulted. The rule never
reaches `CONVENTIONAL`: it waives a charge, it does not grant a tier.

Reads **raw** tags and **raw** `join`, never effective roles, because `join` legality itself
matches raw tags — a role-reading version would claim a mandate the legality check does not
enforce. Seed is the only unit on the roster that qualifies; mechanics TEST 34 asserts that, so a
future unit shipping the same join shape trips a test rather than quietly moving the corpus.

Measured: **1,448 team-boss rows, every one upward, signature `structure+teamwork` and nothing
else, zero exceptions.**

## Related

* [L4 components](l4-components.md) — what happens inside the core layer.
* [Teamwork multiplier](teamwork-multiplier.md) — what L1.5 feeds into.
* [Role activation ripple effects](role-activation-ripple.md) — how a pseudo-role changes each
  layer's answer.
* [Lenient mode](element-resistance.md#lenient-mode) — what happens to L1 for a limited roster.



## Code notes

### [PIPE-01] The solo-carry bonus is sized against the mechanics it sits beside

`FIELD_TIME.SOLO_CARRY_BONUS` is **10**. It was 15, and the owner's objection to that was a
smell rather than a specific wrong answer: field-time economy was consistently outweighing
mechanical interactions, and "optimise your field time" is not the same size of decision as
"bottleneck your resources with three on-field agents".

The measurement supports it. On the released corpus, 23% of viable team-boss rows collect the
solo-carry bonus, and the mean L4 total in that bracket is about 39. At 15 the bonus was worth
roughly 38% of everything mechanical the engine had to say about those teams; at 10 it is
roughly 25%. The penalties are untouched — a three-on-field team is genuinely bottlenecked, and
`TRIPLE_ONFIELD_PENALTY` and `ZERO_ONFIELD_PENALTY` keep their full weight. This is only about
what optimising field time is worth, not about what wasting it costs.

**Two things broke when it dropped, and both were mechanics hiding behind the bonus.** That is
the case for the change rather than a cost of it:

| What broke | What it actually was |
|----|----|
| Bucketing TEST 5 — the stunless line fell out of one rank band of the stunner line on Thrall | A stunless team is one carry and two supports, so it collects the solo bonus **by construction**. Lowering the bonus is a flat demotion of the whole archetype, which is exactly what `STUNLESS_SHILL_CREDIT` exists to dial. Raised 48 → 53. See [ARCH-01](../archetypes/README.md#arch-01-stunless-shill-credit-sizing). |
| Rankings TEST 71 — Trigger no longer beat Roxy behind Claret on electric-weak UCC | Trigger's lead there had been 4.0 points on a bonus of 15, so her kit was not winning that ordering at all; field time was. The fix was to price the part of her kit the test is actually about — defense shred against an armorer. See [ARM-01](../concepts/armorer-laceration-gash-maim.md#arm-01-defense-shred-is-a-full-value-armorer-lever). |

**Do not reach for the band constants to resolve the first one.** `RANK_BAND_RATIO` would have
had to go from 0.011 to about 0.020 to swallow the gap, and that constant governs real
allocation behaviour for every boss — see [BUCK-01](../bucketing/deadly-assault.md). Widening
the definition of "tied" across the whole allocator to settle one parity assertion is the wrong
trade.

### The double-payment question, re-opened and re-closed

An earlier adjudication noted that being off-field pays a unit twice on a Miyabi team — the
disorder-rate doubling *and* the sole-carry bonus — and judged that not to be double counting,
since they are different effects of the same fact. **That judgement still stands.** What changed
is the magnitude of one of the two payments, not whether both are owed.

The distinction matters because the cohesion fixture holds two entries that pull against each
other through this constant: `burnice-over-yanagi-neutral-third` needs Burnice's off-field
status to pay, and `yanagi-over-burnice-yuzuha-third` needs it not to decide the ordering on its
own. Lowering the magnitude satisfies both — the fixture went from 10/11 to **11/11**, closing
the Yanagi entry while the Burnice entry kept its margin.

**Gating the bonus does not.** An attempt to restrict it to teams with a genuinely solo damage
dealer — `team.filter(isDPS).length === 1`, so an off-field sub-DPS stops the team counting as a
solo carry — overshot: Yanagi went from 0.7 behind to 14.3 ahead and the Burnice entry failed
instead. That is the shape of a re-litigated adjudication rather than a resized constant, and it
is why the change that shipped was the magnitude.

### [PIPE-02] The supportless factor is the whole judgement now

`STRUCTURE_FACTOR` for the no-support tier is **0.75**, and since the L4 soft cap was removed it
is the only thing enforcing "a supportless team never beats its supported counterpart".

The cap used to do that job, from the wrong layer. When it went, `Nangong/Miyabi/Vivian` — a
stunner and two anomaly carries with nobody supporting them — beat its supported counterpart
`Miyabi/Vivian/Nicole` by **29 points** on Butcher and 33 on Marionettes.

**0.75 is the mildest value that fixes it**, and the factor really is the whole lever here:
`Nangong/Miyabi/Vivian` has a cohesion of exactly 1.0, so its structure factor *is* its entire
multiplier. Below **0.70** the wasted-vortex anti-pattern (rankings TEST 62) starts breaking, so
0.75 keeps real margin on the other side.

Measured: **8,430 team-boss rows moved, every one of them downward, zero exceptions** — every
mover was classified no-support.

**Two floors went red, and neither was repaired by moving the factor.**
`Lighter/Promeia/Burnice` missed its floor by 2.8; the owner re-derived the floor from 345 to
**320** rather than soften the factor to protect one odd composition. It reads **342.2**, so the
floor now asserts the team is *viable* with 22 points of margin, rather than pinning a
supportless line to a number it was never going to hold. `Trigger/SAnby/Cissia` misses by more and stays in
`KNOWN_RED`: it is not a trustworthy boundary at all — see
[known pitfalls](../notes/known-pitfalls.md) on why a SAnby, Seed or Cissia team cannot be used
to size a constant.

**What was tried and rejected.** Scaling the penalty by how much buff weight the team actually
lands looked promising and does not survive: among genuinely supportless teams the measure runs
**backwards** on the owner's own Miyabi ladder, because Nangong is a buff-rich stunner whose
buffs all land. And re-introducing a compression curve scoped to supportless teams was rejected
outright by the owner — the cap is the wrong mechanism, not merely the wrongly-scoped one.
