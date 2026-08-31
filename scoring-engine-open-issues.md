# Scoring engine — what is open

Short by design. Long-form history, mechanisms and recorded wrong turns live in
`scoring-engine-internals.md`.

Last reviewed 2026-08-31. Branch `wide-blast-radius-recovery` — **not mergeable yet**, see
*Where this stands* at the bottom.

## Test status

| suite | state |
|----|----|
| scoring | 91 of 108 pass. 2 red on purpose (100, 101). **15 need attention** |
| recommendations | 43 of 44. TEST 43 red on purpose |
| bucketing | **4 of 6** |

The 15 split roughly in half: about six are numeric bands that moved when the engine was
rescaled and just need re-anchoring; the rest are orderings that may be real. They have not been
triaged since the cohesion rework.

TEST 7 joined that list rather than leaving it. Its fire-weak rung is now adjudicated and green;
what still fails is the **Neutral** rung, and that is a genuine defect — see issue 8.

---

## Open

### 8. Cohesion — mostly rebuilt, needs calibration

**What it is.** Whether a support "fits" a team is judged per unit and then multiplies the
*whole team's* score. That multiplication is correct and deliberate — a team slot is scarce, so
a member who contributes nothing does not merely fail to help, they make the team bad. The
problem was **what fed it**: the engine measured how much a support *brought* rather than
whether it was *doing its job*.

Two teams made it obvious. Both have a small third member; one is fine and one is a wasted slot:

| | delivers | doing its job? | read as |
|----|----|----|----|
| Qingyi on YSG/Sunna | 2.0 | yes — her one buff lands and it is her whole purpose | 63% ✗ |
| Yuzuha on Yixuan/Lucia | 1.9 | no — her defining kit lands on nobody | 55% ✗ |

Nearly identical on size, opposite on job, scored the same.

**What changed.** Cohesion now asks whether the unit's *defining* offering found a home, and
what fraction of the kit this team can actually use is arriving. Size still costs a unit — it is
already paid in their tier credit and in what each buff is worth to each teammate — it just
stops being charged a third time against everyone else's damage.

| | before | now |
|----|----|----|
| Qingyi on YSG/Sunna | 220.0 | **352.2** — now above Lycaon's 323.2 |
| Yuzuha on Yixuan/Lucia | 303.7 | **156.5** — flagship misses, team collapses |
| Lucia on YSG/Zhao | 190.9 | **114.1** — she is delivering Koleda's package, priced as such |

**Still to do.** Calibration. 15 scoring tests need triage, and the numeric ones need
re-anchoring against the new scale (only orderings matter, so this is bookkeeping). Bucketing is
at 4/6.

**The clearest witness for what is left.** Evelyn on the Neutral boss, with Astra third and the
stunner varying. The damage estimate and the final score disagree completely:

| stunner | damage the team does | cohesion | final |
|----|----|----|----|
| Dialyn | **365.8** | 0.75 | 293.4 — *3rd* |
| Lighter | 347.1 | 0.82 | 296.2 — *2nd* |
| Trigger | 335.3 | 0.90 | **308.5** — *1st* |
| Ju Fufu | 316.5 | 0.82 | 270.2 — *4th* |

**The damage column is the owner's ladder exactly.** Everything that reorders it happens after,
in the multiplier. Dialyn is measured at 92% fit and Lighter and Trigger at 100%; the fit is
squared and then geometric-meaned, so eight points of fit swing the whole team by twenty-six and
an eighteen-point damage lead becomes a three-point deficit. Trigger additionally collects +15 for
being the only agent on the field.

Two dials are implicated and it is not yet clear which one is wrong: the **squaring** of a
non-DPS unit's fit, and the **spread** of the fit measure itself (92% versus 100% may simply be
too wide a gap for what separates Dialyn from Lighter here). TESTs 7 and 108 both pin this.


---

### 3. Remielle's collapse off triple-anomaly

`Nangong/Miyabi/Remielle` scores far too high. Remielle needs three anomaly-tagged bodies;
Nangong reaches anomaly only through a pseudo-role, so her kit does not come together and her
value should crash. It does not crash enough.

Owner's reference: it should land near `Nangong/Miyabi/Lucy`, somewhat above it, and no
non-triple-anomaly Remielle team should sit above the mid-pack.

`scaling.codependent` now scales her contributions on both sides — what the team gives her and
what she gives back — which fixed `Nangong/Remielle/Vivian` and `Miyabi/Remielle/Yuzuha`. It did
not reach `Nangong/Miyabi/Remielle`, which is the one remaining error in the Miyabi ladder.

---

### 7. The Miyabi ladder

Owner-supplied target for every team buildable from
`[Miyabi, Vivian, Nangong, Yuzuha, Remielle, Sunna]`, against where the engine puts them now:

| target | current | team |
|----|----|----|
| 1 | 1 ✓ | Nangong / Miyabi / Yuzuha |
| 2 | 2 ✓ | Miyabi / Remielle / Vivian |
| 3 | **4** ✗ | Nangong / Miyabi / Sunna — Miyabi favours stun-based anomaly when close |
| 4 | **3** ✗ | Miyabi / Vivian / Yuzuha — should be same band, just below |
| 5 | 5 ✓ | Nangong / Miyabi / Vivian |
| below 7 & 8 | **6** ✗ | Nangong / Miyabi / Remielle — see issue 3 |
| 6 | 7 | Nangong / Vivian / Yuzuha — score still too high |
| 7 | 8 | Nangong / Vivian / Sunna — score still too high |
| bottom | 9–11 ✓ | the remaining Remielle teams |

Three things are wrong: the 3/4 inversion, Remielle at 6, and ranks 7–8 scoring too high. The
last is suspected to be **an anomaly subdps serving a *pseudo*-anomaly getting full structural
credit** — Vivian serving Miyabi should count for more than Vivian serving Nangong. Also
suspected: disorder *buffs* paying richly on a team that generates little disorder.

**Parked:** `Yanagi > Burnice` as Miyabi's partner (TEST 100) fails uniformly by 10–11. Owner can
see Burnice being the better unit. Minor next to the ladder itself.

---

### 10. Astra is Evelyn's best support and the engine ranks her tenth

Owner-confirmed: **Astra is Evelyn's best-in-slot support.** The engine disagrees badly. Asking
for Evelyn's best teams on fire-weak Pompey across every stunner, Astra's first appearance is rank
10:

| rank | team | score |
|----|----|----|
| 1 | Norma / Evelyn / Sunna | 424.6 |
| 2 | Norma / Evelyn / Orphie | 419.4 |
| 3 | Lighter / Evelyn / Sunna | 412.0 |
| … | | |
| 8 | Norma / Evelyn / **Soldier 11** | 376.5 |
| 10 | Norma / Evelyn / **Astra** | 366.1 |

Sunna, Orphie and a second attacker all outrank her. The stunner ordering in that same output is
correct throughout, so this is specific to the support slot.

Note that Sunna over Astra here is the *opposite* of the Sunna/Yixuan adjudication, where Astra
correctly wins on a rupture carry. Evelyn is an attack carry, and phase 3 deliberately put Sunna
ahead of Astra on attack carries — so this may be that change reaching too far, or it may be Astra
being under-valued generally. Not yet diagnosed.

```bash
node matchups.js -t "Dialyn/Evelyn,Norma/Evelyn,Lighter/Evelyn,Trigger/Evelyn,JF/Evelyn,Koleda/Evelyn,Caesar/Evelyn" -o -b Pompey -50
```

---

### 11. Two attackers on one team are not penalised

`Norma / Evelyn / Soldier 11` scores 376.5 and sits at rank 8 for Evelyn on Pompey. Soldier 11 and
Evelyn are both attack carries; they cannot both have the field. Dual-attacker teams are supposed
to be bad for the same reason dual-rupture teams are, and the engine is not charging for it at all.

The burst-window contention rule from issue 7 (`scaling.greedy`) does not reach this — it only
fires when two units are annotated greedy above 1, and Soldier 11 is not. This is a *role*
collision rather than a window collision, and it wants its own check.

Owner: "that's definitely a bug."

---

### 9. The pull engine cannot see partner quality

Remielle's ceiling depends on one partner. Her best teams are all `Remielle/Velina/X`; without
Velina the best line is around `Alice/Vivian/Remielle`, which is good but not the same thing.

**The pull engine rates her identically either way.** It never calls the scorer — it reasons
about scaling keys, role coverage and codependency, none of which Velina changes on a roster
already heavy in anomaly. Recommendations TEST 43 pins this and is red on purpose.

Annotating `synergy.units` on the pair was tried and rejected: it does not move the
recommendation, and it lifts `Promeia/Remielle/Velina` by 80 points in the scorer.

Closing this means teaching the pull engine to weigh partner *quality*. That is a feature, not a
fix, and it does not block a merge.

---

### 5. Disorder supply — one loose end

The fix landed and is correct. What remains: for an under-met need the arithmetic cancels the
appetite term, so a supplier earns the same whether the consumer wanted a little or a lot.
`ultimates` and `disorders` each got a *different* fix for documented reasons, so a third
blanket one across the remaining six need types is probably wrong. **Investigate per key before
changing anything** — the long form has the reasoning.

---

## Adjudications

Settled, and now pinned by a test rather than sitting here:

| what | owner's call |
|----|----|
| **The Evelyn stunner ladder on fire-weak Pompey** | Engine is right, test was wrong. `Norma > Lighter > Dialyn > Ju Fufu > Trigger > Koleda > Caesar > Pulchra > Qingyi` — "this laddering is 100% correct." TEST 7's Pompey block now asserts all nine rungs and passes |

Still waiting:

| test | question |
|----|----|
| 100 | `Yanagi > Burnice`, and `Nangong > Vivian` when the third slot is Remielle |
| 101 | The remaining Miyabi ladder rungs |
| 13, 14, 18, 74, 75, 80 | Numeric bands that moved with the rescale. Re-anchor rather than tune toward |

---

## Shelved deliberately

Recorded so nobody re-opens them as findings.

- **Lighter and Dialyn are ~30 points apart for Evelyn on Pompey.** They arguably belong inside one
  epsilon band for bucketing purposes rather than being cleanly separated. Owner: "I am not going
  to hold up the engine on that; this is fine for now." The *order* is confirmed correct; only the
  gap is arguable.


---

## Where this stands

Sound and settled:

- Deleting a badly-fitting buff no longer improves a team. That was issue 3's headline symptom
  and the acid test now passes.
- Element buffs are a menu — a unit is not charged for an arm with no target.
- Quick assists are a small benefit that always lands.
- `damage.basic` distinguishes a support who deals damage from one who does not.
- Burst-window contention (`scaling.greedy`): two greedy carries cannot both own the stun
  window, and a greedy carry gets more from a shortened enemy recovery.
- A measurement harness that catches this class of mistake — `score-dump.mjs` and
  `score-delta.mjs`, plus `KNOWN_RED` in two suites so exit codes mean something.

Not mergeable until the 15 scoring tests are triaged and re-banded, bucketing is back to 6/6,
and the three Miyabi ladder errors are closed.

**Suggested order.** Triage and re-band first — it is cheap and it shrinks the red list to the
genuine defects. Then the ladder (3/4 inversion, Remielle, the subdps/pseudo-anomaly credit).
Issue 9 last, or never, since it blocks nothing.

---

## Working notes

- `scoring-diff.js` compares *rankings* and hides shuffles inside tie groups. It reports "no
  material changes" for a change that moved every score. Use the dump/delta pair instead, and
  state a prediction before each change.
- A green suite is not evidence. A prediction with zero exceptions is.
- `matchups/` is gitignored; dumps go there.

```bash
node score-dump.mjs > matchups/before.txt
# ...change...
node score-dump.mjs > matchups/after.txt
node score-delta.mjs matchups/before.txt matchups/after.txt --predict Lighter
```
