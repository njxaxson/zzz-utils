# `mechanics.stats`

A unit's **stat line** — what it has, as distinct from what it needs (`scaling`) and what it
hands out (`buffs`).

Keys: `atk`, `def`, `hp`, `cr`, `cd`, `pen`, `am`, `ap`. The canonical list is `STAT_KEYS` in
`constants.js`, and the pull engine reads the same list.

## Scale

The house 0–3 convention, **with half steps**, exactly like `tier`. Seven rungs, which is enough
to say that Miyabi's Anomaly Proficiency is low without saying it is absent.

A value **above 3** is legal for a unit deliberately off the conventional scale, the same
licence `mechanics` already grants elsewhere. Remielle's `atk: 4` is the only one today, and it
is not decoration: her buff is 40% of her own ATK and she needs 4,000 ATK to reach its cap,
which is genuinely off the top of the range.

> **Half steps must only ever be used arithmetically.** Several tables in the scorer are
> integer-*indexed* with no fallback — `BURST_ULTIMATE`, `CHAIN_MAGNITUDE` and friends. A 2.5
> handed to one of those returns `undefined` and then propagates `NaN`. Never key a table by a
> stat value.

## Defaults come from the CLASS, not the role

These are different things and the difference decides what inherits what.

| | what it is | examples | carries stat defaults? |
|----|----|----|----|
| **Class** | the one thing a unit *is*; read from tags, never changes | attack, anomaly, rupture, armorer, stun, support, defense | **Yes** |
| **Role** | what a unit is *doing on this team*; a superset of classes | all of the above, plus `subdps`, plus pseudo-roles | **No** |

A stat line is a property of the unit, not of the team it is on. Being played as a sub-DPS
changes how much damage you deal — which is why `BASIC_DAMAGE_BY_ROLE` **does** have a `subdps`
entry — but it does not change your ATK stat, so `STAT_BASELINE_BY_CLASS` deliberately does not.
A load-time assertion rejects any non-class key in the table, because "add the missing `subdps`
row" looks like an obvious tidy-up and is wrong.

### Always the NATIVE class, never a pseudo-role

Baselines read the unit's own class tag directly. They do **not** read `getEffectiveRoles`, so a
pseudo-role never restats a unit: Soukaku beside Miyabi is playing an anomaly agent, and her stat
line is still a support's.

The corollary is worth protecting. `getStatBaseline` takes no team and cannot vary by one,
unlike almost everything else in the scorer. A base stat is fixed; the team-dependent part lives
downstream, where a unit's *effective* Anomaly Proficiency rises with the Mastery its team
supplies while its base `ap` does not move.

A pseudo-role unit is genuinely somewhere between its two classes and rarely matches either, so
the right answer is for it to **declare the overrides that matter** rather than to inherit an
average of the two. Nangong and Soukaku both do.

A unit that declares nothing takes its class row, the way `mechanics: {}` is already a complete
kit.

## Every anomaly agent declares `am` and `ap`

Twelve native anomaly agents, plus the two pseudo-anomaly units Nangong and Soukaku. Not for
style: those two hold *effective* anomaly roles, so they already collect reaction credit, and
leaving their proficiency to a default would have them behaving like full anomaly agents in the
channels that read it.

## This is not `damage.basic`, and the two must not be collapsed

They look like the same question and are not.

Nearly every S-rank support's buff is **computed from one of their own stats**, so their stat
line is the engine of what they hand out — not a claim about how hard they hit.

For most of them that stat is ATK, which is why a support's ATK sits close to a carry's:

| unit | buff | needs |
|----|----|----|
| Remielle | +1600 ATK | 4,000 ATK (40% of her own) |
| Astra | +1200 ATK | 3,543 ATK |
| Yuzuha | +1200 ATK | 3,000 ATK |
| Sunna | +1050 ATK | 3,500 ATK |
| Soukaku | +1000 ATK | 20% of base, capped at 500, then doubled |
| Pan Yinhu | +540 sheer | 18% of base ATK |

So `stats.atk` on one of those is the **engine of their buff**. `damage.basic` is the separate,
very low modifier that turns that ATK into damage they personally deal. They read `atk: 3` in one
and `basic: 0` in the other, and both are correct.

### Two supports run on HP instead, and must override ATK down

| unit | buff | needs |
|----|----|----|
| Lucia | max sheer buff | 24,000 **HP** |
| Zhao | +1000 ATK | 27,000 **HP** |

Both declare `scaling.hp` already, and both would otherwise inherit their class's high ATK
baseline and read as ATK-driven supports. They carry an explicit `atk: 1, hp: 3` instead.

Lucia's own damage is aftershock, also HP-scaled, though it is small enough not to matter here.

**If a future support's buff runs off a third stat, it needs the same override.** Inheriting the
class row silently attributes their buff to the wrong stat, and nothing will fail to warn you.

The engine assumes a player has maxed these out, so a unit's declared buff weight already
encodes the capped value. Rina is the exception that proves the rule: her buff scales off Pen
Ratio, which only equipment supplies and which maxes easily.

### Two zeroes in the table are real, not gaps

`armorer.atk` and `rupture.pen` are **literally zero**, and the game says so on the character
sheet: an armorer's page shows Laceration where ATK would be, and a rupture agent's shows Sheer
damage where PEN would be. Armorer damage scales off DEF, so ATK gives them nothing at all.

Do not "fix" either to a small non-zero value on the grounds that every unit surely has some.

## The two anomaly stats

* **`am`** — Anomaly Mastery. Raises the buildup *rate*: how fast you reach a proc. Buildup
  itself is **derived**, not stored, the way `dmg` is derived from ATK.
* **`ap`** — Anomaly Proficiency. Determines how much *damage* a proc does.

Miyabi is the case that forced the distinction. Her buildup runs off crit rate and her proc
damage off ATK and crit damage, so her AP is genuinely low for an anomaly agent — which is why
she meshes badly with vortex and with Remielle, both of which scale on AP alone.

**Declare the base, not the outcome.** Promeia ends up with high effective AP, but her *base* AP
is ordinary — the lift comes from her `scaling.am: 3` converting Mastery into Proficiency. So she
reads `ap: 2` here, and the conversion supplies the rest. Alice and Vivian are the same shape.
Writing the finished number into the base would double-count the conversion and would stop her
AP responding to what the team actually supplies.

Two entries are worth reading as statements rather than numbers:

* **Remielle's `am: 0`.** Lumen fills no anomaly gauge at all, so she has no Mastery to speak of
  — she is an anomaly agent who procs nothing. Her `ap: 3` still matters, because Luminize
  multiplies her rebound by her own Proficiency. Zero here is a fact, not a placeholder.
* **Yanagi's `am: 1.5`, below the anomaly baseline.** Her procs come from polarity in her kit
  rather than from filling a gauge quickly, so a low buildup rate costs her much less than it
  would cost a gauge-driven agent. Piper is the mirror at `am: 3` — spin-to-win applies physical
  anomalies fast, and that is the whole of what she does.

Her high declared `am` is a deliberate fiction and is harmless: nothing in the game buffs Mastery
directly — supports buff *buildup* — so Mastery's only job here is to drive the derived buildup
number.

## Related

* [buffs and debuffs](buffs-and-debuffs.md) — the five senses of "anomaly".
* [scaling](scaling.md) — the need side, and why `scaling.am` is not `stats.am`.
* [anomaly reactions](../concepts/anomaly-reactions.md) — where AP is consumed.

## Code notes

### [AP-01] Effective Anomaly Proficiency is a property of the unit, not the team

`computeEffectiveAP` = base `ap` plus whatever the unit's **own** `scaling.am` converts from its
**own** `stats.am`. No teammate appears in it.

It used to build the conversion pool by summing the team's `buffs.buildup`, and that was wrong on
its own terms. **Nobody in the game hands anybody Anomaly Mastery.** It is a base stat set by how
a player builds the unit. Supports buff *buildup* — the rate at which procs accrue, derived from
Mastery but a separate thing — which is exactly why `buffs.buildup` and `stats.am` are different
keys.

The visible symptom was that Promeia, Alice and Vivian read a high Proficiency beside Remielle
and Velina and a low one without them, for a reason that does not exist. Their Proficiency is now
a property of how they are built.

Aria is the case that keeps the two jobs of Mastery apart: `am: 3` with no `scaling.am`, so she
converts **nothing** and reads her base `ap` of 3. Her Mastery is not wasted — it is what makes
her proc faster, which is `procRate` and `[AP-04]`. Miyabi is the same shape.

### [AP-02] Disorder damage reads proc damage; the disorder NEED does not

A disorder's damage comes off the combined damage of the two procs that made it, so the flat
"a disorder happened" bonus scales by `procDamageFactor`. Miyabi's procs run on crit rather than
Proficiency, which is why she is simultaneously the best disorder carry in the game and a poor
vortex partner — the same fact reaching opposite conclusions.

That bonus used to skip anyone declaring a `disorders` need, on the grounds they were paid
through the need channel instead. Fair while both channels were flat; wrong once they answered
different questions. The result was that the agent with the hardest-hitting procs in the game
earned nothing for them.

**The need channel is deliberately NOT scaled by proc damage.** It prices the consumer's
*conversion* — Miyabi turning disorders into enhanced attacks — which is driven by how many
disorders arrive, not how hard they hit. Scaling it broke two things at once: a non-anomaly
consumer with `ap: 0` had its whole payout zeroed (mechanics TEST 17), and amplifying supply
differences inverted the Yanagi/Burnice rung. Do not "fix" the asymmetry; it is the point.

### [AP-03] Luminize and Refringe scale on Proficiency, never on raw proc damage

Everything Remielle does reads Proficiency. Refringe boosts **every** anomaly proc, including
Miyabi's unusual crit-driven ones — but the *size* of the increase is based on the proc's AP, not
on the proc's whole damage. So Refringe does raise Miyabi's procs, just far less than anyone
else's. It is not a question of **if** but of **how much**.

Weighting these channels by proc damage instead made crit-driven Miyabi Remielle's **best**
partner, which is the exact inversion of the truth. The current reading blends presence with
`apFactor`: a proc being boosted at all is worth something regardless of the stat line, and its
damage on top is AP-scaled. Straight multiplication was too sharp and cost
`Miyabi/Remielle/Vivian` its owner-stated number-two slot.

### [AP-04] Mastery is geometric, buildup buffs saturate, and the curve is anchored at 2

Two different things drive how fast procs land, and they have different shapes.

**Mastery** is the unit's own stat, bounded at 3, so it does not need a saturating curve — it
needs the right step size. Owner: an agent with high Mastery lands roughly **20% more procs**.
`MASTERY_STEP ** (am - 2)` gives exactly that: `am 1.5 → 0.91`, `2 → 1.00`, `2.5 → 1.10`,
`3 → 1.20`.

The exponential shape used before could not express it. Forcing a 20% gap between adjacent
Mastery steps out of `1 + H(1 - exp(-x/S))` needs a headroom of 3.6 to 8, putting the ceiling at
2.1 to 5.1 — far past where frost would clear `VORTEX_PRIMARY_MIN` and silently delete the
wasted-vortex charge.

**Team buildup buffs** are the part that stacks without limit, so they keep the saturating curve:
non-polarity procs are cooldown-gated, so buildup buys the first proc *sooner* rather than an
unbounded stream, and a second buildup buff is worth less than the first.

**Anchored on a stock anomaly agent, not on zero.** Dividing by the class's own `am` baseline puts
the roster in roughly 0.84–1.13 instead of 1.0–1.35. A baseline agent reads exactly 1.0 and a
low-Mastery agent reads below it, which is the honest statement and is symmetric with `apFactor`
already letting Miyabi read 0.50.

**Lumen is off this curve entirely.** Remielle's `am: 0` is not a low value on a scale — it is the
statement that she fills no gauge and procs nothing. A rate below 1.0 would imply she procs
slowly, when she does not proc. `computeProcInput` returns null for her. See `[LUM-01]`.
