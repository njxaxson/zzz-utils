# Conditional Values and the `when` Predicate

One predicate vocabulary drives both [pseudo-role activation](pseudorole.md) and conditional
mechanic values. Anything added to `evaluatePredicate` becomes available in both places
automatically.

**And in the pull engine**, which imports the same function. That sentence used to be true only of
the scorer: the pull engine carried a fork that understood three keys and silently answered
`false` for everything else. See [PRED-03].

## The predicates

| Predicate | Passes when |
|----|----|
| `{ "countTag": "<tag>", "minCount": n }` | The team, self included, has at least *n* units with that tag |
| `{ "hasRole": "<role>[:<element>]", "minCount": n }` | The team, self included, has at least *n* units with that **effective role**, optionally narrowed to one element |
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
## Code notes

### [PRED-01] `optional` — a conditional buff that is allowed not to fire

A team-scoped conditional buff is normally charged when it lands below its maximum: a squared
gap, subtracted straight from the team's Layer 4 total with nothing damping it.

That is right for Remielle and Phoenix, whose conditional buff **is** the codependency — a
Remielle who is the only anomaly agent on the team has failed at the thing she is for.

It is wrong for a generalist support who merely happens to help anomaly teams. `optional: true`
on the spec is how the data says so. Sunna is the first user: without it, her anomaly buff would
cost her a crippling amount on every team with no native anomaly agent, which is most of the
attack archetype.

**It has to do two things, and only doing the first is a trap.** Waiving the penalty is the
obvious half. The other half is that an `optional` conditional is measured at what it **resolved
to**, not at its maximum, everywhere cohesion looks at it. Without that, the unmet buff becomes
the unit's largest offering, misses, and craters her buff utilisation — which costs L2 tier and
rank *and* the teamwork multiplier. Measured on a fixture: the penalty was worth 315 and the
utilisation collapse was worth another 166, so fixing only the penalty fixed under two thirds of
the problem.

Per-buff rather than per-unit, deliberately: a unit may reasonably carry one conditional it
depends on and another it does not. Mechanics TEST 29 asserts both halves — a unit without the
flag still takes the full charge — because a test that only checks the opt-out cannot tell "the
flag works" from "the penalty stopped firing entirely".

### [PRED-03] `hasRole`, one shared evaluator, and the no-team defaults

`countTag` counts a raw tag in a vacuum. It cannot express *"a second **electric attacker**"*,
because it understands neither effective roles nor element — and that gap was being papered over
with `hasUnit: "seed"`, which named one unit where the real condition was a kind of unit. Cissia
does not care that it is Seed; she cares that somebody else is an electric attacker.

`hasRole` closes it. Self is counted, matching `countTag`. The element is optional, so
`"attack"` counts the role at any element and `"attack:electric"` narrows it.

**It defers in pass one**, like `othersDisorder`, because it reads resolved roles. Cissia does not
need that — `attack` is a native tag on every unit that could satisfy her, so her answer is the
same in both passes — but the *family* does. Without the deferral a future `hasRole: "anomaly:ether"`
would read `getEffectiveRoles`' unconditional fallback in pass one and answer differently depending
on array order in `units.json`. Deferring makes the whole family order-independent by construction.

#### One evaluator, two engines

`evaluatePredicate` is exported and the pull engine's `isSubdps` calls it. It used to fork:
three keys handled by hand and `return false` for anything else, which meant a new predicate key
was understood by the scorer and invisible to the recommendations. Reconciling the fork needed two
things written down rather than left implicit:

**No-team defaults.** With no team to evaluate against, `notPresent` answers **permissively** and
every other key answers **restrictively**. That is what makes Burnice read as a sub-DPS and Yanagi
as a primary carry with no team context — the table in [pseudoRole](pseudorole.md). It is now one
stated rule instead of two implementations that happened to agree.

**Self is counted exactly once.** The scorer counts the whole team including the asking unit; the
fork filtered a self-excluding list and added a self-count back, which double-counted wherever the
caller's roster already contained the unit. Callers normalise now.

Three sites in the pull engine still read `when.countTag` directly. Those ask *"which tag would
the user need to own?"* — introspection, not evaluation — and `evaluatePredicate` cannot answer
it. They skip `hasUnit`/`notPresent`/`hasRole` knowingly.

Measured: the predicate moved **0 rows** before any data used it, and sharing the evaluator moved
**0 rows** with the recommendation suite still green — the same two-step proof [PRED-02] records.

### [PRED-02] `allOf`, `othersDisorder`, and two-pass role activation

Soukaku is the reason all three exist, and the reason is a game fact: she is the non-frost ice
partner Miyabi disorders with, and she is **only played that way when nobody else is doing that
job**. Beside Vivian or Nangong you are not running her for disorders at all — you are running
her to buff ice and attack.

Her predicate used to be `hasUnit: miyabi`, which promoted her to anomaly on every Miyabi team.
That made an A-rank support a full third carry: Nangong paid her **27.1** where he pays Astra
**0**, with three of his buffs landing at exactly the rate Miyabi gets them. She outscored Astra
behind Nangong/Miyabi by 0.3, which is not a close call, it is a wrong answer.

**`allOf`** lets a predicate ask two questions. Every other key asks one, first-match-wins.

**`othersDisorder`** asks whether the members of the team OTHER than this unit already disorder
with each other. Asking about the others is what keeps it out of a cycle — Soukaku's own element
never enters the answer, so her promotion cannot depend on itself.

It is asked in **element** terms rather than role terms, and that is load-bearing. A count of
anomaly *roles* gets two teams wrong: Remielle is anomaly-tagged but is lumen and procs nothing,
and Velina's wind makes a **vortex** with Miyabi rather than a disorder. Neither is a disorder
partner, so Soukaku must still backfill beside them — and an element-level question says so for
free. Variant-aware, because frost and plain ice genuinely do disorder.

**Two-pass activation.** `othersDisorder` reads *resolved* roles, so it cannot be answered in the
same pass that produces them. Pass one settles every predicate that reads raw tags or unit
identity, which today is all of them — this is where Nangong promotes to anomaly beside Miyabi.
Pass two re-answers with those roles visible, and Nangong's promotion is exactly what stands
Soukaku down. A role-reading predicate resolves **false** in pass one rather than looping.

The invariant here was originally written as *"nothing may depend on another unit's role-reading
predicate — all sixteen pseudo-role predicates read raw tags or identity."* That stopped being
true when Cissia's roles moved to `hasRole`, so state the rule that actually carries the weight:

> **No role-reading predicate may consume a role that another role-reading predicate produces.**

Two exist today and they are disjoint. Soukaku *produces* `anomaly` and *consumes* the proc
elements of anomaly-role units; Cissia *produces* `support`/`subdps` and *consumes*
`attack:electric`, and she is never anomaly. Two passes remain sufficient exactly while that holds.

A third predicate reading `anomaly:<element>` would depend on Soukaku's own two-pass answer and
break it. If that day comes: **refuse the data, do not add a third pass.**

Measured: the machinery moved **0 rows** before Soukaku's data used it, and her data then moved
**10 teams with zero exceptions** — exactly those where Miyabi already has a partner. Mechanics
TEST 30 pins it on whether she actually appears in the team's disorders, not on a score.
