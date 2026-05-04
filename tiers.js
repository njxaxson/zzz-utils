/**
 * Display roster grouped by Mindscape/W-Engine status
 * Uses roster.json which maps unit names to their M?W? stat (optionally with P? suffix)
 */

import { parseArgs } from './lib/cli.js';
import { loadUnits } from './lib/data.js';

parseArgs({
    name: 'tiers.js',
    description: 'Displays units grouped by tier.',
    options: [],
    examples: '  node tiers.js     Show units by tier'
});

async function main() {
    const units = await loadUnits();
    const tiers = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4'];
    const map = {};
    for (const tier of tiers) map[tier] = [];
    for (const unit of units) {
        if(unit.tier === undefined) {
            console.log(`Missing tier definition for ${unit.name}`);
            process.exit(1);
        }
        map[unit.tier.toString()].push(unit.name);
    }
    for (const tier of tiers) {
        const list = map[tier];
        const label = tier.length == 1 ? "T" + tier + "  " : "T" + tier;
        if (list.length > 0) {
            console.log(`${label} : ${list.join(", ")}`);
        }
    };
}

main().catch(console.error);
