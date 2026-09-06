# Disorder Supply

`scaling.disorders` declares a **need**, not a strength. A unit with it is worth far more on
a team that actually cycles disorders than as a solo hypercarry. This page covers how the
engine measures the supply that need is judged against, and how the need gets paid.

Read [anomaly reactions](anomaly-reactions.md) first if disorder and vortex are not yet
familiar.

## Three sources, added together

`getDisorderSupply(unit, team, reactions)` reports supply in the same units as a
`utility.disorders` annotation. It sums:

**1. Element cycling.** A fixed amount per *distinct* nonwind element that disorders 

with this unit, counted off the element set the reaction detector already built. 

Two partners of different elements genuinely supply more than one partner does.

**2. Parallel gauge buildup.** That per-element figure **doubles** unless the consumer and
the contributor are *both* on-field. An off-field agent fills its gauge *while* the carry is
attacking, so the procs land at the same time and disorders arrive roughly twice as fast.

This is what makes Vivian a complete disorder engine for Miyabi despite generating no
polarity at all. It is judged per element on the **best** contributor — one parallel source
is enough, a second does not double it again.

Two off-field agents are parallel with each other, too. The resulting team, where nobody is
actually on field, gets penalised through field-time economy and team structure instead,
which is where that penalty belongs.

**3. Solo polarity generation.** Teammates' `utility.disorders`. Nangong and Yanagi force
disorders with no second anomaly agent required.

A consumer that is not itself an anomaly agent has no reaction of its own, so it reads the
richest stream on the team instead. Disorders land on the *target*, so a bystander benefits
from teammates cycling without it.

## The need is paid once, team-wide

The payment is roughly:

> effective supply × need × a need-fulfilment multiplier × a damping term

Crucially it sits **outside** the per-supplier scoring loop, which explicitly skips the
disorders key. Pricing it per supplier is what the old engine did, and each channel then
computed coverage in ignorance of the other: cycling and polarity each read as 67% of
Miyabi's need of 3, when between them they covered it completely.

## Two curve shapes, and they must not be unified

The consumer's curve and the boss-weakness curve answer different questions and deliberately
have different shapes.

| Curve | Shape | Why |
|----|----|----|
| Consumer supply (`effectiveDisorderSupply`) | Full credit up to the need, then **logarithmic** — unbounded but strictly diminishing | A Deadly Assault fight is capped at 180 seconds, so a thousand disorders cannot all be converted and surplus becomes statistically insignificant. Never exactly zero, though, because extreme play can always squeeze out a little more |
| Boss weakness (`effectiveDisorderWeakSupply`, boss `weak: disorders`) | Full credit to 3 sources, marginal value falling to zero at 5, **hard cap** | The game itself stops paying past 5 sources. A sixth earns nothing |

The consumer's logarithm is scaled by the need, so its slope is exactly 1 at the need and it
joins the linear part smoothly. **Test 102 pins both shapes** and goes red if someone
collapses them into one function.

## Undersupply

Falling short still hurts, through a separate continuous ramp rather than the old flat step:
a floor factor plus the remainder scaled by coverage. It reaches 1.0 exactly at full
coverage, so there is no cliff.

It deliberately does **not** scale as coverage itself. If it did, supply × need × (supply /
need) would collapse to supply², deleting the appetite term entirely — which is the exact
defect the redesign existed to remove.

One corollary worth knowing before anyone retunes this: no damping that reaches 1.0 at full
coverage can make a *larger* unmet need earn *less* than a smaller met one at equal supply.
That ordering is unreachable by design, not by oversight.

## Do not re-derive this

The engine used to hold three independent answers to "does this team cycle disorders" — a
hardcoded `2` at one layer, a boolean at another, and another `+2` inside the boss
`weak: disorders` block — and they disagreed with each other.

All three are gone. The layers that score a consumer share `getDisorderSupply`. The
boss-weakness block uses `getTeamDisorderSupply`, which asks the same question team-wide
(richest single stream, plus total forced polarity) because the boss does not care who
converts the disorders.

## The pull engine keeps its own copy

`pull-engine.js` has a separate disorder-partner check used for gap gating. It must stay
[variant-aware](anomaly-reactions.md) for the same reason the scorer does, or it will gate a
unit out for lacking a partner the scorer is happily scoring.

## Code notes

### [DISO-01] Do not net polarity against cycling supply

A prototype that SUBTRACTED teammate polarity provision from the cycling supply passed all
three test suites and was still wrong: it deleted the cycling credit exactly when a polarity
unit was present, which is backwards. Nangong + Miyabi genuinely produces ether/frost cycling
disorders AND Nangong's polarity disorders on top — the two sources are independent and must
be added, never netted off each other. (This used to be a hardcoded `2` gated on a boolean, so
supply never varied with composition and Miyabi's need of 3 was permanently stuck at 67%
coverage, unreachable by any team.)