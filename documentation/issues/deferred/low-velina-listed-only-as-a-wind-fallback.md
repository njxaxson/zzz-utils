---
id: PULL-011
title: The Wind gap lists Severian and never Velina
priority: low
area: pull
status: deferred
opened: 2026-10-11
tags: [GAP-01]
deferred-reason: Velina's verdict no longer depends on it; changing candidate order touches every element gap.
---

## Symptom

On a roster with no wind unit, the Wind DPS gap lists Severian alone. Velina, who is worth far
more on most rosters, is left out.

## Reproduction

```bash
node pull-debug.js -d -30 -q "?roster=eJwFwUEOgCAMBMAPrY_aQIOV2poKBwyPd4apRDGmDFx0OWoInN7CG56VoS-St4ph0dkUa37z5O5hUglbheFw6XFzEKnO_QN01CDj"
```

`element-wind → Severian (upcoming)`.

## Diagnosis

`detectElementGaps` considers sub-DPS candidates only when no primary DPS of the element exists.

## Resolution

-
