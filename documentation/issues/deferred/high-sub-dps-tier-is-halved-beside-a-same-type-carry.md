---
id: SCORE-016
title: Sub-DPS tier is halved a second time beside a same-type carry
priority: high
area: scoring
status: deferred
opened: 2026-09-03
deferred-reason: Will have a severe blast radius and current engine results are sufficiently correct. Not worth the risk so close to a release.
---

## Symptom

Velina is rated as roughly half a primary carry when she sits beside one. She is not half a
carry — she is a fully dedicated anomaly sub-DPS, and her whole value is making Remielle work.

This is why the Miyabi lines outranked the Velina track until that ordering was corrected by
declaring the relationship instead of by fixing the valuation.

## Reproduction

```bash
node matchups.js -b butcher -t aria/velina/remielle -o --debug
```

## Diagnosis

A double count. A unit's tier **already** prices the fact that it plays sub-DPS. Halving it
again charges for the same thing twice.

**Do not confuse this with the `isForcedSecondaryDPS` halving**, which is a real role-collision
charge and is correct. Two attack carries who cannot both hold the field should be penalised;
a sub-DPS doing exactly the job its tier was set for should not.

## Resolution

Open. Deliberately **post-release** — the blast radius is wide, since the halving touches every
team containing a sub-DPS beside a carry, and the current ordering is held in place by declared
relationships that would all need re-checking.

Related: [the partner ladder](medium-the-partner-ladder-is-a-fitted-stopgap.md) exists partly
because the pull engine inherits the same blindness from a different direction.
