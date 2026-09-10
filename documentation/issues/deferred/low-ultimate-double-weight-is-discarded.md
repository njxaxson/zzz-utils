---
id: ENG-011
title: The weight on damage["ultimate:double"] is read as a boolean and discarded
priority: low
area: engine
status: deferred
opened: 2026-09-10
tags: []
---

## Symptom

`damage["ultimate:double"]` says how many extra ultimates a unit fires in a window. The burst
model reads it once and treats it as a flag:

```javascript
ultimate *= 2;   // getMaxBurstWeight
```

So Remielle's `3` and a hypothetical `1` produce the identical burst weight. The number is
authored and then thrown away.

## Why it is deferred rather than fixed

**No unit currently differentiates.** Every declarer means the same thing — one extra ultimate
— so a graded reading would change no score, and there is nothing to calibrate a scale
against. Grading it now would be inventing a curve with no evidence for its shape.

The [frequency axis](../../data-model/damage-and-burst.md) is deliberately separate from
magnitude and must stay that way when this is eventually graded. Frequency belongs in burst
throughput and **nowhere else** — a leak from this key into the provision or need channel once
fabricated an ultimate need for 26 of 60 units.

## What to do when it becomes live

The day a unit ships with a genuinely different ultimate frequency, grade it inside
`getMaxBurstWeight` only.

Deliberately **not** the vehicle for Remielle's second-ultimate cadence. That idea is recorded
as a fallback lever in the anomaly overhaul plan, and it must be gated on a declared
anomaly-driven ultimate rather than on this key — otherwise Pyrois, Yixuan and Ye Shunguong,
who do not care about anomaly buildup at all, would collect a bonus from it.

Found while scoping the anomaly overhaul.
