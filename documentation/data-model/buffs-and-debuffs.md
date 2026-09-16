# `buffs` and `debuffs`

What a unit does for its teammates, and what it does to the enemy.

**Buff keys:** `atk`, `buildup`, `anomaly:<element>`, `aftershock`, `abloom`, `chain`, `chains`, `sheer`,
`laceration`, `pen`, `def`, `stun-multiplier`, `cr`, `cd`, `dmg`, `disorders`, `vortex`, plus
element names.

**Debuff keys:** `defense`, `recovery`, `dmg`, plus element names.

## Five senses of "anomaly"

The stem is overloaded and has been misread before. All five are distinct:

| Key | Means |
|----|----|
| `buffs.buildup` | Anomaly **buildup** — the rate at which procs accrue |
| `buffs["anomaly:<element>"]` | **Proc damage** of that element — Grace, Rina, Jane |
| `mechanics.stats.am` / `.ap` | The **stat levels** this unit has. See [stats](stats.md) |
| `utility["anomaly:<element>"]` | Extra procs **produced** |
| `scaling.anomaly` | Procs **needed** |

The two anomaly stats do different jobs and the distinction is load-bearing:

* **Anomaly Mastery** raises the buildup *rate* — how fast you reach a proc.
* **Anomaly Proficiency** determines how much *damage* a proc does.

Buildup is derived from Mastery without being identical to it, the same way damage is derived
from ATK. Buildup and quantity are causally connected — more buildup means more procs — but
only up to a point, because non-polarity procs are cooldown-gated in game.

### The buff key used to be `buffs.anomaly`

It was renamed because `:` is a **classifier** in this data model: `anomaly:wind` and
`anomaly:electric` are both anomalies, and both feed Harumasa's `scaling.anomaly`. A key that
means *buildup* cannot be the parent class of keys that mean *proc damage*. Renaming buildup to
its own key makes the namespace honest, and leaves `buffs.anomaly` well-defined as proc damage
of any element — currently declared by nobody.

## `vortex` is excluded from cohesion

One buff key behaves unlike the rest. `vortex` — Jane Doe's retroactive vortex crit,
generalised — is a contextual bonus. It scores only when consumers actually generate vortex in
that fight, scaled by tier, and it carries **no cohesion penalty when it does not apply**.

## `dmg` used to be excluded and no longer is

Generic damage is a universal multiplier relevant to every carry. The original worry about
counting it was that it would rescue the [cohesion](../engine/cohesion.md) of a support whose
*designed* buffs are mismatched — a rupture support's `sheer` landing on an attack team.

That worry is now handled properly by the baseline rule below, rather than by hiding the buff.

Debuff-side `dmg` is worth slightly less than buff-side. A buff helps against every enemy; a
debuff marks only one. That is irrelevant on single-target Deadly Assault and real on Shiyu
Defense.

## Baseline buffs, and why rarity is not importance

The baseline buff keys are `atk` and `sheer`. At annotation weight 3 or more they are
*flagship-eligible*: if one of them lands on an actual damage dealer, the unit's flagship
offering has landed, whatever else missed.

The reasoning is a distinction the engine got wrong for a long time.

Almost every S-rank support buffs ATK at weight 3, so ATK is **not what discriminates** between
two supports. You pick Yuzuha over Astra on crit damage, or on anomaly and disorder buffs;
never on ATK.

But common is not the same as unimportant. ATK is the baseline every support is paid for, and a
support whose ATK buff does not reach the carry has had the rug pulled out from under it.
`sheer` is the rupture-side equivalent — Lucia carries `sheer: 3` and no ATK at all.

So there are two questions, and they need different answers:

| Question | Answered by |
|----|----|
| Which support is best on this team? | The discriminating buffs |
| Is this support doing their job at all? | The baseline |

The flagship test asks the second one. Weight 3 is the bar in **both** directions — Pan Yinhu's
`sheer: 2` is a token amount and does not qualify, so he stays useless on an attack team.

## Buff relevance

Buff relevance is where the role asymmetries live:

| Consumer | Effect |
|----|----|
| Rupture | Reduced ATK efficiency |
| Armorer | **Zero** ATK efficiency |
| Anomaly | Low CR and CD relevance — their damage comes from ATK, AP and reactions, not crits |

Miyabi is the exception to the anomaly rule: she has effectively 100% crit rate and explicit
`scaling.cr` and `scaling.cd`, so both are fully valuable to her. Note that the exception is
**declared in her data**, never special-cased by name. 

`disorders` are always relevant to anomaly-role units, and relevant to others only
if they carry matching damage types.

### Relevance is combined across the team as a MAX, never an average

The question is "did anybody here want this", not "how much of the roster wanted it".

Averaging punished a support for the composition of her own team. Astra's `dmg` returned 1 from
Evelyn and 0 from Norma the stunner, and was charged 0.50 — half credit for a buff that fully
landed on the only unit it could land on.

## Two things the flagship test requires

Both were learned the hard way.

**It must reach an actual damage dealer.** Non-carry teammates get half credit for scoring
purposes, and half credit lands exactly on the 0.5 threshold. Judging the flagship on the
team-wide figure therefore let a support "do her job" by buffing the stunner.

**A declared conditional overrides everything.** If a buff is written as
`buffs.<key>.cases` — Remielle's gated ATK — the designer gated it deliberately, so it is the
unit's identity by construction. See [predicates](predicates.md).

## Code notes

### [BUFF-01] Supplier buffs a damage type the consumer deals

`MULT.DAMAGE_TYPE_BUFF` prices a supplier buffing a damage type the consumer actually deals —
Orphie's `buffs.aftershock` landing on Trigger's `damage.aftershock`. This is a BUFF channel,
not a provision or need channel: the supplier side reads `buffs`, the consumer side reads
`damage`, and no `scaling.<type>` is involved anywhere. It was called `DAMAGE_NEED`, and that
name plus a `need(damage:...)` debug label made it read like the provision channel twice over.
Do not rename it back.

### [BUFF-02] Anomaly crit-damage efficiency is 30%, not 0%

Anomaly damage does not crit, so a CD buff on an anomaly agent only reaches whatever direct
damage they do on the side — mostly, but not entirely, wasted. Owner described it as "like ATK
buffs on rupture," floated ~15%, then ruled the existing 30% (`ANOMALY_CRIT_DMG_EFFICIENCY`)
should stand: the important property is that it is not zero, and the exact figure is not worth
a corpus-wide move (recorded 2026-09-01).

The exception is declared, not inferred: an anomaly agent that annotates `scaling.cd` genuinely
wants crit damage and is caught by a short-circuit before this efficiency applies (Miyabi:
`cr: 3, cd: 3` reads 100%). Do not special-case a unit by name; annotate the unit instead.
Used by both `resolveBaselineWeight` (L4 pair weight) and `getBuffRelevance` (cohesion
relevance), which independently held 0.3 and are now tied to the same constant so they cannot
drift.

### [BUFF-03] Chain damage buff is priced on its own dial, not the provision rate

Koleda's `buffs.chains: 1` multiplies the chains a carry already has, so unlike a chain
*provision* (Astra, Norma handing out extra chain attacks) it lands on EVERY DPS —
`getChainMagnitude`'s unannotated baseline is 1.0 because every DPS has a chain attack, rising
to 1.45 for the hardest-hitting carries.

Rated at its own `MULT.CHAINS_BUFF` dial, not at `MULT.CHAINS_PROVISION`. The provision rate is
deliberately tiny (0.4) because gifting one extra chain is a small thing; multiplying every
chain the carry throws is not the same statement, and pricing the buff at the provision rate
would have made Koleda worse than the bug it fixed.

### [BUFF-04] BUFF_IMPACT is one table, sourced from MULT

There used to be two answers to "how much damage is one point of this buff worth": the L4
damage layer priced a buff from `MULT`, while cohesion consulted a shorter table and quietly
fell through to `MULT.ELEMENT_BUFF` for anything it did not list. The two disagreed about
`laceration`, which L4 pays at 6 and cohesion charged at 2 — so an armorer support like Koleda
buffing Claret was measured as if her defining buff were worth a third of what the engine
actually pays for it. `BUFF_IMPACT` is now one table sourced from `MULT`, so the two paths
cannot drift again; an assertion at load fails loudly if a stat-buff key is added without a
price rather than silently pricing it at 2.
### [BUFF-05] The three senses of an anomaly buff, and the bare key

Three different keys, deliberately not one:

| key | means |
|----|----|
| `buffs.buildup` | anomaly buildup **rate** |
| `buffs["anomaly:<element>"]` | **proc damage** of that element |
| `buffs.anomaly` | proc damage of **any** element |

The bare key was defined in phase 2 with no user and wired in phase 4 for Phoenix. Three traps
sit on it, all silent:

* **`'anomaly'.slice('anomaly:'.length)` is `''`, not `'anomaly'`.** Two sites do this. Removing
  the bare-key guard without an explicit branch makes it match an element nobody has — the code
  compiles, the tests pass, and the feature does nothing.
* **`teamProcDamageBuff` iterates raw values** and `w()` returns 0 for an object. Phoenix's buff
  is a `{ cases: [...] }` spec, so a raw read drops her whole mechanic. It resolves the spec.
* **`getBuffRelevance` must widen to the bare key**, or Phoenix's flagship buff is charged at
  relevance 0 in cohesion.

Gated on the **team** landing the element rather than on the consumer's own element: the buff is
partly about the state of the target, so a teammate hitting an afflicted enemy benefits. That is
what pays Harumasa in a monoshock team. Two exceptions carve out of it — `[LUM-02]` and the wind
enabler in `[VTX-05]`.

**A consumer already reacting with wind is skipped**, because their proc damage is realised as
vortex and the vortex payout amplifies itself by this same buff. Paying here as well would count
one buff twice on the same damage.

### [BUFF-06] A damage-type buff is rated by how central the type is to its kit

`DAMAGE_TYPE_BUFF_RATE` overrides the flat `MULT.DAMAGE_TYPE_BUFF` per type, and `abloom` sits
below the default.

Not every damage type is equally central to the kit that deals it. SAnby's aftershock buff is
what her teams are **built around**; Promeia's abloom buff is a perk that makes her pleasant
alongside Vivian and Burnice. Priced at the flat rate, Promeia's was worth **18 raw** into Velina
— the second-largest single item in the Aria/Promeia gap, for a mechanic nobody builds a team
around.

> **A measurement trap.** Deleting the buff outright reads as **−376 points**, which is not its
> value. Promeia declares no other buff, so removing it leaves her supplying nothing at all and
> trips a separate "expected to supply something, supplied nothing" cohesion penalty. Never
> measure a unit's only buff by deleting it — vary its weight.

### [BUFF-07] Three anomaly buffs, three gates, all flat

`buffs.buildup`, `buffs.disorders` and `buffs.vortex` each ask one question about the consumer
**on this team**, then pay a flat amount:

| buff | gate |
|----|----|
| `buildup` | does the consumer proc anomalies at all |
| `disorders` | can the consumer contribute to a **disorder** here |
| `vortex` | can the consumer contribute to a **vortex** here |

All three used to be scaled by one multiplier, `resolveBaselineWeight(consumer, 'anomaly-affinity')`,
which returned the consumer's `scaling.am`/`scaling.ap` if declared and 2 otherwise. The owner did
not recognise the concept, which was the tell: it corresponded to nothing in the game.
`scaling.am` means "I convert Mastery into Proficiency", and it was being read as "buildup buffs
are valuable to me" — a different claim. It quietly multiplied Promeia's three buffs by 1.5
against Aria's 1.0.

`ANOMALY_BUFF_CONSUMER_WEIGHT` replaces it as a constant. **It is deliberately kept out of**
`MULT.BUILDUP_BUFF`: that constant is shared with `BUFF_IMPACT`, cohesion's view of how big a
buff is, and folding it in made a buff that lands on nobody twice as expensive to whiff — it cost
`Nangong/Ye Shunguong/Sunna` **99 points**. See `[BUFF-04]`.

**Lumen never receives a buildup buff.** It buffs how fast procs land, and Remielle fills no
gauge and procs nothing at all — there is no rate to raise. She is anomaly-*tagged*, which is
what let a role check pay her: Velina was handing her 3.2 for a buff she cannot use. Same ruling
as `[LUM-02]`, different key. Mechanics TEST 31 pins it, and 469 team-boss rows moved when it
landed, every one of them a Remielle team holding a buildup supplier.

**Buildup does NOT scale by how much damage the consumer deals**, and this is settled — do not
re-open it. `atk` twenty lines away *is* damage-scaled, so the asymmetry looks like an oversight
and is not. Owner: buildup defines proc **rate**, not damage, and it helps an anomaly teammate
standing beside Harumasa, who only cares about the *number* of procs his teammates land. As long
as the buff lands, it works. The question was asked when a pseudo-anomaly support was collecting
a full carry's buildup value; the answer was that the support's promotion was the bug, not the
buff's pricing. See `[PRED-02]`.

`buffs.vortex` is **flat**, not tier-scaled. Owner: Velina's vortex buff raises the final
post-calculation damage of the vortex regardless of how it was caused — a flat percentage, not
something tiered by element or AP. Tier-scaling it charged the element a third time and the
consumer's Mastery appetite a second.

### [BUFF-08] A proc-damage buff landing on its own owner counts at 15%

`SELF_PROC_BUFF_SHARE` discounts the part of `teamProcDamageBuff` that comes from the consumer's
own kit, where the buff scales that consumer's own vortex.

The engine's universal rule is that a supplier is not its own consumer — `chain:extra` is kept
out of `utility.chains` for exactly this reason, see `[ULT-01]`. The vortex payout deliberately
breaks it, because Jane really does buff her own assault procs in game and the vortex is built on
them. But a unit's own damage is already priced through AP and proc rate; this channel exists to
value what a unit brings to **others**.

`Alice/Jane/Yuzuha` is the case that makes the distinction real: there Jane's buff lands on a
second physical agent at full value, which is why that team is good. Beside Remielle and Velina
it lands on nobody, and before this discount Jane's entire lead over Burnice came from
self-buffing — at `PROC_BUFF_VORTEX_SCALE: 0` the two were identical to the decimal.

**The value is not anchored.** 0.15 is where the Burnice/Jane rung lands, and 0.0 is arguably
more principled (it is what every other self-provision gets). Owner call, recorded as a known
weakness rather than dressed up.
