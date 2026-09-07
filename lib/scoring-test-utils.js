/**
 * lib/scoring-test-utils.js
 *
 * Shared fixtures and helpers for the team-scoring test suites
 * (test-mechanics.mjs and test-rankings.mjs). Extracted from what used to be
 * test-scoring.mjs so neither suite duplicates this setup.
 */

import { filterBosses } from './boss-filter.js';
import { parseTeams } from './team-parser.js';
import { buildAvailableUnits } from './roster-builder.js';
import { buildTeams } from './team-pipeline.js';
import { scoreTeamForBoss } from '../app/public/lib/common/team-scorer.js';

/** Neutral synthetic boss: same as `matchups.js` (full roster has no "neutral" in JSON as a real boss in some builds — appended at runtime). */
const NEUTRAL_BOSS = {
    name: 'Synthetic Neutral Boss',
    favored: [],
    mechanics: {
        weaknesses: [],
        resistances: [],
        shill: null,
        anti: [],
        assists: 0
    }
};

// Small helpers

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

/**
 * @param {object[]} allUnits
 * @param {object} roster
 * @returns {{ label: string, team: object[] }[]}
 */
function makeAllViableTeamEntries(allUnits, roster) {
    // This suite tests scoring mechanics on unreleased units, so preview units
    // are always included.
    const options = { preview: true };
    const { availableUnits, universalUnits } = buildAvailableUnits(allUnits, options, roster);
    const { threeCharTeams, teamLabels } = buildTeams(availableUnits, universalUnits);
    return teamLabels.map((label) => ({ label, team: threeCharTeams[label] }));
}

/**
 * @param {{ label: string, team: object[] }[]} entries
 * @param {string[]} [includeOneOf] - if set, only teams containing at least one of these (case-insensitive name match)
 */
function filterIncludeOneOf(entries, includeOneOf) {
    if (!includeOneOf || includeOneOf.length === 0) return entries;
    return entries.filter(({ team }) =>
        includeOneOf.some((name) => team.some((u) => u.name.toLowerCase() === name.toLowerCase()))
    );
}

/**
 * Viable = score > 0 (mirrors `matchups.js` listing).
 *
 * @param {{ label: string, team: object[] }[]} entries
 * @param {object} boss
 * @param {number} depth
 * @param {string[]} [includeOneOf]
 * @returns {{ label: string, team: object[], score: number }[]}
 */
function getTopViableTeams(entries, boss, depth, includeOneOf) {
    const base = filterIncludeOneOf(entries, includeOneOf);
    const rows = [];
    for (const { label, team } of base) {
        const score = scoreTeamForBoss(team, boss, {});
        if (score > 0) {
            rows.push({ label, team, score });
        }
    }
    rows.sort((a, b) => b.score - a.score);
    return rows.slice(0, depth);
}

function scoreForTeamString(teamsString, allUnits, opts = {}) {
    const { teams, warnings } = parseTeams(teamsString, allUnits, { preview: opts.preview ?? true });
    for (const w of warnings) {
        /* empty — batch suite expects expansion warnings to be ok */
    }
    return teams;
}

function scoreMapForBoss(parsedTeams, boss) {
    const m = new Map();
    for (const { label, team } of parsedTeams) {
        m.set(label, scoreTeamForBoss(team, boss, {}));
    }
    return m;
}

function withBosses(bosses, filterStr) {
    if (!filterStr) return bosses;
    return filterBosses(bosses, filterStr);
}

export { NEUTRAL_BOSS, assert, makeAllViableTeamEntries, filterIncludeOneOf, getTopViableTeams, scoreForTeamString, scoreMapForBoss, withBosses };
