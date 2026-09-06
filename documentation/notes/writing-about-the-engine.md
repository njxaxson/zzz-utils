# Writing about the engine

These apply anywhere the engine is explained to a human: plans, issue write-ups, commit
messages, PR descriptions, and the documentation itself.

They came out of a plan review where the first draft was rejected as unreadable — and where two
real errors in it turned out to have been *hidden by the prose*. That is the point. Bad writing
here is not a style problem, it is a correctness problem, because nobody can check a claim they
cannot parse.

## 1. Name a problem after a concrete instance, not after its mechanism

"The Sunna/Yixuan case" beats "partial buffs land badly", because the reader can hold two real
units in their head and check the claim. "The Lighter case". "The Miyabi/Remielle case".

A mechanism-named problem sounds more general and is less useful — the reader has nothing to
test it against.

## 2. Lead with the game situation, then the code

Say what happens at the keyboard first. Name `computeBuffUtilization` second, if at all.

> **Yes:** Astra behind an armorer earns almost nothing, because her crit-damage buff does not
> apply to a damage type with fixed crit damage.
>
> **No:** `LACERATION_BUFF` bypasses the CD channel in the armorer branch.

## 3. Roughly one technical term per sentence

"Cohesion", "oversupply", "fit" are all fine words. *"The absolute-supply threshold masks the fit ratio in the cohesion accumulator"* is four of them stacked and is unreadable.  **This is very important and is a constant source of frustration for system owners.** 

## 4. Show arithmetic as a small table with real numbers

Not a formula described in prose. A three-row table with actual scores from an actual team beats
a paragraph explaining what the formula does.

## 5. State what stays broken, not only what gets fixed

For a change of any size the reader cannot trace the impact themselves. Spell out what the change
does and does **not** achieve, and say plainly which parts are guesses.

Every substantial doc in `notes/` and every issue file has somewhere to put this. Use it.

## 6. Concise is not the same as good

Spelling something out over five lines beats compressing it into one that has to be re-read twelve times. Density is not a virtue here; the audience is someone who has just been paged into a problem they do not have context on.  **This is very important and is a constant source of frustration for system owners.** 

## A note on numbers

Do not restate constants, thresholds or weights in prose. They live in the code, which is
commented with the rationale, and prose copies go stale silently. Quoting a value to *illustrate*
a point is fine — "+132 at intensity 6" earns its place. Building a reference table of tuning
constants does not.