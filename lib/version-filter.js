/**
 * Filters units/bosses by release, for the --update/-v CLI option.
 *
 * `units.json`'s `released` is a string ("2.1"), `bosses.json`'s is a number (2.1) —
 * parseFloat normalizes both so the same comparison works against either file.
 */
export function filterByUpdate(items, maxUpdate) {
    if (maxUpdate == null) return items;
    const cutoff = parseFloat(maxUpdate);
    return items.filter(item => parseFloat(item.released) <= cutoff);
}
