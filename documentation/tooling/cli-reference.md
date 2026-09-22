# CLI Reference

Every script and its flags. Verified against the code, not against older documentation.

`-h`, `-?` or `--help` on any script that uses `lib/cli.js` prints its *actual* supported flags,
which is always more authoritative than this page.

## Shared flags (`lib/cli.js`)

Each script enables a subset. Two scripts — `pulled.js` and `tiers.js` — enable none of them.

| Flag | Short | Purpose |
|----|----|----|
| `--teams` | `-t` | Explicit teams: slash-separated units, comma-separated teams |
| `--bosses` | `-b` | Boss filter, comma-separated, fuzzy-matched. `"butcher:raging"` selects a variation |
| `--debug` | `-d` | Full layer-by-layer scoring breakdown |
| `--include` | `-i` | Teams must include at least one of these units |
| `--depth` | *(none)* | Results per boss. Has **no short flag**; use the numeric shorthand `-10` |
| `--only-mine` | `-m` | Use the personal roster from `roster.json` |
| `--preview` | `-p` | Include unreleased (`available: false`) units |
| `--units` | `-u` | Unit whitelist |
| `--version` | `-v` | Filter units/bosses to those released by this update or earlier (e.g. `1.0`) |
| `--exclude` | `-x` | Unit blacklist |
| `--flex` | `-f` | Universal units that may join any team |
| `--rank` | `-R` | Filter by rank, S or A |
| `--element` | `-e` | Filter by element |
| `--score` | `-s` | Minimum score |
| `--range` | `-r` | Inclusive score range, two integers, order does not matter |
| `--omit` | `-o` | Suppress headers and context (terse output) |
| `--flat` | *(none)* | Emit teams in condensed form, suitable as a `-t` value |
| `--query` | `-q` | Share-URL query string for roster and bosses |
| `--tsv` | *(none)* | Tab-separated, column-padded output instead of CSV |
| `--clean` | *(none)* | Delete existing `.csv` / `.tsv` output files before writing |
| | `+Unit` | Add a unit to the roster override |
| | `-Unit` | Remove a unit from the roster override |

**`--score` and `--range` are on a per-script scale.** Calibrated in `matchups.js` and
`deadly-assault.js`; raw everywhere else. See [reading scores](../engine/reading-scores.md).

## Scripts

| Script | Purpose |
|----|----|
| `matchups.js` | Top teams per boss. The main diagnostic. Adds a synthetic neutral boss for baseline comparison. Displays the **calibrated** score with raw and the archetype alongside. Default depth 20 |
| `compositions.js` | Pivot of matchups: top teams per *agent*, with the bosses they excel against |
| `deadly-assault.js` | Three-boss allocation with no unit overlap. See [Deadly Assault allocation](../bucketing/deadly-assault.md) |
| `teams.js` | Valid team enumeration. Join conditions only, no scoring |
| `pull-debug.js` | Runs the [pull engine](../recommendations/pull-engine.md) from the CLI |
| `pulled.js` | Roster by mindscape and weapon. No flags |
| `tiers.js` | Units by tier. No flags |
| `bosses.js` | Bosses grouped by elemental weakness and favored DPS archetype. Only enables `--version` |
| `rankings.js` | Per-agent CSV of top teams, one column per boss that agent cares about — element-weak, shill match, or explicitly favored. Writes `matchups/<agent>.csv`. Carries no scores, so it diffs as a pure ordering artifact. Enables `--tsv` and `--clean` |
| `reformat-units.mjs` | Normalises `units.json` formatting |

### Analysis scripts

| Script | Flags |
|----|----|
| `score-dump.mjs` | `--preview` / `-p` only. Full-corpus TSV: one row per (boss, team) with the raw score, 13 layer columns and the team's archetype |
| `score-delta.mjs` | Two positional dump files, plus `--predict NAME[,NAME…]`, `--predict-none`, `--eps N` (default 0.05), `--top N` (default 20), `--exceptions N` (default 40) |
| `generate-calibration.mjs` | `--check` (exit 1 if the committed file is stale), `--preview` / `-p` (writes `calibration.preview.json`) |
| `calibration-check.mjs` | `--boss NAME`, `--top N`, `--mix`, `--alignment`, `--preview`, `--json` |
| `cohesion-fixture.mjs` | `--verbose` / `-v`, `--fail`, `--stated` |
| `scoring-diff.js` | Two positional saved ranking files. Does **not** use `lib/cli.js` |
| `test-mechanics.mjs` | Engine-mechanics assertion suite (isolated rules, not roster rankings). Accepts a `-N` test filter |
| `test-rankings.mjs` | Roster-ranking assertion suite (score floors/orderings/ladders). Accepts a `-N` test filter |
| `test-recommendations.mjs` | Pull engine assertion suite |
| `test-bucketing.mjs` | Deadly Assault allocation suite — marginal value and rank bands |

### The corpus flag on `score-dump.mjs`

The corpus is fixed and takes no roster flags on purpose: a baseline you can accidentally narrow
is not a baseline. `--preview` is the one exception, and it changes which units exist rather than
which teams are enumerated.

## Typical debugging loop

Start narrow:

```bash
node matchups -t "Nangong/Aria/Sunna,Aria/Burnice/Sunna" -b Priest --debug
```

Then widen to the full landscape for one unit, and confirm nothing else regressed:

```bash
node matchups -i Miyabi -b Butcher -10
```

Then run [the full verification loop](verification-loop.md).

### Lumen debug traces

The [morph search](../concepts/lumen.md) runs under `--debug` too. It scores every Attribute
Mutation target silently, then re-scores the **winning** combination with the trace on. So a
debug score for a lumen team matches its real score, and the `Lumen morph:` line names the target
that won.

Before that fix the debug path skipped morphing entirely and the two scores disagreed.
