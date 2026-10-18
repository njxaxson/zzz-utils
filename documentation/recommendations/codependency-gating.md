# Codependency Gating

Some units are non-functional without specific partners. Recommending one to a roster that
cannot support it is actively bad advice — worse than saying nothing.

Units flagged `scaling.codependent` run a dependency check before they are allowed to surface.
Currently that is **Remielle, SAnby, Ye Shunguong and Phoenix**.

**Both engines read `scaling.codependent`, and they use it differently.** The pull engine uses it
as a *gate* — the checks on this page decide whether a unit may be recommended at all. The scorer
uses it as a *discount*: `codependencyFulfilment` and `codependencyFactor` in `team-scorer.js`
scale down what a codependent unit is worth, and what the team pours into it, when its
composition need is unmet. See [CODEP-01](#codep-01-the-scorer-reads-scalingcodependent-as-a-discount-not-a-gate).

One codependent unit is handled differently. Remielle grows a
[partner ladder](partner-ladder.md), which supersedes everything on this page for her — the two
answer the same question and charging both would double-count.

## The five checks

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

**5. Declared partner requirement.** When `scaling.codependent` is a `{ cases }` spec rather than
`true`, it is resolved against every legal team the roster can field with the unit, and the best
team counts. Below the spec's maximum is a **partial** finding — one rank down, with a note naming
the units that would complete it — never removal. Phoenix is the first user: she wants a wind or
lumen anomaly teammate (Velina or Remielle today). See
[CODEP-03](#codep-03-a-declared-partner-requirement-is-read-by-the-pull-engine-only).

## Severity determines the consequence

| Finding | Consequence |
|----|----|
| Cannot form a team, or cannot activate buffs | The unit is **removed from every gap candidate list entirely** |
| Partial activation, or a declared partner requirement unmet | The recommendation drops one priority rank, with a note naming the missing providers |

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

### [CODEP-02] `anomalyProcSupply` mirrors team-scorer's anomaly-quantity rule, not `buffs.buildup`

The pull engine's step-1 check (above) needs its own arithmetic for the `anomaly` scaling key,
because it is supplied by bodies additively across the team rather than by one unit clearing a
threshold. `anomalyProcSupply` counts every non-lumen agent whose effective role includes anomaly
as one body (a lumen agent fills no gauge, not even for itself), plus any
`utility["anomaly:<element>"]` proc surplus — Alice's polarity assaults, the only holder today.

Earlier code searched for `buffs.buildup` instead — a real but different mechanic (an anomaly
*damage* buff) — so it found no providers and printed a note with no names in it.

This count is deliberately looser than the [partner ladder](partner-ladder.md)'s three-native-slot
count: a pseudo-anomaly unit like Nangong supplies procs here without filling one of Remielle's
three anomaly slots.

### [CODEP-03] A declared partner requirement is read by the pull engine only

Phoenix's damage collapses without Velina or Remielle, but nothing in her kit told the pull
engine. Her only scaling key is `am` (a foundational stat, skipped by check 1) and she has no
conditional buff (so check 2 and the [partner ladder](partner-ladder.md) pass her by). Her flag
was inert: the same priority whether or not you owned either partner.

So `scaling.codependent` may be a conditional spec. The cases list gives OR for free, and the
partners are written as kinds rather than ids (`[PRED-03]`):

```json
"codependent": { "cases": [
    { "when": { "hasUnit": "anomaly:wind" }, "value": 1 },
    { "when": { "hasUnit": "anomaly:lumen" }, "value": 1 },
    { "value": 0 }
] }
```

**Pull engine only, deliberately.** The scorer already derives Phoenix's dependence mechanically —
vortex with Velina, Refringe with Remielle: `Phoenix/Remielle/Velina` 570.0,
`Phoenix/Velina/Yuzuha` 497.3, `Phoenix/Remielle/Burnice` 346.0 on Girtablullu. Discounting her
again through `[CODEP-01]` would charge the same shortfall twice. The pull engine needs the
declaration because it never asks the scorer
([PULL-009](../issues/open/high-the-partner-ladder-is-a-fitted-stopgap.md)). Every scorer
reader of `codependent` tests truthiness only, so the spec reads as `true` there, and
`codependencyFulfilment` still takes its answer from her buffs. Measured: 0 corpus rows moved.

**Read off legal teams, not the roster.** The question is whether you can *field* her with a
partner, so the spec resolves against the teams check 4 already builds.

**A trap for any future scorer reader.** `hasUnit: "anomaly:lumen"` reads `getElement`, which
returns the morph target inside a scorer pass. The pull engine evaluates raw units, where nothing
is morphed, so it is correct here; a scorer reading this spec would see a morphed Remielle stop
matching.

Owner's ruling: either partner is no penalty; neither is one rank down, never removal.
Recommendations TEST 53 compares all four rosters against a clone of Phoenix with the declaration
stripped, so it measures this check rather than a rank the priority budget `[PULL-08]` could move.
