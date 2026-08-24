# Scoring engine — open issues

Live register of what is actually open in the scorer. All suites are green
(`86/86` scoring, `43/43` recommendations, `6/6` bucketing) — everything below is a *modelling*
problem, not a failing test. Historical post-mortems are demoted to the end.

Last reviewed 2026-08-24.

| # | Issue | Status | Size |
|----|----|----|----|
| 1 | Ultimate appetite is derived from the wrong axes | **Open** — decision needed | Medium; needs a multiplier rebalance |
| 2 | Undersupply gating inverts supplier credit | **Open** — blocked on #1 | Small change, real calibration risk |
| 3 | Partial relevance is never priced | **Open, parked** by owner | Large; broad retune |

---

## 1. Ultimate appetite is derived from the wrong axes

### Terminology — keep these straight

The confusion this issue is about is easy to reproduce in conversation, so name things precisely:

* **Annotated** ultimate scaling = the literal `mechanics.scaling.ultimates` in `units.json`.
  Only YSG (`3`) and Yixuan (`2`) carry one today. Miyabi warrants `1`, and it is **not yet
  applied** — see Consequence A for why applying it is currently unsafe.
* **Effective appetite** = `getEffectiveScaling(unit).ultimates`, the number `need(ultimates)`
  actually multiplies by. The engine *manufactures* it — from magnitude, from frequency, or from
  the annotated value overriding both.

These differ for most units. Never write "Seed's ultimate scaling" without saying which one.

### The three axes

`units.json` encodes three **mutually independent** facts about a unit's ultimate. Full
definitions, including the in-game modifier tiers, are in `engine-context.md` under `damage`.

| Axis | Where | Means |
|----|----|----|
| Magnitude | `damage['ultimate:strong' \| 'ultimate:weak']` | Raw modifier size |
| Frequency | `damage['ultimate:double']` | Ultimates per window |
| Unique benefit | `scaling.ultimates` | Gets something *beyond* the ultimate's own damage |

Crucially, **neither magnitude nor frequency implies appetite for provisioning.** Pyrois has a
double ultimate yet benefits *less* than most from Dialyn (deliberately — two weak ultimates sum
to a normal one, but Dialyn supplies only a single ultimate). Seed has no double ultimate and no
ultimate scaling at all, yet benefits enormously, purely on magnitude.

### The defect

`getEffectiveScaling` manufactures `baseline.ultimates` from magnitude and frequency, then
`{ ...baseline, ...explicit }` lets the annotated value **overwrite** it rather than combine.

**Consequence A — annotating a real unique benefit *lowers* a unit.** Miyabi warrants
`scaling.ultimates: 1`; she genuinely gets a material extra benefit from ultimates. Adding it
**halves** her credit, because the annotated `1` overrides the magnitude-derived `2`:

```
as shipped        annotated=none  appetite=2  need(ultimates) from Dialyn=42.0
with ultimates:1  annotated=1     appetite=1  need(ultimates) from Dialyn=21.0
```

So the correct data change is currently a regression. **Do not apply it until the merge is
fixed** — that edit is pending on this issue. The data is right; the merge is wrong. Overriding
must become combining (`max`, or explicit-only). Reproduce without touching the file by
deep-cloning the unit and setting `mechanics.scaling.ultimates = 1`.

**Consequence B — the frequency bump is conceptually wrong and currently inert.** Every unit
that trips `ultimate:double >= 2` is either subdps (Ramiel — the whole block is skipped) or
carries an annotated value that overwrites it (YSG `3`→`3`, Yixuan `3`→`2`). Pyrois's `1` is
below the bar. So **no unit's live appetite comes from that line.** Deleting it should be
score-neutral across all three suites — verify that, because a surprise there would mean the axis
model is wrong somewhere else.

### Measured baseline

Dialyn (`utility.ultimates: 3`) on Butcher:

```
                  need(ultimates)   effective appetite   annotated   appetite came from
Dialyn -> YSG          63.0                3                3        annotated (implicit also 3)
Dialyn -> Yixuan       42.0                2                2        annotated, overriding implicit 3
Dialyn -> Seed         42.0                2                -        MAGNITUDE (ult:strong 3 -> 2)
Dialyn -> Miyabi       42.0                2                -        MAGNITUDE (ult:strong 2 -> 2)
Dialyn -> Evelyn       21.0                1                -        flat baseline for primary DPS
Dialyn -> Sigrid        0.0                0                -        ultimate:weak zeroing
```

Miyabi drops to `21.0` the moment her pending `scaling.ultimates: 1` is applied — Consequence A.

### The decision this turns on

Magnitude belongs in burst throughput, not appetite. But Seed carries **no annotated value at
all** — her effective appetite of `2` is manufactured wholly from `damage['ultimate:strong']: 3`.
So the intended Yixuan ≈ Seed balance currently rests *entirely* on magnitude leaking into
appetite:

| | annotated | effective appetite | source | need(ultimates) |
|----|----|----|----|----|
| Yixuan | `2` | `2` | annotated (unique benefit) | 42.0 |
| Seed | *none* | `2` | magnitude leak (`ult:strong 3`) | 42.0 |

Remove the leak and Seed collapses to the flat baseline `1` (21.0) or to `0`, while Yixuan holds
at 42.0 — **breaking the intended balance.** So moving magnitude out of appetite is only viable
if `ULTIMATES_PROVISION` (`MULT` 1.5, × burst weight) is scaled up to carry the throughput
difference that `need(ultimates)` (`MULT` 7) currently carries by accident. **That rebalance is
the fix, not a side effect of it.**

### Constraints any fix must respect

* **The `ultimate:weak` zeroing is load-bearing.** It is what makes Sigrid appetite `0`, and what
  implements the intentional Pyrois-under-benefits-from-Dialyn design via his conditional
  `ultimate:strong`. Must survive.
* **Acceptance criterion: YSG clearly top, Yixuan ≈ Seed.** Yixuan's lower magnitude is
  deliberately offset by her unique benefit — her extra non-ultimate attacks rival or exceed what
  Seed puts out in her ultimate alone.
* **The flat baseline `1` for every primary DPS is a separate concept** from the ladder bumps and
  is probably correct — everyone wants ultimates a bit.
* Do **not** give Miyabi `ultimate:double`. Her enhanced attack already carries ultimate-tier
  multipliers and enters throughput via `damage.enhanced` in `BURST_DAMAGE_TYPES`.

---

## 2. Undersupply gating inverts supplier credit

Ju Fufu's `utility.ultimates: 1`:

```
Ju Fufu -> YSG      need(ultimates) 4.2  (gated 20%)
Ju Fufu -> Yixuan   need(ultimates) 4.2  (gated 30%)
Ju Fufu -> Seed     need(ultimates) 4.2  (gated 30%)
Ju Fufu -> Evelyn   need(ultimates) 7.0  (ungated)   <-- least ultimate-hungry carry gets the MOST
```

When undersupplied,
`val = supply × scaling × NEED_FULFILLMENT × (supply/scaling) × UNDERSUPPLY_FACTOR` —
so **`scaling` cancels out entirely**, leaving `4.2 × supply²`. Every undersupplied consumer
receives the same flat number regardless of appetite, and a low-appetite consumer slips under the
gate to collect full credit. Ju Fufu is worth 67% more to Evelyn than to YSG.

`UNDERSUPPLY_FACTOR` models something real — a carry needing 3 who receives 1 stays below their
ceiling — but it is charged against the **supplier's** credit, which is where the inversion comes
from.

**Sequencing:** this interacts with issue 1. If appetite values change, every gating ratio here
changes with them. Settle #1 first, or fix both together — never #2 alone.

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

**Effective appetite per unit** (issue 1):

```bash
node --input-type=module -e "import { getEffectiveScaling } from './app/public/lib/common/team-scorer.js'; import { readFileSync } from 'fs'; const raw=JSON.parse(readFileSync('./app/public/data/units.json','utf8')); const list=Array.isArray(raw)?raw:raw.units; for (const id of ['ysg','yixuan','seed','miyabi','evelyn','sigrid']) console.log(id.padEnd(8), 'appetite=' + getEffectiveScaling(list.find(y=>y.id===id)).ultimates);"
```

Expect `ysg 3`, `yixuan 2`, `seed 2`, `miyabi 2`, `evelyn 1`, `sigrid 0`.

**Per-pair ultimate credit** (issues 1 and 2) — score a team with `{ debug: true }` and grep the
output for `need(ultimates)` and `ultimates:`.

Two harness traps, both of which produced misleading numbers during this investigation:

* `parseTeams` **auto-fills under-specified specs**. `'Dialyn/Yixuan'` becomes
  `[dialyn, ju-fufu, yixuan]`, silently adding a second ultimate provider. Always print
  `team.map(u => u.id)`.
* **Disqualified teams score `-1` and never reach L4**, so they emit no debug lines at all.
  `Dialyn/Seed/Astra` is DQ'd on Butcher; measure Seed on a legal team instead.

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

A whole-roster diff harness (7,339 teams × 18 bosses = 132,102 scores) was used to check blast
radius during the 3.2 remodel. Rebuilding it is ~20 lines: enumerate `buildTeams(...)` against
`[...bosses, syntheticNeutral]`, write `boss\tteam\tscore` rows, diff two runs.
