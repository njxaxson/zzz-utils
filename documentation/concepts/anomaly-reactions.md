# Anomaly Reactions: Disorder and Vortex

When two *different* elements sit on the same enemy, they react. This page covers what
counts as a reaction, who counts as a partner, and the one boss property that switches the
whole system off.

## The two reactions

* **Disorder** — both elements are non-wind. The standard reaction.  Disorders also clear the underlying anomaly procs that triggered them.
* **Vortex** — exactly one of the two is wind. Damage scales off the **non-wind** element's tier. Unlike disorders, vortexes retain the effects of the anomaly procs that triggered them.

Two of the same element do nothing. Wind plus wind does nothing.

But an [element variant](elements-and-roles.md#element-variants) is *not* the same element.
A variant fills its own gauge, so Miyabi's frost genuinely disorders with plain ice from
Soukaku or Promeia. Reaction detection is therefore variant-aware.

The proc-clearing difference between disorders and vortexes is relevant. Some agents only trigger damage or damage boosts when an anomaly proc is present. For example, Promeia and Aria only trigger ablooms when an anomaly proc is active; disorders clear procs and limit their ability to apply abloom (although in that case, abloom damage would be replaced by the disorder damage, so this is not necessarily a loss). 

### The Miyabi/Soukaku bug worth knowing about

For a long time the engine asked the question two different ways in two different places.
One code path compared base elements (ice vs ice — no reaction), the other compared variants
(frost vs ice — reaction). The result was that Miyabi/Soukaku collected credit for a boss's
disorder weakness at one layer while Miyabi herself was paid nothing for the disorder at
another. Only the boss-anomaly-state comparison legitimately stays on base elements, because
`anomaly:state` values are named after base elements.

## Who counts as a reaction partner

Anything that lands an element on the target. Not anything with a particular role.

A unit contributes its own gauge element when it holds an effective `anomaly` role, **and**
it contributes every element it annotates as `utility["anomaly:<element>"]` regardless of
role. A proc is a proc whoever fires it. So a pure enabler with no anomaly role still
completes reactions for its teammates while earning no reaction of its own.

The element a unit *contributes* is the same string it is *excluded from reacting with* —
that is why the engine keeps a separate "own gauge element" concept. Collapse those two ideas
and a unit starts disordering with itself.

## Vortex tiers

Highest to lowest:

> ice ≫ fire ≈ physical ≈ ether > electric > element variants

Frost, auricInk and honedEdge are all low and equal. The exact numbers live in
`VORTEX_TIERS` in the scorer — read them there rather than trusting a number written down
here. This tiering is a large part of why a plain ice anomaly agent beats frost-variant Miyabi
on a wind boss — though not all of it, and the difference matters.

Frost was set to an effectively-zero 0.001 for a while. That was **synthetic suppression of one
unit**, not a statement about the element: it forced the Miyabi-dislikes-wind result by making
her reaction arithmetically vanish. Frost's real multiplier is the same 0.8 the other variants
carry, and the reason Miyabi genuinely dislikes wind is that vortex damage scales on the
proccing agent's Anomaly Proficiency, which for her is low.

One number is load-bearing and is guarded in code: frost must stay **below**
`VORTEX_PRIMARY_MIN`, because that comparison is what charges a Miyabi + wind team for wasting
its vortex. At 0.8 against 1.0 the margin is 0.2, so the scorer throws at load if anyone closes
it.

## The tier is a pooled mean, not the best element on the team

Vortex events are gated by the **wind agent's** cyclones, and that is a limited resource the
non-wind agents share. A second non-wind element does not add vortex events, it splits them — so
a weak element in the pool genuinely dilutes what the wind agent produces.

The tier is therefore the **mean of the distinct non-wind elements the team lands**, not the max
over them. A max let the best element hide the worst and counted a shared resource once per
agent.

| team | pool | tier |
|----|----|----|
| Promeia + Velina | ice | 4.0 |
| Nangong + Promeia + Velina | ether, ice | 3.0 |
| Nangong + Miyabi + Velina | ether, frost | 1.4 |
| Miyabi + Velina | frost | 0.8 |

This is why `Nangong/Miyabi/Velina` is a poor team despite Nangong plus Velina looking like a
plausible anomaly shell: Miyabi's frost drags the pool down for everyone, including Nangong.

**Remielle teams are deliberately untouched.** She is lumen and fills no gauge, so a
`<carry>/Remielle/Velina` team has exactly one non-wind element and its pool cannot be diluted.

**A wind-anomaly-state boss does not pool either.** Scorched Horizon's wind is permanent and
consumes every proc the team applies, so vortex events scale with proc count rather than with one
agent's cyclones. Nothing is shared, so nothing dilutes, and each agent reads its own element.

## Vortex damage scales on the proccer's Proficiency

A vortex's damage is the element's multiplier times the **Anomaly Proficiency of the agent whose
non-wind proc was consumed**. So two agents of the same element are not worth the same to a wind
partner, and that is what separates them.

Miyabi is the case this exists for. Her AP is genuinely low — her damage runs through crit rather
than through Proficiency — so her vortexes are small whatever element she carries. That, not a
suppressed frost tier, is why she is a poor Velina partner. Grace is the mirror: electric is the
weakest wind mix-in and she is good there anyway, because her AP is naturally high.

Effective AP is base `ap` plus whatever the unit's declared `scaling.am` converts out of its
**own** `stats.am`. No teammate appears in it: nobody in the game hands anybody Anomaly Mastery,
so Alice, Promeia and Vivian convert what their own build carries, and Miyabi — who declares no
Mastery appetite — converts nothing however much Mastery she has. See
[stats](../data-model/stats.md) and `[AP-01]`.

## Tier values are compressed before they are paid

A tier is a **damage** ratio out of the game. A team's **value** is not linear in one damage
channel — the score sums many channels and then soft-caps — so the spread is compressed at the
square root before payout, anchored at 2.

This is the same argument, and the same shape, that buff delivery already uses: `scaleImpact`
prices a buff at the square root of its L4 coefficient because a support's share of a team's
damage is not linear in its pair coefficient. See `[COH-03]`.

| element | tier | value paid |
|----|----|----|
| ice | 4.0 | 2.83 |
| fire, physical, ether | 2.0 | 2.00 |
| electric | 1.0 | 1.41 |
| frost, auricInk, honedEdge | 0.8 | 1.26 |

Anchored at 2 so the majority of the roster does not move at all; only the outliers compress. The
ice-to-ether ratio falls from 2.00 to 1.41.

**Ice is 4.0, not the game's own ratio.** Phase 4 of the anomaly overhaul lowered it on
playtesting grounds — the ice-versus-ether difference simply is not enough to put Promeia over
Aria in practice, so the datum was judged wrong rather than the model. Recorded as a deliberate
divergence in [adjudications](../notes/adjudications.md), not left to look like a tuning slip.

### Two tiers, and the difference matters

| field | what it is | who reads it |
|----|----|----|
| `vortexTier` | the pooled mean | every damage payout, and every "is there a vortex here" gate |
| `ownVortexTier` | this unit's own element's tier | **only** the wasted-vortex cohesion charge |

The split is load-bearing. The cohesion charge asks whether any carry's *own* element makes
vortex worth building around, which is a property of that carry rather than of the team's diluted
pool. Point it at the pooled value instead and Miyabi in `Nangong/Miyabi/Velina` reads 1.4,
clears `VORTEX_PRIMARY_MIN`, and the charge silently stops firing — worth about **+70** to the
team the charge exists to punish. Mechanics TEST 28 pins both halves.

**Neither AP nor tier compression touches the stored tier either**, for the same reason and by
the same route. Both scale the payout. Compressing the stored value would lift frost to 1.26 and
clear the threshold; folding AP in would let a high-AP agent clear it on a bad element. Three
different ways to reach one trap — hence `[VTX-02]`, `[VTX-03]` and `[VTX-04]`.

## Boss anomaly state

`mechanics["anomaly:state"]` is the single biggest modifier in this area. A boss with it
permanently carries that element's anomaly, and it **immediately consumes every anomaly the
team applies**. Team-side reactions are suppressed: each agent reacts once with the boss and
that is all. Agents sharing the boss's element get nothing.

> **The distinction that trips everyone up:** a boss being *weak to wind* is a `weaknesses[]`
> entry and does nothing at all to anomaly reactions. A boss having *wind anomaly state* is a
> different field and changes everything. A boss can have either without the other.

## Polarity disorders

Polarity disorders are a subclass of disorder. Yuzuha's `buffs.disorders` amplifies them, and
a `utility.disorders` provider forces disorder occurrences that **bypass anomaly-state
suppression**.

The occurrence still feeds `scaling.disorders` at full weight, so a unit like Miyabi whose
damage transforms with disorder count keeps working. But the polarity *damage* itself is
heavily discounted on a wind-anomaly boss.

### Polarity assaults are a different thing

A polarity **assault** is an extra physical anomaly proc. Alice's polarity assaults are extra
*physical* anomaly procs — nothing more. They are not disorders: they generate none, satisfy
no `scaling.disorders`, and are not what `utility.disorders` means.

Only **Nangong** and **Yanagi** generate polarity disorders solo. Alice does not. Annotating
Alice as though she did produced a phantom "Alice exception" that cost a full round of
scoring work to chase down.

What assaults *do* affect is the team's anomaly proc count, which anomaly-quantity scalers
cash in. That is modelled as `utility["anomaly:<element>"]` — see
[utility](../data-model/utility.md).

In theory, future units could create uniquely create different element procs, such as polarity shocks, which

would be a polarity version of an electric anomaly shock.  The terminology polarity generally implies that the anomaly proc or disorder does not come from normal building of a gauge but is triggered instantaneously

as part of the agent’s kit.

## Related

* [Disorder supply](disorder-supply.md) — how the engine measures how many disorders a team
  actually produces, and how a consumer gets paid for them.
* [Lumen](lumen.md) — lumen fills no gauge and so generates neither disorder nor vortex.



## Code notes

### [VTX-01] The vortex tier is a pooled mean, not a max

Covered in full under
[The tier is a pooled mean](#the-tier-is-a-pooled-mean-not-the-best-element-on-the-team) above. In short: cyclones
are shared, so a second non-wind element splits the vortex events rather than adding to them, and
a weak element dilutes the pool for everyone.

### [VTX-02] The wasted-vortex gate reads a carry's OWN tier

### [VTX-03] AP scales the vortex payout, never the stored tier

### [VTX-04] Tier values are compressed at the square root before payout, anchored at 2

All three are one trap reached three ways, covered together under
[Two tiers, and the difference matters](#two-tiers-and-the-difference-matters) above. The stored
tier is what the wasted-vortex cohesion charge compares against `VORTEX_PRIMARY_MIN`; AP, tier
compression and pooling all scale the **payout** instead. Let any of them touch the stored value
and the charge silently stops firing, worth about +70 to the team it exists to punish.


### [VTX-05] A vortex event has one damage number, and it is paid once

A vortex fires when a wind agent's cyclone meets a non-wind proc. The engine splits the event's
value between the two participants, and the split is asymmetric on purpose:

| participant | credited for | scales by |
|----|----|----|
| the **wind enabler** | creating the events | a neutral element, her own Proficiency, her own proc rate |
| the **proc owner** | the event's damage | the pooled tier, their Proficiency, their proc rate, any proc-damage buff |

Both halves used to be scaled by the partner's element, so the element landed **twice**. Velina
scored 57.5 beside Promeia and 40.6 beside Aria for supplying identical wind — and her own
Proficiency read 1.25 on both teams, which proves the only thing moving her payout was her
partner. She now scores the same beside either, and the element lands once.

The same argument goes one step further for a **proc-damage buff**, which is damage: the wind
agent is not paid for damage, so her half does not scale by it. See `[BUFF-08]`.

**But she still procs.** A proc is a proc whether it is wind or one of the original elements, and
being the static half of a vortex does not mean she did not make one. So the wind enabler is the
one consumer with a vortex who is still paid in the direct proc-damage channel — for a buff that
actually covers **her** procs, which means the bare `anomaly` key, not `anomaly:physical`. Without
that carve-out her own proc damage is priced nowhere at all.

**Below `VORTEX_PRIMARY_MIN` the neutral reading is dropped.** That threshold is already the
engine's "is there a vortex carry here" question, so under it the wind agent falls back to what
the pool is actually worth. Velina beside Aria or Promeia reads the neutral anchor either way;
beside Miyabi alone she reads frost's 0.8, because there her cyclones really are producing
nothing. Skipping this made `Miyabi/Velina/Yuzuha` gain 16 points and broke TEST 62 — the
element-neutral credit was over-rewarding the worst pairing in the game.

**Nothing here writes back to the stored tier.** AP, compression, proc rate and the proc-damage
buff all scale the **payout**. See `[VTX-02]` and `[VTX-03]`.

### [ANOM-01] Abloom is damage, and it is also a reaction

`damage.abloom` used to be read by exactly two things: an abloom-weak boss, and a teammate's
`buffs.abloom`. **Nothing paid a unit for dealing it.** Same hole `damage.luminize` had before
phase 2 — a headline damage type contributing nothing to its owner's output.

It is priced beside the implicit-disorder bonus rather than in the burst model, because it is not
burst: owner, *"abloom isn't burst damage; it is generally bonus damage applied when you hit
procced enemies."* It needs no stun window, so the burst model's stun-window semantics would be
wrong for it.

Two gates:

* `abloom:free` (Velina's expiring cyclones) fires whether or not a proc is standing, so it is
  paid in full.
* Every other abloom needs a live proc, so it is discounted by `computeProcPersistence`. A
  disorder **consumes** both procs that made it; a vortex leaves them standing. That is why a
  proc-dependent abloom is worth less beside a heavy disorder engine.

**It also counts as a reaction for cohesion.** The "this unit's anomaly output goes nowhere"
charge tests for a vortex or a disorder, and a mono-element anomaly pair makes no disorder **by
construction** — two fire agents proc the same gauge. Charging `Phoenix/Burnice/Remielle` for
having "no reaction" read a deliberate composition as a failed one; it was worth 36 points to that
team. Abloom is a reason to incentivise mono-elemental anomaly, and the cohesion half has to agree
with the damage half.

**`ABLOOM_BONUS` is capped by the Miyabi ladder, not by principle.** The anchored value is **7.5** —
`BOSS_WEAK.ABLOOM_PER_UNIT: 5` against `DISORDER_PER_UNIT: 4`, scaled by `MULT.DISORDER_BONUS: 6`,
so the boss layer and L4 agree on what the two mechanics are worth relative to each other. It sits
at **4**, because at 4.2 Vivian's `abloom: 3` lifts `Miyabi/Remielle/Vivian` past
`Nangong/Miyabi/Yuzuha` — a rung TESTs 79/82 pin and which holds by **0.3 points**. Scaling abloom
by proc rate as well (the "frequency" half of the owner's magnitude×frequency reading) breaks the
same rungs plus `yanagi-over-burnice-yuzuha-third`. Both were measured and reverted.

The weights encode magnitude **times** frequency as one number, per the owner: Promeia and Phoenix
high-magnitude/low-frequency at 3, Vivian slightly-lower-magnitude/very-high-frequency at 3, Aria
lower-magnitude/high-frequency at 2, Grace, Burnice and Nangong at 1. So Burnice genuinely deals
less abloom damage than Promeia, Vivian or Aria — that is data, not an under-annotation.
