# zzz

A Zenless Zone Zero team-scoring and pull-recommendation engine. Given a roster of units and a
boss, it scores every legal team composition; given a roster and a target unit pool, it
recommends who to pull next. The two engines share one mechanics vocabulary
(`app/public/lib/common/team-scorer.js` and `pull-engine.js`).

## Documentation

**All documentation lives in [`documentation/`](documentation/). Start at
[`documentation/INDEX.md`](documentation/INDEX.md)** — it is a routing table that maps what you
are about to do to the two or three files you should read. Do not read the whole tree.

Three shortcuts worth knowing:

* [`documentation/STATUS.md`](documentation/STATUS.md) — what is open and whether the suites are green.
* [`documentation/notes/known-pitfalls.md`](documentation/notes/known-pitfalls.md) — read before trying anything clever with cohesion, disorders or the teamwork multiplier. Most obvious ideas have already been measured and rejected.
* [`documentation/notes/adjudications.md`](documentation/notes/adjudications.md) — settled calls. Do not re-litigate these.

## Layout

| Path | What |
|----|----|
| `app/public/lib/common/team-scorer.js` | Scoring engine |
| `app/public/lib/common/pull-engine.js` | Pull recommendations |
| `app/public/lib/common/team-builder.js` | Team legality (`join`) |
| `app/public/data/units.json` | Unit data, tiers, mechanics |
| `app/public/data/bosses.json` | Boss data |
| `lib/calibration.js` · `app/public/lib/common/calibration.js` | Archetype calibration transform (node / browser copies) |
| `app/public/data/calibration.json` | Generated per-archetype anchors — regenerate, don't hand-edit |
| `*.js` / `*.mjs` at repo root | CLI scripts (`matchups.js`, `compositions.js`, `test-scoring.mjs`, …) |
| `documentation/` | Everything else |

## Verification loop

After any change to `team-scorer.js`, `pull-engine.js`, or the data files, run **all four**:

```bash
node test-scoring.mjs && node test-recommendations.mjs && node test-bucketing.mjs && node cohesion-fixture.mjs
```

The last two are not optional extras. `test-bucketing.mjs` caught a structural change that had
inverted a Deadly Assault allocation, and `cohesion-fixture.mjs` is the objective function for
support fit. Both suites exit 0 only when the failing set is exactly their `KNOWN_RED` map — so
check the exit code, not the word "failed".

**Then regenerate and re-certify calibration.** The suites all assert against raw scores, so a
stale `calibration.json` fails silently and only shows up as wrong-looking ladders:

```bash
node generate-calibration.mjs        # rewrites app/public/data/calibration.json (add -p for preview)
node calibration-check.mjs           # must report 0 within-archetype rank inversions
```

`node generate-calibration.mjs --check` exits 1 when the committed file is stale, so it is the
cheap guard if you only want to know *whether* regeneration is needed.

> **The staleness fingerprint hashes raw file bytes** of `team-scorer.js`, `units.json` and
> `bosses.json` — so even editing a *comment* trips it. That is not a false alarm to work
> around: regenerate, then confirm that the only fields which changed are `engineFingerprint`
> and `generated`. Identical anchors after a regeneration is a strong proof your change was
> behaviour-neutral.

## Measuring a change

`scoring-diff.js` compares *rankings* and hides shuffles inside tie groups, so it reports "no
material changes" for a change that moved every score. **Do not use it to check whether an
engine change did anything.** Use the dump/delta pair instead — write down which teams are
allowed to move first, then make `score-delta.mjs` list the exceptions. A green suite is not
evidence; a prediction with zero exceptions is.

```bash
node score-dump.mjs > matchups/before.txt
# ...make the change...
node score-dump.mjs > matchups/after.txt
node score-delta.mjs matchups/before.txt matchups/after.txt --predict Lighter
```

Full detail in [`documentation/tooling/measuring-a-change.md`](documentation/tooling/measuring-a-change.md).

## Comments in code

Production code carries **short references, not essays**. One line of plain English, then a tag:

```javascript
// Lycaon is exempt from the stunless carve-out. [COH-04]
```

The reasoning behind `[COH-04]` lives in the cohesion doc, under a heading of that name. If it
explains **the code**, keep it in the code and keep it short. If it explains **why the code
isn't something else** — a past state, an argument against a change, a defect history — it
belongs in `documentation/` behind a tag. See
[`documentation/reference/TAGS.md`](documentation/reference/TAGS.md).

## Updating test cases

Don't split existing tests into multiples; it causes havoc. A single test case is allowed to
have multiple parts.

Never add a `KNOWN_RED` entry to silence a regression. The suite exits 1 both when something
unexpected fails **and** when a listed test starts passing — a stale list stops meaning
anything.

## Writing about the engine

Rules for plans, issues, commit messages and PR descriptions:
[`documentation/notes/writing-about-the-engine.md`](documentation/notes/writing-about-the-engine.md).
