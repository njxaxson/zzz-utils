/**
 * Display roster grouped by Mindscape/W-Engine status
 * Uses roster.json which maps unit names to their M?W? stat (optionally with P? suffix)
 */

async function main() {
    const { default: myRoster } = await import('./roster.json', { with: { type: 'json' } });

    function toLabel(c, w) {
        return "M" + Math.max(0, Math.min(c, 6)) + "W" + Math.max(0, Math.min(w, 5));
    }

    /**
     * Parse stat string (MxWy or MxWyPz format) and extract MxWy base and optional P value
     * @param {string} stat - Stat string like "M0W1" or "M0W1P6"
     * @returns {Object} { base: "M0W1", pValue: "6" or null }
     */
    function parseStat(stat) {
        // Match MxWy or MxWyPz format
        const match = stat.match(/^(M\d+W\d+)(?:P(\d+))?$/);
        if (!match) {
            return null;
        }
        return {
            base: match[1],  // MxWy part
            pValue: match[2] || null  // P value if present, null otherwise
        };
    }

    // Build map of stat -> array of {name, pValue}
    const map = new Map();
    for (let c = 6; c >= 0; c--) {
        for (let w = 5; w >= 0; w--) {
            map.set(toLabel(c, w), []);
        }
    }

    // Group units by their stat (using MxWy base, ignoring P suffix)
    for (const [name, stat] of Object.entries(myRoster)) {
        const parsed = parseStat(stat);
        if (!parsed) {
            console.warn(`Unknown stat format: ${stat} for ${name}`);
            continue;
        }
        
        const baseStat = parsed.base;
        if (map.has(baseStat)) {
            map.get(baseStat).push({ name, pValue: parsed.pValue });
        } else {
            console.warn(`Unknown base stat format: ${baseStat} for ${name}`);
        }
    }

    // Display results
    console.log(" ");
    [...map.keys()].forEach(status => {
        const list = map.get(status);
        if (list.length > 0) {
            // Format unit names with P value in parentheses if present
            const formattedNames = list.map(item => 
                item.pValue ? `${item.name} (P${item.pValue})` : item.name
            );
            console.log(`${status} : ${formattedNames.join(", ")}`);
        }
    });
}

main().catch(console.error);
