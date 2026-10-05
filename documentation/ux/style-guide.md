# Style guide (site foundation)

The base every page inherits. For how *results* look see [result-cards](result-cards.md) and
[tiles](tiles.md); this file covers everything underneath them. The source of truth is
`app/public/styles/style.css` — if this file and the CSS disagree, the CSS wins; fix this file.

## Stack

Vanilla HTML, CSS and ES modules. No framework, no bundler, no build step; the site is static
files served from `app/public/` (GitHub Pages). The only third-party script is `pako` from
cdnjs, loaded by pages that share rosters.

## One stylesheet, no inline CSS

All pages link a single `styles/style.css`. **Do not add `<style>` blocks or `style=""`
attributes for styling.** Page-specific rules go in that page's banner section at the end of
`style.css` (e.g. `AGENT TEAMS PAGE`, `CHARACTER SUMMARY PAGE`). The only tolerated `style=`
use is the initial `display: none` on elements JavaScript toggles; prefer a class where you can.

## Tokens (`:root` in `style.css`)

Always use the variable; never a raw hex in a new rule unless it is a one-off band colour.

| Group | Variables |
|----|----|
| Surfaces | `--bg-primary` `#0a0a0f` (page) · `--bg-secondary` `#12121a` (sections) · `--bg-tertiary` `#1a1a26` (cards, inputs) |
| Accents | `--accent-primary` `#ff6b35` (orange: headings, active, primary buttons) · `--accent-secondary` `#00d4aa` (teal: hover, highlights) · `--accent-glow` |
| Text | `--text-primary` `#e8e8e8` · `--text-secondary` `#a0a0a0` · `--text-muted` `#606070` |
| Status | `--success` · `--warning` · `--error` |
| Lines | `--border-color` `#2a2a3a` · `--rule-soft` · `--rule-strong` · `--panel-dark` |
| Elements | `--element-{fire,ice,electric,physical,ether,wind,lumen}` and a `-light` variant for text |

Strength bands (`.band-excellent` … `.band-bad`) are defined with the result cards; see
[result-cards](result-cards.md).

The theme is dark only. The body adds two faint radial glows (orange top-left, teal
bottom-right) over `--bg-primary`.

## Typography

Both fonts come from Google Fonts via the `@import` at the top of `style.css`.

| Font | Use |
|----|----|
| **Orbitron** (400, 700) | Brand, section headings (`section h2`), buttons — uppercase with letter-spacing |
| **Rajdhani** (400, 500, 600) | Body text, nav, tiles, everything else |

Section headings are 0.85rem Orbitron, uppercase, `--accent-primary`, with a bottom hairline.
The page `<h1>` (`.page-title`) is Rajdhani, uppercase, widely tracked, `--text-secondary`.

## Page skeleton

Every page has this shape (copy `tier-list.html` as the smallest example):

```html
<body>
    <div class="container extra-wide">          <!-- or "container" / "container wide" -->
        <div id="header-container"></div>       <!-- filled by loadSharedComponents -->
        <main class="main-narrow">              <!-- see responsive.md for widths -->
            <section>…</section>
        </main>
        <div id="footer-container"></div>
    </div>
    <script type="module">
        import { loadSharedComponents } from './lib/common/components.js';
        loadSharedComponents('page-id');        // matches data-page in components/header.html
    </script>
    <script type="module" src="lib/pages/page-id.js"></script>
</body>
```

* The header and footer are `components/header.html` and `components/footer.html`, fetched at
  load. The `<h1 class="page-title">` text comes from `PAGE_TITLES` in
  `lib/common/components.js`, keyed by the page id.
* Container widths: `container` 1100px, `wide` 1200px, `extra-wide` 1400px. Page bodies are
  narrowed with `main-narrow` (see [responsive](responsive.md)).
* `<section>` is the base panel: `--bg-secondary`, 1px border, 8px radius, 1.5rem padding.
  Collapsible panels use `<details>` (see *Collapsible sections* in `style.css`).

## `<head>` contract

Every page carries the same head, in this order. Copy it from `character-summary.html` and
change only the page-specific strings.

1. `charset` and `viewport` metas
2. `description`, `robots` (`index, follow`), `theme-color` (`#0a0a0f`)
3. `link rel="canonical"` — absolute URL under `https://njxaxson.github.io/zzz-utils/`
4. Open Graph: `og:type` (`website`), `og:site_name` (`ZZZ Utils`), `og:title`,
   `og:description`, `og:url`, `og:image` (`assets/sitelogo.png?v=2`, 1200×630), `og:image:alt`,
   `og:locale`
5. Twitter: `twitter:card` (`summary_large_image`), title, description, image, image alt
6. `<title>`
7. JSON-LD `@graph`: a `WebPage` (about the `VideoGame`) and a `BreadcrumbList`
   (`ZZZ Utils` → this page)
8. `link rel="icon"` → `assets/favicon.svg`, then `link rel="stylesheet"` → `styles/style.css`
9. Page-specific scripts (e.g. pako) last

Adding a page also means: a nav entry in `components/header.html`, a `PAGE_TITLES` entry, and
a `<url>` in `sitemap.xml`.

## Controls

* **Primary button** `.btn-primary` / `.run-btn`: full width, Orbitron bold uppercase, orange
  gradient, lifts 2px with a glow on hover.
* **Secondary button** `.btn-secondary`: bordered `--bg-tertiary`; hover turns the border and
  text teal.
* Inputs, selects and the custom dropdown share `--bg-tertiary` fill, `--border-color` border,
  and an orange border on hover/focus. Reuse `custom-dropdown.js` rather than styling a new
  `<select>`.
* Validation messages use `.validation-errors` and `--error`.

## Breakpoints

768, 600 and 480px are the working set; 900px belongs to Agent Teams alone. Details in
[responsive](responsive.md).

## Checklist for a new page or component

- [ ] No `<style>` or styling `style=""`; rules live in `style.css`
- [ ] Colours from tokens, fonts only Orbitron/Rajdhani
- [ ] Full `<head>` per the contract above
- [ ] Looks right at 1400, 768 and 375px wide
- [ ] Row added to [pages](pages.md) if it shows results
