---
id: PULL-009
title: The partner ladder is a fitted stopgap; the pull engine still never asks the scorer
priority: medium
area: pull
status: deferred
opened: 2026-09-03
deferred-reason: Too complex, too close to a release; and the current solution is theoretically capable of being generic enough for future growth.
---

## Symptom

The pull engine cannot tell how good a candidate's resulting teams would be, because it never
calls the scorer. It reasons about scaling keys, role coverage and codependency.

For Remielle that was visible and wrong: owning Velina or not decides her ceiling, and Velina
changes none of those three things on an anomaly-heavy roster.

## Reproduction

```bash
node test-recommendations.mjs -43
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
