# Codependency Gating

Some units are non-functional without specific partners. Recommending one to a roster that
cannot support it is actively bad advice — worse than saying nothing.

Units flagged `scaling.codependent` run a dependency check before they are allowed to surface.
Currently that is **Remielle, SAnby and Ye Shunguong**.

`scaling.codependent` is consumed by the [pull engine](pull-engine.md) only. The scorer ignores
it entirely.

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
