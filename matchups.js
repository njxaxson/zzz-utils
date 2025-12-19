/**
 * Team Matchups for Zenless Zone Zero
 * 
 * Shows the top teams for EVERY boss, allowing verification of 
 * team ranking algorithm across all matchups at once.
 */

const allUnits = require('./app/public/data/units.json');
const bosses = require('./app/public/data/bosses.json');
const myRoster = require('./roster.json'); // Map of unit name -> stat (e.g., "M6W5")
const { getTeams, sortTeamByRole, getTeamLabel, extendTeamsWithUniversalUnits } = require('./lib/team-builder.js');
const { scoreTeamForBoss } = require('./lib/team-scorer.js');

// ============================================================================
// BUILD ROSTERS
// ============================================================================

// Full roster: all units from the master units.json
const fullRoster = [...allUnits];

// Personal roster: units from allUnits filtered by roster.json
const myUnits = allUnits.filter(u => myRoster.hasOwnProperty(u.name));

// ============================================================================
// CONFIGURATION
// ============================================================================

const TOP_TEAMS_PER_BOSS = 7;

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

function main() {
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
    
    // Process each boss
    for (const boss of bosses) {
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

main();
