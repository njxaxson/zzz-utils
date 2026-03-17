#!/usr/bin/env node
/**
 * Deadly Assault DPS Buckets — CLI tool for testing the diversity algorithm.
 * Runs a single 3-boss scenario and shows diverse strategy results.
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
import { teamsOverlap } from './app/public/lib/common/team-builder.js';
import {
    isPrimaryDps, unitFingerprint, getTeamDpsBuckets,
    getPrimaryDpsNames, findDiverseStrategies
} from './app/public/lib/common/dps-buckets.js';

const DISPLAY_LIMIT = 5;

const options = parseArgs({
    name: 'da-buckets.js',
    description: 'Tests Deadly Assault diversity algorithm for a 3-boss scenario.',
    examples: [
        '  node da-buckets.js -b defiler,hunter,vesper',
        '  node da-buckets.js -b butch,ucc,pomp -m',
        '  node da-buckets.js -b typhon,fiend,ucc -d',
        '  node da-buckets.js -b defiler,hunter,vesper -t "Miyabi/Soukaku/Astra,YSG/Zhao/Sunna,Harumasa/Grace/Rina"'
    ].join('\n')
});

const KEY_DPS_NAMES = ['Miyabi', 'Alice', 'Ye Shunguong', 'Yixuan', 'Harumasa', 'Evelyn', 'Komano', 'Vivian'];

function evaluateExplicitTeams(teamEntries, selectedBossObjects, opts) {
    const bossNames = selectedBossObjects.map(b => b.name);

    const scoredByBoss = {};
    for (const boss of selectedBossObjects) {
        scoredByBoss[boss.name] = [];
        for (const { label, team } of teamEntries) {
            const score = scoreTeamForBoss(team, boss, { debug: opts.debug });
            if (score > 0) {
                scoredByBoss[boss.name].push({ label, team, score });
            }
        }
        scoredByBoss[boss.name].sort((a, b) => b.score - a.score);
    }

    const PERMS = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
    const combinations = [];
    const n = teamEntries.length;

    function* chooseCombos(arr, k) {
        if (k === 0) { yield []; return; }
        for (let i = 0; i <= arr.length - k; i++) {
            for (const rest of chooseCombos(arr.slice(i + 1), k - 1)) {
                yield [arr[i], ...rest];
            }
        }
    }

    if (n < 3) {
        console.error(`ERROR: Need at least 3 teams for Deadly Assault, got ${n}`);
        return [];
    }

    for (const combo of chooseCombos(teamEntries.map((_, i) => i), 3)) {
        const three = combo.map(i => teamEntries[i]);
        if (teamsOverlap(three[0].team, three[1].team)) continue;
        if (teamsOverlap(three[0].team, three[2].team)) continue;
        if (teamsOverlap(three[1].team, three[2].team)) continue;

        for (const perm of PERMS) {
            const assignments = perm.map((teamIdx, bossIdx) => {
                const entry = three[teamIdx];
                const boss = selectedBossObjects[bossIdx];
                const bossScored = scoredByBoss[boss.name].find(s => s.label === entry.label);
                const score = bossScored ? bossScored.score : scoreTeamForBoss(entry.team, boss, { debug: opts.debug });
                return {
                    boss: boss.name,
                    team: entry.team,
                    label: entry.label,
                    score
                };
            });

            if (assignments.some(a => a.score <= 0)) continue;

            const totalScore = assignments.reduce((s, a) => s + a.score, 0);
            combinations.push({ totalScore, assignments });
        }
    }

    combinations.sort((a, b) => b.totalScore - a.totalScore);
    return combinations;
}

function formatResults(results, selectedBossObjects) {
    const lines = [];
    const { diverseResults, bossNames, viableTeamsByBoss, totalStrategies, candidateCount, perBossFloor } = results;

    lines.push(`\nBosses: ${selectedBossObjects.map(b => b.shortName || b.name).join(' / ')}`);
    for (const boss of selectedBossObjects) {
        const viable = viableTeamsByBoss[boss.name];
        const buckets = new Map();
        for (const entry of viable) {
            const fps = getTeamDpsBuckets(entry.team);
            for (const fp of fps) {
                if (!fp) continue;
                if (!buckets.has(fp)) buckets.set(fp, []);
                buckets.get(fp).push(entry);
            }
        }
        lines.push(`  ${(boss.shortName || boss.name).padEnd(20)}: ${viable.length} viable teams, ${buckets.size} DPS buckets`);
        for (const [fp, entries] of [...buckets.entries()].sort((a, b) => b[1][0].score - a[1][0].score)) {
            const best = entries.reduce((a, b) => a.score > b.score ? a : b);
            const dpsUnit = best.team.find(u => isPrimaryDps(u) && unitFingerprint(u) === fp);
            const name = dpsUnit ? dpsUnit.name : '?';
            lines.push(`    [${fp}] ${name} — best: ${best.score.toFixed(0)}, ${entries.length} teams`);
        }
    }

    lines.push(`\nStrategies: ${totalStrategies} total, ${candidateCount} above per-boss floor (${perBossFloor.toFixed(0)})`);
    lines.push(`Results: ${diverseResults.length}\n`);

    for (let i = 0; i < diverseResults.length; i++) {
        const combo = diverseResults[i];
        lines.push(`--- Option #${i + 1} (total: ${combo.totalScore.toFixed(0)}) ---`);
        for (const a of combo.assignments) {
            const boss = selectedBossObjects.find(b => b.name === a.boss);
            const dps = getPrimaryDpsNames(a.team);
            const names = a.team.map(u => u.name).join('/');
            lines.push(`  ${(boss.shortName || boss.name).padEnd(20)} ${names.padEnd(30)} (${a.score.toFixed(0)}) [${dps.join('+')}]`);
        }
    }

    return lines.join('\n');
}

async function main() {
    const { units: allUnits, bosses, roster } = await loadAllData();
    applyShareUrl(options, allUnits);
    resolveOptions(options, allUnits);

    if (!options.bosses && !options.queryBosses) {
        console.error("ERROR: Boss filter required. Use --bosses/-b <filter> to specify 3 bosses.");
        console.log("Example: node da-buckets.js -b butch,ucc,pomp");
        console.log("\nAvailable bosses:");
        bosses.forEach(b => console.log(`  - ${b.name} (${b.id})`));
        process.exit(1);
    }

    const bossFilter = options.bosses || options.queryBosses?.join(',');
    const selectedBossObjects = filterBosses(bosses, bossFilter);

    if (selectedBossObjects.length !== 3) {
        console.error(`ERROR: Boss filter must match exactly 3 bosses. Found ${selectedBossObjects.length}:`);
        selectedBossObjects.forEach(b => console.log(`  - ${b.name}`));
        if (selectedBossObjects.length < 3) {
            console.log("\nAvailable bosses:");
            bosses.forEach(b => console.log(`  - ${b.name} (${b.id})`));
        }
        process.exit(1);
    }

    const selectedBossNames = selectedBossObjects.map(b => b.name);

    console.log("===== DA Buckets — Diversity Algorithm Test =====\n");
    console.log("Selected Bosses:");
    for (const boss of selectedBossObjects) {
        const weakStr = boss.weaknesses.join(", ") || "none";
        const resStr = boss.resistances.join(", ") || "none";
        console.log(`  ${boss.name}`);
        console.log(`    Weak: ${weakStr} | Resist: ${resStr} | Shill: ${boss.shill || 'none'} | Assists: ${boss.assists}`);
    }
    console.log();

    // Explicit teams mode
    if (options.teams) {
        const { teams: parsedTeams, warnings } = parseTeams(options.teams, allUnits, { preview: options.preview });
        for (const w of warnings) console.warn(`WARNING: ${w}`);

        console.log(`Explicit teams: ${parsedTeams.length}`);
        for (const { label } of parsedTeams) console.log(`  - ${label}`);
        console.log();

        const combinations = evaluateExplicitTeams(parsedTeams, selectedBossObjects, options);

        if (combinations.length === 0) {
            console.log('No valid non-overlapping assignments found for the given teams.');
            return;
        }

        const displayCount = Math.min(options.depth, combinations.length);
        console.log(`===== Top ${displayCount} Team Allocations =====\n`);

        for (let i = 0; i < displayCount; i++) {
            const combo = combinations[i];
            console.log(`Option #${i + 1} (Total: ${combo.totalScore.toFixed(0)})`);
            for (const assignment of combo.assignments) {
                const boss = selectedBossObjects.find(b => b.name === assignment.boss);
                const dps = getPrimaryDpsNames(assignment.team);
                const names = assignment.team.map(u => u.name).join('/');
                console.log(`  ${(boss.shortName || boss.name).padEnd(20)} ${names.padEnd(30)} (${assignment.score.toFixed(0)}) [${dps.join('+')}]`);
            }
            console.log();
        }

        if (combinations.length > options.depth) {
            console.log(`... and ${combinations.length - options.depth} more combinations.`);
        }
        return;
    }

    // Normal mode: generate teams and run diversity algorithm
    const { availableUnits, universalUnits } = buildAvailableUnits(allUnits, options, roster);
    console.log(`Using ${availableUnits.length} units`);

    const { threeCharTeams, teamLabels } = buildTeams(availableUnits, universalUnits);
    console.log(`Total 3-character teams: ${teamLabels.length}`);

    const viableTeamsByBoss = {};
    for (const boss of selectedBossObjects) {
        viableTeamsByBoss[boss.name] = [];
        const disqualified = [];

        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            const score = scoreTeamForBoss(team, boss);
            if (score > 0) {
                viableTeamsByBoss[boss.name].push({ label, team, score });
            } else {
                disqualified.push({ label, team, score });
            }
        }

        if (viableTeamsByBoss[boss.name].length === 0) {
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const score = scoreTeamForBoss(team, boss, { lenient: true });
                if (score > 0) {
                    viableTeamsByBoss[boss.name].push({ label, team, score, lenient: true });
                }
            }
        }

        viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);

        if (options.debug) {
            const viableNames = new Set();
            for (const entry of viableTeamsByBoss[boss.name]) {
                for (const u of entry.team) viableNames.add(u.name);
            }
            const missingDps = KEY_DPS_NAMES.filter(name => {
                return !viableTeamsByBoss[boss.name].some(
                    entry => entry.team.some(u => u.name === name && isPrimaryDps(u))
                );
            });
            if (missingDps.length > 0) {
                console.log(`\n  DEBUG: ${boss.shortName || boss.name} — missing DPS: ${missingDps.join(', ')}`);
                for (const name of missingDps) {
                    const teamsWithUnit = disqualified.filter(
                        e => e.team.some(u => u.name === name)
                    );
                    if (teamsWithUnit.length === 0) {
                        console.log(`    ${name}: NO teams formed at all`);
                    } else {
                        const best = teamsWithUnit.sort((a, b) => b.score - a.score)[0];
                        console.log(`    ${name}: ${teamsWithUnit.length} teams, all scored <= 0. Best: ${best.label} = ${best.score.toFixed(0)}`);
                        scoreTeamForBoss(best.team, boss, { debug: true });
                    }
                }
            }
        }
    }

    let { selected: diverseResults, totalStrategies, candidateCount, perBossFloor } =
        findDiverseStrategies(viableTeamsByBoss, selectedBossNames, DISPLAY_LIMIT);

    if (diverseResults.length === 0) {
        console.log('\n⚠️ No non-overlapping combinations found — retrying all bosses in lenient mode...');
        for (const boss of selectedBossObjects) {
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const score = scoreTeamForBoss(team, boss, { lenient: true });
                if (score <= 0) continue;
                const existing = viableTeamsByBoss[boss.name].find(t => t.label === label);
                if (existing) {
                    if (score > existing.score) existing.score = score;
                    existing.lenient = true;
                } else {
                    viableTeamsByBoss[boss.name].push({ label, team, score, lenient: true });
                }
            }
            viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);
        }

        ({ selected: diverseResults, totalStrategies, candidateCount, perBossFloor } =
            findDiverseStrategies(viableTeamsByBoss, selectedBossNames, DISPLAY_LIMIT));
        console.log(`After lenient retry — Strategies: ${totalStrategies}, Results: ${diverseResults.length}`);
    }

    console.log(formatResults({
        diverseResults, bossNames: selectedBossNames,
        viableTeamsByBoss, totalStrategies, candidateCount, perBossFloor
    }, selectedBossObjects));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
