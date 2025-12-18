/**
 * Shared team-building logic for Zenless Zone Zero
 * Generates all valid 2-3 character teams based on unit join conditions
 * 
 * Browser-compatible ES module version
 */

/**
 * Generates all valid team combinations from a list of units.
 * A team is valid if each unit's "join" conditions are met by at least one teammate.
 * 
 * @param {Array} units - Array of unit objects with id, name, tags, and join properties
 * @returns {Object} Map of team label strings to team arrays
 */
export function getTeams(units) {
    // Assign unique ids using powers of 2 for easy combination tracking
    for (let i = 0, n = units.length; i < n; i++) {
        units[i].numericId = 2 ** i;
    }
    
    let permutations = {};
    
    // Find all valid team combinations
    for (const unitA of units) {
        for (const unitB of units) {
            if (unitA.numericId == unitB.numericId) continue;
            
            let ab = unitA.join.some(tag => unitB.tags.includes(tag));
            if (ab) {
                let ba = unitB.join.some(tag => unitA.tags.includes(tag));
                if (ba) {
                    // If mutual, a pair team is sufficient
                    permutations[unitA.numericId + unitB.numericId] = [unitA, unitB];
                }
                
                for (const unitC of units) {
                    if (unitA.numericId == unitC.numericId || unitB.numericId == unitC.numericId) continue;
                    
                    let ac = unitA.join.some(tag => unitC.tags.includes(tag));
                    let bc = unitB.join.some(tag => unitC.tags.includes(tag));
                    let ca = unitC.join.some(tag => unitA.tags.includes(tag));
                    let cb = unitC.join.some(tag => unitB.tags.includes(tag));
                    
                    let a = ab || ac;
                    let b = ba || bc;
                    let c = ca || cb;
                    
                    if (a && b && c) {
                        permutations[unitA.numericId + unitB.numericId + unitC.numericId] = [unitA, unitB, unitC];
                    }
                }
            }
        }
    }

    // Sort individual teams conventionally by role
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
 * Order: stun, anomaly, attack, rupture, defense, support
 */
export const ROLE_ORDER = ["stun", "anomaly", "attack", "rupture", "defense", "support"];

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
 * Checks if two teams share any units (based on numericId assigned by getTeams)
 */
export function teamsOverlap(team1, team2) {
    const ids1 = new Set(team1.map(u => u.numericId));
    for (const unit of team2) {
        if (ids1.has(unit.numericId)) return true;
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
        const teamUnitIds = new Set(team.map(u => u.numericId));
        
        for (const universalUnit of universalUnits) {
            // Skip if this unit is already on the team
            if (teamUnitIds.has(universalUnit.numericId)) continue;
            
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
    
    // Assign ranks (1 = best, 2 = second best, etc.)
    teams0.forEach((t, i) => t.rank = i + 1);
    teams1.forEach((t, i) => t.rank = i + 1);
    teams2.forEach((t, i) => t.rank = i + 1);
    
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
                        { boss: bossNames[0], team: t0.team, label: t0.label, score: t0.score, rank: t0.rank },
                        { boss: bossNames[1], team: t1.team, label: t1.label, score: t1.score, rank: t1.rank },
                        { boss: bossNames[2], team: t2.team, label: t2.label, score: t2.score, rank: t2.rank }
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

