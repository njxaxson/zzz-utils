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

For players with limited rosters. Hard violations become steep penalties instead of
disqualifications, so teams stay in the ranking and relative quality remains visible.

| Strict | Lenient |
|----|----|
| L1 disqualifications | Large penalties |
| L2 low-tier penalties | Shrunk |
| `synergy.avoid` disqualification | A heavy penalty |

The base score also starts higher in lenient mode.
