# Issues

One issue, one file. The folder a file sits in is its status; the prefix on its name is its
priority. There is no central list to keep in sync — `ls` is the list.

## Naming

```
<priority>-<slug>.md
```

Priority is one of `critical-`, `high-`, `medium-`, `low-`, `trivial-`.

The slug names a **concrete instance**, not a mechanism. `high-aria-remielle-velina-underrated-on-solo.md`,
not `high-support-valuation.md`. A reader should be able to hold the real units in their head and
check the claim — that is the project's own writing rule and it applies hardest here.

Renaming a file to change its priority is fine and expected.

## Front matter

Every issue file starts with this block. It exists so the folder is greppable and sortable
without opening anything.

```yaml
---
id: SCORE-016
title: Sub-DPS tier is halved beside a same-type carry
priority: high
area: scoring          # scoring | pull | bucketing | data | tooling | docs
status: open           # open | resolved | deferred
opened: 2026-09-04
tags: [COH-04]         # documentation tags this issue touches; omit if none
related: []            # other issue filenames; omit if none
---
```

`resolved/` files add `closed: YYYY-MM-DD`.

**`resolved/` is gitignored.** Closing an issue means **moving the file there**, not deleting it —
the owner reads what accumulates and deletes when ready. Do not delete a closed issue yourself,
and do not commit one. The durable reasoning still belongs in [notes/](../notes/) behind a tag;
the file in `resolved/` is a holding area for review, not the permanent record.
`deferred/` files add `deferred-reason:` — one line, why we are not chasing it.

## Body

Four headings, always these four, always in this order. An empty section stays, with a dash
under it, so it is obvious that nobody has done that work yet.

```markdown
## Symptom

What you see at the keyboard. The game situation first, the code second.

## Reproduction

The exact command, and what it prints.

## Diagnosis

Why it happens. Empty until someone actually finds out.

## Resolution

What changed, and what stayed broken. Empty until closed.
```

## Lifecycle

A file moves between folders; it is not copied and it is not edited in place across folders.

* **Opening** — write it into `open/`.
* **Deferring** — move to `deferred/`, set `status: deferred`, add `deferred-reason:`.
  Deferred means *we decided not to chase this*, not *nobody got to it*.
* **Resolving** — either:
  * move to `resolved/`, set `status: resolved`, add `closed:`, and fill in `## Resolution` — **if**
    the history would change what a future reader does; or
  * **delete the file.** Git holds it. Most closed issues belong here.

That second option is the important one. A `resolved/` folder that accumulates every closed
issue is the monolith this structure was built to escape. Keep a resolved issue only when you
can say what a future reader would get wrong without it.

Durable reasoning that is not about a specific defect — a rejected approach, a measured dead end,
a settled argument — does not belong in an issue file at all. It goes to
`../notes/known-pitfalls.md`, `../notes/lessons-learned.md`, or `../notes/adjudications.md`.
