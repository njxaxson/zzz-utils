# `utility`

Non-stat contributions a unit hands its teammates. These are **provisions**: things the unit
supplies, which some other unit may or may not need.

## The keys

`disorders`, `quick-assists`, `chains`, `ultimates`, `veils`, `heal:team`, `heal:self`,
`shields`, `interrupt-resistance`, `kaleidoscope`, `daze`, `stunless`, `rotations`,
`anomaly:<element>`.

## `anomaly:<element>` is the odd one out

It is not consumed by a matching `scaling` key of the same name. Instead it feeds the
**anomaly-quantity supply count** described in [scaling](scaling.md).

It declares *extra anomaly procs of that element*, beyond the buildup the unit's own rotation
already implies. Alice's polarity assaults are `utility["anomaly:physical"]: 2`. A hypothetical
fire unit with the same mechanic would annotate `utility["anomaly:fire"]`.

Being element-scoped rather than a generic flag, it composes with the head-count it augments
exactly the way a real agent would:

| Consumer | Absorbs |
|----|----|
| A **generic** `scaling.anomaly` consumer — Harumasa, Remielle | Procs of any element |
| An **element-scoped** one — Grace's `anomaly:electric`, Roxy and Sigrid's `anomaly:wind` | Only matching procs; blind to Alice's physical ones |

## How a provision is judged for cohesion

A provision's default cohesion relevance is capped at the best consumer's declared `scaling`
value for that key. In other words it only lands on a teammate who **declares** a matching
need.

That is right for narrow provisions — only two units in the whole roster scale off `veils` —
and wrong for the ones every carry uses regardless of what they declared.

Three keys are carved out, each for the same reason:

| Key | Why it is carved out |
|----|----|
| `ultimates` | Lands on any primary carry whose ultimate is a real burst. Judged by declared need, Dialyn's provision would read as landing on nobody whenever the carry is Seed or Evelyn — they use the free ultimate, they just get nothing *extra* from it |
| `quick-assists` | A small benefit that always lands. Charged at its size rather than against a declared need, so offering one is never a mismatch and never a large contribution either |
| `chains` | Every carry uses a free chain attack. Only Evelyn and Sigrid annotate `scaling.chains`, so judged by declared need, Astra's and Norma's chain provision read as a **total miss** on every other team |

> **If you add a provision key that is universally usable but rarely declared, it needs the
> same carve-out.** That bug has now been found three times in the same place.

## Related

* [Mechanics overview](mechanics-overview.md) — why `utility.chains`, `scaling.chains`,
  `damage.chain` and `buffs.chains` are four different things.
* [Cohesion](../engine/cohesion.md) — where the landing judgement is applied.


