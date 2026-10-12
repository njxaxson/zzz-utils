/**
 * Banner schedule helpers shared by the pull page and the CLI.
 */

/**
 * Globally dedupe IDs: active order first, then upcoming; later duplicates removed.
 * @returns {{ activeIds: string[], upcomingIds: string[], fullOrder: string[] }}
 */
export function normalizeBannerSchedule(raw) {
    const seen = new Set();
    const activeIds = [];
    for (const id of raw?.active ?? []) {
        if (typeof id !== 'string') continue;
        const k = id.trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        activeIds.push(k);
    }
    const upcomingIds = [];
    for (const id of raw?.upcoming ?? []) {
        if (typeof id !== 'string') continue;
        const k = id.trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        upcomingIds.push(k);
    }
    return { activeIds, upcomingIds, fullOrder: [...activeIds, ...upcomingIds] };
}
