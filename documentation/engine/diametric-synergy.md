# Diametric Synergy

When two *different* suppliers contribute through complementary dimensions, the in-game effect
is multiplicative — the buff and the debuff stack into each other rather than adding.

## The two recognised pairs

| Pair | Example |
|----|----|
| An ATK or CD buff from one supplier + a defense debuff from another | Astra's ATK with Nicole's shred |
| A same-element buff + a same-element debuff | Soukaku's `buffs.ice` with Lycaon's `debuffs.ice` |

Both halves must come from **different** suppliers. One unit carrying both does not qualify.

## The cohesion floor

A sufficiently strong pair establishes a **cohesion floor** the team cannot drop below, scaling
with the weights of both halves. A team built around a real multiplicative interaction is never
judged incohesive.

## The armorer exception, on the first pair only

ATK is worth zero to an [armorer](../concepts/armorer-laceration-gash-maim.md) and CD usually zero, so pairing off them would grant a cohesion floor for buffs the consumer cannot use.

For an armorer consumer, the buff half of that pair becomes PEN, CR or Laceration instead.

The element pair is unchanged — elemental damage is a full-value armorer lever. In practice
that pair is currently unreachable for an armorer; see
[deliberately unmodeled](deliberately-unmodeled.md).

## Suppression on anti-rupture bosses

Defense-debuff diametrics are suppressed on anti-rupture bosses, where the debuff cannot be
fully exploited.