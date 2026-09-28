# The unit context

`units.json` data is **read-only**. A scoring pass resolves seven values against the team it is
scoring — activated roles, conditional damage, conditional on-field state, effective AP, proc
input, proc damage, and a lumen morph target — plus a unit's own self-targeted buffs, and every
one of them is written onto a `UnitContext`, never onto the unit.

```javascript
export class UnitContext {
    constructor(unit) {
        const source = unit instanceof UnitContext ? unit.unit : unit;
        Object.assign(this, source);
        this.unit = source;
    }
}
```

`scoreTeamForBoss` wraps once, at the only public entry, and hands the contexts to
`scoreTeamContexts`, which is the pass proper. Contexts are discarded when the call returns.

## Why it is a copy and not a facade

Because a context has to be **interface-identical to a unit**. Eleven exported helpers —
`isDPS`, `isStun`, `isSupport`, `isOnField`, `getElement`, `getEffectiveRoles`, `hasSubDPSRole`,
`getEffectiveScaling`, `getBasicDamageBaseline`, `getMaxBurstWeight`, `getChainMagnitude` — are
called by `pull-engine.js` and the UI pages on **raw units**, outside any scoring pass. They
answer from the resolved value when one is present and from the raw declaration when it is not.
Copying the source fields is what lets one implementation serve both callers, so none of those
read sites had to change.

Two other things depend on a context being a plain data bag: `isValidTeam` spreads its arguments
in `expandFactionJoins`, and `evaluatePredicate` reads `u.tags` and `u.id` straight off team
members. A prototype-delegating or getter-based wrapper would have lost those own properties to
the spread and silently disqualified every faction-join team.

## The one thing a context holds differently from its unit

A context's `mechanics.buffs` holds only the buffs the unit hands its **teammates**. Buffs written
with `target: "self"` are split off in the constructor into `_selfBuffSpecs`, and resolved per
team into `_resolvedSelfBuffs`. Every buff reader inside a scoring pass is therefore correct
without knowing self-targeted buffs exist. Code outside a pass reads raw units, so it goes
through `getTeammateBuffs` / `getSelfBuffSpecs`, which answer the same way for a raw unit or a
context. See `[BUFF-09]`.

## What the `_` prefix means now

`_activatedRoles`, `_resolvedDamage`, `_resolvedOnfield`, `_effectiveAP`, `_procInput`,
`_procDamage`, `_morphedElement`, `_selfBuffSpecs` and `_resolvedSelfBuffs` are **context
fields**. The prefix marks them as resolved for one pass rather than declared in the data; a
raw unit never has them, which is exactly what the fallback branches test for.

## Code notes

### [CTX-01] Resolving onto the unit was shared mutable state, and nothing pinned the cleanup

The engine used to write all seven fields directly onto the objects parsed from `units.json`,
then remove them again in a `cleanupRoles()` closure hand-called on four separate exit paths.
Those unit objects are parsed once per process and handed out by reference to every team, so a
pass was writing to global state that roughly 7,000 other teams shared.

Three defects followed from that, in increasing order of how reachable they were:

* **No parallelism was possible.** Two workers scoring different teams would have been writing
  the same 62 objects.
* **There was no `try/finally`.** A throw anywhere in the six layers left all six fields in place,
  and the *next* `scoreTeamForBoss` call read them as if they were its own. Cross-call
  contamination, reachable today, silent when it happened.
* **The cleanup was unpinned.** No test asserted it ran, and a fifth early return added later
  would have leaked without any suite noticing.

`_morphedElement` was already the awkward one: it is written and deleted by the lumen morph
search across recursive calls, and was deliberately excluded from `cleanupRoles` because clearing
it from an inner pass wiped an outer lumen unit's target mid-search. Splitting the entry point in
two fixed that by construction — both recursive calls now re-enter `scoreTeamContexts` with the
**same** context array, so the morph state survives re-entry without anything special. Its
`delete` inside the search stays, because `isUnmorphedLumen` reads the field's absence as the
recursion terminator; that is the algorithm, not hygiene.

The replacement is pinned by TEST 35 in `test-mechanics.mjs` and, more bluntly, by the five test
suites deep-freezing the roster after load (`deepFreeze` in `lib/data.js`) — any surviving write
throws rather than landing. The freeze is deliberately *not* inside `loadUnits`, so that mutating
the roster in memory and re-scoring, which
[agent notes](../notes/agent-notes.md) calls the second most efficient probe in this repo, still
works in ad-hoc CLI scripts.

The change was proved behaviour-neutral the way this repo requires: a byte-identical
`score-dump.mjs` corpus (137,942 rows) and a regenerated `calibration.json` whose only changed
fields were `generated` and `engineFingerprint`.
