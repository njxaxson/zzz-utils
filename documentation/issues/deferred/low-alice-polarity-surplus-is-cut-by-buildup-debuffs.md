---
id: ENG-012
title: Alice's polarity surplus is cut by a boss buildup debuff
priority: low
area: engine
status: deferred
opened: 2026-10-22
tags: []
---

## Symptom

A boss `debuffs.buildup` cuts every `utility["anomaly:<element>"]` proc surplus by the share its
teammates' buildup buffs cannot offset ([WEAK-03]). Roxy's wind surplus comes from a high buildup
rate, so the cut is right for her. Alice's `utility["anomaly:physical"]: 2` comes from her
polarity assaults, which are driven by her enhanced attacks and bypass buildup entirely. In game
the debuff should not touch them, and the engine cuts them anyway.

## Why it is deferred rather than fixed

**The data cannot tell the two cases apart.** Both are a plain `utility["anomaly:<element>"]`
surplus; nothing records whether a surplus comes from buildup or from polarity.

**It does no harm today.** Infernal Revenant is the only boss that declares `debuffs.buildup`, and
it resists physical:

* **Strict mode:** Alice, a resisted damage dealer, is disqualified in L1 and never reaches L3 or
  L4.
* **Lenient mode:** a resisted DPS is a cost rather than a disqualification ([LEN-01..04]), so a
  lenient Alice row carries this small, wrong extra charge on a team already shown as a
  compromise.

## What to do when it becomes live

The trigger is a boss that declares `debuffs.buildup` on which Alice is viable.

**Declare the source in data** — a marker on the surplus saying "polarity, not buildup" — and have
`procSurplus` skip the cut for it. Do not infer it from her class or her `damage.polarity`.
