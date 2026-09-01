# Scoring engine — status

Concise by design. Deep history, post-mortems and the reasoning behind every fix live in
`scoring-engine-internals.md`; this doc is for "where do things stand and what is left."

Last reviewed 2026-09-01. Branch `intentional-archetypes` — not merged; see *For release* below.

## Test status

| suite | state |
|----|----|
| scoring | **108/109.** 1 red on purpose (TEST 101) |
| cohesion fixture | **11/11** — owner judgements on support fit (`node cohesion-fixture.mjs`) |
| bucketing | 6/6 |
| recommendations | 43/44. TEST 43 red on purpose |

Support fit is resolved: archetypes are declared in `mechanics.archetypes` and read by the engine,
and the acid test holds (making a buff worse never raises a team's score). Details in internals §8d.

## Open

| # | issue | example / status |
|----|----|----|
| 7 | **Miyabi ladder (TEST 101)** — 5 rungs out of order | `Nangong/Miyabi/X` scores below `Miyabi/Vivian/Y` where the ladder wants the reverse. **Before tuning, re-verify the target with the owner** — it was built by confirming engine output, the same way the Evelyn ladder was, and that one was later reversed. Next up (release step 5). |
| 3 | **Remielle ceiling** — how hard is the cap? | Non-triple-anomaly Remielle teams should sit low; they do on a neutral boss (≤240), but a favourable matchup pushes higher (`Nangong/Promeia/Remielle` 289 on ice-weak Scorched Horizon). Is 240 a hard cap everywhere, or a neutral-boss figure? Owner call. |
| 11 | **Dual attackers not penalised** — minor | `Norma/Evelyn/Soldier 11` sits mid-ladder for Evelyn; two attack carries can't both hold the field. `scaling.greedy` doesn't catch it (role collision, not a window collision). Owner: "definitely a bug." |
| 9 | **Pull engine can't see partner quality** — feature, not blocking | Remielle's ceiling depends on having Velina; the pull engine never calls the scorer, so it rates her the same with or without. Recommendations TEST 43 pins this, red on purpose. |
| 5 | **Disorder supply — one loose end** — minor | For an under-met need the appetite term cancels, so a supplier earns the same whether the consumer wanted a little or a lot. Investigate per need-key before changing (see internals). |

## Parked / adjudicated (don't re-open)

* **TEST 7** — Evelyn stunner ladder. Ordering is correct and pinned. Two things parked: the
  Norma/Dialyn band mandate (dropped — only matters for bucketing when Dialyn is on top), and the
  Dialyn-beats-Lighter *margin* (0.6 short; closing it means moving a ring-fenced constant).
* **Lighter vs Dialyn \~30 apart for Evelyn on Pompey** — order confirmed, gap arguable, not worth
  holding the engine.
* **Nangong/Yixuan/Sunna** — looked like the bane, turned out to be the **flagship proof** of
  emergent scoring (owner play-tested it; the engine was right, prevalent thought wrong). Rupture
  removed from Sunna's avoid; TEST 15 reversed to assert the team rises. Internals §8d.

## Recently closed (2026-09-01)

Support-fit rebuild and the run-up to it: TESTs 3, 4, 7, 9, 13, 14, 18, 22, 62, 63, 64, 74, 75, 80,
81, 100, 106, 108, plus bucketing 4/6 → 6/6. Mechanisms: relevance is a max not an average;
off-element stunners aren't penalised; baseline buffs (`atk`/`sheer`) are flagship-eligible;
chains/ultimates land on any DPS; archetypes declared in data; `fit = delivered/achievable` (acid
test). Full record in internals.

## For release

Done: steps 1–3 of the release plan (fixture, archetypes, acid test). Remaining:

* **Step 4** — re-anchor numeric bands wholesale (scales have widened) with owner sign-off.
* **Step 5** — decide TEST 101 (issue 7 above).
* **Step 6** — correctness pass: read the top-10 per boss, since the original complaints came from
  reading output, not tests. First thing to check: option 3 lifted some rupture teams with
  mismatched supports (`Yixuan/Zhao/Astra` reached 361, unpinned).

## Working notes

* `scoring-diff.js` hides shuffles inside tie groups — reports "no changes" for a change that moved
  everything. Use the dump/delta pair, and state a prediction before each change.
* A green suite is not evidence; a prediction with zero exceptions is. `matchups/` is gitignored.
* **Predict by effective role, never by tag** — that produced two false predictions in two days
  (Soukaku, Caesar).

```bash
node score-dump.mjs > matchups/before.txt
# ...change...
node score-dump.mjs > matchups/after.txt
node score-delta.mjs matchups/before.txt matchups/after.txt --predict <units>
node cohesion-fixture.mjs   # the objective function for support fit
```


