---
id: SCORE-145
title: Zhao avoids every rupture carry, though she is a usable backfill
priority: low
area: data
status: open
opened: 2026-10-15
tags: [ARCH-04, ARCH-06]
related: [medium-nangong-pyrois-sunna-underscored-on-vesper.md]
---

## Symptom

Zhao declares `avoid: ["armorer", "rupture"]`, so every rupture team with Zhao pays the −40
wrong-tool penalty, and the pull engine never pairs her with a rupture carry. The owner's view:
you could backfill Zhao on a rupture team if you really needed to — sad, but viable. Removing
her rupture avoidance is probably the fair approach.  If doing so would result in a pull 
recommendation for rupture, though, that would be incorrect. 

Yidhari / Lucia / Zhao on Butcher scores 342.6 including the −40. That is about 30 above the
Soukaku version, a spread the owner accepts (Zhao's general damage buff against Soukaku's ice
buff, plus tier and S-rank). Given that the scoring happens to land accurately at the moment, 
this issue is thornier than it first appears. 

Deferred until the Soukaku case was settled (SCORE-143).

## Reproduction

```bash
node matchups -b Butcher -t "Yidhari/Lucia/Zhao,Yidhari/Lucia/Soukaku" -o -d
```

## Diagnosis

Not yet measured. Things to check:

* Unlike Soukaku's, Zhao's useful buff is general damage, not ice, so an element qualifier
  (`rupture:!ice`) is not the obvious fit. The choice is probably between plain removal and
  keeping the avoid.
* Removing it lifts every Zhao + rupture team by 40 and opens those pairings in the pull engine.
  Predict the movers before changing anything.
* Rankings TEST 98 deliberately does not pin the Zhao/Soukaku order on Yidhari for this reason.

## Resolution

-
