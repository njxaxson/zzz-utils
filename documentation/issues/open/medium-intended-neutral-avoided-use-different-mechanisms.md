---
id: SCORE-144
title: Neutral and avoided archetype verdicts are charged by different mechanisms
priority: medium
area: scoring
status: open
opened: 2026-10-15
tags: [TWM-03, ARCH-04, ARCH-06]
related: [medium-nangong-pyrois-sunna-underscored-on-vesper.md]
---

## Symptom

One declaration, `mechanics.archetypes`, now produces two different kinds of charge:

| Verdict on the primary carry | What it costs |
|----|----|
| neutral, with an idle pseudo-role | a **cohesion ceiling** (0.85) — scales with the whole score |
| avoided | a **flat −40**, after the teamwork multiplier |

Concretely, on Butcher:

| Team | Soukaku's verdict | Charge | Final |
|----|----|----|----|
| Yidhari / Lucia / Soukaku | neutral (`rupture:!ice` does not match) | cohesion capped at 0.85 | 313.2 |
| Starlight Billy / Pan Yinhu / Soukaku | avoided | −40 | 66.2 |

The owner's concern: that looks like an architecture flaw. "Not quite built for this" and "the
wrong tool" are two points on one scale, and they are charged in different currencies.

## Reproduction

```bash
node matchups -b Butcher -t "Yidhari/Lucia/Soukaku,Starlight Billy/Pan Yinhu/Soukaku" -o -d
```

Read the `Cohesion terms` block and the `ARCHETYPE FIT` block for each team.

## Diagnosis

The current justification, recorded in [TWM-03](../../engine/teamwork-multiplier.md), has two
parts. Neither has been tested.

1. **They answer different questions.** The cap says "this unit could be doing more". That is
   about how much of the unit's kit lands, which is cohesion's job. Avoid says "wrong tool". That
   is a verdict on the composition, made flat on purpose so it bites the same whatever the rest of
   the team does.
2. **Stunner versus support.** The −40 was calibrated on supports ([ARCH-04]). The cap was built
   for a stunner with an idle anomaly half. The two base classes may genuinely need different
   treatment.

Known consequences of having two currencies:

* **The two cannot be compared directly.** A cap costs a share of the score; the penalty is a
  fixed 40. On a high-raw team the cap costs more than the penalty. That is why 20 Soukaku +
  Yidhari rows went *down* (worst −6.1) when Soukaku moved from avoided to neutral.
* **Inversion is possible in principle.** A single unit could come out better avoided than
  neutral. No unit can today: Nangong is intended or neutral, Soukaku is intended or avoided.

Things to measure before deciding:

* Express avoid as a cohesion cap instead (avoided = a lower ceiling), and see what moves. The
  −40 is pinned by two tests ([ARCH-04]); the cap would have to reproduce both.
* Or express the neutral cap as a flat charge, and see whether Nangong/Pyrois/Sunna can still sit
  beside Dialyn/Pyrois/Sunna on Vesper (rankings TEST 98) without a share-of-score charge.

## Resolution

-
