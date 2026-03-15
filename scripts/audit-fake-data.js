const units = require('../app/public/data/units-fake.json');

const FACTIONS = [
    "Shadow Syndicate", "Iron Legion", "Crystal Vanguard", "Void Walkers", "Solar Flare",
    "Nebula Corp", "Quantum Architects", "Echo Division", "Lunar Watch", "Terra Guardians",
    "Cyber Samurai", "Neon Knights", "Plasma Pirates", "Chrono Keepers"
];
const ELEMENTS = ['fire', 'ice', 'electric', 'physical', 'ether'];
const ROLES = ['attack', 'stun', 'anomaly', 'support', 'defense', 'rupture'];

const ranks = { A: [], 'S-Std': [], 'S-Lim': [], 'S-Titled': [] };
const tierCounts = {};
const roleCounts = {};
const elementCounts = {};
const factionARanks = {};
const joinTypes = { 'Faction+Element': 0, 'Faction+Role': 0, 'Element+Role': 0, 'Role+Role': 0, 'Faction+Assist': 0, 'Other': 0 };

for (const u of units) {
    const key = u.rank === 'A' ? 'A' : u.tags.includes('title') ? 'S-Titled' : u.limited ? 'S-Lim' : 'S-Std';
    ranks[key].push(u.name);

    const t = 'T' + u.tier;
    tierCounts[t] = (tierCounts[t] || 0) + 1;

    const role = u.tags.find(t => ROLES.includes(t));
    roleCounts[role] = (roleCounts[role] || 0) + 1;

    const element = u.tags.find(t => ELEMENTS.includes(t));
    elementCounts[element] = (elementCounts[element] || 0) + 1;

    if (u.rank === 'A') {
        factionARanks[u.faction] = (factionARanks[u.faction] || []);
        factionARanks[u.faction].push(u.name);
    }

    const j = u.join;
    const hf = j.some(x => FACTIONS.includes(x));
    const he = j.some(x => ELEMENTS.includes(x));
    const hr = j.some(x => ROLES.includes(x));
    const ha = j.some(x => x.startsWith('assist:'));
    if (hf && he && !hr) joinTypes['Faction+Element']++;
    else if (hf && hr && !he) joinTypes['Faction+Role']++;
    else if (he && hr && !hf) joinTypes['Element+Role']++;
    else if (hr && !hf && !he) joinTypes['Role+Role']++;
    else if (hf && ha) joinTypes['Faction+Assist']++;
    else joinTypes['Other']++;
}

console.log('=== RANK DISTRIBUTION ===');
console.log(`  A-rank:    ${ranks.A.length}`);
console.log(`  S-Std:     ${ranks['S-Std'].length}`);
console.log(`  S-Lim:     ${ranks['S-Lim'].length}`);
console.log(`  S-Titled:  ${ranks['S-Titled'].length}`);
console.log(`  Total:     ${units.length}`);

console.log('\n=== TIER DISTRIBUTION ===');
const sortedTiers = Object.entries(tierCounts).sort((a, b) => parseFloat(a[0].slice(1)) - parseFloat(b[0].slice(1)));
for (const [t, c] of sortedTiers) {
    const bar = '#'.repeat(c);
    console.log(`  ${t.padEnd(5)} ${String(c).padStart(2)}  ${bar}`);
}

const good = units.filter(u => u.tier <= 1.5).length;
console.log(`\n  T1.5 or better: ${good}/${units.length} (${Math.round(good / units.length * 100)}%)`);

console.log('\n=== ROLE DISTRIBUTION ===');
for (const [r, c] of Object.entries(roleCounts).sort((a, b) => b[1] - a[1])) {
    const bar = '#'.repeat(c);
    console.log(`  ${r.padEnd(8)} ${String(c).padStart(2)}  ${bar}`);
}

console.log('\n=== ELEMENT DISTRIBUTION ===');
for (const [e, c] of Object.entries(elementCounts).sort((a, b) => b[1] - a[1])) {
    const bar = '#'.repeat(c);
    console.log(`  ${e.padEnd(10)} ${String(c).padStart(2)}  ${bar}`);
}

console.log('\n=== A-RANK FACTION CLUSTERING ===');
for (const [f, names] of Object.entries(factionARanks).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${f.padEnd(22)} ${names.length} -> ${names.join(', ')}`);
}
const loners = Object.values(factionARanks).filter(n => n.length === 1).length;
console.log(`  Factions with lone A-rank: ${loners}`);

console.log('\n=== JOIN ARCHETYPES ===');
for (const [a, c] of Object.entries(joinTypes)) {
    console.log(`  ${a.padEnd(16)} ${String(c).padStart(2)}`);
}

console.log('\n=== TITLED UNITS ===');
for (const u of units.filter(u => u.tags.includes('title'))) {
    const role = u.tags.find(t => ROLES.includes(t));
    const element = u.tags.find(t => ELEMENTS.includes(t));
    console.log(`  ${u.name.padEnd(12)} ${element}/${role}  (${u.faction})  join: [${u.join.join(', ')}]`);
}

console.log('\n=== SAMPLE UNITS (first 5) ===');
for (const u of units.slice(0, 5)) {
    console.log(`  ${u.name.padEnd(12)} ${u.rank}${u.limited ? '*' : ' '} T${u.tier}  ${u.tags.join(', ').padEnd(40)}  join: [${u.join.join(', ')}]`);
}
