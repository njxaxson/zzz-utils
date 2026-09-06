# Additional Abilities (`join`)

Every unit has an Additional Ability that only switches on when the team contains a
particular kind of teammate. The engine treats this as a hard legality rule, not a bonus.

## How it works

Each unit's `join` array lists tags that at least one teammate must carry. If no teammate
carries any of them, the Additional Ability is off.

`join` is a **hard prerequisite**. Illegal teams are never formed in the first place, and are
disqualified if one is handed to the scorer directly.

* `isValidTeam` requires **every** member's `join` to be satisfied.
* The scorer relaxes this slightly for trios: a team is accepted where any *pair* mutually
  joins, treating the odd one out as a flex slot.

## Flex Units

Some units can be classified as a “flex” unit. This means that the user has decided that 

the benefits of a unit are sufficient even if their additional ability isn’t activated. 

Flex units can tack on to a fully legal two-person team (where A joins on B *and* B joins on A) 

to form a three-person team. 

The default flex unit is Nicole, whose value as a defense shredder is considerably more

significant than her token additional ability. For example, Trigger/Harumasa are a fully 

legal duo (Trigger joins on electric Harumasa, Harumasa joins on stun Trigger), and so 

Nicole (designated by the user as a flex unit, enabled by default) can form the third teammate

in Trigger/Harumasa/Nicole, where the combined defense shred between Trigger and Nicole

is inherently very strong. 

## The `faction` token

The literal token `faction` inside a `join` array expands to the unit's own `faction` value.
So a unit with `join: ["faction"]` needs a teammate from its own faction.

## P-level unlocks

Some units gain extra `join` entries at higher Potential levels — Lycaon at P1 and above, for
example. Because the engine assumes a fixed investment level (see
[investment assumptions](investment-assumptions.md)), those expanded lists are baked into the
data rather than evaluated conditionally.

The legality code itself lives in `app/public/lib/common/team-builder.js`.