# Element Resistance and Role

A boss that resists your carry's element ends the run. A boss that resists your support's
element barely matters. This page is about where the line sits, and it is narrower than you
would guess.

## The rules

**Pure support and defense units are not disqualified** by element resistance. They contribute
buffs and utility, not damage. Defense units keep a small on-element bonus, since they do deal
a little damage; support units get nothing either way.

**Any support or defense unit with meaningful `damage` still takes a damage-proportional
penalty** when resisted.

**Standard sub-DPS units are disqualified when resisted**, like any carry. Only pseudo-supports
bypass it.

## The narrow check

The disqualification reads a dedicated `isDamageDealer` test — a primary carry role *or* a
sub-DPS pseudo-role — and that test is used by the resistance disqualification and nothing else.

It matters that the general DPS-role list does **not** absorb `subdps`: ultimate provision is
limited to one primary carry, and widening that list would break it. See
[the two-channel model](ultimates-two-channel.md).

### The Norma case

Norma is tagged `stun` with an active `subdps` pseudo-role. Before the narrow check existed she
survived a fire-resistant boss on nothing but the flat stunner penalty, and kept appearing in
Yixuan's rankings on Miasmic Fiend.

A **pure** stunner keeps that flat penalty and stays viable — her job is the window, and a
resisted element does not take that away.

So on a fire-resistant boss:

| Unit | Outcome | Why |
|----|----|----|
| Norma | Disqualified | Stun tag, but an active sub-DPS pseudo-role |
| Koleda, Ju Fufu | Merely penalised | Pure stunners |
| Orphie | Untouched | Fire, sub-DPS pseudo-role, but playing support |

## Lenient mode

For players with limited rosters. Violations that would remove a team from the ranking become
costs where the engine can price them, so teams stay in the ranking and relative quality remains
visible.

| Strict | Lenient |
|----|----|
| Stun-shill boss, no stunner and no stunless carry: disqualified | Kept, at a flat -8 [LEN-01] |
| Fewer reliable defensive assists than the boss requires: disqualified | One short is allowed: 2 of 3, 1 of 2, 0 of 1 [LEN-02] |
| A DPS the boss resists, or is anti-typed against: disqualified | Kept, at -40 per such DPS [LEN-03] |
| `synergy.avoid` (unit) disqualification | A heavy penalty |
| L2 low-tier penalties | Shrunk |
| Off-element DPS penalty | Halved |
| **L1 disqualifications** (illegal join with no valid pair, no DPS, triple DPS, two or more assists short) | **Still disqualified** |

The base score also starts higher in lenient mode (250 against 175), so a lenient score is not
comparable with a strict one.

The Deadly Assault page also uses lenient scoring for a **pinned** team that strict scoring cannot
place, so a player's own plan is answered rather than refused. A pinned team lenient mode still
cannot score is shown as Abysmal; see [bucketing/deadly-assault](../bucketing/deadly-assault.md#custom-plans-pins).

## Code notes

### [LEN-01] Why lenient mode keeps a stunnerless team on a stun-shill boss

A stun-shill boss only takes real damage inside stun windows, so strict mode treats a stunner (or
a stunless carry) as a hard requirement. That is the right call for ranking a roster, and
test-bucketing TEST 5 pins it.

Lenient mode exists to keep teams in play, and this requirement is not a verdict on whether the
team can clear. `Yixuan / Pan Yinhu / Lucia` has no stunner and clears Thrall in the real game: a
tier-0 rupture carry with a double-rupture support does not need a window. Lenient therefore keeps
the team and charges a flat `LENIENT_MISSING_SHILL_PENALTY` of -8, on top of the credit it
forgoes. The owner set -8 after the figure was measured: -30 and -60 each moved that team down a
band, and with no penalty it scored Great, beneath the same carry given a stunner.

### [LEN-02] Why lenient mode allows one missing defensive assist

Assists are a count the boss demands, and a roster one short of it is usually still playable: the
player parries or dodges the gap by hand. Lenient mode therefore lowers the bar by exactly one
(`max(0, required - 1)`), so a boss declaring 3 accepts a team with 2, a boss declaring 2 accepts
1, and a boss declaring 1 accepts none. Two short is still disqualified. No score penalty is
applied. Strict mode is unchanged. Pinned by test-mechanics TEST 37.

### [LEN-03] Why lenient mode prices a resisted or anti-typed DPS instead of disqualifying it

Strict mode drops a team whose DPS is anti-typed for the boss (an anomaly DPS on Wandering Hunter)
or whose element the boss resists (Ye Shunguong against a physical-resistant boss). That is the
right default for ranking a roster, but neither is a guaranteed fail in the real game: Miyabi
clears Hunter on weakness and her damage ceiling, Yanagi and Rina clear it by stacking up to 75%
penetration past Hunter's defense (as rupture teams do), and Ye Shunguong clears physical-resistant
bosses outright.

Lenient mode therefore charges `LENIENT_BLOCKED_DPS_PENALTY` (-40) per offending DPS and keeps the
team. The penalty is applied before the teamwork multiplier, as every L1 term is, and counts a
DPS once per rule it breaks, so a unit both anti-typed and resisted pays twice. Strict mode is
unchanged. Pinned by test-mechanics TEST 38.

### [LEN-04] Why a lenient result is never labelled better than OK

Lenient scoring keeps a team in play by relaxing a rule (a resisted carry, a missing stunner, an
assist short), so its number says "the least bad available", not "recommended". Left alone, a
lenient score can still land in Great or Excellent because the base score starts higher (250
against 175) and the penalties are modest: a Miyabi team on Wandering Hunter could read
Excellent. `getStrengthRating` therefore takes `lenient` and holds the label at **OK**: a score
already at or below OK keeps its label, and Abysmal (unscorable) still outranks the cap. Every
page that shows a strength label passes the flag (Deadly Assault, Agent Teams, Team
Recommendations); the label keeps its `*`. The number itself is untouched, so sorting and
allocation are unaffected. Pinned by test-mechanics TEST 39.
