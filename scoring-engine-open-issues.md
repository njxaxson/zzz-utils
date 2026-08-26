# Scoring engine — open issues

Live register of what is actually open in the scorer. All suites are green (`92/92` scoring, `43/43` recommendations, `6/6` bucketing) — everything
below is a *modelling* problem, not a failing test. **Issue 5 is the one to read first if you are
touching disorders**; it records three confident diagnoses that were all wrong. Historical post-mortems are demoted to the end.

Last reviewed 2026-08-26.

| # | Issue | Status | Size |
|----|----|----|----|
| 1 | Ultimate credit is derived from the wrong axes | **Resolved** — see the post-mortem below | Done |
| 2 | Undersupply gating prices partial coverage flat | **Resolved** — see the post-mortem below | Done |
| 3 | Partial relevance is never priced | **Open, parked** by owner | Large; broad retune |
| 4 | Burst throughput measured by the wrong aggregate | **Resolved** — see the post-mortem below | Done |
| 5 | Disorder model misses solo polarity generation | **Open** — unblocked; the "Alice exception" was a game-mechanics error, now retired | Small; latent — never fires on the current roster |
| 6 | `isLumenUnit()` is false during morph scoring, so every *natively lumen* rule inverts | **Resolved** — see the post-mortem below | Done |


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

## 5. The disorder model only sees element cycling, not solo polarity generation

**Open.** Found while scoping Alice, and it invalidated three confident-sounding diagnoses before
it was understood. Read this before touching anything disorder-related.

**Disorders arise two independent ways.** Element cycling — two anomaly agents of different
non-wind elements, e.g. Nangong's ether over Miyabi's frost. *And* solo polarity generation:
**Yanagi and Nangong each generate polarity disorders entirely on their own**, with no second
anomaly agent required.

`computeAnomalyReactions` (\~line 665) models **only the first**. `reaction.hasDisorder` is derived
purely from element pairings between anomaly agents and never reads `utility.disorders` or
`damage.polarity`. The engine compensates in exactly one place:

```js
teamHasDisorderGenerationFromReactions = teamHasAnyDisorder(reactions) || teamHasPolarity(team)
```

That `|| teamHasPolarity` is what makes **Trigger / Yanagi / Yuzuha** score correctly — Yanagi
generates disorders alone, so Yuzuha's `buffs.disorders: 3` is properly credited as utilised.

**But the needs side has no such compensation.** The L5 needs-met audit tests
`unitReaction?.hasDisorder` alone, so a `scaling.disorders` consumer on a team whose disorders come
from solo polarity generation would be marked unmet. **The suites pass today by happy accident,
not by correct modelling:** the only units that scale on disorders are Miyabi and Alice, both
anomaly agents, and **neither generates polarity** — Miyabi is frost-cycling only, and Alice's
polarity is assaults, not disorders (see below). The only two solo-polarity units are Nangong
(ether) and Yanagi (electric), both anomaly agents themselves, and neither shares a base element
with Miyabi or Alice. So every pairing that would exercise the gap also satisfies element cycling,
and it never fires. This is structural luck about the current roster, not a rule — a future
non-anomaly or same-element `scaling.disorders` consumer would expose it immediately.

Fix direction: the needs side should consult the same `teamHasDisorderGenerationFromReactions`
gate the buff side already uses. With the Alice exception retired (below) there is no longer a
known counter-case blocking that, but the wrong diagnoses recorded next are the reason to
measure rather than assume.

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

### Also noted: `implicitSupply` makes `scaling.disorders` 2 and 3 identical

The implicit block hardcodes `implicitSupply = 2` and gates on `min(1, 2 / scaling)`, so
`scaling.disorders` of **2 and 3 pay identically** from that channel — Miyabi's `3` buys nothing
over a `2` there. Real, and separate from everything above.  NOTE FROM HUMAN: This is a real issue but doesn’t seem to be recorded as one, please fix documentation!


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