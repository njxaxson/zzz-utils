/**
 * Roster Sharing Utilities
 * Encodes and decodes roster state for URL sharing
 * Uses differential encoding (only stores changes from defaults) + compression
 */

// We'll use pako for compression - loaded from CDN in HTML
// If pako isn't available, we fall back to uncompressed encoding

/**
 * Get default owned state for a unit
 * Limited S-ranks default to NOT owned, everything else defaults to owned
 */
function getDefaultOwned(unit) {
    return unit.rank === 'A' || (unit.rank === 'S' && !unit.limited);
}

/**
 * Get default universal/flex state for a unit
 * Nicole defaults to universal (flex), all others default to false
 */
function getDefaultUniversal(unit) {
    return unit.id === 'nicole';
}

/**
 * Encode roster state to a URL-safe string
 * Format: owned_limited|not_owned_others|universal
 * Then compressed with pako and base64url encoded
 * 
 * @param {Object} unitStates - Map of unitId -> { owned, universal }
 * @param {Array} allUnits - Array of all unit objects
 * @returns {string} Encoded roster string
 */
export function encodeRoster(unitStates, allUnits) {
    const ownedLimited = [];      // Limited S-ranks that ARE owned (non-default)
    const notOwnedOthers = [];    // Non-limited units that are NOT owned (non-default)
    const universal = [];          // Any units marked as universal/flex (non-default)
    
    for (const unit of allUnits) {
        const state = unitStates[unit.id];
        if (!state) continue;
        
        const defaultOwned = getDefaultOwned(unit);
        const defaultUniversal = getDefaultUniversal(unit);
        
        // Track non-default ownership
        if (state.owned && !defaultOwned) {
            // Limited S-rank that IS owned (non-default)
            ownedLimited.push(unit.id);
        } else if (!state.owned && defaultOwned) {
            // Non-limited unit that is NOT owned (non-default)
            notOwnedOthers.push(unit.id);
        }
        
        // Track universal if different from default
        if (state.universal !== defaultUniversal && state.owned) {
            universal.push(unit.id);
        }
    }
    
    // Build the delta string
    const deltaString = [
        ownedLimited.join(','),
        notOwnedOthers.join(','),
        universal.join(',')
    ].join('|');
    
    // If everything is default, return empty string
    if (deltaString === '||') {
        return '';
    }
    
    // Try to compress with pako if available
    if (typeof pako !== 'undefined') {
        try {
            const compressed = pako.deflate(deltaString);
            return base64UrlEncode(compressed);
        } catch (e) {
            console.warn('Compression failed, using uncompressed:', e);
        }
    }
    
    // Fallback: just base64url encode the string
    return 'u_' + base64UrlEncode(new TextEncoder().encode(deltaString));
}

/**
 * Decode roster state from a URL parameter string
 * 
 * @param {string} encoded - The encoded roster string
 * @param {Array} allUnits - Array of all unit objects
 * @returns {Object} Map of unitId -> { owned, universal }
 */
export function decodeRoster(encoded, allUnits) {
    if (!encoded) {
        return null;
    }
    
    let deltaString;
    
    try {
        if (encoded.startsWith('u_')) {
            // Uncompressed format
            const bytes = base64UrlDecode(encoded.slice(2));
            deltaString = new TextDecoder().decode(bytes);
        } else {
            // Compressed format
            if (typeof pako === 'undefined') {
                console.error('Pako not loaded, cannot decompress roster');
                return null;
            }
            const compressed = base64UrlDecode(encoded);
            deltaString = pako.inflate(compressed, { to: 'string' });
        }
    } catch (e) {
        console.error('Failed to decode roster:', e);
        return null;
    }
    
    // Parse the delta string
    const [ownedLimitedStr, notOwnedOthersStr, universalStr] = deltaString.split('|');
    
    const ownedLimited = new Set(ownedLimitedStr ? ownedLimitedStr.split(',').filter(Boolean) : []);
    const notOwnedOthers = new Set(notOwnedOthersStr ? notOwnedOthersStr.split(',').filter(Boolean) : []);
    const universalSet = new Set(universalStr ? universalStr.split(',').filter(Boolean) : []);
    
    // Build the unit states starting from defaults
    const unitStates = {};
    
    for (const unit of allUnits) {
        const defaultOwned = getDefaultOwned(unit);
        const defaultUniversal = getDefaultUniversal(unit);
        let owned = defaultOwned;
        let universal = defaultUniversal;
        
        // Apply deltas
        if (ownedLimited.has(unit.id)) {
            owned = true;  // Limited S-rank that IS owned
        }
        if (notOwnedOthers.has(unit.id)) {
            owned = false; // Non-limited that is NOT owned
        }
        if (universalSet.has(unit.id)) {
            universal = true;
        }
        
        unitStates[unit.id] = { owned, universal };
    }
    
    return unitStates;
}

/**
 * Base64URL encode (URL-safe base64 without padding)
 */
function base64UrlEncode(bytes) {
    // Convert Uint8Array to regular array for btoa
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str) {
    // Restore standard base64
    let base64 = str
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
        base64 += '=';
    }
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Get the roster parameter from the current URL
 */
export function getRosterFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('roster');
}

/**
 * Check if we're in shared roster mode (URL has roster parameter)
 */
export function isSharedRosterMode() {
    return getRosterFromUrl() !== null;
}

/**
 * Generate a shareable URL with the current roster encoded
 * 
 * @param {Object} unitStates - Map of unitId -> { owned, universal }
 * @param {Array} allUnits - Array of all unit objects
 * @returns {string} Full URL with roster parameter
 */
export function generateShareUrl(unitStates, allUnits) {
    const encoded = encodeRoster(unitStates, allUnits);
    
    // Build URL from current location without existing roster param
    const url = new URL(window.location.href);
    url.search = ''; // Clear existing params
    
    if (encoded) {
        url.searchParams.set('roster', encoded);
    }
    
    return url.toString();
}

// ============================================================================
// BOSS SHARING (for Deadly Assault page)
// ============================================================================

/**
 * Encode selected boss IDs for URL
 * Simple comma-separated format since boss lists are small
 * 
 * @param {Array} bossIds - Array of boss ID strings
 * @returns {string} Encoded boss string
 */
export function encodeBosses(bossIds) {
    if (!bossIds || bossIds.length === 0) {
        return '';
    }
    return bossIds.join(',');
}

/**
 * Decode boss IDs from URL parameter
 * 
 * @param {string} encoded - The encoded boss string
 * @param {Array} allBosses - Array of all boss objects (for validation)
 * @returns {Array|null} Array of valid boss IDs, or null if invalid
 */
export function decodeBosses(encoded, allBosses) {
    if (!encoded) {
        return null;
    }
    
    const bossIds = encoded.split(',').filter(Boolean);
    
    // Validate that all IDs exist in the boss list
    const validBossIds = allBosses.map(b => b.id);
    const validatedIds = bossIds.filter(id => validBossIds.includes(id));
    
    return validatedIds.length > 0 ? validatedIds : null;
}

/**
 * Get the bosses parameter from the current URL
 */
export function getBossesFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('bosses');
}

/**
 * Check if we're in shared bosses mode (URL has bosses parameter)
 */
export function isSharedBossesMode() {
    return getBossesFromUrl() !== null;
}

/**
 * Generate a shareable URL with roster AND bosses encoded (for Deadly Assault)
 * 
 * @param {Object} unitStates - Map of unitId -> { owned, universal }
 * @param {Array} allUnits - Array of all unit objects
 * @param {Array} bossIds - Array of selected boss IDs
 * @returns {string} Full URL with roster and bosses parameters
 */
export function generateShareUrlWithBosses(unitStates, allUnits, bossIds) {
    const encodedRoster = encodeRoster(unitStates, allUnits);
    const encodedBosses = encodeBosses(bossIds);
    
    // Build URL from current location without existing params
    const url = new URL(window.location.href);
    url.search = ''; // Clear existing params
    
    if (encodedRoster) {
        url.searchParams.set('roster', encodedRoster);
    }
    
    if (encodedBosses) {
        url.searchParams.set('bosses', encodedBosses);
    }
    
    return url.toString();
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            return true;
        } catch (e2) {
            return false;
        } finally {
            document.body.removeChild(textarea);
        }
    }
}

