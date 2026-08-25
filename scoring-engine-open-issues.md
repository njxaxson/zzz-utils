# Scoring engine — open issues

Live register of what is actually open in the scorer. All suites are green
(`92/92` scoring, `43/43` recommendations, `6/6` bucketing) — everything below is a *modelling*
problem, not a failing test. Historical post-mortems are demoted to the end.

Last reviewed 2026-08-25.

| # | Issue | Status | Size |
|----|----|----|----|
| 1 | Ultimate credit is derived from the wrong axes | **Resolved** — see the post-mortem below | Done |
| 2 | Undersupply gating prices partial coverage flat | **Resolved** — see the post-mortem below | Done |
| 3 | Partial relevance is never priced | **Open, parked** by owner | Large; broad retune |
| 4 | `getMaxBurstWeight` saturates at 3 for every carry | **Open** — new, low priority | Small; unknown blast radius |

---

## 3. Partial relevance is never priced

**Parked by the owner.** Not dropped — this is the largest outstanding modelling problem in the
scorer, and the notes below are the accumulated evidence. Do not start on it without a decision.

Nothing in the engine charges a buff that lands *badly* — only one that lands on nobody.
`getBuffRelevance` grades the shortfall (`atk` into rupture = `0.33`, into armorer `0`, else `1`),
that grading feeds `ratio`, and `ratio` is then discarded by
`Math.max(adjustedRatio, threshold, coreRatio)`, because `threshold` reads `effectiveWeight`
alone, is blind to waste, and usually wins.

**Consequence A — removing a badly-landing buff improves the team:**

```
Nangong/Yixuan/Sunna
  with atk:3      team 242.5    Sunna util  81%
  atk:3 removed   team 285.2    Sunna util 100%
```

Pre-existing — before the 3.2 work the same comparison read 272.2 → 322.1 — and inherent to
scoring cohesion as a ratio: a partially-effective buff always drags a ratio down even though it
adds real absolute damage. `threshold` exists as the counterweight, which is why it cannot simply
be deleted. A modelling wart rather than a live bug, since `units.json` never removes a real
buff, but it keeps generating knife-edge tuning.

**Consequence B — Sunna vs Astra on a rupture carry is right for the wrong reason.** Both buff
`atk:3` at 0.33 efficiency into a rupture unit. What *should* separate them is that Astra keeps
contributing regardless (`cd:3` lands fully, `dmg:3` is a constant multiplier, and she provisions
chains and quick-assists a rupture team can use) whereas Sunna's one fully-landing lever is
`stun-multiplier`, which only pays inside stun windows, and her `veils:3` is dead.

The ordering comes out right:

```
Nangong/Yixuan/Astra   277.4   Astra util 100%   cohesion 0.56
Nangong/Yixuan/Sunna   242.5   Sunna util  81%   cohesion 0.46
```

But it gets there from the raw `ratio`/`threshold` arithmetic happening to favour Astra's kit,
not from modelling either of the two things that actually matter: the 0.33 ATK shortfall, or the
fact that `stun-multiplier` is *window-limited* value while `cd`/`dmg` are constant. Note
`STUN_MULT_BUFF: 2` is the second-largest impact constant in the file (only `SHEER_BUFF: 9` is
bigger; `ATK`/`CR`/`CD` are all `0.7`) — so the engine currently rates Sunna's situational lever
as the single biggest thing she offers. **There is no concept anywhere of always-on versus
window-limited value.** That is worth revisiting on its own, and is the smallest independent
piece of this issue.

A real fix means making the fit ratio authoritative over the absolute-supply `threshold`, and
letting absolute contribution live in L4 baseline affinity where it belongs rather than being
smuggled into cohesion. That is a broad retune, not a patch.

### Approaches already tried and rejected

This table is evidence about *this* issue specifically, and is what establishes that the fix is a
retune rather than a patch. All measured against the full 86-test suite:

| Attempt | Result |
|----|----|
| `threshold = Math.min(threshold, ratio)` — make fit authoritative | **76 pass**. Strips the absolute-supply rescue from every support; broke 7, 9, 10, 11, 14, 18, 25, 62, 74, 80 |
| Blanket waste multiplier `baseUtil *= FLOOR + (1−FLOOR)·ratio` | Best **80 pass** at FLOOR 0.7 (69–73 at 0.3–0.6). Never reached parity |
| Provision whiff over all need keys at weight ≥2 | **80 pass**. Treats Astra's `chains:2` as dead weight; broke 4, 5, 8, 9, 62, 76 |
| Provision whiff over all need keys at weight ≥3 | 86 pass but conceptually wrong — see the veils lesson below |
| Per-key partial-relevance charge on every stat buff | Any strength > 0 breaks TEST 9: fires on Astra's `cd:3` into an anomaly core and drops her below Nicole |
| "Headline buff" charge (highest `weight × BUFF_IMPACT`, bill the shortfall) | Passed 86, then removed — see the lesson below |
| Generalising the total-whiff rule at weight ≥2 | **85 pass**. Charges Rina's `atk:2` on an armorer team; broke TEST 74 |

---

## 4. `getMaxBurstWeight` saturates at 3 for every carry

Found while restructuring the ultimate axes, and the reason that restructure had to move
magnitude into the provision channel by a different route.

`getMaxBurstWeight` MAXes across `BURST_DAMAGE_TYPES` and returns **3 for every relevant carry**:

```
ysg 3   yixuan 3   seed 3   miyabi 3   evelyn 3   sigrid 3   pyrois 3
```

Because it is a MAX over six keys and most carries max out at least one of them, it cannot
distinguish Seed's 6000% ultimate from Evelyn's chain-driven kit. Anything scaled by it is
effectively a flat rate.

Ultimate provision used to be sized this way, which is *why* magnitude was originally smuggled
into the need channel — that channel had a per-unit multiplier and this one did not. Issue 1
moved provision onto `ULTIMATE_MAGNITUDE` and no longer depends on it.

Still live on two paths: the recovery-debuff term in `scoreBaselineAffinity` (line ~2159) and
`scoreStunEmergence` (line ~2313). Both silently treat every carry as equally bursty — stun
emergence in particular pays `burst=3` for Seed, Evelyn and Sigrid alike. Low priority, since no
wrong output is known, but a measurement that reports the same number for everything means
anything downstream of it is uncalibrated rather than deliberately calibrated flat.

---

## Design note: stunners and supports already differ

Worth knowing before anyone adds a role-split penalty constant, because the split exists. The
intuition — *a stunner with nothing landing still drives stuns, chain attacks and burst windows;
a support with nothing landing does literally nothing* — is encoded in three places:

1. **`hasBuffContributions` includes `|| isStun(unit)`.** A bare stunner never falls into the
   "supplies nothing → `log(0.01)`" trap a bare support falls into. Anby, whose `mechanics` is
   `{}`, still scores **83% utilization**.
2. **The `isStun(supplier) && !isDPS(supplier)` block** grants `3 + daze` effective weight purely
   for being a stunner with a DPS beneficiary — baseline stun/chain/burst-window value, before
   any buff is considered.
3. **`getScalingBuffs`** returns `3` for support/defense and `2` for stun, and
   `computeBuffUtilization` ends with `1 - (1 - baseUtil) * (scalingBuffs / 3)`. Every utilization
   penalty is therefore already damped to **two-thirds strength for stunners**.

So the 2:3 split is already in the engine. If more separation is wanted, lowering the stun default
in `getScalingBuffs` from `2` is a smaller and more principled lever than a second penalty
constant — it is already the single source of truth for "how much does this unit's kit landing
matter", and it applies consistently to every penalty.

---

## Resolved — partial ultimate coverage

Issue 2 used to be titled *"undersupply gating inverts supplier credit"*, on the grounds that Ju
Fufu earned more from Miyabi (who wants ultimates least) than from YSG (who wants them most).
**The owner rejected that framing, and it was the framing that was wrong, not the ordering.** The
intended semantics are *fraction of the need met*:

> Ju Fufu fully covers Miyabi's `scaling.ultimates: 1`, half of Yixuan's `2` and a third of YSG's
> `3`, and should earn credit in roughly a **6 / 3 / 2** shape. Every case is a bonus; the bonus is
> smaller when the need is under-met. Unmet ultimate scaling is never penalised — ultimates occur
> naturally, and only two units in the roster provision them at all.

So "least hungry pays the most" is correct. What was actually broken was the arithmetic meant to
express it. `fulfillment` carried `1/scalingWeight`, which cancelled the `scalingWeight` already in
the need product, collapsing the undersupplied case to `keyMult × supply²`:

* **Coverage was unpriced.** Ju Fufu collected the *same* `1.9` from Yixuan (half covered) and YSG
  (a third covered) — flat, not `3 : 2`.
* **There was a cliff at `supply == scaling`,** because `UNDERSUPPLY_FACTOR` was a step, not a ramp.

### The fix

`FRACTIONAL_COVERAGE_KEYS = new Set(['ultimates'])`, and for keys in it the coverage ratio is
**squared** rather than flat-discounted. Squaring is what makes the term a fraction of the need met:
one power is consumed cancelling the `scalingWeight` in the product, and the second is the fraction.
It is continuous at coverage `1`, so the cliff disappears, and it introduces **no new constant** —
`NEED_KEY_MULT.ultimates` stays `3.2`, `ULTIMATES_PROVISION` stays `7.8`, nothing was recalibrated.

| supplier | → Miyabi `k=1` | → Yixuan `k=2` | → YSG `k=3` |
|----|----|----|----|
| Ju Fufu `utility.ultimates: 1` | 3.2 | 1.9 → **1.6** | 1.9 → **1.1** |
| Dialyn `utility.ultimates: 3` | 9.6 | 19.2 | 28.8 |

Ju Fufu's row is now exactly `6 : 3 : 2`. Dialyn is fully covering in all three cases, so her row —
and every team total containing her — is byte-identical.

**Scope: `ultimates` only,** by decision. The other seven need keys keep the flat `0.6` discount.
There are 18 other undersupplied pairs in the roster — `chains` (Astra/Norma `2`, Koleda `1` →
Evelyn/Sigrid `3`), `disorders` (Alice/Nangong/Yanagi `2`, Vivian `1` → Miyabi `3`), `veils`
(Cissia/Lucia/Nangong/Yidhari `1` → Aria/YSG `2`) — and generalising the shape would move every one
of them by 10–20 points, with direct TEST 62 exposure. The owner's rationale is ultimates-specific
anyway: they arrive naturally and almost nothing supplies them.

Verification: **426 of 127,836 whole-roster scores moved (0.33%), max delta 1.0, and every moved
team contained Ju Fufu *and* (Yixuan or YSG)** — zero exceptions to the prediction. TESTs 91 and 92
are new; both go red under either mutation (dropping the squaring, or reinstating the flat gate).

### The `scaling.ultimates > 3` ceiling did NOT go away — it changed character

The old writeup promised that fixing this "removes the ceiling." It does not, and *cannot*: under
fraction-of-need semantics credit peaks where supply meets need, so a consumer annotated above the
largest provision in the data (Dialyn's `3`) is under-covered by everyone and every supplier's bonus
scales down. Dialyn into a hypothetical `k=4` earns `21.6` against `k=3`'s `28.8`.

What the fix removed is the **cliff**: that same step used to be `28.8 → 17.3` (−40%, discontinuous)
and is now `28.8 → 21.6` (−25%, smooth and proportional). So the hard rule is replaced by a
statement of intent:

> Annotating `scaling.ultimates` above the maximum available provision (`3`) means nobody fully
> covers the need, and every supplier's bonus scales down proportionally. **That is intended, not a
> bug.** It stays a bonus in every case — TEST 92 pins exactly that.

---

## Resolved — the ultimate axis restructure

`units.json` describes a unit's ultimate along three independent axes: **frequency**
(`damage['ultimate:double']`), **magnitude** (`damage['ultimate:strong'|'weak']`), and **scaling**
(`mechanics.scaling.ultimates`, a benefit *beyond* the ultimate's own damage). None of the three
was in the right place, and two scoring channels overlapped.

### The diagnosis

`Ju Fufu / Evelyn / Astra`, real debug output from the old engine:

```
Ju Fufu → Evelyn:
  ultimates: 4.5          ← provision credit  — correct
  need(ultimates): 7.0    ← need credit       — fabricated
```

Evelyn annotates no `scaling.ultimates`. Neither does Ellen, Harumasa, or Seed. But
`getEffectiveScaling` manufactured a floor of `1` for every primary DPS, plus bumps from
magnitude and frequency, and then `{ ...baseline, ...explicit }` let the real annotated value
**overwrite** the manufactured one. **26 of 60 units reported an ultimate need they never
declared.** The same free ultimate was paid for twice, and the fabricated half was the larger.

Three consequences, all of which had been observed separately without the common cause being
identified:

* Annotating a genuine benefit *lowered* a unit. Miyabi's warranted `scaling.ultimates: 1` would
  have overridden her magnitude-derived `2` and halved her credit, so the correct data edit sat
  unapplied.
* Yixuan was already paying the same cost silently — manufactured `3`, annotated `2`, overwritten
  down.
* The fabricated need was exposed to the undersupply gate, producing issue 2's headline example:
  Evelyn collected Ju Fufu's full ungated 7.0 purely because the floor of `1` matched his
  `utility.ultimates: 1` exactly. (That example was later understood to be about the *fabricated
  need*, not about undersupply ordering — see "Resolved — partial ultimate coverage".)

### The fix

One home per axis. Frequency stays in `BURST_DAMAGE_TYPES` and nowhere else. Magnitude moved to
the provision channel via a new `ULTIMATE_MAGNITUDE` table. Scaling is read verbatim from
`units.json` with no baseline, so only YSG, Yixuan and Miyabi enter the need channel at all.

The central code change was a **deletion**: removing the manufactured `baseline.ultimates` left
the existing per-key merge with nothing to collide with, so the override bug disappeared without
any special-casing. Calibration settled at `ULTIMATES_PROVISION` 7.8 and
`NEED_KEY_MULT.ultimates` 3.2, anchored on holding YSG's total flat.

Verification: 8,723 of 127,836 whole-roster scores moved (6.8%), and **every moved team contained
Dialyn or Ju Fufu** — no leakage outside the ultimate channels. Max delta 14.5.

### Why the anticipated rebalance was rejected

The original writeup proposed moving magnitude out of the need channel and scaling up
`ULTIMATES_PROVISION` to compensate. That cannot work as stated: provision was sized by
`getMaxBurstWeight`, which returns 3 for every carry (issue 4), so there was no throughput
*difference* there to scale up — raising it would have lifted Evelyn exactly as much as Seed.
The restructure works because it gave provision a per-unit multiplier of its own.

### One calibration tension, recorded

TEST 7 (Evelyn stunner ordering on fire-weak Pompey) asserts `Dialyn > Lighter`. Before the fix
Dialyn led by 9.3 points — but a large part of that lead was Evelyn's fabricated need. Removing it
drops the margin to roughly a point, and the two constants trade off:

| | `ULTIMATES_PROVISION` up | `NEED_KEY_MULT.ultimates` up |
|----|----|----|
| TEST 7 margin | improves | no effect (Evelyn has no need) |
| Yixuan ≈ Seed | drifts, Seed pulls ahead | drifts, Yixuan pulls ahead |
| YSG total / Thrall band | rises, squeezes bucketing TEST 5 | rises, squeezes bucketing TEST 5 |

7.8 / 3.2 is the point where all three suites pass with YSG's total exactly on its old value.
Seed ends ~1.9 ahead of Yixuan (4%) rather than dead level; that is the price of keeping the
Thrall band clear, and it is the knob to revisit first if the balance ever feels wrong.

---

## Resolved — the 3.2 mechanics remodel

Historical. Twenty units had `mechanics` corrected after a gachabase audit, which broke four
tests (9, 15, 62, 65). The data was right in all four cases; the tests exposed engine faults. All
fixes are in `team-scorer.js`.

**Role gating replaced with `scaling.buffs` gating** (`computeTeamworkMultiplier`). The DPS
"unmet needs + wasted vortex" evaluation used to run only for units with *no* buffs, so any buff —
even an irrelevant weight-1 one — silently switched the whole consumer-side evaluation off. A
dummy `buffs:{cr:1}` on Vivian was worth **+92 points**. Needs are now evaluated for every unit.
Two sub-decisions worth knowing: the anomaly-reaction block keys off the **native** `anomaly` tag
rather than `isAnomaly()`, so Roxy (a stunner enabling wind for Pyrois/Sigrid) isn't charged for
her own reaction going nowhere; and units with `scaling.buffs === 0` still contribute their
neutral `1.0` utilization term, which is load-bearing — removing it cost Lycaon teams ~180 pts.

**Generalised total-whiff charge** (`computeBuffUtilization`). Previously restricted to a
hardcoded `['sheer','cd']`; now any *defining* stat buff that reaches no consumer is charged
`WHIFF_COHESION_PENALTY`, because a whiffed `anomaly` buff is wasted for the same reason as
`sheer` with no rupture consumer. Two qualifications: **weight 3 to generalise, weight 2 for the
original two keys** (a weight-2 buff is a secondary perk — Rina's `atk:2` is worthless to an
armorer but her `pen:3`/`def:2` are exactly what Claret wants; generalising at weight 2 broke
TEST 74); and **element buffs are a menu, not separate offerings** (Lighter carries `fire:2` and
`ice:2` so that one matches the carry, judged together on their best element — charging him for
the arm that missed broke TESTs 62 and 80).

**Provision whiff, ultimates only** (`computeBuffUtilization`). `PROVISION_WHIFF_PENALTY` charged
when a weight-3 `utility.ultimates` provision reaches no carry that can use it. Scoped
deliberately to ultimates; see the veils lesson.

### Current tuning

```
PROVISION_WHIFF_PENALTY = 0.963    passing window [0.95, 0.97]   (0.98 breaks TEST 62)
```

The generalised whiff reuses the existing `WHIFF_COHESION_PENALTY`. Margins against pre-remodel
values:

| Check | Before | Now |
|----|----|----|
| TEST 15 headroom under the 265 ceiling (Butcher) | +2.3 | **+22.5** |
| TEST 15 headroom (Marionettes) | — | **+35.5** |
| TEST 8 `Sunna − Nicole` | +7.4 | **+34.4** |
| TEST 62 `Lighter − Dialyn` | +4.6 | +3.2 |
| TEST 62 `Dialyn − (Koleda + 30)` | +1.8 | +3.2 |

The two TEST 62 margins remain thin at ~3 points on ~315-point scores. Both are constraints on
Dialyn from opposite directions (she must fall below Lighter but stay 30 clear of Koleda), so a
single constant cannot open both. This is the one place a genuinely narrow window remains.

---

## Lessons learned

**Never give a unit a need it did not declare.** The single most useful rule to come out of the
ultimate restructure, and it generalises past ultimates. A manufactured baseline looks harmless —
"everyone wants ultimates a bit" is even true — but it puts units into machinery built for units
that opted in. Once Evelyn had a fabricated need of 1, she was eligible for need-fulfillment
credit she should never have received, *and* eligible for the undersupply discount on a need she
never had. If a value is worth giving to everyone, price it in a channel that applies to
everyone; do not fake a per-unit declaration to get at a per-unit multiplier. That is precisely
how magnitude ended up in the wrong channel.

**Score-neutrality is not evidence that a fix is right — it can be evidence it is empty.** An
earlier attempt at issue 1 kept both axes but combined them with `max` instead of letting the
annotation override. It was provably score-neutral across all three suites, which felt like a
clean landing. It was worthless: `max(magnitude 2, annotated 1) = 2` means Miyabi's annotation
can never change anything, so "the data edit is now safe" was true only because the edit did
nothing. It also still could not distinguish a big-ultimate carry from a big-ultimate carry that
*also* scales, and left the double payment untouched. When a structural fix moves no scores, ask
whether it changed any behaviour at all.

**A test that cannot fail proves nothing.** TEST 89 was first written as "Dialyn is worth more to
Evelyn than to Ellen". True, and it passed — but Evelyn and Ellen differ by ~90 points for
reasons unrelated to ultimates, so it passed just as happily with the magnitude rung collapsed.
It now compares Evelyn against a *clone of Evelyn* with the annotation stripped, which differs in
exactly one field. Mutation-check new tests: break the mechanism deliberately and confirm the
right test goes red.

**Before adding a penalty keyed on "no consumer scales for X", check how many units scale for X
at all.** The provision whiff was first written over *all* `NEED_FULFILLMENT_KEYS`, which caught
Sunna's `veils:3` and was doing all the work holding up TEST 15 — wrongly, because veils don't
"whiff", almost nobody wants them in the first place:

| Provision | Units that scale for it (of 60) |
|----|----|
| `quick-assists` | 38 |
| `ultimates` | 27 |
| `chains` | 2 |
| `veils` | **2** — Aria, Ye Shunguong |
| `disorders` | 1 |
| `interrupt-resistance` | 1 |
| `ablooms`, `vortex` | 0 |

"No consumer scales for veils" is the normal case for ~97% of teams and says nothing about fit.
The rule could not distinguish *a broadly-wanted provision this carry actively cannot use*
(Dialyn's ultimates into a weak-ultimate carry) from *a provision nobody wants anyway* (Sunna's
veils). It is now scoped to ultimates, where `ultimate:weak` is an explicit statement that the
carry cannot use them. A penalty on a niche key fires constantly and means nothing.

The real problem with `Nangong/Yixuan/Sunna` was never veils — it is that Sunna offers Yixuan
almost nothing she wants. That is issue 3 above.

**Don't invent abstractions to work around a structural problem.** An earlier version of the
whiff charge picked the supplier's single highest-impact stat buff (`weight × BUFF_IMPACT`) and
billed the shortfall if it landed at less than full relevance. It passed 86 tests and was
**removed anyway**:

* Cohesion should reflect the whole kit. `ratio = effectiveWeight / totalWeight` already is that
  measure — the problem is only that `threshold` overrides it (issue 3). Picking one buff was a
  workaround for not being able to fix that.
* It needed two special-case patches within a single session (element grouping, then tie-breaking
  `atk` against `cd`, which share an impact weight of 0.7 and so tie exactly).
* It did not do what it claimed. Sunna's headline is `stun-multiplier` (impact 4.0), not `atk`
  (2.1), so she was never charged by it at all. Its only real effect was catching buffs that land
  on *nobody* — which the generalised rule does directly, without inventing anything.

Removing it changed no score and no test result. That is the clearest evidence it was the wrong
abstraction.

---

## Reproducing

```bash
node test-scoring.mjs && node test-recommendations.mjs && node test-bucketing.mjs
```

**Who is in the ultimate need channel** — must print exactly three lines, matching the annotated
values in `units.json` and nothing else. A fourth unit means a fabricated need has crept back
(TEST 87 asserts the same thing):

```bash
node --input-type=module -e "import { getEffectiveScaling } from './app/public/lib/common/team-scorer.js'; import { readFileSync } from 'fs'; const raw=JSON.parse(readFileSync('./app/public/data/units.json','utf8')); const list=Array.isArray(raw)?raw:raw.units; for (const u of list) { const s=getEffectiveScaling(u).ultimates; if (s!==undefined) console.log(u.id.padEnd(12), s); }"
```

Expect `miyabi 1`, `ysg 3`, `yixuan 2`.

**Per-pair ultimate credit** — score a team with `{ debug: true }` and grep the output for
`need(ultimates)` and `ultimates:`. The need line annotates `(covers NN%)` with the raw coverage
ratio; it used to print `(gated NN%)` with the post-discount factor, so old transcripts do not
compare directly.

Two harness traps, both of which produced misleading numbers during this investigation:

* `parseTeams` **auto-fills under-specified specs**. `'Dialyn/Yixuan'` becomes
  `[dialyn, ju-fufu, yixuan]`, silently adding a second ultimate provider. Always print
  `team.map(u => u.id)`.
* **Disqualified teams score `-1` and never reach L4**, so they emit no debug lines at all.
  Measure Seed on `Dialyn/Seed/Orphie`, not `Dialyn/Seed/Astra` — Seed needs a second attacker,
  so the Astra line is DQ'd, while Orphie is nominally an attacker acting as a pseudo-support and
  satisfies the requirement.

**Issue 3** — the second number should be lower than the first once fixed, and currently is not:

```bash
node --input-type=module -e "
import { loadAllData } from './lib/data.js';
import { filterBosses } from './lib/boss-filter.js';
import { parseTeams } from './lib/team-parser.js';
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';
const { units, bosses } = await loadAllData();
const b = filterBosses(bosses, 'Butcher')[0];
for (const drop of [false, true]) {
  const u = JSON.parse(JSON.stringify(units));
  if (drop) delete u.find(x => x.id === 'sunna').mechanics.buffs.atk;
  const { teams } = parseTeams('Nangong/Yixuan/Sunna', u, { preview: true });
  console.log((drop ? 'atk removed ' : 'with atk    ') + scoreTeamForBoss(teams[0].team, b, {}).toFixed(1));
}"
```

**Whole-roster blast radius.** A diff harness (7,102 teams × 18 bosses = 127,836 scores) is the
sharpest check available and is worth rebuilding for any structural change — ~20 lines: enumerate
`buildTeams(...)` against `[...bosses, syntheticNeutral]`, write `boss\tteam\tscore` rows, diff
two runs. Its value is that it supports a *falsifiable prediction*: the ultimate restructure
should have moved only teams containing Dialyn or Ju Fufu, and that is exactly what it moved
(8,723 rows, 6.8%, zero exceptions). "The suites are green" cannot tell you that.
