# Conditional Values and the `when` Predicate

One predicate vocabulary drives both [pseudo-role activation](pseudorole.md) and conditional
mechanic values. Anything added to `evaluatePredicate` becomes available in both places
automatically.

## The predicates

| Predicate | Passes when |
|----|----|
| `{ "countTag": "<tag>", "minCount": n }` | The team, self included, has at least *n* units with that tag |
| `{ "hasUnit": "<ident>" }` | See identifier forms below |
| `{ "notPresent": "<ident>" }` | The inverse of `hasUnit`, same identifier forms |
| `{ "role": "<role>" }` | The **consumer receiving the value** has that effective role |
| `{ "provisions": "<something>" }` | A teammate provisions the designated thing |

### Identifier forms for `hasUnit` / `notPresent`

* A plain id — `"miyabi"` — matches that unit by id.
* A **colon-qualified** `"<role>:<element>"` — `"anomaly:wind"` — matches any unit with that
  *effective* role and that element.

### `provisions` 

Currently used on Pyrois: `"when": { "provisions": "anomaly:wind" }, "value": 1 }`
This provision triggers when a unit explicitly provides wind anomalies (e.g. Roxy), or implicitly provides them (e.g. wind anomaly unit Velina). 

### The `role` predicate is recipient-scoped

It asks about the consumer receiving the value, not about the unit declaring it. That makes it
meaningful only for conditional mechanic values, never for pseudo-role activation, which is
self-scoped.

In a team-global context with no consumer, `role` evaluates false and falls through to the
default case.

## Writing a conditional value

Any mechanic value may be a scalar, or:

```json
{ "cases": [ { "when": {...}, "value": 2 }, { "value": 1 } ] }
```

The first passing case wins. A case with no `when` always passes, so it works as the default —
put it last.

## Two scopes, two very different penalties

### Team-scoped — `countTag`, `hasUnit`, `notPresent`, `provisions`

Resolved once per team. Remielle's ATK curve by anomaly count is the example.

These carry an **under-activation penalty**: a *squared* gap between the value that actually
resolved and the maximum value the unit could have reached. Large misses are punished
disproportionately, which is exactly what pushes Remielle hard toward
[triple-anomaly](../archetypes/triple-anomaly.md) teams and away from a comfortable
stunner-plus-support line.

### Recipient-scoped — `role` only

Resolved per consumer. This is how **narrow buffs** work: Koleda and Roxy give `laceration` to
armorers and `cd` to everybody else, expressed as two cases in one kit.

Recipient-scoped values are **exempt** from the under-activation penalty. A per-recipient buff
is never "under-activated" — utilisation resolves it to the best value that actually reaches a
carry, so a correctly routed narrow buff is never charged as unlanded.