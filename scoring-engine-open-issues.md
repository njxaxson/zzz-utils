# Scoring engine — status

Concise by design. Deep history, post-mortems and the reasoning behind every fix live in
`scoring-engine-internals.md`; this doc is for "where do things stand and what is left."

Last reviewed 2026-09-02. Branch `wide-blast-radius-recovery` — not merged to `main`; see
*For release* below.

## Test status

| suite | state |
|----|----|
| scoring | **116 pass, exits 0.** One `KNOWN_RED`: TEST 113 |
| cohesion fixture | **11/11** — owner judgements on support fit (`node cohesion-fixture.mjs`) |
| bucketing | **6/6** |
| recommendations | 43/44. TEST 43 red on purpose (issue 9) |

Support fit is resolved (archetypes declared in `mechanics.archetypes`; the acid test holds — making
a buff worse never raises a team's score) and the Miyabi ladder is closed. Internals §8d and §8e.

The rankings pass is in internals §R — five structural fixes, each landed with a stated prediction and zero
exceptions.

## Open

| # | issue | example / status |
|----|----|----|
| 16 | **Sub-DPS tier is halved beside a same-type carry — a double count** | Velina is T0 *because she is an outstanding sub-DPS*, so her tier already prices the role; halving it re-prices her as "half of a T0 primary carry", which is not what her T0 means. She banks +20 where Miyabi banks +55, which is why the Miyabi track outranked the Velina track for every carry. Fires only when a sub-DPS stands beside another same-type carry (`isSecondaryAttacker` / `isSecondaryAnomaly`); the separate `isForcedSecondaryDPS` halving is a genuine role-collision charge and is **correct** — do not conflate them. Not fixed here because un-halving lifts Vivian too (+9 against Velina's +20, so only ~11 net in the Velina track's favour), does nothing for the Alice ordering, and has a wide blast radius: Velina, Vivian, Norma, Roxy, Burnice, Grace, Cissia, Orphie. Post-release correctness item. |
| 5 | **Disorder supply — one loose end** — minor | For an under-met need the appetite term cancels, so a supplier earns the same whether the consumer wanted a little or a lot. Investigate per need-key before changing (internals §5). |
| 9 | **Pull engine can't see partner quality** — feature, not blocking | Remielle's ceiling depends on having Velina; the pull engine never calls the scorer, so it rates her the same either way. Recommendations TEST 43 pins this, red on purpose. |

### Residual per-agent complaints, not yet root-caused

* **`Ju Fufu/Banyue/Lucia` beats `Dialyn/Banyue/Lucia` on Notorious Pompey** by 10.5. Ju Fufu earns
  `+15 stun on-element` on a fire-weak boss, but Dialyn's L4 is 28 larger (133.1 vs 105.1), which
  should more than cover it — so the soft cap or the teamwork multiplier is also involved. The same
  pair is correctly ordered on Miasma Priest.
* **Pan Yinhu beats Koleda on The Defiler** by 9.2 (428.3 vs 419.1), and Koleda is not resisted
  there. Owner's rule: with Starlight Billy/Lucia, Pan must never beat Norma, Dialyn, Ju Fufu or
  Koleda. The other three now hold.
* **Claret** — `Roxy/Claret/Caesar` too high on Typhon Slugger and Seth. **Release-blocking**: she
  ships next release. Roxy has a three-week buffer after that.
* **Harumasa on UCC/Defiler** — Orphie over Sunna looks wrong.
* **Evelyn on Pompey** — `Norma/Evelyn/Zhao` over `Lighter/Evelyn/Astra`, close but incorrect.
* **Miyabi on Sacrifice Bringer** — no `Miyabi/Promeia` line appears; `Promeia/Miyabi/Remielle` low.

### Rankings regenerated and screened (2026-09-02)

`node rankings.js -15` re-run and every ladder compared against the pre-change CSVs. 29 of 30
agent files changed, which is expected given the blast radius. Every team that **newly entered a
top-3** was screened against the four rules this pass enforced — no support, no stunner for a
burst-shaped carry, a second attack carry, two rupture carries:

| screen | result |
|----|----|
| new #1 teams | 30 ladders changed at the top; **0 violate any rule** |
| distinct teams newly in a top-3 | 36; **0 flagged** |
| widened to top-5 | **1 flagged**: `Nangong/Jane Doe/Velina` at #5 on Girtablullu for Jane Doe — supportless, so it *did* take the `NO_SUPPORT` tier; the flag is "a supportless team is fifth", not "the rule failed" |

The screen tests structural rules, not game sense, so it cannot prove there are no new
*judgement* errors — but it does rule out new instances of the four failure classes that produced
this pass's complaints.

## Parked / adjudicated (don't re-open)

* **Issue 3 (Remielle ceiling) and issue 14 (scores above 700)** — **parked:
  resolved-by-way-of-future-feature.** Owner has a solution that sits *outside* the scoring
  engine's mechanics and addresses both perfectly. Do not chase either inside the scorer. For the
  record: `Nangong/Promeia/Remielle` reads 288.8 on ice-weak Scorched Horizon where the owner
  wants it well under 270; and the corpus top band is 655–703 (`Nangong/Aria/Sunna` on Discordant
  Solo at 703.3), populated rather than the single outlier it used to be.
* **Issue 15 (`true` vs `1` in need severity)** — closed 2026-09-02 in favour of the documented
  convention. `needSeverity` reads the coerced weight, so `true` behaves as weight 1 ("minor") per
  `engine-context.md` §3. If a unit's need is genuinely defining the data should say `3`, not
  `true`. Moved 859 rows, all Anton teams; owner: "any team containing Anton is dogwater."

* **Miyabi ladder (TEST 101)** — closed. Below the top two the order is **boss-conditional**: the
  full ladder is asserted only on Butcher/Marionettes, because `NMSunna > MVYuzuha` rests on a
  ~21-point elemental L3 edge (82 vs 61) that is absent on neutral bosses. On *every* boss the test
  pins `Nangong/Miyabi/Yuzuha` #1 and `Miyabi/Vivian/Remielle` #2 corpus-wide. `NMAstra`/`MVYuzuha`
  are an unordered rung — owner: "conceptually very, very close." Internals §8e.
* **TEST 7** — Evelyn stunner ladder. Ordering is correct and pinned. Two things parked: the
  Norma/Dialyn band mandate (dropped — only matters for bucketing when Dialyn is on top), and the
  Dialyn-beats-Lighter *margin* (0.6 short; closing it means moving a ring-fenced constant).
* **Lighter vs Dialyn \~30 apart for Evelyn on Pompey** — order confirmed, gap arguable, not worth
  holding the engine.
* **Nangong/Yixuan/Sunna** — looked like the bane, turned out to be the **flagship proof** of
  emergent scoring (owner play-tested it; the engine was right, prevalent thought wrong). Rupture
  removed from Sunna's avoid; TEST 15 reversed to assert the team rises. Internals §8d.
* **`Trigger/SAnby/Seed` on UCC** — `KNOWN_RED` TEST 113, not a parked *decision*. Seed is tagged
  `attack` but plays support (`atk: 3`, `cd: 3`, `dmg: 2`, only `ultimate:strong` for damage) and
  SAnby is codependent on exactly those buffs. She is the one attacker in the roster who would
  qualify under the pseudosupport arm of the double-attacker rule, but she declares no `pseudoRole`
  so the engine cannot see it. Owner: let it crash, revisit later. **Do not** clear it by restoring
  the same-element escape — that re-breaks three filed complaints.
* **`ablooms` / `vortex` plurals** — dormant *need* keys, not typos for the singular damage keys.
  See the comment above `NEED_FULFILLMENT_KEYS`.

## Recently closed

**2026-09-02** — the rankings pass, issues A–D from `rankings-open-issues.txt` plus tracked issue
11. Five structural changes, each with a zero-exception prediction: the no-support demotion is no
longer gated on `CONVENTIONAL`; graded no-stunner tiers; element resistance reads damage dealers so
a resisted subdps is disqualified; same element is no longer "interaction" for double attackers; and
unmet needs are charged in proportion to the weight the unit declared. Full record in internals §R.

Complaints closed: Alice (Fiend, Girta), Jane (Fiend), Miyabi (Butcher, Marionettes), Banyue
(Priest), Starlight Billy, Yidhari (both lines), Yixuan (Fiend), Ellen, Nekomata, Soldier 11,
Aria/Velina (Discordant Solo), Aria-over-Promeia (Girta, Aberrant), `Miyabi/Vivian/Remielle` placed
below the top Velina-track teams.

**2026-09-02** — **issues 12 and 13, the Remielle/Velina track.** Two declared L5 relationships,
each landed with a zero-exception prediction: a **mutual Remielle↔Velina pair** (198 movers, all
up, single `l5` signature) and a new **conjunctive `synergy.units` form** — a `"+"`-joined group
that pays only when every named unit is present — declared by Alice as `"Remielle+Velina"` (11
movers, every one an Alice+Remielle+Velina team). The playtested ladder now holds exactly on both
element-neutral bosses: Aria > Promeia > Alice > Burnice > Jane, with `Miyabi/Remielle/Vivian`
below all five. Issue 13 fell out of the same change — `Promeia/Remielle/Velina` is now #1 on
Scorched Horizon at 596.6 against `Nangong/Aria/Sunna` 557.4. TESTs 116 and 117 pin it.
Internals §Rj.

Closed with it: Grace/Aberrant (551.9 over 504.1), Burnice/Aberrant (615.5 over 558.4), the
Miyabi/Vivian/Remielle placement, and Alice's position. Grace needed no declaration of her own —
the mutual pair alone put her 48 clear. Still open at 0.4: `Miyabi/Remielle/Vivian` 504.8 over
`Alice/Remielle/Vivian` 504.4 on Fiend, which is a *disorders* comparison (Miyabi's need of 3 pays
+79.1, Alice's need of 2 pays +43.4) and involves no Velina at all.

**2026-09-02** — TEST 101 (Miyabi ladder). A dedicated `NO_SUPPORT` structure tier closed the four
`Nangong/Miyabi/Vivian` rungs; the ladder was corrected and made boss-conditional for the rest.

**2026-09-01** — the support-fit rebuild and its run-up: TESTs 3, 4, 7, 9, 13, 14, 15, 18, 22, 62,
63, 64, 74, 75, 80, 81, 100, 106, 108, plus bucketing 4/6 → 6/6. Mechanisms: relevance is a max not
an average; off-element stunners aren't penalised; baseline buffs (`atk`/`sheer`) are
flagship-eligible; chains/ultimates land on any DPS; archetypes declared in data;
`fit = delivered/achievable` (the acid test). Full record in internals.

## For release

Done: steps 1–3 (fixture, archetypes, acid test), step 5 (TEST 101), and step 6's rankings pass
(internals §R). Remaining:

* **Issues 12–15 above**, then a re-read of the regenerated rankings.
* **Step 4 — re-anchor numeric bands.** Owner: likely obviated if the suite stays green and the
  rankings read correctly. Revisit only if not. Note issue 14 is the live version of this concern.

## Working notes

* `scoring-diff.js` hides shuffles inside tie groups — reports "no changes" for a change that moved
  everything. Use the dump/delta pair, and state a prediction before each change.
* A green suite is not evidence; a prediction with zero exceptions is. `matchups/` is gitignored.
  Two failed predictions in this pass each caught a real over-reach the suite missed — internals §Rc and §Rg.
* **Predict by effective role, never by tag** — that produced two false predictions in two days
  (Soukaku, Caesar).
* **Assert the mechanism, not the total.** Absolute-score fixtures move on every unrelated change,
  and re-pinning them codifies whatever the engine currently does. TEST 107 reads
  `trace.contention` now; see `engine-context.md` §7.

```bash
node score-dump.mjs > matchups/before.txt
# ...change...
node score-dump.mjs > matchups/after.txt
node score-delta.mjs matchups/before.txt matchups/after.txt --predict <Unit,Unit>
node cohesion-fixture.mjs   # the objective function for support fit
node rankings.js -10        # per-agent CSVs into matchups/
```
