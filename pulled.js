/**
 * Display roster grouped by Mindscape/W-Engine status
 * Uses roster.json which maps unit names to their M?W? stat
 */

const myRoster = require('./roster.json');

function toLabel(c, w) {
    return "M" + Math.max(0, Math.min(c, 6)) + "W" + Math.max(0, Math.min(w, 5));
}

// Build map of stat -> unit names
const map = new Map();
for (let c = 6; c >= 0; c--) {
    for (let w = 5; w >= 0; w--) {
        map.set(toLabel(c, w), []);
    }
}

// Group units by their stat
for (const [name, stat] of Object.entries(myRoster)) {
    if (map.has(stat)) {
        map.get(stat).push(name);
    } else {
        console.warn(`Unknown stat format: ${stat} for ${name}`);
    }
}

// Display results
console.log(" ");
[...map.keys()].forEach(status => {
    const list = map.get(status);
    if (list.length > 0) console.log(`${status} : ${list.join(", ")}`);
});

