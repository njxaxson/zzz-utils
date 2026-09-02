# zzz

A Zenless Zone Zero team-scoring and pull-recommendation engine. Given a
roster of units and a boss, it scores every legal team composition; given a
roster and a target unit pool, it recommends who to pull next. The two engines
share one mechanics vocabulary (`app/public/lib/common/team-scorer.js` and
`pull-engine.js`).

## Layout

| Path | What |
|----|----|
| `app/public/lib/common/team-scorer.js` | Scoring engine |
| `app/public/lib/common/pull-engine.js` | Pull recommendations |
| `app/public/lib/common/team-builder.js` | Team legality (`join`) |
| `app/public/data/units.json` | Unit data, tiers, mechanics |
| `app/public/data/bosses.json` | Boss data |
| `*.js` / `*.mjs` at repo root | CLI scripts (`matchups.js`, `compositions.js`, `test-scoring.mjs`, …) |
| `engine-context.md` | Game-domain knowledge and design intent — see below |
| `scoring-engine-open-issues.md` | **Short.** What is open, current test status, what to do next |
| `scoring-engine-internals.md` | The long form: post-mortems, mechanisms, and the wrong diagnoses. Read the relevant section before changing cohesion, disorders or the teamwork multiplier |

## When to read `engine-context.md`

It exists to hold what the code *can't* tell you: game-domain semantics and
*why* the engine is shaped the way it is. Read it (or the relevant section —
it's long, don't load the whole thing for a narrow question) when the task
involves:

- Adding, editing, or debugging a unit/boss `mechanics` entry in
  `units.json` / `bosses.json` — the field vocabulary (`pseudoRole`,
  `scaling`, `buffs`, `join`, conditional `when` predicates, etc.) is defined
  there, not in comments on the data file.
- Changing scoring logic in `team-scorer.js` or `pull-engine.js` — you need
  the design premise (mechanics-emergent scoring, not template matching — with one deliberate
  exception, `mechanics.archetypes`, which declares support-by-carry fit directly) and
  the L1–L5 layer responsibilities to know where a change belongs and what
  it might ripple into (role activation effects, cohesion, teamwork
  multiplier).
- Explaining or sanity-checking *why* a team/boss scores the way it does —
  archetypes, diametric synergy, anomaly reactions, element mutation, etc.
- Deciding whether new behavior is consistent with existing design intent
  (e.g. "should this new unit's buff count toward cohesion?").
- Working on the pull engine's gap detection, coverage, or codependency
  gating logic.

## When *not* to read it

- Pure UI/CLI/plumbing work with no game-semantics content: flag parsing,
  output formatting, `roster-ui.js` / `custom-dropdown.js` styling, build
  config, dependency bumps.
- Anything about a **specific number** — tiers, thresholds, weights,
  constants. The doc explicitly refuses to duplicate these; they live in the
  code (which is densely commented with rationale) and go stale in prose.
  Read the source directly.
- Mechanical refactors, renames, or type-level cleanup that don't touch
  behavior.
- Straightforward bug fixes where the bug is a code error (typo, off-by-one,
  wrong variable) rather than a misunderstanding of game mechanics.

## Verification loop

After any change to `team-scorer.js`, `pull-engine.js`, or the data files, run **all four**:

```bash
node test-scoring.mjs && node test-recommendations.mjs && node test-bucketing.mjs && node cohesion-fixture.mjs
```

The last two are not optional extras. `test-bucketing.mjs` caught a structural change that had
inverted a Deadly Assault allocation, and `cohesion-fixture.mjs` is the objective function for
support fit — a cohesion change that leaves it green is the only kind worth keeping. `test-scoring.mjs`
exits 0 when its failing set is exactly `KNOWN_RED`, so check the exit code, not the word "failed".

For a targeted look at one change, use `--debug` on a narrow team/boss set
before widening (see `engine-context.md` §7 for the full CLI flag reference
and typical debugging loop).

## Writing about the engine

These rules came out of a plan review where the first draft was rejected as
unreadable and two real errors in it turned out to have been *hidden by the
prose*. They apply to plans, issue write-ups, commit messages, and PR
descriptions — anywhere the engine is explained to a human.

1. **Name a problem after a concrete instance, not after its mechanism.**
   "The Sunna/Yixuan case" beats "partial buffs land badly", because the
   reader can hold two real units in their head and check the claim.
   "The Lighter case", "the Miyabi/Remielle case".
2. **Lead with the game situation, then the code.** Say what happens at the
   keyboard first; name `computeBuffUtilization` second, if at all.
3. **Technical vocabulary is fine in moderation — strings of it are not.**
   "Cohesion", "oversupply", "fit" are all fine words. "The absolute-supply
   threshold masks the fit ratio in the cohesion accumulator" is four of them
   stacked and is unreadable. Roughly one technical term per sentence.
4. **Show the arithmetic as a small table with real numbers** rather than
   describing a formula in prose.
5. **State what stays broken, not only what gets fixed.** For a change of any
   size the reader cannot trace the impact themselves; spell out what a step
   does and does not achieve, and say plainly which parts are guesses.
6. **Concise is not the same as good.** Spelling something out over five lines
   beats compressing it into one that has to be re-read three times.

## Measuring a scoring change

`scoring-diff.js` compares *rankings* and deliberately hides shuffles inside
tie groups, so it reports "no material changes" for a change that moved every
score in the corpus. Do not use it to check whether an engine change did
anything.

Use the dump/delta pair instead. Before each change, write down which teams
are allowed to move, then make `score-delta.mjs` list the exceptions — a green
test suite is not evidence, but a prediction with zero exceptions is.

```bash
node score-dump.mjs > matchups/before.txt
# ...make the change...
node score-dump.mjs > matchups/after.txt
node score-delta.mjs matchups/before.txt matchups/after.txt --predict Lighter
```

`score-delta.mjs` exits 1 when the prediction fails. `matchups/` is gitignored.

`test-scoring.mjs` keeps a `KNOWN_RED` map of tests that are red on purpose.
The suite exits 0 when the failing set is exactly that set, and 1 when
something else fails **or** when a listed test starts passing (remove the entry
— a stale list stops meaning anything). Never add an entry to silence a
regression.
