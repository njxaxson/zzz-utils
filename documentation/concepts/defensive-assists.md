# Defensive Assists

Some bosses demand a minimum number of units that can defensive-assist. Falling short
disqualifies the team, so this is a legality filter rather than a scoring input.

## The rule

Every unit carries either `assist:defensive` or `assist:evasive`.

A boss can specify a minimum count of defensive-assist units via `mechanics.assists`. Any
team below that threshold is disqualified.

## Units that remove themselves from the rotation

`utility.rotations: "limited"` — Astra and Remielle — means the unit takes itself out of the
assist rotation. That **reduces the boss's effective requirement by one**, because the unit
is not there to fail the assist.

## The Girtablullu exception

A boss can set `chainParry: true`, which cancels the reduction above. Girtablullu's mechanic
needs two genuinely off-field defensive assists happening at once, so a unit sitting out of
the rotation does not help.

See the [boss object](../data-model/boss-object.md) for where these fields live.
