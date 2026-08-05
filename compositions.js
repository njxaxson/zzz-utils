/**
 * Team Compositions for Zenless Zone Zero
 *
 * Pivot of matchups.js: instead of showing the strongest teams per boss,
 * shows the top scored teams for EACH agent, with the bosses they excel
 * against listed alongside.
 */

import { parseArgs } from './lib/cli.js';
import { loadAllData } from './lib/data.js';
import { applyShareUrl } from './lib/share-url.js';
import { resolveOptions, resolveUnit } from './lib/unit-resolver.js';
import { buildAvailableUnits } from './lib/roster-builder.js';
import { filterBosses } from './lib/boss-filter.js';
import { buildTeams } from './lib/team-pipeline.js';
import { parseTeams } from './lib/team-parser.js';
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';
import { rawScorePassesFilter } from './lib/score-filter.js';
import { ELEMENTS } from './app/public/lib/common/constants.js';

// A team's line lists only its best-scoring bosses, grouped by identical
// score (e.g. "Thrall, Defiler: 516.6; Nightmare: 513.6" is 2 groups).
const TOP_SCORE_GROUPS = 2;

const options = parseArgs({
    name: 'compositions.js',
    description: 'Shows top scored teams per agent, pivoted across all bosses.',
    options: ['depth', 'onlyMine', 'preview', 'debug', 'units', 'exclude', 'include', 'flex', 'bosses', 'omit', 'query', 'teams', 'rank', 'element'],
    defaults: { depth: 3 },
    examples: [
        '  node compositions.js                    All agents, top 3 teams each',
        '  node compositions.js -7                  Top 7 teams per agent',
        '  node compositions.js -R S                Only S-rank agents get a section',
        '  node compositions.js -e fire             Only fire agents get a section',
        '  node compositions.js -m                  Personal roster only',
        '  node compositions.js -i "Ye Shunguong"   Teams must include Ye Shunguong',
        '  node compositions.js -b thrall,defiler   Score against Thrall and Defiler only',
        '  node compositions.js :Alice :Miyabi      Only show sections for Alice and Miyabi'
    ].join('\n')
});

function groupBossScores(bossScores) {
    const groups = [];
    for (const { bossName, score } of bossScores) {
        const rounded = Number(score.toFixed(1));
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.score === rounded) {
            lastGroup.bossNames.push(bossName);
        } else {
            groups.push({ score: rounded, bossNames: [bossName] });
        }
    }
    return groups;
}

async function main() {
    const { units: allUnits, bosses, roster } = await loadAllData();
    applyShareUrl(options, allUnits);
    resolveOptions(options, allUnits);

    if (options.rank) {
        const rank = options.rank.toUpperCase();
        if (rank !== 'S' && rank !== 'A') {
            console.error(`ERROR: --rank must be "S" or "A", got "${options.rank}"`);
            process.exit(1);
        }
        options.rank = rank;
    }
    if (options.element) {
        const element = options.element.toLowerCase();
        if (!ELEMENTS.includes(element)) {
            console.error(`ERROR: --element must be one of: ${ELEMENTS.join(', ')}`);
            process.exit(1);
        }
        options.element = element;
    }

    // :Name selectors restrict which agents get a section, using the same
    // name/ID/alias resolution as +Unit/-Unit overrides.
    const agentSelectorTokens = options.positional.filter(p => p.startsWith(':')).map(p => p.slice(1));
    let selectedAgentNames = null;
    if (agentSelectorTokens.length > 0) {
        try {
            selectedAgentNames = agentSelectorTokens.map(tok => resolveUnit(tok, allUnits).name);
        } catch (e) {
            console.error(`ERROR: ${e.message}`);
            process.exit(1);
        }
        if (!options.omit) console.log(`Agent filter: ${selectedAgentNames.join(', ')}\n`);
    }

    const myUnits = allUnits.filter(u => roster.hasOwnProperty(u.name));

    const NEUTRAL_BOSS = {
        name: 'Synthetic Neutral Boss',
        favored: [],
        mechanics: {
            weaknesses: [],
            resistances: [],
            shill: null,
            anti: [],
            assists: 0
        }
    };
    bosses.push(NEUTRAL_BOSS);

    if (!options.omit) {
        console.log("===== Team Compositions - By Agent =====\n");
    }

    let teamEntries;
    let candidateAgents;

    if (options.teams) {
        const { teams: parsedTeams, warnings } = parseTeams(options.teams, allUnits, { preview: options.preview });
        for (const w of warnings) console.warn(`WARNING: ${w}`);
        teamEntries = parsedTeams;
        if (!options.omit) console.log(`Explicit teams: ${teamEntries.length}\n`);

        const namesInTeams = new Set();
        for (const { team } of teamEntries) for (const u of team) namesInTeams.add(u.name);
        candidateAgents = allUnits.filter(u => namesInTeams.has(u.name));
    } else {
        const { availableUnits, universalUnits } = buildAvailableUnits(allUnits, options, roster);

        if (options.include && options.include.length > 0 && !options.omit) {
            console.log(`Teams must include at least one of: ${options.include.join(', ')}`);
        }
        if ((options.units || options.onlyMine) && !options.omit) {
            console.log(`Whitelist active: ${availableUnits.length} units`);
        }
        if (!options.omit) console.log(`Using ${availableUnits.length} units\n`);

        const { threeCharTeams, teamLabels, extendedCount, universalUnitObjects } = buildTeams(availableUnits, universalUnits);

        if (universalUnitObjects.length > 0 && !options.omit) {
            console.log(`Universal units: ${universalUnitObjects.map(u => u.name).join(", ")}`);
            if (extendedCount > 0) {
                console.log(`Extended ${extendedCount} teams using universal units`);
            }
        }
        if (!options.omit) console.log(`Total 3-character teams: ${teamLabels.length}\n`);

        teamEntries = teamLabels.map(label => ({ label, team: threeCharTeams[label] }));
        candidateAgents = availableUnits;
    }

    if (options.include && options.include.length > 0) {
        teamEntries = teamEntries.filter(({ team }) => {
            const teamUnitNames = team.map(u => u.name);
            return options.include.some(req => teamUnitNames.includes(req));
        });
    }

    if (!options.omit) console.log("=".repeat(60) + "\n");

    let filteredBosses = bosses;
    if (options.bosses) {
        filteredBosses = filterBosses(bosses, options.bosses);
        if (!options.omit) console.log(`Boss filter: "${options.bosses}" (${filteredBosses.length} matches)\n`);
    } else if (options.queryBosses) {
        filteredBosses = filterBosses(bosses, options.queryBosses.join(','));
        if (!options.omit) console.log(`Bosses from share URL: ${filteredBosses.map(b => b.name).join(', ')} (${filteredBosses.length} matches)\n`);
    }

    // Score every team against every boss once; keep only viable results.
    const scoredTeams = [];
    for (const { label, team } of teamEntries) {
        const bossScores = [];
        for (const boss of filteredBosses) {
            const score = scoreTeamForBoss(team, boss, { debug: options.debug });
            if (score > 0 && rawScorePassesFilter(score, options)) {
                bossScores.push({ bossName: boss.name, score });
            }
        }
        if (bossScores.length === 0) continue;
        bossScores.sort((a, b) => b.score - a.score);
        scoredTeams.push({ label, team, bossScores, bestScore: bossScores[0].score });
    }

    // Agents whose rank/element/:selector match get their own section; any
    // unit can still fill the other slots on a team regardless of this filter.
    let sectionAgents = selectedAgentNames
        ? allUnits.filter(u => selectedAgentNames.includes(u.name))
        : candidateAgents;
    if (options.rank) sectionAgents = sectionAgents.filter(u => u.rank === options.rank);
    if (options.element) sectionAgents = sectionAgents.filter(u => (u.tags || []).includes(options.element));
    sectionAgents = [...sectionAgents].sort((a, b) => a.name.localeCompare(b.name));

    for (const agent of sectionAgents) {
        const agentHeader = options.omit ? agent.name : `${agent.name} (${agent.rank})`;

        const agentTeams = scoredTeams.filter(t => t.team.some(u => u.name === agent.name));
        if (agentTeams.length === 0) {
            if (options.omit) continue;
            console.log(agentHeader);
            console.log(`  No viable teams\n`);
            continue;
        }

        agentTeams.sort((a, b) => b.bestScore - a.bestScore);

        console.log(agentHeader);

        const topTeams = agentTeams.slice(0, options.depth);
        const maxLabelLen = options.omit ? 0 : Math.max(...topTeams.map(t => t.label.length));
        let currentRank = 1;
        let previousScore = null;
        topTeams.forEach((t, i) => {
            if (previousScore !== null && t.bestScore !== previousScore) {
                currentRank = i + 1;
            }
            previousScore = t.bestScore;

            const allInRoster = t.team.every(unit => myUnits.some(u => u.name === unit.name));
            const hasPreview = t.team.some(unit => unit.available === false);
            const rosterIndicator = allInRoster ? '✓' : hasPreview ? '★' : ' ';
            const teamNum = String(currentRank).padStart(2, ' ');

            if (options.omit) {
                console.log(`  #${teamNum}: ${rosterIndicator} ${t.label} (${t.bestScore.toFixed(1)})`);
            } else {
                const groups = groupBossScores(t.bossScores).slice(0, TOP_SCORE_GROUPS);
                const groupsStr = groups.map(g => `${g.bossNames.join(', ')}: ${g.score.toFixed(1)}`).join('; ');
                const paddedLabel = t.label.padEnd(maxLabelLen);
                console.log(`  #${teamNum}: ${rosterIndicator} ${paddedLabel} - ${groupsStr}`);
            }
        });

        console.log();
    }
}

main().catch(console.error);
