const fs = require('fs');
const path = require('path');

const unitsPath = 'app/public/data/units.json';
const fakeUnitsPath = 'app/public/data/units-fake.json';
const wikiHtmlPath = 'another_eden_chars.html';

const units = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));

// Extract Image URLs from Wiki HTML
let imageUrls = [];
try {
    const htmlContent = fs.readFileSync(wikiHtmlPath, 'utf8');
    // Regex to find img tags with src containing thumb.php?f=...png
    const imgRegex = /src="\/thumb\.php\?f=([^"&]+\.png)[^"]*"/g;
    let match;
    while ((match = imgRegex.exec(htmlContent)) !== null) {
        const filename = match[1];
        // Strict filter for character portraits only
        if (filename.includes('rank5_command') || filename.includes('rank5_s2_command') || filename.includes('rank5_s3_command')) {
             imageUrls.push(`https://anothereden.wiki/thumb.php?f=${filename}&width=128`);
        }
    }
    imageUrls = [...new Set(imageUrls)];
    console.log(`Found ${imageUrls.length} potential character images.`);
} catch (e) {
    console.error("Error reading or parsing wiki HTML:", e);
    imageUrls = ['./assets/placeholder.png'];
}

function getRandomImage() {
    if (imageUrls.length === 0) return './assets/placeholder.png';
    const idx = Math.floor(Math.random() * imageUrls.length);
    const img = imageUrls[idx];
    imageUrls.splice(idx, 1); // Use each image only once if possible
    return img;
}

// Name generator
const namePool = [
    "Roxie", "Jett", "Axel", "Vera", "Kiro", "Zumi", "Elian", "Tara", "Nash", "Remy", 
    "Clea", "Orson", "Mila", "Dante", "Sia", "Kian", "Lora", "Rico", "Nia", "Vance", 
    "Tess", "Mylo", "Kara", "Zack", "Elsa", "Rian", "Katy", "Seth", "Mina", "Troy", 
    "Lana", "Reed", "Nola", "Van", "Kira", "Jace", "Esme", "Rory", "Nina", "Vince", 
    "Thea", "Marc", "Kaia", "Zane", "Ema", "Roy", "Nora", "Val", "Kari", "Joel",
    "Eva", "Ross", "Nala", "Vic", "Tia", "Max", "Keri", "Jon", "Eda", "Rob", 
    "Neve", "Von", "Leo", "Jade", "Finn", "Skye", "Cole", "Brea", "Dax", "Faye",
    "Cipher", "Glitch", "Flux", "Echo", "Trace", "Spark", "Omen", "Rook", "Vex", "Nyx",
    "Sable", "Pulse", "Wraith", "Ghost", "Neon", "Volt", "Ash", "Frost", "Gale", "Storm",
    "Aris", "Bela", "Cian", "Drio", "Eris", "Fian", "Gela", "Hion", "Iris", "Jela",
    "Kion", "Lian", "Mela", "Nion", "Oris", "Pela", "Qian", "Rela", "Sion", "Tris"
];

// Shuffle names
for (let i = namePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [namePool[i], namePool[j]] = [namePool[j], namePool[i]];
}

function getName() {
    if (namePool.length === 0) return "Unit_" + Math.floor(Math.random()*1000);
    return namePool.pop();
}

// Data Structures
const fakeFactions = [
    "Shadow Syndicate", "Iron Legion", "Crystal Vanguard", "Void Walkers", "Solar Flare",
    "Nebula Corp", "Quantum Architects", "Echo Division", "Lunar Watch", "Terra Guardians",
    "Cyber Samurai", "Neon Knights", "Plasma Pirates", "Chrono Keepers"
];

const ELEMENTS = ['fire', 'ice', 'electric', 'physical', 'ether'];
const ROLES = ['attack', 'stun', 'anomaly', 'support', 'defense']; // Rupture handled specially or as anomaly variant

// Distribution Configuration
// Total target: ~50-55 units
const factionDistribution = [5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2]; // Sum = 47, plus titled units
// Ensure enough Anomaly units for Disorder teams
let anomalyCount = 0;
const MIN_ANOMALY = 10;

const fakeUnits = [];

// 1. Create Titled Units (3 units: The Pinnacle)
// Rules: Rank S (Limited), Tier 0, Random Carry Role, Random Element, Random Faction
const titledSpecs = [];
const availableTitledFactions = [...fakeFactions];
shuffle(availableTitledFactions);
const availableTitledElements = [...ELEMENTS];
shuffle(availableTitledElements);
const availableTitledRoles = ['attack', 'anomaly', 'rupture'];
shuffle(availableTitledRoles);

for (let i = 0; i < 3; i++) {
    titledSpecs.push({
        role: availableTitledRoles[i % availableTitledRoles.length], // Ensure distinct if < 3 types, but carry roles are exactly 3
        element: availableTitledElements[i],
        faction: availableTitledFactions[i]
    });
}

titledSpecs.forEach(spec => {
    const u = createUnit(spec.faction, true);
    u.rank = 'S';
    u.limited = true;
    u.tier = 0;
    u.tags = [spec.role, spec.element, 'assist:defensive', 'title']; 
    
    // Varied Joins for Titled Units
    // 60% Faction + Element (Classic)
    // 20% Faction + Role (Leader style)
    // 20% Element + Role (Archon style)
    const joinRoll = Math.random();
    if (joinRoll < 0.6) {
        u.join = [u.faction, spec.element];
    } else if (joinRoll < 0.8) {
        u.join = [u.faction, spec.role === 'support' ? 'attack' : 'support']; // Prefer support if carry
    } else {
        u.join = [spec.element, 'support'];
    }
    
    // Titled Synergy: Often minimal but powerful, or broader
    u.synergy = {
        units: [],
        tags: ['support'], // Titled units love supports
        avoid: []
    };
    fakeUnits.push(u);
    if (spec.role === 'anomaly') anomalyCount++;
});

// 2. Create Faction Units
// We iterate through the distribution plan and fill slots.
// Deck-based distribution for Ranks
const totalSlots = factionDistribution.reduce((a, b) => a + b, 0); // 47
const targetA = 13;
const targetStdS = 6;
const targetLimS = totalSlots - targetA - targetStdS; // 28

// --- Rank Specs Deck ---
const rankDeck = [];

// A-Rank Specs (13 slots): Ensure coverage of roles and elements
const aRankRoles = [...ROLES, 'rupture', 'attack', 'support', 'stun', 'defense', 'anomaly', 'attack']; // 12 roles, fill last 1 random
const aRankElements = [...ELEMENTS, ...ELEMENTS, 'fire', 'ice', 'electric']; // 13 elements

// A-Rank Tier Deck: Deterministic distribution to match real data (High quality, short tail)
// Target: At least 4-5 high tier (T1.0-T1.5), mid tier bulk (T2.0-T2.5), small low tier tail (T3.0-T4.0)
// Deck: [1.0, 1.5, 1.5, 1.5, 2.0, 2.0, 2.0, 2.5, 2.5, 3.0, 3.0, 3.5, 4.0]
const aRankTierDeck = [1.0, 1.5, 1.5, 1.5, 2.0, 2.0, 2.0, 2.5, 2.5, 3.0, 3.0, 3.5, 4.0];
shuffle(aRankTierDeck);

// Shuffle role/element decks separately for A-ranks
shuffle(aRankRoles);
shuffle(aRankElements);

// NEW LOGIC: Cluster A-ranks into factions
// We will assign A-rank slots to specific factions rather than shuffling them globally.
// Total A: 13.
// We'll pick 5-6 factions to be "A-Rank heavy" and give them 2-3 A-ranks each.
// The remaining factions will get 0 A-ranks (pure S/Lim).

const aRankFactionMap = {}; // factionIdx -> count of A-ranks
const aRankFactionsIndices = [];
// Pick 6 random faction indices to hold A-ranks
const factionIndices = Array.from({length: factionDistribution.length}, (_, i) => i);
shuffle(factionIndices);
const selectedAFactions = factionIndices.slice(0, 6);

// Distribute 13 A-ranks among these 6 factions (approx 2 each, plus 1 remainder)
// Cap each faction's A-rank count at its total slot count to avoid waste
let aCount = 0;
while(aCount < targetA) {
    const fIdx = selectedAFactions[aCount % selectedAFactions.length];
    const current = aRankFactionMap[fIdx] || 0;
    if (current < factionDistribution[fIdx]) {
        aRankFactionMap[fIdx] = current + 1;
        aCount++;
    } else {
        // This faction is full -- find another faction with room
        const backup = factionIndices.find(fi => 
            (aRankFactionMap[fi] || 0) < factionDistribution[fi] && !selectedAFactions.includes(fi)
        ) ?? selectedAFactions.find(fi => (aRankFactionMap[fi] || 0) < factionDistribution[fi]);
        if (backup !== undefined) {
            aRankFactionMap[backup] = (aRankFactionMap[backup] || 0) + 1;
        }
        aCount++;
    }
}

// Prepare Standard S and Limited S pools
const stdSRoles = ['attack', 'stun', 'support', 'defense', 'anomaly', 'rupture']; 
const stdSElements = [...ELEMENTS, 'ether']; 
shuffle(stdSRoles);
shuffle(stdSElements);

// Standard S Tier Deck: Even spread T1.0 - T2.0
const stdSTierDeck = [1.0, 1.0, 1.5, 1.5, 2.0, 2.0];
shuffle(stdSTierDeck);

const stdSDeck = [];
for (let i = 0; i < targetStdS; i++) {
    stdSDeck.push({ 
        rank: 'S', 
        limited: false, 
        forcedRole: stdSRoles[i], 
        forcedElement: stdSElements[i],
        forcedTier: stdSTierDeck[i]
    });
}

const limRolesPool = [
    ...Array(6).fill('attack'),
    ...Array(7).fill('anomaly'),
    ...Array(5).fill('rupture'),
    ...Array(4).fill('stun'),
    ...Array(3).fill('support'),
    ...Array(3).fill('defense')
]; 
while(limRolesPool.length < targetLimS) limRolesPool.push('anomaly');
shuffle(limRolesPool);

// Limited S Tier Deck: 28 units.
// Target: T0 (2), T0.5 (12), T1.0 (10), T1.5 (4)
// Total 28. (Plus 3 Titled at T0 = 5 total T0)
const limSTierDeck = [
    0, 0,
    0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
    1.5, 1.5, 1.5, 1.5
];
shuffle(limSTierDeck);

const limSDeck = [];
for (let i = 0; i < targetLimS; i++) {
    limSDeck.push({ 
        rank: 'S', 
        limited: true, 
        forcedRole: limRolesPool[i], 
        forcedElement: ELEMENTS[i % ELEMENTS.length],
        forcedTier: limSTierDeck[i]
    });
}

// --- Revised Outer Loop Logic ---

const globalSDeck = [...stdSDeck, ...limSDeck];
shuffle(globalSDeck);

let factionIdx = 0;
for (const count of factionDistribution) {
    const factionName = fakeFactions[factionIdx % fakeFactions.length];
    
    // Determine composition for this faction
    const numA = aRankFactionMap[factionIdx] || 0;
    const numS = count - numA;
    
    // Build this faction's specific deck
    const localDeck = [];
    
    // Add A-ranks
    for(let k=0; k<numA; k++) {
        localDeck.push({
            rank: 'A',
            limited: false,
            forcedRole: aRankRoles.pop() || 'attack', // Draw from global A-role deck
            forcedElement: aRankElements.pop() || 'physical',
            forcedTier: aRankTierDeck.pop() // Draw from A-rank tier deck
        });
    }
    
    // Add S-ranks from global pool
    for(let k=0; k<numS; k++) {
        // If we ran out of S (shouldn't happen if math is right), fallback to LimS
        const spec = globalSDeck.pop() || { rank: 'S', limited: true, forcedRole: 'attack', forcedElement: 'fire', forcedTier: 1.0 };
        localDeck.push(spec);
    }
    
    shuffle(localDeck); // Shuffle within faction so A-ranks aren't always first
    
    // Track roles in this faction
    const factionRoles = [];
    
    for (let i = 0; i < count; i++) {
        // Draw Spec
        const spec = localDeck.pop();
        const { rank, limited, forcedRole, forcedElement, forcedTier } = spec;
        
        let role = forcedRole;
        let element = forcedElement;
        let tier = forcedTier;

        factionRoles.push(role);
        if (role === 'anomaly') anomalyCount++;

        // Tier based on rank
        // Already assigned via deck (forcedTier)
        if (tier === undefined) tier = 2.0; // Fallback

        const u = createUnit(factionName);
        u.rank = rank;
        u.limited = limited;
        u.tier = tier;
        
        // Assist Type
        const assist = Math.random() < 0.5 ? 'assist:defensive' : 'assist:evasive';
        
        u.tags = [role, element, assist];
        
        // Sub-DPS tag
        if ((role === 'attack' || role === 'anomaly') && Math.random() < 0.3) {
            u.tags.push('subdps');
        }
        // Stunless preference
        if (role === 'anomaly' && Math.random() < 0.3) {
            u.tags.push('stunless');
        }

        // --- JOINS (Teammates) ---
        // Varied Join Archetypes
        // Archetype A (Classic): Faction + Element (30%)
        // Archetype B (Leader): Faction + Role (20%)
        // Archetype C (Archon): Element + Role (20%)
        // Archetype D (Duo): Role + Role (10%)
        // Archetype E (Assist): Faction + Assist (10%)
        // Archetype F (Broad): Faction Only OR Element Only (10%)
        
        const joins = [];
        const archetypeRoll = Math.random();
        
        if (archetypeRoll < 0.30) {
            // Classic: Faction + Element
            joins.push(factionName);
            joins.push(element);
        } else if (archetypeRoll < 0.50) {
            // Leader: Faction + Specific Role
            joins.push(factionName);
            // Synergistic role
            if (role === 'attack') joins.push('stun');
            else if (role === 'stun') joins.push('attack');
            else if (role === 'support') joins.push('attack');
            else if (role === 'defense') joins.push('support');
            else if (role === 'anomaly') joins.push('anomaly');
            else joins.push('support'); 
        } else if (archetypeRoll < 0.70) {
            // Archon: Element + Specific Role
            joins.push(element);
            if (role === 'attack') joins.push('stun');
            else if (role === 'stun') joins.push('attack');
            else if (role === 'support') joins.push('attack');
            else if (role === 'anomaly') joins.push('anomaly');
            else joins.push('support');
        } else if (archetypeRoll < 0.80) {
            // Duo: Two Roles (Very flexible)
            if (role === 'attack') { joins.push('stun'); joins.push('support'); }
            else if (role === 'stun') { joins.push('attack'); joins.push('support'); }
            else if (role === 'support') { joins.push('attack'); joins.push('anomaly'); }
            else if (role === 'anomaly') { joins.push('anomaly'); joins.push('support'); }
            else { joins.push('attack'); joins.push('support'); }
        } else if (archetypeRoll < 0.90) {
            // Assist: Faction + Assist Type
            joins.push(factionName);
            joins.push(assist);
        } else {
            // Broad / Weird: Faction + Element (Classic fallback for now to ensure validity)
            // Or we can do Faction + Random Role
            joins.push(factionName);
            joins.push(element);
        }
        
        u.join = [...new Set(joins)]; 

        // --- SYNERGY ---
        const synergy = { units: [], tags: [], avoid: [] };
        if (Math.random() < 0.6) {
            if (Math.random() < 0.5) synergy.tags.push(element);
            else {
                if (role === 'attack') synergy.tags.push('stun');
                if (role === 'anomaly') synergy.tags.push('anomaly');
            }
        }
        if (Math.random() < 0.15) {
            if (role === 'anomaly') synergy.avoid.push('stun');
        }

        u.synergy = synergy;
        fakeUnits.push(u);
    }
    factionIdx++;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function createUnit(faction, isTitle = false) {
    return {
        id: `fake_${fakeUnits.length + 1}`,
        name: getName(),
        rank: 'A', // placeholder
        limited: false, // placeholder
        tier: 3, // placeholder
        faction: faction,
        tags: [],
        image: getRandomImage(),
        synergy: {},
        join: []
    };
}

// Write to file
fs.writeFileSync(fakeUnitsPath, JSON.stringify(fakeUnits, null, 2));
console.log(`Generated ${fakeUnits.length} fake units to ${fakeUnitsPath}`);
