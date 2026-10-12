# Coverage and Gap Detection

Before the [pull engine](pull-engine.md) can say what you are missing, it has to say what you
have.

## Coverage

Owned units are bucketed by carry archetype, sub-DPS, support, stunner, and element.

Each bucket's quality is derived from its **best tier**, labelled descending:

> Elite → Strong → Decent → Borderline → Weak → Marginal → None

A composite score averages the archetype, support and stunner qualities. That composite drives a
**calibration factor** which compresses gap scores for a well-developed roster — so a player who
owns everything is not told they have five urgent gaps.

The **roster rating** uses a team-aware version of the same average: support and stunner are
judged per team type, counting only units that can legally join it, and a roster with premium
stun and support for only one team type is labelled narrow. See [GAP-04](#gap-04-the-rating-judges-team-types-not-single-best-units).

### Only primary carries count

Sub-DPS units are filtered out of archetype and element quality. Owning Vivian does not mean you
have an ether anomaly carry.

## Gap detectors

Each detector emits a gap with a title, a reason, a score and a candidate list drawn from
unowned limited S-ranks.

| Detector | Looks for |
|----|----|
| DPS by archetype | A missing or weak carry in one of the four archetypes |
| Support | A missing or weak support |
| Stunner (premium and depth) | Both quality and quantity — and a limited stunner who can't join some team type you play ([PULL-07](pull-engine.md#pull-07-who-can-play-together-is-decided-by-legal-teams)) |
| Stunner element | A stunner of an element the roster lacks |
| Sub-DPS | An anomaly carry with no reaction partner ([GAP-02](#gap-02-a-reaction-partner-must-be-able-to-react)) |
| Anomaly partner | A partner to complete [reactions](../concepts/anomaly-reactions.md) |
| Element coverage | An element with no carry |
| Named synergies | `synergy.units` relationships the roster can nearly complete |
| Mechanical synergies | Fit found through [`mechanicsFitScore`](mechanics-fit-score.md) |
| Depth | Fires for **titled T0 carries regardless of archetype quality** |
| Banner T0 | A T0 on the current or upcoming banners ([PULL-06](cards-and-priority.md#pull-06-the-banner-t0-floor)) |
| Ladder team | The team a laddered codependent completes ([partner ladder](partner-ladder.md)) |

Depth deserves the emphasis. It recognises paradigm-shift carries that create entirely new
archetypes — a unit that is worth pulling even though you already have a good carry in its
archetype, because it changes what teams are possible. It is for carries only
([GAP-03](#gap-03-depth-is-for-carries)).

## Its own disorder-partner check

The pull engine keeps a separate disorder-partner check for gap gating rather than sharing the
scorer's. It must stay
[variant-aware](../concepts/anomaly-reactions.md) for the same reason the scorer is, or it will
gate a unit out for lacking a partner the scorer is happily scoring.

## Sub-DPS buckets

`analyze()` buckets sub-DPS per carry archetype — anomaly, attack, rupture, armorer
([GAP-05](#gap-05-a-sub-dps-backs-the-archetypes-it-joins)). Only the anomaly and attack buckets
have a gap detector; a rupture or armorer sub-DPS gap is not built.

## Code notes

### [GAP-01] An element with only a sub-DPS is not an element with nothing

Element quality counts primary carries only, so a roster holding Velina — a T0 wind anomaly
sub-DPS — reports wind quality 0, the same number a roster with no wind unit at all reports.
The gap itself is real (there is no wind carry to lead a team) but the reason line said "You
have no DPS options for Wind content", which the player can see is false.

The element detector now distinguishes the two zeroes the same way `detectDPSGaps` already did
for archetypes, and says "You have Wind sub-DPS agents but no primary Wind DPS to lead your
teams". The score is unchanged: the missing carry is the same size of gap either way.

The roster assessment summary still folds this into "lacks Wind element coverage". That is a
statement about carries and is left as is.

### [GAP-02] A reaction partner must be able to react

`isReactionPartner` is any anomaly agent that can trigger a reaction with a teammate of another
element: a disorder, or a vortex when wind. **Role does not matter** — Jane Doe and Yanagi are both
on-field carries and disorder together fine. Lumen has no anomaly gauge, so Remielle never is one.

Two gaps ask two different questions, and only one of them is about role:

* **Reaction partner** — can your anomaly carries react at all? Any agent of another element
  counts, carries included; a lone carry is never her own partner.
* **Sub-DPS** — is there an off-field partner? Two carries reacting is workable but not peak
  optimal, so this gap still fires for Jane Doe + Yanagi, worded as the upgrade it is.

The sub-DPS gap used to measure the best anomaly sub-DPS of any kind, so an owned Remielle (T0)
held it shut for every anomaly roster that owned her. The partner check used to count only
sub-DPS and pseudo-anomaly units, so two reacting carries were told they had "no anomaly
partner".

The partner gap's wording names vortex alongside disorder, because Velina never makes a
disorder. Vortex teams are not yet a team shape this engine can recommend toward.

### [GAP-05] A sub-DPS backs the archetypes it joins

Sub-DPS were bucketed by tag, so Roxy and Norma — stunners with an unconditional `subdps`
pseudoRole and no `anomaly` or `attack` tag — landed in no bucket, and an attack roster owning
either still read "no attack sub-DPS". `subdpsArchetypes` uses a unit's archetype tags when it has
any, and otherwise the archetypes in its `join`: Roxy backs attack, armorer and rupture; Norma
attack and rupture. Neither joins anomaly, so neither enters the reaction-partner check. Unowned,
both are now candidates for the attack sub-DPS gap.

### [GAP-06] A filled slot is still a gap when the candidate is far ahead

Both anomaly detectors asked whether the slot was filled to quality 40, so Grace (T1.5, quality
40) held the sub-DPS slot shut although she is only good at P6 beside Velina. Each now also fires,
at a lower score (25), when the best unowned candidate is `UPGRADE_TIERS` = 1.5 tiers ahead of the
best owned sub-DPS (or best covering partner). Grace T1.5 against Velina T0 meets it; Burnice or
Jane Doe at T1 do not. **1.5 is fitted, not derived.**

Two consequences are intended. Yanagi beside Miyabi, also T1.5, now gets the upgrade gap too
(TEST 2 expects it at score 25). And on Aria, Jane Doe, Yanagi and Grace the partner gap stays
shut, because Aria T0.5 covers it; only the sub-DPS gap opens.

### [GAP-03] Depth is for carries

The Depth gap's titled-T0 bypass let any titled T0 of the archetype through, sub-DPS included, so
Remielle appeared as "a titled anomaly unit would unlock entirely new team compositions". She is
a sub-DPS and pseudo-support; she adds no carry depth. Candidates are now carries only, and
Remielle's verdict comes from the [partner ladder](partner-ladder.md).

### [GAP-04] The rating judges team types, not single best units

`buildTeamCoverage` finds, for each team type with a carry, the best stunner and support that can
[legally join it](pull-engine.md#pull-07-who-can-play-together-is-decided-by-legal-teams). These
are tier lookups, not scored teams.

The rating used to average the roster's single best support and single best stunner as if they
could join everyone. On an anomaly roster with Yuzuha and Nangong — both anomaly-only — both read
Elite, and a roster with nothing for anomaly-hostile bosses rated Well-Rounded. Now:

* the support and stunner terms are averaged over the team types you have a carry for;
* **narrow** — premium stun *and* support (T0.5 or better) for exactly one team type you play
  (carry quality 40+) — caps the rating at Partial Coverage and adds a sentence naming the best
  stunner and support available elsewhere;
* three or more High gaps cap it at Solid Foundation.

The composite and the calibration factor are untouched, so gap scores did not move. A first
version averaged each team type's carry, stunner and support instead; it dropped every sparse
roster a tier, narrow or not, and was rejected for that.
