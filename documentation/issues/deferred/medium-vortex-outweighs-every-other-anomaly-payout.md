---
id: SCORE-143
title: A vortex is worth about five times a full abloom engine
priority: medium
area: scoring
status: deferred
opened: 2026-09-14
deferred-reason: The skew may be correct — the game does appear to push vortex-plus-abloom as the optimal anomaly line — so this needs a design ruling before any retuning, not a constant nudged.
tags: [VTX-04, VTX-05, ANOM-01]
---

## Symptom

On `Phoenix/Remielle/Velina` (Girtablullu) the two vortex payouts are **95.3** of a 240.0 raw L4.
On `Phoenix/Burnice/Remielle` — two fire agents, a deliberate mono-element abloom line — the two
abloom payouts are **20.0** of an 89.7 raw L4. Same carry, same lumen support, no vortex.

Vortex is not merely the best anomaly reaction in the engine; it is worth roughly **five times**
the next thing, and it is the single largest term in the whole L4 layer.

Nobody chose that ratio. It falls out of `VORTEX_BASE: 15` multiplied by a compression curve,
then by Proficiency, then by proc rate, then by a proc-damage buff — four factors compounding,
each individually defensible. `ANOM-01`'s abloom channel has one factor.

The consequence is that the anomaly ladder is decided almost entirely by who stands next to a
wind agent, and every other lever the engine has — abloom, disorder, Refringe, proc supply —
moves the answer by single digits against it.

## Reproduction

```bash
node matchups.js -p -b girta -i Phoenix -6 -o
```

`Phoenix/Remielle/Velina` scores 521.7; her next-best team scores 386.2. A **135-point cliff**
after the one composition that includes a wind agent.

For the layer detail, score either team with `debug: true` and read the `Vortex bonus` and
`Abloom` lines.

## Diagnosis

Not started. What is known:

* The four compounding factors are `[VTX-04]` (tier compression), `apFactor`, `procRate`, and
  the proc-damage buff scale. Each was measured on its own and none was sized against the others.
* `VORTEX_BASE` has never been re-derived since the phase-2 overhaul added AP, compression and
  proc rate on top of it. The phase-4 plan flagged this in advance: *"If it inflates, re-derive
  `VORTEX_BASE` rather than leaving it to calibration."* That was not done.
* Calibration cannot fix it, because the skew is **within** the anomaly archetype, and
  calibration divides a whole archetype by one anchor.

## Resolution

Deferred pending an owner ruling, because **the skew may be right**. Owner: the game does appear
to push vortex-with-abloom as the optimal anomaly strategy rather than disorders or mono-element
ablooms, so vortex outranking the alternatives is correct modelling. The open question is only
whether the *size* of the gap is right — 5× is a lot, and it is a number that emerged from
compounding rather than from a judgement.

Two things to settle before touching anything:

1. **Should `Phoenix/Burnice/Remielle` be closer to her Velina team than 339 against 522?** If
   yes, the gap is overstated and `VORTEX_BASE` is the honest dial. If no, this issue closes as
   working-as-intended and the note stays as documentation of why.
2. **Is the compounding itself defensible?** `damage × events` is correct physics for vortex and
   was argued as such when proc rate was wired in. If it is, a 5× gap may simply be what four
   real multipliers produce, and the alternative is to under-model vortex to flatter the rest.

Do **not** retune this while the L4 soft cap is unresolved; the cap compresses exactly the range
where vortex lives, so any measurement taken now will be confounded by it.
