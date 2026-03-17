/**
 * Team Builder for Zenless Zone Zero
 * 
 * Generates valid team combinations based on unit join conditions.
 * Edit the filter section below to customize results.
 */

import { parseArgs } from './lib/cli.js';
import { loadUnits, loadRoster } from './lib/data.js';
import { applyShareUrl } from './lib/share-url.js';
import { resolveOptions } from './lib/unit-resolver.js';
import { buildAvailableUnits } from './lib/roster-builder.js';
import { getTeams } from './app/public/lib/common/team-builder.js';

const options = parseArgs({
    name: 'teams.js',
    description: 'Generates valid team combinations with customizable filters.',
    options: ['depth', 'onlyMine', 'preview', 'debug', 'units', 'exclude', 'include', 'flex', 'query'],
    examples: [
        '  node teams.js                     Full roster with hardcoded filters',
        '  node teams.js -m                  Personal roster only',
        '  node teams.js -u "Miyabi,Astra,Nicole"   Specific units'
    ].join('\n')
});

async function main() {
    const allUnits = await loadUnits();
    const roster = await loadRoster();

    applyShareUrl(options, allUnits);
    resolveOptions(options, allUnits);

    const { availableUnits } = buildAvailableUnits(allUnits, options, roster, {
        extraUnits: [
            // Developer-only: Add unreleased/hypothetical units for testing
            // {
            //     "name" : "Estelle",
            //     "rank" : "S",
            //     "tags" : ["defense", "ether", "pubsec"],
            //     "join" : ["attack", "ether", "pubsec"]
            // },
        ]
    });

    const teams = getTeams(availableUnits);
    var labels = [];
    for (let label in teams) {
        labels.push(label);
    }
    labels.sort();

    // ============================================================================
    // FILTERING — Edit this section to customize results
    // ============================================================================

    const roster_map = new Map();
    labels.forEach(label => {
        var team = teams[label];
        let valid = true;

        valid = valid && (team.length == 3);
        valid = valid && team.some(unit => unit.rank == "S");
        valid = valid && (team.some(unit =>
            (unit.tags.includes("attack") || unit.tags.includes("anomaly") || unit.tags.includes("rupture"))));

        valid = valid && !team.some(unit => [
            "Anby",
            "Anton",
            "Ben",
            "Billy",
            "Corin",
            "Seth"
        ].indexOf(unit.name) != -1);

        //valid = valid && team.every(unit => unit.tags.includes("fire"));
        //valid = valid && team.every(unit => unit.tags.includes("ice"));
        //valid = valid && team.every(unit => unit.tags.includes("electric"));
        //valid = valid && team.every(unit => unit.tags.includes("physical"));
        //valid = valid && team.every(unit => unit.tags.includes("ether"));
        //valid = valid && team.some(unit => unit.name == "Ye Shunguong");
        //valid = valid && team.filter(unit => unit.tags.includes("stun")).length >= 1;
        valid = valid && team.every(unit => unit.rank == "S");
        valid = valid && team.some(unit => unit.tags.includes("title"));

        // valid = valid
        //     && (team.every(unit => unit.tags.includes("fire"))
        //     ||  team.every(unit => unit.tags.includes("ice"))
        //     ||  team.every(unit => unit.tags.includes("electric"))
        //     ||  team.every(unit => unit.tags.includes("ether"))
        //     ||  team.every(unit => unit.tags.includes("physical")));

        valid = valid
            && (team.filter(unit => unit.tags.includes("fire")    ).length >= 2
            ||  team.filter(unit => unit.tags.includes("ice")     ).length >= 2
            ||  team.filter(unit => unit.tags.includes("electric")).length >= 2
            ||  team.filter(unit => unit.tags.includes("ether")   ).length >= 2
            ||  team.filter(unit => unit.tags.includes("physical")).length >= 2);

        if (valid) {
            roster_map.set(label, team);
        }
    });

    console.log("Total possible teams:         " + Object.keys(teams).length);
    console.log("Filtered teams per criteria:  " + roster_map.size);
    [...roster_map.keys()].forEach(label => console.log("  " + label));
}

main().catch(console.error);
