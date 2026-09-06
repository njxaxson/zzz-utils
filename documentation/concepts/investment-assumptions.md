# Investment Assumptions

Units in the game range from M0W0 to M6W5. The scorer takes a roster and a boss — it has no
way to accept per-unit investment levels — so it assumes one fixed level for everybody.

## What the engine assumes

| Unit class | Assumed investment |
|----|----|
| S-rank DPS | M0W1 |
| S-rank non-DPS | M0W0 |
| A-rank (any role) | M6W5 |
| Potential Silhouettes, where the unit has them | P6 |

## What that costs you

**Mindscape-specific synergies are invisible.** M2 Alice / M2 Jane / M2 Yuzuha is a top-tier team in practice and the engine cannot see it, because the synergy only exists above the assumed investment level.

**Potential unlocks are baked in, not conditional.** A unit whose `join` list expands at P1
and above — Lycaon, for instance — simply has the expanded list in the data. There is no
machinery for "this only applies at P1+"; the assumption above is applied once, by hand, when
the data is written.

If you are reading a score that looks wrong for a heavily invested account, this is the first
thing to check.