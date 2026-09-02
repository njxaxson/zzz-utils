# Scoring engine — status

Concise by design. Deep history, post-mortems and the reasoning behind every fix live in
`scoring-engine-internals.md`; this doc is for "where do things stand and what is left."

Last reviewed 2026-09-02. Branch `wide-blast-radius-recovery` — not merged to `main`; see
*For release* below.

## Test status

| suite | state |
|----|----|
| scoring | **114 pass, exits 0.** One `KNOWN_RED`: TEST 113 |
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
| 12 | **Miyabi is still the best third on a Remielle base for several carries** | One root, four filed complaints. The RemViv/disorders track still outranks the RemVel/vortex track wherever the carry is not Aria or Promeia, because Miyabi's `scaling.disorders: 3` collects the engine's richest L4 channel while vortex and abloom go through ordinary ones. Measured on the bosses each was filed against: `Grace/Miyabi/Remielle` 504.1 over `Grace/Remielle/Velina` 471.9 (Aberrant); `Burnice/Miyabi/Remielle` 558.4 over `Burnice/Remielle/Velina` 535.5 (Aberrant); `Miyabi/Remielle/Vivian` 504.8 over `Alice/Remielle/Vivian` 504.4 (Fiend, by 0.4); and `Alice/Remielle/Velina` last at 489.6, 46 behind Burnice, where the playtested third-slot order is Aria, Promeia, **Alice**, Burnice, Jane. Alice's own unmet `scaling.disorders: 2` softening lifted her 26; her need is genuinely unmet beside Remielle/Velina (physical + wind is a vortex, not a disorder, and lumen cannot react at all). |
| 13 | **`Promeia/Remielle/Velina` should be #1 on Scorched Horizon** | It is #2 at 525.1 behind `Nangong/Aria/Sunna` 557.4. Gap was 44.4, now 32.3. Aria sits on both sides of every L5 lever, so raising L5 for the Velina track inflates this team too — see the arithmetic in internals §Rf. |
| 14 | **One score above 700** | `Nangong/Aria/Sunna` on Discordant Solo, 703.3, against a corpus second place of 621.6. It carries **two** mutual `synergy.units` pairs, and the `+25` mutual bonus is added once per *direction*, so each pair pays `2 × (15+25) = 80` rather than `2 × 15 + 25 = 55`. Owner: leave L5 alone for now. Owner concern: scores this high distort cross-archetype comparison. |
| 15 | **`true` vs `1` in need severity** | `needSeverity` treats a declared `true` as full severity, but `engine-context.md` §3 states the weight convention as `true`/`1` = minor, `2` = strong, `3` = defining. Under the documented convention Anton's `scaling['quick-assists']: true` is a *minor* need and should be discounted like weight 1. Owner call; the practical effect is ±5 points on sub-100 teams. |
| 3 | **Remielle ceiling** | `Nangong/Promeia/Remielle` is **288.8** on ice-weak Scorched Horizon. Owner: "240 isn't necessarily the hard cap, but this isn't close to even 270, even on Horizon." Not a cap mechanism — the raw 450.0 is what needs explaining. Its structure is already demoted (Remielle's own support utilization is under 0.5) with cohesion 0.69. |
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
