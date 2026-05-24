/**
 * Team Matchups for Zenless Zone Zero
 * 
 * Shows the top teams for EVERY boss, allowing verification of 
 * team ranking algorithm across all matchups at once.
 */

import { parseArgs } from './lib/cli.js';
import { loadAllData } from './lib/data.js';
import { applyShareUrl } from './lib/share-url.js';
import { resolveOptions } from './lib/unit-resolver.js';
import { buildAvailableUnits } from './lib/roster-builder.js';
import { filterBosses } from './lib/boss-filter.js';
import { buildTeams } from './lib/team-pipeline.js';
import { parseTeams } from './lib/team-parser.js';
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';
import { rawScorePassesFilter } from './lib/score-filter.js';

const options = parseArgs({
    name: 'matchups.js',
    description: 'Shows top teams for every boss matchup.',
    defaults: { depth: 20 },
    examples: [
        '  node matchups.js                          All bosses, top 20 per boss',
        '  node matchups.js -b butcher               Filter to Butcher boss',
        '  node matchups.js -m -10                   Personal roster, top 10',
        '  node matchups.js -q "?roster=eJwN..."     From share URL',
        '  node matchups.js -i Miyabi                Teams must include Miyabi',
        '  node matchups.js -s 500                   Only teams scoring >= 500 vs each boss',
        '  node matchups.js -r 20 120                Raw scores between 20 and 120 (inclusive)'
    ].join('\n')
});

async function main() {
    const { units: allUnits, bosses, roster } = await loadAllData();
    applyShareUrl(options, allUnits);
    resolveOptions(options, allUnits);

    const myUnits = allUnits.filter(u => roster.hasOwnProperty(u.name));

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
    if(!options.omit) {
        console.log("===== Team Matchups - All Bosses =====\n");
        console.log(`Full roster: ${allUnits.length} characters\n`);
    }
    let teamEntries;

    if (options.teams) {
        const { teams: parsedTeams, warnings } = parseTeams(options.teams, allUnits, { preview: options.preview });
        for (const w of warnings) console.warn(`WARNING: ${w}`);
        teamEntries = parsedTeams;
        if(!options.omit) console.log(`Explicit teams: ${teamEntries.length}\n`);
    } else {
        const { availableUnits, universalUnits } = buildAvailableUnits(allUnits, options, roster);

        if (options.include && options.include.length > 0 && !options.omit) {
            console.log(`Teams must include at least one of: ${options.include.join(', ')}`);
        }

        if (options.units || options.onlyMine) {
            if(!options.omit) console.log(`Whitelist active: ${availableUnits.length} units`);
        }
        if(!options.omit) console.log(`Using ${availableUnits.length} units\n`);

        const { threeCharTeams, teamLabels, extendedCount, universalUnitObjects } = buildTeams(availableUnits, universalUnits);

        if (universalUnitObjects.length > 0 && !options.omit) {
            console.log(`Universal units: ${universalUnitObjects.map(u => u.name).join(", ")}`);
            if (extendedCount > 0) {
                console.log(`Extended ${extendedCount} teams using universal units`);
            }
        }

        if(!options.omit) console.log(`Total 3-character teams: ${teamLabels.length}\n`);

        teamEntries = teamLabels.map(label => ({ label, team: threeCharTeams[label] }));
    }

    if(!options.omit) console.log("=".repeat(60) + "\n");

    // Filter bosses
    let filteredBosses = bosses;
    if (options.bosses) {
        filteredBosses = filterBosses(bosses, options.bosses);
        if(!options.omit) console.log(`Boss filter: "${options.bosses}" (${filteredBosses.length} matches)\n`);
    } else if (options.queryBosses) {
        filteredBosses = filterBosses(bosses, options.queryBosses.join(','));
        if(!options.omit) console.log(`Bosses from share URL: ${filteredBosses.map(b => b.name).join(', ')} (${filteredBosses.length} matches)\n`);
    }

    // Process each boss
    for (const boss of filteredBosses) {
        const weakStr = boss.weaknesses.join(", ") || "none";
        const resistStr = boss.resistances.join(", ") || "none";
        const shillStr = boss.shill || "none";
        const antiStr = boss.anti?.join(", ") || "none";

        const viableTeams = [];
        for (const { label, team } of teamEntries) {
            if (!options.teams && options.include && options.include.length > 0) {
                const teamUnitNames = team.map(u => u.name);
                if (!options.include.some(req => teamUnitNames.includes(req))) {
                    continue;
                }
            }

            const score = scoreTeamForBoss(team, boss, { debug: options.debug });
            if (score > 0 && rawScorePassesFilter(score, options)) {
                viableTeams.push({ label, team, score });
            }
        }
        if(viableTeams.length == 0 && options.omit) continue; //do not display
        
        console.log(boss.name);
        if(!options.omit) console.log(`  Weak: ${weakStr} | Resist: ${resistStr} | Shill: ${shillStr} | Anti: ${antiStr} | Assists: ${boss.assists}`);
        viableTeams.sort((a, b) => b.score - a.score);
        if(!options.omit) console.log(`  Viable teams: ${viableTeams.length}`);

        const topTeams = viableTeams.slice(0, options.depth);
        let currentRank = 1;
        let previousScore = null;
        topTeams.forEach((t, i) => {
            if (previousScore !== null && t.score !== previousScore) {
                currentRank = i + 1;
            }
            previousScore = t.score;

            const allInRoster = t.team.every(unit => myUnits.some(u => u.name === unit.name));
            const hasPreview = t.team.some(unit => unit.available === false);
            const rosterIndicator = allInRoster ? '✓' : hasPreview ? '★' : ' ';
            const teamNum = String(currentRank).padStart(2, ' ');
            console.log(`    #${teamNum}: ${rosterIndicator} ${t.label} (${t.score.toFixed(1)})`);
        });

        console.log();
    }
}

main().catch(console.error);
