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

An earlier version of rankings TESTs 79–82 did exactly that, and every conclusion drawn from them was
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
translated from the old raw ones. The bands before that were fitted to a corpus that topped out
far higher, and handed the top label to anomaly teams on the strength of their bigger numbers
rather than their merit.

They were re-derived a second time after the anomaly overhaul and the L4 cap removal. The top
three labels came out **much** narrower than before — Excellent, Great and Good together cover
under 2% of viable (boss, team) pairs, where *OK* alone covers about 21%. Read that as intended:
the top band is a near-optimal matchup, not a good one.

### Why this is not a recurring chore

The cutoffs sit on the calibrated scale, and calibration pins every archetype's top-10 anchor to a
**fixed target of 400** — `factor[a] = 400 / anchor[a]`. An ordinary retune moves the anchor and
the factor moves with it, so calibrated scores stay put by construction. That is the whole job of
the transform, and it means these thresholds do **not** need revisiting every time a constant
changes.

Removing the L4 cap was the exception, and instructive about which changes are. Compression was
**non-linear**: it squeezed high scores harder than low ones, so undoing it rescaled the entire
corpus — every archetype, not just anomaly — and changed the *spacing* between teams rather than
only the magnitude. A per-archetype scalar cannot absorb that, so it surfaced as a genuine shift
in where the labels landed and the cutoffs had to be re-derived by hand.

The rule to carry forward: **a linear retune is absorbed by calibration; a change to a non-linear
term is not.** Now that anchors are computed on uncompressed output, there is no non-linear term
left in Layer 4 for a future change to disturb.

### The exception: a pooled archetype is not self-absorbing

The argument above rests on `factor[a] = 400 / anchor[a]` — an archetype's factor is derived from
its own anchor, so when one moves the other follows. A **pooled** archetype breaks that identity on
purpose: it takes its host's factor, not one derived from its own ceiling. Armorer is pooled into
attack; see [calibration](calibration.md).

For a pooled archetype the absorption fails in both directions:

* Retune the pooled archetype's own output and its calibrated scores move, so its strength labels
  move with them.
* Retune the **host's** ceiling and the pooled archetype rescales with no change of its own at all.

So the full rule is: a linear retune is absorbed for a self-anchoring archetype, is not absorbed for
a pooled one, and a non-linear change is absorbed for neither. Check the `pools` map in
`calibration.json` before assuming a retune is free.

Thresholds still move if the engine gains one. Read them from the file; do not memorise them.

## DPS bucketing

`dps-buckets.js` sits downstream of scoring. When optimising three Deadly Assault teams, raw top
scores cluster around the same carry with interchangeable supports, so five "options" that
differ by one support are useless.

Results are grouped by a carry **fingerprint** — role, element and tier band — and one
representative is taken per distinct assignment pattern, preferring the highest-scoring
realisation. The web app toggles between this diversity view (the default) and raw score order.

See [Deadly Assault allocation](../bucketing/deadly-assault.md).
