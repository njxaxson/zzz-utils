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

`analyze()` returns two maps, for every candidate in every card — not just the ones that make the
visible list:

* `absoluteVerdicts` — the unit judged on its own: gap priority, promotion, the banner-T0 floor,
  the partner ladder, codependency. Owner rulings about a single unit live here.
* `unitVerdicts` — the same verdict after the [priority budget](#priority-budget), relative to
  everything else this roster needs. Cards and banner tiles read this one.

## Priority budget

A roster that needs a lot used to come back as a wall of High. Now every entry is ranked the way a
player would choose pulls, and only the first few keep their priority: at most **2 High** and
**4 Medium**; the rest drop to Low. The budget only demotes, and a roster within it is untouched.

Entries are ranked greedily, one pick at a time, each by its best unit:

1. a T0 on a current or upcoming banner;
2. on a [narrow](coverage-and-gaps.md#gap-04-the-rating-judges-team-types-not-single-best-units)
   roster, anything that only deepens the narrow archetype goes last;
3. an archetype no earlier pick already serves, before one that overlaps;
4. pullable now;
5. more fresh archetypes;
6. then score, then tier.

What a unit **serves** comes from the gaps it answers. A support or stunner serves an archetype
only when it actually fits an owned carry of it (`mechanicsFitScore` ≥ 15) — joining a team is
not activating it.

Within a card, alternatives that match the lead on fresh coverage and availability keep the
card's priority; the rest sit one level lower.

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

### [PULL-08] The priority budget, and the roster it was built from

The owner's read of a narrow anomaly roster (Aria, Jane Doe, Yanagi, Grace, Remielle, Nangong,
Yuzuha, plus Claret and Pyrois): the two High pulls are **Velina** — a must-have T0 on a banner,
completing Aria/Velina/Remielle — and **Roxy**, who activates both Claret (fit 19) and Pyrois
(fit 23) and gives the account viable attack and armorer teams. Norma fits Pyrois but not Claret
(9.7), so she is a step below Roxy. Anomaly Depth (Phoenix, Promeia) is the wrong direction: it
deepens the one thing the account already has, and Velina already covers it.

Owner decisions: the budget counts needs (cards), not units; High 2, Medium 4; pullable-now ranks
ahead within the rules above.

Owner rulings about a single unit (the banner-T0 floor, the Remielle table) are absolute and are
tested against `absoluteVerdicts`. The budget is a statement about order, and is tested on its
own (TEST 53).
