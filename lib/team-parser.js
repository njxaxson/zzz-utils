/**
 * Parses the --teams/-t CLI argument string into resolved team arrays.
 * Handles slash-separated units within teams, comma-separated teams,
 * and 2-unit team expansion via the team builder.
 */

import { resolveUnit } from './unit-resolver.js';
import { getTeams, sortTeamByRole, getTeamLabel } from '../app/public/lib/common/team-builder.js';

/**
 * Parse a --teams string into an array of resolved teams.
 *
 * Each team is slash-separated units; teams are comma-separated.
 * 3-unit teams are used as-is. 2-unit teams are expanded to all valid
 * 3-unit teams that contain those two units.
 *
 * @param {string} teamsString - Raw value of --teams
 * @param {Object[]} allUnits - Full unit list from units.json
 * @param {Object} [options] - Options affecting expansion
 * @param {boolean} [options.preview] - Include preview/unavailable units in expansion pool
 * @returns {{ teams: Array<{ label: string, team: Object[] }>, warnings: string[] }}
 */
export function parseTeams(teamsString, allUnits, options = {}) {
    const warnings = [];
    const teams = [];
    const seenLabels = new Set();

    const rawTeams = teamsString.split(',').map(s => s.trim()).filter(Boolean);

    for (const rawTeam of rawTeams) {
        const tokens = rawTeam.split('/').map(s => s.trim()).filter(Boolean);

        if (tokens.length < 2) {
            throw new Error(`Team "${rawTeam}" has fewer than 2 units — minimum is 2`);
        }
        if (tokens.length > 3) {
            throw new Error(`Team "${rawTeam}" has more than 3 units — maximum is 3`);
        }

        const resolvedUnits = tokens.map(tok => resolveUnit(tok, allUnits));

        const ids = resolvedUnits.map(u => u.id);
        const uniqueIds = new Set(ids);
        if (uniqueIds.size !== ids.length) {
            throw new Error(`Team "${rawTeam}" contains duplicate units`);
        }

        if (resolvedUnits.length === 3) {
            const team = [...resolvedUnits];
            sortTeamByRole(team);
            const label = getTeamLabel(team);
            if (!seenLabels.has(label)) {
                seenLabels.add(label);
                teams.push({ label, team });
            }
        } else {
            const expanded = expandTwoUnitTeam(resolvedUnits, allUnits, options);
            if (expanded.length === 0) {
                warnings.push(`No valid 3-unit teams found containing ${resolvedUnits.map(u => u.name).join(' + ')}`);
            }
            for (const { label, team } of expanded) {
                if (!seenLabels.has(label)) {
                    seenLabels.add(label);
                    teams.push({ label, team });
                }
            }
        }
    }

    return { teams, warnings };
}

/**
 * Expand a 2-unit partial team into all valid 3-unit teams that contain both units.
 */
function expandTwoUnitTeam(twoUnits, allUnits, options) {
    const pool = options.preview
        ? [...allUnits]
        : allUnits.filter(u => u.available !== false);

    const allValidTeams = getTeams(pool);
    const requiredIds = new Set(twoUnits.map(u => u.id));
    const results = [];

    for (const label in allValidTeams) {
        const team = allValidTeams[label];
        if (team.length !== 3) continue;
        const teamIds = team.map(u => u.id);
        if ([...requiredIds].every(rid => teamIds.includes(rid))) {
            results.push({ label, team });
        }
    }

    results.sort((a, b) => a.label.localeCompare(b.label));
    return results;
}
