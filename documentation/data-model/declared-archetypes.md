# `mechanics.archetypes` — Declared Support Fit

A support says outright which carry archetypes it is built for and which it is the wrong tool
for. This is the **one deliberate exception** to the engine's
[mechanics-emergent premise](../engine/design-premise.md).

## Shape

```json
"archetypes": { "intended": ["anomaly"], "avoid": ["rupture"] }
```

Roles are drawn from the four carry archetypes: `attack`, `anomaly`, `rupture`, `armorer`.

Unlisted archetypes are **neutral**, and so are units with no annotation at all — Ben and
Caesar, neither of whom plays a support role.

### Narrowing a declaration by the carry's element

A declaration can be narrowed to carries of one element, or one element variant, and either can
be negated:

| Declaration | Covers |
|----|----|
| `rupture` | every rupture carry |
| `rupture:ice` | ice rupture carries only |
| `rupture:!ice` | every rupture carry **except** ice ones |
| `anomaly:ice:frost` | ice anomaly carries with the frost variant (Miyabi) |
| `anomaly:ice:!frost` | ice anomaly carries without it (Promeia, not Miyabi) |

A variant carry counts as its base element, so `anomaly:!ice` excludes Miyabi too. The same
syntax works in `intended` and `avoid`.

**The Soukaku case.** Soukaku declares `avoid: ["armorer", "rupture:!ice"]`. Behind Starlight
Billy, Banyue, Komano or Yixuan she is a poor backfill — Lucy's crit-damage buff is worth more
than Soukaku's ice buff there. Behind Yidhari, the one ice rupture carry, her ice buff lands and
she is an adequate backfill, better than Lucy. Plain `avoid: rupture` was imprecise: it charged
Lucia/Yidhari/Soukaku the full wrong-tool penalty for a pairing the owner calls valid.

## Why it is declared rather than derived

Eight attempts to derive support fit from buff lists all failed on the same rock: a ratio over
a support's own kit cannot distinguish

* **wrong tool** — Yuzuha's anomaly kit on a rupture carry — from
* **narrow but right** — a support who lands one huge buff and is tier zero.

Declaring it is more honest than a model that produces wrong answers for opaque reasons.

## How it scores

Judged against the **primary carry only** — the highest-tier real DPS. A pseudo-anomaly
stunner is never the hub.

| Verdict | Effect |
|----|----|
| `intended` | Pays nothing. Fitting the carry is the baseline, not a bonus |
| neutral | Nothing |
| `avoid` | A flat penalty, applied **after** the teamwork multiplier |

Applying the penalty after the multiplier means a wrong-tool verdict bites the same regardless
of how cohesive the rest of the team is. The penalty is deliberately separate from the
[cohesion](../engine/cohesion.md) multiplier — the two must never charge the same judgement
twice.

Every support's verdict is printed in the `--debug` trace, so a wrong or missing annotation is
visible rather than silently neutral. A neutral verdict produced by a qualifier that did not
match names it, e.g. `neutral ("rupture:!ice" does not match)`.

### Three readers, one matcher

The declaration is read in three places, all through the scorer's `archetypeSpecMatches`, so
that none of them can understand a qualifier the others ignore:

| Reader | What the verdict does there |
|----|----|
| `scoreArchetypeFit` (scorer) | `avoid` costs a flat −40 |
| `computeTeamworkMultiplier` (scorer) | decides whether an idle pseudo-role is capped — see [TWM-03](../engine/teamwork-multiplier.md) |
| `makeTeamLegality` (pull engine) | `avoid` makes the pairing illegal for recommendations [PULL-07] |

The pull-engine reading is much harsher than the scorer's, deliberately. The pull engine pushes
ideal pairings; the scorer must stay honest about backfills a real roster may need.

**Nangong** declares `intended: ["anomaly"]` and no `avoid`. Her `intended` exists for the cap,
not for the −40, which `intended` never pays anyway. She must never carry `avoid: rupture` — that
is the Sunna case below.

## An `avoid` can look right in a vacuum and be wrong in play

`avoid` is for a unit that is genuinely the wrong tool, not for a team that merely looks
unconventional.

**The Sunna case.** Sunna carried `avoid: ["rupture"]` because an attack-and-anomaly support on
a rupture carry looks like a mismatch. It was removed after playtesting, for a reason that is
worth internalising:

* Sunna can only reach a rupture carry alongside Nangong, because of
  [join rules](../concepts/additional-abilities-join.md).
* Nangong + Sunna is exactly the stun [wheelchair](../archetypes/wheelchairs.md) — fast tier-0
  stun, extra daze, stacking stun multiplier — that a greedy-window rupture carry like Yixuan
  wants.

The emergent logic had this right the whole time. The `avoid` tag was suppressing the engine's
own correct answer.

> When the engine confidently disagrees with your intuition about a support, test it in play
> before overriding it with an `avoid`.

## What this does not fix

Declaring fit tells the engine *which* archetype a support belongs to. It says nothing about
*how much* the support contributes within that archetype, and nothing about relationships
between two supports. Those still have to be emergent, or declared separately through
[`synergy.units`](unit-object.md#synergyunits--the-named-partner-bonus).

## Code notes

### [ARCH-06] The qualifier grammar

`parseArchetypeSpec` accepts `archetype`, `archetype:[!]element` and
`archetype:element:[!]variant`, and throws on anything else, so a malformed declaration fails the
first time it is read rather than quietly matching nothing. Negating the element and then naming
a variant (`rupture:!ice:frost`) is rejected because it can never mean anything. The variant name
is not checked against a fixed list — variants are whatever `mechanics.elementalVariant` holds —
so mechanics TEST 43 checks that every variant named in the data is declared by some unit.

`archetypeFitDetail` parses every declaration before matching any, so a malformed entry after a
matching one still throws.
