# Scoring engine — open issues

Live register of what is actually open in the scorer. **The scoring suite is 102/108.** TESTs 100
and 101 are RED on purpose (issue 7); TESTs 7 and 15 are bands the phase-5 greed work pushed out
and are recorded in `KNOWN_RED`; TESTs 13, 18, 25 and 26 are the residue of the issue-3 rework.
**Recommendations 43/44**, with TEST 43 red on purpose — the pull engine cannot distinguish a
Remielle roster with Velina from one without. **Bucketing is 4/6** — a side effect of YSG's
support valuations moving, not a separate defect; see issue 8.
Everything else below is a *modelling* problem rather than a failing test. **Issue 5 is the one to
read first if you are touching disorders**; it records four confident diagnoses that were all
wrong. **Issue 3 is the one to read first if you are touching cohesion**; it now records four more.
Historical post-mortems are demoted to the end.

Open: issues 3 (residue), 5 (reopened), 7 (adjudication), 8 and 9, plus the two notes at
the end of issue 5.

Last reviewed 2026-08-31.

| # | Issue | Status | Size |
|----|----|----|----|
| 1 | Ultimate credit is derived from the wrong axes | **Resolved** — see the post-mortem below | Done |
| 2 | Undersupply gating prices partial coverage flat | **Resolved** — see the post-mortem below | Done |
| 3 | Partial relevance is never priced | **Reworked, not closed** — cohesion no longer charges waste, and deleting a mismatched buff no longer improves a team. Four tests remain, and one structural flaw is now named | Large; one structural piece left |
| 4 | Burst throughput measured by the wrong aggregate | **Resolved** — see the post-mortem below | Done |
| 5 | Disorder supply was never measured | **Not resolved** — fix landed and is correct in direction, but its oversupply shape caused issue 7. Do not close until 7 is green | Blocked on 7 |
| 6 | `isLumenUnit()` is false during morph scoring, so every *natively lumen* rule inverts | **Resolved** — see the post-mortem below | Done |
| 7 | Miyabi's composition ordering is wrong: triple-anomaly over-valued, off-field partners under-valued | **Mostly fixed** — TEST 98 and 99 green after phase 5's burst-window contention; 100 and 101 are ladder questions for owner adjudication | Adjudication |
| 8 | Cohesion is a per-unit judgement applied as a whole-team multiplier | **Open, new** — named during the issue-3 rework; explains TESTs 25 and 26 as one thing | Large; layer-boundary rework |
| 9 | The pull engine never consults team scores, so it cannot see partner quality | **Open, new** — surfaced by recommendations TEST 43 | Feature, not a fix |

---

## 3. Partial relevance is never priced

**Reworked over five phases, not closed.** The headline symptom is gone. Four tests and one
structural problem remain. The notes from before the rework are kept below the fold because two of
their premises turned out to be wrong, and knowing which ones is the point of this register.

### What the issue turned out to be

The old cohesion measure took the best of three numbers:

```js
Math.max(adjustedRatio, threshold, coreRatio)     // threshold = effectiveWeight / 4
```

This register used to call `threshold` the bug — a quantity with no denominator, blind to waste,
that usually won. **That reading was wrong, and it is the single most important correction here.**
`threshold` was the only term that answered the question a team actually asks, and deleting it
without a replacement made everything worse.

The owner settled it with two hypothetical units, and they are worth keeping:

> **Fiona** buffs sheer, laceration, elemental damage, disorder damage, and debuffs wind. On any
> real team exactly one of those lands and four miss — and she is still a tier-zero support,
> because the one that landed is enormous. Nobody was ever going to want all five.
>
> **Marissa** buffs laceration hugely, plus small ATK, CD and a unique ultimate buff. On an attack
> team her laceration is wasted *and* it is her defining feature. **Delete her laceration buff and
> she gets better on that team**, because her flagship becomes the ultimate buff, which lands.

So there are two questions, and *what fraction of your kit was wasted* is neither of them:

| who asks | question | shape |
|----|----|----|
| the team | do the buffs **I** care about land? | absolute — how much damage arrived, no denominator |
| the unit | did **my flagship** land? | identity — not a quantity at all |

A ratio answers neither, and fails in a specific way: adding an offering that does not land leaves
the numerator alone and raises the denominator, so **a ratio always rewards deleting a mismatched
buff**. That is what "removing a badly-landing buff improves the team" always was. It is inherent
to ratios, not a calibration miss, and no amount of tuning reaches it.

### What landed

```js
delivered = Σ (weight × impact × relevance)          // no denominator; waste is never charged
util      = min(1, delivered / DELIVERY_REFERENCE) × (flagshipLanded ? 1 : WHIFF_COHESION_PENALTY)
```

Waste is not charged at all. Only mismatch is, once, on identity. `flagshipLanded` asks whether the
unit's largest offering — or one within `FLAGSHIP_BAND` of it — **substantially** reached a
consumer. That last word is load-bearing: it used to mean `relevance > 0`, so Yuzuha's ATK buff
arriving at a third on a rupture carry counted as her flagship finding a home.

The acid test, which is what this issue exists for:

| team | strip | before | after | |
|----|----|----|----|----|
| `Nangong/Yixuan/Sunna` | Sunna's `atk` | 194.5 | 175.5 | correctly worse |
| `Nangong/Miyabi/Sunna` | Sunna's `atk` | 367.6 | 249.0 | correctly worse |
| `YSG/Zhao/Lucia` | Lucia's `sheer` | 190.9 | 223.3 | **correctly better** — the Marissa case |

Supporting changes, each measured separately against a stated prediction with zero exceptions:

- **Element buffs are a menu** (`chargeableElementArms`). Lighter carries fire AND ice so that one
  matches; the dead arm is no longer charged. He is the only multi-element unit in the roster, so
  he is the only unit it can move — by construction, not by a guard.
- **Quick assists are small and always land** (`quickAssistCohesionWeight`). Astra's
  `quick-assists: 3` used to enter cohesion at weight 3 and return 0.75, recording her as wasting
  the thing every carry in the game happily uses.
- **`damage.basic`** — a role-inherited baseline (DPS/subdps 3, stun 2, defence 1, support 0),
  overridable. Answers "how do we know Sunna deals more damage than Astra", which nothing else
  could. Resolved against *effective* roles, so Nangong reads 3 beside an anomaly agent and 2 on a
  pure stun team.
- **Daze counts for non-stunners.** Sunna is shy of a pseudo-stunner: enough daze to matter, not
  enough to open a window. Her `daze: 2` previously counted for nothing and she read below Nicole
  on every team.
- **Defensive provisions are exempt** from delivery — the game heavily favours offence and veils
  or shields are negligible beside a damage buff. Sunna's `veils: 3` was 48% of her measured kit
  and landed on nobody.

### The four wrong premises, recorded so they are not repeated

1. **"`threshold` is the bug."** It was the answer to the team's question, unweighted. Deleting it
   exposed the ratio's flaw in full: `YSG/Zhao/Lucia` improved by **126 points** when Lucia's
   defining buff was deleted from the data.
2. **"There are two impact tables and they disagree — merge them."** `MULT` is not a damage scale.
   It is a table of **L4 pair-term coefficients**, multiplied by a consumer weight and then
   soft-capped at 100. L4 pays sheer **81.0** into Yixuan and ATK **0.7** — a 116× spread that is
   survivable inside a capped additive layer and catastrophic inside an uncapped multiplier. Used
   raw as delivery weights, every ATK support collapsed and every sheer or ultimate support
   saturated. Delivery now uses the square root of the coefficient.
3. **"A team must never score higher for a unit having strictly less kit."** Disproved by Marissa.
   Waste and mismatch are different things and only the second should cost anything.
4. **"The remaining failures are a calibration problem."** They are not. TESTs 25 and 26 fail at
   every value of the delivery scale, the delivery reference, the flagship band **and** the
   non-DPS utilisation exponent. Four independent dials, none of which touches them. See issue 8.

### Still open

**TESTs 13, 18, 25 and 26.**

| test | reads | wants | what it is |
|----|----|----|----|
| 13 | `Dialyn/Evelyn/Pan Yinhu` 147.3 | < 100 | band. Owner has called it a re-band |
| 18 | `YSG/Zhao/Soukaku` 147.3 | higher | band. Soukaku's lone ice buff genuinely lands on nobody here — YSG is physical and Zhao is a defence unit who deals little damage. Correct behaviour, stale band |
| 26 | `Qingyi/YSG/Sunna` 220 | 300+ | **not a defect.** YSG has `utility: {stunless: true}`, so Qingyi's daze credit lands on nobody and her whole delivery is `stun-multiplier: 2`. The engine is right that her stun is wasted on a stunless carry; the band predates that being modelled. See issue 8 for why the *consequence* is still wrong |
| 25 | `Yixuan/Lucia/Yuzuha` 303.7 | ≤ 220 | the one genuinely open case. Lucia is a *correct* pairing for Yixuan and sits at 100%; the team is only supposed to be weak because Yuzuha is a poor third, and Yuzuha at 55% does not drag it enough |

**Two cases needed a hand-written annotation rather than emergent mechanics**, which is worth
noticing as a pattern rather than treating as two accidents:

- **Sunna on a rupture carry** carries `synergy.avoid: ["rupture"]`. She joins on attack/faction, so
  she only ever reaches a rupture team beside Nangong (every rupture unit joins on stun or
  support) — and there she is extraneous: Nangong already brings the stun multiplier, daze and
  recovery debuff, no rupture unit is `totalize` so a second source has nothing to feed, and her
  own ATK arrives at a third. What the team wants is crit damage and sheer, which she lacks.
  `avoid` now distinguishes two claims: naming a **unit** disqualifies, naming a **role** applies
  `ROLE_AVOID_PENALTY` — a bad team, not an impossible one.
- **Lycaon** keeps `scaling.buffs: 0`, exempting him from cohesion entirely. Deliberate: he is one
  of only two anomaly stunners, and should not be penalised when his ice debuff is useless, since
  he is what there is. A **scarcity exemption**, and there is no mechanism for that concept.

### Everything below this line predates the rework

Kept as evidence, not as guidance. It was written while the fit ratio was assumed to be the right
shape and `threshold` was assumed to be the bug — both of which turned out to be backwards. The
measurements are still real; the conclusions drawn from them are not.

### Measured: the cohesion tax falls on one archetype, ~9 points

New evidence from issue 7, and the sharpest quantification of this issue so far. The `0.984`
teamwork multiplier applies to precisely the four `anomaly hypercarry` teams in Miyabi's comparison
set, and to **none** of the triple-anomaly or Remielle lines competing with them, which all sit at
`1.000`:

| team | raw | x teamwork | final | cost |
|----|----|----|----|----|
| `Nangong/Miyabi/Yuzuha` | 592.3 | 0.984 | 582.9 | **−9.4** |
| `Nangong/Miyabi/Astra` | 563.1 | 0.984 | 554.2 | −8.9 |
| `Nangong/Miyabi/Sunna` | 559.8 | 0.984 | 550.9 | −8.9 |
| `Nangong/Miyabi/Nicole` | 527.7 | 0.984 | 519.3 | −8.4 |
| every competing triple-anomaly / Remielle line | — | 1.000 | — | 0 |

The mechanism is Consequence A seen from the other side: adding Yuzuha drops Nangong's utilization
from 100% to 94%, because his `anomaly` buff lands on two anomaly bodies with Vivian but only one
with Yuzuha. The team is better and the ratio says worse. **On raw score
`Nangong/Miyabi/Yuzuha` already beats `Nangong/Miyabi/Vivian` (592.3 vs 588.5)** — it loses only to
the multiplier.

So this issue systematically taxes *stunner + carry + true support*, one of the game's strongest and
most common shapes, about 9 points relative to the compositions it competes with. That is a
concrete, reproducible cost for a decision to weigh, where previously there was only the
`Nangong/Yixuan/Sunna` illustration.

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

## 8. Cohesion is a per-unit judgement applied as a whole-team multiplier

**New, and it is the structural residue of issue 3.** Named by the owner, from the game side:

> All of these teams should be strong against Typhon because YSG/Sunna is already strong against
> Typhon and any bonuses from a third teammate with defensive assist are **gravy**.

Gravy *adds*. But `computeBuffUtilization` produces a per-unit fit judgement, which feeds the
teamwork multiplier, which scales the **entire team score**. So a third member's poor fit does not
reduce that member's contribution — it scales down the damage the other two are doing.

This explains TESTs 25 and 26 as one thing, in opposite directions:

| team | the third member | reads | effect |
|----|----|----|----|
| `Qingyi/YSG/Sunna` | Qingyi's stun is wasted on a stunless carry | 63% | drags a strong core **down** to 220 |
| `Yixuan/Lucia/Yuzuha` | Lucia is a correct pairing for Yixuan | 100% | multiplies a weak team **up** to 303.7 |

Neither judgement is wrong. Qingyi's stun really is wasted on YSG; Lucia really does suit Yixuan.
The error is applying either one to the whole team.

**Do not attack this with a dial.** It was measured against four of them — the delivery scale
(flat through sqrt), the delivery reference (2.5 through 7), the flagship band (0.5 through 1.0),
and the non-DPS utilisation exponent (0.5 through 2). TESTs 25 and 26 fail at every value of every
one. Softening the exponent, which is the obvious move, makes the overall picture strictly worse:

| non-DPS exponent | unexpected failures |
|----|----|
| 2 (current) | 4 |
| 1.5 | 5 |
| 1.0 | 7 |
| 0.5 | 7 |

The fix is a rework of how L2, L4 and the teamwork multiplier divide responsibility — a
mismatched support should contribute less, not multiply the team down. That is its own phase with
its own baseline, not a tuning pass.

**Bucketing 4/6 is a side effect of this, not a separate front.** YSG's support valuations moved,
so mixes of Dialyn / Sunna / Zhao with YSG no longer fall inside the same epsilon band:
`YSG/Zhao/Sunna` (429.4) and `Dialyn/YSG/Sunna` (476.6) are 47 points apart against a 9.5-point
band on Thrall, and bucketing TEST 1's allocation fails downstream of that. It needs no diagnosis
of its own — it resolves when the YSG support question does, or it is a re-band. Do not open it as
a separate workstream.


---

## 9. The pull engine never consults team scores, so it cannot see partner quality

Remielle's ceiling depends enormously on **one** partner. Her best teams are all
`Remielle/Velina/X`; without Velina the best available line is around `Alice/Vivian/Remielle` —
Alice generating disorders and Remielle absorbing anomaly procs, which is good but is not the same
thing. The owner's words: *"Velina is incredibly strong and there is a very clear difference
between Rem/Vel teams and Rem/Viv teams."*

**The pull engine cannot tell those two rosters apart.** It imports helpers from `team-scorer.js`
but never calls `scoreTeamForBoss`; it reasons about scaling keys, role coverage, element coverage
and codependency. Velina changes none of those on a roster that is already anomaly-heavy, so
Remielle rates Medium with her and Medium without her.

Recommendations TEST 43 pins this. It is red on purpose and carries the reason.

**A `synergy.units` annotation on the pair was tried and rejected.** It does not move the
recommendation at all — the pull engine's mech-synergy gaps do not reach this decision — and in the
scorer it lifts `Promeia/Remielle/Velina` from 501.6 to **581.6**, an 80-point change for a
side effect. Do not reach for it again without measuring both halves.

Closing this means teaching the pull engine to weigh partner QUALITY, most likely by consulting
the scorer for a candidate's best achievable team on the current roster versus with the candidate
added. That is a feature, not a fix, and it is the first thing that would make the two engines
genuinely share a model rather than share a vocabulary.

Note that Remielle rating Medium without Velina is **correct** and was accepted as such — the old
fixture asserted High because it was blind to the distinction, not because the engine was wrong.

---

## Phase 5 post-mortem — burst window contention (`scaling.greedy`)

Landed, and it closed issue 7's TEST 98.

Some carries need the stun window to THEMSELVES. Remielle cannot fire her double ultimate while
Miyabi is running enhanced → ultimate → enhanced, which is the same reason dual-attacker and
dual-rupture teams do not exist. `scaling.greedy` measures that, and it is about **execution
difficulty rather than damage**: Miyabi's enhanced attacks take about twice as long as Promeia's
and need disorder fuel timed into the window, while Aria's are very quick.

    3   needs the window to itself   Yixuan, Remielle, Miyabi, Evelyn
    1   real rotation, quick         Aria, Promeia, Alice, Sigrid, Harumasa
    0   everyone else

**Measuring this by burst size would have been wrong** — it would have penalised Aria and Promeia,
who are two of Remielle's *best* partners. Only greed above 1 contends, and that one rule is what
separates the cases.

**Two halves, penalty and bonus:**

- **Contention** (`MULT.GREED_CONTENTION`, −3 per greed unit squeezed out). The greediest keeps the
  window; everyone else's greed is what is lost. −3 is the only value in the window: −2 leaves
  `Nangong/Miyabi/Yuzuha` losing on Neutral, −4 pushes `Miyabi/Remielle/Vivian` below
  `Miyabi/Vivian/Yuzuha` on Girtablullu.
- **A shortened enemy recovery is worth more to a greedy carry** — most units have plenty of time
  to land their burst inside a normal stun; a greedy carry is the one that was running out of
  window. Gated at greed 2. This is why Lighter beats Trigger as Evelyn's stunner: both raise her
  stun multiplier, only Lighter shortens recovery, and Evelyn declares `scaling.recovery` outright.

Resulting ladder, correct on all four bosses:

| boss | NMYuzuha | MVRemielle | MVYuzuha |
|----|----|----|----|
| Butcher | **593.2** | 574.7 | 561.2 |
| Marionettes | **570.5** | 551.7 | 538.2 |
| Girtablullu | **469.1** | 457.4 | 454.5 |
| Neutral | **499.4** | 489.3 | 486.0 |

Both halves held their predictions with zero exceptions: contention moved 414 rows all attributed
to the `contention` layer, every one containing two units with greed above 1; the recovery bonus
moved 2,322 rows all attributed to `l4`, every one containing a recovery debuffer *and* a greedy-2
carry. Combined, 2.1% of the corpus.

### What it cost, and what is not covered

**TEST 7's Pompey rung and the greed mechanic cannot both stand.** The rung wants
Dialyn > Lighter > Ju Fufu on fire-weak Pompey. With **no greed bonus at all** that gap is
**1.7 points** (Dialyn 409.3, Lighter 407.6), and Lighter's fire element is amplified on a fire-weak
boss — so any bonus flips it, including a bonus of 1. Measured across four candidate bonus shapes;
none satisfies both this rung and the Neutral ordering the owner asked for. Owner adjudication.

**TEST 15** re-bands: `Nangong/Yixuan/Sunna` reads 279 against a 265 ceiling because Yixuan is
greedy and Nangong debuffs recovery. Sunna is already charged `ROLE_AVOID_PENALTY` there; raising
that again to chase this ceiling would be tuning one lever to hide another.

**The value-scaling is unverifiable today.** The contention penalty scales with the greed values,
but every contender on the current roster is annotated 3, so every clash is 3+3 and no fixture can
distinguish scaling from a flat charge. It becomes testable when a greedy-2 unit exists. Recorded
in TEST 107 rather than left as an implicit gap.

**A literal reading of the phase's stop-if was violated and judged acceptable.** The rule was "any
`Remielle/Velina/X` team moves"; `Miyabi/Remielle/Velina` moved. That is Miyabi(3) + Remielle(3) —
a real contention case that happens to contain Velina, not one of her best teams. Against the
named list — `Remielle/Velina/{Aria, Promeia, Alice, Burnice}` — 95 rows were checked and none
moved.

## 5. Disorder supply was never measured

**Not resolved — reopened.** The fix below landed, is correct in direction, and is backed by TESTs
93-97. But it priced oversupply linearly and uncapped, and that is one of the two mechanisms behind
**issue 7** (Miyabi's composition ordering). Treat this issue as open until issue 7 is green. The
heading previously read *Resolved*, which was premature: the whole-roster diff and three green
suites did not surface it, and `compositions.js -10 :Miyabi` did — one more instance of the standing
lesson that a green suite is not evidence.

**Originally filed as:** The heading used to read *"the disorder model only sees element cycling, not solo
polarity generation"*. That was one symptom of a larger defect, and the framing kept the real one
hidden for two rounds. Found while scoping Alice, and it invalidated three confident-sounding
diagnoses before it was understood. Read this before touching anything disorder-related.

### The framing that was wrong

`scaling.disorders` declares a **need**. Miyabi at `3` cannot reach her ceiling unless the team
actually generates that many disorders, so her score must rise with the team's disorder generation
and fall without it. The footnote at the bottom of this issue recorded the symptom as *"a
`scaling.disorders` of 2 and 3 pay identically"* — which invited the wrong repair, comparing two
consumers with different needs and trying to order them. **That measures the wrong thing.** The
right measurement is one consumer across a supply gradient, and it showed the actual defect:

```
                          before      Miyabi's disorder credit
lighter/miyabi/astra       242.5      0                        no source
miyabi/astra/yuzuha        340.4      0                        no source
miyabi/soukaku/yuzuha      285.1      0                        <-- should be cycling (see D3)
miyabi/vivian/yuzuha       443.2      28.0                     cycling
nangong/miyabi/yuzuha      496.3      28.0 + 16.8              cycling + polarity
miyabi/yanagi/yuzuha       434.3      28.0 + 16.8              cycling + polarity
nangong/miyabi/vivian      494.5      28.0 + 16.8              cycling + polarity
nangong/miyabi/yanagi      470.3      28.0 + 16.8              cycling x2 + polarity x2
```

**28.0 in every team that generates any disorder at all.** The engine had no notion of *how much*
disorder a team produces. Four defects, one root cause.

**D1 — the needs side never read team-wide generation.** The L5 cohesion audit satisfied a
`disorders` need only from the consumer's *own* `hasDisorder` reaction or a teammate's
`utility.disorders`. Disorders generated by two *other* teammates cycling never counted, so a
consumer that is not itself half of the pair read as unmet on a team swimming in disorders.
Latent: both `scaling.disorders` units are anomaly agents, so they always had a reaction of their
own. This was the issue's original headline and it was real — just not the largest part.

**D2 — supply was a hardcoded constant.** `hasDisorder` was a boolean and the implicit block
turned it into `implicitSupply = 2`. So one cycling partner paid the same as three; Miyabi's need
of `3` sat permanently at 67% coverage, **unreachable by any composition**; and cycling supply and
polarity supply were each measured against the *full* need independently, so on
`nangong/miyabi/yuzuha` both read 67% when together they were 4 against a need of 3. The recorded
`2 == 3` symptom is downstream: with supply pinned at 2, `supply x need x min(1, supply/need)`
collapses to `supply^2` and the need term drops out. Same arithmetic collapse TEST 91 records for
ultimates — but ultimates deliberately chose fraction-of-need semantics, which is wrong here.

**D3 — two disorder detectors disagreed, and the live one was wrong.**
`computeAnomalyReactions` compared **base** elements, so `ice` and `ice:frost` read as identical
and **Miyabi/Soukaku and Miyabi/Promeia generated no disorders at all**.
`teamHasImplicitDisorders` used `getElementVariant` and said the opposite, so L3's
`weak: disorders` credit already fired on those teams while L4 paid Miyabi nothing. `units.json`
documents the intended behaviour in Soukaku's own `displayText`. Unrecorded before this pass, and
the largest single mover.

**D4 — proc sources were gated on holding an anomaly role.** Reaction partners were enumerated as
anomaly-*role* agents only. But `utility["anomaly:<element>"]` states that an extra anomaly of that
element lands on the target, and a proc is a proc whoever fires it — the anomaly-**quantity**
channel already read the key role-blind while the reaction path did not. Latent (Alice is the only
holder, and her `anomaly:physical` is an element she already supplies as an agent), but it is the
shape a wind enabler needs if it ever loses its `anomaly` pseudo-role while keeping the procs.

### The fix

One measured quantity, consulted everywhere it matters.

* **`getProcElements` / `getOwnGaugeElement`** — one enumeration of which element-variants the team
  lands on the target. A unit contributes its own gauge element when it holds an effective
  `anomaly` role, plus any `utility["anomaly:<element>"]` element regardless of role (D4). Lumen
  contributes nothing. Comparison is on the **variant** (D3).
  `getOwnGaugeElement` exists so the element a unit *contributes* and the element it is *excluded
  from reacting with* cannot drift apart — a mutation that changed only one side made Miyabi
  disorder with herself, so the two now come from one function.
* **`computeAnomalyReactions` returns `disorderElements`**, a Set, with
  `hasDisorder === disorderElements.size > 0`. Every existing read site is untouched; the count is
  what a boolean could never express.
* **`getDisorderSupply(unit, team, reactions)`** — `DISORDER_CYCLE_SUPPLY` (2) per distinct cycling
  element, **plus** teammates' `utility.disorders`. Added, never netted: a prototype that
  *subtracted* teammate provision from cycling supply passed all three suites and was still wrong,
  deleting the cycling credit precisely when a polarity unit was present. A consumer with no
  reaction of its own reads the richest stream on the team — that is D1.
* **One payment, not two.** The implicit block's disorder branch and the pair loop's
  `need(disorders)` are replaced by a single team-level payment over the whole team:
  `supply x need x MULT.NEED_FULFILLMENT x (covered ? 1 : UNDERSUPPLY_FACTOR)`. No new constant
  except `DISORDER_CYCLE_SUPPLY`, which only names the literal that was already there.
* **L5** consults the same `getDisorderSupply`, which retires the disorders-only branch inside the
  supplier loop.
* **`pull-engine.js`** disorder-partner checks are now variant-aware via `getDisorderElement`,
  or it would gate Miyabi out for having no disorder partner on a team the scorer scores happily.

`DISORDER_CYCLE_SUPPLY = 2` is the calibration anchor: one cycling element reproduces the old
hardcoded supply exactly. Combined with a payment **linear in supply**, that keeps every Alice
number identical wherever she was already covered — `Nangong / Alice / Velina` is byte-identical at
525.7, where the old two channels paid `28 + 28` and the new one pays `4 x 2 x 7`. What used to
look like double payment was payment for two real supplies, and it survives unchanged.

### After

```
                          before   after      credit
lighter/miyabi/astra       242.5   242.5      0                              no source
miyabi/astra/yuzuha        340.4   340.4      0                              no source
miyabi/soukaku/yuzuha      285.1   347.2      25.2  supply 2, undersupplied  D3
miyabi/vivian/yuzuha       443.2   440.9      25.2  supply 2, undersupplied
miyabi/yanagi/yuzuha       434.3   460.3      84.0  supply 4, covered
nangong/miyabi/yuzuha      496.3   515.2      84.0  supply 4, covered
nangong/miyabi/vivian      494.5   518.7      84.0  supply 4, covered
nangong/miyabi/yanagi      470.3   520.6     168.0  supply 8, covered
nangong/alice/velina       525.7   525.7      56.0  supply 4, need 2         unchanged
```

> **Superseded by issue 7.** Both warts flagged in the next paragraph — the coverage cliff and the
> uncapped linear tail — were the mechanisms behind issue 7, and both are now gone: the step became
> a ramp, and oversupply became logarithmic on the consumer side and hard-capped on the boss side.
> The numbers below are the state as of issue 5 landing, kept because the reasoning is what issue 7
> then had to unpick.

Strictly increasing in supply, which is the whole point. Note the **cliff at coverage**: supply 2
draws `UNDERSUPPLY_FACTOR` and supply 4 does not, so 25.2 jumps to 84.0. Reachable supply is a
coarse ladder (0, 2, 4, 6, 8) and no team lands between, so nothing is priced *inside* the
discontinuity — but it is a step, not a ramp, and it is the first thing to revisit if these
magnitudes ever feel wrong. **Oversupply is linear and uncapped**, which is what preserves Alice;
the consequence is that a maximally disorder-rich team pays a large absolute term (168 raw on
`nangong/miyabi/yanagi`, against 75.6 for YSG's entire ultimate value). The L4 soft cap absorbs
most of it — that team lands at #7 on Fiend, not runaway — but the linear tail is a deliberate
choice, not an oversight, and `ANOMALY_ELEMENT_MULT`'s channel is the precedent for it.

### Verification

**1,186 of 132,102 whole-roster scores moved (0.90%), and every single moved team contains Miyabi
or Alice** — the only two `scaling.disorders` units, zero exceptions to the prediction. 639 up, 547
down, mean +18.1, range +83.8 / −16.3. The down-movers are all Miyabi undersupplied cases (28.0 →
25.2), where the merged channel now applies the same undersupply discount every other need key
pays and the old implicit block skipped. Top six on Fiend unchanged; Miyabi's two disorder-rich
lines enter at #7 and #8, which for the game's signature disorder comps reads as a correction.

Suites: **97/97** scoring (five new), 43/43 recommendations, 6/6 bucketing. No constant retuned and
no test threshold moved.

TESTs 93-97 are new, and each was mutation-checked one-to-one — every mutation kills exactly its
own test and no other:

| mutation | dies |
|----|----|
| cycling supply re-flattened to a boolean | 93 |
| polarity dropped from the aggregate | 94 |
| L5 audit reverted to the consumer's own reaction | 95 |
| variant awareness removed at `getOwnGaugeElement` | 96 |
| proc sources re-gated on holding an anomaly role | 97 |

TEST 93 needed two passes and is the cautionary one. Written first as the supply gradient alone, it
**passed against the unfixed engine** — the old flat model produced that same ordering out of its
separately-priced polarity channel. Exactly the TEST 89 trap. What the flat model provably cannot
do is tell ONE cycling element from TWO, so the decisive assertion clones Vivian off ether onto
fire and asserts Miyabi gains from the second distinct element. TEST 94 is decisive for the same
reason: it straddles the aggregate supply of 4 (a need of 4 is covered, a need of 5 is not), and
without aggregation neither is ever covered and the *larger* need wins on the bare need product —
so splitting the channels apart flips the assertion rather than merely weakening it.

### The game facts this rests on, which have not changed

**Disorders arise two independent ways.** Element cycling — two anomaly sources of different
non-wind elements, e.g. Nangong's ether over Miyabi's frost. *And* solo polarity generation:
**Yanagi and Nangong each generate polarity disorders entirely on their own**, with no second
anomaly agent required. `getDisorderSupply` adds both; before the fix `computeAnomalyReactions`
modelled only the first, and the engine compensated in exactly one place —
`teamHasDisorderGenerationFromReactions = teamHasAnyDisorder(reactions) || teamHasPolarity(team)`,
the `|| teamHasPolarity` being what makes **Trigger / Yanagi / Yuzuha** score correctly, since
Yanagi disorders alone and Yuzuha's `buffs.disorders: 3` must read as utilised.

**Why the suites stayed green through all of it.** The only units that scale on disorders are
Miyabi and Alice, both anomaly agents, and neither generates polarity — Miyabi is frost-cycling
only, and Alice's polarity is *assaults*, not disorders (below). The only two solo-polarity units,
Nangong (ether) and Yanagi (electric), are anomaly agents themselves and share no base element with
Miyabi or Alice. So every pairing that would have exercised D1 also satisfied element cycling.
Structural luck about the current roster, not a rule, and the reason D1 and D4 both needed
synthetic units to be testable at all.

### Three wrong diagnoses this produced, recorded so they are not repeated

**"The disorder need is paid twice."** It is not. `need(disorders)` in the L4 pair loop prices a
teammate's `utility.disorders` provision; the implicit block at \~line 2660 prices natural element
cycling. **Two genuinely different supplies.** Nangong + Miyabi produces ether/frost cycling
disorders *and* Nangong's polarity disorders on top; a consumer should be paid for both. A
prototype that subtracted teammate provision from the implicit supply passed all three suites and
was **still wrong** — it deleted the cycling credit precisely when a polarity unit was present,
which is backwards. Another instance of the standing lesson that green suites are not evidence.

**"A disorder is a team reaction, so no unit can disorder alone."** False, per Yanagi and Nangong
above. It was offered as the principled justification for excluding `disorders` from the L5
self-provision shortcut. A false principle applied anywhere else does damage — it would treat
Yanagi's solo disorders as non-existent and penalise Yuzuha's buff as unutilised.

**"Alice generates polarity disorders she cannot consume."** False, and it was a *game-mechanics*
error rather than a modelling one — see the next section.

### Resolved: the "Alice exception" never existed

This section used to record a unit-specific exception — that Alice generates polarity disorders,
gains a stack from any disorder *except her own*, and is therefore the only unit in the roster
whose own generation does not satisfy her own need. A per-unit mechanic that could not be
expressed as a rule about the `disorders` key, and the thing blocking the fix direction above.

**The premise was wrong.** Alice does not generate polarity *disorders*. She generates polarity
**assaults** — extra anomaly procs of her own element, i.e. physical. An assault is not a disorder, so
there is nothing for her to fail to consume, and no exception to model.

`units.json` has been corrected: `damage.polarity` and `utility.disorders` are gone from Alice's
entry, leaving `damage.enhanced: 2` and `scaling: { disorders: 2, am: 3 }`. Everything the
exception was going to need code for now falls out of ordinary structure:

* The **L5 self-provision shortcut** reads `utility[key]`. She has no `utility.disorders`, so the
  shortcut does not fire and her `scaling.disorders` is audited like anyone else's.
* On `Lycaon / Alice / Astra` — no usable disorder source — she is charged: cohesion **0.92**,
  Butcher **251.9**. That is the number the proposed per-key bypass was built to produce, now
  arrived at with no code change at all.
* `Nangong / Alice / Astra` (**407.2**) and `Alice / Yanagi / Astra` (**287.2**) on Butcher are
  paid for cycling and the teammate's polarity, as intended.

No engine change was required *for disorders*, and none is owed. The only casualty is the measured
table that used to sit here, which priced a bypass for a mechanic that does not exist. What her
assaults genuinely do affect — anomaly quantity — is a separate channel, now modelled below.

`mechanics.scaling.disorders` on Alice at either **1 or 2 passes all three suites**. The breakage
the owner originally hit was a pre-3.3 artifact; the burst remodel and the two threshold retunes
absorbed it.

### Resolved: anomaly-quantity supply is now a weighted count

Alice's assaults are extra anomaly procs, so an anomaly-quantity scaler gets more from her than
from a plain anomaly agent. The block at \~line 2723 counted supply as
`team.filter(isAnomaly).length` — a flat head-count that read Alice as exactly one source and paid
nothing for the surplus. **Fixed**, and the fix pulled in a second unmodelled mechanic.

**Vocabulary:** `utility["anomaly:<element>"]`. Element-scoped rather than a generic
`anomaly-procs` flag, so it composes with the head-count it augments exactly as a real agent would
— a generic `scaling.anomaly` consumer absorbs procs of any element, an element-scoped one only
matching procs. Alice is `utility["anomaly:physical"]: 2`; a future fire unit with the same
mechanic annotates `utility["anomaly:fire"]` and is absorbed by the same consumers with no code
change. A generic flag would have had to choose between paying Grace's `anomaly:electric` for
Alice's physical procs (wrong) or never paying element-scoped consumers at all (also wrong).

Supply became `1 per matching agent + ANOMALY_PROC_SUPPLY × w(procs)`, with
`ANOMALY_PROC_SUPPLY = 0.5` so a `2` annotation is worth **one** extra agent's presence, not two —
procs are a surplus on top of a body, not a second body. Verified:

| team | consumer | supply | bonus |
|----|----|----|----|
| `harumasa/alice/astra` | Harumasa `anomaly: 2` | 1 (Alice) + 1.0 (procs) = 2.0 | 16.0, was 8.0 |
| `grace/alice/astra` | Grace `anomaly:electric: 1` | 1 (self) + 0 | 4.0, unchanged — physical procs correctly invisible |
| `grace/yanagi/astra` | Grace `anomaly:electric: 1` | 2 | 8.0, unchanged |

**Remielle's missing channel.** Her Luminize rebound combines the Refringe-boosted damage of
*teammate* anomaly procs, and nothing priced that — she had `damage.luminize` for the hit but no
dependency on proc volume. Now `scaling.anomaly: 3`.

**Lumen supplies no anomaly quantity, not even to itself.** Attribute Mutation morphs damage but
fills no gauge, so a lumen agent procs no anomalies — the same rule `computeAnomalyReactions`
applies to disorders and vortex — its version of the check was broken when this was written, and
issue 6 has since fixed it. Without this, self-counting would have handed every
Remielle team a floor of +12 raw including solo-anomaly ones, which is precisely the composition
her kit is designed to punish. With it, `Lycaon / Remielle / Astra` scores **zero** from this
channel and `Nangong / Alice / Remielle` scores **+36** (Nangong 1 + Alice 1 + assaults 1.0).

The check reads `tags`, not `getElement()`, deliberately. It was the only site doing so; issue 6
generalised it into `isNativeLumen()` and routed every lumen rule through it.

Measured over the whole roster: **1,838 of \~127k scores move, +1.9 to +41.4 points, and every
moved team contains Remielle or Alice.** All three suites stay green. Top-of-table is stable —
on Fiend the top six are unchanged and Remielle enters at #7, which for a tier-0 unit previously
outside the top ten reads as a correction rather than a distortion.

### Resolved (found underneath this one): every *natively lumen* rule was inverted

`getElement()` returns `unit._morphedElement` when set, and the morph search sets that field
**before re-entering** `scoreTeamForBoss`. So inside a morph pass a lumen unit reported its morph
target, and `isLumenUnit()` — `getElement(unit) === 'lumen'` — was `false` on the entire real
scoring path. Every rule meaning *natively lumen* was written element-first, so every one inverted.
`--debug` skipped the morph loop, which is why the guards appeared to work when traced.

**Six sites, not one.** This section originally recorded only the first two:

| site | intended | actual |
|----|----|----|
| reaction guard | lumen procs no anomalies | never fired — Remielle cycled disorders/vortex off a teammate she had morphed off |
| partner skip | lumen is not a disorder partner | never fired — a morphed Remielle inflated *every* teammate's `hasDisorder` |
| `teamHasImplicitDisorders` | lumen adds no element diversity | her morph target counted toward the diversity set |
| **Refringe** | Lumiflux fires when a non-lumen anomaly teammate procs | `anomalyDPS.filter(isLumenUnit)` was empty → `REFRINGE_BONUS` was never awarded at all |
| lumen DQ branch | DQ only if all morph targets resisted | unreachable, but redundant rather than wrong — the outer `max` over targets already produces the same answer |
| debug caveat | — | a lumen team's debug score could never match its real score |

The Refringe row cuts the *opposite* way from the rest: Remielle was collecting illegal reactions
**and** her partners were losing the bonus her kit exists to provide. TEST 58 ("multi-element beats
same-element *due to Refringe cascade*") was passing for a reason unrelated to its own comment — the
cascade had never once fired.

### The fix: one helper per meaning

`isLumenUnit` is **deleted**, so no call site can retain the ambiguous reading:

* `isNativeLumen(unit)` — reads `tags`, so it stays true inside a morph pass. Every rule about
  what lumen *is* uses this: no anomaly gauge (hence no disorder, no vortex, no element diversity,
  no anomaly quantity) and Lumiflux for Refringe.
* `isUnmorphedLumen(unit)` — `isNativeLumen && _morphedElement === undefined`. **Only the morph
  search may use it.** Its recursion terminates precisely because this goes false once a target is
  assigned, which is exactly why the old element-based test looked load-bearing there.

The distinction is the whole issue, and the naming is the guard against a regression: a future
reader reaching for "is this lumen?" now has to pick a meaning.

### Two "no reaction" charges needed a lumen exemption

Making Remielle permanently reaction-less trips machinery that assumes a missing reaction is a
*defect*. For lumen it is a mechanical impossibility, so charging for it prices lumen as a failed
anomaly agent. Both sites now carry `!isNativeLumen(unit)`, the stronger form of the carve-out the
L5 block already documents for Roxy (valued as a wind *enabler*, not a reaction generator):

| site | effect | measured |
|----|----|----|
| **L5** no-reaction unmet need | the load-bearing one | worth **1,908 rows, mean +15.2, max +92.1**. Without it every lumen team pays a cohesion penalty for an impossibility |
| **L2** `reactionDisabled` × 0.5 tier multiplier | consistency | **byte-identical dump** — Remielle's `pseudoRole` includes `support`, so she never reaches `dpsUnits`. Kept as the rule's second home, with the neutrality verified rather than assumed |

L3's `reactionDisabled` needed nothing: it sits inside `if (bossWeaknesses.includes(element))` and
then re-tests `!bossWeaknesses.includes(element)`, so it is already always false. Worth knowing
before someone "fixes" it.

### Morph loop: debug parity and two latent bugs

The search now runs silently and, under debug, **re-scores the winning combination with the trace
on** — so `debug === live` for lumen teams, verified on all eight measured teams. That equality was
impossible before and is the sharpest single check that the rework is correct. `Lumen morph: Remielle→ether` also prints for the first time (the old line read the morph sentinel, which is
false on the traced pass; it reads `isNativeLumen` now).

Two adjacent latent bugs went with it. Both were unreachable on the current roster — one lumen unit,
never alone — so both are **provably score-neutral**, which the whole-roster diff confirms:

* **Empty-targets infinite recursion.** `?? [null]` guarded the non-lumen return, not the
  *empty-array* return, so a lumen unit with no non-lumen teammate recursed until the stack blew.
  Assigning `_morphedElement = null` clears the sentinel while `getElement`'s `??` still falls back
  to the native `lumen` tag — so termination costs nothing and every lumen rule keeps applying. A
  lumen-only pair now returns a finite score.
* **Two-lumen state wipe.** `cleanupRoles` deleted `_morphedElement` for the whole team, so the
  inner pass wiped an *outer* lumen unit's target mid-search. The morph loop now owns that field's
  entire lifecycle; `cleanupRoles` no longer touches it.

### Verification

**1,934 of 133,956 scores moved (1.44%), and every single moved team contains Remielle** — zero
exceptions to the prediction, which is what "the suites are green" cannot tell you. 1,222 moved up
and 712 down, mean **+0.29**, range +72.5 / −142.2.

The direction is the interesting part, and it is the intended one. Triple-anomaly teams **rise**;
duo-anomaly wheelchairs **fall hard** — which is what `engine-context.md` already asserts should be
true of her ("traditional anomaly wheelchairs are strongly *sub*optimal for her") and what the
engine was failing to deliver:

| team (neutral) | was | now | Δ |
|----|----|----|----|
| `Alice / Jane Doe / Remielle` (all-physical) | 236.0 | **266.1** | **+30.1** |
| `Miyabi / Remielle / Vivian` | 445.6 | 461.9 | +16.3 |
| `Alice / Vivian / Remielle` | 408.4 | 422.9 | +14.5 |
| `Alice / Remielle / Velina` | 404.0 | 396.9 | −7.1 |
| `Velina / Remielle / Promeia` | 520.1 | 501.6 | −18.5 |
| `Remielle / Velina / Yuzuha` (wheelchair) | 224.7 | 170.1 | −54.6 |
| `Vivian / Remielle / Yuzuha` (wheelchair) | 175.5 | 119.1 | −56.4 |

The **all-physical team rising by 30.1** is the signature of Refringe activating with no phantom
reaction to lose, and is the single cleanest proof the block was dead. It also strengthens TEST 58
rather than breaking it: the multi-element team now earns `base 8, disorder +4` per partner while
the same-element team earns a bare `base 8`, so the cascade finally separates them for the reason
the test's comment claims.

All three suites stayed green throughout with no constant retuned and no test threshold moved.

### Corrected: the three `anomaly` senses are related, not colliding

This section used to read *"*`scaling.anomaly` and `buffs.anomaly` are different mechanics sharing a
key", describe `buffs.anomaly` as "Anomaly Mastery, a stat", and propose either a rename or adding
`anomaly` to `CODEPENDENT_SKIP_KEYS`. **The premise was a vocabulary error, and the proposed fix is
withdrawn.**

Three distinct mechanics share the `anomaly` stem, and the data vocabulary already separates them —
`character-summary.js` labels `buffs.anomaly` **"Anomaly Buildup"**, with `buffs.am` (Anomaly
Mastery) and `buffs.ap` (Anomaly Proficiency) as their own keys:

| key | sense |
|----|----|
| `utility["anomaly:<element>"]` | **production** — this unit generates additional anomaly procs of that element |
| `scaling.anomaly` | **demand** — this unit needs more procs, because they enable it to do extra things |
| `buffs.anomaly` | **buildup** — the rate at which procs accrue |

Anomaly buildup is *derived from* Anomaly Mastery without being identical to it, exactly as damage
is derived from ATK. An ATK buff and a damage buff are different things; so are a `buffs.am` buff
and a `buffs.anomaly` buff. The keys are distinct because the mechanics are, not by accident.

And because faster buildup means more procs, a `buffs.anomaly` supplier **genuinely does** help a
`scaling.anomaly` consumer. The pull engine's specialist-provider check reading `buffs[key]` for a
`scaling.anomaly` need is therefore *conceptually sound* — the dependency is real, if indirect —
and the "Needs Nangong or Yuzuha to reach full potential" note it produces for Remielle is
reasoning about a mechanic, not a name collision.

One residual caveat, the only place the indirection leaks: buildup multiplies procs that already
exist, so a buildup buff on a team with **no anomaly agent at all** produces nothing.
`detectAnomalyPartnerGap` is the check that covers that case, and it already excludes lumen
correctly.

### Promoted out of a footnote: `implicitSupply` made `scaling.disorders` 2 and 3 identical

This sat here as a one-line aside reading *"the implicit block hardcodes `implicitSupply = 2` and
gates on `min(1, 2 / scaling)`, so `scaling.disorders` of 2 and 3 pay identically — real, and
separate from everything above"*, with a note from the owner that it was a real issue and not
recorded as one. It is now **D2 at the top of this issue**, and it was not separate from anything
above — it was the same root cause and the largest live part of it.

Two things worth keeping from how it read as a footnote, because both misled:

**"Separate from everything above" was wrong.** It looked like an arithmetic wart in one block. It
was the visible edge of supply never being measured, which is also what D1 and D3 are. Filing it
apart from the issue it belonged to is what kept it in a footnote for two review passes.

**The symptom was stated in a way that invited the wrong repair.** *"A 2 and a 3 pay identically"*
frames the comparison as being between two consumers, and a reader — this one included — will
reach for making a `3` out-earn a `2`. That is not a defensible target: `scaling.disorders` is a
NEED, and a need of 3 against a supply of 2 is genuinely undersupplied, so the consumer's score
*should* suffer. The right comparison is one consumer across a supply gradient. Getting this
backwards cost a full round of analysis before the owner corrected it. **When a symptom is an
equality, check which of the two variables should have been varying** — here it was neither of the
ones named, it was the supply that both sides silently shared.

### Still open: L3's `weak: disorders` block keeps its own supply convention

Deliberately left out of the fix above to hold its blast radius to `scaling.disorders` consumers.
L4 and L5 now share `getDisorderSupply`; L3's boss-weakness block still sums `utility.disorders`
and adds a flat `+2` when `teamHasImplicitDisorders`, so it cannot tell one cycling element from
two and does not see a role-less proc enabler (D4) at all. Small and self-contained — Butcher is
the only disorder-weak boss, so it is one matchup — but it is the last place the "how much disorder
does this team make" question is answered by a second, disagreeing convention. Note it would move
Butcher scores, so it wants its own measured pass rather than being folded in.

### Still open: the same collapse affects every other need key

Not fixed, and recorded here rather than as its own issue because it is the general form of D2.
In `scoreNeedFulfillment` the undersupplied branch computes
`supply x scaling x keyMult x (supply/scaling) x UNDERSUPPLY_FACTOR`, and the `scaling` term
cancels — so for `veils`, `ablooms`, `quick-assists`, `interrupt-resistance` and `vortex`, every
undersupplied consumer collects a flat `keyMult x supply^2 x 0.6` regardless of appetite. Lucia's
`veils:1` earns the same 4.2 from a `veils:2` consumer as from a hypothetical `veils:3` one.

`ultimates` escaped via `FRACTIONAL_COVERAGE_KEYS` (issue 2) and `disorders` now escapes by being
priced team-wide against a measured supply. The rest have neither. Issue 2's post-mortem parked
generalising the shape on the grounds that it would move all 17 remaining undersupplied pairs by
10–20 points with direct TEST 62 exposure, and that judgement stands — this note exists so the
gap is on the register rather than rediscovered from the arithmetic a third time.

---

## 7. Miyabi's composition ordering

**Partly fixed; blocked on issue 3.** Surfaced by the owner immediately after issue 5 landed, from
`compositions.js -10 :Miyabi`. Issue 5's fix was correct in direction and made this visible rather
than causing all of it, but issue 5's own linear-uncapped oversupply was one of the mechanisms at
fault, so **issue 5 cannot be called finished while this stands.**

Five changes landed and are recorded under "What landed" below. TEST 99 is green; TESTs 98, 100 and
101 remain red by documented decision, and the reason is now measured rather than guessed — see
"Remaining: three red tests".

`Nangong / Miyabi / Yuzuha` is one of the strongest anomaly teams in the game and should be
Miyabi's clear best. Before this work it ranked **4th** among her compositions:

```
compositions.js peak score            expected
Nangong / Miyabi / Yanagi    599.8    below NMY (triple anomaly)
Nangong / Burnice / Miyabi   590.8    below NMY (triple anomaly)
Nangong / Miyabi / Vivian    588.5    ~6th
Nangong / Miyabi / Yuzuha    582.9    1st
```

Owner's stated best-in-slot ordering, middle entries acknowledged as arguable:

```
Nangong/Miyabi/Yuzuha  >  Miyabi/Vivian/Remielle  >  Nangong/Miyabi/Sunna
  >  Nangong/Miyabi/Astra  >  Miyabi/Vivian/Yuzuha
  >  Nangong/Miyabi/[Vivian|Nicole]  >  Miyabi/Vivian/Astra  >  Miyabi/Vivian/Nicole
```

**Nangong is Miyabi's absolute best-in-slot partner**, ahead of every true anomaly agent. Among
actual anomaly partners the order is **Vivian > Yanagi > Burnice**, with a pronounced cliff below
those three (Velina aside, the rest are not bad, just clearly worse).

### Mechanism 1 (fixed) — the third anomaly agent was priced like the second

Disorder supply is linear and uncapped (issue 5, recorded there as a deliberate choice). So:

```
Nangong / Miyabi / Yuzuha    Disorder need: Miyabi +84.0  (supply 4, need 3)
Nangong / Miyabi / Yanagi    Disorder need: Miyabi +168.0 (supply 8, need 3)
```

In the game the **second** anomaly agent is what establishes disorder cycling; a third adds far
less, and costs field time and a support slot. The engine's field-time economy does charge
`3 on-field agents -> -25`, but +84 of raw disorder credit swamps it. This is the single largest
contributor to TESTs 98 and 99.

### Mechanism 2 (fixed) — off-field anomaly agents were not recognised as disorder engines

Vivian generates no polarity disorders, so `getDisorderSupply` gives her one cycling element and
nothing else: Miyabi reads *undersupplied* (`+25.2`, `supply 2, need 3`) on `Miyabi/Vivian/Yuzuha`.

That misses the mechanic. Vivian is **fully off-field**, so her ether gauge fills *while* Miyabi is
applying frost — procs happen in parallel and disorders land faster than any on-field agent can
manage, **faster even than Yanagi**, who forces them explicitly. Burnice is off-field too and
disorders the same way, though more slowly. And Vivian alone among the three also carries
`buffs.disorders`, which makes her doubly valuable.

`mechanics.onfield: false` already exists in the data and is exactly the discriminator; nothing in
the disorder path reads it.

### Mechanism 3 (fixed, and it was the biggest) — no-support compositions

This started as a vaguer owner note: Miyabi is a very large damage dealer who "critically thrives
off support units", so perhaps supports were under-weighted *for her* rather than anomaly partners
being over-weighted. Measuring it produced a much better rule, and a general one:

**A team with no support or defense agent is a real teambuilding failure, and L1.5 could not say
so.** It rated `Nangong/Miyabi/Vivian` and `Nangong/Miyabi/Yuzuha` as identically
`CONVENTIONAL (+35)`. Checked against the owner's stated best-in-slot list, one structural rule
separates the whole expected ordering from the whole set of interlopers:

| | has a support/defense (or Orphie/Remielle)? |
|----|----|
| all eight expected teams | **yes**, every one |
| every interloper — `Nangong/Miyabi/{Yanagi, Burnice, Vivian, Grace, Aria}` | **no**, not one |

There are exactly 13 true support/defense units, and Orphie and Remielle are the only
pseudo-supports, so the rule is cheap to check. Scope was measured before committing: of 3,179
support-less teams only **319 viable ones** reached CONVENTIONAL, and one archetype of those is
exempt — see change 4.

Note this supersedes the "supports under-weighted for Miyabi" framing entirely. Nothing needed to
change about how supports are valued; what was missing was any penalty for *not bringing one*.

### The specification

TESTs 98-101 in `test-scoring.mjs`:

| test | asserts | now |
|----|----|----|
| **98** | `Nangong/Miyabi/Yuzuha` outscores every other Miyabi team in the whole team space | **red** — 2 exceptions, both Remielle |
| **99** | it beats `Nangong/Miyabi/{Yanagi, Burnice, Vivian, Grace, Aria}` | **green** |
| **100** | Vivian > Yanagi > Burnice as Miyabi's anomaly partner, Nangong ahead of all three | **red** — only `Yanagi > Burnice` |
| **101** | the owner's full best-in-slot ladder | **red** — 4 rungs out of order |

TEST 100's `Nangong > Vivian` assertion is a **guard against overshoot**: raising Vivian for
off-field buildup must not lift her past Nangong. It holds.

---

### What landed

Five changes. Each was diffed over the whole roster (7,339 teams x 18 bosses = 132,102 scores)
against a falsifiable prediction; **every prediction held with zero exceptions.**

| change | what | moved | prediction |
|----|----|----|----|
| 1 | **Parallel gauge buildup.** Cycling supply per element doubles (2 → 4) unless the consumer and the contributor are *both* on-field. Vivian fills ether while Miyabi applies frost, so procs land in parallel — twice as fast. Reuses the existing `isOnField`. | 361 rows | every moved team contains Miyabi or Alice **and** an off-field anomaly unit |
| 2 | **Consumer credit: unbounded but diminishing.** `E_need(s) = need + k·ln(1 + (s−need)/k)`, `k = 0.5·need`. Marginal exactly 1 at the need, so no cliff; `E(1000)=12.75` for a need of 3 — a 180-second fight cannot convert a thousand disorders, but extreme play is never worth exactly zero. | 1,570 rows | Miyabi or Alice |
| 2b | **Undersupply still hurts** — see the correction below. | 677 rows | Miyabi or Alice |
| 3 | **L3 boss-weak(disorders) hard-caps at 5.** Replaces the block's own convention (`sum of utility.disorders` plus a flat +2) with the shared `getTeamDisorderSupply`, through `E_weak`: full credit to 3, marginal falling to 0 at 5, nothing after. The last duplicate convention is retired. | 475 rows | Butcher rows only |
| 5 | **Cissia is a pseudo-support alongside Seed** (`{role:'support', when:{hasUnit:'seed'}}`). | 218 rows | teams containing both Cissia and Seed |
| 4 | **No support or defense is not conventional.** Demoted to the existing `UNCONVENTIONAL_VIABLE`. Totalize + double-stun exempt: there the second stunner *is* the support. | 238 teams | exactly the support-less CONVENTIONAL set, zero totalize teams, zero Seed teams |

Cumulative: **4,057 of 132,102 scores moved (3.07%)** — 1,056 up, 3,001 down, mean −17.5, range
+140.1 / −117.9.

### Correction: change 2 first removed the undersupply penalty entirely

Caught by TEST 94 going red, and worth recording because the plan did not anticipate it. Dropping
the flat `UNDERSUPPLY_FACTOR` step removed *any* penalty for missing the need, so an **unmet need of
5 paid more than a met need of 4** (140.0 vs 112.0) and an undersupplied Miyabi rose from 25.2 to
42.0. That contradicts the semantics this whole issue rests on — a unit that cannot reach its
ceiling must score less — and it re-opened the "never fabricate a need" hazard.

Fixed with a **ramp**, not the old step:
`damp = UNDERSUPPLY_FACTOR + (1 − UNDERSUPPLY_FACTOR) · coverage`. Continuous at full coverage, so
no cliff returns.

The ramp **cannot** restore TEST 94's original assertion, and that is a fact about the arithmetic
rather than a tuning choice: making a bigger need earn *less* at equal supply requires
`supply x need x (supply/need)`, which collapses to `supply^2` and deletes the appetite term — the
exact collapse issue 5 existed to remove. Any damp reaching 1.0 at full coverage also necessarily
exceeds 0.6 at coverage two-thirds, so the undersupplied case rises above its old value no matter
what. Only the cliff could hold it down.

TEST 94 was therefore **rewritten, not weakened**: it now gives Miyabi a polarity provider
re-elemented onto her own ice/frost gauge, so element cycling is impossible and forced polarity is
the only possible disorder source. Its third slot is **Astra, not Yuzuha** — deliberately, because
`utility.disorders` also gates the `buffs.disorders` affinity channel via `teamHasPolarity`, and the
first draft passed through *that* mechanism instead. It was not mutation-sensitive until the fixture
was isolated. One more instance of the standing lesson that a test which cannot fail proves nothing.

### Also corrected: the structure score is not added to the score

The plan described change 4 as "−35 raw and then −15%". Wrong: L1.5's structure score feeds only the
teamwork multiplier. `Trigger/Cissia/SAnby` went **391.9 → 333.1**, exactly `x 0.85`. The demotion is
a clean −15% on the final score.

### Results

`compositions.js -10 :Miyabi`, before and after. Note this view ranks by each team's PEAK score
across bosses, which is a browsing aid only — peaks on different bosses are not comparable, and
the tests deliberately do not work this way (see the correction below):

```
BEFORE                                  AFTER
 1  Nangong/Miyabi/Yanagi    599.8       1  Miyabi/Remielle/Vivian   590.5
 2  Nangong/Burnice/Miyabi   590.8       2  Burnice/Miyabi/Remielle  585.3
 3  Nangong/Miyabi/Vivian    588.5       3  Nangong/Miyabi/Yuzuha    579.6
 4  Nangong/Miyabi/Yuzuha    582.9       4  Miyabi/Remielle/Yanagi   578.8
 5  Miyabi/Remielle/Yanagi   581.7       5  Miyabi/Vivian/Yuzuha     556.2
 6  Nangong/Grace/Miyabi     555.8       6  Nangong/Miyabi/Astra     550.1
 7  Nangong/Miyabi/Astra     554.2       7  Nangong/Miyabi/Remielle  548.1
 8  Nangong/Miyabi/Remielle  553.2       8  Nangong/Aria/Miyabi      547.1
 9  Nangong/Miyabi/Sunna     550.9       9  Nangong/Miyabi/Sunna     546.6
10  Nangong/Aria/Miyabi      550.5      10  Miyabi/Yanagi/Yuzuha     537.1
```

Every triple-anomaly line has left the top of the table (`Nangong/Miyabi/Vivian` fell 588.5 →
506.8), and `Miyabi/Vivian/*` teams rose into it. TEST 99 is green with 30-130 point margins.

### Correction: the tests were comparing different bosses

TESTs 98-101 originally ranked teams by their **best score across all bosses**. That is invalid:
scores are only comparable within a matchup, because different bosses contribute wildly different
weakness, shill, assist and anti credit. `Miyabi/Vivian/Remielle` peaking at 590.5 on Sacrifice
Bringer was being compared against `Nangong/Miyabi/Yuzuha` peaking at 579.6 on Butcher, which
compares nothing. Every conclusion drawn from those tests was unsafe, **including the attribution
previously recorded in this section.**

All four now evaluate **per boss, in a silo**, against four matchups chosen so the two relevant axes
vary independently:

| boss | shill | ether/ice weakness |
|----|----|----|
| Butcher | anomaly | yes |
| Marionettes | — | yes |
| Girtablullu | anomaly | effectively neutral to the units involved |
| Synthetic Neutral | — | — |

`bestAcrossBosses` is deleted and the rule is documented in `engine-context.md` §6. Rungs that are
disqualified on a given boss are skipped for that boss rather than counted as failures — Astra teams
are DQ'd on Girtablullu, which has `assists: 3` *and* `chainParry: true`, so all three members must
carry `assist:defensive` and Astra's `assist:evasive` cannot qualify. That is correct, not a bug.

The rewrite immediately paid for itself: TEST 100 went from 1 reported violation to 18, including one
the old structure could not see — **`Nangong` has been overtaken by `Vivian`** as Miyabi's partner
when the third slot is Remielle (548.1 vs 583.7 on Butcher). That is the overshoot guard firing.

### Remaining: three red tests, and why

**TEST 98 — attribution, corrected and now per boss.** Against `Miyabi/Vivian/Remielle`:

| boss | NMY raw | MVR raw | NMY teamwork | diagnosis |
|----|----|----|----|----|
| Butcher | **588.9** | 583.7 | 0.984 | NMY already wins on RAW; the loss is entirely issue 3 |
| Marionettes | **565.9** | 560.7 | 0.984 | same |
| Girtablullu | 462.7 | **466.4** | 0.984 | issue 3 **plus** a 3.7 raw deficit |
| Neutral | 493.5 | **498.3** | 0.984 | issue 3 **plus** a 4.8 raw deficit |

So **fixing issue 3 wins Butcher and Marionettes outright** — nothing else is needed there, and
nothing is uncredited: NMY's L4 is 17.2 *higher* than MVR's. The earlier claim in this file that
issue 3 left "~4 points unattributable" was an artifact of the cross-boss comparison and is
withdrawn.

On the two neutral-ish bosses there is a genuine additional raw deficit, and its cause is
**field-time economy**: `Miyabi/Vivian/Remielle` collects `+15` as a sole on-field carry (both Vivian
and Remielle are off-field) where `Nangong/Miyabi/Yuzuha` gets `+0` for two. On Butcher and
Marionettes, Nangong's on-element and stun-on-element L3 credit covers that; on a neutral boss there
is no element credit and the +15 decides it. Open question, not yet acted on: does one-on-field /
two-off-field deserve +15 over two-on-field, or is MVR beating NMY on a truly neutral boss simply
correct?

**Tested and rejected: under-credited stun emergence.** The hypothesis was that Miyabi wants stun
windows unusually badly — high CR/CD, a large ultimate, enhanced-attack damage — and that Nangong is
therefore worth more to her than the engine pays. It does not hold. Nangong already gives her
`stun-emergence 6.7` (burst 2.23 x infra 3) plus `stun-multiplier 4.0`, and NMY leads on raw against
MVR on both weakness bosses, so there is nothing missing there. Sweeping the constant confirms it is
the wrong lever:

| `MULT.STUN_EMERGENCE` | scoring failures | Girtablullu gap | Neutral gap |
|----|----|----|----|
| **1.0** (current) | 3 | −3.7 | −4.8 |
| 1.5 | 4 (breaks TEST 14) | −2.7 | −3.8 |
| 1.9 | 6 | −1.9 | −3.0 |
| 2.5 | 6 | −0.6 | −1.7 |

It never closes the gap even at 2.5x, while breaking TEST 14 at 1.5 and three tests by 1.9. Left at
1.0.

**TEST 100 — two orderings wrong.** `Yanagi > Burnice` flipped, as predicted before the work started:
both reach supply 4, so Yanagi's polarity advantage saturates away and she is left with only
`buffs.disorders: 2` against Burnice's off-field field-time and better tier (1 vs 1.5). Yanagi holds
only alongside Yuzuha, by 1.8. Separately, `Nangong > Vivian` now fails wherever the third slot is
Remielle, and narrowly on the neutral boss with Astra or Nicole — the same root cause as TEST 98.
`Vivian > Yanagi` holds everywhere by 19-28.

**TEST 101 — 15 of 28 rung comparisons out of order** across the four bosses. Committed red by
decision so the disagreement stays visible rather than being tuned away. The recurring ones are
`MVRemielle > NMYuzuha` (all four bosses), `NMAstra > NMSunna`, `MVYuzuha > NMAstra` and
`MVAstra > NMVivian` — the last three are middle-of-ladder entries already flagged as arguable, and
each needs a correctness call rather than a tuning pass.

### TEST 99 covers both of Miyabi's cores

Extended after the per-boss rewrite. The rule — a third anomaly agent is never an upgrade over a
strong support — is asserted on the `Nangong/Miyabi` core **and** the `Miyabi/Vivian` core, and
passes on all four bosses. **Remielle is deliberately excluded from both lists**: she is nominally an
anomaly unit but functions as the support in these teams, so asserting she must lose to Yuzuha would
contradict the owner.

One property worth knowing, because it nearly made half the test vacuous: on the `Miyabi/Vivian`
core **every genuine third anomaly agent is disqualified** by the pre-existing "Triple DPS" L1 rule
(`pureDpsCount >= 3`, where subdps still counts as a full DPS), so only the pseudo-anomaly units
Nangong, Soukaku and Roxy produce a live comparison there. A `comparisons >= 3` guard now fails the
test outright if it ever degrades into asserting nothing — currently 19 live comparisons on the
Nangong core and 12 on the Vivian core, and the guard is mutation-checked.

That DQ rule also **partitions cleanly against change 4**: anything with no support *and* no stunner
was already disqualified, so the no-support demotion only ever reached teams that have a stunner.
431 of 7,339 teams are DQ'd as Triple DPS, 165 of them all-anomaly. Reviewed and left as-is.

### Mutation matrix

Every mechanism is pinned to exactly one test:

| mutation | dies |
|----|----|
| cycling supply re-flattened to a boolean | 93 |
| polarity dropped from the aggregate | 94 |
| L5 audit reverted to the consumer's own reaction | 95 |
| variant awareness removed at `getOwnGaugeElement` | 96 |
| proc sources re-gated on holding an anomaly role | 97 |
| `DISORDER_PARALLEL_MULT` → 1 | 100 (and 98 starts passing) |
| no-support demotion removed | 99 |
| boss-weakness hard cap removed | 102 |
| the two curves unified | 93, 102 |



---

## Resolved — burst throughput was measured by the wrong aggregate

Issue 4 used to read *"*`getMaxBurstWeight` saturates at 3 for every carry." **That claim was
false**, and it was the framing that was wrong rather than the suspicion. Measured across all 60
units the old function returned 3 for 11, 2 for 5, 1 for 24 and 0 for 20. The issue sampled seven
units that happened to sit at 3 and generalised from them.

### What was actually broken

`MAX` picked the biggest ordinal, not the biggest instrument. The annotation scales are not
commensurate — `chain: 3` and `ultimate:strong: 3` are roughly four rungs apart — so Evelyn's
chain attack rated equal to Seed's 6000% ultimate, and a unit with three instruments rated equal
to a unit with one. YSG (`ultimate:strong: 3` **and** `ultimate:double: 3`, the highest burst in
the game) scored identically to Seed's single ultimate and to Norma, a subdps stunner.

Two faults compounded it. **Role was ignored** — a support's unannotated ultimate is a fraction
of a DPS's, but the old code read magnitude alone. And **no field recorded chain frequency**:
ultimates had `ultimate:double`, chains had nothing, so Evelyn's self-provisioned extra chains
were unmodelled.

The clearest wrong output, on Butcher:

```
Lycaon → Ellen   stun-emergence: burst=1 × infra=3 = 3.0
Lycaon → Rina    stun-emergence: burst=2 × infra=3 = 6.0
```

A stunner's window rated **twice as valuable to Rina the support as to Ellen, the actual carry**
— because Rina's `ultimate:strong: 2` was read as throughput while Ellen, annotating nothing, sat
on the floor. Rina's magnitude annotation had no other live effect anywhere in the engine.

### The fix

Burst weight is now *derived*: `roleImpactFactor × Σ(instruments fired in a window)`, over a
shared rung scale. Full vocabulary in `engine-context.md` under "Burst throughput". Key decisions:

* **Role applies twice** — setting unannotated baselines, then scaling throughput into impact.
  It stands in for the base-ATK gap between roles, which is deliberately not modelled as a number.
* `isBurstDPS` widens `DPS_ROLES` to include `subdps`, locally to the burst model. Ultimate
  provision really is limited to one primary carry; throughput is not. Norma is the case.
* **A non-DPS earns burst only if it annotates an instrument** — otherwise every Astra and Lycaon
  collects a small unearned bonus on nearly every team. Same rule as the need channel.
* `damage['chain:extra']` is the chain-frequency axis, mirroring `ultimate:double`. Evelyn
  carries `2`. Deliberately **not** `utility.chains`: provision is scored `supplier !== consumer`,
  so a `utility` entry can never reach its own owner — it would give Sigrid chains and Evelyn
  nothing.
* `getChainMagnitude` + `CHAINS_PROVISION` price a gifted chain by the recipient's chain
  magnitude, returning 0 for a non-DPS. The exact analogue of `getUltimateMagnitude` returning 0
  for `ultimate:weak`.
* **A stunless carry gets no chain component.** YSG never opens a window, so her burst is pure
  ultimate.

Data: `sbilly`'s `damage.chains: 2` was a **typo for** `chain` — the plural is read by nothing in
the burst path, so his chain damage scored as zero and he sat on the generic DPS floor.

### Resulting burst weights (was 3 for all eleven of the top group)

```
yixuan 2.79   ysg 2.69   miyabi 2.23   harumasa 1.98   hugo 1.98   evelyn 1.95
ramiel 1.74   alice/aria/promeia 1.69   seed 1.61   sigrid 1.59   claret 1.49
pyrois 1.36   sbilly 1.07   norma 1.08   generic DPS 1.00   rina 0.75   astra 0.00
```

Pyrois landing just above Ellen is the design intent stated in `engine-context.md`: two weak
ultimates put his throughput "in line with a standard DPS like Ellen." He used to score a flat 3.

Verification: **33,957 of 126,514 scores moved (26.8%), mean −2.14, max +4.1 / −29.3, and every
moved team contained a stun-infrastructure supplier, a recovery-debuffer or a chain provisioner**
— zero exceptions, so nothing leaked into a third channel. Recommendations 43/43 and bucketing
6/6 unchanged.

### Two calibration anchors were retuned, with reasons

`STUN_EMERGENCE` 1.0 and `CHAINS_PROVISION` 0.4. Correcting Sigrid from a flat 3 to 1.59 —
`ultimate:weak` + chain + `enhanced: 3`, which puts her level with Seed at 1.61 — left two
absolute thresholds unreachable. In both cases the behaviour the test exists to pin still passed;
only the magnitude anchor failed. Both were adjusted **by owner decision, on game grounds rather
than to make the suite green**:

| test | was | now | why |
|----|----|----|----|
| **80** Sigrid wind | floor 350 | floor **340** | The assertion's content is that wind is a bonus and never a penalty, which held throughout (windless 344.8 → 372.3 with Roxy). The floor was a proxy calibrated against the inflated burst. |
| **62** Sigrid stunners | `Dialyn > Koleda + 30` | `+ 20` | Koleda's P6 and general damage buff have closed much of the gap on Dialyn, *and* Sigrid cannot exploit Dialyn's ultimate provisioning at all (weak ultimate → magnitude 0). A 30-point tier gap was never warranted for this carry specifically. |

TEST 62's three ordering assertions — Norma 357.0 > Lycaon 330.0 > Dialyn 305.6, and Lighter
308\.6 > Dialyn — passed unchanged throughout, which is what the test's own comment describes as
its content.

`CHAINS_PROVISION` remains capped by TEST 14, not by the model. At 0.4 the Nice/Nicer/Nicest
ladder separates Ellen, Starlight Billy and Evelyn by only \~0.2–0.4 points — thinner than the
ultimates analogue (`ULTIMATES_PROVISION` 7.8) would suggest, since a chain attack is roughly a
third of an ultimate. The binding constraint is TEST 14's `[350, 485]` band on Banyue teams,
which had only **1.1 points of headroom at baseline** (Norma/Banyue/Lucia at 483.9 against a 485
ceiling) — so any new positive term near those teams pushes through it. Raising the dial to 0.8
breaks it. If that band is ever revisited, `CHAINS_PROVISION` is the first thing to re-scale.

Sweep evidence, for anyone tempted to retune instead: across `STUN_EMERGENCE` 0.9–1.9,
`CHAINS_PROVISION` 0.2–2.2 and the burst normaliser 2.1–3.05, TEST 80 moved by under a point and
TEST 62's gap by under two. Neither anchor was reachable by any dial — they were pinning the old
flat rate, not a tuning error.


---

## Design note: stunners and supports already differ

Worth knowing before anyone adds a role-split penalty constant, because the split exists. The
intuition — *a stunner with nothing landing still drives stuns, chain attacks and burst windows;
a support with nothing landing does literally nothing* — is encoded in three places:


1. `hasBuffContributions` includes `|| isStun(unit)`. A bare stunner never falls into the
   "supplies nothing → `log(0.01)`" trap a bare support falls into. Anby, whose `mechanics` is
   `{}`, still scores **83% utilization**.
2. **The** `isStun(supplier) && !isDPS(supplier)` block grants `3 + daze` effective weight purely
   for being a stunner with a DPS beneficiary — baseline stun/chain/burst-window value, before
   any buff is considered.
3. `getScalingBuffs` returns `3` for support/defense and `2` for stun, and
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
* **There was a cliff at** `supply == scaling`, because `UNDERSUPPLY_FACTOR` was a step, not a ramp.

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

**Scope:** `ultimates` only, by decision. The other seven need keys keep the flat `0.6` discount.
There were 18 other undersupplied pairs in the roster when this was measured (17 after Alice's `utility.disorders` was removed — see issue 5) — `chains` (Astra/Norma `2`, Koleda `1` →
Evelyn/Sigrid `3`), `disorders` (Nangong/Yanagi `2`, Vivian `1` → Miyabi `3`), `veils`
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

|    | `ULTIMATES_PROVISION` up | `NEED_KEY_MULT.ultimates` up |
|----|----|----|
| TEST 7 margin | improves | no effect (Evelyn has no need) |
| Yixuan ≈ Seed | drifts, Seed pulls ahead | drifts, Yixuan pulls ahead |
| YSG total / Thrall band | rises, squeezes bucketing TEST 5 | rises, squeezes bucketing TEST 5 |

7\.8 / 3.2 is the point where all three suites pass with YSG's total exactly on its old value.
Seed ends \~1.9 ahead of Yixuan (4%) rather than dead level; that is the price of keeping the
Thrall band clear, and it is the knob to revisit first if the balance ever feels wrong.


---

## Resolved — the 3.2 mechanics remodel

Historical. Twenty units had `mechanics` corrected after a gachabase audit, which broke four
tests (9, 15, 62, 65). The data was right in all four cases; the tests exposed engine faults. All
fixes are in `team-scorer.js`.

**Role gating replaced with** `scaling.buffs` gating (`computeTeamworkMultiplier`). The DPS
"unmet needs + wasted vortex" evaluation used to run only for units with *no* buffs, so any buff —
even an irrelevant weight-1 one — silently switched the whole consumer-side evaluation off. A
dummy `buffs:{cr:1}` on Vivian was worth **+92 points**. Needs are now evaluated for every unit.
Two sub-decisions worth knowing: the anomaly-reaction block keys off the **native** `anomaly` tag
rather than `isAnomaly()`, so Roxy (a stunner enabling wind for Pyrois/Sigrid) isn't charged for
her own reaction going nowhere; and units with `scaling.buffs === 0` still contribute their
neutral `1.0` utilization term, which is load-bearing — removing it cost Lycaon teams \~180 pts.

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

The two TEST 62 margins remain thin at \~3 points on \~315-point scores. Both are constraints on
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
Evelyn than to Ellen". True, and it passed — but Evelyn and Ellen differ by \~90 points for
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

"No consumer scales for veils" is the normal case for \~97% of teams and says nothing about fit.
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
* **Disqualified teams score** `-1` and never reach L4, so they emit no debug lines at all.
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
sharpest check available and is worth rebuilding for any structural change — \~20 lines: enumerate
`buildTeams(...)` against `[...bosses, syntheticNeutral]`, write `boss\tteam\tscore` rows, diff
two runs. Its value is that it supports a *falsifiable prediction*: the ultimate restructure
should have moved only teams containing Dialyn or Ju Fufu, and that is exactly what it moved
(8,723 rows, 6.8%, zero exceptions). "The suites are green" cannot tell you that.