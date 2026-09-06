---
id: SCORE-141
title: Greed value-scaling cannot be tested on today's roster
priority: low
area: scoring
status: deferred
opened: 2026-09-04
deferred-reason: No fixture can distinguish scaling from a flat charge until a greedy-2 unit exists. Nothing to fix; revisit when the data changes.
tags: []
---

## Symptom

Burst window contention charges per unit squeezed out of the stun window, and the charge is
meant to scale with how greedy the squeezed-out unit is.

It cannot be shown to. Every unit that actually contends is annotated `greedy: 3` — Evelyn,
Miyabi, Remielle and Yixuan — so every clash is 3 against 3. The remaining five are annotated
`1` and do not contend.

A flat charge and a value-scaled charge produce identical output on the whole corpus.

## Reproduction

```bash
node matchups.js -b pompey -t remielle/miyabi/astra -o --debug
```

## Diagnosis

Not a defect. The mechanism is written to scale, the roster does not exercise it, and no test
can pin behaviour the data cannot produce.

## Resolution

Deferred. It becomes testable the moment a `greedy: 2` unit ships — at that point write the
fixture that separates the two shapes before touching the constant.

See [`scaling.greedy`](../../data-model/scaling.md#scalinggreedy--burst-window-contention).
