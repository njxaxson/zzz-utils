/**
 * Joins a list for prose: "A", "A and B", "A, B, and C".
 */
export function joinList(items) {
    if (items.length <= 2) return items.join(' and ');
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
