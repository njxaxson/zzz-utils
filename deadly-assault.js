/**
 * Deadly Assault Team Builder for Zenless Zone Zero
 * 
 * Generates optimal team allocations for 3 DA bosses,
 * ensuring no unit overlap and matching teams to boss requirements.
 */

async function main() {
    // Dynamic imports for ES modules
    const { default: allUnits } = await import('./app/public/data/units.json', { with: { type: 'json' } });
    const { default: bosses } = await import('./app/public/data/bosses.json', { with: { type: 'json' } });
    const { default: myRoster } = await import('./roster.json', { with: { type: 'json' } });
    const { 
        getTeams, 
        sortTeamByRole, 
        getTeamLabel,
        teamsOverlap,
        extendTeamsWithUniversalUnits,
        findExclusiveCombinations
    } = await import('./app/public/lib/team-builder.js');
    const { scoreTeamForBoss } = await import('./app/public/lib/team-scorer.js');

    // ============================================================================
    // COMMAND-LINE ARGUMENTS
    // ============================================================================

    function parseArgs() {
        const args = process.argv.slice(2);
        const options = {
            bossFilter: null,   // Case-insensitive boss name filter (contains match)
            depth: 5,           // Number of solution sets to display
            onlyMine: false,    // Filter to personal roster units
            preview: false,     // Include preview/unavailable units
            debug: false,       // Enable debug logging for scoring
            units: null,        // Comma-separated list of unit names (replaces roster)
            exclude: null,      // Comma-separated list of unit names to exclude
            include: null,      // Comma-separated list of unit names that must appear in solution
            flex: null          // Comma-separated list of flex/universal unit names
        };
        
        for (let i = 0; i < args.length; i++) {
            // Check for shorthand depth format: -5, -10, etc.
            const depthMatch = args[i].match(/^-(\d+)$/);
            if (depthMatch) {
                options.depth = parseInt(depthMatch[1], 10);
            } else if (args[i] === '--depth' && args[i + 1]) {
                options.depth = parseInt(args[i + 1], 10);
                i++;
            } else if ((args[i] === '--bosses' || args[i] === '-b') && args[i + 1]) {
                options.bossFilter = args[i + 1].toLowerCase();
                i++;
            } else if (args[i] === '--only-mine' || args[i] === '-m') {
                options.onlyMine = true;
            } else if (args[i] === '--preview' || args[i] === '-p') {
                options.preview = true;
            } else if (args[i] === '--debug' || args[i] === '-d') {
                options.debug = true;
            } else if ((args[i] === '--units' || args[i] === '-u') && args[i + 1]) {
                options.units = args[i + 1].split(',').map(u => u.trim());
                i++;
            } else if ((args[i] === '--exclude' || args[i] === '-x') && args[i + 1]) {
                options.exclude = args[i + 1].split(',').map(u => u.trim());
                i++;
            } else if ((args[i] === '--include' || args[i] === '-i') && args[i + 1]) {
                options.include = args[i + 1].split(',').map(u => u.trim());
                i++;
            } else if ((args[i] === '--flex' || args[i] === '-f') && args[i + 1]) {
                options.flex = args[i + 1].split(',').map(u => u.trim());
                i++;
            }
        }
        
        return options;
    }

    const CLI = parseArgs();
    const DEBUG_MATCHUPS = CLI.debug;

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    // Validate boss filter - must match exactly 3 bosses
    if (!CLI.bossFilter) {
        console.error("ERROR: Boss filter required. Use --bosses/-b <filter> to specify bosses.");
        console.log("Example: node deadly-assault.js -b butch,ucc,pomp");
        console.log("\nAvailable bosses:");
        bosses.forEach(b => console.log(`  - ${b.name}`));
        return;
    }

    // Parse boss filter (comma-separated for multiple filters)
    const bossFilters = CLI.bossFilter.split(',').map(f => f.trim().toLowerCase());
    const SELECTED_BOSSES = [];
    
    for (const filter of bossFilters) {
        const matches = bosses.filter(b => 
            b.name.toLowerCase().includes(filter) ||
            (b.shortName && b.shortName.toLowerCase().includes(filter)) ||
            (b.id && b.id.toLowerCase().includes(filter))
        );
        for (const match of matches) {
            if (!SELECTED_BOSSES.includes(match.name)) {
                SELECTED_BOSSES.push(match.name);
            }
        }
    }

    if (SELECTED_BOSSES.length !== 3) {
        console.error(`ERROR: Boss filter must match exactly 3 bosses. Found ${SELECTED_BOSSES.length}:`);
        SELECTED_BOSSES.forEach(name => console.log(`  - ${name}`));
        if (SELECTED_BOSSES.length < 3) {
            console.log("\nAvailable bosses:");
            bosses.forEach(b => console.log(`  - ${b.name}`));
        }
        return;
    }

    // Maximum number of team combinations to display
    const RESULT_LIMIT = CLI.depth;

    // Units to exclude from consideration
    let EXCLUDED_UNITS = [];
    if (CLI.exclude && CLI.exclude.length > 0) {
        EXCLUDED_UNITS = CLI.exclude;
        console.log(`Excluding units: ${EXCLUDED_UNITS.join(', ')}`);
    }

    // Log include requirement if specified
    if (CLI.include && CLI.include.length > 0) {
        console.log(`Solutions must include at least one of: ${CLI.include.join(', ')}`);
    }

    // Flex/universal units: Can join ANY 2-person team to form a 3-person team
    const UNIVERSAL_UNITS = CLI.flex || ["Nicole"];

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
     * - There exists a swap that includes a missing Tier 0 unit
     * - AND the swap has a BETTER score than the current team
     * - AND doesn't conflict with other teams
     * 
     * This is less aggressive than the original version which filtered
     * any combination missing a Tier 0 unit.
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
        
        // For each missing Tier 0 unit, check if we could IMPROVE by swapping them in
        for (const missingUnit of missingTier0) {
            // For each boss assignment, check if there's a BETTER team with this unit
            for (let i = 0; i < combination.assignments.length; i++) {
                const assignment = combination.assignments[i];
                const bossName = assignment.boss;
                const currentScore = assignment.score;
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
                // 3. Has a BETTER score than the current team (strict improvement)
                for (const candidateTeam of viableTeams) {
                    // Must have better score to be a strict improvement
                    if (candidateTeam.score <= currentScore) continue;
                    
                    const hasUnit = candidateTeam.team.some(u => u.id === missingUnit.id);
                    if (!hasUnit) continue;
                    
                    // Check for conflicts with other teams
                    const hasConflict = candidateTeam.team.some(u => otherTeamUnitIds.has(u.id));
                    if (hasConflict) continue;
                    
                    // Found a strictly better swap - this combination is dominated
                    return {
                        dominated: true,
                        reason: `Could use ${candidateTeam.label} (${candidateTeam.score}) for ${bossName.replace("Notorious ", "")} instead of ${assignment.label} (${currentScore}) to include ${missingUnit.name}`
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
    
    // Build roster based on CLI options
    let availableUnits;
    
    if (CLI.units && CLI.units.length > 0) {
        // --units/-u: Use specified units only (replaces full roster)
        availableUnits = allUnits.filter(u => CLI.units.includes(u.name));
        console.log(`Unit whitelist: ${CLI.units.join(', ')}`);
    } else {
        // Default: use all units
        availableUnits = [...allUnits];
    }
    
    // Add developer units if any
    if (DEVELOPER_UNITS && DEVELOPER_UNITS.length > 0) {
        availableUnits = availableUnits.concat(DEVELOPER_UNITS);
        if (DEBUG_MATCHUPS) console.log(`Developer units added: ${DEVELOPER_UNITS.map(u => u.name).join(", ")}`);
    }
    
    // --only-mine/-m: Filter to personal roster (applied on top of other filters)
    if (CLI.onlyMine) {
        const beforeCount = availableUnits.length;
        availableUnits = availableUnits.filter(u => myRoster.hasOwnProperty(u.name));
        console.log(`Personal roster filter: ${availableUnits.length} units (from ${beforeCount})`);
    }
    
    // --preview/-p: Filter out unavailable units unless preview flag is set
    if (!CLI.preview) {
        const beforeCount = availableUnits.length;
        availableUnits = availableUnits.filter(u => u.available !== false);
        const filteredCount = beforeCount - availableUnits.length;
        if (filteredCount > 0) {
            console.log(`Filtered out ${filteredCount} preview/unavailable unit(s) (use --preview to include)`);
        }
    }
    
    // --exclude/-x: Apply blacklist
    availableUnits = availableUnits.filter(u => !EXCLUDED_UNITS.includes(u.name));
    
    if (DEBUG_MATCHUPS) {
        const modeNote = CLI.units ? " (whitelist mode)" : (CLI.onlyMine ? " (personal roster)" : "");
        console.log(`Using ${availableUnits.length} units${modeNote}\n`);
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
            const score = scoreTeamForBoss(team, boss, { debug: CLI.debug });
            
            if (score > 0) {
                viableTeamsByBoss[boss.name].push({ label, team, score });
            }
        }
        
        // Fallback: if no viable teams, rescore with lenient mode
        if (viableTeamsByBoss[boss.name].length === 0) {
            lenientBosses.push(boss.name);
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const score = scoreTeamForBoss(team, boss, { lenient: true, debug: CLI.debug });
                
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
    
    // --include/-i: Filter to combinations that include at least one required unit
    if (CLI.include && CLI.include.length > 0) {
        const beforeIncludeFilter = combinations.length;
        combinations = combinations.filter(combo => {
            // Get all units in this solution set
            const allUnitsInSolution = new Set();
            for (const assignment of combo.assignments) {
                for (const unit of assignment.team) {
                    allUnitsInSolution.add(unit.name);
                }
            }
            // Check if at least one required unit is present
            return CLI.include.some(requiredUnit => allUnitsInSolution.has(requiredUnit));
        });
        const includeFilteredCount = beforeIncludeFilter - combinations.length;
        if (DEBUG_MATCHUPS && includeFilteredCount > 0) {
            console.log(`Include filter removed ${includeFilteredCount} combinations`);
        }
    }
    
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
        console.log(`Use --depth or -N to see more (e.g., -10 for top 10).`);
    }
}

main().catch(console.error);
