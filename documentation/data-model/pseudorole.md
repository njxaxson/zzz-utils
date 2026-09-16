# `pseudoRole`

A unit's native role is one tag. `mechanics.pseudoRole` lets it hold more, either always or
under a condition. An activated pseudo-role **is** the unit's role for scoring.

## Shape

A mixed array of plain strings, which are always active, and `{ "role": …, "when": … }`
objects, which are conditional.

Activation is **entirely data-driven**. There are no hardcoded activation rules anywhere in
the engine — if a unit behaves oddly, the cause is in `units.json`, not in the scorer.

## Live examples

| Unit | Definition | Behaviour |
|----|----|----|
| Caesar | `["stun"]` | Always a pseudo-stunner |
| Remielle | `["subdps", "support"]` | Both always on; an off-field sub-DPS and support hybrid |
| Roxy, Norma | `["subdps"]` | Stunners who are also sub-DPS units |
| Nangong | `[{anomaly, when countTag anomaly ≥ 1}]` | Anomaly only alongside an anomaly-tagged unit |
| Soukaku | `[{anomaly, when hasUnit miyabi}]` | Anomaly *only* with Miyabi, otherwise a pure support |
| Yanagi | `[{subdps, when hasUnit miyabi}]` | **Demoted** to sub-DPS when Miyabi is present |
| Burnice | `[{subdps, when notPresent velina}]` | **Promoted** to primary carry when Velina is present |
| Cissia | `[{subdps, …}, {support, …}]`, both `when hasRole attack:electric ≥ 2` | Both roles, or neither, on a team with a second electric attacker |

See [predicates](predicates.md) for the `when` vocabulary.

## Yanagi and Burnice are inverse patterns

They are worth holding side by side, because their **pull-engine defaults differ** as a
result. With no team context to evaluate against:

| Predicate | Default with no team | Consequence |
|----|----|----|
| `hasUnit` | Does **not** activate | Yanagi reads as a primary carry |
| `notPresent` | **Does** activate | Burnice reads as a sub-DPS |

## The special `"dps"` pseudo-role

`"dps"` marks a support or defense unit as a primary DPS participant for individual-power scoring. It should also save a team from a three-support exclusion. 

A unit declaring **both** `dps` and `support` is always treated as forced-secondary. Its kit is
split between personal damage and team support, so it never earns full primary carry credit.

## On-field derivation

Defaults:

| Role | On field? |
|----|----|
| attack, anomaly, rupture, armorer, stun | Yes |
| support, defense | No |

When a pseudo-role activates, on-field status follows the **activated** role, unless
`mechanics.onfield` overrides it explicitly.

Soukaku has no override, so she is on-field exactly when her anomaly role fires — which is
exactly when Miyabi is present.

## Knock-on effects

Activating a role is not a local change. It moves the unit between the carry and support
halves of several calculations at once. See
[role activation ripple effects](../engine/role-activation-ripple.md) before adding one.
## Code notes

### [FIELD-01] Conditional `onfield` needs a raw resolver, and `isSharedField` reads it too

`mechanics.onfield` can be a conditional spec, which means it has to be resolved per team
alongside `_resolvedDamage`. Two things make that sharper than it looks.

**`resolveConditionalValue` ends in `w()`**, which maps `'shared'` and `false` alike to 0. The
field-time model distinguishes three states — on, off, and shared — so it needs a
**raw-preserving** resolver. Do not merge the two functions.

**`isSharedField` must be updated alongside `isOnField`.** It gates a *disqualification*
(reliable defensive assists), so a stale read there turns a legal team illegal or the reverse —
the harshest silent consequence available.

Burnice is the reason the machinery exists. Velina had no `onfield` flag and defaulted to
on-field because she is anomaly-tagged, which denied a sole-carry bonus to every team pairing her
with a real carry — `Burnice/Remielle/Velina` collected it and looked like it was cheating, when
in fact everyone else was being denied one. But marking Velina off-field **alone** leaves that
team with nobody on field at all, tripping the no-primary-damage-dealer penalty and costing
Burnice 45. So Burnice takes a conditional `onfield` mirroring her existing `subdps` conditional:
off-field normally, on-field beside Velina. The two fixes only work together.

The `'shared'` state itself is currently declared by nobody — see
[deliberately unmodeled](../engine/deliberately-unmodeled.md).
