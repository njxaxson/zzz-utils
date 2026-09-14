# The `mechanics` Block

`mechanics` describes what is **distinctive** about a unit beyond its role baseline. This page
covers the block's overall grammar; each key has its own page.

## An empty block is complete

Units with nothing distinctive have `mechanics: {}`, and that is a **complete, valid kit**. It
means "no unique mechanics, inherit the role defaults" — never "data still to be written".

Ellen, Nekomata and Soldier 11 are all `mechanics: {}` and are scored entirely off their role
baselines. Do not fill them in to make a ranking move.

## Weights

| Value | Meaning |
|----|----|
| `true` or `1` | Minor |
| `2` | Strong |
| `3` | Defining |

Values above 3 exist where a unit is deliberately off the conventional scale — Remielle's
`atk: 4`.

## The keys

| Key | Meaning | Page |
|----|----|----|
| `stats` | This unit's stat line: `ap`, `am`, ATK, CR, CD… | [stats](stats.md) |
| `pseudoRole` | Secondary roles | [pseudoRole](pseudorole.md) |
| `elementalVariant` | Alternate anomaly-gauge tracking | [elements](../concepts/elements-and-roles.md) |
| `onfield` | Explicit on-field demand override | [pseudoRole](pseudorole.md) |
| `damage` | Distinctive damage types this unit deals | [damage and burst](damage-and-burst.md) |
| `buffs` | What it buffs for teammates | [buffs and debuffs](buffs-and-debuffs.md) |
| `debuffs` | What it debuffs on enemies | [buffs and debuffs](buffs-and-debuffs.md) |
| `utility` | Non-stat contributions | [utility](utility.md) |
| `scaling` | What it benefits *from* | [scaling](scaling.md) |
| `archetypes` | Which carry archetypes this support is built for | [declared archetypes](declared-archetypes.md) |
| `replaces` | Supplier-side: this provision costs the consumer another resource | [scaling](scaling.md) |
| `converts` | Consumer-side: self-conversion of one resource into another | [scaling](scaling.md) |

## Provision keys and damage keys are separate namespaces

**The block a key sits in decides what it means.** Provision keys are plural, damage keys are
singular, and they are related but never interchangeable.

| Declaration | Means | Examples |
|----|----|----|
| `utility.chains: 2` | **Provision** — "I hand this carry extra chain attacks" | Astra, Norma |
| `scaling.chains: 3` | The matching **need** — "I get something beyond the chain's own damage" | Evelyn, Sigrid |
| `damage.chain: 2` | The **damage type** this unit deals | Starlight Billy, Evelyn, Norma, Pyrois |
| `buffs.chains: 1` | A **buff on that damage** — "I multiply the chains you already throw" | Koleda |

### The Koleda case

A buff is not a provision, even when it shares the word. Koleda's `buffs.chains` was read as
provision supply for a while. The effect was that she was paid a fraction of a `chains` need
she cannot satisfy, while the buff itself was never credited at all. A dedicated key list now
keeps the two apart.

The engine already drew the same line elsewhere: `buffs.disorders` is a polarity-damage buff,
`utility.disorders` is forced disorder occurrences.

If you add a mechanic in this shape, put the provision in `utility` and the multiplier in
`buffs` — and expect the singular/plural pair to trip somebody. The `ablooms` / `abloom` pair
has the same hazard.

## Conditional values

Any mechanic value may be a scalar **or** a set of cases. See
[predicates](predicates.md) for the vocabulary and the two scoping rules.

## Code notes

### [CLS-01] `:` is a classifier, and two stems are exempt

`X:Y` names a **subclass** of `X`, the same way `unit.species` uses it. So `anomaly:wind` and
`anomaly:electric` are both anomalies and both feed a plain `anomaly` need, and a buff on the
general class reaches every subclass — Promeia's `buffs.abloom` must still reach Velina's
`damage['abloom:free']`. `classifierBase` is the single place that decides this, and both the
scorer and `pull-engine.js` read it so the two engines cannot drift apart.

**`ultimate` is not a classifier, and getting that wrong would resurrect a defect the burst model
was built to remove.** `ultimate:strong` is magnitude, `ultimate:weak` is magnitude-zero, and
`ultimate:double` is frequency. They are **orthogonal axes**, not subclasses of one "ultimate"
quantity. Aggregating them once fabricated an ultimate need for **26 of 60 units**. See
[damage and burst](damage-and-burst.md#why-the-axes-must-stay-apart).

`NON_CLASSIFIER_STEMS` is the exemption list. Adding to it should be rare and needs the same
argument: the stem names independent axes rather than a family.
