const SUBSTATS = [
    "ATK",
    "ATK %",
    "HP",
    "HP %",
    "DEF",
    "DEF %",
    "PEN",
    "Anomaly Proficiency",
    "Crit Rate",
    "Crit Damage",
];
const MAINSTATS = [
    ["ATK"],
    ["HP"],
    ["DEF"],
    ["ATK %", "HP %", "DEF %", "Anomaly Proficiency", "Crit Rate", "Crit Damage"],
    ["ATK %", "HP %", "DEF %", "PEN Ratio", "Fire Damage", "Ice Damage", "Electric Damage", "Ether Damage", "Physical Damage"], 
    ["ATK %", "HP %", "DEF %", "Anomaly Mastery", "Impact", "Energy Regen"]
];

function random(until) {
  if (until <= 0 || !Number.isInteger(until)) {
    throw new Error('until must be a positive integer');
  } 
  const bitsNeeded = Math.ceil(Math.log2(until));
  const bytesNeeded = Math.ceil(bitsNeeded / 8);
  const maxValue = 2 ** bitsNeeded;
  const threshold = maxValue - (maxValue % until);
  let value;
  do {
    const randomBytes = new Uint8Array(bytesNeeded);
    crypto.getRandomValues(randomBytes);
    value = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      value = (value << 8) | randomBytes[i];
    }
    value = value & (maxValue - 1);
  } while (value >= threshold);
  return value % until;
}

function generateDisc(slot) {
    if(slot === undefined) {
        slot = random(6);
    } else {
        slot--; 
    }
    let end = MAINSTATS[slot].length;
    const disc = {
        slot: 1 + slot,
        main: MAINSTATS[slot][random(end)],
        substats: []
    };
    let substats = [...SUBSTATS];
    const mainfound = substats.includes(disc.main);
    if(mainfound >= 0) {
        substats.splice(mainfound, 1)
    }
    while(disc.substats.length < 3) {
        const substat = substats.splice(random(substats.length), 1)[0];
        disc.substats.push(substat);
    }
    if(random(5) == 0) {
        //add fourth substat
        const substat = substats.splice(random(substats.length), 1)[0];
        disc.substats.push(substat);
    }
    return disc;
}
function upgradeDisc(disc) {
    let rolls = 0;
    let substats = [...SUBSTATS];
    let already = [...disc.substats];
    already.push(disc.main);
    already.forEach(stat => {
        const found = substats.indexOf(stat);
        if(found >= 0) substats.splice(found, 1);
    });
    if(disc.substats.length < 4) { 
        let substat = substats.splice(random(substats.length), 1)[0];
        disc.substats.push(substat);
        rolls++;
    }
    disc.upgrades = [0, 0, 0, 0];
    for(let i = rolls; i < 5; i++) {
        disc.upgrades[random(disc.upgrades.length)]++;
    }
    return disc;
}
function generateDiscs(count, upgraded = true) {
    const discs = [];
    for(let i = 0; i < count; i++) {
        let disc = generateDisc();
        discs.push(upgraded ? upgradeDisc(disc) : disc);
    }
    return discs;
}

const PROFILE_ATTACK = [
    { main: ["ATK"], substats: ["ATK %", "Crit Rate","Crit Damage"]},
    { main: ["HP"], substats: ["ATK %", "Crit Rate","Crit Damage"]},
    { main: ["DEF"], substats: ["ATK %", "Crit Rate","Crit Damage"]},
    { main: ["Crit Rate","Crit Damage"], substats: ["ATK %", "Crit Rate","Crit Damage"]},
    { main: ["ATK %","PEN Ratio","Fire Damage"], substats: ["ATK %", "Crit Rate","Crit Damage"]}, //all elements are statistically the same here
    { main: ["ATK %"], substats: ["ATK %", "Crit Rate","Crit Damage"]}
];
const PROFILE_ANOMALY = [
    { main: ["ATK"], substats: ["ATK %", "Anomaly Proficiency"]},
    { main: ["HP"], substats: ["ATK %", "Anomaly Proficiency"]},
    { main: ["DEF"], substats: ["ATK %", "Anomaly Proficiency"]},
    { main: ["Anomaly Proficiency"], substats: ["ATK %", "Anomaly Proficiency"]},
    { main: ["ATK %","PEN Ratio","Fire Damage"], substats: ["ATK %", "Anomaly Proficiency"]}, //all elements are statistically the same here
    { main: ["Anomaly Mastery"], substats: ["ATK %", "Anomaly Proficiency"]}
];
const PROFILE_RUPTURE = [
    { main: ["ATK"], substats: ["HP %", "Crit Rate","Crit Damage"]},
    { main: ["HP"], substats: ["HP %", "Crit Rate","Crit Damage"]},
    { main: ["DEF"], substats: ["HP %", "Crit Rate","Crit Damage"]},
    { main: ["Crit Rate","Crit Damage"], substats: ["HP %", "Crit Rate","Crit Damage"]},
    { main: ["HP %","Fire Damage"], substats: ["HP %", "Crit Rate","Crit Damage"]}, //all elements are statistically the same here
    { main: ["HP %"], substats: ["HP %", "Crit Rate","Crit Damage"]}
];

function suitability(disc, profile) {
    const desired = profile[disc.slot-1];
    const evaluation = {
        main: desired.main.includes(disc.main),
        rolls: 0
    };
    desired.substats.forEach(stat => {
        let index = disc.substats.indexOf(stat);
        if(index >= 0) {
            evaluation.rolls++;
            if(disc.upgrades) evaluation.rolls += disc.upgrades[index];
        }
    })
    return evaluation;
}

function discSetScore(profile, discs) {
    const evaluations = discs.map(disc => suitability(disc, profile));
    const score = {
        discs : discs,    
        rolls : evaluations.reduce((sum, e) => sum + e.rolls, 0),
        main  : evaluations.map(e => e.main).filter(val => val).length
    }
    return score;
}

function partition(discs) {
    const grouped = Array.from({ length: 6 }, () => []);
    discs.forEach(d => grouped[d.slot-1].push(d));
    return grouped;
}

function findBest(profile, slot, discs) {
    const rankings = discs
        .filter(d => d.slot == slot)
        .map(d => {
            const ranking = {
                disc: d,
                evaluation: suitability(d, profile)
            }
            //console.log(`${slot}. Rolls: ${ranking.evaluation.rolls}`)
            return ranking;
        })
        .filter(ranking => ranking.evaluation.main)
        .sort((a,b)=> b.evaluation.rolls - a.evaluation.rolls);
    //console.log(`*** RANKING: ${rankings[0].evaluation.rolls} ***`)    
    return (rankings.length > 0) ? rankings[0].disc : null;
}

function findBestSet(profile, discs) {
    const best = [];
    for(let i = 1; i <= 6; i++) {
        best.push(findBest(profile, i, discs));
    }
    return best;
}

function toString(disc) {
    let s = `[${disc.slot}] ${disc.main}`
    for(let i = 0; i < disc.substats.length; i++) {
        s += `\n  ${disc.substats[i]}`;
        if(disc.upgrades && disc.upgrades.length > i && disc.upgrades[i] > 0) {
            s += ' +' + disc.upgrades[i];
        }
    }
    return s;
}


const profile = [ //YSG
    { main: ["ATK"], substats: ["ATK %", "Crit Rate","Crit Damage"]},
    { main: ["HP"], substats: ["ATK %", "Crit Rate","Crit Damage"]},
    { main: ["DEF"], substats: ["ATK %", "Crit Rate","Crit Damage"]},
    { main: ["Crit Damage"], substats: ["ATK %", "Crit Rate"]},
    { main: ["ATK %","Physical Damage"], substats: ["ATK %",  "Crit Rate", "Crit Damage"]}, 
    { main: ["ATK %"], substats: ["Crit Rate","Crit Damage"]}
];
const discs = generateDiscs(400);
let best = findBestSet(profile, discs);
let score = discSetScore(profile, best);
console.info(`Substat Rolls: ${score.rolls}`);
best.forEach(disc => console.info(toString(disc)));