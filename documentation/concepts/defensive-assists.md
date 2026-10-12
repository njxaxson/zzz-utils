# Defensive Assists

Some bosses demand a minimum number of units that can defensive-assist. Falling short
disqualifies the team, so this is a legality filter rather than a scoring input.

## The rule

Every unit carries either `assist:defensive` or `assist:evasive`.

A boss can specify a minimum count of defensive-assist units via `mechanics.assists`. Any
team below that threshold is disqualified.

## Units that remove themselves from the rotation

`utility.rotations: "limited"` — Astra and Remielle — means the unit takes **itself** out of the
assist rotation. That **reduces the boss's effective requirement by one**, because the unit
is not there to fail the assist.

The mechanic primarily exists to let an **evasive**-assist unit like Astra still play against a defensive-assist-demanding boss. Astra on Typhon (3 required) sits out, leaving two other agents who must both be defensive, so the requirement becomes 2.  For example, Koleda/Evelyn/Astra minus Astra applying three defensive assists in a row could be Koleda->Evelyn->Koleda, skipping Astra because she is removed from the rotations. This lets you hit three consecutive defensive assists in a row. 

Given this context, it should be clear that in practice, limited rotations only has a meaningful difference when the limited unit has evasive assist and the other two units have defensive assists.  For example, Remielle is defensive assist with a limited rotation as well, and so using Grace/Velina/Remielle would NOT work for Typhon, because Remielle removes herself and any three-assist chain from the remaining two (Velina->Grace->Velina or Grace->Velina->Grace) would still have an evasive assist. 

The engine does not model currently correctly model this case. `getEffectiveAssists` subtracts one per limited unit, and the defensive count still includes the limited unit itself. So the shortcut is only correct for evasive units. At some point this should be revisited. 

## The Chain Parry Exception

A boss can set `chainParry: true`, which cancels the reduction above. For example, Girtablullu's mechanic
needs two genuinely off-field defensive assists happening at once, so a unit sitting out of
the rotation does not help reduce the need for three defensive assists.

See the [boss object](../data-model/boss-object.md) for where these fields live.
