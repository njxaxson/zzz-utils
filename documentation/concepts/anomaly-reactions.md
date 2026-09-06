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

Frost is effectively zero; auricInk and honedEdge are low. The exact numbers live in
`VORTEX_TIERS` in the scorer — read them there rather than trusting a number written down
here. This tiering is the whole reason a plain ice anomaly agent beats frost-variant Miyabi
on a wind boss.

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


