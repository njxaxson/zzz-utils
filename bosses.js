/**
 * Display bosses grouped by elemental weakness and by favored DPS archetype
 * Uses bosses.json; a boss with multiple weaknesses appears under each element
 */

import { parseArgs } from './lib/cli.js';
import { loadBosses } from './lib/data.js';

parseArgs({
    name: 'bosses.js',
    description: 'Displays bosses grouped by elemental weakness and by favored DPS archetype.',
    options: [],
    examples: '  node bosses.js     Show bosses by elemental weakness and archetype'
});

function printGroups(map, order) {
    const keys = order || Object.keys(map).sort();
    const width = Math.max(...keys.map(k => k.length));
    for (const key of keys) {
        const list = map[key];
        if (list && list.length > 0) {
            console.log(`${key.padEnd(width)} : ${list.join(", ")}`);
        }
    }
}

async function main() {
    const bosses = await loadBosses();
    const byElement = {};
    const byArchetype = {};

    for (const boss of bosses) {
        const name = boss.shortName || boss.name;

        const weaknesses = boss.mechanics?.weaknesses || [];
        for (const weakness of weaknesses) {
            const element = weakness.split(':')[0];
            if (!byElement[element]) byElement[element] = [];
            byElement[element].push(name);
        }

        const archetype = boss.mechanics?.shill;
        if (archetype) {
            if (!byArchetype[archetype]) byArchetype[archetype] = [];
            byArchetype[archetype].push(name);
        }
    }

    printGroups(byElement);
    console.log(" ");
    printGroups(byArchetype, ['attack', 'anomaly', 'rupture', 'armorer']);
}

main().catch(console.error);
