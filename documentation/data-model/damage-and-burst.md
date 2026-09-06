# `damage` and Burst Throughput

`mechanics.damage` lists the distinctive damage types a unit deals: `enhanced`, `chain`,
`aftershock`, `abloom`, `polarity`, `totalize`, `luminize`, `laceration`, `maim`, and the
ultimate variants.

This page covers what those keys mean, why the ultimate keys are three separate things, and
how the engine turns them into a burst number.

## The three ultimate axes

Do not treat any one of these as a derived or stronger form of another, and do not let any of
them leak into another's channel. That leak was a long-standing engine defect.

| Axis | Where it lives | What it means | Scored by |
|----|----|----|----|
| **Magnitude** | `damage['ultimate:strong' | 'ultimate:weak']` | How big the in-game modifier is | The **provision** channel |
| **Frequency** | `damage['ultimate:double']` | How many ultimates per window | Burst throughput, and nothing else |
| **Unique benefit** | `scaling.ultimates` — *not* a `damage` key | Whether the unit gets something *beyond* the ultimate's own damage | The **need** channel, annotated values only |

### Magnitude

The `ultimate:strong` tiers track the actual in-game multiplier. Most DPS agents sit at
3000–3600%. `ultimate:weak` is around 1600% — roughly Evelyn's chain attack, where most chain
attacks are around 1200%.

Magnitude is what a *free* ultimate is worth to a unit, and it is graded with deliberately
uneven steps because the underlying percentages are uneven — 4200 to 4500 is a small jump,
4500 to 6000 is a large one:

| `ultimate:strong` | Value | Who |
|----|----|----|
| weak, or no strong | **0** | Sigrid; Pyrois without wind — not a real burst |
| *(unannotated)* | **1.0** | \~3000–3600%, most DPS |
| `1` | **1.1** | \~4200% — Evelyn, Yixuan |
| `2` | **1.25** | \~4500% — Rina, Miyabi |
| `3` | **2.0** | 6000%+ — Seed, YSG |

The 1.0 → 1.1 step is small on purpose but **must not be collapsed**. It is the only thing that
makes annotating `ultimate:strong: 1` mean anything at all, and it is what makes Evelyn a
slightly better recipient of a free ultimate than Ellen. Test 89 pins it.

### Frequency

A normal DPS gets one ultimate in a window; a double-ultimate unit gets two.

* Pyrois builds ultimate twice as fast.
* Remielle and Yixuan each have a unique meter that, when full, grants an extra ultimate on top of the standard one. In a stun window they can fire the extra and then immediately the regular.
* YSG's enlightened state, **when opened with an ultimate**, ends with an extra large bonus
  ultimate. Opening the state by other means does not grant it.

This is why titled units — void hunters and grandmasters — have such high damage ceilings:
large magnitude meeting doubled frequency. Magnitude × frequency is **throughput**, and
throughput belongs in burst calculations only.

### Why the axes must stay apart

Two cases point in opposite directions.

**Pyrois** has a double ultimate yet benefits *less* than most from Dialyn. Two weak ultimates
(2 × \~1600% ≈ 3200%) put his throughput in line with a standard DPS like Ellen — so there is no
cause to complain his output is below average — but Dialyn's free ultimate is a *single*
ultimate, only half of what he wants. That is deliberate design with intended ramifications:
he is fine without a provisioner and cannot fully exploit one.

**Seed** has no double ultimate and no ultimate scaling whatsoever, yet benefits tremendously
from extra ultimates, purely on magnitude.

So frequency is worthless as a predictor of provision value, and magnitude is exactly the right
one. Neither Pyrois nor Seed declares `scaling.ultimates`, and neither should: a free ultimate
is worth something to both, but neither gets anything *beyond* the ultimate's own damage. That
distinction is the entire reason the need channel exists separately.

### `ultimate:weak` zeroes the provision

`ultimate:weak` marks a unit whose ultimate is not a meaningful burst — Sigrid's ultimate is
weaker than her enhanced attacks, and Pyrois uses his as a mode switch. Such a unit gets
magnitude **0**, so an ultimate-providing stunner earns no credit for gifting them one.

An `ultimate:strong` overrides `ultimate:weak`, which is exactly how Pyrois's conditional
works: his ultimate becomes a real burst when a wind-anomaly unit is present, lifting the
penalty. This zeroing is load-bearing — it implements both Sigrid's exclusion and the Pyrois
design. Test 90 pins it.

### Two things not to "fix"

**Miyabi carries no** `ultimate:double`. Her enhanced attack has the same multipliers as an
ultimate, so she effectively double-ultimates through `damage.enhanced: 3` feeding burst
weight. The burst model accounts for it there. Do not add `ultimate:double` to her.

**Yixuan's two ultimate keys are not double-encoding one thing.** Her `scaling.ultimates: 2`
models enablement of her annihilation attack; her `ultimate:double: 3` models her literal extra
ultimate. Genuinely distinct.

### Role-inherent keys

`laceration` and `maim` are inherent to [armorers](../concepts/armorer-laceration-gash-maim.md). `sheer` is inherent to rupture. Only list them to override the role default. 

### Resolution

Conditional `damage` values are resolved once per team. Damage is always team-scoped — it is
the unit's own output — so no consumer context is needed.

## Burst throughput: the relative-damage scale

**The single most important thing here: the same ordinal means different things on different
keys.** `chain: 3` and `ultimate:strong: 3` are roughly four rungs apart.

An engine that took a MAX over the damage keys therefore picked the biggest *number*, not the
biggest *instrument*, and rated Evelyn's chain attack equal to Seed's 6000% ultimate. That was
the real content of a whole issue.

Relative burst damage in rungs (relative only — raw game percentages are deliberately not
encoded anywhere):

| Rung | What lands here |
|----|----|
| lowest | `chain` at **any** value, `ultimate:weak`, an unannotated **support** ultimate |
| ↓ | `enhanced: 1` |
| ↓ | `enhanced: 2`, an unannotated **DPS or stunner** ultimate |
| ↓ | `enhanced: 3` ≡ `ultimate:strong: 1` ≡ `ultimate:strong: 2` |
| highest | `ultimate:strong: 3` |

Two consequences that are easy to get wrong:

**The whole** `chain: 1/2/3` axis spans less than one rung. Annotating a chain attack as `3`
rather than `1` is a rounding error next to a single step on the ultimate axis. Chain magnitude
therefore earns its keep in the **provision** channel, the same division of labour as ultimate
magnitude.

**An unannotated support ultimate sits down among chain attacks.** That is a *role* effect on
the baseline, not a missing annotation. It is why Astra and Sunna contribute nothing to a burst
window while Rina, who annotates `ultimate:strong: 2`, contributes real damage.

### Unannotated does not mean zero

`damage` records what is *distinctive*. Ellen's `mechanics` is literally `{}` and she still
fires a real ultimate and a real chain attack. Every instrument has a role-derived baseline,
which is why burst weight is **derived** rather than read off a MAX.

### Role applies twice

Both times through the effective-role lookup. It sets those baselines, and then it scales
throughput into impact: DPS fullest, stunner less, support least. That stands in for the base
ATK gap between roles, which is deliberately not modelled as a number.

Reading the *effective* role is what makes Norma — tagged `stun`, playing sub-DPS — score as a
carry.

**Three role tiers, not two.** A stunner sits between a DPS and a support: their ultimates run
slightly under a DPS's *and* their base ATK is lower, for roughly **75% of an undistinguished DPS like Ellen** overall. Norma and Nangong are examples of exceptions and must not be caught by this; they reach the DPS tier through their sub-DPS and pseudo-anomaly roles.

Note the deliberate asymmetry: ultimate *provision* really is limited to one primary carry, so
the role set used there excludes `subdps`. Burst throughput is not so limited, so the burst
model widens the set locally.

### An annotation always overrides the role default

Rina is the precedent: a support whose `ultimate:strong: 2` makes her a genuine recipient of a
free ultimate. A future support with a meaningful chain attack must not be zeroed either. Only
an *unannotated* non-DPS is the waste case — gifting Sunna a chain.

### A non-DPS earns burst weight only if it annotates an instrument

A support technically fires an ultimate in a window, but paying every Astra and Lycaon for it
would hand out a small unearned bonus on nearly every team. The annotation **is** the claim
that this unit's burst is worth pricing — the same "never give a unit something it did not
declare" rule that governs the need channel.

## Frequency keys: `ultimate:double` and `chain:extra`

Both say how **many** times a unit fires an instrument in one window, never how hard. Both are
read by the burst model and **nowhere else**. They must never reach the provision or need
channels; that leak once fabricated an ultimate need for 26 of 60 units.

### Why `chain:extra` is not `utility.chains`

`chain:extra` is Evelyn's self-provisioned chains. Provision is scored supplier → consumer with
the supplier excluded from being its own consumer, so a `utility` entry can never reach its own
owner.

Annotating Evelyn with `utility.chains` would hand **Sigrid** free chains on a Lighter / Sigrid
/ Evelyn team and give Evelyn nothing: the unintended effect and none of the intended one.

Chains a *teammate* provides — Astra, Norma — stay out of burst weight entirely. They are
already priced in the provision channel.

### Chains and stunless teams

Chain attacks exist only inside a stun window, so a [stunless](../archetypes/stunless.md) carry gets no chain component at all. YSG does not open a window — she only inherits the damage multiplier — so her burst is pure ultimate.

## The mistake to avoid

> `scaling` is a need, never a frequency. `scaling.chains: 3` means Evelyn *wants* chains
> badly, so provisioners are worth more to her. It does **not** mean she fires more of them.
> Identically for `scaling.ultimates`. This is the single easiest mistake to make in this part
> of the model, and it has been made more than once.

See [scaling](scaling.md).