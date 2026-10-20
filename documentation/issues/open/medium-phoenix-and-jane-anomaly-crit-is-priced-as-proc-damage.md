---
id: SCORE-146
title: Phoenix's and Jane Doe's anomaly crit is priced as proc damage, and never reaches luminize
priority: medium
area: scoring
status: open
opened: 2026-10-18
tags: [LUM-02, BUFF-05, BUFF-08]
---

## Symptom

Phoenix and Jane Doe don't buff anomaly **proc damage** the way Rina or Grace do. They let anomaly
**damage** crit at a fixed rate with a fixed crit-damage percentage: Phoenix at 45% on every
element, Jane at 30% on physical only.  Also, they don't buff the proc itself, they buff the anomaly 
damage that is applied from the proc - i.e. the actual shock damage or the burn damage. That means that 
these effects do not play well with disorders, because disorders erase the proc - so that shock or burn 
state is removed and does not have future damage to crit. (Vortexes retain both the wind and alternate procs.)  
This is why Jane/Alice/Yuzuha is viable - the damage that would be from disorders is replaced by the team's 
assaults scoring critical hits post-proc.  

The difference also matters for Remielle. Her luminize hits are counted as anomaly damage (even though 
there is no such thing as a lumen proc), so in game they can crit beside Phoenix, and beside Jane when 
Remielle's lumen morphs to physical. This is the core reason behind Jane's synergy with Remielle. However, the currently modeled proc-damage buff can never reach Remielle, because she procs nothing.

This is one of the major reasons that Phoenix's overall damage output falls hard without Velina; she cannot 
capitalize on disorders the same way.  Technically speaking, the safest teams to capitalize her damage that don't 
include Velina would be Phoenix/Burnice/Remielle (lumen morph to fire) or Phoenix/Burnice/Yuzuha (whose kaleidoscope means that Yuzu 
won't proc physical to cause disorders). But in these cases, Phoenix loses most anomaly reactions: Burnice's limited
ablooms provide the only anomaly reactions, and anomaly reactions are where most anomaly damage is dealt. 

Currently, the engine models both as proc-damage buffs — `buffs.anomaly: 4` and `buffs["anomaly:physical"]: 3`
— and `[LUM-02]` then rules out Remielle entirely. Phoenix/Remielle teams are therefore
under-credited. Jane/Remielle teams would be too, but see the constraint below.

Deferred past the Phoenix release (3.3) by owner decision: the current ladders are acceptable for
the release.

## Reproduction

Probe on 2026-10-18: an in-memory `buffs.luminize` added to each unit, priced through the existing
damage-type channel (`MULT.DAMAGE_TYPE_BUFF`, `[BUFF-01]`), with TEST 90 and TEST 93 rescored.

| Team | Girtablullu | Aberrant |
|----|----|----|
| `Phoenix/Remielle/Velina`, baseline → luminize 3 | 570.0 → 601.1 | 615.6 → 642.6 |
| `Jane Doe/Remielle/Velina`, baseline → luminize 2 / 3 | 495.4 → 516.1 / 526.4 | 536.0 → 554.0 / 563.0 |
| `Burnice/Remielle/Velina` (unchanged) | 497.2 | 538.2 |
| `Alice/Remielle/Velina` (unchanged) | 508.9 | 549.3 |
| `Jane Doe/Remielle/Vivian`, baseline → luminize 2 | 352.6 → 367.9 | 474.1 → 492.1 |
| `Yanagi/Remielle/Vivian` (unchanged) | 352.8 | 474.8 |

Jane has **1.8** (Girtablullu) and **2.2** (Aberrant) points of headroom under Burnice in TEST 90.
At the default price, a luminize-reaching buff lifts her +21 to +31, past Burnice *and* Alice.

The physical qualifier alone won't hold her back. Remielle's chosen morph on
`Jane Doe/Remielle/Velina` is already physical on Aberrant, and on Girtablullu the wind and
physical morphs are near-identical on these element-neutral bosses.

## Diagnosis

**A `buffs.luminize` key was considered and rejected.** It renders on the character summary as a
Luminize buff, which isn't the kit, and it poses as a damage-type buff when the mechanic is a crit
property of anomaly damage. The fix needs a representation of "this unit's teammates' anomaly
damage can crit at a fixed rate" that:

* reaches Remielle's luminize (narrowly overriding `[LUM-02]` for this mechanic only, not for
  proc-damage buffs);
* respects Jane's physical restriction through the morph target;
* keeps Rina-style proc-damage buffs on the current path;
* doesn't show up in the character summary as something it isn't.

**Acceptance, owner-stated:**

* Phoenix rises.
* TEST 90 order holds: Jane stays below Burnice on the Remielle/Velina ladder. (Owner has reconfirmed this.)
* TEST 93 is re-ruled so Jane sits **slightly ahead of Yanagi** on the Remielle/Vivian ladder.
  They are 0.2 apart today, and the test already calls that rung a tie.  (Owner addendum: since 
  last posted, additional playtesting evidence shows that Jane should indeed be definitively better
  than Yanagi int the Velina/Remielle ladder; although by how much is subject to debate.)

The magnitude is the hard part. Jane's TEST 90 headroom is under 2 points, so whatever prices the
mechanic must keep her increment there, unless something else of hers is re-priced at the same
time. The in-game ratio of the two crit rates is 45:30 (3:2).  

It may also be reasonable to drop Jane from T1 to T1.5, as that may actually be the proper way to express that Jane is not quite as good as Burnice, since this is objectively true across the board
and not just in Velina/Remielle teams. (It also matches the idea that Jane and Yanagi - also T1.5 - are similar in power level.) This would free up some of the missing headroom. 

## Resolution

-
