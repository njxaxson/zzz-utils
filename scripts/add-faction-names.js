const fs = require('fs');

const unitsPath = 'app/public/data/units.json';
const units = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));

const factionMap = {
    'spookshack': 'Spook Shack',
    'hares': 'Cunning Hares',
    'belobog': 'Belobog Heavy Industries',
    'aod': 'Angels of Delusion',
    'lyra': 'Lyra',
    'krampus': 'Krampus',
    'calydon': 'Sons of Calydon',
    'pubsec': 'PubSec',
    'victoria': 'Victoria Housekeeping',
    'section6': 'Section 6',
    'mockingbird': 'Mockingbird',
    'yunkui': 'Yunkui',
    'obol': 'Obol Squad',
    'silver': 'Silver'
};

units.forEach(unit => {
    // Find the faction tag
    const factionTag = unit.tags.find(t => factionMap[t]);
    if (factionTag) {
        unit.faction = factionMap[factionTag];
    } else {
        // Fallback or warning
        console.warn(`Warning: No faction found for unit ${unit.name}`);
        unit.faction = 'Unknown';
    }
});

fs.writeFileSync(unitsPath, JSON.stringify(units, null, 4));
console.log('Updated units.json with faction names.');
