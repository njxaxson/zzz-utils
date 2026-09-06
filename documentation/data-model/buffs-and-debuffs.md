# `buffs` and `debuffs`

What a unit does for its teammates, and what it does to the enemy.

**Buff keys:** `atk`, `anomaly`, `aftershock`, `abloom`, `chain`, `chains`, `sheer`,
`laceration`, `pen`, `def`, `stun-multiplier`, `cr`, `cd`, `dmg`, `disorders`, `vortex`, plus
element names.

**Debuff keys:** `defense`, `recovery`, `dmg`, plus element names.

## Four senses of "anomaly"

The stem is overloaded and has been misread before. All four are distinct:

| Key | Means |
|----|----|
| `buffs.anomaly` | Anomaly **buildup** — the rate at which procs accrue |
| `buffs.am` / `buffs.ap` | The **stats**, Anomaly Mastery and Anomaly Proficiency |
| `utility["anomaly:<element>"]` | Extra procs **produced** |
| `scaling.anomaly` | Procs **needed** |

Buildup is derived from Mastery without being identical to it, the same way damage is derived
from ATK. Buildup and quantity are causally connected, though — more buildup means more procs.

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