/**
 * Favorite teams: the trios a player has starred, kept in this browser.
 *
 * Pure logic, no DOM. A team is three agent ids and order never matters, so it is identified by
 * its sorted ids ([FAV-01]). Only ids are stored, never names or scores; ids that no longer exist
 * stay in storage and are reported by `resolveTeam` so a page can say what is missing.
 */

export const FAVORITES_CAP = 12;
export const FAVORITES_STORAGE_KEY = 'zzz-favorites';
export const TEAM_SIZE = 3;

const ID_PATTERN = /^[a-z0-9_-]{1,32}$/;

export function teamKey(ids) {
    return [...ids].sort().join('|');
}

// Three distinct, well-formed ids, or null.
function cleanTeam(ids) {
    if (!Array.isArray(ids)) return null;
    const clean = [...new Set(ids.map(id => String(id).trim().toLowerCase()))];
    if (clean.length !== TEAM_SIZE || !clean.every(id => ID_PATTERN.test(id))) return null;
    return clean;
}

/** Drops anything that cannot be honoured: bad shapes, repeats, and teams past the cap. */
export function sanitizeTeams(teams, limit = FAVORITES_CAP) {
    if (!Array.isArray(teams)) return [];
    const seen = new Set();
    const clean = [];
    for (const ids of teams) {
        const team = cleanTeam(ids);
        if (!team || seen.has(teamKey(team))) continue;
        seen.add(teamKey(team));
        clean.push(team);
        if (clean.length === limit) break;
    }
    return clean;
}

export function loadFavorites(storage = globalThis.localStorage) {
    try {
        return sanitizeTeams(JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY))?.teams);
    } catch (e) {
        return [];
    }
}

export function saveFavorites(teams, storage = globalThis.localStorage) {
    try {
        storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ v: 1, teams }));
        return true;
    } catch (e) {
        console.warn('Failed to save favorites:', e);
        return false;
    }
}

export function isFavorite(teams, ids) {
    const key = teamKey(ids);
    return teams.some(team => teamKey(team) === key);
}

/**
 * Adds or removes one team, newest first. Returns `{ teams, added, full }`: `full` means the
 * team was not saved because the list is at the cap (removing is always allowed).
 */
export function toggleFavorite(teams, ids) {
    const key = teamKey(ids);
    if (isFavorite(teams, ids)) {
        return { teams: teams.filter(team => teamKey(team) !== key), added: false, full: false };
    }
    const team = cleanTeam(ids);
    if (!team) return { teams, added: false, full: false };
    if (teams.length >= FAVORITES_CAP) return { teams, added: false, full: true };
    return { teams: [team, ...teams], added: true, full: false };
}

/** Adds many teams (a shared list), keeping its order, skipping repeats and anything past the cap. */
export function addMany(teams, incoming) {
    const fresh = sanitizeTeams(incoming, Infinity).filter(team => !isFavorite(teams, team));
    const room = Math.max(0, FAVORITES_CAP - teams.length);
    const added = fresh.slice(0, room);
    return { teams: [...added, ...teams], added: added.length, skipped: fresh.length - added.length };
}

// Share link grammar matches `plan=`: '.' inside a team, ',' between teams.
export function encodeFavorites(teams) {
    return teams.map(team => team.join('.')).join(',');
}

export function decodeFavorites(encoded) {
    if (!encoded) return [];
    return sanitizeTeams(encoded.split(',').map(part => part.split('.')));
}

/** The team's units in saved order, plus the ids that no longer exist in `units.json`. */
export function resolveTeam(ids, allUnits) {
    const units = [];
    const missing = [];
    for (const id of ids) {
        const unit = allUnits.find(u => u.id === id);
        if (unit) units.push(unit);
        else missing.push(id);
    }
    return { units, missing };
}
