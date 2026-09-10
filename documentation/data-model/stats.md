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
