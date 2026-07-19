/**
 * DPS Bucketing and Diversity Selection for Deadly Assault.
 *
 * Groups teams by their primary DPS archetype (role + element + tier band),
 * then selects diverse strategies that surface meaningfully different options
 * rather than minor support variations of the same DPS assignment.
 *
 * Shared between the webapp (deadly-assault page) and the deadly-assault CLI script.
 */

import { teamsOverlap } from './team-builder.js';
import { ELEMENTS, DPS_ROLES } from './constants.js';

export const DEFAULT_BUCKET_CAP = 15;
export const DEFAULT_PER_BOSS_FLOOR_RATIO = 0.5;
export const DEFAULT_MIN_RESULTS_BEFORE_FLOOR = 3;

export function isPrimaryDps(u) {
    const dpsRole = u.tags.find(t => DPS_ROLES.includes(t));
    const isSubdps = u.synergy && u.synergy.tags && u.synergy.tags.includes('subdps');
    return dpsRole && !isSubdps;
}

export function unitFingerprint(u) {
    const role = u.tags.find(t => DPS_ROLES.includes(t));
    const element = u.tags.find(t => ELEMENTS.includes(t));
    const tier = u.tier < 2 ? 'hi' : 'lo';
    return `${role}:${element}:${tier}`;
}

export function getTeamDpsBuckets(team) {
    return team.filter(isPrimaryDps).map(u => unitFingerprint(u));
}

export function teamDpsFingerprint(team) {
    return getTeamDpsBuckets(team).sort().join('|');
}

export function getPrimaryDpsNames(team) {
    return team.filter(isPrimaryDps).map(u => u.name);
}

/**
 * Find diverse strategies across 3 bosses using DPS-archetype bucketing.
 *
 * @param {Object} viableTeamsByBoss - Map of boss name -> sorted array of { label, team, score }
 * @param {string[]} bossNames - Array of 3 boss names
 * @param {number} limit - Max results to return
 * @param {Object} [config]
 * @param {number} [config.bucketCap] - Max teams per bucket (default 15)
 * @param {number} [config.perBossFloorRatio] - Floor ratio applied after initial results (default 0.5)
 * @param {number} [config.minResultsBeforeFloor] - Results before floor enforcement (default 3)
 * @returns {{ selected: Object[], totalStrategies: number, candidateCount: number, perBossFloor: number }}
 */
export function findDiverseStrategies(viableTeamsByBoss, bossNames, limit, config = {}) {
    const bucketCap = config.bucketCap ?? DEFAULT_BUCKET_CAP;
    const perBossFloorRatio = config.perBossFloorRatio ?? DEFAULT_PER_BOSS_FLOOR_RATIO;
    const minResultsBeforeFloor = config.minResultsBeforeFloor ?? DEFAULT_MIN_RESULTS_BEFORE_FLOOR;

    const bucketsByBoss = {};
    for (const bossName of bossNames) {
        const buckets = new Map();
        for (const entry of viableTeamsByBoss[bossName]) {
            const fps = getTeamDpsBuckets(entry.team);
            for (const fp of fps) {
                if (!fp) continue;
                if (!buckets.has(fp)) buckets.set(fp, []);
                const bucket = buckets.get(fp);
                if (bucket.length < bucketCap) bucket.push(entry);
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
                            score: bestTriple[i].score,
                            lenient: !!bestTriple[i].lenient
                        }))
                    });
                }
            }
        }
    }

    strategies.sort((a, b) => b.totalScore - a.totalScore);
    if (strategies.length === 0) {
        return { selected: [], totalStrategies: 0, candidateCount: 0, perBossFloor: 0 };
    }

    const best = strategies[0];
    const avgBossScore = best.totalScore / bossNames.length;
    const perBossFloor = avgBossScore * perBossFloorRatio;

    const selected = [best];
    const allCandidates = strategies.slice(1);

    const seenDpsPerBoss = bossNames.map(() => new Set());
    best.dpsKey.split('||').forEach((fp, i) => seenDpsPerBoss[i].add(fp));

    while (selected.length < limit && allCandidates.length > 0) {
        const enforceFloor = selected.length >= minResultsBeforeFloor;
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

    return {
        selected,
        totalStrategies: strategies.length,
        candidateCount: allCandidates.length + selected.length - 1,
        perBossFloor
    };
}
