---
id: SCORE-140
title: Trigger/SAnby/Seed clears its floor only because two synergy groups were declared
priority: medium
area: scoring
status: deferred
opened: 2026-09-02
deferred-reason: The owner has specified a join-shape exemption as the real fix and scheduled it as an engine expansion for a future release.
---

## Symptom

`Trigger/SAnby/Seed` fell from 338.0 to 238.6 against a floor of 305, as a side effect of a
correct change elsewhere — removing the escape that let two same-element carries keep a
favourable structure tier.

## Reproduction

```bash
node matchups.js -b ucc -t trigger/sanby/seed --debug
```

## Diagnosis

Seed is tagged as an attacker but plays support. She supplies attack, crit damage and a damage
buff, with a strong ultimate as her only damage instrument, and SAnby declares herself
codependent — so Seed's buffs are precisely what SAnby runs on.

She is the **only** attack-tagged unit in the roster supplying two or more baseline buffs at
defining weight, which makes her the sole unit that would qualify under the pseudo-support arm of
the double-attacker rule. She declares no pseudo-role, so the engine cannot see any of that.

## Resolution

Not resolved. The team was brought back over the floor by declaring two conjunctive synergy
groups, which reads 302.1 against a floor lowered to 300. Owner: "good enough." The floor has
since moved a third time, to 295.

State plainly what that is, because it gets misread later as a modelling result:

* It is a **declared carve-out, not an emergent outcome.** The engine still classifies the shape
  as two attack carries with no interaction. Nothing was learned about Seed's role.
* The margin is a couple of points. That floor is a viability statement, not a calibrated number.
* It reuses the conjunctive mechanism built for a different unit, which is fine — that is why it
  was built general — but it is now carrying two unrelated jobs. A third use should prompt a look
  at whether the underlying inference is worth doing properly.

**The owner's own preferred fix, recorded verbatim in intent:** any attack, rupture or armorer
agent whose *only* join is on another agent of the same role — Seed can only join attackers, with
no alternative — should be **exempt from the no-support penalty**, in the same way a double-stun
totalize team already is. Such a unit has many compositions where a support simply does not fit
over the stunner. To be addressed as an engine expansion in a future release.

Two principled fixes remain open and unblocked in the meantime: give Seed a support pseudo-role,
or infer pseudo-support from buff supply. The discriminator is clean — every attacker in the
filed complaints supplies zero baseline buffs, and Seed supplies two at defining weight.

**Do not** close it instead by restoring the same-element escape. That re-breaks three other
teams that are now pinned by a test.
