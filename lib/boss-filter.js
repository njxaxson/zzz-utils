/**
 * Boss matching and filtering utilities.
 */

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
 * Returns deduplicated matches preserving first-match order.
 *
 * @param {Object[]} bosses - All bosses from bosses.json
 * @param {string} filterString - Comma-separated search terms
 * @returns {Object[]} Matching bosses
 */
export function filterBosses(bosses, filterString) {
    const terms = filterString.split(',').map(f => f.trim());
    const matched = [];

    for (const term of terms) {
        for (const boss of bosses) {
            if (matchBoss(boss, term) && !matched.some(m => m.name === boss.name)) {
                matched.push(boss);
            }
        }
    }

    return matched;
}
