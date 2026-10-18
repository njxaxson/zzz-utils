# The partner ladder

## The problem, concretely

You don’t own Remielle. Should the engine tell you to pull her?

It depends almost entirely on whether you can build the team she needs. Remielle only works
inside a [triple-anomaly](../archetypes/triple-anomaly.md) team, so the question is whether your
roster supplies the other two anomaly agents, and how good they are.

## The rule

This is the owner's stated table, implemented directly. It replaced the fitted partner-score
cutoffs that used to live here.

| Your roster has | Remielle is |
|----|----|
| Fewer than two other anomaly agents | not recommended at all |
| Two others, but only by counting an A-rank (Piper) | Low |
| Two other S-rank anomaly agents, but no Velina | Medium |
| Velina and another S-rank anomaly agent | High |

**It does not matter whether she is on a banner.** The rung *is* her verdict: it lifts her
priority to the rung and caps it there. A Medium or Low may still fall out of the visible list
when the roster has more pressing needs; the banner tile shows the verdict either way.

"Velina" is read from data, not named: a **ceiling partner** is a sub-DPS of the needed kind
whose partner score (`tierToQuality(tier)`, +25 for a declared mutual `synergy.units` pair, +10
for an unconditional `subdps` pseudoRole) reaches 100. Today that is Velina alone (T0,
unconditional sub-DPS: 105).

Any agent tagged with the needed kind counts as a body — carries included. Aria and Jane Doe
together are two S-rank anomaly agents, so they put Remielle at Medium.

## The third-slot check

Remielle is lumen and starts no reaction herself, so the two bodies beside her must bring two
different elements (a wind body always differs, through vortex). Each rung looks for its best
pair of different elements; a roster whose anomaly agents all share one element can field the
team but nothing reacts, and is demoted to Low with a note saying so.

This counts **native** tag holders only. A pseudo-anomaly unit such as Nangong supplies procs but
does not fill one of the three anomaly slots — the same convention the conditional-buff check
already uses.

## What the player sees

| Situation | What appears |
|----|----|
| A rung | A card titled *Remielle: Triple-Anomaly Team* — "Remielle completes a triple-anomaly team with your X and Y" |
| No rung | No card; she is removed from every list |
| Both bodies share an element | *Your X and Y share an element — nothing for them to react with* |
| Below High, a ceiling partner exists | *Works with your X, but reaches full potential with Velina* |

## It replaces codependency gating, it does not stack

A unit with a ladder does **not** also take the generic
[codependency](codependency-gating.md) drop. Both answer the same question — can this roster
actually run this unit — and the ladder is the better-informed answer, so charging twice would
double-count.

## Who grows a ladder

Only a codependent unit that declares a team-scoped conditional buff keyed on `countTag` — the
data's own way of saying "I need N teammates of a kind". The count it needs comes from the
highest `minCount` in that buff.

**Remielle is the only unit that matches today.** SAnby declares no conditional buff, and Ye
Shunguong declares no buffs at all, so neither grows one.

## What stays broken

* **The pull engine still never asks the scorer** how good the resulting team is. The table is
  the owner's judgement of team quality, not a measurement of it. See
  [PULL-009](../issues/open/high-the-partner-ladder-is-a-fitted-stopgap.md).
* **A `synergy.units` annotation** was tried for this once and rejected: it did not move the
  recommendation, and in the scorer it lifted `Promeia/Remielle/Velina` by 80 points as a side
  effect. Do not reach for it again without measuring both halves.

## Related

* [Pull engine](pull-engine.md) — the flow this sits in
* [Codependency gating](codependency-gating.md) — the mechanism it replaces for laddered units
* [Cards and priority](cards-and-priority.md) — where the rung becomes the verdict
* [Triple anomaly](../archetypes/triple-anomaly.md) — the team shape this is all about

## Code notes

### [PULL-01] The partner ladder block in `pull-engine.js`

`getPartnerLadder`, `ladderCountTag`, `detectLadderTeam` and the `LADDER_*` constants are this
page in code: the owner's table, the ceiling-partner score, the third-slot check, and the card
that gives a laddered unit a verdict whether or not it is on a banner.

The table replaced a fitted score ladder (cutoffs 100/60/50 over five sub-DPS) whose only path
to a verdict was the titled-T0 "Anomaly Depth" card — a card that claimed Remielle added carry
depth. With that card gone ([GAP-03](coverage-and-gaps.md)), the old ladder could only cap a
priority she no longer had, and she read Low on every roster.
