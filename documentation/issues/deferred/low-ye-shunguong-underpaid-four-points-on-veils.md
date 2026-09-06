---
id: SCORE-142
title: Ye Shunguong is under-paid about four points beside a weight-1 veil supplier
priority: low
area: scoring
status: deferred
opened: 2026-09-02
deferred-reason: One pair type in the whole roster, about four points, and it makes the affected unit slightly worse rather than better. Not worth touching a formula shared by every need key.
---

## Symptom

An undersupplied consumer collects a flat amount regardless of how large its appetite was,
because the appetite factor cancels out of the arithmetic. The one case that still reaches this
today: Ye Shunguong's weight-2 veil need beside a weight-1 veil supplier, measured at 4.2 where
appetite-respecting arithmetic would give 8.4.

## Reproduction

```bash
node matchups.js -b butcher -t nangong/ysg/astra --debug   # grep need(veils)
```

Prints `need(veils): 4.2 (covers 50%)`.

## Diagnosis

The undersupplied branch initialises fulfilment from the coverage ratio and then multiplies by the
undersupply factor as well, so the appetite term appears once in the numerator and once in the
denominator and cancels.

**The surface, not the formula, is what changed.** When this was first written up it was reported
as affecting seventeen pairs across five keys, with direct test exposure. That figure is stale —
the data moved underneath it. Enumerating who declares an affected need key today:

| key | reachable undersupplied? |
|----|----|
| `veils` | Ye Shunguong **yes**; Aria no — every supplier is at or above her weight |
| `quick-assists` | no |
| `interrupt-resistance` | no |
| `ablooms`, `vortex` | nobody declares them |

Ultimates escape through fraction-of-need semantics; disorders escape by being priced team-wide
against a measured supply.

## Resolution

Not resolved, and closed as a nonissue by the owner after checking the one affected team across
every boss and finding it scores where it belongs. A four-point under-payment on a single unit does
not justify touching a formula shared by every need key.

**If you do fix it**, the change is one line — do not initialise fulfilment from the coverage
ratio in the non-fractional branch — and the predicted delta is that one pair type and nothing
else.

**Do not re-derive the "seventeen pairs" objection from an old write-up.** It was true of a
different roster.
