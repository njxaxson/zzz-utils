---
id: ENG-010
title: utility.kaleidoscope is read only by the UI, never by the engine
priority: low
area: engine
status: deferred
opened: 2026-09-10
tags: []
---

## Symptom

Kaleidoscope should let a carry avoid hitting an element the boss resists — it belongs in the
weakness and resistance calculation. It is not there.

`utility.kaleidoscope` is read in exactly one place in the repo:

```
app/public/lib/pages/character-summary.js   // displays "Kaleidoscope" on the character card
```

Nothing in `team-scorer.js` or `pull-engine.js` reads it. Yuzuha is the only unit that declares
it.

## Why it is deferred rather than fixed

**No fixture could tell whether a fix worked.** The behaviour only matters for a *damage
dealer* whose element is resisted, and the only unit with the annotation is a support. Element
resistance disqualifies damage dealers and merely penalises supports, so Yuzuha's kaleidoscope
would change nothing on any team that exists today.

Building it now would mean writing a rule, being unable to test it, and waiting for a unit to
arrive and prove it wrong. That is the same trap recorded in
[a test that cannot fail proves nothing](../../notes/known-pitfalls.md).

## What to do when it becomes live

The day a **DPS** ships with kaleidoscope, this becomes real work in L1 — the element-resistance
disqualification — and in L3's resistance penalty. Until then the annotation stands as data-side
documentation of Yuzuha's kit, the same status as `scaling.er`. See
[deliberately unmodeled](../../engine/deliberately-unmodeled.md).

Found while scoping the anomaly overhaul, which audited every unread annotation in the data.
