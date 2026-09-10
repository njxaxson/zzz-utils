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