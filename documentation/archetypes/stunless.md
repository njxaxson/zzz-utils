# Stunless

**Shape:** carry + **double support**, with no stunner at all. Ye Shunguong is the current
example.

## Why the stunner slot disappears

YSG receives her stun damage multiplier whether or not the enemy is actually stunned. So
inflicting a stun gains her nothing — the window is already permanently open as far as her
damage is concerned.

*Raising* the multiplier still helps her, and it helps her constantly rather than only during
a window, which is the opposite of how it works for everyone else.

## Dialyn is the exception worth bringing

Dialyn's free ultimates feed YSG's double-ultimate, the highest burst in the game. She is
worth a slot despite the stun being irrelevant.

## The stun-shill boss interaction

Some bosses set a `shill` for stun, a hard requirement that normally forces a stunner into
the team. A stunless carry clears it anyway, because the boss's damage gate **is** the stun
window and YSG does not need one.

Clearing that requirement without a stunner is worth substantially more than clearing it
with one:

| Team on a stun-shill boss | What it gets |
|----|----|
| Carry + stunner + support | Clears the gate; the stunner occupies a slot |
| Stunless carry + two supports | Clears the gate **and keeps the slot** |

The engine prices that freed slot: a stunless team earns a much larger shill credit than the
flat match bonus a stunner team gets.

**The size of that gap is a calibration dial, not a derived quantity.** It is what makes YSG
double-support lines competitive with the Dialyn line rather than a distant second. That
matters most in Deadly Assault, where hoarding Dialyn for one boss starves another team who
needs her far more — see [Deadly Assault allocation](../bucketing/deadly-assault.md).

## Related

* [Boss object](../data-model/boss-object.md) — where `shill` is defined.


