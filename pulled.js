/**
 * Display roster grouped by Mindscape/W-Engine status
 * Uses roster.json which maps unit names to their M?W? stat (optionally with P? suffix)
 */

import { parseArgs } from './lib/cli.js';
import { loadRoster } from './lib/data.js';

parseArgs({
    name: 'pulled.js',
    description: 'Displays owned units grouped by Mindscape/W-Engine status.',
    options: [],
    examples: '  node pulled.js     Show roster grouped by MxWy status'
});

function toLabel(c, w) {
    return "M" + Math.max(0, Math.min(c, 6)) + "W" + Math.max(0, Math.min(w, 5));
}

function parseStat(stat) {
    const match = stat.match(/^(M\d+W\d+)(?:P(\d+))?$/);
    if (!match) return null;
    return { base: match[1], pValue: match[2] || null };
}

async function main() {
    const myRoster = await loadRoster();

    const map = new Map();
    for (let c = 6; c >= 0; c--) {
        for (let w = 5; w >= 0; w--) {
            map.set(toLabel(c, w), []);
        }
    }

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

    console.log(" ");
    [...map.keys()].forEach(status => {
        const list = map.get(status);
        if (list.length > 0) {
            const formattedNames = list.map(item =>
                item.pValue ? `${item.name} (P${item.pValue})` : item.name
            );
            console.log(`${status} : ${formattedNames.join(", ")}`);
        }
    });
}

main().catch(console.error);
