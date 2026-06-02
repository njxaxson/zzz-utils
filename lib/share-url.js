/**
 * Share URL decoding for ZZZ roster/boss sharing.
 * Node.js counterpart of the browser-side roster-share.js decoding.
 */

import { inflateSync } from 'node:zlib';

export function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return Buffer.from(base64, 'base64');
}

/**
 * Decode a compressed roster parameter into owned/universal unit name lists.
 * @param {string} encoded - The roster query-param value
 * @param {Object[]} allUnits - Full unit list from units.json
 * @returns {{ owned: string[], universal: string[] }}
 */
export function decodeRosterParam(encoded, allUnits) {
    let deltaString;
    try {
        if (encoded.startsWith('u_')) {
            deltaString = base64UrlDecode(encoded.slice(2)).toString('utf8');
        } else {
            deltaString = inflateSync(base64UrlDecode(encoded)).toString('utf8');
        }
    } catch (e) {
        console.error('Failed to decode roster from share URL:', e.message);
        process.exit(1);
    }

    const [ownedLimitedStr, notOwnedOthersStr, universalStr] = deltaString.split('|');
    const ownedLimited = new Set(ownedLimitedStr ? ownedLimitedStr.split(',').filter(Boolean) : []);
    const notOwnedOthers = new Set(notOwnedOthersStr ? notOwnedOthersStr.split(',').filter(Boolean) : []);
    const universalSet = new Set(universalStr ? universalStr.split(',').filter(Boolean) : []);

    const owned = [];
    const universal = [];
    for (const unit of allUnits) {
        //exclude Pyrois because he is only available for people who have sufficiently advanced the story,
        // and to ensure backwards compatibility with older links
        const defaultOwned = unit.rank === 'A' || (unit.rank === 'S' && !unit.limited && unit.id !== 'pyrois');
        let isOwned = defaultOwned;
        if (ownedLimited.has(unit.id)) isOwned = true;
        if (notOwnedOthers.has(unit.id)) isOwned = false;
        if (isOwned) owned.push(unit.name);

        const defaultUniversal = unit.id === 'nicole';
        let isUniversal = defaultUniversal;
        if (universalSet.has(unit.id)) isUniversal = true;
        if (isOwned && isUniversal) universal.push(unit.name);
    }

    return { owned, universal };
}

/**
 * Decode a full share URL (or query string) into roster + boss data.
 * @param {string} input - URL or bare query string
 * @param {Object[]} allUnits - Full unit list
 * @returns {{ units: string[]|null, universal: string[], bosses: string[]|null }}
 */
export function decodeShareUrl(input, allUnits) {
    const queryStart = input.indexOf('?');
    const qs = queryStart >= 0 ? input.substring(queryStart + 1) : input;
    const params = new URLSearchParams(qs);
    const result = { units: null, universal: [], bosses: null };

    const rosterParam = params.get('roster');
    if (rosterParam) {
        const decoded = decodeRosterParam(rosterParam, allUnits);
        result.units = decoded.owned;
        result.universal = decoded.universal;
    }

    const bossesParam = params.get('bosses');
    if (bossesParam) {
        result.bosses = bossesParam.split(',').filter(Boolean);
    }

    return result;
}

/**
 * If options.query is set, decode it and merge units/flex/bosses into options.
 * Mutates `options` in place.
 * @param {Object} options - Parsed CLI options
 * @param {Object[]} allUnits - Full unit list
 */
export function applyShareUrl(options, allUnits) {
    if (!options.query) return;

    if (options.units) {
        console.error('Error: --query (-q) and --units (-u) are mutually exclusive.');
        process.exit(1);
    }

    const decoded = decodeShareUrl(options.query, allUnits);

    if (decoded.units) {
        options.units = decoded.units;
        console.log(`Share URL roster: ${decoded.units.length} owned units`);
    }

    if (decoded.universal && decoded.universal.length > 0 && !options.flex) {
        options.flex = decoded.universal;
        console.log(`Share URL flex units: ${decoded.universal.join(', ')}`);
    }

    if (decoded.bosses && !options.bosses) {
        options.queryBosses = decoded.bosses;
    }
}
