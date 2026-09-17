# Coverage and Gap Detection

Before the [pull engine](pull-engine.md) can say what you are missing, it has to say what you
have.

## Coverage

Owned units are bucketed by carry archetype, sub-DPS, support, stunner, and element.

Each bucket's quality is derived from its **best tier**, labelled descending:

> Elite → Strong → Decent → Borderline → Weak → Marginal → None

A composite score averages the archetype, support and stunner qualities. That composite drives a
**calibration factor** which compresses gap scores for a well-developed roster — so a player who
owns everything is not told they have five urgent gaps.

### Only primary carries count

Sub-DPS units are filtered out of archetype and element quality. Owning Vivian does not mean you
have an ether anomaly carry.

## Gap detectors

Each detector emits a gap with a title, a reason, a score and a candidate list drawn from
unowned limited S-ranks.

| Detector | Looks for |
|----|----|
| DPS by archetype | A missing or weak carry in one of the four archetypes |
| Support | A missing or weak support |
| Stunner (premium and depth) | Both quality and quantity |
| Stunner element | A stunner of an element the roster lacks |
| Sub-DPS | — |
| Anomaly partner | A partner to complete [reactions](../concepts/anomaly-reactions.md) |
| Element coverage | An element with no carry |
| Named synergies | `synergy.units` relationships the roster can nearly complete |
| Mechanical synergies | Fit found through [`mechanicsFitScore`](mechanics-fit-score.md) |
| Depth | Fires for **titled T0 candidates regardless of archetype quality** |

That last one deserves the emphasis. It recognises paradigm-shift units that create entirely new
archetypes — a unit that is worth pulling even though you already have a good carry in its
archetype, because it changes what teams are possible.

## Its own disorder-partner check

The pull engine keeps a separate disorder-partner check for gap gating rather than sharing the
scorer's. It must stay
[variant-aware](../concepts/anomaly-reactions.md) for the same reason the scorer is, or it will
gate a unit out for lacking a partner the scorer is happily scoring.

## A known gap in the detectors

**No armorer sub-DPS exists yet.** `pull-engine.js` carries a TODO for the bucket and the
detector that will be needed when one ships. Until then an armorer sub-DPS would simply not be
bucketed.

## Code notes

### [GAP-01] An element with only a sub-DPS is not an element with nothing

Element quality counts primary carries only, so a roster holding Velina — a T0 wind anomaly
sub-DPS — reports wind quality 0, the same number a roster with no wind unit at all reports.
The gap itself is real (there is no wind carry to lead a team) but the reason line said "You
have no DPS options for Wind content", which the player can see is false.

The element detector now distinguishes the two zeroes the same way `detectDPSGaps` already did
for archetypes, and says "You have Wind sub-DPS agents but no primary Wind DPS to lead your
teams". The score is unchanged: the missing carry is the same size of gap either way.

The roster assessment summary still folds this into "lacks Wind element coverage". That is a
statement about carries and is left as is.
