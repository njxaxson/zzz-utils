/**
 * Builds the available-units list and unit-states map from CLI options.
 * Shared logic for whitelist, personal roster, preview filtering, exclusions,
 * and +/- overrides.
 */

const DEFAULT_FLEX = ['Nicole'];
const LOCKED_STARTERS = ['nicole', 'anby', 'billy'];

/**
 * Build the filtered unit list for team-building scripts.
 *
 * @param {Object[]} allUnits - Complete unit list from units.json
 * @param {Object} options - Parsed CLI options
 * @param {Object} roster - Personal roster from roster.json
 * @param {Object} [config]
 * @param {Object[]} [config.extraUnits] - Developer/hypothetical units to append
 * @returns {{ availableUnits: Object[], universalUnits: string[] }}
 */
export function buildAvailableUnits(allUnits, options, roster, config = {}) {
    let availableUnits;

    if (options.units && options.units.length > 0) {
        availableUnits = allUnits.filter(u =>
            options.units.some(n => n.toLowerCase() === u.name.toLowerCase())
        );
    } else if (options.onlyMine) {
        availableUnits = allUnits.filter(u => roster.hasOwnProperty(u.name));
    } else {
        availableUnits = [...allUnits];
    }

    if (config.extraUnits && config.extraUnits.length > 0) {
        availableUnits = availableUnits.concat(config.extraUnits);
    }

    for (const name of (options.additions || [])) {
        const unit = allUnits.find(u => u.name.toLowerCase() === name.toLowerCase());
        if (unit && !availableUnits.some(au => au.id === unit.id)) {
            availableUnits.push(unit);
        } else if (!unit) {
            console.warn(`WARNING: Unknown unit "${name}" in + override`);
        }
    }

    for (const name of (options.removals || [])) {
        const unit = allUnits.find(u => u.name.toLowerCase() === name.toLowerCase());
        if (unit) {
            availableUnits = availableUnits.filter(u => u.id !== unit.id);
        } else {
            console.warn(`WARNING: Unknown unit "${name}" in - override`);
        }
    }

    if (!options.preview) {
        const before = availableUnits.length;
        availableUnits = availableUnits.filter(u => u.available !== false);
        const filtered = before - availableUnits.length;
        if (filtered > 0) {
            console.log(`Filtered out ${filtered} preview/unavailable unit(s) (use --preview to include)`);
        }
    }

    if (options.exclude && options.exclude.length > 0) {
        availableUnits = availableUnits.filter(u =>
            !options.exclude.some(n => n.toLowerCase() === u.name.toLowerCase())
        );
        console.log(`Excluding units: ${options.exclude.join(', ')}`);
    }

    const universalUnits = options.flex || DEFAULT_FLEX;

    return { availableUnits, universalUnits };
}

/**
 * Build unit-states map for pull-engine analysis.
 *
 * @param {Object[]} allUnits - Complete unit list
 * @param {Object} options - Parsed CLI options
 * @param {Object} roster - Personal roster from roster.json
 * @returns {{ unitStates: Object, ownedUnits: Object[] }}
 */
export function buildUnitStates(allUnits, options, roster) {
    const unitStates = {};
    for (const unit of allUnits) {
        const isAvailable = unit.available !== false;
        let owned;

        if (options.units) {
            owned = options.units.some(n => n.toLowerCase() === unit.name.toLowerCase());
        } else if (options.onlyMine) {
            owned = roster.hasOwnProperty(unit.name);
        } else {
            owned = isAvailable && (unit.rank === 'A' || (unit.rank === 'S' && !unit.limited));
        }

        if (LOCKED_STARTERS.includes(unit.id)) owned = true;
        unitStates[unit.id] = { owned };
    }

    for (const name of (options.additions || [])) {
        const unit = allUnits.find(u => u.name.toLowerCase() === name.toLowerCase());
        if (unit) {
            unitStates[unit.id].owned = true;
        } else {
            console.warn(`WARNING: Unknown unit "${name}" in + override`);
        }
    }

    for (const name of (options.removals || [])) {
        const unit = allUnits.find(u => u.name.toLowerCase() === name.toLowerCase());
        if (unit) {
            if (LOCKED_STARTERS.includes(unit.id)) {
                console.warn(`WARNING: Cannot remove locked starter "${name}"`);
            } else {
                unitStates[unit.id].owned = false;
            }
        } else {
            console.warn(`WARNING: Unknown unit "${name}" in - override`);
        }
    }

    const ownedUnits = allUnits.filter(u => unitStates[u.id].owned);
    return { unitStates, ownedUnits };
}
