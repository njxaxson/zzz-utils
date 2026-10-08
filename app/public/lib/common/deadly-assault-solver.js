/**
 * Deadly Assault combination solver.
 * Single source of truth for turning per-boss viable teams into the two result
 * views shown by both the webapp (deadly-assault page) and the deadly-assault CLI:
 * ranked non-overlapping combinations, and DPS-diverse alternative strategies.
 * Falls back to a lenient re-score of all teams if neither view finds anything.
 *
 * Optional per-boss PINS (webapp "plan your own") restrict which teams a boss may use; see
 * documentation/bucketing/deadly-assault.md. With no pins every code path below is the
 * original one.
 */

import { findExclusiveCombinations, sortTeamByRole, getTeamLabel } from './team-builder.js';
import { findDiverseStrategies as findDiverseStrategiesCore } from './dps-buckets.js';

export const DEFAULT_DIVERSE_LIMIT = 5;

// Pinned lists are short and share their best supports, so the usual top-20 cut can leave no
// non-overlapping triple. Only then is the pool widened (a wide pool is slow and never needed
// otherwise). [BUCK-02]
export const PINNED_TOP_N = 60;
const UNSCORABLE_CAP = 20;
const TEAM_SIZE = 3;

function runDiverseStrategies(viableTeamsByBoss, bossNames, limit, log) {
    const result = findDiverseStrategiesCore(viableTeamsByBoss, bossNames, limit);
    log(`Diversity selection: ${result.totalStrategies} total strategies, per-boss floor ${result.perBossFloor.toFixed(0)}`);
    return result.selected;
}

// Pins

/** True when at least one boss has a pinned unit. `pinsByBoss` is `{ [bossName]: unitId[] }`. */
export function hasPins(pinsByBoss) {
    return !!pinsByBoss && Object.values(pinsByBoss).some(ids => ids && ids.length > 0);
}

function claimedByOtherBosses(bossName, pinsByBoss) {
    const claimed = new Set();
    for (const [name, ids] of Object.entries(pinsByBoss)) {
        if (name !== bossName) for (const id of ids ?? []) claimed.add(id);
    }
    return claimed;
}

/**
 * A team may serve a boss only if it holds every unit pinned to that boss and none pinned to
 * another. Assumes no unit is pinned to two bosses (the page rejects that before solving).
 */
export function teamAllowedForBoss(team, bossName, pinsByBoss) {
    if (!hasPins(pinsByBoss)) return true;
    const ids = team.map(u => u.id);
    const own = pinsByBoss[bossName] ?? [];
    const others = claimedByOtherBosses(bossName, pinsByBoss);
    return own.every(id => ids.includes(id)) && !ids.some(id => others.has(id));
}

function* chooseUnits(units, k, start = 0) {
    if (k === 0) { yield []; return; }
    for (let i = start; i <= units.length - k; i++) {
        for (const rest of chooseUnits(units, k - 1, i + 1)) yield [units[i], ...rest];
    }
}

function buildTeam(units) {
    const team = [...units];
    sortTeamByRole(team);
    return team;
}

function resolvePins(ids, unitPool) {
    return ids.map(id => {
        const unit = unitPool.find(u => u.id === id);
        if (!unit) throw new Error(`Pinned unit "${id}" is not in the unit pool`);
        return unit;
    });
}

// Every team holding the pins, completed from the pool. Join legality is ignored on purpose:
// a player who pins an agent no legal team can use still gets a (poor) answer, not a refusal.
function completionTeams(pinUnits, bossName, pinsByBoss, unitPool, excludeIds = new Set()) {
    const others = claimedByOtherBosses(bossName, pinsByBoss);
    const pinIds = new Set(pinUnits.map(u => u.id));
    const fillers = unitPool.filter(u => !pinIds.has(u.id) && !others.has(u.id) && !excludeIds.has(u.id));
    const teams = {};
    for (const extra of chooseUnits(fillers, TEAM_SIZE - pinUnits.length)) {
        const team = buildTeam([...pinUnits, ...extra]);
        teams[getTeamLabel(team)] = team;
    }
    return teams;
}

/**
 * The teams one boss may be scored against, as `{ label: unit[] }`. Callers score these (not the
 * whole roster) so a pin shrinks the scoring work, not just the search.
 *
 *   no pins      every legal team that avoids other bosses' pins
 *   1-2 pins     legal teams holding the pins; if none exist, every completion from the pool
 *   3 pins       exactly that team, legal or not
 */
export function getCandidateTeamsForBoss({ bossName, pinsByBoss, threeCharTeams, unitPool }) {
    const pins = pinsByBoss?.[bossName] ?? [];
    if (pins.length >= TEAM_SIZE) {
        const team = buildTeam(resolvePins(pins.slice(0, TEAM_SIZE), unitPool));
        return { [getTeamLabel(team)]: team };
    }

    const legal = {};
    for (const label in threeCharTeams) {
        if (teamAllowedForBoss(threeCharTeams[label], bossName, pinsByBoss)) {
            legal[label] = threeCharTeams[label];
        }
    }
    if (pins.length === 0 || Object.keys(legal).length > 0) return legal;
    return completionTeams(resolvePins(pins, unitPool), bossName, pinsByBoss, unitPool);
}

// A team nothing can score, even leniently. Kept (at 0) so the player's plan is still answered.
function unscorableEntries(candidates) {
    return Object.entries(candidates).slice(0, UNSCORABLE_CAP)
        .map(([label, team]) => ({ label, team, score: 0, lenient: true, unscorable: true }));
}

// Last resort when no non-overlapping triple exists: build one boss at a time, most-pinned
// first, so a result always comes back. Pinned bosses try every completion; a free boss takes
// whatever units remain. Needs >= 9 units in the pool.
function greedyFallback({ bossNames, bossObjects, viableTeamsByBoss, pinsByBoss, unitPool, scoreLenient }) {
    const pinCount = name => (pinsByBoss[name] ?? []).length;
    const order = bossNames.map((_, i) => i).sort((a, b) => pinCount(bossNames[b]) - pinCount(bossNames[a]));
    const used = new Set();
    const chosen = {};

    for (const i of order) {
        const name = bossNames[i];
        let entry = viableTeamsByBoss[name].find(e => !e.team.some(u => used.has(u.id)));

        if (!entry) {
            const pinUnits = resolvePins(pinsByBoss[name] ?? [], unitPool);
            const candidates = pinUnits.length > 0
                ? Object.values(completionTeams(pinUnits, name, pinsByBoss, unitPool, used))
                : [];
            if (candidates.length === 0) {
                const others = claimedByOtherBosses(name, pinsByBoss);
                const spare = unitPool.filter(u => !used.has(u.id) && !others.has(u.id));
                if (spare.length < TEAM_SIZE) return null;
                candidates.push(buildTeam(spare.slice(0, TEAM_SIZE)));
            }
            for (const team of candidates) {
                const score = scoreLenient(team, bossObjects[i]);
                if (score !== null && (!entry || score > entry.score)) {
                    entry = { label: getTeamLabel(team), team, score, lenient: true };
                }
            }
            entry ??= { label: getTeamLabel(candidates[0]), team: candidates[0], score: 0, lenient: true, unscorable: true };
        }

        entry.team.forEach(u => used.add(u.id));
        chosen[name] = entry;
    }

    const assignments = bossNames.map(name => {
        const e = chosen[name];
        return { boss: name, team: e.team, label: e.label, score: e.score, rank: 0, lenient: true, unscorable: !!e.unscorable };
    });
    return {
        totalScore: assignments.reduce((sum, a) => sum + a.score, 0),
        priority: 0, rankSum: 0, maxRank: 0, assignments
    };
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
 * @param {Object} [params.pinsByBoss] - `{ [bossName]: unitId[] }`; a boss with 1-2 ids must use them, with 3 is fixed
 * @param {Object[]} [params.unitPool] - Every unit a team may draw on (required with pins)
 * @returns {{ combinations: Object[], diverseResults: Object[] }}
 */
export function solveDeadlyAssault({
    viableTeamsByBoss, bossNames, bossObjects, teamLabels, threeCharTeams,
    scoreLenient, diverseLimit = DEFAULT_DIVERSE_LIMIT, log = () => {},
    pinsByBoss = null, unitPool = []
}) {
    const pinned = hasPins(pinsByBoss);
    const candidatesByBoss = {};

    // Default cut first; with pins, widen once before giving up on this list.
    const search = () => {
        let found = findExclusiveCombinations(viableTeamsByBoss, bossNames);
        if (pinned && found.length === 0) {
            found = findExclusiveCombinations(viableTeamsByBoss, bossNames, PINNED_TOP_N);
        }
        return found;
    };

    if (pinned) {
        for (const name of bossNames) {
            candidatesByBoss[name] = getCandidateTeamsForBoss({ bossName: name, pinsByBoss, threeCharTeams, unitPool });
            viableTeamsByBoss[name] = viableTeamsByBoss[name]
                .filter(e => teamAllowedForBoss(e.team, name, pinsByBoss));
            if (viableTeamsByBoss[name].length === 0) {
                viableTeamsByBoss[name] = unscorableEntries(candidatesByBoss[name]);
                log(`   ${name}: pinned teams cannot be scored, keeping them at 0`);
            }
        }
    }

    let combinations = search();
    let diverseResults = runDiverseStrategies(viableTeamsByBoss, bossNames, diverseLimit, log);

    if (combinations.length === 0 && diverseResults.length === 0) {
        log('⚠️ No non-overlapping combinations found — retrying all bosses in lenient mode...');
        for (const boss of bossObjects) {
            const retryTeams = pinned ? candidatesByBoss[boss.name] : threeCharTeams;
            for (const label of pinned ? Object.keys(retryTeams) : teamLabels) {
                const team = retryTeams[label];
                const score = scoreLenient(team, boss);
                if (score === null) continue;

                const existing = viableTeamsByBoss[boss.name].find(t => t.label === label);
                if (existing) {
                    if (score > existing.score) existing.score = score;
                    existing.lenient = true;
                    delete existing.unscorable;
                } else {
                    viableTeamsByBoss[boss.name].push({ label, team, score, lenient: true });
                }
            }
            viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);
            log(`   ${boss.name}: ${viableTeamsByBoss[boss.name].length} viable teams (after lenient)`);
        }

        combinations = search();
        diverseResults = runDiverseStrategies(viableTeamsByBoss, bossNames, diverseLimit, log);
        log(`After lenient retry — Combinations: ${combinations.length}, Diverse: ${diverseResults.length}`);

        if (pinned && combinations.length === 0 && diverseResults.length === 0) {
            log('⚠️ Still nothing — building one allocation boss by boss...');
            const fallback = greedyFallback({
                bossNames, bossObjects, viableTeamsByBoss, pinsByBoss, unitPool, scoreLenient
            });
            if (fallback) {
                combinations = [fallback];
                diverseResults = [fallback];
            }
        }
    }

    return { combinations, diverseResults };
}
