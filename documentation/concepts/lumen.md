# Lumen

Lumen is the seventh element and behaves unlike the other six. Remielle is currently the
unit that exemplifies it. Four mechanics matter.

## Attribute Mutation

Lumen damage morphs into the element of the **next agent in team order**. It counts as that
element for weakness and resistance, but it **does not fill that element's anomaly gauge**.

Consequences:

* A lumen unit generates no disorders and no vortex.
* A lumen unit is excluded from element-diversity checks.
* The scorer tries every morph target and keeps the best result, on the assumption that the
  player orders their team sensibly.
* A lumen unit is only disqualified against a boss if **all** morph targets are resisted.

## Lumiflux Buildup and Refringe

When a *non-lumen* anomaly teammate procs an anomaly while Lumiflux is up, that proc deals a
large extra hit. Because disorder and vortex damage both derive from proc damage, Refringe
**cascades** into reactions.

This is why multi-element partners beat same-element ones. Alice / Vivian / Remielle has
disorders for Refringe to cascade into; Alice / Jane / Remielle does not.

## Reading a lumen unit's element in code

This is the part that has actually caused bugs.

Morph scoring assigns a morph target onto the unit and re-enters the scoring pass. So *inside*
a scoring pass, asking a lumen unit for its element returns the **morph target** — the unit
does not read as lumen at all.

Anything that means "natively lumen" must therefore test the unit's tags, through
`isNativeLumen()`. The single exception is the morph search itself, which uses
`isUnmorphedLumen()` and terminates precisely because that goes false once a target has been
assigned.

Getting this backwards silently disabled both reaction guards, the element-diversity filter,
and the entire Refringe bonus. The two differently named helpers exist so that the choice
cannot be made by accident.

## Luminize

A lumen-only damage type. For Remielle it takes the form of **anomaly rebound**: she tracks
the last three mutations, combines their Refringe-boosted damage, multiplies by her Anomaly
Proficiency, and delivers the lot as one enormous hit.

The engine models this on two axes:

| Axis | Field | Meaning |
|----|----|----|
| The hit itself | `damage.luminize` | Raw output of the rebound |
| Its dependence on teammates | `scaling.anomaly: 3` | She needs a high volume of teammate procs |

She supplies none of that proc volume herself, which is why the anomaly-quantity supply count
excludes lumen entirely.

## Related

* [Elements and roles](elements-and-roles.md)
* [Anomaly reactions](anomaly-reactions.md)
* [The triple-anomaly archetype](../archetypes/triple-anomaly.md) — where Remielle's
  partner choice gets decided.

## Code notes

### [LUM-01] Lumen is exempt from the subdps "no reaction" cohesion charge

A native-anomaly subdps that generates no reaction of its own (no vortex, no disorder) is
charged an unmet need in `computeTeamworkMultiplier` — but only when anomaly is genuinely its
job. A stunner who picks up anomaly as a pseudo-role (Roxy) is valued as a wind ENABLER for
teammates who scale off it, not as a reaction generator herself, so she is not charged.

Native lumen gets a stronger version of the same exemption: it cannot react at all (Attribute
Mutation fills no gauge), so there is no output going nowhere to charge for. Remielle's value is
the Luminize rebound off teammate procs, priced separately in the anomaly-quantity channel via
`scaling.anomaly`. Without this exemption, every lumen team would pay a cohesion penalty for a
mechanical impossibility.


