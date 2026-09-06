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
