# The Verification Loop

After any change to `team-scorer.js`, `pull-engine.js` or the data files, run **all four**
suites, then regenerate and re-certify calibration.

```bash
node test-scoring.mjs && node test-recommendations.mjs && node test-bucketing.mjs && node cohesion-fixture.mjs
```

```bash
node generate-calibration.mjs        # rewrites app/public/data/calibration.json
node calibration-check.mjs           # must report 0 within-archetype rank inversions
```

## The last two suites are not optional extras

`test-bucketing.mjs` caught a structural change that had inverted a
[Deadly Assault allocation](../bucketing/deadly-assault.md) — nothing in the scoring suite saw
it, because every individual team still scored correctly.

`cohesion-fixture.mjs` is the **objective function for support fit**. A cohesion change that
leaves it green is the only kind worth keeping.

### Why the cohesion fixture exists at all

Every previous attempt at "does this support belong on this team?" was judged against the
scoring suite, where unrelated numeric bands move on any change and drown out the signal you
care about. A change that **fixed** the mechanism could look like a regression, and a change that
broke it could look clean. Eight attempts failed partly for want of a single number to optimise.

The fixture holds the owner's judgements as **ordered pairs and bands** — never absolute scores,
which are impossible to keep self-consistent — in `cohesion-fixture.json`. It scores those teams
with the live engine and reports how many hold. Exit code 0 when every selected entry holds.

## Why a stale `calibration.json` fails silently

**No test suite will catch it.** They all assert against raw scores, which is exactly the point:
raw is what pins the engine's own behaviour.

But [calibration](../engine/calibration.md) anchors are fitted to the corpus that the engine and
the data produce. A change to `team-scorer.js`, `units.json` or `bosses.json` invalidates them,
and the only symptom is a wrong-looking cross-archetype ladder that nobody is asserting on.

The cheap guard, if you only want to know *whether* regeneration is needed:

```bash
node generate-calibration.mjs --check   # exits 1 when the committed file is stale
```

It compares a SHA-256 fingerprint over exactly those three files.

## Why `KNOWN_RED` works the way it does

`test-scoring.mjs` keeps `KNOWN_RED`, a map from test number to reason, for assertions that
encode an ordering the owner believes correct but the engine does not yet produce.

| Failing set | Exit code |
|----|----|
| Exactly the `KNOWN_RED` set | 0 |
| Anything else fails | 1 |
| A listed test **starts passing** | 1 |

That third row is the interesting one. A stale list stops meaning anything — if entries can
linger after they are fixed, nobody trusts the list and it stops being a record of real
disagreements between the owner and the engine.

**So check the exit code, not the word "failed" in the output.** A run that prints failures and
exits 0 is a passing run.

Every entry needs its reason and what would clear it.

> **Never add an entry to silence a regression.**

If only one assertion in a multi-assertion test is red, split it into its own test number so the
rest keeps guarding.

## Test conventions

Each case is a `run('TEST N: description', () => { … })` block. Build teams with
`scoreForTeamString`, filter bosses with `withBosses`, look up scores with `scoreMapForBoss`,
and assert with `assert(condition, message)`.

Failure messages should embed the actual scores — that is what makes a regression diagnosable.

Test numbers are sequential. When engine retuning forces a threshold change, update it and note
why in the comment block.

### Assert the mechanism, not the total

An absolute score is not on any effectiveness scale, so it moves on nearly every engine change
and has to be re-baselined for reasons unrelated to what the test guards. Worse, re-pinning it
silently codifies whatever the engine currently does, including orderings the owner rejects.

Test 107 guards burst contention and used to pin four exact totals. It now reads
`trace.contention` off the scorer's trace option and asserts it is zero for greedy-1 teams and
negative for a dual-greedy one.

Sweeping tests should carry an anti-vacuity count — `assert(checked > 50, …)` — and comparisons
must be **siloed per boss**, never by best-score-across-bosses. See
[reading scores](../engine/reading-scores.md#scores-are-only-comparable-within-a-boss).

### Compare pairs that differ in exactly one unit

A complaint usually arrives as "team A should beat team B", and A and B often differ in two
slots. That phrasing is fine for a bug report and useless as a test, because a failure cannot
tell you which swap caused it.

Test 110 was written straight from a complaint reading "Jane/Viv/Yuzuha should be better than
Nangong/Aria/Jane", which swaps Vivian → Aria **and** Yuzuha → Nangong. It became
`Jane/Vivian/Yuzuha` against `Nangong/Jane/Vivian`, isolating the Yuzuha → Nangong swap the
complaint was actually about.

### Favour correct ordering over margins

Owner's standing position. Where a margin assertion and an ordering pull against the same
constant, **relax the margin and keep the ordering**.

The margins in this suite are almost never calibrated; they are "comfortably ahead" written down
as a number. Note the reason in the test comment when you move one. Test 62's Dialyn-over-Koleda
margin went from 20 to 15 so that the chains-buff multiplier could reach the value Koleda needed
to outrank Pan Yinhu.

## Related

* [Measuring a change](measuring-a-change.md) — why a green suite is not evidence that a change
  did what you intended.
* [CLI reference](cli-reference.md)
