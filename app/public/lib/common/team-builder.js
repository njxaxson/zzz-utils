/**
 * Shared team-building logic for Zenless Zone Zero
 * Generates all valid 2-3 character teams based on unit join conditions
 * 
 * Browser-compatible ES module version
 */

/**
 * Expands 'faction' join keywords into actual faction values for join validation.
 */
function expandFactionJoins(units) {
    return units.map(unit => {
        if (unit.join && unit.join.includes('faction') && unit.faction) {
            return {
                ...unit,
                join: unit.join.map(j => j === 'faction' ? unit.faction : j),
                tags: [...unit.tags, unit.faction]
            };
        }
        return unit;
    });
}

/**
 * Checks whether every unit's join conditions are mutually satisfied.
 * Accepts 2 or 3 units as arguments.
 */
export function isValidTeam(...units) {
    const expanded = expandFactionJoins(units);
    return expanded.every(unit => {
        const teammates = expanded.filter(u => u.id !== unit.id);
        return teammates.some(t => unit.join.some(tag => t.tags.includes(tag)));
    });
}

/**
 * Generates all valid team combinations from a list of units.
 * A team is valid if each unit's "join" conditions are met by at least one teammate.
 * 
 * @param {Array} units - Array of unit objects with id, name, tags, and join properties
 * @returns {Object} Map of team label strings to team arrays
 */
export function getTeams(units) {
    let permutations = {};
    
    for (const unitA of units) {
        for (const unitB of units) {
            if (unitA.id === unitB.id) continue;
            
            if (isValidTeam(unitA, unitB)) {
                const key = [unitA.id, unitB.id].sort().join('|');
                permutations[key] = [unitA, unitB];
            }
            
            for (const unitC of units) {
                if (unitA.id === unitC.id || unitB.id === unitC.id) continue;
                
                if (isValidTeam(unitA, unitB, unitC)) {
                    const key = [unitA.id, unitB.id, unitC.id].sort().join('|');
                    permutations[key] = [unitA, unitB, unitC];
                }
            }
        }
    }

    let teams = {};
    
    for (const id in permutations) {
        const team = permutations[id];
        sortTeamByRole(team);
        const label = getTeamLabel(team);
        teams[label] = team;
    }
    
    return teams;
}

/**
 * Sorts a team array in-place by role order, then by name within the same role.
 * Order: stun, anomaly, attack, rupture, armorer, defense, support
 */
export const ROLE_ORDER = ["stun", "anomaly", "attack", "rupture", "armorer", "defense", "support"];

export function sortTeamByRole(team) {
    team.sort((a, b) => {
        const roleA = a.tags.find(t => ROLE_ORDER.indexOf(t) != -1);
        const roleB = b.tags.find(t => ROLE_ORDER.indexOf(t) != -1);
        const compare = ROLE_ORDER.indexOf(roleA) - ROLE_ORDER.indexOf(roleB);
        return compare == 0
            ? a.name.localeCompare(b.name)
            : compare;
    });
    return team;
}

/**
 * Returns the canonical label for a team (assumes team is already sorted).
 */
export function getTeamLabel(team) {
    return team.map(unit => unit.name).join(" / ");
}

/**
 * Checks if two teams share any units (based on unit.id)
 */
export function teamsOverlap(team1, team2) {
    const ids1 = new Set(team1.map(u => u.id));
    for (const unit of team2) {
        if (ids1.has(unit.id)) return true;
    }
    return false;
}

/**
 * Extends 2-person teams with universal units to create additional 3-person teams.
 * Universal units can join ANY team regardless of normal join conditions.
 * 
 * @param {Object} twoCharTeams - Map of label -> 2-person team arrays
 * @param {Object} threeCharTeams - Map of label -> 3-person team arrays (will be modified)
 * @param {Array} universalUnits - Array of unit objects that can join any team
 * @returns {number} Number of new teams created
 */
export function extendTeamsWithUniversalUnits(twoCharTeams, threeCharTeams, universalUnits) {
    let extendedCount = 0;
    
    for (const label in twoCharTeams) {
        const team = twoCharTeams[label];
        const teamUnitIds = new Set(team.map(u => u.id));
        
        for (const universalUnit of universalUnits) {
            if (teamUnitIds.has(universalUnit.id)) continue;
            
            // Create extended team with proper role-based sorting
            const extendedTeam = [...team, universalUnit];
            sortTeamByRole(extendedTeam);
            const extendedLabel = getTeamLabel(extendedTeam);
            
            // Only add if this team doesn't already exist
            if (!threeCharTeams[extendedLabel]) {
                threeCharTeams[extendedLabel] = extendedTeam;
                extendedCount++;
            }
        }
    }
    
    return extendedCount;
}

// Rank band tolerance. Two teams whose scores differ by less than this are treated as
// equally good for allocation purposes. The engine is calibrated to roughly a point, not
// to a tenth of one, so a sub-band gap is noise rather than a real preference — and
// because `priority` below weights maxRank by 100, letting noise open a rank step can
// evict a strictly better allocation from the results entirely. Ratio-based so it keeps
// its meaning as scores drift upward across patches; the floor keeps it from collapsing
// to nothing on low-scoring matchups.
//
// Re-derived for the CALIBRATED scale (see lib/calibration.js) from a real case rather than
// picked in the abstract: on Thrall & Sobek, `Dialyn/Ye Shunguong/Sunna` (409.4) is the #1
// allocation and `Ye Shunguong/Zhao/Sunna` (405.2) — the best non-Dialyn alternative, freeing
// Dialyn for a boss that needs her more (e.g. pairing with Yixuan/Lucia) — sits 4.2 points
// behind. That gap has to fall inside one band, or the solver refuses to give Dialyn up even
// when the total allocation across all three bosses would be better. 0.011 x 409.4 = 4.50, the
// smallest ratio that clears 4.2 at this score; 4.5 is the matching floor (was 5, tuned to the
// old 0.02 ratio) so a low-scoring matchup doesn't get a disproportionately wide band relative
// to the new ratio. Owner-verified case, not a formula picked in the abstract — if this ever
// needs re-tuning, re-check this exact Thrall pair, not just TEST 3's shape assertions.
export const RANK_BAND_RATIO = 0.011;
export const RANK_BAND_FLOOR = 4.5;

export function rankBandEpsilon(score) {
    return Math.max(Math.abs(score) * RANK_BAND_RATIO, RANK_BAND_FLOOR);
}

/**
 * Assigns equivalence-class ranks (1 = best band) to a list already sorted by score
 * descending. Rank increments only when a score falls more than epsilon below the band
 * LEADER — the score that opened the current band. Comparing against the leader rather
 * than the previous team is what stops a long shallow gradient of near-equal scores from
 * chaining into one enormous band.
 *
 * Mutates `rank` on each entry (same contract as the index-based assignment it replaces)
 * and returns the list.
 *
 * @param {Array} teams - Array of {score, ...}, sorted by score descending
 */
export function assignBandedRanks(teams) {
    let rank = 0;
    let bandLeader = null;
    for (const t of teams) {
        if (bandLeader === null || t.score < bandLeader - rankBandEpsilon(bandLeader)) {
            rank++;
            bandLeader = t.score;
        }
        t.rank = rank;
    }
    return teams;
}

/**
 * Finds valid combinations of 3 teams (one per boss) with no shared units.
 * Uses a priority-based approach where teams are ranked per boss.
 * 
 * @param {Object} viableTeamsByBoss - Map of boss name -> array of {label, team, score}
 * @param {Array} bossNames - Array of 3 boss names in order
 * @returns {Array} Sorted array of valid combinations
 */
export function findExclusiveCombinations(viableTeamsByBoss, bossNames) {
    const combinations = [];
    
    const teams0 = viableTeamsByBoss[bossNames[0]] || [];
    const teams1 = viableTeamsByBoss[bossNames[1]] || [];
    const teams2 = viableTeamsByBoss[bossNames[2]] || [];
    
    // Assign ranks as epsilon-banded equivalence classes (1 = best band), not raw list
    // indices. Teams that score within noise of each other share a rank, so a fractional
    // score difference can no longer inflate maxRank and evict a better allocation.
    assignBandedRanks(teams0);
    assignBandedRanks(teams1);
    assignBandedRanks(teams2);
    
    // Limit to top N teams per boss for efficiency
    const TOP_N = 20;
    const top0 = teams0.slice(0, TOP_N);
    const top1 = teams1.slice(0, TOP_N);
    const top2 = teams2.slice(0, TOP_N);
    
    for (const t0 of top0) {
        for (const t1 of top1) {
            if (teamsOverlap(t0.team, t1.team)) continue;
            
            for (const t2 of top2) {
                if (teamsOverlap(t0.team, t2.team)) continue;
                if (teamsOverlap(t1.team, t2.team)) continue;
                
                const ranks = [t0.rank, t1.rank, t2.rank];
                const scores = [t0.score, t1.score, t2.score];
                const totalScore = scores.reduce((a, b) => a + b, 0);
                
                const rankSum = ranks.reduce((a, b) => a + b, 0);
                const maxRank = Math.max(...ranks);
                const priority = maxRank * 100 + rankSum;
                
                combinations.push({
                    totalScore,
                    priority,
                    rankSum,
                    maxRank,
                    assignments: [
                        { boss: bossNames[0], team: t0.team, label: t0.label, score: t0.score, rank: t0.rank, lenient: !!t0.lenient },
                        { boss: bossNames[1], team: t1.team, label: t1.label, score: t1.score, rank: t1.rank, lenient: !!t1.lenient },
                        { boss: bossNames[2], team: t2.team, label: t2.label, score: t2.score, rank: t2.rank, lenient: !!t2.lenient }
                    ]
                });
            }
        }
    }
    
    // Sort by priority (lower = better), then by total score (higher = better)
    combinations.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return b.totalScore - a.totalScore;
    });
    
    return combinations;
}

