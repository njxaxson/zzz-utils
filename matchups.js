/**
 * Team Matchups for Zenless Zone Zero
 * 
 * Shows the top teams for EVERY boss, allowing verification of 
 * team ranking algorithm across all matchups at once.
 */

async function main() {
    // Dynamic imports for ES modules
    const { default: allUnits } = await import('./app/public/data/units.json', { with: { type: 'json' } });
    const { default: bosses } = await import('./app/public/data/bosses.json', { with: { type: 'json' } });
    const { default: myRoster } = await import('./roster.json', { with: { type: 'json' } });
    const { getTeams, sortTeamByRole, getTeamLabel, extendTeamsWithUniversalUnits } = await import('./app/public/lib/team-builder.js');
    const { scoreTeamForBoss } = await import('./app/public/lib/team-scorer.js');

    // ============================================================================
    // BUILD ROSTERS
    // ============================================================================

    // Full roster: all units from the master units.json
    const fullRoster = [...allUnits];

    // Personal roster: units from allUnits filtered by roster.json
    const myUnits = allUnits.filter(u => myRoster.hasOwnProperty(u.name));

    // ============================================================================
    // COMMAND-LINE ARGUMENTS
    // ============================================================================

    function parseArgs() {
        const args = process.argv.slice(2);
        const options = {
            filter: null,   // Case-insensitive boss name filter (contains match)
            depth: 20,      // Number of top teams to display per boss
            onlyMine: false, // Use only personal roster units
            preview: false, // Include preview/unavailable units
            debug: false,   // Enable debug logging for scoring
            units: null,    // Comma-separated list of unit names to include (for debugging)
            exclude: null,  // Comma-separated list of unit names to exclude
            include: null   // Comma-separated list of unit names that teams must include
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
                options.filter = args[i + 1].toLowerCase();
                i++;
            } else if (args[i] === '--only-mine' || args[i] == '-m') {
                options.onlyMine = true;
            } else if (args[i] === '--preview' || args[i] == '-p') {
                options.preview = true;
            } else if (args[i] === '--debug' || args[i] == '-d') {
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
            }
        }
        
        return options;
    }

    const CLI_OPTIONS = parseArgs();

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    const TOP_TEAMS_PER_BOSS = CLI_OPTIONS.depth;

    let EXCLUDED_UNITS = [
        // "Anby",
        // "Anton",
        // "Ben",
        // "Billy",
        // "Corin",
        // "Seth"
    ];
    
    // Merge command-line excluded units with hardcoded exclusions
    if (CLI_OPTIONS.exclude && CLI_OPTIONS.exclude.length > 0) {
        EXCLUDED_UNITS.push(...CLI_OPTIONS.exclude);
        console.log(`Excluding units: ${CLI_OPTIONS.exclude.join(', ')}`);
    }
    
    // Log included units requirement if specified
    if (CLI_OPTIONS.include && CLI_OPTIONS.include.length > 0) {
        console.log(`Teams must include at least one of: ${CLI_OPTIONS.include.join(', ')}`);
    }

    // Optional: Specify a subset of units to use (whitelist)
    // Use one of the following options:
    let INCLUDED_UNITS;
    if (CLI_OPTIONS.units) {
        // Debug mode: use only specified units
        INCLUDED_UNITS = CLI_OPTIONS.units;
        console.log(`Debug unit filter: ${INCLUDED_UNITS.join(', ')}`);
    } else if (CLI_OPTIONS.onlyMine) {
        // Personal roster (from roster.json) - when --only-mine flag is used
        INCLUDED_UNITS = myUnits.map(u => u.name);
    } else {
        // Full roster (all units)
        INCLUDED_UNITS = allUnits.map(u => u.name);
    }
    //const INCLUDED_UNITS = ["Lighter", "Koleda", "Banyue", "Lucy", "Ceasar", "Lucia"];       // Custom list

    // Universal units: Can join ANY 2-person team to form a 3-person team
    const UNIVERSAL_UNITS = [
        "Nicole",
    ];

    const NEUTRAL_BOSS = {
        name: 'Synthetic Neutral Boss',
        weaknesses: [],
        resistances: [],
        shill: null,
        anti: [],
        favored: [],
        assists: 0
    };
    bosses.push(NEUTRAL_BOSS);

    // ============================================================================
    // MAIN EXECUTION
    // ============================================================================

    console.log("===== Team Matchups - All Bosses =====\n");
    console.log(`Full roster: ${fullRoster.length} characters\n`);
    
    // Filter units based on whitelist (if specified) and blacklist
    let availableUnits = fullRoster;
    
    if (INCLUDED_UNITS && INCLUDED_UNITS.length > 0) {
        availableUnits = availableUnits.filter(u => INCLUDED_UNITS.includes(u.name));
        console.log(`Whitelist active: ${INCLUDED_UNITS.length} units specified`);
    }
    
    availableUnits = availableUnits.filter(u => !EXCLUDED_UNITS.includes(u.name));
    
    // Filter out preview/unavailable units unless --preview flag is set
    if (!CLI_OPTIONS.preview) {
        const beforeCount = availableUnits.length;
        availableUnits = availableUnits.filter(u => u.available !== false);
        const filteredCount = beforeCount - availableUnits.length;
        if (filteredCount > 0) {
            console.log(`Filtered out ${filteredCount} preview/unavailable unit(s) (use --preview to include)`);
        }
    }
    
    const whitelistNote = (INCLUDED_UNITS && INCLUDED_UNITS.length > 0) ? " (whitelist mode)" : "";
    console.log(`Using ${availableUnits.length} units${whitelistNote}\n`);
    
    // Generate all valid teams (includes 2-person and 3-person teams)
    const allTeams = getTeams(availableUnits);
    
    // Separate 2-person and 3-person teams
    const twoCharTeams = {};
    const threeCharTeams = {};
    for (const label in allTeams) {
        if (allTeams[label].length === 2) {
            twoCharTeams[label] = allTeams[label];
        } else if (allTeams[label].length === 3) {
            threeCharTeams[label] = allTeams[label];
        }
    }
    // console.log("Trio Teams:")
    // Object.keys(threeCharTeams).forEach(label => console.log(`\t${label}`));
    // console.log("Due Teams:")
    // Object.keys(twoCharTeams).forEach(label => console.log(`\t${label}`));
    
    // Extend 2-person teams with universal units
    const universalUnitObjects = availableUnits.filter(u => UNIVERSAL_UNITS.includes(u.name));
    
    if (universalUnitObjects.length > 0) {
        console.log(`Universal units: ${universalUnitObjects.map(u => u.name).join(", ")}`);
        
        const extendedTeamCount = extendTeamsWithUniversalUnits(twoCharTeams, threeCharTeams, universalUnitObjects);
        
        if (extendedTeamCount > 0) {
            console.log(`Extended ${extendedTeamCount} teams using universal units`);
        }
    }
    
    const teamLabels = Object.keys(threeCharTeams);
    console.log(`Total 3-character teams: ${teamLabels.length}\n`);
    console.log("=".repeat(60) + "\n");
    // teamLabels.forEach(label => console.log(`\t${label}`));
    
    // Filter bosses if --filter specified
    let filteredBosses = 
        bosses;
        //[NEUTRAL_BOSS];
    if (CLI_OPTIONS.filter) {
        filteredBosses = bosses.filter(b => 
            b.name.toLowerCase().includes(CLI_OPTIONS.filter) ||
            (b.shortName && b.shortName.toLowerCase().includes(CLI_OPTIONS.filter)) ||
            (b.id && b.id.toLowerCase().includes(CLI_OPTIONS.filter))
        );
        console.log(`Boss filter: "${CLI_OPTIONS.filter}" (${filteredBosses.length} matches)\n`);
    }
    
    // Process each boss
    for (const boss of filteredBosses) {
        const weakStr = boss.weaknesses.join(", ") || "none";
        const resistStr = boss.resistances.join(", ") || "none";
        const shillStr = boss.shill || "none";
        const antiStr = boss.anti?.join(", ") || "none";
        
        console.log(boss.name);
        console.log(`  Weak: ${weakStr} | Resist: ${resistStr} | Shill: ${shillStr} | Anti: ${antiStr} | Assists: ${boss.assists}`);
        
        // Score all teams for this boss
        const viableTeams = [];
        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            
            // Skip teams that don't include at least one required unit
            if (CLI_OPTIONS.include && CLI_OPTIONS.include.length > 0) {
                const teamUnitNames = team.map(u => u.name);
                const hasRequiredUnit = CLI_OPTIONS.include.some(requiredUnit => 
                    teamUnitNames.includes(requiredUnit)
                );
                if (!hasRequiredUnit) {
                    continue; // Skip this team
                }
            }
            
            const score = scoreTeamForBoss(team, boss, { debug: CLI_OPTIONS.debug });
            if (score > 0) {
                viableTeams.push({ label, team, score });
            }
        }
        
        // Sort by score descending
        viableTeams.sort((a, b) => b.score - a.score);
        
        console.log(`  Viable teams: ${viableTeams.length}`);
        
        // Display top teams
        const topTeams = viableTeams.slice(0, TOP_TEAMS_PER_BOSS);
        let currentRank = 1;
        let previousScore = null;
        topTeams.forEach((t, i) => {
            // Assign rank: same score = same rank, different score = increment rank
            if (previousScore !== null && t.score !== previousScore) {
                currentRank = i + 1;
            }
            previousScore = t.score;
            
            // Check if all team members are in personal roster
            const allInRoster = t.team.every(unit => myUnits.some(u => u.name === unit.name));
            const rosterIndicator = allInRoster ? '✓' : ' ';
            const teamNum = String(currentRank).padStart(2, ' ');
            console.log(`    #${teamNum}: ${rosterIndicator} ${t.label} (${t.score.toFixed(1)})`);
        });
        
        console.log();
    }
}

main().catch(console.error);
