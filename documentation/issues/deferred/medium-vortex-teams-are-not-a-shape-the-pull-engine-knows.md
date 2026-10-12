---
id: PULL-013
title: Vortex teams are not a team shape the pull engine can recommend toward
priority: medium
area: pull
status: deferred
opened: 2026-10-11
tags: [GAP-02]
deferred-reason: A model addition, not a hotfix; the banner-T0 rule covers today's case (Velina).
---

## Symptom

The partner checks only ask whether your anomaly carries can trigger a reaction. A strong
disorder partner (Grace beside Aria) closes them, although a wind partner builds a different and
usually better team. So the engine cannot say "you have disorder teams but no vortex team".

## Reproduction

```bash
node pull-debug.js -d -30 -u "Aria,Jane Doe,Grace,Nangong,Yuzuha,Nicole,Anby,Billy"
```

Velina appears only through the banner-T0 entry, never through a partner gap.

## Diagnosis

[GAP-02](../../recommendations/coverage-and-gaps.md#gap-02-a-reaction-partner-must-be-able-to-react)
treats disorder and vortex as one need.

## Resolution

-
