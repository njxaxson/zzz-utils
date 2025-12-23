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
            depth: 7        // Number of top teams to display per boss
        };
        
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--filter' && args[i + 1]) {
                options.filter = args[i + 1].toLowerCase();
                i++;
            } else if (args[i] === '--depth' && args[i + 1]) {
                options.depth = parseInt(args[i + 1], 10);
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

    const EXCLUDED_UNITS = [
        // "Anby",
        // "Anton",
        // "Ben",
        // "Billy",
        // "Corin",
        // "Seth"
    ];

    // Optional: Specify a subset of units to use (whitelist)
    // Use one of the following options:
    const INCLUDED_UNITS = allUnits.map(u => u.name);           // Full roster (all units)
    // const INCLUDED_UNITS = myUnits.map(u => u.name);         // Personal roster (from roster.json)
    // const INCLUDED_UNITS = ["Ellen", "Harumasa", ...];       // Custom list

    // Universal units: Can join ANY 2-person team to form a 3-person team
    const UNIVERSAL_UNITS = [
        "Nicole",
        // "Astra",  // Not in test roster
    ];

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
    
    // Filter bosses if --filter specified
    let filteredBosses = bosses;
    if (CLI_OPTIONS.filter) {
        filteredBosses = bosses.filter(b => 
            b.name.toLowerCase().includes(CLI_OPTIONS.filter) ||
            b.shortName.toLowerCase().includes(CLI_OPTIONS.filter)
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
            const score = scoreTeamForBoss(team, boss);
            if (score > 0) {
                viableTeams.push({ label, team, score });
            }
        }
        
        // Sort by score descending
        viableTeams.sort((a, b) => b.score - a.score);
        
        console.log(`  Viable teams: ${viableTeams.length}`);
        
        // Display top teams
        const topTeams = viableTeams.slice(0, TOP_TEAMS_PER_BOSS);
        topTeams.forEach((t, i) => {
            console.log(`    #${i + 1}: ${t.label} (${t.score.toFixed(1)})`);
        });
        
        console.log();
    }
}

main().catch(console.error);
