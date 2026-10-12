---
id: PULL-010
title: Grace at T1.5 counts as a sufficient anomaly sub-DPS and disorder partner
priority: low
area: pull
status: deferred
opened: 2026-10-11
tags: [GAP-02]
deferred-reason: A threshold question, not a defect; Velina reaches High through the banner-T0 rule either way.
---

## Symptom

On an anomaly roster holding Aria, Jane Doe, Yanagi and Grace, neither the anomaly sub-DPS gap nor
the reaction-partner gap fires. Grace is T1.5, which `tierToQuality` maps to 40, and both gates
treat 40 as enough (`anomSubdpsQuality < 40`, `PARTNER_QUALITY_THRESHOLD = 40`). Her own
description says she is only good at P6 beside Velina.

## Reproduction

```bash
node pull-debug.js -d -30 -u "Aria,Jane Doe,Yanagi,Grace,Nangong,Yuzuha,Nicole,Anby,Billy"
```

No `subdps-anomaly` or `anomaly-partner` gap is listed.

## Diagnosis

Both detectors ask "is the slot filled at all?", not "how much better is the candidate?".

## Resolution

-
