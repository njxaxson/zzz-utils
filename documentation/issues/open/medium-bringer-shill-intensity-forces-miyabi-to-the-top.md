---
id: DATA-001
title: Sacrifice Bringer's shillIntensity 6 is number-fudging to force Miyabi to the top
priority: medium
area: data
status: open
opened: 2026-09-03
---

## Symptom

Sacrifice Bringer sets `shillIntensity: 6`, the highest on any boss. At that intensity the first
favored unit collects a **+132** bonus.

It is a thumb on the scale, not a modelled mechanic, and it exists to put Miyabi on top.

## Reproduction

```bash
node matchups.js -b bringer -o --debug
```

## Diagnosis

Two consequences, both unwanted:

* Bringer alone stays a 10/0/0 anomaly sweep at the top of its ladder.
* The calibration anchor rule has to **exclude favored teams specifically**, or this one fudge
  would set the whole anomaly archetype's scale.

It does *not* lock other archetypes out — attack has 2,055 viable teams there and rupture 780 —
so the distortion is at the top of the ladder rather than across it.

## Resolution

Open. The fix is to make boss weaknesses understand elemental variants, so that Bringer can declare himself weak to `ice:frost`. This would give Miyabi and Promeia different bonuses even though they are both ice anomaly agents. 

See `shillIntensity` for how the field works.