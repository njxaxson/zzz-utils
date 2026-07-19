/**
 * Deadly Assault combination solver.
 * Single source of truth for turning per-boss viable teams into the two result
 * views shown by both the webapp (deadly-assault page) and the deadly-assault CLI:
 * ranked non-overlapping combinations, and DPS-diverse alternative strategies.
 * Falls back to a lenient re-score of all teams if neither view finds anything.
 */

import { findExclusiveCombinations } from './team-builder.js';
import { findDiverseStrategies as findDiverseStrategiesCore } from './dps-buckets.js';

export const DEFAULT_DIVERSE_LIMIT = 5;

function runDiverseStrategies(viableTeamsByBoss, bossNames, limit, log) {
    const result = findDiverseStrategiesCore(viableTeamsByBoss, bossNames, limit);
    log(`Diversity selection: ${result.totalStrategies} total strategies, per-boss floor ${result.perBossFloor.toFixed(0)}`);
    return result.selected;
}

/**
 * @param {Object} params
 * @param {Object} params.viableTeamsByBoss - Map of boss name -> array of {label, team, score}. Mutated in place on lenient fallback.
 * @param {string[]} params.bossNames - 3 boss names in order
 * @param {Object[]} params.bossObjects - 3 boss objects in order
 * @param {string[]} params.teamLabels - All candidate 3-char team labels
 * @param {Object} params.threeCharTeams - Map of label -> team array
 * @param {(team: Object, boss: Object) => number|null} params.scoreLenient - Re-scores a team in lenient mode; return null to exclude it
 * @param {number} [params.diverseLimit]
 * @param {(msg: string) => void} [params.log]
 * @returns {{ combinations: Object[], diverseResults: Object[] }}
 */
export function solveDeadlyAssault({
    viableTeamsByBoss, bossNames, bossObjects, teamLabels, threeCharTeams,
    scoreLenient, diverseLimit = DEFAULT_DIVERSE_LIMIT, log = () => {}
}) {
    let combinations = findExclusiveCombinations(viableTeamsByBoss, bossNames);
    let diverseResults = runDiverseStrategies(viableTeamsByBoss, bossNames, diverseLimit, log);

    if (combinations.length === 0 && diverseResults.length === 0) {
        log('⚠️ No non-overlapping combinations found — retrying all bosses in lenient mode...');
        for (const boss of bossObjects) {
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const score = scoreLenient(team, boss);
                if (score === null) continue;

                const existing = viableTeamsByBoss[boss.name].find(t => t.label === label);
                if (existing) {
                    if (score > existing.score) existing.score = score;
                    existing.lenient = true;
                } else {
                    viableTeamsByBoss[boss.name].push({ label, team, score, lenient: true });
                }
            }
            viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);
            log(`   ${boss.name}: ${viableTeamsByBoss[boss.name].length} viable teams (after lenient)`);
        }

        combinations = findExclusiveCombinations(viableTeamsByBoss, bossNames);
        diverseResults = runDiverseStrategies(viableTeamsByBoss, bossNames, diverseLimit, log);
        log(`After lenient retry — Combinations: ${combinations.length}, Diverse: ${diverseResults.length}`);
    }

    return { combinations, diverseResults };
}
