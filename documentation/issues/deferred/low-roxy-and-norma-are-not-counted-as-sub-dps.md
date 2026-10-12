---
id: PULL-012
title: Roxy and Norma are never counted as sub-DPS
priority: low
area: pull
status: deferred
opened: 2026-10-11
deferred-reason: No reported wrong verdict yet; found while mapping the detectors.
---

## Symptom

Roxy and Norma are stunners with an unconditional `subdps` pseudoRole, but the pull engine's
sub-DPS buckets are keyed on the `anomaly` and `attack` tags, so neither ever lands in one.

## Reproduction

```bash
node pull-debug.js -d -u "Roxy,Norma,Pyrois,Nicole,Anby,Billy"
```

`Attack subdps: [—]`.

## Diagnosis

`analyze()` buckets sub-DPS by tag (`pull-engine.js`, the `ownedSubdps` loop).

## Resolution

-
