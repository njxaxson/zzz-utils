# Scoring engine — status

Concise by design. Deep history, post-mortems, measurements and the reasoning behind every fix live
in `scoring-engine-internals.md`; this doc is only "where do things stand and what is left."

Last reviewed 2026-09-03. Branch `wide-blast-radius-recovery` — not merged to `main`.

## Test status

| suite | state |
|----|----|
| scoring | **118 pass, exits 0.** `KNOWN_RED` is empty |
| cohesion fixture | **11/11** — owner judgements on support fit |
| bucketing | **6/6** |
| recommendations | 43/44. TEST 43 red on purpose (issue 9) |

```bash
node test-scoring.mjs && node test-recommendations.mjs && node test-bucketing.mjs && node cohesion-fixture.mjs
```

Support fit is resolved and the Miyabi ladder is closed (internals §8d, §8e). The rankings pass —
every complaint in `rankings-open-issues.txt`, start to finish — is internals §Ra–§Rm.

## Open

| # | issue | status |
|----|----|----|
| 16 | **Sub-DPS tier is halved beside a same-type carry** | A double count: a unit's tier already prices the fact that it plays sub-DPS, so halving it again rates Velina as half a primary carry. This is why the Miyabi track outranked the Velina track until it was corrected by declaration instead. Do not confuse it with the `isForcedSecondaryDPS` halving, which is a real role-collision charge and is correct. Wide blast radius; **post-release**. Internals §Rj. |
| 9 | **Pull engine can't see partner quality** | It never calls the scorer, so it rates Remielle the same with or without Velina. A feature, not a fix — not release-blocking. Recommendations TEST 43 pins it. |

### Open per-agent rankings complaints

**None. Every complaint in `rankings-open-issues.txt` is closed** — see *Recently closed* and the
*Parked / adjudicated* list for which were engine defects and which were the engine being right.

## Parked / adjudicated (don't re-open)

* **Issue 3 (Remielle ceiling) and issue 14 (score inflation at the top of the corpus)** — **parked:
  resolved-by-way-of-future-feature.** Owner has a solution that sits *outside* the scoring engine's
  mechanics and addresses both. Do not chase either inside the scorer.
* **Issue 15 (`true` vs `1` in need severity)** — closed in favour of the documented weight
  convention: `true` behaves as weight 1 ("minor"), per `engine-context.md` §3. If a unit's need is
  genuinely defining, the data should say `3`, not `true`.
* **Miyabi ladder (TEST 101)** — closed. Below the top two the order is **boss-conditional** and the
  test asserts it narrowly on purpose. `NMAstra`/`MVYuzuha` are an unordered rung. Internals §8e.
* **Remielle/Velina ladder (TEST 116)** — same shape: the full ladder is asserted only on the two
  element-neutral bosses, because elemental L3 legitimately reorders the lower rungs elsewhere.
  Do not widen it. Internals §Rj.
* **TEST 7** — Evelyn stunner ladder. Ordering is correct and pinned. Parked: the Norma/Dialyn band
  mandate (dropped), and the Dialyn-beats-Lighter *margin* (closing it means moving a ring-fenced
  constant).
* **Lighter vs Dialyn for Evelyn on Pompey** — order confirmed, gap arguable, not worth holding the
  engine.
* **Nangong/Yixuan/Sunna** — the **flagship proof** of emergent scoring: owner play-tested it, the
  engine was right and prevalent thought wrong. Internals §8d.
* **Jane on Miasmic Fiend** — `Nangong/Aria/Jane Doe` (430.6) over `Jane/Vivian/Yuzuha` (423.9).
  **Complaint closed 2026-09-03: the owner withdrew it** — "NAJ > JVY is very valid. My original
  complaint was not correct." The supportless team *is* demoted to the `NO_SUPPORT` tier; what
  carries it is `Fiend.favored = ["Alice","Aria"]`, worth `Favored: Aria +22`.

  Structural fact worth keeping regardless: **favored is additive and lands pre-multiplier, while
  the no-support demotion is multiplicative**, so a large enough favored bonus will outrun a
  structural tier. Here +22 survives as 22 × 0.80 = 17.6 against a 6.7-point gap. That is by design,
  but it means boss `favored` and `shillIntensity` are strong levers — strong enough to mask a
  structural verdict — so change them deliberately.
* **Evelyn on Notorious Pompey** — `Norma/Evelyn/Zhao` over `Lighter/Evelyn/Astra`. **Complaint
  closed 2026-09-02: the engine is correct.** It survives on Norma, who so drastically outweighs
  Lighter that the support slot cannot make up the difference. Not a defect.
* **Starlight Billy on The Defiler** — Pan Yinhu outranking Koleda. **Closed 2026-09-02.** Two
  changes: Koleda's chain **buff** was being priced as a chain **provision** (a real bug, internals
  §Rl), and `MULT.CHAINS_BUFF` was then set to 8. The ladder is now Dialyn > Norma > Ju Fufu >
  Koleda > Pan, so all four stunners named in the owner's rule clear Pan. TEST 62's
  Dialyn-over-Koleda margin was relaxed 20 → 15 to allow it — owner: favour correct ordering over
  margins. Sigrid declares `scaling.chains: 3`, so she is chain-relevant and that margin moves with
  the same dial; the ordering TEST 62 guards is intact.
* **Claret on Typhon Slugger** — `Roxy/Claret/Caesar` ranking high, and Seth/Anby appearing at all.
  **Complaint closed 2026-09-02: the engine is correct**, and it was the last release blocker.
  Typhon is **fire-resistant**, so Koleda is rightly punished and cannot be Claret's stunner there.
  Caesar ranks where she does because her **general damage debuff is worth more to an armorer than
  to a normal carry**. And Seth and Anby appear because the roster genuinely runs out: with Koleda
  punished for fire and Rina for her evasive assist, Claret's good partners are **Roxy, Trigger,
  Nicole**, then **Caesar and Orphie**, and after that there is nothing left — so the tail of the
  ladder is barrel-scraping by construction, not by defect.
* **Banyue on Notorious Pompey** — `Ju Fufu/Banyue/Lucia` over `Dialyn/Banyue/Lucia`. **Complaint
  closed 2026-09-02: the engine is correct.** Ju Fufu edges Dialyn on fire weakness plus her
  off-field bonus, and that is the right answer here because **Banyue is field-hungry** — she wants
  the field to herself, so an off-field stunner suits her. Field hunger is distinct from
  `scaling.greedy` (which is about needing the *stun window* to oneself) and is **deliberately not
  modelled**. Do not add it. Owner ruling.
* **`Trigger/SAnby/Seed` on UCC** — settled by declaration rather than by inference. Seed is tagged
  `attack` but plays support, and the engine cannot see that because she declares no `pseudoRole`;
  instead SAnby and Seed each declare a conjunctive synergy group and the test floor came down. It
  is a **carve-out, not an emergent result**, and the margin is thin. The principled fixes remain
  open: give Seed a support `pseudoRole`, or infer pseudosupport from buff supply. **Do not** close
  it by restoring the same-element escape — that re-breaks three filed complaints. Internals §Rk.
* **Issue 5 (an under-met need ignores the consumer's appetite)** — **closed 2026-09-02 as a
  nonissue.** The arithmetic is real: `scoreNeedFulfillment`'s undersupplied branch multiplies by
  `coverage` on top of `supply x need`, which cancels the need term, so a supplier is paid
  `keyMult x supply² x 0.6` whatever the appetite. But the surface is **one pair type on the whole
  roster** — Ye Shunguong's `veils: 2` beside a weight-1 veils supplier collects 4.2 where
  appetite-respecting arithmetic gives 8.4. Nobody declares `ablooms` or `vortex`; Aria's `veils`,
  Anton's `quick-assists` and Banyue's `interrupt-resistance` can never be undersupplied at current
  supplier weights; `ultimates` escapes via `FRACTIONAL_COVERAGE_KEYS` and `disorders` via
  team-wide pricing. Owner checked the one affected team, `Nangong/Ye Shunguong/Astra`, across every
  boss: it sits in [225, 285] where it should. Not worth touching a shared formula. Internals §5.
* **`ablooms` / `vortex` plurals** — dormant *need* keys, not typos for the singular damage keys.
  See the comment above `NEED_FULFILLMENT_KEYS`.

## Recently closed

**2026-09-02 to 09-03 — the rankings pass, complete.** **All ~25 complaints in
`rankings-open-issues.txt` are closed**, plus tracked issue 11 and issues 12–13, 15 and 5. Roughly
half were engine defects and half were the engine being right and the intuition wrong — the split is
in *Parked / adjudicated* above. Full record with measurements in internals §Ra–§Rm; the short
version:

* Structural fixes: the no-support demotion is no longer gated on `CONVENTIONAL`; graded no-stunner
  tiers, with the stunless carve-out made role-agnostic; rupture accepts only one carry; element
  resistance reads damage dealers, so a resisted sub-DPS is disqualified while a pure stunner is
  only penalised; same element is no longer "interaction" for two attack carries; the monoshock
  carve-out stops reading `am`/`ap` stats as anomaly mechanics; and an unmet need is charged in
  proportion to the weight the unit declared.
* Declared L5 relationships, deliberate exceptions to emergence: a mutual **Aria↔Remielle** pair, a
  mutual **Remielle↔Velina** pair, and a new **conjunctive `synergy.units` form** (a `"+"`-joined
  group that pays only when every named unit is present).
* Rankings regenerated and screened. **Final screen, 2026-09-03, against the pre-change CSVs: 48
  ladders got a new #1 and not one violates a rule this pass enforced.** 48 distinct teams newly
  reached a top-3, one flagged; widened to top-5, three flagged. All three are **supportless Nangong
  teams** — `Nangong/Miyabi/Promeia` (promeia #3), `Nangong/Aria/Grace` (grace #5),
  `Nangong/Jane Doe/Velina` (jane-doe #5) — and each *did* take the `NO_SUPPORT` tier. The screen
  reports team **shape**, so "a supportless team placed third" is what it is telling you, not "the
  rule failed"; and the owner has since ruled that a supportless Nangong team outranking a supported
  one can be correct (see the Jane-on-Fiend entry). The screen tests structural rules, not game
  sense, so it cannot rule out a judgement error only the owner would see.
* **Damage-type buffs are role-weighted.** A supplier buffing a damage type is now scaled by how
  much damage the consumer actually deals (`getBasicDamage/3`), the same way the generic `atk` buff
  already was. Orphie's aftershock buff on Trigger goes 18.0 → 12.0 — a stunner reads 2 rather than
  a DPS's 3 — while the carry's share is untouched. Orphie still correctly beats Sunna for Harumasa;
  2,756 movers, all in the predicted set, no boss's top-3 changed. The channel was also renamed
  `MULT.DAMAGE_NEED` → `MULT.DAMAGE_TYPE_BUFF` with the debug label `need(damage:…)` →
  `buff(damage:…)`, because the old naming twice drew suspicion of a bug that was not there.
  Internals §Rm.1.
* **Boss data tuning closed two complaints** (owner, 2026-09-03): `Bringer.favored = ["Miyabi"]`
  with `shillIntensity: 6` for the Miyabi-on-Bringer complaint, and
  `Fiend.favored = ["Alice","Aria"]`, which put `Alice/Remielle/Vivian` (526.4) over
  `Miyabi/Remielle/Vivian` (504.8) and closed the Remielle-on-Fiend complaint.
* A chain **buff** is no longer read as a chain **provision**. Koleda declares `buffs.chains` and was
  the only unit affected: she was paid a fraction of a `chains` need she cannot satisfy, and the buff
  was credited nowhere. Now priced off the consumer's chain magnitude, so it lands on every DPS and
  scales with how hard that carry's chains hit. Internals §Rl, TEST 118.

**2026-09-02** — TEST 101, the Miyabi ladder. A dedicated `NO_SUPPORT` structure tier closed the
four `Nangong/Miyabi/Vivian` rungs.

**2026-09-01** — the support-fit rebuild and its run-up (19 tests, plus bucketing 4/6 → 6/6).
Mechanisms: relevance is a max not an average; off-element stunners aren't penalised; baseline buffs
are flagship-eligible; chains/ultimates land on any DPS; archetypes declared in data;
`fit = delivered/achievable`, the acid test. Internals.

## For release

**Nothing is release-blocking, and every rankings complaint is closed.** Claret was the last
blocker and the engine turned out to be right about her.

Remaining, all optional:

1. **A human read of the rankings.** Regenerated and screened 2026-09-03 after the last change
   (`node rankings.js -15`, 30 CSVs in `matchups/`), so they are current and structurally clean —
   but no person has read them since. This is the only thing standing between here and a release.
2. Issue 16 (sub-DPS tier double count) — post-release.
3. Issue 9 (pull engine partner quality) — a feature, not a fix.

**Step 4, re-anchoring the numeric bands, is dropped** — owner's call, obviated as long as the suite
stays green and the rankings read correctly. Note issue 14 (top-of-corpus inflation) is parked as
resolved-by-future-feature, and internals §Rm.2 records one place where that inflation is already
forcing boss data to compensate.

## Working notes

* **A green suite is not evidence; a prediction with zero exceptions is.** Write down which teams
  are allowed to move *before* the change, then make `score-delta.mjs` list the exceptions. Two
  predictions failed during this pass and each caught a real defect the suite missed (internals §Rc,
  §Rg).
* **Do not use `scoring-diff.js` to check whether a change did anything** — it hides shuffles inside
  tie groups and reports "no changes" for a change that moved the whole corpus. Use the dump/delta
  pair.
* **Predict by effective role, never by tag.** That produced two false predictions in two days.
* **Favour correct ORDERING over MARGINS.** Owner's standing position. When a margin assertion
  and an ordering pull against the same constant, the ordering wins and the margin gets relaxed —
  margins in this suite are almost never calibrated figures, they were "comfortably ahead" written
  as a number. Say so in the test comment when you move one, and keep the ordering it was guarding.
  TEST 62's Dialyn-over-Koleda margin went 20 → 15 for exactly this reason.
* **Assert the mechanism, not the total.** Absolute-score fixtures move on every unrelated change,
  and re-pinning one silently codifies whatever the engine currently does — including orderings the
  owner rejects. TEST 107 reads `trace.contention` instead. See `engine-context.md` §7.
* **Adding a structure tier is never local.** Every `=== STRUCTURE.X` comparison is a place where a
  new tier changes behaviour by *not* matching, and that fails silently and upward. Internals §Rc.
* `matchups/` is gitignored.

```bash
node score-dump.mjs > matchups/before.txt
# ...change...
node score-dump.mjs > matchups/after.txt
node score-delta.mjs matchups/before.txt matchups/after.txt --predict <Unit,Unit>
node cohesion-fixture.mjs   # the objective function for support fit
node rankings.js -15        # per-agent CSVs into matchups/
```
