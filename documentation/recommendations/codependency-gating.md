# Codependency Gating

Some units are non-functional without specific partners. Recommending one to a roster that
cannot support it is actively bad advice — worse than saying nothing.

Units flagged `scaling.codependent` run a dependency check before they are allowed to surface.
Currently that is **Remielle, SAnby and Ye Shunguong**.

**Both engines read `scaling.codependent`, and they use it differently.** The pull engine uses it
as a *gate* — the checks on this page decide whether a unit may be recommended at all. The scorer
uses it as a *discount*: `codependencyFulfilment` and `codependencyFactor` in `team-scorer.js`
scale down what a codependent unit is worth, and what the team pours into it, when its
composition need is unmet. See [CODEP-01](#codep-01-the-scorer-reads-scalingcodependent-as-a-discount-not-a-gate).

One codependent unit is handled differently. Remielle grows a
[partner ladder](partner-ladder.md), which supersedes everything on this page for her — the two
answer the same question and charging both would double-count.

## The four checks

**1. Specialist provider check.** Does the roster contain a provider for each specialist
[`scaling`](../data-model/scaling.md) key?

Skipped, so they never trigger a false dependency:

* Naturally available keys — `chains`, `ultimates` (see
  [the two-channel model](../engine/ultimates-two-channel.md))
* Foundational stats
* The `buffs` meta-flag

**2. Conditional buff feasibility.** For team-scoped conditional buffs, compute the best level
achievable given the roster. At or below half the maximum, the unit cannot function as designed.

**3. Disorder feasibility.** A unit with `scaling.disorders` needs a different-base-element,
non-wind anomaly or pseudo-anomaly partner. See
[disorder supply](../concepts/disorder-supply.md).

**4. Team formation.** Can at least one legal three-person team be built at all? See
[join](../concepts/additional-abilities-join.md).

## Severity determines the consequence

| Finding | Consequence |
|----|----|
| Cannot form a team, or cannot activate buffs | The unit is **removed from every gap candidate list entirely** |
| Partial activation | The recommendation drops one priority rank, with a note naming the missing providers |

Removal rather than deprioritisation is the right answer for the hard cases, because the gap's
*reasoning* would not apply. Telling a player that Remielle fills their anomaly gap is wrong if
they own nobody who can proc anomalies for her — she would not fill it.

## Code notes

### [CODEP-01] The scorer reads scaling.codependent as a discount, not a gate

An earlier version of this page said the scorer ignored `scaling.codependent` entirely. That was
wrong — `codependencyFulfilment` reads it directly and `codependencyFactor` is applied in three
places: a unit's tier credit, what a codependent *supplier* is worth, and what the team pours
into a codependent *consumer*.

What the scorer does: `scaling.codependent` says a unit's worth depends on the team meeting its
composition needs. The pull engine has always honoured that — it is why Remielle drops off a
roster with no anomaly agents — but the scorer used to charge the shortfall on only the ONE
conditional buff, through the per-buff underutilization penalty, and went on paying the unit as
a full body for everything else.

Remielle needs THREE anomaly-tagged bodies. On Nangong/Miyabi/Remielle there are two — Nangong
reaches anomaly through a pseudo-role, which her `countTag: "anomaly"` condition rightly does
not count — so her ATK buff resolved to 2 of 4 and her kit did not come together. She was
scoring 539 there against 201 for the same team with Lucy in the slot. Owner: "Rem's value
CRASHES when she isn't on triple-anomaly."

`codependencyFulfilment`/`codependencyFactor` fix this: fulfilment is read off the unit's own
team-scoped conditionals (no new annotation, no per-unit special case), and `codependencyFactor`
scales the unit's whole contribution toward a floor rather than gating it to zero — Remielle off
triple-anomaly still keeps her double ultimate, aftershock and luminize. A codependent unit with
no conditional buff (Ye Shunguong) reads 1 and is untouched.
