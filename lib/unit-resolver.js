/**
 * Universal unit name resolution for CLI options.
 * Provides fuzzy matching: exact name, ID, alias, whole-word match.
 */

/**
 * Resolve a single token to a unit object.
 * Matching cascade:
 *   1. Case-insensitive exact name match
 *   2. Case-insensitive unit ID match
 *   3. Case-insensitive alias match
 *   4. Case-insensitive whole-word match on name parts
 *
 * @param {string} token - User-supplied name/alias/id
 * @param {Object[]} allUnits - Full unit list from units.json
 * @returns {Object} The matched unit object
 * @throws {Error} On no match or ambiguous match
 */
export function resolveUnit(token, allUnits) {
    const t = token.trim();
    if (!t) throw new Error(`Empty unit name`);
    const lower = t.toLowerCase();

    // 1. Exact name (case-insensitive)
    const byName = allUnits.filter(u => u.name.toLowerCase() === lower);
    if (byName.length === 1) return byName[0];

    // 2. Unit ID (case-insensitive)
    const byId = allUnits.filter(u => u.id.toLowerCase() === lower);
    if (byId.length === 1) return byId[0];

    // 3. Alias (case-insensitive)
    const byAlias = allUnits.filter(u =>
        (u.aliases || []).some(a => a.toLowerCase() === lower)
    );
    if (byAlias.length === 1) return byAlias[0];
    if (byAlias.length > 1) {
        const names = byAlias.map(u => u.name).join(', ');
        throw new Error(`Ambiguous alias "${t}" matches: ${names}`);
    }

    // 4. Whole-word match on name parts
    const byWord = allUnits.filter(u =>
        u.name.split(/\s+/).some(part => part.toLowerCase() === lower)
    );
    if (byWord.length === 1) return byWord[0];
    if (byWord.length > 1) {
        const names = byWord.map(u => u.name).join(', ');
        throw new Error(`Ambiguous name part "${t}" matches: ${names}`);
    }

    throw new Error(`Unknown unit "${t}" — no match by name, ID, alias, or name part`);
}

/**
 * Resolve a list of tokens to canonical unit names.
 *
 * @param {string[]} tokens - Array of user-supplied names
 * @param {Object[]} allUnits - Full unit list
 * @returns {string[]} Array of canonical unit names
 */
function resolveList(tokens, allUnits) {
    if (!tokens || tokens.length === 0) return tokens;
    return tokens.map(tok => resolveUnit(tok, allUnits).name);
}

/**
 * Normalize all name-based fields in parsed CLI options to canonical unit names.
 * Mutates options in place. Should be called once after data is loaded.
 *
 * @param {Object} options - Parsed CLI options (from parseArgs)
 * @param {Object[]} allUnits - Full unit list from units.json
 */
export function resolveOptions(options, allUnits) {
    if (options.units) {
        options.units = resolveList(options.units, allUnits);
    }
    if (options.exclude) {
        options.exclude = resolveList(options.exclude, allUnits);
    }
    if (options.include) {
        options.include = resolveList(options.include, allUnits);
    }
    if (options.flex) {
        options.flex = resolveList(options.flex, allUnits);
    }
    if (options.additions) {
        options.additions = resolveList(options.additions, allUnits);
    }
    if (options.removals) {
        options.removals = resolveList(options.removals, allUnits);
    }
}
