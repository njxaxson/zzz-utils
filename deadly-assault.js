/**
 * Deadly Assault Team Builder for Zenless Zone Zero
 * 
 * Generates optimal team allocations for 3 DA bosses,
 * ensuring no unit overlap and matching teams to boss requirements.
 */

import { parseArgs } from './lib/cli.js';
import { loadAllData, loadCalibration } from './lib/data.js';
import { applyShareUrl } from './lib/share-url.js';
import { resolveOptions } from './lib/unit-resolver.js';
import { buildAvailableUnits } from './lib/roster-builder.js';
import { filterBosses } from './lib/boss-filter.js';
import { buildTeams } from './lib/team-pipeline.js';
import { parseTeams } from './lib/team-parser.js';
import { scoreTeamForBoss, getBossWeaknesses, getBossResistances, getBossShill, getBossAssists } from './app/public/lib/common/team-scorer.js';
import { teamsOverlap } from './app/public/lib/common/team-builder.js';
import { isPrimaryDps, unitFingerprint, getTeamDpsBuckets } from './app/public/lib/common/dps-buckets.js';
import { solveDeadlyAssault } from './app/public/lib/common/deadly-assault-solver.js';
import { rawScorePassesFilter } from './lib/score-filter.js';
import { calibrate } from './lib/calibration.js';
import { filterByUpdate } from './lib/version-filter.js';

const DISPLAY_LIMIT = 5;

// Deadly Assault allocates across all three bosses at once, and the whole point of the exercise
// (findExclusiveCombinations' banding, dps-buckets' totalScore sum and perBossFloor cut) is
// comparing teams of DIFFERENT archetypes against each other — the sharpest cross-archetype
// comparison in the app. So every score that becomes a `.score` field from here on is
// CALIBRATED, not raw. -s/-r filter on calibrated too. `raw` is kept alongside for --debug
// output and is never itself compared across teams.
//
// Returns null (not 0) for a non-viable team so callers can `if (!scored) continue/return null`
// without also having to re-check `raw <= 0` themselves.
function scoreCalibrated(team, boss, scoreOptions, calibration) {
    const trace = {};
    const raw = scoreTeamForBoss(team, boss, { ...scoreOptions, trace });
    if (raw <= 0 || trace.disqualified) return null;
    return { raw, score: calibrate(raw, trace.carryArchetype, calibration), archetype: trace.carryArchetype };
}

// Debug-only: DPS-archetype bucket breakdown per boss.
function printDpsBucketDiagnostics(boss, viableTeams) {
    const buckets = new Map();
    for (const entry of viableTeams) {
        const fps = getTeamDpsBuckets(entry.team);
        for (const fp of fps) {
            if (!fp) continue;
            if (!buckets.has(fp)) buckets.set(fp, []);
            buckets.get(fp).push(entry);
        }
    }

    console.log(`  DPS buckets: ${buckets.size}`);
    for (const [fp, entries] of [...buckets.entries()].sort((a, b) => b[1][0].score - a[1][0].score)) {
        const best = entries.reduce((a, b) => a.score > b.score ? a : b);
        const dpsUnit = best.team.find(u => isPrimaryDps(u, best.team) && unitFingerprint(u) === fp);
        const name = dpsUnit ? dpsUnit.name : '?';
        console.log(`    [${fp}] ${name} — best: ${best.score.toFixed(0)}, ${entries.length} teams`);
    }
}

const options = parseArgs({
    name: 'deadly-assault.js',
    description: 'Finds optimal non-overlapping team allocations for 3 DA bosses.',
    examples: [
        '  node deadly-assault.js -b butch,ucc,pomp       3 bosses by partial name',
        '  node deadly-assault.js -b defiler,hunter,solo   Another combo',
        '  node deadly-assault.js -m -b butch,ucc,pomp     Personal roster',
        '  node deadly-assault.js -q "?roster=..." -10     Share URL, top 10',
        '  node deadly-assault.js -b butch,ucc,pomp -s 300 Teams per boss must CALIBRATE >= 300',
        '  node deadly-assault.js -b butch,ucc,pomp -d     Debug: top teams, DPS buckets, missing-DPS check',
        '  node deadly-assault.js -b butch,ucc,pomp -v 1.0 Only agents/bosses released by version 1.0'
    ].join('\n')
});

/**
 * Score explicit teams against bosses and try all C(N,3)*3! arrangements.
 */
function evaluateExplicitTeams(teamEntries, selectedBossObjects, options, calibration) {
    const bossNames = selectedBossObjects.map(b => b.name);

    const scoredByBoss = {};
    for (const boss of selectedBossObjects) {
        scoredByBoss[boss.name] = [];
        for (const { label, team } of teamEntries) {
            const scored = scoreCalibrated(team, boss, { debug: options.debug }, calibration);
            if (scored && rawScorePassesFilter(scored.score, options)) {
                scoredByBoss[boss.name].push({ label, team, ...scored });
            }
        }
        scoredByBoss[boss.name].sort((a, b) => b.score - a.score);
    }

    const PERMS = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
    const combinations = [];

    const n = teamEntries.length;
    const indices = teamEntries.map((_, i) => i);

    function* chooseCombos(arr, k) {
        if (k === 0) { yield []; return; }
        for (let i = 0; i <= arr.length - k; i++) {
            for (const rest of chooseCombos(arr.slice(i + 1), k - 1)) {
                yield [arr[i], ...rest];
            }
        }
    }

    const teamCount = Math.min(n, 3);
    if (teamCount < 3) {
        console.error(`ERROR: Need at least 3 teams for Deadly Assault, got ${n}`);
        return [];
    }

    for (const combo of chooseCombos(indices, 3)) {
        const three = combo.map(i => teamEntries[i]);

        if (teamsOverlap(three[0].team, three[1].team)) continue;
        if (teamsOverlap(three[0].team, three[2].team)) continue;
        if (teamsOverlap(three[1].team, three[2].team)) continue;

        for (const perm of PERMS) {
            const assignments = perm.map((teamIdx, bossIdx) => {
                const entry = three[teamIdx];
                const boss = selectedBossObjects[bossIdx];
                const bossScored = scoredByBoss[boss.name].find(s => s.label === entry.label);
                const scored = bossScored ?? scoreCalibrated(entry.team, boss, { debug: options.debug }, calibration);
                return {
                    boss: boss.name,
                    team: entry.team,
                    label: entry.label,
                    score: scored ? scored.score : 0,
                    raw: scored ? scored.raw : 0,
                    archetype: scored ? scored.archetype : null,
                    rank: 0,
                    lenient: false
                };
            });

            if (assignments.some(a => a.score <= 0)) continue;

            const totalScore = assignments.reduce((s, a) => s + a.score, 0);
            combinations.push({
                totalScore,
                priority: 0,
                rankSum: 0,
                maxRank: 0,
                assignments
            });
        }
    }

    combinations.sort((a, b) => b.totalScore - a.totalScore);
    return combinations;
}

async function main() {
    const { units: allUnitsRaw, bosses: bossesRaw, roster } = await loadAllData();
    const allUnits = filterByUpdate(allUnitsRaw, options.version);
    const bosses = filterByUpdate(bossesRaw, options.version);
    // Match generate-calibration.mjs's own --preview convention (the preview anchor set is the
    // only one fit against unreleased units) rather than loadAllData()'s default (always released).
    const calibration = await loadCalibration({ preview: options.preview, required: false });
    if (!calibration) {
        console.error(`No ${options.preview ? 'calibration.preview.json' : 'calibration.json'} found — ` +
            `run: node generate-calibration.mjs${options.preview ? ' --preview' : ''}`);
        process.exit(1);
    }
    applyShareUrl(options, allUnits);
    resolveOptions(options, allUnits);

    if (options.version) {
        console.log(`Version filter: through ${options.version} (${allUnits.length} units, ${bosses.length} bosses)\n`);
    }

    // ============================================================================
    // BOSS SELECTION
    // ============================================================================

    if (!options.bosses && !options.queryBosses) {
        console.error("ERROR: Boss filter required. Use --bosses/-b <filter> to specify bosses.");
        console.log("Example: node deadly-assault.js -b butch,ucc,pomp");
        console.log("\nAvailable bosses:");
        bosses.forEach(b => console.log(`  - ${b.name}`));
        return;
    }

    const bossFilter = options.bosses || options.queryBosses?.join(',');
    const filteredBossObjects = filterBosses(bosses, bossFilter);

    if (filteredBossObjects.length !== 3) {
        console.error(`ERROR: Boss filter must match exactly 3 bosses. Found ${filteredBossObjects.length}:`);
        filteredBossObjects.forEach(b => console.log(`  - ${b.name}`));
        if (filteredBossObjects.length < 3) {
            console.log("\nAvailable bosses:");
            bosses.forEach(b => console.log(`  - ${b.name}`));
        }
        return;
    }

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    const DEBUG = options.debug;

    const selectedBossObjects = filteredBossObjects;
    const selectedBossNames = selectedBossObjects.map(b => b.name);

    // Explicit teams mode: skip normal pipeline
    if (options.teams) {
        console.log("===== Deadly Assault Team Builder =====\n");
        console.log("Selected Bosses:");
        for (const boss of selectedBossObjects) {
            console.log(`  - ${boss.name}`);
        }
        console.log();

        const { teams: parsedTeams, warnings } = parseTeams(options.teams, allUnits, { preview: options.preview });
        for (const w of warnings) console.warn(`WARNING: ${w}`);

        console.log(`Explicit teams: ${parsedTeams.length}`);
        for (const { label } of parsedTeams) console.log(`  - ${label}`);
        console.log();

        const combinations = evaluateExplicitTeams(parsedTeams, selectedBossObjects, options, calibration);

        if (combinations.length === 0) {
            console.log('No valid non-overlapping assignments found for the given teams.');
            return;
        }

        const displayCount = Math.min(options.depth, combinations.length);
        console.log(`===== Top ${displayCount} Team Allocations =====\n`);

        for (let i = 0; i < displayCount; i++) {
            const combo = combinations[i];
            console.log(`Combination #${i + 1} (Total: ${combo.totalScore.toFixed(0)})`);
            for (const assignment of combo.assignments) {
                const shortBoss = assignment.boss.replace("Notorious ", "").substring(0, 20).padEnd(20);
                console.log(`  ${shortBoss}: ${assignment.label} (${assignment.score.toFixed(1)}, raw ${assignment.raw.toFixed(1)}, ${assignment.archetype ?? 'none'})`);
            }
            console.log();
        }

        if (combinations.length > options.depth) {
            console.log(`... and ${combinations.length - options.depth} more combinations.`);
        }
        return;
    }

    // Developer-only: Additional units not in units.json
    const DEVELOPER_UNITS = [];

    if (options.include && options.include.length > 0) {
        console.log(`Solutions must include at least one of: ${options.include.join(', ')}`);
    }

    const { availableUnits, universalUnits } = buildAvailableUnits(allUnits, options, roster, {
        extraUnits: DEVELOPER_UNITS
    });

    if (DEBUG) {
        const modeNote = options.units ? " (whitelist mode)" : (options.onlyMine ? " (personal roster)" : "");
        console.log(`Using ${availableUnits.length} units${modeNote}\n`);
    }

    // ============================================================================
    // MAIN EXECUTION
    // ============================================================================

    console.log("===== Deadly Assault Team Builder =====\n");

    console.log("Selected Bosses:");
    for (const boss of selectedBossObjects) {
        if (DEBUG) {
            const weakStr = getBossWeaknesses(boss).join(", ") || "none";
            const resStr = getBossResistances(boss).join(", ") || "none";
            const shillStr = getBossShill(boss) || "none";
            console.log(`  ${boss.name}`);
            console.log(`    Weak: ${weakStr} | Resist: ${resStr} | Shill: ${shillStr} | Assists: ${getBossAssists(boss)}`);
        } else {
            console.log(`  - ${boss.name}`);
        }
    }
    console.log();

    const { threeCharTeams, teamLabels, extendedCount, universalUnitObjects } = buildTeams(availableUnits, universalUnits);

    if (universalUnitObjects.length > 0) {
        if (DEBUG) console.log(`Universal units: ${universalUnitObjects.map(u => u.name).join(", ")}`);
        if (DEBUG && extendedCount > 0) console.log(`Extended ${extendedCount} teams using universal units`);
    }
    if (DEBUG) console.log(`Total 3-character teams: ${teamLabels.length}\n`);

    // Score teams for each boss
    const viableTeamsByBoss = {};
    const lenientBosses = [];

    for (const boss of selectedBossObjects) {
        viableTeamsByBoss[boss.name] = [];

        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            const scored = scoreCalibrated(team, boss, { debug: options.debug }, calibration);
            if (scored && rawScorePassesFilter(scored.score, options)) {
                viableTeamsByBoss[boss.name].push({ label, team, ...scored });
            }
        }

        if (viableTeamsByBoss[boss.name].length === 0) {
            lenientBosses.push(boss.name);
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const scored = scoreCalibrated(team, boss, { lenient: true, debug: options.debug }, calibration);
                if (scored && rawScorePassesFilter(scored.score, options)) {
                    viableTeamsByBoss[boss.name].push({ label, team, ...scored, lenient: true });
                }
            }
        }

        viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);
        if (DEBUG) {
            const lenientNote = lenientBosses.includes(boss.name) ? " (LENIENT)" : "";
            console.log(`${boss.name}: ${viableTeamsByBoss[boss.name].length} viable teams${lenientNote}`);
            printDpsBucketDiagnostics(boss, viableTeamsByBoss[boss.name]);
        }
    }

    if (lenientBosses.length > 0) {
        console.log(`⚠️  No on-element DPS for: ${lenientBosses.join(", ")} - using fallback mode`);
    }
    if (DEBUG) console.log();

    if (DEBUG) {
        console.log("===== Top Teams Per Boss =====\n");
        const TOP_DISPLAY = 7;
        for (const boss of selectedBossObjects) {
            console.log(`${boss.name}:`);
            const topTeams = viableTeamsByBoss[boss.name].slice(0, TOP_DISPLAY);
            topTeams.forEach((t, i) => {
                console.log(`  #${i + 1}: ${t.label} (${t.score.toFixed(1)}, raw ${t.raw.toFixed(1)}, ${t.archetype ?? 'none'})`);
            });
            console.log();
        }
    }

    // Find exclusive combinations (shared solver — same algorithm as the webapp)
    let { combinations } = solveDeadlyAssault({
        viableTeamsByBoss,
        bossNames: selectedBossNames,
        bossObjects: selectedBossObjects,
        teamLabels,
        threeCharTeams,
        scoreLenient: (team, boss) => {
            // Contract kept exactly as before (returns a bare number, or null): this callback
            // is also implemented by the web page against the same shared solver, and changing
            // the shape here without touching the page would silently break it.
            const scored = scoreCalibrated(team, boss, { lenient: true, debug: options.debug }, calibration);
            return (scored && rawScorePassesFilter(scored.score, options)) ? scored.score : null;
        },
        diverseLimit: DISPLAY_LIMIT,
        log: DEBUG ? console.log : () => {}
    });

    if (options.include && options.include.length > 0) {
        const beforeIncludeFilter = combinations.length;
        combinations = combinations.filter(combo => {
            const allUnitsInSolution = new Set();
            for (const assignment of combo.assignments) {
                for (const unit of assignment.team) {
                    allUnitsInSolution.add(unit.name);
                }
            }
            return options.include.some(req => allUnitsInSolution.has(req));
        });
        if (DEBUG && beforeIncludeFilter - combinations.length > 0) {
            console.log(`Include filter removed ${beforeIncludeFilter - combinations.length} combinations`);
        }
    }

    if (DEBUG) {
        console.log(`Found ${combinations.length} valid team allocations\n`);
    }

    if (combinations.length === 0) {
        console.log("No valid combinations found even in lenient mode. Try different bosses or expand your unit pool.");
        return;
    }

    // Display results
    const displayCount = Math.min(options.depth, combinations.length);
    console.log(`===== Top ${displayCount} Team Allocations =====\n`);

    for (let i = 0; i < displayCount; i++) {
        const combo = combinations[i];
        const ranksUsed = combo.assignments.map(a => a.rank).join('+');
        console.log(`Combination #${i + 1} (Ranks: ${ranksUsed}, Total: ${combo.totalScore.toFixed(0)})`);

        for (const assignment of combo.assignments) {
            const shortBoss = assignment.boss.replace("Notorious ", "").substring(0, 20).padEnd(20);
            console.log(`  ${shortBoss}: [#${assignment.rank}] ${assignment.label} (${assignment.score.toFixed(1)})`);
        }

        console.log();
    }

    if (combinations.length > options.depth) {
        console.log(`... and ${combinations.length - options.depth} more combinations.`);
        console.log(`Use --depth or -N to see more (e.g., -10 for top 10).`);
    }
}

main().catch(console.error);
