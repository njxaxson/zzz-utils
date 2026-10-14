---
id: SCORE-143
title: Nangong/Pyrois/Sunna is underscored on Vesper
priority: medium
area: scoring
status: open
opened: 2026-10-13
tags: [PIPE-04]
---

## Symptom

On Discordant Solo (Vesper), `Nangong / Pyrois / Sunna` reads **248.1** calibrated (323.3 raw).
That puts it last among the owner's candidate non-YSG Vesper teams, about 50 below
`Dialyn / Pyrois / Sunna` (298.4). The owner places it among the best non-YSG teams for that
boss, alongside `Alice/Remielle/Velina`, `Nangong/Alice/Sunna` and `Dialyn/Pyrois/Sunna`.

Found while fixing the opposite defect on the same boss, `Nangong/Vivian/Sunna` overscoring
([PIPE-04]). It was kept out of that change so the measurement stayed clean.

Owner's hypothesis: most of Nangong's buffs miss Pyrois.

## Reproduction

```bash
node matchups -t "Nangong/Pyrois/Sunna,Dialyn/Pyrois/Sunna" -b Vesper --debug
```

```
>node matchups -b Vesper -t Nangong/Pyrois/Sunna -o -d

============================================================
SCORING: Nangong / Pyrois / Sunna
Boss: Discordant Solo
Base score: 175

  LAYER 1.5: TEAM STRUCTURE
    Structure: CONVENTIONAL (attacker + stunner + support)
    Structure type: +35 (used for teamwork multiplier)
    Field time: 2 on-field agent(s) → +0

  LAYER 2: INHERENT QUALITY
    DPS Tier:
      Pyrois: T1 → +18
      Sunna: T0 → tier +15, rank +14 (support/def, util 100%)
      Nangong: T0 → tier +15, rank +11 (stun, util 100%)
      Sunna: basic damage +5 (1 vs role baseline 0)
    Rank:
      Pyrois (DPS): +12

  LAYER 3: BOSS MATCHUP
    Favored: Nangong +22 (intensity 1, #1)
    Favored: Sunna +22 (intensity 1, #2)
    Boss weak(veils): total=4 → +32
    Pyrois on-element (ether): +28
    Nangong stun on-element: +15 (util 100%)
    Extra defensive assists: +3

  LAYER 4: MECHANICAL SYNERGY
      Pyrois → Nangong:
        pair total: 0.0
      Sunna → Nangong:
        atk: 1.4
        stun-infra: 1.0
        pair total: 2.4
      Nangong → Pyrois:
        stun-multiplier: 4.0
        dmg: 3.0
        stun-infra: 3.0
        recovery: 20.2
        stun-emergence: burst=1.3606557377049182 × infra=3 × 1 = 4.1
        totalize-qty: 1 × 1 × 5 = 5.0
        pair total: 39.2
      Sunna → Pyrois:
        atk: 2.1
        stun-multiplier: 4.0
        stun-infra: 2.0
        need(quick-assists): 1.8
        stun-emergence: burst=1.3606557377049182 × infra=2 × 1 = 2.7
        pair total: 12.6
      Nangong → Sunna:
        pair total: 0.0
      Pyrois → Sunna:
        pair total: 0.0
    Diametric synergy:
    L4 element: Pyrois on-element → ×1.15 on 51.8 = +7.8
    Layer 4 total: 62.0

  LAYER 5: ADDITIONAL SYNERGIES
    Layer 5 total: 0
    Teamwork multiplier: 0.720 (structure=1, cohesion=0.65)

  ARCHETYPE FIT
    Sunna → Pyrois [attack]: intended

  RAW SCORE: 449.0
  TEAMWORK: ×0.720
  FINAL SCORE: 323.3
============================================================
```

Nangong/Pyrois/Sunna prints `RAW SCORE: 449.0`, `Teamwork multiplier: 0.720 (structure=1,
cohesion=0.65)`, `FINAL SCORE: 323.3`. Structure is CONVENTIONAL, so the whole charge comes from
cohesion. In L4, `Sunna → Nangong` is 2.4 and `Nangong → Pyrois` is 39.2, made up of
stun-multiplier, dmg, recovery and totalize-qty. Nangong's `buildup: 3` does not appear because
Pyrois is not an anomaly unit. Note that L2 reports Nangong at `util 100%`, so whatever is
missing is not visible in L2's buff-utilisation gate.

## Diagnosis

-

## Resolution

-
