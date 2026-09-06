# Deliberately Unmodeled

Things a reader may notice are missing. They are absent by choice, not by oversight. If you
spot one of these and think it is a bug, it has already been considered and declined.

## Relayed provision

A provision that reaches a consumer *through* an intermediary teammate is not traced.

`Dialyn/Sigrid/Sunna` and `Dialyn/Sigrid/Astra` take the identical cohesion hit, because
Sigrid's weak ultimate makes Dialyn's free ultimate land on nobody.

In principle the Astra line deserves a smaller hit. Dialyn gifts the ultimate to Astra; Astra's
ultimate provisions a chain attack to every teammate; and Sigrid, with `scaling.chains: 3`,
wants a free chain attack badly. So the value does reach her — just indirectly.

Modelling that means tracing provisions through an intermediary, which is a lot of machinery
for a difference this small. Revisit only if this hair genuinely needs splitting.

## Field hunger

How much a carry wants the field *to itself*, as distinct from `scaling.greedy`, which is about
needing the **stun window** to itself.

Banyue is field-hungry without being greedy: an off-field stunner like Ju Fufu suits her better
than an on-field one, which is part of why Ju Fufu edges Dialyn for her on fire-weak Pompey.
That is correct output arrived at *without* the mechanic.

The mechanic is **not going to be added at this time** — owner ruling. Do not reach for `scaling.greedy` to
express it; they are different questions.

## Mindscape and Potential synergies

The engine assumes one fixed investment level for every unit, so anything that only exists
above it is invisible. M2 Alice / Jane / Yuzuha is a top-tier team the engine cannot see. See
[investment assumptions](../concepts/investment-assumptions.md).

## Dead code paths

These are implemented and correct, and nothing currently reaches them.

### `converts`

The consumer-side self-conversion field described in
[scaling](../data-model/scaling.md#converts--consumer-side). Engine support exists. **No unit in**
`units.json` declares one.

It was built for Norma — quick-assists converting into chain attacks — but her kit was changed
late to upgrade a teammate rather than herself, and the field was left with no user.

Leave it in place; the machinery is small and a future unit will want it. But do not reason
about the engine's behaviour as though it fires.

### The `"shared"` field-time model

A field-time sharing model that no unit's data selects. Remielle used it before moving to
`onfield: false`. Same status as `converts`: implemented, unreached.

### `scaling.er`

Energy recharge as a scaling key is **inert**. Roxy (4), Orphie (3) and Velina (3) all declare
it, but no engine path reads it and no unit on the roster buffs energy recharge — so there is no
supplier to model it against and an energy-recharge subsystem would score nothing.

The annotations are retained as data-side documentation of those kits. Revisit if an
energy-recharge support ever ships.

### The armorer element diametric pair

The [element buff × element debuff](diametric-synergy.md) pair is deliberately left available to
[armorers](../concepts/armorer-laceration-gash-maim.md), because elemental damage is a
full-value armorer lever.

In practice it is currently **unreachable** for one:

| Piece | Who supplies it |
|----|----|
| The armorer | Claret, who is electric |
| The electric **debuff** | Cissia — the roster's only electric-element debuff supplier |
| The electric **buff** | **Nobody** |

So the pair cannot complete. This is a roster gap, not a code defect, and it closes on its own
the day an electric element buffer is released.