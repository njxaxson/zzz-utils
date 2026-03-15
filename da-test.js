#!/usr/bin/env node
/**
 * CLI tool for testing Deadly Assault diversity algorithm.
 * Usage: node da-test.js <boss1> <boss2> <boss3>
 * Example: node da-test.js defiler hunter vesper
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'app','public', 'data');

import {
    getTeams, sortTeamByRole, getTeamLabel,
    extendTeamsWithUniversalUnits, teamsOverlap
} from './app/public/lib/team-builder.js';
import { scoreTeamForBoss } from './app/public/lib/team-scorer.js';

const DISPLAY_LIMIT = 5;
const ELEMENTS = ['fire', 'ice', 'electric', 'physical', 'ether'];
const PER_BOSS_FLOOR_RATIO = 0.5;
const BUCKET_CAP = 15;

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadJson(path) {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
}

async function loadData() {
    const units = await loadJson(join(DATA_DIR, 'units.json'));
    const bosses = await loadJson(join(DATA_DIR, 'bosses.json'));
    const roster = await loadJson(join(__dirname, 'roster.json'));

    const rosterNames = new Set(Object.keys(roster));
    const ownedUnits = units.filter(u => rosterNames.has(u.name));

    return { units: ownedUnits, bosses, roster };
}

// ============================================================================
// ALGORITHM (mirrors deadly-assault.js)
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

    // Phase 3: Greedy diversity-aware selection
    strategies.sort((a, b) => b.totalScore - a.totalScore);
    if (strategies.length === 0) return { selected: [], totalStrategies: 0, candidateCount: 0, perBossFloor: 0 };

    const best = strategies[0];
    const avgBossScore = best.totalScore / bossNames.length;
    const perBossFloor = avgBossScore * PER_BOSS_FLOOR_RATIO;

    const selected = [best];

    const candidates = [];
    for (let i = 1; i < strategies.length; i++) {
        if (strategies[i].assignments.every(a => a.score >= perBossFloor)) {
            candidates.push(strategies[i]);
        }
    }

    while (selected.length < limit && candidates.length > 0) {
        let bestIdx = -1;
        let bestMinDiffs = -1;
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

            if (minDiffs > bestMinDiffs ||
                (minDiffs === bestMinDiffs && candidates[i].totalScore > bestCandidateScore)) {
                bestIdx = i;
                bestMinDiffs = minDiffs;
                bestCandidateScore = candidates[i].totalScore;
            }
        }

        if (bestIdx === -1) break;
        selected.push(candidates[bestIdx]);
        candidates.splice(bestIdx, 1);
    }

    return { selected, totalStrategies: strategies.length, candidateCount: candidates.length + selected.length - 1, perBossFloor };
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

    const { selected, totalStrategies, candidateCount, perBossFloor } =
        findDiverseStrategies(viableTeamsByBoss, selectedBossNames, DISPLAY_LIMIT);

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

const TEST_CASES = {
    A: ['defiler', 'hunter', 'vesper'],
    B: ['butcher', 'pompey', 'thrall'],
    C: ['typhon', 'fiend', 'ucc']
};

async function main() {
    const args = process.argv.slice(2);

    const { units, bosses } = await loadData();
    console.log(`Loaded ${units.length} owned units`);

    const debugMode = args.includes('--debug');
    const filteredArgs = args.filter(a => a !== '--debug');

    let casesToRun = [];

    if (filteredArgs.length === 0 || filteredArgs[0]?.toUpperCase() === 'ALL') {
        casesToRun = Object.entries(TEST_CASES);
    } else if (filteredArgs.length === 1 && TEST_CASES[filteredArgs[0].toUpperCase()]) {
        casesToRun = [[filteredArgs[0].toUpperCase(), TEST_CASES[filteredArgs[0].toUpperCase()]]];
    } else if (filteredArgs.length === 3) {
        casesToRun = [['Custom', filteredArgs.map(a => a.toLowerCase())]];
    } else {
        console.log('Usage: node da-test.js [A|B|C|ALL] [--debug]');
        console.log('       node da-test.js <boss1> <boss2> <boss3> [--debug]');
        console.log('\nTest cases:');
        for (const [key, ids] of Object.entries(TEST_CASES)) {
            console.log(`  ${key}: ${ids.join(', ')}`);
        }
        console.log('\nBoss IDs: defiler, hunter, vesper, butcher, pompey, thrall, typhon, fiend, ucc, marionettes, bringer, priest, nightmare');
        process.exit(1);
    }

    for (const [label, bossIds] of casesToRun) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`TEST ${label}`);
        console.log('='.repeat(70));
        const results = calculateOptimalTeams(units, bosses, bossIds, debugMode);
        console.log(formatResults(results));
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
