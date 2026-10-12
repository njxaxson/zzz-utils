# Cards and Priority

The last stage of the [pull engine](pull-engine.md). Gaps are what the engine detects; **cards**
are what the player sees.

## The inversion

Gaps are scored, calibrated and sorted. Then the results are **inverted into unit-centric
cards**.

Each candidate collects every gap it appears in. Its highest-scoring gap becomes its *primary*
and determines which single card it lives in; the rest surface underneath as "Also:" reasons.

That inversion removes all the deduplication complexity — **a unit appears in exactly one card**.
There is no case where the same recommendation shows up twice under two headings.

## Priority

Priority is **absolute by default**, driven by score thresholds.

It switches to **relative** for a well-developed roster. There, the
[coverage calibration](coverage-and-gaps.md#coverage) compresses everything below the absolute
thresholds, and the top remaining gap should still read as the most urgent one — otherwise a
player who owns most of the roster sees a page of uniformly low-priority suggestions with no
guidance at all.

A unit accumulating several medium-priority contributions is **promoted**, on the theory that
broad usefulness beats a single narrow fit.

## Then gating

[Codependency gating](codependency-gating.md) is applied last, and can drop a card a rank or
remove a unit from every list.

## Banner T0s

A limited T0 you don't own, on the current or upcoming banners, is a **High** pull. It gets its
own *Top-Tier Banner Agent* entry so it has a card even when no other gap lists it. Off-banner
T0s get nothing extra — recommending a unit you can't pull is noise that crowds out the roster
analysis.

The floor is applied to the unit's priority, not its score, and **before** gating, so
[codependency](codependency-gating.md) and the [partner ladder](partner-ladder.md) still discount
Ye Shunguong and Remielle. A support or stunner that no owned carry can legally field with floors
at Medium instead.

## One verdict per unit

`analyze()` returns `unitVerdicts`: the priority every candidate would carry, computed the same
way as the cards, for every card — not just the ones that make the visible list. The banner
tiles read it.

## Code notes

### [PULL-05] `unitVerdicts` is the only verdict source

The banner tiles used to take a unit's card priority when the unit was in the top ten cards, and
otherwise re-derive a verdict from its best raw gap plus a fresh dependency check. The two paths
disagreed — the fallback skipped composite promotion — and a unit in no gap read "No" however
strong it was. Velina, a T0 on the 3.3 banner, read "No" on an anomaly roster that way.

Verdicts are now computed once, in the engine, for every profile in every card. Units in a
card's first five take the card's priority; the rest take their own composite priority. Then the
banner floor, the ladder floor, and the codependency/ladder penalty apply. A unit in no gap, or
removed by gating, has no entry and reads "No".

### [PULL-06] The banner-T0 floor

Scoped to banners on purpose. An unconditional "every T0 is High" rule was proposed and rejected
by the owner: a new player would get ten-plus "pull the best units" cards and no mechanical
analysis of their roster. A T0 you can actually pull is the case where tier alone is a good
reason; a T0 you can't is just noise.
