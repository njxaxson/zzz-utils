/**
 * Team generation pipeline shared by team-building CLI scripts.
 * Wraps getTeams + 2/3-char separation + universal-unit extension.
 */

import {
    getTeams,
    extendTeamsWithUniversalUnits
} from '../app/public/lib/common/team-builder.js';

/**
 * Generate teams, separate into 2- and 3-character groups,
 * and optionally extend with universal units.
 *
 * @param {Object[]} availableUnits - Filtered unit list
 * @param {string[]} [universalUnitNames] - Names of flex/universal units
 * @returns {{ twoCharTeams: Object, threeCharTeams: Object, teamLabels: string[], extendedCount: number, universalUnitObjects: Object[] }}
 */
export function buildTeams(availableUnits, universalUnitNames = []) {
    const allTeams = getTeams(availableUnits);

    const twoCharTeams = {};
    const threeCharTeams = {};
    for (const label in allTeams) {
        const team = allTeams[label];
        if (team.length === 2) twoCharTeams[label] = team;
        else if (team.length === 3) threeCharTeams[label] = team;
    }

    let extendedCount = 0;
    const universalUnitObjects = availableUnits.filter(u => universalUnitNames.includes(u.name));

    if (universalUnitObjects.length > 0) {
        extendedCount = extendTeamsWithUniversalUnits(twoCharTeams, threeCharTeams, universalUnitObjects);
    }

    return {
        twoCharTeams,
        threeCharTeams,
        teamLabels: Object.keys(threeCharTeams),
        extendedCount,
        universalUnitObjects
    };
}
