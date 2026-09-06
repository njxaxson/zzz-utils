# Cohesion

Cohesion asks one question: **did what this team brought actually get used?** It is one of the
two halves of the [teamwork multiplier](teamwork-multiplier.md).

This page covers what feeds cohesion. The long history — the wrong diagnoses, the post-mortems
— lives in [known pitfalls](../notes/known-pitfalls.md); read the relevant section there before changing any
of this.

## The shape

Cohesion is a **weighted geometric mean** of per-unit buff utilisation.

| Unit type | Enters as |
|----|----|
| Non-DPS | Squared, at full weight |
| DPS | Unsquared, at half weight |

The geometric mean is the point. One badly mismatched member drags the whole team down
multiplicatively, rather than being averaged away by three good ones.

## What feeds utilisation

### Wasting buffs is wasting carry potential

When a carry provides buffs — SAnby's aftershock, Cissia's electric debuff — and no teammate
consumes them, that carry was fielded on the wrong team. Severity is controlled by
`scaling.buffs`.

### Buff utilisation gates support quality

A support's tier and rank only matter to the extent their buffs are actually used. The gating
is squared in L2, so a support at 30% utilisation keeps roughly 9% of their quality bonus.

### Whiffed directional buffs

`sheer` with no rupture consumer; `cd` on an all-armorer team. These take a direct cohesion hit
*beyond* the ratio effect, because the absolute-supply path would otherwise mask a wasted
specialist buff.

### Armorer damage-lever dependency

Graded by total supply of the levers an [armorer](../concepts/armorer-laceration-gash-maim.md)
can actually use — crit rate and Laceration primary, PEN and defense shred secondary, with
shred stacking across suppliers. A team supplying none of them takes a dedicated hit.

This applies to **every** armorer, whether or not they carry buffs of their own.

### Carry reception

Every unit is checked on what fraction of its declared `scaling` needs the team meets. This is
what penalises "duo plus deadweight" teams.

**An unmet need costs in proportion to the weight the unit declared, on a convex curve.** Weight
3 costs the full charge; weight 2 costs well under half of it; weight 1 costs almost nothing.

The charge used to be a headcount — any weight at all counted as one whole unmet need — which
flattened two very different statements:

| Declaration | What it means | Right charge |
|----|----|----|
| YSG's `veils: 2` | A **design gate**. Without Sunna or Zhao she is severely hamstrung | The full charge |
| Aria's ether-veil scaling | A **bonus** for pairing her with Nangong or Sunna, better with both | Almost nothing |

Charging Aria like YSG cost `Aria/Remielle/Velina` — a top-tier team — 13% of its cohesion for
a missing bonus. The weight is what separates the two cases, so it has to be read.

### Wasted vortex

A wind anomaly sub-DPS whose vortex generation has no beneficiary counts as an unmet need. "No
beneficiary" means no native primary anomaly carry with a meaningful
[vortex tier](../concepts/anomaly-reactions.md#vortex-tiers).

| Pairing | Penalised? |
|----|----|
| Velina + Miyabi | Yes — frost gains nothing from vortex |
| Velina + Promeia | No |

This deliberately ignores *pseudo*-anomaly roles. Only units natively tagged `anomaly` count as
the primary here.

### Dual-anomaly teams are inherently cohesive

A primary anomaly carry plus an off-field anomaly sub-DPS of a different element takes no
penalty for the sub-DPS "not providing buffs". Producing reactions is the contribution.

### Damage buffs on a pure support or defense are irrelevant

Offensive buffs landing on a non-damage contributor do not count, and a support's matching
element does not inflate a supplier's utilisation.

Sub-DPS units are **always** damage contributors, even with a support pseudo-role.

## Related

* [Buffs and debuffs](../data-model/buffs-and-debuffs.md) — the flagship test, the MAX-not-average
  rule, and which keys are excluded from cohesion.
* [Utility](../data-model/utility.md) — the three provision keys carved out of the
  declared-need judgement.
* [Diametric synergy](diametric-synergy.md) — the cohesion floor.
* `cohesion-fixture.mjs` — the objective function for support fit. A cohesion change that
  leaves it green is the only kind worth keeping. See
  [the verification loop](../tooling/verification-loop.md).

## Code notes

### [COH-01] A unit PLAYING support is judged as one, even with a DPS tag

`computeBuffUtilization` routes a supplier through the support-side measure whenever
`isDPS(supplier) && !isSupport(supplier)` is false — i.e. whenever it either isn't tagged DPS,
or IS tagged DPS but is also playing support. Remielle is tagged anomaly but is the support slot
on a triple-anomaly team; the DPS-side branch discards every "generic" buff (atk, cr, cd,
dmg...) on the grounds that a carry should not be judged on stat buffs it incidentally carries.
Both are right for a carry and wrong for her: her conditional ATK buff is not incidental, it is
the whole unit. Measured on the DPS-side branch her cohesion was 100% whether or not the
triple-anomaly condition was met, so the engine never asked whether her defining buff landed.
Owner: "for damage-dealing calcs she is a subdps... for buff relevance she is support. But
generally speaking, support wins."

`isSupport()` reads ACTIVATED roles, so a conditional support pseudo-role only counts when its
predicate holds — Cissia routes to the support-side measure only on a team with Seed. Affects
exactly three units: Remielle, Orphie, and Cissia-with-Seed.

The same fix applies to how a team-scoped conditional buff is measured: `resolveMapForUtil`
hands back the value the team actually unlocked, so measuring THAT value only ever asks "did
the 2 land?" — trivially yes. Cohesion instead measures the buff at its FULL size and treats the
shortfall as relevance that never arrived (Remielle's ATK buff is offered at 4 with half of it
landing — owner: 1600 ATK down to 700 "is 45%, which we have rounded to 50%"). Team-scoped
only: a recipient-scoped conditional is already routed to its best consumer and is a buff
correctly aimed elsewhere, not a shortfall.

### [COH-02] The element-buff menu, and Lighter

Element buffs are a MENU, not separate offerings: a unit carries fire AND ice so that one of
them matches whatever the team runs. `chargeableElementArms` charges only the arms that LAND,
crediting each in full; if NONE land, the largest is charged as dead weight — a menu where
nothing matches is a real mismatch and still deserves the hit.

For a unit with a single element buff this is arithmetically identical to charging it directly
(a lone landing arm charges itself, a lone missing arm is also the largest), which is why
Soukaku's unmatched ice buff keeps taking the hit it takes. Lighter is the only unit in the
roster with more than one element buff, so he is the only one this rule can move — and the only
reason it exists. `dpsRel` (no half-credit for a non-carry teammate) is what stops Soukaku's ice
arm scoring 0.50 through ice-elemental Lycaon and falsely passing the flagship band: buffing the
ice STUNNER's element is not the same as buffing the carry's.

### [COH-03] Delivery is priced at the square root of the L4 coefficient

`MULT`'s values are L4 PAIR-TERM coefficients, not a damage scale — L4 multiplies them by a
consumer weight and then soft-caps the whole layer at 100, so a 116x spread between sheer (81.0
to Yixuan) and ATK (0.7) is survivable there. Cohesion has no such cap: used raw, that spread
made every ATK support read 26-83% utilization and every sheer/ultimate support saturate.

`scaleImpact` therefore uses the SQUARE ROOT of the L4 coefficient. A support's share of a
team's damage is not linear in its pair coefficient, because L4 is one capped layer among
several. A buff worth `IMPACT_UNIT` still maps to exactly 1.0, so the anchor is unmoved and only
the spread compresses — sheer to 2.1x and ATK to 0.6x rather than 4.5x and 0.35x.


