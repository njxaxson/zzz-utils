# Page by page

Structure only. For the shared pieces see [result-cards](result-cards.md) and [tiles](tiles.md).

## Team Recommendations

One card per ranked team. Desktop: a left column (rank, strength label, score) then three 120px
tiles. Mobile: a header line (rank, strength, score) over a dark panel of three tiles.
Accent: strength band.

## Team Builder

No score, so no strength accent: each **element** is one card (left bar in the element colour;
on mobile a top bar). Inside it each DPS type is a labelled row, and each team in that row is
its own bordered card with three 100px tiles. Desktop puts the label left of its teams, which
wrap; mobile stacks the label above. Element/DPS pairs with no teams emit no cell at all.

## Deadly Assault Matchups

A carousel; each slide is an **option** with three rows, one per boss. Desktop row:
boss tile (150px) · strength · three unit tiles. Mobile row: boss banner with the strength badge
over it, then a dark panel of three tiles under a solid rule. Accent: strength band per row.
Prev/next buttons float over the slide title on mobile so the tiles get the full width.

**Plan your own matchup** (inputs, below the roster, since a plan depends on it): a toggle that both enables the plan and
shows its inputs. It is off and collapsed by default, so the page is unchanged for anyone who does
not want it. When on, three rows (always three; a boss not chosen yet shows a dashed "Select a
boss" placeholder and its slots are inert) use the **result rows' own grid**: boss tile, a 1px
`--rule-soft` divider (as on Agent Teams results), then three agent slots. On mobile each row
becomes the same cropped boss banner over a dark panel of three slots; the panel's solid rule
replaces the divider. A boss's state (free, pinned, fixed) is not labelled: it is simply how many
slots are filled.
Picks outlive the toggle, so a plan can be switched off and on again; **Clear plan** empties it.
Inputs and results never mix: results carry no pin markers. The popup is the shared agent picker
(below) with `allowUnowned` on; unowned agents keep the "Not owned" badge. The same agent on two
bosses outlines both tiles red and blocks Find Optimal Teams with a message naming the agent.
**"Show me more creative options" is disabled and hidden** while a non-empty plan is on (and for
results that came from one): the player is being creative through the plan, and DPS bucketing
over many pins gives confusing results, so planned results always use the ranked view. The saved
preference is untouched and returns when the plan is cleared or the next unplanned run is shown.
Picks are saved with the page settings and shared in a `plan=` link parameter; a link carrying a
plan opens with the toggle on. Solver rules: [bucketing/deadly-assault](bucketing/deadly-assault.md#custom-plans-pins).

## Agent Teams

The reference design. Desktop: team on the left, that team's best bosses on the right, divided
by a hairline. Mobile (≤900px): team panel (darker, solid rule beneath), then the boss list.
Accent: the team's best matchup band. Its styles live in the `AGENT TEAMS PAGE` section of `style.css`.

Unowned agents: the popup also offers agents the player lacks (grey ring, plus an **Unowned**
filter), and any agent in the focus bar (picked, or arriving via `?agents=` from another page) is
treated as owned for the search, so the page answers "what teams could I build if I had this
agent". Such tiles keep the "Not owned" badge. Only the focus agents join the pool; the rest of
each team still comes from the roster.

## Agent picker (shared)

The focus tiles and the popup behind them are one component, `lib/common/agent-picker.js`, used
by Agent Teams and the Deadly Assault plan so they cannot drift. A picker owns one popup, which
opens directly beneath whichever slot group is being edited. Slots are `.ap-tile`, the popup is
`.ap-picker` (styles in the `AGENT TEAMS PAGE` section of `style.css`). The popup shows **at most
18 icons** (owned agents first) with a note when more match; search and the rank/role/element
filters reach the rest, and when `allowUnowned` is on an **Unowned** filter lists only agents the
player lacks. On phones (≤600px) the filter groups dissolve into one wrapping row, so a line breaks
only where the width runs out, never between groups. The one behavioural switch is `allowUnowned`: Agent Teams and the Deadly Assault plan both turn it
on so what-if planning is possible, and the picker still supports it being off (roster only). Unowned agents in the popup keep full colour and swap their element ring for a **solid grey ring**: they must not look
disabled (that treatment is reserved for agents who cannot join the selection). Agent Teams passes a `describe` hook that fades agents who cannot join the current
selection (a roster agent is checked against the roster's teams; an unowned one with
`canFormTeam` in `team-pool.js`, which applies the same legality and FLEX rule as
`buildRosterTeams`, pinned by test-mechanics TEST 40); the plan passes none.

## Pull Recommendations

Three parts: the Roster Health card, the banner strip, and the recommendation cards.

* **Recommendation card:** priority badge, title and reasons on top; a dark panel of 100px
  candidate tiles underneath (they wrap — a gap can have many candidates). Accent: priority.
* **Banner strip:** 84px tiles with the verdict as the last line, border coloured by verdict.
  Desktop scrolls sideways if the list is long; mobile wraps.
