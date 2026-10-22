# L4: Mechanical Synergy

The core layer. Every ordered supplier → consumer pair in the team is evaluated, then
team-wide bonuses are added on top.

## The three per-pair components

**Baseline Affinity** — broad stat interactions. ATK, crit rate and crit damage to attackers;
anomaly buffs to anomaly agents; DEF buffs to DEF scalers; defense and element debuffs to
damage contributors; stun infrastructure to window-dependent carries.

**Plus one term that is not a pair.** A unit whose kit buffs *itself* — Severian's crit damage
beside another wind unit — adds that buff to what its teammates pour into it, priced exactly as a
teammate's would be. See `[BUFF-09]` in [buffs and debuffs](../data-model/buffs-and-debuffs.md).

**And one term for a plain attacker doing the conventional job.** A single attacker with a fit
stunner and a fit support collects a credit in proportion to its tier, provided its kit asks for
nothing a teammate can feed. See [COMP-01](#comp-01-the-conventional-fit-credit) below.

**Need Fulfilment** — the supplier provides something the consumer explicitly *scales* with.
The highest-value category, and where `replaces` and
`converts` apply.

**Stun Emergence** — the consumer has burst damage that benefits from the supplier's stun
infrastructure.

## Then, team-wide

Anomaly reaction bonuses (vortex and disorder per agent), Refringe and its cascades, Maim,
anomaly-quantity scaling, [diametric synergy](diametric-synergy.md), an on-element /
off-element modifier, and the conditional
[under-activation penalty](../data-model/predicates.md).

The total is **not compressed**. It used to pass through a hyperbolic soft cap, on the reasoning
that this preserved mid-range differentiation while preventing runaway mechanical stacking. The
cap was removed — its ceiling was fixed while the roster is not, so it made the engine
progressively worse at separating new top-end units, and it was burying mispricings rather than
preventing them. See [known pitfalls](../notes/known-pitfalls.md) before proposing anything
shaped like it. The supportless judgement it had been quietly enforcing now lives in the
structure factor, `[PIPE-02]`.

## Principles that govern L4

### Scarcity determines value

Foundational stats — ATK, CR, CD — are replaceable through equipment and score low. Specialist
mechanics — veils, chains, aftershock, abloom — are irreplaceable and score high.

A rare mechanic matching a consumer's scaling always beats a common stat buff, all else equal.

### Supply gates fulfilment, and undersupply is worse than linear

Partially meeting a need helps, but disproportionately less than the fraction suggests. Lucia's
`veils: 1` against YSG's `veils: 2` is worth well under half.

`ultimates` is the exception. There, partial supply is priced as a straight fraction of the
need met rather than flat-discounted. Ju Fufu's single ultimate earns roughly:

| Consumer | Their `scaling.ultimates` | Ju Fufu covers | She earns |
|----|----|----|----|
| Miyabi | 1 | All of it | 3.2 |
| Yixuan | 2 | Half | 1.6 |
| YSG | 3 | A third | 1.1 |

The reason is the same as the L5 exemption: ultimates arrive naturally and almost nothing
supplies them, so covering a need only partly is a smaller bonus, never a penalty. See
[the ultimates two-channel model](ultimates-two-channel.md).

### Ultimates are a limited primary-carry resource

Only one unit gets the free ultimate per window, so it goes to the best damage dealer. **Sub-DPS
units receive no ultimate provision at all.**

Quick assists are *not* limited and benefit everyone, sub-DPS included.

Provision is scaled by the consumer's ultimate **magnitude**: a free ultimate is worth far more
to Seed than to a unit with a basic one, and nothing at all to a unit whose ultimate is not a
real burst.

### Ultimates and chains are naturally available

A dedicated provider makes them arrive *faster*, which is correctly rewarded — but lacking one
is not a [cohesion](cohesion.md) failure. That produces a deliberate asymmetry between L4 and
L5, explained in [the two-channel model](ultimates-two-channel.md).

### Self-provision excludes a need from cohesion

Banyue both scales with and provides interrupt-resistance, so it never counts as unmet.

This differs from damage mechanics like aftershock or abloom, where a large part of the ceiling
is damage dealt *by buffed teammates* — self-provision does not cover that.

### Scaling comes in three flavours

| Flavour | Meaning | Example |
|----|----|----|
| **Direct** | Scaling matches an existing damage type, so feeding it leverages a high multiplier | Evelyn: `scaling.chains` plus `damage.chain` |
| **Transformative** | Scaling feeds a conversion into something else; missing it leaves the unit far below its ceiling | Miyabi: disorders into enhanced attacks |
| **Constant** | Steady passive amplification, where a buff pays twice | Alice and Vivian convert AM into AP, making AM buffs doubly valuable |



## Code notes

### [COMP-01] The conventional-fit credit

**The Severian case.** Severian is a top attack carry, and all he wants from a team is ordinary:
a stunner to open windows and whatever ATK or crit damage the support brings. Before this rule the
engine ranked him well below Evelyn, who is a tier worse. L4 pays a carry only when a teammate
meets a need the carry declared. Evelyn declares chains, so Norma is paid for feeding her on
every team they share. Severian declares nothing, so nothing on the team was counted as feeding
him. On Butcher:

| Pair | L2 | Norma's pair into the carry | L4 total |
|----|----|----|----|
| Norma / Evelyn / Sunna | +18 | 71.4 (recovery 35.8, chain need 16.8) | 80.8 |
| Norma / Severian / Sunna | +35 | 22.2 | 38.0 |

His 17 extra points of tier credit could not cover a 43-point L4 gap. In the owner's words, it
scored a bazooka below a handgun because the handgun takes accessories.

**The rule.** The carry earns a credit in proportion to its tier when **all** of these hold:

1. The team is the conventional attack shape: one attacker, a stunner, and a support or defense
   unit. The classifier and this term call the same helper, so they cannot disagree about it.
2. The stunner provides stun infrastructure and does not `avoid` the carry's archetype.
3. The support does not `avoid` it either. That is what separates Lucia (who avoids attack) from
   Lucy. An unannotated support is neutral and qualifies.
4. The kit is plain:
   * nothing declared in `scaling` (a weight-1 appetite halves the credit, 2 or more removes it,
     and the `buffs` and `greedy` meta-flags count);
   * no team-scoped conditional in `damage`;
   * no `totalize`;
   * no `join` that mandates a second carry.

The tier ladder is the L2 carry bonus down to T1. From there it runs as a straight line to 0 at
T3, so Ellen and Zhu Yuan get a small credit for doing the job smoothly and T3–T4 get nothing.
The credit joins the carry's L4 total beside its self-buffs. It is therefore scaled by the
on-/off-element modifier, like the need credit it stands in for.

**Why this is not "a mechanic's existence has value".** Nothing in the kit is being paid for
existing. The consumer is the team: the credit is paid only when a fit stunner and a fit support
are present to cash the carry's damage. That is the conventional job, done as planned. A carry
with declared needs is already paid through the need channel, which is why need load switches the
credit off rather than stacking on top of it.

**Who is out, and why.**

| Unit | Why |
|----|----|
| Seed | Her `join` is `["attack"]`. With Cissia or Orphie resolving as the support, `Trigger/Cissia/Seed` *is* the conventional shape, so the shape gate alone let her through. The first measurement caught 283 such rows |
| Cissia | `scaling.buffs: 2` |
| Pyrois | Their strong ultimate turns on only beside a wind provisioner, and s/he is totalize |
| Hugo | Totalize. His real team is totalize plus double stun anyway |
| Sigrid, Evelyn, YSG | Declared needs, paid by the need channel |

**Measured** (preview corpus, rate 1.0): 4,532 team-boss rows moved, every one upward, signature
`l4raw+l4` and nothing else. The prediction was that every mover contains Severian, Nekomata,
Soldier 11, Ellen or Zhu Yuan; it had 0 exceptions. No Lucia, Seed, Pyrois or Hugo team moved.
Calibration anchors were unchanged.

What happened to Severian's best team as primary carry, per boss:

| Comparison | Before | After |
|----|----|----|
| Beats Evelyn's best team | 3 / 14 | 11 / 14 |
| Beats Sigrid's | 2 / 12 | 7 / 12 |
| Beats Seed's | 7 / 14 | 11 / 14 |
| Beats YSG's | 0 / 15 | 3 / 15 |

**The rate.** The sweep ran 0.5, 0.75, 1.0, 1.25, 1.5 and 1.75. The rate chosen, 1.0, is the
smallest that meets both targets: Severian's best team beats Evelyn's on Butcher, Marionettes
and HollowVenger Truvia, and he passes Sigrid on about half the bosses. 1.25 and above add only
one boss against each.

**What stays as it was.**

* `Lighter/Severian/Astra` still trails `Lighter/Evelyn/Astra` on Butcher, 291.5 to 301.9 raw.
  **Owner ruling: that is correct.** Severian can't use Lighter's buffs and Evelyn can. Evelyn
  also gains far more from Astra, while Severian wants Sunna more than Astra. Do not raise the
  rate to flip it. Rankings TEST 99 pins the Norma pair, not this one.
* Sigrid outranks Severian on ice-weak bosses such as Butcher and Marionettes. That is correct
  too: she is ice.
* Rupture (Yidhari, Starlight Billy) and armorer (Claret) are untouched by design. Rupture is
  already fed by its baseline, and Claret has no peer to measure against.
* Nekomata and Soldier 11 rise. That is predicted and wanted mechanically, but it has not been
  checked against the owner's playtesting.

Mechanics TEST 45 pins each gate, including Orphie standing in as the support. Rankings TEST 99
pins the Severian / Evelyn ordering.

### [COMP-02] Totalize: no recovery double count, and a lower totalize-qty rate

Owner: Hugo's kit is right (`totalize: 3`, T2.5), and its *credit* was too high. Even his best
team does not beat Sigrid, and among ice DPS he beats only Ellen. His best team still rates Good
on the ice-weak bosses he is built for (Marionettes, Thrall, Revenant). Before this, it beat
Sigrid's on 8 bosses (by up to 29.1 calibrated on Thrall), Yidhari's on 3, and Miyabi's on Horizon.

**Recovery counted totalize twice.** The recovery debuff paid `burstWeight + totalize × 2`, and
burst weight already holds `BURST_TOTALIZE`. Into Hugo that was 31.9 per stunner against Sigrid's
18.4. The extra term is gone, leaving 7.9, about twice an ordinary attacker's.

**Totalize-qty stays, at a lower rate.** `totalize × daze × MULT.TOTALIZE_QTY`, per stunner, is
the one term that prices what defines a totalize carry: more stunners mean more stun time to
convert. Totalize is only about 3 raw of a stunner's stun-emergence into Hugo, so this is not a
double count. Removing it was tried and rejected, because it put Hugo's best Marionettes team at
271.6 (OK). The rate went from 5 to 4.2, fitted to the owner's two requirements:

| `TOTALIZE_QTY` | Marionettes | Thrall | Revenant | Sigrid's smallest lead | Hugo over Ellen |
|----|----|----|----|----|----|
| 5 (before) | 296.2 | 320.9 | 322.6 | 11.7 | 26.2 |
| **4.2** | **292.0** | **316.7** | **317.6** | **14.8** | **23.0** |
| 4 | 290.9 (not Good) | 315.6 | 316.3 | 15.6 | 22.3 |
| 0 | 269.7 | 294.4 | 292.3 | 31.2 | 6.6 |

Hugo's best team on each boss, calibrated. "Smallest lead" is over all bosses, comparing each
unit's best team without a second attacker (`Dialyn/Ellen/Seed` is Seed's team). The table already
includes [BUFF-11] and the [WEAK-02] stunner falloff. Sigrid's smallest lead is on Fiend, which
resists fire and so disqualifies Norma, her best stunner. The next smallest is 17.5, on Thrall.

The 4.2 rate is tight at both ends: Marionettes clears Good (291.3) by 0.7, and Revenant sits 0.6
under Great (318.2). Rankings TEST 101 pins the ice ordering on every boss, and TEST 102 pins the
Good floor.
