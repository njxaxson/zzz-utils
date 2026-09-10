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
| Promeia + Velina | ice | 4.5 |
| Nangong + Promeia + Velina | ether, ice | 3.25 |
| Nangong + Miyabi + Velina | ether, frost | 1.4 |
| Miyabi + Velina | frost | 0.8 |

This is why `Nangong/Miyabi/Velina` is a poor team despite Nangong plus Velina looking like a
plausible anomaly shell: Miyabi's frost drags the pool down for everyone, including Nangong.

**Remielle teams are deliberately untouched.** She is lumen and fills no gauge, so a
`<carry>/Remielle/Velina` team has exactly one non-wind element and its pool cannot be diluted.

**A wind-anomaly-state boss does not pool either.** Scorched Horizon's wind is permanent and
consumes every proc the team applies, so vortex events scale with proc count rather than with one
agent's cyclones. Nothing is shared, so nothing dilutes, and each agent reads its own element.

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


