/**
 * Boss matching, filtering, and variation-resolution utilities.
 */

import { resolveBossVariation } from '../app/public/lib/common/team-scorer.js';

/**
 * Check if a boss matches a search term (case-insensitive, partial match).
 */
export function matchBoss(boss, term) {
    const lower = term.toLowerCase();
    return boss.name.toLowerCase().includes(lower) ||
        (boss.shortName && boss.shortName.toLowerCase().includes(lower)) ||
        (boss.id && boss.id.toLowerCase().includes(lower));
}

/**
 * Filter bosses by a comma-separated filter string.
 * Supports the optional "boss:variation" suffix syntax — e.g. "butcher:raging"
 * will match the Butcher boss and resolve the "raging" variation.
 * Returns deduplicated matches preserving first-match order.
 *
 * @param {Object[]} bosses - All bosses from bosses.json
 * @param {string} filterString - Comma-separated search terms
 * @returns {Object[]} Matching (and variation-resolved) bosses
 */
export function filterBosses(bosses, filterString) {
    const terms = filterString.split(',').map(f => f.trim());
    const matched = [];

    for (const term of terms) {
        const colonIdx = term.indexOf(':');
        const bossTerm = colonIdx >= 0 ? term.slice(0, colonIdx).trim() : term;
        const variationId = colonIdx >= 0 ? term.slice(colonIdx + 1).trim() : null;

        for (const boss of bosses) {
            const alreadyIncluded = matched.some(
                m => m.id === boss.id && m._variationId === (variationId || undefined)
            );
            if (matchBoss(boss, bossTerm) && !alreadyIncluded) {
                matched.push(variationId ? resolveBossVariation(boss, variationId) : boss);
            }
        }
    }

    return matched;
}
