#!/usr/bin/env node
/**
 * CLI tool for testing Deadly Assault diversity algorithm.
 * Runs predefined or custom boss combinations and displays diverse strategy results.
 */

import { parseArgs } from './lib/cli.js';
import { loadUnits, loadBosses, loadRoster } from './lib/data.js';
import { applyShareUrl } from './lib/share-url.js';
import { buildAvailableUnits } from './lib/roster-builder.js';
import {
    getTeams, sortTeamByRole, getTeamLabel,
    extendTeamsWithUniversalUnits, teamsOverlap
} from './app/public/lib/common/team-builder.js';
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';

const DISPLAY_LIMIT = 5;
const ELEMENTS = ['fire', 'ice', 'electric', 'physical', 'ether'];
const PER_BOSS_FLOOR_RATIO = 0.5;
const MIN_RESULTS_BEFORE_FLOOR = 3;
const BUCKET_CAP = 15;

const TEST_CASES = {
    A: ['defiler', 'hunter', 'vesper'],
    B: ['butcher', 'pompey', 'thrall'],
    C: ['typhon', 'fiend', 'ucc']
};

const options = parseArgs({
    name: 'da-test.js',
    description: 'Tests Deadly Assault diversity algorithm with predefined or custom boss combos.',
    positional: '[A|B|C|ALL | <boss1> <boss2> <boss3>]',
    examples: [
        '  node da-test.js A                        Run test case A',
        '  node da-test.js defiler hunter solo       Custom boss IDs',
        '  node da-test.js ALL                       Run all test cases',
        '  node da-test.js -q "?roster=..." -d       From share URL, debug mode'
    ].join('\n')
});

// ============================================================================
// ALGORITHM
// ============================================================================

function isPrimaryDps(u) {
    const dpsRole = u.tags.find(t => ['attack', 'anomaly', 'rupture'].includes(t));
    const isSubdps = u.synergy && u.synergy.tags && u.synergy.tags.includes('subdps');
    return dpsRole && !isSubdps;
}

function unitFingerprint(u) {
    const role = u.tags.find(t => ['attack', 'anomaly', 'rupture'].includes(t));
    const element = u.tags.find(t => ELEMENTS.includes(t));
    const tier = u.tier < 2 ? 'hi' : 'lo';
    return `${role}:${element}:${tier}`;
}

function getTeamDpsBuckets(team) {
    return team.filter(isPrimaryDps).map(u => unitFingerprint(u));
}

function teamDpsFingerprint(team) {
    return getTeamDpsBuckets(team).sort().join('|');
}

function getPrimaryDpsNames(team) {
    return team.filter(isPrimaryDps).map(u => u.name);
}

function findDiverseStrategies(viableTeamsByBoss, bossNames, limit) {
    const bucketsByBoss = {};
    for (const bossName of bossNames) {
        const buckets = new Map();
        for (const entry of viableTeamsByBoss[bossName]) {
            const fps = getTeamDpsBuckets(entry.team);
            for (const fp of fps) {
                if (!fp) continue;
                if (!buckets.has(fp)) buckets.set(fp, []);
                const bucket = buckets.get(fp);
                if (bucket.length < BUCKET_CAP) bucket.push(entry);
            }
        }
        bucketsByBoss[bossName] = buckets;
    }

    const bucketKeys = bossNames.map(bn => [...bucketsByBoss[bn].keys()]);
    const strategies = [];

    for (const fp0 of bucketKeys[0]) {
        const teams0 = bucketsByBoss[bossNames[0]].get(fp0);
        for (const fp1 of bucketKeys[1]) {
            const teams1 = bucketsByBoss[bossNames[1]].get(fp1);
            for (const fp2 of bucketKeys[2]) {
                const teams2 = bucketsByBoss[bossNames[2]].get(fp2);

                let bestScore = -1;
                let bestTriple = null;

                for (const t0 of teams0) {
                    for (const t1 of teams1) {
                        if (teamsOverlap(t0.team, t1.team)) continue;
                        for (const t2 of teams2) {
                            if (teamsOverlap(t0.team, t2.team)) continue;
                            if (teamsOverlap(t1.team, t2.team)) continue;
                            const total = t0.score + t1.score + t2.score;
                            if (total > bestScore) {
                                bestScore = total;
                                bestTriple = [t0, t1, t2];
                            }
                        }
                    }
                }

                if (bestTriple) {
                    strategies.push({
                        totalScore: bestScore,
                        dpsKey: `${fp0}||${fp1}||${fp2}`,
                        assignments: bossNames.map((bn, i) => ({
                            boss: bn,
                            team: bestTriple[i].team,
                            label: bestTriple[i].label,
                            score: bestTriple[i].score
                        }))
                    });
                }
            }
        }
    }

    strategies.sort((a, b) => b.totalScore - a.totalScore);
    if (strategies.length === 0) return { selected: [], totalStrategies: 0, candidateCount: 0, perBossFloor: 0 };

    const best = strategies[0];
    const avgBossScore = best.totalScore / bossNames.length;
    const perBossFloor = avgBossScore * PER_BOSS_FLOOR_RATIO;

    const selected = [best];
    const allCandidates = strategies.slice(1);

    const seenDpsPerBoss = bossNames.map(() => new Set());
    best.dpsKey.split('||').forEach((fp, i) => seenDpsPerBoss[i].add(fp));

    while (selected.length < limit && allCandidates.length > 0) {
        const enforceFloor = selected.length >= MIN_RESULTS_BEFORE_FLOOR;
        const candidates = enforceFloor
            ? allCandidates.filter(s => s.assignments.every(a => a.score >= perBossFloor))
            : allCandidates;

        if (candidates.length === 0) break;

        let bestIdx = -1;
        let bestMinDiffs = -1;
        let bestNewMatchups = -1;
        let bestCandidateScore = -1;

        for (let i = 0; i < candidates.length; i++) {
            const candidateFps = candidates[i].dpsKey.split('||');

            let minDiffs = Infinity;
            for (const sel of selected) {
                const selFps = sel.dpsKey.split('||');
                let diffs = 0;
                for (let j = 0; j < selFps.length; j++) {
                    if (candidateFps[j] !== selFps[j]) diffs++;
                }
                minDiffs = Math.min(minDiffs, diffs);
            }

            let newMatchups = 0;
            for (let j = 0; j < candidateFps.length; j++) {
                if (!seenDpsPerBoss[j].has(candidateFps[j])) newMatchups++;
            }

            if (minDiffs > bestMinDiffs ||
                (minDiffs === bestMinDiffs && newMatchups > bestNewMatchups) ||
                (minDiffs === bestMinDiffs && newMatchups === bestNewMatchups && candidates[i].totalScore > bestCandidateScore)) {
                bestIdx = i;
                bestMinDiffs = minDiffs;
                bestNewMatchups = newMatchups;
                bestCandidateScore = candidates[i].totalScore;
            }
        }

        if (bestIdx === -1) break;
        const chosen = candidates[bestIdx];
        selected.push(chosen);
        chosen.dpsKey.split('||').forEach((fp, i) => seenDpsPerBoss[i].add(fp));
        allCandidates.splice(allCandidates.indexOf(chosen), 1);
    }

    return { selected, totalStrategies: strategies.length, candidateCount: allCandidates.length + selected.length - 1, perBossFloor };
}

const KEY_DPS_NAMES = ['Miyabi', 'Alice', 'Ye Shunguong', 'Yixuan', 'Harumasa', 'Evelyn', 'Komano', 'Vivian'];

function calculateOptimalTeams(ownedUnits, allBosses, bossIds, debugMode = false) {
    const selectedBossObjects = bossIds
        .map(id => allBosses.find(b => b.id === id))
        .filter(Boolean);
    const selectedBossNames = selectedBossObjects.map(b => b.name);

    const allTeams = getTeams([...ownedUnits]);

    const twoCharTeams = {};
    const threeCharTeams = {};
    for (const label in allTeams) {
        const team = allTeams[label];
        if (team.length === 2) twoCharTeams[label] = team;
        else if (team.length === 3) threeCharTeams[label] = team;
    }

    const teamLabels = Object.keys(threeCharTeams);

    const viableTeamsByBoss = {};
    const debugInfo = {};

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

        if (debugMode) {
            const viableNames = new Set();
            for (const entry of viableTeamsByBoss[boss.name]) {
                for (const u of entry.team) viableNames.add(u.name);
            }

            const missingDps = KEY_DPS_NAMES.filter(name => {
                const hasViableTeam = viableTeamsByBoss[boss.name].some(
                    entry => entry.team.some(u => u.name === name && isPrimaryDps(u))
                );
                return !hasViableTeam;
            });

            debugInfo[boss.shortName] = { missingDps, disqualified };

            if (missingDps.length > 0) {
                console.log(`\n  DEBUG: ${boss.shortName} — missing DPS: ${missingDps.join(', ')}`);
                for (const name of missingDps) {
                    const teamsWithUnit = disqualified.filter(
                        e => e.team.some(u => u.name === name)
                    );
                    if (teamsWithUnit.length === 0) {
                        console.log(`    ${name}: NO teams formed at all (team builder didn't create any)`);
                    } else {
                        const best = teamsWithUnit.sort((a, b) => b.score - a.score)[0];
                        console.log(`    ${name}: ${teamsWithUnit.length} teams, all scored <= 0. Best: ${best.label} = ${best.score.toFixed(0)}`);
                        scoreTeamForBoss(best.team, boss, { debug: true });
                    }
                }
            }
        }
    }

    let { selected, totalStrategies, candidateCount, perBossFloor } =
        findDiverseStrategies(viableTeamsByBoss, selectedBossNames, DISPLAY_LIMIT);

    if (selected.length === 0) {
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
            console.log(`   ${boss.shortName}: ${viableTeamsByBoss[boss.name].length} viable teams (after lenient)`);
        }

        ({ selected, totalStrategies, candidateCount, perBossFloor } =
            findDiverseStrategies(viableTeamsByBoss, selectedBossNames, DISPLAY_LIMIT));
        console.log(`After lenient retry — Strategies: ${totalStrategies}, Results: ${selected.length}`);
    }

    return {
        diverseResults: selected,
        bosses: selectedBossObjects,
        bossNames: selectedBossNames,
        viableTeamsByBoss,
        totalStrategies,
        candidateCount,
        perBossFloor
    };
}

// ============================================================================
// OUTPUT
// ============================================================================

function formatResults(results) {
    const lines = [];
    const { diverseResults, bosses, bossNames, viableTeamsByBoss, totalStrategies, candidateCount, perBossFloor } = results;

    lines.push(`\nBosses: ${bosses.map(b => b.shortName).join(' / ')}`);
    for (const boss of bosses) {
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
        lines.push(`  ${boss.shortName}: ${viable.length} viable teams, ${buckets.size} DPS buckets`);
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
            const boss = bosses.find(b => b.name === a.boss);
            const dps = getPrimaryDpsNames(a.team);
            const names = a.team.map(u => u.name).join('/');
            lines.push(`  ${boss.shortName.padEnd(20)} ${names.padEnd(30)} (${a.score.toFixed(0)}) [${dps.join('+')}]`);
        }
    }

    return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    const allUnits = await loadUnits();
    const allBosses = await loadBosses();
    const roster = await loadRoster();

    applyShareUrl(options, allUnits);

    const { availableUnits } = buildAvailableUnits(allUnits, options, roster);
    console.log(`Loaded ${availableUnits.length} owned units`);

    let casesToRun = [];

    if (options.queryBosses && options.positional.length === 0) {
        casesToRun = [['Query', options.queryBosses]];
    } else if (options.positional.length === 0 || options.positional[0]?.toUpperCase() === 'ALL') {
        casesToRun = Object.entries(TEST_CASES);
    } else if (options.positional.length === 1 && TEST_CASES[options.positional[0].toUpperCase()]) {
        casesToRun = [[options.positional[0].toUpperCase(), TEST_CASES[options.positional[0].toUpperCase()]]];
    } else if (options.positional.length === 3) {
        casesToRun = [['Custom', options.positional.map(a => a.toLowerCase())]];
    } else {
        console.log('Usage: node da-test.js [A|B|C|ALL] [options]');
        console.log('       node da-test.js <boss1> <boss2> <boss3> [options]');
        console.log('\nTest cases:');
        for (const [key, ids] of Object.entries(TEST_CASES)) {
            console.log(`  ${key}: ${ids.join(', ')}`);
        }
        console.log('\nBoss IDs: defiler, hunter, vesper, butcher, pompey, thrall, typhon, fiend, ucc, marionettes, bringer, priest, nightmare');
        console.log('\nUse --help for all options.');
        process.exit(1);
    }

    for (const [label, bossIds] of casesToRun) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`TEST ${label}`);
        console.log('='.repeat(70));
        const results = calculateOptimalTeams(availableUnits, allBosses, bossIds, options.debug);
        console.log(formatResults(results));
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
