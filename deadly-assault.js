/**
 * Deadly Assault Team Builder for Zenless Zone Zero
 * 
 * Generates optimal team allocations for 3 DA bosses,
 * ensuring no unit overlap and matching teams to boss requirements.
 */

const allUnits = require('./app/public/data/units.json');
const bosses = require('./app/public/data/bosses.json');
const myRoster = require('./roster.json'); // Map of unit name -> stat (e.g., "M6W5")
const { 
    getTeams, 
    sortTeamByRole, 
    getTeamLabel,
    teamsOverlap,
    extendTeamsWithUniversalUnits,
    findExclusiveCombinations
} = require('./lib/team-builder.js');
const { scoreTeamForBoss } = require('./lib/team-scorer.js');

// ============================================================================
// CONFIGURATION - Modify these values as needed
// ============================================================================

// Specify which 3 bosses to analyze (use exact names from bosses.json)
const SELECTED_BOSSES = [
    "Notorious Dead End Butcher",
    "Unknown Corruption Complex",
    //"Notorious Marionettes",
    "Notorious Pompey",
    //"Typhon Slugger",
    //"Sacrifice Bringer",
    //"Miasma Priest",
    //"Miasmic Fiend Unfathomable",
    // "The Defiler",
    // "Wandering Hunter",
    // "Thrall & Sobek",
];

// Maximum number of team combinations to display
const RESULT_LIMIT = 5;

// Set to true to show top teams per boss (for debugging)
// Can also be enabled via command line: node deadly-assault.js --debug
const DEBUG_MATCHUPS_CONFIG = false;
const DEBUG_MATCHUPS = DEBUG_MATCHUPS_CONFIG || process.argv.includes('--debug');

// Units to exclude from consideration (not good enough to include)
const EXCLUDED_UNITS = [
    // "Anby",
    // "Anton",
    // "Ben",
    // "Billy",
    // "Corin",
    // "Seth"
];

// Optional: Specify a subset of units to use (whitelist)
// If empty/undefined, all units in units.json will be available (minus excluded)
// Example: Only A-ranks and standard S-ranks
const INCLUDED_UNITS = [
    // "Anby",
    // "Anton",
    // "Ben",
    // "Billy",
    // "Corin",
    // "Grace",
    // "Koleda",
    // "Komano",
    // "Lucy",
    // "Lycaon",
    // "Nekomata",
    // "Nicole",
    // "Pan Yinhu",
    // "Piper",
    // "Pulchra",
    // "Rina",
    // "Seth",
    // "Soldier 11",
    // "Soukaku",
];

// Universal units: Can join ANY 2-person team to form a 3-person team,
// even if they don't satisfy normal join conditions.
// Useful for strong support units with limited join options (e.g., Nicole)
const UNIVERSAL_UNITS = [
    "Nicole",
    "Astra"
];

// Developer-only: Additional units not in units.json
// Useful for testing unreleased characters, characters you don't own, or hypothetical units
const DEVELOPER_UNITS = [
    // {
    //     "name" : "Ye Shunguong",
    //     "rank" : "S",
    //     "limited" : true,
    //     "tier" : 0,
    //     "tags" : ["attack", "physical", "yunkui", "title", "assist:defensive"],
    //     "join" : ["support", "defense"],
    //     "stat" : "M2W1",
    //     "synergy" : { "units": ["Zhao", "Lucia"], "tags": [], "avoid": [] }
    // },
    // {
    //     "name" : "Zhao",
    //     "rank" : "S",
    //     "limited" : true,
    //     "tier" : 1.0,
    //     "tags" : ["defense", "ice", "krampus", "assist:defensive"],
    //     "join" : ["attack", "anomaly", "rupture"],
    //     "stat" : "M0W0",
    //     "synergy" : { "units": ["Ye Shunguong"], "tags": ["rupture"], "avoid": [] }
    // },
];

// ============================================================================
// TIER 0 SANITY CHECK
// ============================================================================

const DPS_ROLES = ["attack", "anomaly", "rupture"];
const ELEMENTS = ["fire", "ice", "electric", "physical", "ether"];

/**
 * Analyzes a combination for Tier 0 unit utilization.
 * Returns warnings/notes if key units are missing.
 * 
 * Rules:
 * - Tier 0 supports should be used UNLESS their synergy.avoid conflicts with ALL teams
 * - Tier 0 DPS should be used if their element matches any boss weakness (and not anti'd)
 */
function checkTier0Utilization(combination, availableUnits, selectedBosses, bosses) {
    const warnings = [];
    const notes = [];
    
    // Get all units used in this combination
    const usedUnits = new Set();
    for (const assignment of combination.assignments) {
        for (const unit of assignment.team) {
            usedUnits.add(unit.name);
        }
    }
    
    // Get DPS types present in the combination
    const dpsTypesInCombo = new Set();
    for (const assignment of combination.assignments) {
        for (const unit of assignment.team) {
            for (const role of DPS_ROLES) {
                if (unit.tags.includes(role)) {
                    dpsTypesInCombo.add(role);
                }
            }
        }
    }
    
    // Get available Tier 0 units
    const tier0Units = availableUnits.filter(u => u.tier === 0);
    const tier0Supports = tier0Units.filter(u => u.tags.includes("support"));
    const tier0DPS = tier0Units.filter(u => DPS_ROLES.some(role => u.tags.includes(role)));
    
    // Check Tier 0 Supports
    for (const support of tier0Supports) {
        if (usedUnits.has(support.name)) continue;
        
        // Check if this support's synergy.avoid conflicts with ALL DPS types in combo
        const avoidTags = support.synergy?.avoid || [];
        
        if (avoidTags.length === 0) {
            // No restrictions - this support should definitely be used
            warnings.push(`⚠️  ${support.name} (Tier 0 support, no restrictions) is not used`);
        } else {
            // Check if there's ANY DPS type in combo that this support doesn't avoid
            const canFitSomewhere = [...dpsTypesInCombo].some(dpsType => !avoidTags.includes(dpsType));
            
            if (canFitSomewhere) {
                // There's a team this support could join but wasn't used
                const compatibleTypes = [...dpsTypesInCombo].filter(t => !avoidTags.includes(t));
                warnings.push(`⚠️  ${support.name} (Tier 0 support) not used despite compatible teams (${compatibleTypes.join("/")})`);
            }
            // If canFitSomewhere is false, it's expected this support isn't used
        }
    }
    
    // Check Tier 0 DPS
    const bossData = selectedBosses.map(name => bosses.find(b => b.name === name));
    
    for (const dps of tier0DPS) {
        if (usedUnits.has(dps.name)) continue;
        
        const dpsElement = dps.tags.find(t => ELEMENTS.includes(t));
        const dpsType = dps.tags.find(t => DPS_ROLES.includes(t));
        
        // Find bosses that could use this DPS (weakness match + not anti'd)
        const matchingBosses = bossData.filter(boss => {
            const weaknessMatch = boss.weaknesses.includes(dpsElement);
            const notAnti = !boss.anti || !boss.anti.includes(dpsType);
            return weaknessMatch && notAnti;
        });
        
        if (matchingBosses.length > 0) {
            const bossNames = matchingBosses.map(b => 
                b.name.replace("Notorious ", "").substring(0, 15)
            ).join(", ");
            notes.push(`ℹ️  ${dps.name} (Tier 0 ${dpsType}) not used but matches weakness for: ${bossNames}`);
        }
    }
    
    // Summary: count how many Tier 0 units are used
    const tier0Used = [...usedUnits].filter(name => {
        const unit = availableUnits.find(u => u.name === name);
        return unit && unit.tier === 0;
    }).length;
    
    const tier0Available = tier0Units.length;
    
    return {
        warnings,
        notes,
        tier0Used,
        tier0Available,
        usedUnits: [...usedUnits]
    };
}

// ============================================================================
// DOMINANCE CHECK
// ============================================================================

/**
 * Checks if a combination is dominated by a better alternative.
 * A combination is dominated if:
 * - It's missing a Tier 0 unit
 * - There exists a team with that Tier 0 unit for some boss
 * - That team doesn't conflict with the other teams in the combination
 * 
 * This means we could improve the combination by swapping in the better team,
 * so the current combination is strictly worse and should be filtered out.
 */
function isDominatedCombination(combination, viableTeamsByBoss, availableUnits) {
    // Get all units used in this combination
    const usedUnitIds = new Set();
    for (const assignment of combination.assignments) {
        for (const unit of assignment.team) {
            usedUnitIds.add(unit.id);
        }
    }
    
    // Get Tier 0 units that are NOT used
    const tier0Units = availableUnits.filter(u => u.tier === 0);
    const missingTier0 = tier0Units.filter(u => !usedUnitIds.has(u.id));
    
    if (missingTier0.length === 0) {
        // All Tier 0 units are used - not dominated
        return { dominated: false };
    }
    
    // For each missing Tier 0 unit, check if we could fit them
    for (const missingUnit of missingTier0) {
        // For each boss assignment, check if there's a team with this unit
        for (let i = 0; i < combination.assignments.length; i++) {
            const assignment = combination.assignments[i];
            const bossName = assignment.boss;
            const viableTeams = viableTeamsByBoss[bossName] || [];
            
            // Get the other two teams' unit IDs (to check for conflicts)
            const otherTeamUnitIds = new Set();
            for (let j = 0; j < combination.assignments.length; j++) {
                if (j !== i) {
                    for (const unit of combination.assignments[j].team) {
                        otherTeamUnitIds.add(unit.id);
                    }
                }
            }
            
            // Find a team for this boss that:
            // 1. Contains the missing Tier 0 unit
            // 2. Doesn't conflict with the other two teams
            // 3. Has a score >= current team's score (or at least is viable)
            for (const candidateTeam of viableTeams) {
                const hasUnit = candidateTeam.team.some(u => u.id === missingUnit.id);
                if (!hasUnit) continue;
                
                // Check for conflicts with other teams
                const hasConflict = candidateTeam.team.some(u => otherTeamUnitIds.has(u.id));
                if (hasConflict) continue;
                
                // Found a valid swap - this combination is dominated
                return {
                    dominated: true,
                    reason: `Could use ${candidateTeam.label} for ${bossName.replace("Notorious ", "")} to include ${missingUnit.name}`
                };
            }
        }
    }
    
    return { dominated: false };
}

// ============================================================================
// COMBINATION FINDER (uses shared functions from team-builder.js)
// ============================================================================

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main() {
    console.log("===== Deadly Assault Team Builder =====\n");
    
    // Validate selected bosses
    const selectedBossObjects = [];
    for (const bossName of SELECTED_BOSSES) {
        const boss = bosses.find(b => b.name === bossName);
        if (!boss) {
            console.error(`ERROR: Boss "${bossName}" not found in bosses.json`);
            console.log("Available bosses:");
            bosses.forEach(b => console.log(`  - ${b.name}`));
            return;
        }
        selectedBossObjects.push(boss);
    }
    
    console.log("Selected Bosses:");
    for (const boss of selectedBossObjects) {
        if (DEBUG_MATCHUPS) {
            const weakStr = boss.weaknesses.join(", ") || "none";
            const resStr = boss.resistances.join(", ") || "none";
            const shillStr = boss.shill || "none";
            console.log(`  ${boss.name}`);
            console.log(`    Weak: ${weakStr} | Resist: ${resStr} | Shill: ${shillStr} | Assists: ${boss.assists}`);
        } else {
            console.log(`  - ${boss.name}`);
        }
    }
    console.log();
    
    // Start with base units - filter by roster.json for personal roster, or use all units
    // const baseUnits = allUnits.filter(u => myRoster.hasOwnProperty(u.name)); // Personal roster
    const baseUnits = [...allUnits]; // Full roster
    let availableUnits = [...baseUnits];
    
    // Add developer units if any
    if (DEVELOPER_UNITS && DEVELOPER_UNITS.length > 0) {
        availableUnits = availableUnits.concat(DEVELOPER_UNITS);
        if (DEBUG_MATCHUPS) console.log(`Developer units added: ${DEVELOPER_UNITS.map(u => u.name).join(", ")}`);
    }
    
    // Apply whitelist if specified
    if (INCLUDED_UNITS && INCLUDED_UNITS.length > 0) {
        availableUnits = availableUnits.filter(u => INCLUDED_UNITS.includes(u.name));
        if (DEBUG_MATCHUPS) console.log(`Whitelist active: ${INCLUDED_UNITS.length} units specified`);
    }
    
    // Apply blacklist
    availableUnits = availableUnits.filter(u => !EXCLUDED_UNITS.includes(u.name));
    
    if (DEBUG_MATCHUPS) {
        const whitelistNote = (INCLUDED_UNITS && INCLUDED_UNITS.length > 0) ? " (whitelist mode)" : "";
        console.log(`Using ${availableUnits.length} units${whitelistNote}\n`);
    }
    
    // Generate all valid teams (includes 2-person and 3-person teams)
    const allTeams = getTeams(availableUnits);
    
    // Separate 2-person and 3-person teams
    // Labels from getTeams() are already normalized by role order
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
    
    // Extend 2-person teams with universal units
    const universalUnitObjects = availableUnits.filter(u => UNIVERSAL_UNITS.includes(u.name));
    
    if (universalUnitObjects.length > 0) {
        if (DEBUG_MATCHUPS) console.log(`Universal units: ${universalUnitObjects.map(u => u.name).join(", ")}`);
        
        const extendedTeamCount = extendTeamsWithUniversalUnits(twoCharTeams, threeCharTeams, universalUnitObjects);
        
        if (DEBUG_MATCHUPS && extendedTeamCount > 0) {
            console.log(`Extended ${extendedTeamCount} teams using universal units`);
        }
    }
    
    const teamLabels = Object.keys(threeCharTeams);
    if (DEBUG_MATCHUPS) console.log(`Total 3-character teams: ${teamLabels.length}\n`);
    
    // Score teams for each boss
    const viableTeamsByBoss = {};
    const lenientBosses = []; // Track bosses that needed fallback mode
    
    for (const boss of selectedBossObjects) {
        viableTeamsByBoss[boss.name] = [];
        
        // First pass: normal scoring
        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            const score = scoreTeamForBoss(team, boss);
            
            if (score > 0) {
                viableTeamsByBoss[boss.name].push({ label, team, score });
            }
        }
        
        // Fallback: if no viable teams, rescore with lenient mode
        if (viableTeamsByBoss[boss.name].length === 0) {
            lenientBosses.push(boss.name);
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const score = scoreTeamForBoss(team, boss, { lenient: true });
                
                if (score > 0) {
                    viableTeamsByBoss[boss.name].push({ label, team, score, lenient: true });
                }
            }
        }
        
        // Sort by score descending
        viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);
        
        if (DEBUG_MATCHUPS) {
            const lenientNote = lenientBosses.includes(boss.name) ? " (LENIENT)" : "";
            console.log(`${boss.name}: ${viableTeamsByBoss[boss.name].length} viable teams${lenientNote}`);
        }
    }
    
    if (lenientBosses.length > 0) {
        console.log(`⚠️  No on-element DPS for: ${lenientBosses.join(", ")} - using fallback mode`);
    }
    if (DEBUG_MATCHUPS) console.log();
    
    // Display top teams per boss for verification (debug mode only)
    if (DEBUG_MATCHUPS) {
        console.log("===== Top Teams Per Boss =====\n");
        const TOP_DISPLAY = 7;
        for (const boss of selectedBossObjects) {
            console.log(`${boss.name}:`);
            const topTeams = viableTeamsByBoss[boss.name].slice(0, TOP_DISPLAY);
            topTeams.forEach((t, i) => {
                console.log(`  #${i + 1}: ${t.label} (${t.score.toFixed(1)})`);
            });
            console.log();
        }
    }
    
    // Find exclusive combinations
    let combinations = findExclusiveCombinations(viableTeamsByBoss, SELECTED_BOSSES);
    const totalCombos = combinations.length;
    
    // Filter out dominated combinations
    // A combo is dominated if we could swap in a team with more Tier 0 units without conflicts
    combinations = combinations.filter(combo => {
        const result = isDominatedCombination(combo, viableTeamsByBoss, availableUnits);
        combo.dominanceCheck = result;
        return !result.dominated;
    });
    
    const dominatedCount = totalCombos - combinations.length;
    
    // Apply sanity check for remaining combinations
    for (const combo of combinations) {
        const check = checkTier0Utilization(combo, availableUnits, SELECTED_BOSSES, bosses);
        combo.sanityCheck = check;
        
        // Add penalty for warnings (unused Tier 0 support with no excuse)
        combo.priority += check.warnings.length * 1000;
    }
    
    // Re-sort with sanity penalties applied
    combinations.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return b.totalScore - a.totalScore;
    });
    
    if (DEBUG_MATCHUPS) {
        console.log(`Found ${combinations.length} valid team allocations (${dominatedCount} dominated removed)\n`);
    }
    
    if (combinations.length === 0) {
        console.log("No valid combinations found. Try different bosses or expand your unit pool.");
        return;
    }
    
    // Display results
    const displayCount = Math.min(RESULT_LIMIT, combinations.length);
    console.log(`===== Top ${displayCount} Team Allocations =====\n`);
    
    for (let i = 0; i < displayCount; i++) {
        const combo = combinations[i];
        const ranksUsed = combo.assignments.map(a => a.rank).join('+');
        console.log(`Combination #${i + 1} (Ranks: ${ranksUsed}, Total: ${combo.totalScore.toFixed(0)})`);
        
        for (const assignment of combo.assignments) {
            // Shorten boss name for display
            const shortBoss = assignment.boss.replace("Notorious ", "").substring(0, 20).padEnd(20);
            console.log(`  ${shortBoss}: [#${assignment.rank}] ${assignment.label} (${assignment.score})`);
        }
        
        // Display cached sanity check results
        const check = combo.sanityCheck;
        
        if (check.warnings.length > 0 || check.notes.length > 0) {
            console.log(`  --- Tier 0 Check (${check.tier0Used}/${check.tier0Available} used) ---`);
            for (const warning of check.warnings) {
                console.log(`  ${warning}`);
            }
            for (const note of check.notes) {
                console.log(`  ${note}`);
            }
        } else {
            console.log(`  ✓ Tier 0 utilization: ${check.tier0Used}/${check.tier0Available}`);
        }
        
        console.log();
    }
    
    if (combinations.length > RESULT_LIMIT) {
        console.log(`... and ${combinations.length - RESULT_LIMIT} more combinations.`);
        console.log(`Increase RESULT_LIMIT to see more.`);
    }
}

main();
