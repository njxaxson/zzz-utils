# The Scoring Pipeline: L1 to L5

`scoreTeamForBoss` starts from a base score, resolves activated roles and conditional damage
against the team, then runs six layers. This page says what each layer is responsible for, so
you know where a change belongs.

**Final score = raw × teamwork multiplier.**

## The layers

| Layer | What it does |
|----|----|
| **L1 Disqualifications** | Hard failures returning −1. Deliberately narrow |
| **L1.5 Structure** | Classifies the composition and scores field-time economy. Feeds the teamwork multiplier — **it is not added to the score** |
| **L2 Inherent Quality** | Individual power independent of team context: tier and rank |
| **L3 Boss Matchup** | Shill, favored units, `weak` mechanics, element weakness and resistance, boss debuffs, assists |
| **L4 Mechanical Synergy** | The core. Directional pairwise evaluation of every ordered teammate pair, plus team-level bonuses |
| **L5 Additional Synergies** | Hand-curated `synergy.units` and `synergy.tags`. Low-weighted; a fallback for what mechanics cannot express |

### L1 in detail

The full disqualification list: an illegal `join`
arrangement, no DPS at all, three *pure* DPS, a DPS whose tag matches the boss's `anti`, a
**damage dealer** whose element is resisted, or too few reliable defensive assists.
`synergy.avoid` is checked alongside.

### L2 in detail

Carries score at full weight. Support, defense and stun units score at reduced weight **gated
by buff utilisation** — a support at 30% utilisation keeps roughly 9% of their quality bonus,
because the gate is squared. Plus a titled bonus, a totalize stun-demand penalty and a
wasted-DPS-buff penalty.

### L3 in detail

Also where a **missing non-DPS shill disqualifies**. A [stunless](../archetypes/stunless.md)
carry exempts a stunnerless team from a stun shill.

## Field-time economy (L1.5)

| On-field agents | Effect |
|----|----|
| 0 | Penalty — no primary damage dealer |
| 1 | Bonus — an efficient solo carry |
| 2 | Neutral |
| 3+ | Penalty — field competition |

## No support or defense is its own tier

A team with no effective support and no effective defense — pseudo-roles included, so Orphie,
Remielle and Cissia-alongside-Seed all count — is demoted to a dedicated no-support tier.

Supports exist because buffs matter, and forgoing one is a genuine teambuilding failure rather
than a stylistic choice. The hit is meant to be large.

Before this rule, `Nangong/Miyabi/Vivian` and `Nangong/Miyabi/Yuzuha` classified identically,
which is why triple-anomaly lines outranked the [wheelchairs](../archetypes/wheelchairs.md)
they should lose to.

**The demotion applies to every classification and takes the harsher of the two factors.** It
used to fire only on teams that had already classified as conventional, which meant a
supportless team was scored *better* for also being unconventional:

| Team | What happened |
|----|----|
| `Nangong/Alice/Miyabi` | Classified as double-anomaly-plus-stunner, kept the unconventional-viable factor, never reached the no-support tier |
| `Nangong/Alice/Sunna` | The supported counterpart — and it *lost* on Miasmic Fiend |

Taking the harsher of the two rather than overriding is also what stops a supportless *wildly*
unconventional team being promoted **up** to the no-support tier.

## No stunner is its own tier too, graded by carry role

Two tiers, not one:

| Carry role | Without a stunner |
|----|----|
| Attack | Badly off — an attacker's damage lives inside the stun window |
| Rupture | Worse off than with one, but not as badly. Rupture-plus-double-support still ranks above a stunnerless attacker |
| Anomaly | **No such tier at all.** Anomaly teams lean on reactions rather than burst, so they need supports more than stunners |

A `stunless` carry never reaches these, since such a unit receives its stun multiplier whether
or not the enemy is stunned.

**The exemption is role-agnostic.** It reads the attack, rupture *and* armorer carry lists,
because nothing stops a rupture or armorer carry being stunless and such a team must not be
charged for a window it never wanted. Anomaly is deliberately excluded — it has no no-stun tier
to be exempted from, and a stunless anomaly agent would affect reaction cadence too.

Ye Shunguong is the only stunless unit in the data today and she is `attack`, so the rupture
and armorer halves are currently latent. Test 115 synthesises the rupture case rather than
waiting for the unit that would expose it.

Before this tier existed, `Starlight Billy/Pan Yinhu/Lucia` and `Dialyn/Starlight Billy/Lucia`
both classified as conventional at full credit — so two supports and no stunner earned exactly
the same structural credit as stunner-plus-support, and Pan won on raw supply. Pan Yinhu is the
*support* slot in the rupture archetype, not the stunner slot.

## Which compositions accept a second carry

These differ by role and must not be collapsed.

| Shape | Second carry allowed? |
|----|----|
| **Anomaly** | Yes, unconditionally. Most anomaly teams *want* two anomaly bodies, ideally with one a sub-DPS or a pseudo-stunner. That is the baseline assumption, because the team is built to produce reactions |
| **Rupture** | **Never.** One rupture carry only |
| **Attack** | Only when the second attacker is explicitly a **sub-DPS** or a **pseudo-support**. Sharing an element is *not* interaction — two carries of one element cannot disorder with each other and still cannot both hold the field |
| **Attack + anomaly** ([monoshock](../archetypes/monoshock.md)) | Only when the attacker declares `scaling.anomaly` — Harumasa and Sigrid. `scaling.am` and `scaling.ap` are **stats, not mechanics**, and must never be read as evidence that a kit runs on anomaly |
| **Armorer** | Two armorers are conventional — [Maim](../concepts/armorer-laceration-gash-maim.md) is the shared-resource payoff |

**One exemption: [totalize](../archetypes/totalize.md) plus double stun.** There the second
stunner *is* the support — totalize damage *is* stun uptime, so a second stunner feeds the
carry the way a support otherwise would. This is deliberate; `Anby/Qingyi/Hugo` is a real team.

## Related

* [L4 components](l4-components.md) — what happens inside the core layer.
* [Teamwork multiplier](teamwork-multiplier.md) — what L1.5 feeds into.
* [Role activation ripple effects](role-activation-ripple.md) — how a pseudo-role changes each
  layer's answer.
* [Lenient mode](element-resistance.md#lenient-mode) — what happens to L1 for a limited roster.


