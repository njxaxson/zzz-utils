# FEATURE: Accessibility pass

**Status:** proposed, **low priority**. Display only: no engine, data or calibration change.

## The problem

Much of the site's meaning is carried by colour or faintness alone, and its quietest text is
below the usual readability minimum. A one-time pass fixes most of it in the shared CSS and helpers.
After that the only ongoing cost is following the rules below in new UI.

## Audit list

### 1. Colour alone

| Signal | Where | Has a second cue today? |
|----|----|----|
| Strength band (Excellent … Bad) | Result card accents, boss-tile badges | Yes: the label text |
| Boss weakness | Boss tile gradient (`getWeaknessGradientClass`) | **No**. Text tags are planned in [Boss mechanics on Deadly Assault](da-show-weakness-resistance-shill.md) |
| Agent element | Unit tile and picker ring border colour | **No** |
| Unowned agent | Solid grey ring in the picker (see [decisions](ux/decisions.md)) | Partly; check the **Unowned** filter and tooltips |
| Can't join this selection | Faded picker tile | Only the explanatory hint line |

Fix by adding a non-colour cue (text, an icon, or a pattern) where there is none. Don't change the
colour language itself: it's settled UX.

### 2. Contrast

Measured against the WCAG AA minimum of 4.5:1 for small text:

| Text | On `--bg-primary` | On `--bg-tertiary` |
|----|----|----|
| `--text-muted` (#606070) | **3.20** | **2.79** |
| `--text-secondary` (#a0a0a0) | 7.55 | 6.58 |
| `--text-primary` (#e8e8e8) | 16.12 | 14.05 |

`--text-muted` fails on both backgrounds. It's used for hints, the inactive nav links, the "Best
against" label, and so on. Either lift it, or keep it only for decoration and never for text a player must
read. Candidates, measured:

| Candidate | On `--bg-primary` | On `--bg-tertiary` |
|----|----|----|
| #8a8a9a | 5.82 | 5.07 |
| #80808f | 5.08 | **4.43** |

#8a8a9a is the smallest of these to pass on both backgrounds.
Check this against the [style guide](ux/style-guide.md) before changing a token.

### 3. Keyboard

* Every clickable tile and slot must be reachable with Tab and work with Enter or Space. The
  Agent Teams slots and picker tiles already do; audit the Deadly Assault plan slots, boss grid
  (including right-click variations, which need a keyboard route), favorite stars and roster cards.
* A visible `:focus-visible` style on every interactive element. Audit it; don't assume it.
* Right-click actions (roster FLEX, boss variation) need a non-mouse equivalent. On phones the
  mode toggle already provides one; desktop keyboard users have none.

### 4. Motion and images

* Respect `prefers-reduced-motion`: switch off the hover lift and fade-in animations.
* Decorative boss and agent images in tiles already sit beside visible names, so `alt=""` is right
  there. Images that stand alone keep a real `alt`.

## How

Run Lighthouse or axe in Chrome, and check the same pages in Firefox (both browsers are tested).
Fix in shared places first (`style.css` tokens, `team-card.js`, `agent-picker.js`, `roster-ui.js`),
so each page gets it for free.

## What it does not do

* No screen-reader-first redesign of the results grids.
* No change to any colour meaning or band threshold.
