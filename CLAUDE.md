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
  the design premise (mechanics-emergent scoring, not template matching) and
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

After any change to `team-scorer.js`, `pull-engine.js`, or the data files:

```bash
node test-scoring.mjs && node test-recommendations.mjs
```

For a targeted look at one change, use `--debug` on a narrow team/boss set
before widening (see `engine-context.md` §7 for the full CLI flag reference
and typical debugging loop).
