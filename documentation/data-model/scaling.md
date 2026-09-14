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

## `scaling.greedy` — burst window contention

Two carries cannot both spend the same stun window. `greedy` says how much of a window a unit
needs to land its burst.

| Value | Units |
|----|----|
| 3 | Evelyn, Miyabi, Remielle, Yixuan |
| 1 | Alice, Aria, Harumasa, Promeia, Sigrid |

**The greediest carry keeps the window; everyone else's greed is what is lost.** The charge is
per unit squeezed out. It is a narrow dial — one step lower loses a required ordering on the
neutral boss, one step higher breaks a different one.

### Reduced enemy recovery (i.e. longer stun duration) is worth more to a greedy carry

Gated at greed 2 and above. Most units have plenty of time to land a burst inside a normal stun;
a greedy carry is the one running out of window.

This is why **Lighter beats Trigger as Evelyn's stunner**. Both raise her stun multiplier, but
only Lighter shortens recovery, and Evelyn declares a recovery need outright.

### What this does not reach

It fires on two units annotated greedy above 1 — a *window* collision. Two attack carries who
cannot both hold the field are a **role** collision, and nothing charges for that. See
[deliberately unmodeled](../engine/deliberately-unmodeled.md).

The value-scaling is also unverifiable on today's roster: every contender is annotated 3, so
every clash is 3+3 and no fixture can tell scaling from a flat charge. See
[the deferred issue](../issues/deferred/low-greed-value-scaling-cannot-be-tested-on-todays-roster.md).

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

## Code notes

### [SCAL-01] The plural need keys are not typos

`NEED_FULFILLMENT_KEYS` uses `ablooms` and `vortex` as separate, currently-dormant needs —
plural (or differently-shaped) from the live `damage`/`buffs` keys `abloom` and `vortex`.
`ablooms` reads `scaling.ablooms`, declared by nobody; the live abloom channel is the singular
`abloom`, a `damage` key, matched against a supplier's `buffs.abloom` in the damage-type loop of
`scoreNeedFulfillment` (Promeia's `buffs.abloom: 3` into Velina's `damage.abloom: 2` is 18
points). `vortex` is the same shape: `buffs.vortex` is priced via `MULT.VORTEX_BUFF`,
`scaling.vortex` is declared by nobody.

Do not "fix" the plurals to match the damage keys — renaming would not wire anything up, since
the need side reads `scaling.*` and no unit declares `scaling.abloom` either. The real hazard
runs the other way: a future unit declaring `scaling.abloom` intending a real need would be
silently ignored.

### [SCAL-02] needSeverity is convex, and reads the coerced weight

`scaling.<key>: N` says how much a unit depends on that key. The cohesion charge used to
ignore N entirely — any weight >= 1 counted as one whole unmet need — which flattened two very
different statements. Ye Shunguong's `veils: 2` is a design gate (without Sunna or Zhao she is
severely hamstrung, and the full charge is right); Aria's ether-veil scaling is a bonus for
pairing her with Nangong or Sunna, better with both, and charging her the same as YSG cost
`Aria/Remielle/Velina` 13% of its cohesion for a missing bonus.

Convex on purpose (owner: weight 1 or 2 should not be penalised nearly as much as weight 3):
weight 1 -> 0.11, weight 2 -> 0.44, weight 3 -> 1.00. Feeds both sides of the reception ratio,
so a unit with several needs of differing weight is judged on how much of its declared
dependence is covered rather than on a headcount.

Reads the coerced weight, so `true` behaves as weight 1 — the data model's own convention
(`true`/`1` = minor, `2` = strong, `3` = defining), and the contract wins. An interim version
special-cased `true` to full severity on the theory that a boolean means "depends on this"
without grading; that contradicted the documented scale and is the reason issue 15 existed. If
a unit's need is genuinely defining, the data should say `3`, not `true`.

### [SCAL-03] Exploiting a longer stun window needs two gates

`canExploitLongWindow` (team-scorer.js) decides whether a greedy carry can actually cash in a
recovery debuff's longer stun window. Two gates, both about whether the window is real rather
than about the carry:

1. **No contention.** If two greedy carries are fighting over the window, neither is getting
   enough of it to exploit an extension. Paying both the extension bonus while charging
   contention once double-counted the same claim — worth a net +27 to
   `Nangong/Miyabi/Remielle` and put Remielle in four of Miyabi's top five teams.
2. **Somebody has to open the window.** A recovery debuff on a team with no stunner is close to
   comical — it lands maybe once in a fight by accident. The team still earns the BASE recovery
   credit for that; this gate only withholds the greedy EXTRA, which is about repeatedly getting
   a longer window.
### [SCAL-04] A need of 1 is an appetite, not a dependency

The cohesion needs charge starts **above** weight 1. A `scaling.<key>: 1` says "this feeds me,
but I do not depend on it": rewarded through the L4 need channel when supplied, never charged
when it is not.

Owner's framing, and it generalises — it is a statement about what weight 1 *means*, not a
carve-out for one key. Today it touches exactly one unit. Aria's `veils: 1` is the only need at
weight 1 on the roster besides Miyabi's `ultimates: 1`, and `ultimates` is already exempt here
via `NATURALLY_AVAILABLE_NEEDS`.

Worth 7.9 points to Aria beside Remielle and Velina, which closed most of her gap to Promeia.
Measured at 3,843 rows, `teamwork` layer only, every one an Aria team, zero exceptions.

**84 of those rows went *down*, by up to 1.0, and that is not a bug.** Cohesion is a geometric
mean, so removing a term also removes its weight; if the removed term was *better* than the
team's average, dropping it pulls the mean down. Removing a penalty is not strictly monotonic
here, which is exactly the kind of thing that looks like a defect later.

See `[TWM-02]` for what weight 2 does, which is the next rung of the same ladder.
