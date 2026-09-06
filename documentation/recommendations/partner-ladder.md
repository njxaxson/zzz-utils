# The partner ladder

**This is a release stopgap, and it is fitted rather than derived.** Read this page before
touching any of its numbers.

## The problem, concretely

You don’t own Remielle. Should the engine tell you to pull her?

It depends almost entirely on one other unit. Remielle only works inside a
[triple-anomaly](../archetypes/triple-anomaly.md) team, and how good that team is comes down to
who she is paired with:

| Your roster has | Remielle is |
|----|----|
| Velina | worth chasing |
| Vivian | a solid second |
| Burnice | a fallback |
| none of the three | not worth recommending at all — there is no sub-DPS base to build on |

The engine could not tell those four rosters apart. It reasons about scaling keys, role coverage
and codependency, and **Velina changes none of them** on a roster that is already anomaly-heavy.
So Remielle rated identically whether or not you owned the one unit that decides her ceiling.
Recommendations TEST 43 pins this.

The ladder is a cheap proxy for asking the scorer how good the resulting teams actually are. It
still [never calls the scorer](pull-engine.md).

## Scoring a partner

Three declared-data terms, nothing measured:

> `tierToQuality(tier)` + 25 if the two units name each other in `synergy.units` + 10 if the
> partner's `subdps` pseudoRole is unconditional

Over the five anomaly sub-DPS that exist today:

| Partner | Tier | Base | Mutual pair | Unconditional sub-DPS | Score |
|----|----|----|----|----|----|
| Velina | T0 | 95 | +25 | +10 | **130** |
| Vivian | T1 | 55 | — | +10 | **65** |
| Burnice | T1 | 55 | — | — | **55** |
| Yanagi | T1.5 | 40 | — | — | **40** |
| Grace | T1.5 | 40 | — | — | **40** |

## Rungs

| Score | Rung |
|----|----|
| 100 and up | High |
| 60–99 | Medium |
| 50–59 | Low |
| below 50 | no recommendation at all |

The cutoffs are not knife-edge against today's five units, but they were fitted to that
ordering. A sixth anomaly sub-DPS could land anywhere and should be re-checked by hand rather
than trusted.

## Who counts as a partner

Only **sub-DPS bases** — a unit tagged with the wanted role *and* declaring a `subdps`
pseudoRole. Carries are deliberately not enablers.

That is why Aria does not qualify even though she and Remielle are a declared mutual synergy
pair, and why Miyabi does not either. Pairing Remielle with another carry still leaves the team
without a base to build around, which is exactly the case the ladder is meant to catch.

## The third-slot check

A pair is only two thirds of a team, and Remielle is lumen — she starts no reaction herself. So
whatever the pair lives on needs a third body of a *different* element to fire:

* Vivian beside only Aria is ether on ether, and disorders nothing.
* Velina beside another wind agent triggers no vortex.

When no other owned agent brings a different disorder element, the pair is worth one rung less
than it looks and the rung is demoted.

This counts **native** tag holders only. A pseudo-anomaly unit such as Nangong supplies procs but
does not fill one of the three anomaly slots — the same convention the conditional-buff check
already uses.

## What the player sees

| Situation | The note |
|----|----|
| No eligible partner owned | *Your roster has no sub-DPS to build a team around — pull Velina or Vivian first* |
| Partner owned but third slot blocked | *Your Velina is the right partner, but every other agent who could fill the third slot shares her element — nothing for her to react with* |
| Partner owned, a better one exists | *Works with your Vivian, but reaches full potential with Velina* |

## It replaces codependency gating, it does not stack

A unit with a ladder does **not** also take the generic
[codependency](codependency-gating.md) drop. Both answer the same question — can this roster
actually run this unit — and the ladder is the better-informed answer, so charging twice would
double-count.

The two also behave differently: codependency *drops* a priority by one or two levels, while the
ladder *caps* it at the rung. A rung of `null` removes the unit from gap results entirely.

## Who grows a ladder

Only a codependent unit that declares a team-scoped conditional buff keyed on `countTag` — the
data's own way of saying "I need N teammates of a kind".

**Remielle is the only unit that matches today.** SAnby declares no conditional buff, and Ye
Shunguong declares no buffs at all, so neither grows one.

## What stays broken

* **The numbers are fitted to a stated preference, not derived from anything.** They reproduce
  one ordering over five units. They are not a model of partner quality.
* **The honest fix is still outstanding.** It is for the pull engine to ask the scorer how good
  a candidate's best achievable team is with and without the candidate. That is a feature, and
  it would be the first thing to make the two engines share a model rather than a vocabulary.
* **A** `synergy.units` annotation was tried instead and rejected. It did not move the
  recommendation at all, and in the scorer it lifted `Promeia/Remielle/Velina` by 80 points as a
  side effect. Do not reach for it again without measuring both halves.

## Related

* [Pull engine](pull-engine.md) — the flow this sits in
* [Codependency gating](codependency-gating.md) — the mechanism it replaces for laddered units
* [Cards and priority](cards-and-priority.md) — what the rung caps
* [Triple anomaly](../archetypes/triple-anomaly.md) — the team shape this is all about


