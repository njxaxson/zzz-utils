# `scaling`, `replaces` and `converts`

`scaling` says what a unit benefits **from**. It is a *need*, and it is only worth something
when something on the team supplies it.

Non-stat keys go through need fulfilment. Stat keys feed baseline affinity.

> `scaling` is never a frequency. `scaling.chains: 3` means Evelyn *wants* chains badly,
> not that she fires more of them. See [damage and burst](damage-and-burst.md).

## Element-scoped anomaly quantity

`scaling.anomaly` is fed by *any* effective anomaly agent. `scaling["anomaly:wind"]` is fed only by wind ones (or by units that explicitly provision it, like Roxy) — and since wind anomaly is still anomaly, a wind source satisfies both.

Supply is a **weighted count, not a head-count**:

| Source | Counts as |
|----|----|
| Each matching anomaly agent, **including self** | One body — for example, a fire anomaly scaling on fire anomaly procs could self-fulfill the need |
| A teammate's `utility["anomaly:<element>"]` proc surplus | A per-weight fraction of a body |

A `2` annotation on the proc surplus is deliberately worth *one* extra agent's presence rather
than two. Procs are a surplus on top of a body, not a second body.

### Lumen agents supply nothing here, not even to themselves

Attribute Mutation morphs damage but fills no anomaly gauge, so a lumen unit procs no
anomalies (see [lumen](../concepts/lumen.md)).

That is what makes Remielle's `scaling.anomaly: 3` — her Luminize rebound, which combines
Refringe-boosted teammate procs — fed by teammates alone:

| Remielle's team | What this channel pays her |
|----|----|
| Solo anomaly | Zero |
| Triple anomaly | Two bodies' worth |

The check reads the unit's tags, **not** its element, because during morph scoring the element
lookup reports the morph target rather than `lumen`.

## How `scaling` merges with role baselines

Read this carefully; it is easy to get wrong.

The effective scaling is `{ ...roleBaseline, ...explicitScaling }` — a **per-key merge, not a
wholesale replacement**. An attacker with `scaling: { sheer: 3 }` still has the attack
baseline's crit rate and crit damage *and* gains `sheer: 3`. Only keys the unit names
explicitly are overridden.

### There is no baseline for `ultimates`, deliberately

It is authored data and nothing else. A unit that does not annotate one has no ultimate need at
all and never enters the need channel. See
[the ultimates two-channel model](../engine/ultimates-two-channel.md).

### The role baselines

| Role | Baseline scaling |
|----|----|
| Attack | `cr`, `cd` |
| Anomaly | `am`, `ap` |
| Rupture | `sheer`, `hp`, `cr`, `cd` |
| Armorer | `def`, `cr` — **no** `cd`, because armorer crit damage is fixed. Claret overrides with `cd: 1`, a token conversion into Laceration |
| Stun | `daze` |

Plus, for any carry: a small implicit `quick-assists`, and implicit `recovery` scaled off
`damage.totalize` where present. **Not** `ultimates`.

> **Open question, flagged for review.** Attack and anomaly arguably ought to carry `atk: 2` in
> their baseline scaling, and rupture `atk: 1`. It is possible this is already modelled directly
> in the code rather than through the scaling definitions — the ATK affinity path derives a
> consumer's ATK weight from its basic-damage level rather than reading `scaling.atk`. Nobody
> has confirmed which. Do not assume the table above is the whole story for ATK.

**Important note:** the `daze` key is not an override, it is a key meaning *how much above the baseline*. A stunner with explicity `daze: 2` is not the same as a support with `daze: 2`. For example, assume stunners have a default baseline of daze=3 and support of daze=2.  A support marked explicity with `daze: 2` becomes 2, whereas a stunner with the same mark would become 5.

### Baseline affinity is a separate resolver

Baseline *affinity* uses its own resolver with its own defaults — armorers get elevated crit
rate weight there, for instance. Do not conflate the two paths.

## Two `scaling` keys are meta-flags, not game mechanics

### `scaling.buffs` (0–3)

How badly this unit suffers when its **own** buffs and debuffs go unconsumed. Not every buff
provider is equally dependent on landing:

| Unit | Value | Why |
|----|----|----|
| SAnby | 3 | Without aftershock consumers she is significantly short of her damage ceiling |
| Nangong | 2 | Needs at least one anomaly teammate |
| Promeia | 1 | Her abloom buff is nice but not critical |
| Lycaon | 0 | His ice debuff is irrelevant to his job as a generic anomaly stunner |

Defaults come from the unit's **native role tags**; a pseudo-role does *not* override them.
Support and defense default to 3, stun to 2, the carry roles to 0. At 0 the penalty is skipped
entirely. Only weight-2-and-above buffs are evaluated — weight-1 entries are assumed always to
land.

### `scaling.codependent` (boolean)

Originally onsumed only by the [pull engine](../recommendations/codependency-gating.md), but now the scorer uses it as well. It it used to make the baseline value of tier dependent on whether or not their key teammates are present. For example, the core value of YSG and Remielle drops dramatically if their teammates do not provide their scaling needs.

## `replaces` — supplier side

`{ "cost_resource": "provided_resource" }`, read as "replaces cost with provided". Supplying
the resource **costs** the consumer the other one.

Dialyn's `{ "chains": "ultimates" }` means her free ultimates consume a chain attack, which
penalises pairing her with a chain-dependent carry.

## `converts` — consumer side

`{ "input": "output" }`. The consumer turns one resource into another for itself, so a
supplier's provision of the input augments the output's effective supply in both need
fulfilment and damage-type scoring.

Engine support exists; **no unit currently uses it**. See
[deliberately unmodeled](../engine/deliberately-unmodeled.md).