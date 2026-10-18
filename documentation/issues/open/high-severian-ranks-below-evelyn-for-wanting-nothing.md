---
id: SCORE-146
title: Severian ranks below Evelyn because his kit wants nothing a teammate can feed
priority: high
area: scoring
status: open
opened: 2026-10-18
tags: [BUFF-09]
related: []
---

## Symptom

Severian (preview, 3.3, tier 0.5) is meant to be a top attack carry, as strong as Sigrid. The
owner expects his damage to match Evelyn's and probably beat it. What he wants from a team is
ordinary: a stunner to open windows, and whatever ATK or crit-damage buffs the support brings.
Nothing special.

The engine ranks him well below Evelyn (tier 1) on most bosses, and far below Sigrid, his
same-tier peer. Two teams that differ only in the carry, on Notorious Dead End Butcher:

| Team | L2 (tier) | L4 (synergy) | Raw |
|----|----|----|----|
| Norma / Evelyn / Sunna | 98 | 80.8 | 333.8 |
| Norma / Severian / Sunna | 115 | 38.0 | 308.0 |
| Lighter / Evelyn / Astra | 85 | 81.9 | 301.9 |
| Lighter / Severian / Astra | 102 | 24.8 | 261.8 |

Severian's higher tier earns him +17 in L2. He then loses 43 to 57 in L4, and the L4 loss decides
the ordering. Every other layer is the same for both teams.

The result is not specific to one boss. Best team containing each carry, preview roster:

| Boss | Severian | Evelyn | Sigrid |
|----|----|----|----|
| Dead End Butcher | #391 | #286 | #46 |
| Notorious Pompey | #204 | #2 | #95 |
| Notorious Marionettes | #380 | #226 | #32 |
| HollowVenger Truvia (spec boss) | #28 | #9 | #86 |

On Truvia, which is weak to wind and should suit him, his best team is #28. Evelyn's is #9.

## Reproduction

```bash
node matchups -b Butcher -t "Norma/Severian/Sunna,Norma/Evelyn/Sunna,Lighter/Severian/Astra,Lighter/Evelyn/Astra" -p -o
```

prints

```
# 1:   Norma / Evelyn / Sunna (256.1, raw 333.8, attack)
# 2: ★ Norma / Severian / Sunna (236.3, raw 308.0, attack)
# 3:   Lighter / Evelyn / Astra (231.6, raw 301.9, attack)
# 4: ★ Lighter / Severian / Astra (200.9, raw 261.8, attack)
```

For the Truvia view:

```bash
node spec-boss.mjs matchups/truvia.json -60 -p
```

## Diagnosis

### Why it happens

The engine pays a carry's own strength in exactly one place: the L2 tier bonus. Tier 0.5 earns
+35 and tier 1 earns +18. Tier 0 earns only +5 more than 0.5.

Everything in L4 is paid only when a teammate supplies something the carry declared. That is the
design premise: "a mechanic's existence has no value". Evelyn declares `scaling.chains: 3`, and
Norma and Lighter both supply chains, so that pair is paid on every team they share. Severian's
entry declares no `scaling` at all. His `damage` block (`ultimate:strong: 2`, `chain: 3`) is close
to Evelyn's, but a damage type is only paid when a supplier feeds it. Nothing on the team is
counted as feeding him.

So a carry whose power is unconditional gets nothing for it beyond tier, while a carry with
needs is paid each time a teammate meets them. In the owner's words, it is like scoring a bazooka
below a handgun because the handgun takes accessories.

His one self-buff, crit damage beside a second wind unit `[BUFF-09]`, fires correctly but is
worth about 3 raw. Crit damage is a foundational stat and scores low by design.

### Data edits do not close the gap

Tried in memory on Truvia, Norma / Severian / Sunna against Norma / Evelyn / Sunna (432 raw):

| Severian edited to | Raw | Gap to Evelyn |
|----|----|----|
| as shipped | 391 | −41 |
| `tier: 0` | 396 | −36 |
| `scaling: { cd: 3, atk: 3 }` | 396 | −36 |
| `damage` + `enhanced: 3`, ultimate raised to 3 | 405 | −27 |

The data model has no way to say "this carry simply hits hardest", so this is an engine gap, not
a mis-annotation.

### Which other units are swept up

The measure: on every released boss, take each carry's best team. Then count how often a
**worse-tier carry of the same role** has the better best-team. Preview roster, all 20 bosses.
Median L4 of the carry's best team is shown alongside, because that is where the deficit lives.

| Unit | Role | Tier | Median L4 | Beaten by a worse-tier same-role carry | Declared needs |
|----|----|----|----|----|----|
| **Severian** | attack | 0.5 | **56** | **59 / 157 (38%)** | none |
| **Nekomata** | attack | 1 | **65** | **44 / 112 (39%)** | none |
| **Soldier 11** | attack | 1.5 | **35** | 25 / 62 (40%) | none |
| Cissia | attack | 0.5 | 98 | 34 / 138 (25%) | none (`buffs: 2` meta-flag) |
| Seed | attack | 0.5 | 98 | 27 / 138 (20%) | none |
| Sigrid | attack | 0.5 | 107 | 27 / 119 (23%) | chains 3, wind anomaly 1, greedy 1 |
| Evelyn | attack | 1 | 97 | 16 / 95 (17%) | chains 3, recovery 1, greedy 3 |
| Ye Shunguong | attack | 0 | 117 | 8 / 193 (4%) | ultimates 3, veils 2 |

The clear cases are the three attackers with both an empty `scaling` block and an empty or near-empty
`damage` block: **Severian, Nekomata and Soldier 11**. They have the lowest median L4 of any
attacker rated better than tier 2.5, and they are the most often out-ranked by a worse-tier attacker. Cissia
and Seed have no declared needs either, but their buffs and Seed's `ultimate:strong: 3` give the
pair evaluation something to pay. They sit in the middle.

**Rupture is largely not affected, which is the opposite of the first guess.** Yidhari and
Starlight Billy declare nothing, yet their median L4 is 153 and 120. They are beaten by a
worse-tier rupture carry only 1 / 18 and 2 / 18 times. The rupture baseline scales with `sheer`
and `hp`, and rupture supports such as Lucia supply exactly those. So a plain rupture kit is fed
by its normal support. An attacker's baseline is only crit rate and crit damage, which are the
cheapest things in L4.

**Claret cannot be judged by this measure.** She is the only armorer, so there is no same-role
carry to compare her against. Her median L4 is 88, from the armorer baseline (DEF and crit rate)
plus her own laceration buff. Calibration is fitted per archetype, so any under-payment she has
is anchored away inside her own ladder. That hides it rather than fixing it. It would show only
when a second armorer ships, or when Claret is compared across archetypes. **Unverified either way.**

**Anomaly is not affected.** Velina, Phoenix, Vivian, Burnice and Jane Doe declare no needs, but
reactions pay anomaly carries in L4 regardless (median L4 of 180–250).

Caveats on the table:

* A worse-tier carry winning is often correct. Element, a boss's `anti` list and team fit all
  matter, so the absolute percentages mean little. The signal is the gap between a thin-kit unit
  and its peers of the same role.
* Nekomata and Soldier 11 are released units. Whether their current rankings are actually wrong
  has not been checked against the owner's playtesting. They could be correctly low for other reasons.

### Candidate fixes (none chosen)

1. **Pay the burst that a stunner unlocks in proportion to the carry's damage magnitude.** This is
   "he just wants a stunner" said mechanically: Roxy or Norma opens the window, and Severian's
   ultimate and chain burst cashes it. It keeps the rule that a mechanic is paid only when
   consumed, because the stunner is the consumer. It touches every burst attacker.
2. **Widen the L2 tier spread for top-tier carries.** This is the simplest fix and says
   "inherently strong" directly. It is also blunt: it moves every team in the corpus, and it
   would need the role baselines re-checked.
3. **A declared "self-sufficient" flag that credits a carry as if its ceiling were fed.** It
   mirrors `scaling.codependent` and is the most targeted fix. It is also a declared judgement
   rather than an emergent one, which cuts against the design premise.

Each of these is an engine change. It needs a `score-dump` / `score-delta` prediction first,
then the five suites and a calibration regeneration. The prediction must say which teams are
allowed to move, and should name Severian, Nekomata and Soldier 11 as the expected risers.

## Resolution

-
