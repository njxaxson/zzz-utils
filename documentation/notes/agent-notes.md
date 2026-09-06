# Working in this repo

Notes for whoever — human or agent — is about to change the scoring engine. Everything here
is derived from what actually went wrong repeatedly, not from theory.

---

## The shape of the problem

Almost every change to `team-scorer.js` has a **wide blast radius**. The corpus is roughly
7,000 legal teams across 18 bosses, so a structural change routinely moves several thousand
scores. Recent structural changes moved 2,171, 2,564, 3,665, 7,575 and once 33,957 rows. There
is no such thing as a local change to a layer.

That is why the working method is not "make the change and run the tests". It is:

1. Write down, before touching anything, **which teams are allowed to move and in which
   direction.**
2. Dump the corpus.
3. Make the change.
4. Dump again and make `score-delta.mjs` list every row that moved outside your prediction.
5. Zero exceptions, or you do not understand the change yet.

A green suite has been green through every large defect in this engine's history. A prediction
with zero exceptions is the only evidence that has ever been reliable.

## Before you conclude anything

* **Was the team disqualified?** A disqualified team scores −1, never reaches the damage layer
  and emits no debug output at all. An empty trace is far more often a disqualification than a
  dead channel.
* **Did the harness give you the team you asked for?** `parseTeams` auto-fills an
  under-specified spec, so a two-unit request silently becomes a three-unit team with a
  different third member. Print `team.map(u => u.id)`.
* **Are you comparing two bosses?** Scores are only comparable inside one matchup. Four tests
  once ranked teams by their best score across all bosses, and every conclusion drawn from them
  had to be withdrawn.
* **Is the element modifier doing it?** The damage layer scales pair totals by element, so the
  same three numbers come out reordered on a weak boss. Measure mechanism-level deltas on the
  **synthetic neutral boss** first.
* **Is this raw or calibrated?** The engine returns raw. Tools that compare archetypes display
  calibrated. Two different scales, and the historical record is entirely raw.

## Localising a gap

The single most efficient probe in this repo is a **layer-by-layer diff of one team against the
same team with one member swapped.** It answers "is this in the raw score or in the
multiplier?" in one run, and that question has redirected three investigations that had already
picked a wrong answer. One gap that had been blamed on disorder enablement and then on role
misclassification turned out to have identical raw scores on both sides — 503.1 against 502.4 —
and a cohesion factor of 0.40 against 1.00.

The second most efficient is **mutating the data in memory and re-scoring**: strip one buff,
force a unit on-field, retier a unit, and see what the number does. That verifies what the code
does rather than what you think it says, and it is how the Burnice/Yanagi ruling was settled
term by term.

## Predictions: enumerate the way the code does

The most repeated mistake in this record is predicting by **tag** when the code being changed
reads **effective roles**. It has failed twice in the engine with 225 and 1,456 exceptions, and
once more inside a verification script. Check both directions — units with the tag and a
contradicting pseudo-role, and units with the pseudo-role and a contradicting tag — and
remember that a pseudo-role can be conditional.

Second most repeated: **adding a structure tier is never local.** Every `=== STRUCTURE.X`
comparison is a place where a new tier changes behaviour by *not* matching, and "did not match"
fails silently and upward. Grep the identity comparisons before adding a tier, and prefer
comparing factors.

Also expect `score-delta.mjs` and a property check over the corpus to disagree on structural
changes — the delta excludes rows that were already non-viable. One measurement saw 7,164
against 7,575. Not a discrepancy.

And **re-dump the baseline** if anyone has edited the data since your last dump. A delta once
carried ten unexplained rows that turned out to be someone else's data edit landing in a stale
baseline.

## When a change moves nothing

Ask whether it changed any behaviour at all. Score-neutrality has twice looked like a clean
landing and once meant the fix was empty: combining two ultimate axes with `max` instead of an
override was provably neutral across all three suites, and worthless, because the annotation
could never win the `max`.

The opposite case exists too — a genuinely latent fix, where the predicted delta is zero
*because the unit that would expose it does not exist yet*. That is fine, but it needs a
synthetic fixture (clone a unit with the flag set) rather than a corpus measurement, and the
test should assert the structural key off the trace rather than the score, because a synthetic
change usually moves the score for several reasons at once.

## Tests

* **Mutation-check every new test.** Break the mechanism deliberately and confirm that test —
  and ideally only that test — goes red. Four tests in this repo have been found unable to fail.
* **Do not split an existing test into several.** A single test is allowed to have multiple
  parts; splitting causes havoc. (Project rule, from CLAUDE.md.)
* **Never add a `KNOWN_RED` entry to silence a regression.** The suite fails when a listed test
  starts passing, which is the point — a stale list stops meaning anything.
* **A floor or ceiling anchored to the wrong scale cannot tell a large fix from a small one.**
  One test anchored to a ladder floor around 385–495 went green after two of three changes,
  before the change that did most of the work; the owner's stated bar was around 240.
* When a test goes red, decide explicitly whether the assertion or the engine is wrong, and
  write the reason down. "The test went red so I moved the number" is how a suite stops meaning
  anything. Prefer **rewriting** a test that pins the wrong quantity over re-baselining it.

## After the change

Run all four suites and then regenerate calibration — a change to the scorer or the data
invalidates the per-archetype anchors, and the suites cannot catch that because they all assert
against raw scores. The exact commands are in CLAUDE.md. Never hand-edit
`app/public/data/calibration.json`.

## Asking the owner

* Ask for the expected ordering **before** showing scores. Confirming engine output produced one
  ruling that was later reversed against player statistics, and every adjudication obtained that
  way carries the same risk. The cohesion fixture marks each entry `stated` or `confirmed`
  precisely so the weaker ones can be identified later.
* A boss-conditional reordering is often **legitimate**. Two ladders in this repo hold on
  element-favourable bosses and invert on neutral ones, and in both cases forcing them
  everywhere was proved impossible with any uniform lever before the owner accepted the
  conditional form. Bring the arithmetic showing *why* no lever works, not just the failure.
* When the engine confidently disagrees with received opinion, that is a case to test in play
  before overriding. It has been right at least once against everybody's expectation.

## Writing it up

The project's writing rules are in CLAUDE.md and they are enforced. The two that matter most
here: name a problem after a concrete instance rather than its mechanism, and show arithmetic as
a small table with real numbers. A write-up was once rejected as unreadable and two real errors
in it turned out to have been hidden by the prose.

State what stays broken, not only what got fixed, and say plainly which parts are guesses.
