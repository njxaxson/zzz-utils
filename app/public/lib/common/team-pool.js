/**
 * Shared browser team pipeline: roster → legal 3-person teams → calibrated scores.
 *
 * Used by team-builder, team-recommendations, deadly-assault and agent-detail so the
 * pages can never drift apart on how a roster becomes a scored team list.
 */

import { getTeams, extendTeamsWithUniversalUnits } from './team-builder.js';
import { scoreTeamForBoss } from './team-scorer.js';
import { calibrate } from './calibration.js';

// No weaknesses, resistances or shill: scores a team on its own merits.
export const NEUTRAL_BOSS = {
    name: 'neutral',
    weaknesses: [],
    resistances: [],
    shill: null,
    anti: [],
    favored: [],
    assists: 0
};

// Owned units from roster state, copied so scoring never touches units.json objects.
export function getRosterUnits(allUnits, unitStates) {
    return allUnits
        .filter(unit => unitStates[unit.id]?.owned)
        .map(unit => ({ ...unit, numericId: undefined }));
}

/**
 * All legal 3-person teams as `{ label: unit[] }`. FLEX units named in
 * `universalUnitNames` also complete otherwise-illegal pairs.
 */
export function buildRosterTeams(units, universalUnitNames = []) {
    const allTeams = getTeams(units);

    const twoCharTeams = {};
    const threeCharTeams = {};
    for (const label in allTeams) {
        const team = allTeams[label];
        if (team.length === 2) {
            twoCharTeams[label] = team;
        } else if (team.length === 3) {
            threeCharTeams[label] = team;
        }
    }

    const universalUnitObjects = units.filter(u => universalUnitNames.includes(u.name));
    if (universalUnitObjects.length > 0) {
        extendTeamsWithUniversalUnits(twoCharTeams, threeCharTeams, universalUnitObjects);
    }
    return threeCharTeams;
}

// Pages compare teams of different archetypes, so `.score` is CALIBRATED; see
// documentation/engine/reading-scores.md. Returns null for a non-viable team.
export function scoreCalibrated(team, boss, scoreOptions, calibration) {
    const trace = {};
    const raw = scoreTeamForBoss(team, boss, { ...scoreOptions, trace });
    if (raw <= 0 || trace.disqualified) return null;
    return { raw, score: calibrate(raw, trace.carryArchetype, calibration), archetype: trace.carryArchetype };
}

/**
 * Scores every team against one boss, best first. Falls back to lenient scoring when
 * nothing is viable strictly; those entries carry `lenient: true`.
 */
export function scoreTeamsForBoss(teams, boss, calibration) {
    const viable = [];
    const disqualified = [];

    for (const label in teams) {
        const team = teams[label];
        const scored = scoreCalibrated(team, boss, {}, calibration);
        if (scored) {
            viable.push({ label, team, ...scored });
        } else {
            disqualified.push({ label, score: 0, team });
        }
    }

    let usedLenient = false;
    if (viable.length === 0) {
        usedLenient = true;
        for (const label in teams) {
            const team = teams[label];
            const scored = scoreCalibrated(team, boss, { lenient: true }, calibration);
            if (scored) {
                viable.push({ label, team, ...scored, lenient: true });
            }
        }
    }

    viable.sort((a, b) => b.score - a.score);
    return { viable, disqualified, usedLenient };
}

export function requireCalibration(calibration) {
    if (!calibration) {
        throw new Error('Calibration data failed to load — refresh the page. If this persists, ' +
            'calibration.json may be missing (run: node generate-calibration.mjs).');
    }
    return calibration;
}
