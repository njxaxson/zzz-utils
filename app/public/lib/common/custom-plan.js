/**
 * Custom Deadly Assault plan: the agents a player picks per boss, before solving.
 *
 * Pure logic, no DOM, so the node test-bucketing suite exercises the same code the page runs.
 * A plan is `{ enabled, picks }` where `picks` is `{ [bossId]: unitId[] }` (0-3 ids per boss):
 * none = free boss, 1-2 = pinned, 3 = fixed team. Picks are keyed by boss ID so replacing one
 * selected boss does not wipe the picks made for the others.
 */

export const PLAN_TEAM_SIZE = 3;

export function createEmptyPlan() {
    return { enabled: false, picks: {} };
}

export function isPlanEmpty(plan) {
    return Object.values(plan.picks).every(ids => ids.length === 0);
}

/**
 * Drops anything that cannot be honoured: unknown bosses or agents, repeats within a boss,
 * and slots beyond three. Used on every load path (storage, share link), so a stale or edited
 * value degrades to "that pick is ignored" rather than an error.
 */
export function sanitizePicks(picks, allUnits, allBosses) {
    const unitIds = new Set(allUnits.map(u => u.id));
    const bossIds = new Set(allBosses.map(b => b.id));
    const clean = {};
    if (!picks || typeof picks !== 'object') return clean;

    for (const [bossId, ids] of Object.entries(picks)) {
        if (!bossIds.has(bossId) || !Array.isArray(ids)) continue;
        const valid = [...new Set(ids)].filter(id => unitIds.has(id)).slice(0, PLAN_TEAM_SIZE);
        if (valid.length > 0) clean[bossId] = valid;
    }
    return clean;
}

/**
 * Reasons a plan cannot be submitted. Only the selected bosses count: picks held for a boss
 * that is not currently chosen are dormant. The same agent twice is the one illegal input;
 * an unusual team is judged as it stands.
 */
export function getPlanProblems(plan, selectedBossIds, allUnits, allBosses) {
    if (!plan.enabled) return [];
    const problems = [];
    const bossesByUnit = new Map();

    for (const bossId of selectedBossIds) {
        for (const unitId of plan.picks[bossId] ?? []) {
            if (!bossesByUnit.has(unitId)) bossesByUnit.set(unitId, []);
            bossesByUnit.get(unitId).push(bossId);
        }
    }

    for (const [unitId, bossIds] of bossesByUnit) {
        if (bossIds.length < 2) continue;
        const unit = allUnits.find(u => u.id === unitId);
        const names = bossIds.map(id => allBosses.find(b => b.id === id)?.shortName ?? id);
        problems.push(`${unit?.name ?? unitId} is planned for ${names.join(' and ')}. An agent can only fight one boss.`);
    }
    return problems;
}

/**
 * The solver's `pinsByBoss` (`{ [bossName]: unitId[] }`), or null when the plan is off or has no
 * picks, which is exactly today's behaviour.
 */
export function planToPins(plan, selectedBossObjects) {
    if (!plan.enabled || isPlanEmpty(plan)) return null;
    const pins = {};
    for (const boss of selectedBossObjects) {
        pins[boss.name] = [...(plan.picks[boss.id] ?? [])];
    }
    return pins;
}

/**
 * Roster states with every pinned agent counted as owned, so a player can ask "what if I had
 * this agent". Only pinned agents are added; unpinned unowned agents stay out of the solve.
 */
export function getEffectiveUnitStates(unitStates, pinsByBoss) {
    const states = { ...unitStates };
    for (const ids of Object.values(pinsByBoss ?? {})) {
        for (const id of ids) states[id] = { ...states[id], owned: true };
    }
    return states;
}
