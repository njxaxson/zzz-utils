# The Teamwork Multiplier

The final score is `raw × teamworkMultiplier`, and the multiplier is
`structureFactor × f(cohesion)`.

`f` maps cohesion onto a floored range, so a bad team is crushed but never zeroed.

## Structure factor

Comes from the [L1.5 classification](layers.md). Because L1.5 adds nothing to the raw score, a
structural demotion is a pure multiplier effect.

### The mismatched-support override

A team whose factor is better than unconventional-viable is **downgraded** to it if any
support-like member's buff utilisation falls below half. A conventional shape staffed by a
mismatched support is not really conventional.

**The test is on the factor, not on the tier's identity.** When the no-stunner tiers were
added, a tier sitting between conventional and unconventional-viable slipped through an
identity check — and teams with an ill-fitting support went *up*.

## Cohesion

The other half. See [cohesion](cohesion.md) for what feeds it and why it is a geometric mean.

## What is applied outside the multiplier

The [declared-archetype](../data-model/declared-archetypes.md) `avoid` penalty is applied
**after** the multiplier, deliberately, so a wrong-tool verdict bites the same regardless of how
cohesive the rest of the team is. The two must never charge the same judgement twice.

## Code notes

### [TWM-01] Why SAnby is not double-charged

(This tag used to cover a pseudo-role stat-alignment discount as well. That rule was replaced by
[TWM-03]; its history is in [known pitfalls](../notes/known-pitfalls.md).)

How much a buff whiff costs is a property of the unit's kit (`scaling.buffs`), not
its role tag — support/defense default to 3, stun to 2, DPS to 0, with explicit overrides
(SAnby's 3) winning. A DPS that opts in via an explicit override still takes the lighter DPS
weight (0.5) in the geometric mean; the severity of its whiff is already applied inside
`computeBuffUtilization`, which damps by `scaling.buffs / 3`, so charging it again in the
per-unit weight here would double-count it.

### [TWM-02] Two views of cohesion, so an unmet weight-2 need does not cost the boss matchup

`computeTeamworkMultiplier` returns **two** multipliers. The full view scales the team's own
contribution; the **matchup view** scales L3, and differs only in that it omits the charge for an
unmet need of weight 2. They are identical on any team without one, and the score expression
falls back to the original single-multiplier form when they match, so such a team is bit-for-bit
unchanged rather than drifting by a rounding step.

This completes a gradation that starts at `[SCAL-04]`:

| unmet need | charged against the team's own contribution | charged against the boss matchup |
|----|----|----|
| weight 1 | no | no |
| weight 2 | yes | **no** |
| weight 3 | yes | yes |

Owner's reasoning: starve Miyabi (`disorders: 3`) and you are really hamstringing her, so she
loses her matchup edge too. Starve Alice (`disorders: 2`) and she is missing some power, but the
rest of the team still executes the matchup, so the L3 read stays sound.

**The problem it solves is that a percentage was being levied on a constant.** The multiplier is
applied to the whole raw score, and across the released corpus **70.7%** of that is the flat base
every team receives for existing, with another slice being boss matchup. Alice's 5.5% cohesion
penalty on Stagnant Aberrant cost 30.8 points, of which 9.6 was charged on the flat base and 3.6
on the matchup — 43% levied on terms that cannot express cohesion at all.

The visible symptom was that her margin against Jane Doe **moved between bosses** while her
mechanical advantage did not. Her L4 edge is +28.6 raw on Girtablullu and +28.9 on Aberrant —
flat, correctly. But Aberrant's raw is 44 higher for both teams because L3 is 66 there against 19,
so the same percentage cost her 28.4 on one boss and 30.8 on the other. She cleared Jane by 0.2
on Girtablullu and lost by 1.8 on Aberrant, and none of that 2.0-point swing was about Alice
versus Jane.

**Exempting the flat base as well was measured and rejected.** It fixes every rung and is clearly
wrong: 52,670 rows move, mean **+73**, and **1,679 teams become newly viable**, because a
catastrophic team keeps all 175 points. The engine must retain the ability to crush bad
compositions.

**Exempting L3 for everyone** was also measured: 44,784 rows, symmetric (mean +0.55, because L3
goes negative on hostile matchups), and it breaks a TEST 82 rung by 1.7. The weight-2 version
moves **2,355 rows with zero exceptions** — every mover contains Alice, Ye Shunguong, Banyue or
Yixuan — and leaves the Miyabi ladder untouched, because `disorders: 3` is severe in both views.

Structural charges (no reaction, wasted vortex) count as **severe**: they are failures, not
appetites. And note that 1,408 of the movers go **down** — forgiving the discount makes a *bad*
matchup bite harder too, which is the same rule running in the other direction.

### [TWM-03] An idle pseudo-role caps cohesion — on a neutral carry only

**The game situation.** Nangong is a stunner whose kit is built for anomaly teams. Beside an
anomaly agent she also plays a pseudo-anomaly role. Put her behind Pyrois and she still does a
stunner's whole job — stun window, stun multiplier, recovery debuff — but her buildup buff and
her anomaly half go unused. She is useful, and she is not reaching her potential.

**The rule.** When a non-DPS unit has a DPS pseudo-role that did not activate, its cohesion is
judged on its base role as usual, and then the primary carry's archetype is checked against the
unit's [declared archetypes](../data-model/declared-archetypes.md):

| Verdict on the primary carry | Cohesion | Archetype fit (applied flat, after the multiplier) |
|----|----|----|
| intended | no cap | 0 |
| neutral | capped at `IDLE_PSEUDO_ROLE_CAP` | 0 |
| avoided | no cap | −40 |

The cap is a **ceiling, not a multiplier**. A unit that already scores below it on its base role
is not charged again. The numbers are already telling the truth there.

| Team (Vesper) | Nangong's utilisation | Enters cohesion as | Final (raw) |
|----|----|----|----|
| Nangong / Pyrois / Sunna, before | 1.00, then ×0.65 | 0.42 | 323.3 |
| Nangong / Pyrois / Sunna, after | 1.00, capped 0.85 | 0.72 | 395.1 |
| Dialyn / Pyrois / Sunna (for reference) | — | — | 388.9 |

**Why intended is exempt.** Soukaku also has a pseudo-anomaly role, but it only activates beside
Miyabi. Behind Ellen she is an attack support doing exactly her job. "Pseudo-role not active" is
not the same as "potential wasted", and the declared archetype is what tells the two apart.

**Why avoided is exempt.** An avoided verdict already costs −40, applied flat. Capping cohesion
as well charges the judgement "not built for this carry" twice. Measured: it cost
Lucia/Yidhari/Soukaku about 43 points more than Lucia/Yidhari/Zhao, two supports with identical
declarations, purely because of a pseudo-role that has nothing to do with Yidhari.

#### Why the three verdicts use different mechanisms — an open question

This is the part that looks wrong at first sight. The same declaration produces a cohesion
ceiling in one case and a flat score penalty in another. The current reasons:

* **They answer different questions.** Neutral-plus-idle says "this unit could be doing more".
  That is about how much of the unit's kit lands, which is what cohesion measures. Avoided says
  "this is the wrong tool". That is a verdict on the composition, and the flat penalty was made
  flat on purpose, so it bites the same however cohesive the rest of the team is.
* **The flat penalty only applies to supports in practice.** It was calibrated for
  support-to-carry fit ([ARCH-04]). The cap was built for a stunner with an idle anomaly half, and
  the stunner and the support may genuinely need different treatment.

Neither reason has been tested. It is entirely possible that one mechanism should serve both. See
[the open issue](../issues/open/medium-intended-neutral-avoided-use-different-mechanisms.md).

**What stays unprotected.** Within a single unit, avoided must never come out better than
neutral. Today no unit can be both. Nangong is intended or neutral; Soukaku is intended or
avoided. But a future unit with an idle pseudo-role and both a neutral and an avoided archetype
could invert, because the cap costs a share of the score and the penalty is a fixed 40.
