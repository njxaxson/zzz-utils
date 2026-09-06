# Tag registry

Production code carries short references instead of essays. `[COH-04]` in a source file means
"the reasoning is in the cohesion doc, under the heading `[COH-04]`."

This file is the flat index of every tag. It exists so two greps answer the two questions that
go stale:

```bash
# every tag used anywhere in the repo
grep -roh '\[[A-Z]\{3,5\}-[0-9]\{2\}\]' documentation/ app/public/lib lib ./*.js ./*.mjs | sort -u

# every tag this registry claims exists
grep -o '^| `\[[A-Z]*-[0-9]*\]`' documentation/reference/TAGS.md
```

A tag in the first list but not the second is an orphaned reference. A tag in the second but not
the first is a note nobody points at any more — delete the note, leave the number retired.

## Rules

* Format is `[PREFIX-NN]`. Two digits, zero-padded.
* Numbers are allocated in order within a prefix and **never reused**, even after a note is
  deleted. A retired number costs nothing; a recycled one silently points old commits at the
  wrong note.
* The note lives at the bottom of the prefix's owning file, under `## Code notes`, as
  `### [PREFIX-NN] Short title`.
* One line of plain English in the code, then the tag:
  ```javascript
  // Lycaon is exempt from the stunless carve-out. [COH-04]
  ```
* If the code comment needs more than that one line to make sense at the call site, the comment
  is wrong, not too short — say what the code *does* in that line and let the tag carry why.

## What earns a tag

A tag is for reasoning that a maintainer needs *occasionally* and that would otherwise be
deleted by someone who thought it was noise.

| Stays in the code, untagged | Becomes a tag |
|----|----|
| What a non-obvious line does, in one line | Anything narrating a past state of the code |
| A magic number's units or range | Anything arguing against a change ("do not rename it back") |
| A `TODO` naming a real, current gap | Anything with dates, test numbers, or defect history |
| The file header — one sentence | Anything over about four lines |

The test: if it explains **the code**, it stays and gets shorter. If it explains **why the code
isn't something else**, it becomes a tag.

## Prefixes

| Prefix | Owning file |
|----|----|
| `FUND` | `../concepts/elements-and-roles.md` |
| `ANOM` | `../concepts/anomaly-reactions.md` |
| `DISO` | `../concepts/disorder-supply.md` |
| `LUM` | `../concepts/lumen.md` |
| `ARM` | `../concepts/armorer-laceration-gash-maim.md` |
| `ARCH` | `../archetypes/README.md` |
| `DATA` | `../data-model/mechanics-overview.md` |
| `PRED` | `../data-model/predicates.md` |
| `SCAL` | `../data-model/scaling.md` |
| `BUFF` | `../data-model/buffs-and-debuffs.md` |
| `BOSS` | `../data-model/boss-object.md` |
| `PIPE` | `../engine/layers.md` |
| `COMP` | `../engine/l4-components.md` |
| `ULT` | `../engine/ultimates-two-channel.md` |
| `COH` | `../engine/cohesion.md` |
| `TWM` | `../engine/teamwork-multiplier.md` |
| `DIAM` | `../engine/diametric-synergy.md` |
| `CAL` | `../engine/calibration.md` |
| `READ` | `../engine/reading-scores.md` |
| `PULL` | `../recommendations/pull-engine.md` |
| `GAP` | `../recommendations/coverage-and-gaps.md` |
| `CODEP` | `../recommendations/codependency-gating.md` |
| `BUCK` | `../bucketing/deadly-assault.md` |
| `TEST` | `../tooling/verification-loop.md` |

## Registry

Populated during the comment pass. One row per tag, newest last within a prefix.

| Tag | File | Summary |
|----|----|----|
