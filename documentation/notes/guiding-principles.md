# Guiding principles

The rules this engine is actually built on. Each one was paid for at least once. Where a
principle has a scar attached, the scar is in [known-pitfalls.md](known-pitfalls.md).

---

## Scoring is emergent, not template-matching

A team's score comes out of the mechanics its members declare — who buffs what, who needs
what, which elements react. There is no list of "good teams" anywhere in the engine, and a
team nobody has thought of is scored by the same rules as a famous one.

The one deliberate exception is `mechanics.archetypes`, where a support declares in the data
which carry archetypes it suits (`intended`) and which it is the wrong tool for (`avoid`).
Eight attempts to *derive* that from a support's buff list failed, because a ratio over a
unit's own kit cannot tell "wrong tool" from "narrow but right". So it is declared. See
[../engine/cohesion.md](../engine/cohesion.md) and
[lessons-learned.md](lessons-learned.md#archetypes-had-to-be-declared).

Everything else that had to be hand-encoded — Lycaon's cohesion exemption, the
Remielle/Velina pair, the Trigger/SAnby/Seed group — is a debt, not a pattern. Each is named
in [adjudications.md](adjudications.md) with the reason it was allowed.

## A green suite is not evidence. A prediction with zero exceptions is

The suites went green through every one of the largest defects in this engine's history. The
disorder model paid a flat 28.0 to every team that generated any disorder at all, and all
three suites passed. A prototype that subtracted a teammate's disorder provision from the
team's cycling supply — exactly backwards — also passed all three.

So the working loop is: write down which teams are allowed to move **before** the change,
then make `score-delta.mjs` list the exceptions. Zero exceptions is the result you are
after. Details in [../tooling/measuring-a-change.md](../tooling/measuring-a-change.md) and the CLAUDE.md
verification loop.

A corollary that has bitten twice: a failed prediction proves the *prediction* wrong, not
necessarily the behaviour. Check which one is broken before reaching for the code.

## Never predict by tag when the code reads roles

A unit's `tags` and its effective roles are different things, and every gate in the scorer
reads the second. Predicting by tag has failed twice with hundreds of exceptions each time,
and once more inside a verification script. Enumerate both directions: units with the tag and
a contradicting pseudo-role, and units with the pseudo-role and a contradicting tag.

## Rarity is not importance

Almost every support buffs ATK. That does not make an ATK buff unimportant — it makes it the
*baseline*, the thing whose absence is a disaster and whose presence discriminates nothing.
When you are choosing between two supports you compare their unusual buffs; when you are
asking whether a support is doing its job at all you look at the baseline.

The flagship test asks the second question, and for a while used a heuristic built for the
first (largest offering by damage weight). Soukaku's `atk: 3` lost the flagship band to her
`ice: 3` by 0.03 of weighted damage, and she was penalised on a team her ATK buff lands on
perfectly.

## Waste is free; mismatch is charged once

A support who brings five buffs of which one lands is not thereby worse than a support who
brings one buff that lands. Charging the ratio means the engine rewards *deleting* a buff
that misses, which is absurd and is inherent to ratios rather than a calibration miss.

So delivery has no denominator, and the only thing charged is identity: did this unit's
defining offering reach an actual carry? See
[known-pitfalls.md](known-pitfalls.md#the-fiona-and-marissa-cases--a-ratio-always-rewards-deleting-a-buff).

## Cohesion multiplies the whole team, and that is opportunity cost

One badly matched member drags the team down multiplicatively rather than being averaged
away. A team slot is scarce: a member who contributes nothing does not merely fail to help,
they make the team bad, because someone else could have had the slot.

Deleting the multiplier has been proposed and is wrong — it would make every
carry-plus-carry-plus-passenger team score fine.

## Favour correct ordering over margins

Owner's standing position, from the Koleda chain-buff work. When a test's margin and a
ranking pull against the same dial, the margin gives way — provided the margin was never a
calibrated figure in the first place. "Dialyn is comfortably ahead of a low-tier stunner" is
just as true at 15 points as at 20; a wrong ranking row is not true at all.

## Never give a unit a need it did not declare

A manufactured baseline looks harmless — "everyone wants ultimates a bit" is even true — but
it puts units into machinery built for units that opted in. Once Evelyn had a fabricated
ultimate need of 1, she collected need-fulfilment credit she should never have had, *and*
became eligible for the undersupply discount on a need she never declared.

If a value is worth giving to everyone, price it in a channel that applies to everyone.

## Scores are comparable only within one matchup

Different bosses contribute wildly different weakness, shill, assist and anti credit. A team
peaking at 590 on one boss and another peaking at 579 on a different boss compare nothing.
Four tests once ranked teams by their best score across all bosses; every conclusion drawn
from them was unsafe and had to be withdrawn.

`compositions.js` still shows a cross-boss peak view. It is a browsing aid. Do not conclude
from it.

## Raw and calibrated are two different scales

The engine returns raw scores and knows nothing about calibration. `calibrated = raw ×
factor[archetype]` is applied at the boundary, for tools that compare archetypes against each
other. Every score in the historical record is raw. See
[../engine/calibration.md](../engine/calibration.md).

## When the engine confidently disagrees with intuition, test it in play first

`Nangong/Yixuan/Sunna` was treated as the engine's bane for weeks, and an override was added
specifically to suppress the engine's own answer. Then the owner played the team and it was
excellent. The override came back out.

Archetype avoids are for units that are genuinely the wrong tool, not for teams that merely
look unconventional. Full story in
[lessons-learned.md](lessons-learned.md#the-team-that-was-supposed-to-be-the-bane).
