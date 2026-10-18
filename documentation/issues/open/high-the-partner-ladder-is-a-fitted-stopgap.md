---
id: PULL-009
title: The partner ladder is a fitted stopgap; the pull engine still never asks the scorer
priority: high
area: pull
status: open
opened: 2026-09-03
---

## Symptom

The pull engine cannot tell how good a candidate's resulting teams would be, because it never
calls the scorer. It reasons about scaling keys, role coverage and codependency.

For Remielle that was visible and wrong: owning Velina or not decides her ceiling, and Velina
changes none of those three things on an anomaly-heavy roster.

## Reproduction

```bash
node test-recommendations.mjs -41
```

The test passes. It passes because a proxy was built, not because the blindness was cured.

## Diagnosis

[The partner ladder](../../recommendations/partner-ladder.md) shipped as a release stopgap. Its
own header says it is *fitted, not derived*: the numbers reproduce one stated ordering over the
five anomaly sub-DPS that exist, and nothing more.

Two known limits:

* A sixth anomaly sub-DPS could land anywhere on the ladder and must be re-checked by hand.
* Only Remielle grows a ladder at all. Any future codependent unit whose ceiling hangs on one
  partner gets no such treatment unless it happens to declare a `countTag` conditional buff.

## Resolution

Open. The honest fix is for the pull engine to ask the scorer for a candidate's best achievable
team on the current roster, with and without the candidate.

That is a feature rather than a repair, and it would be the first thing to make the two engines
share a **model** rather than share a vocabulary.

**Do not** reach for a `synergy.units` annotation instead. It was measured: it does not move the
recommendation at all, and it lifts `Promeia/Remielle/Velina` by 80 points in the scorer as a
side effect.

**2026-10-11.** The fitted cutoffs are gone: the ladder is now the owner's triple-anomaly table
([PULL-01](../../recommendations/partner-ladder.md)), so the "sixth sub-DPS could land anywhere"
limit no longer applies. The pull engine still never asks the scorer.

A scorer-driven redesign was proposed during the Velina fix and rejected by the owner on
**scaling**: scoring every legal team against every boss, per candidate, is about 5–8 s today
(~134 µs per score, 19 bosses) and grows with bosses × agents — 40 bosses and 150 agents is not
sensible. Deadly Assault can afford it because it is narrowed to three bosses. Any develop-branch
redesign must stay at mechanics level or narrow the boss set; brute-force scoring is not the fix.

**2026-10-18. A mechanics-level route now exists in part; raised to high.** Phoenix hit this
issue's second limit: a codependent unit whose ceiling hangs on specific partners (Velina or
Remielle) but who declares no `countTag` conditional, so she got no ladder and her flag was inert.
She now declares `scaling.codependent` as a `{ cases }` spec, which the pull engine resolves
against the best legal team the roster can field ([CODEP-03](../../recommendations/codependency-gating.md#codep-03-a-declared-partner-requirement-is-read-by-the-pull-engine-only)).
That is mechanics-level and scales, so it fits the constraint above.

Could the same form replace Remielle's ladder? In principle yes, but four things are missing:

1. **Rank.** Low vs Medium hinges on "only via an A-rank (Piper)". No predicate reads `rank`
   (e.g. a `minRank` qualifier on `countTag`/`hasRole`).
2. **A reacting pair.** The third-slot check is "the other two bodies bring different elements,
   wind always differs". `othersDisorder` is close but excludes wind, so it answers a different
   question.
3. **Value → verdict.** The ladder *caps* priority at a rung, removes at no rung, and gives a card
   off-banner (`detectLadderTeam`). The declared form only drops one rank. Unifying them means
   deciding what each case value means (explicit rung values via `resolveConditionalRaw`, say) and
   moving card generation off `ladderCountTag`.
4. **Card text.** Recommendations TESTs 41 and 49, and the partner-ladder tests, pin the
   "completes a triple-anomaly team with your X and Y" / "share an element" / "reaches full
   potential with Velina" sentences, which would then have to be derived from the spec.

One structural improvement the migration would bring: the declared form evaluates **legal teams**,
whereas the ladder scans the roster. Phoenix's spec was deliberately left as a simple drop-one form,
so it doesn't pre-commit the rung semantics that this migration should decide.
