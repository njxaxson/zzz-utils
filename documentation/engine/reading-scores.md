# Reading Scores

Two things to internalise before you draw a conclusion from a number: there are **two scales**,
and scores are only comparable **within one boss**.

## Raw and calibrated

`scoreTeamForBoss` returns a **raw** score and always has.

Raw scores are not comparable across archetypes. Anomaly has more mechanics than attack or
rupture, so an anomaly team accumulates more scoring events and ceilings far higher. That is a
difference in *how much there is to score*, not in how good the team is. Getting anomaly's
internal ordering right is what let those totals run away in the first place.

[Archetype calibration](calibration.md) divides that out, outside the engine. The engine is
untouched and knows nothing about it.

Two consequences worth holding onto:

**A single multiplier per archetype cannot reorder anything within that archetype.** A per-agent
ladder — Alice's best teams, say — is usually one archetype all the way down, so it reads
identically on both scales. Calibration only changes an ordering where the ladder *mixes*
archetypes.

**Boss-matchup signal survives it.** The multiplier is global, not per-boss, so an anomaly team
still climbs on an anomaly-shill boss. Per-boss calibration would erase exactly the L3 signal
the engine exists to produce, and is not on the table.

### Which scale each tool speaks

This is a deliberate choice per tool, not an accident.

| Calibrated — compares archetypes | Raw — same-unit or same-archetype only |
|----|----|
| `matchups.js`, `deadly-assault.js` | `rankings.js`, `compositions.js` |
| Deadly Assault allocation and DPS bucketing | Every test suite |
| The web pages and `strength-rating.js` | `pull-engine.js`, which never calls the scorer |

`rankings.js` staying raw is the load-bearing case: it compares variations of the *same* carry,
and raw is what resolves the fine ordering between them.

## Scores are only comparable within a boss

A score is a team's fit against **one** matchup, not a portable rating.

Different bosses contribute wildly different amounts of weakness, shill, assist, debuff and
`anti` credit, so the scales are not commensurate. A team scoring 583 against Butcher and
another scoring 498 against a neutral boss tell you **nothing whatsoever** about each other.

### Never rank teams by their best score across bosses

`compositions.js` displays a per-agent ranking that way for convenience. It is fine as a
browsing aid and is not a valid basis for a comparison or a test.

An earlier version of tests 98–101 did exactly that, and every conclusion drawn from them was
unsafe until they were rewritten to evaluate each boss in a silo.

### How to pin an ordering properly

Assert it **per boss**, and choose the bosses so the axes vary independently. The Miyabi ladder
tests use four:

| Boss | What it varies |
|----|----|
| Butcher | Anomaly shill plus ether/ice weakness |
| Marionettes | Weakness, no shill |
| Girtablullu | Shill, effectively neutral to the units involved |
| Synthetic neutral | The control |

An ordering that survives all four is not an artifact of shill or of element weakness.

Remember that viability differs per boss too. A rung that is disqualified on one matchup has to
be **skipped** there, not counted as a failure.

## Strength bands

The app's authoritative bands live in `strength-rating.js`, descending:

> Excellent → Great → Good → OK → Tough → Risky → Bad

A team containing an A-rank carry is demoted exactly one tier from the top band regardless of
score.

Interpretively: the top band is a near-optimal matchup; *Great* and *Good* clear comfortably;
*OK* clears with skill; *Tough* is difficult even played well; *Risky* and *Bad* are not viable
for endgame content.

These cutoffs are on the **calibrated** scale, and they were re-derived there rather than
translated from the old raw ones. The previous five bands were fitted to a corpus that topped
out far higher, and handed the top label to anomaly teams on the strength of their bigger
numbers rather than their merit.

Thresholds shift whenever the engine is retuned or calibration is regenerated. Read them from
the file; do not memorise them.

## DPS bucketing

`dps-buckets.js` sits downstream of scoring. When optimising three Deadly Assault teams, raw top
scores cluster around the same carry with interchangeable supports, so five "options" that
differ by one support are useless.

Results are grouped by a carry **fingerprint** — role, element and tier band — and one
representative is taken per distinct assignment pattern, preferring the highest-scoring
realisation. The web app toggles between this diversity view (the default) and raw score order.

See [Deadly Assault allocation](../bucketing/deadly-assault.md).
