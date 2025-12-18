let context = {
    p: Math.floor(31898 / 160) + 37,
    c: 3, 
    w: 1,
    pity : [10,19,4,3],
    guarantees: [false]
}
let caverage = {
    pulls: 0,
    wins: 0
}
// context.p += Math.floor(86/3); //v2.4 pulls left in first half (86, but two-thirds done already)
// context.p += 15; //v2.4 pulls available in second half
// context.p += Math.floor((12588-3206+780)/160) + 18; //v2.5, minus endgame poly, plus monthly pass

const showStandardWins = context.p >= 300; //seems like a reasonable threshold for wanting to know what this looks like
const showDistributionA = false;
const includeRefunds = context.p > 100;

if(includeRefunds) {
    context.p += Math.floor(context.p 
                            * 0.065) //assuming 1 out of every 10 is guaranteed to be an A-rank, and 65% of A ranks will be characters, that's a guaranteed A-rank refund
                            //* 0.031); //lower-end statistical rate-of-return for M6+ A residual signals -> pulls
}



//Guaranteed Thresholds: M0W0=180, M0W1=340, M1W1=520, M2W1=700
//       75% Thresholds: M0W0=144, M0W1=234, M1W1=349, M2W1=457

if(context.c > 7 || context.w > 5) console.warn("Target is above M6W5 maximum");

const SIMULATIONS = 100000.0;
const RATE_S = 0.006;
const RATE_A = 0.072;
const PITY_C = 90;
const PITY_W = 80;
const PITY_A = 10;
const CFEATURED = 0.5;
const WFEATURED = 0.75;

const RESULT_FEATURED_S = 4;
const RESULT_STANDARD_S = 3;
const RESULT_FEATURED_A = 2;
const RESULT_STANDARD_A = 1;
const RESULT_NOTHING  = 0;

function cpull(state) {
    state.cpity++;
    const roll = Math.random();
    if(state.cpity >= PITY_C || roll < RATE_S) {
        caverage.pulls += state.cpity;
        caverage.wins++;
        state.cpity = 0;
        if(state.cguaranteed || Math.random() < CFEATURED) {
            state.cguaranteed = false;
            return RESULT_FEATURED_S;
        }         
        //otherwise
        state.cguaranteed = true;
        return RESULT_STANDARD_S;
    } else
    if(state.apity >= PITY_A || roll < RATE_S + RATE_A) {
        state.apity = 0;
        if(state.aguaranteed || Math.random() < CFEATURED) {
            state.aguaranteed = false;
            return RESULT_FEATURED_A;
        }         
        //otherwise
        state.aguaranteed = true;
        return RESULT_STANDARD_A;
    }
    //otherwise
    return RESULT_NOTHING;
}

function wpull(state) {
    state.wpity++;
    const roll = Math.random();
    if(state.wpity >= PITY_W || roll < RATE_S) {
        state.wpity = 0;
        if(state.wguaranteed || Math.random() < WFEATURED) {
            state.wguaranteed = false;
            return RESULT_FEATURED_S;
        }         
        //otherwise
        state.wguaranteed = true;
        return RESULT_STANDARD_S;
    } else
    if(state.epity >= PITY_A || roll < RATE_S + RATE_A) {
        state.epity = 0;
        if(state.eguaranteed || Math.random() < WFEATURED) {
            state.eguaranteed = false;
            return RESULT_FEATURED_A;
        }         
        //otherwise
        state.eguaranteed = true;
        return RESULT_STANDARD_A;
    }
    //otherwise
    return RESULT_NOTHING;
}

function simulate(context) {
    let state = {
        cpity : context.pity && context.pity.length > 0 && context.pity[0] ? context.pity[0] : 0,
        wpity : context.pity && context.pity.length > 1 && context.pity[1] ? context.pity[1] : 0,
        apity : context.pity && context.pity.length > 2 && context.pity[2] ? context.pity[2] : 0,
        epity : context.pity && context.pity.length > 3 && context.pity[3] ? context.pity[3] : 0,
        cguaranteed : context.guarantees && context.guarantees.length > 0 && context.guarantees[0],
        wguaranteed : context.guarantees && context.guarantees.length > 1 && context.guarantees[1], 
        aguaranteed : context.guarantees && context.guarantees.length > 2 && context.guarantees[2],
        eguaranteed : context.guarantees && context.guarantees.length > 3 && context.guarantees[3] 
    };
    let results = {
        fc: 0,
        fw: 0,
        sc: 0,
        sw: 0,
        fa: 0,
        sa: 0,
        fe: 0,
        se: 0
    };
    let pulls = context.p;
    //Minimum success 1
    while(context.c > 0 && pulls > 0 && results.fc == 0) {
        pulls--;
        const result = cpull(state);
        ctally(result, results); 
    }
    while(context.w > 0 && pulls > 0 && results.fw == 0) {
        pulls--;
        const result = wpull(state);
        wtally(result, results); 
    }
    //Extra successes
    while(results.fc < context.c && pulls > 0) {
        pulls--;
        const result = cpull(state);
        ctally(result, results);  
    }
    while(results.fw < context.w && pulls > 0) {
        pulls--;
        const result = wpull(state);
        wtally(result, results); 
    }
    results.p = pulls;
    return results;
}

function ctally(result, results) {
    if (result == RESULT_FEATURED_S) results.fc++; else 
    if (result == RESULT_STANDARD_S) results.sc++; else 
    if (result == RESULT_FEATURED_A) results.fa++; else 
    if (result == RESULT_STANDARD_A) results.sa++;
}
function wtally(result, results) {
    if (result == RESULT_FEATURED_S) results.fw++; else 
    if (result == RESULT_STANDARD_S) results.sw++; else 
    if (result == RESULT_FEATURED_A) results.fe++; else 
    if (result == RESULT_STANDARD_A) results.se++;
}
function toLabel(c, w) {
    return (c == 0) ? "MxW" + w : "M" + Math.min(c-1,6) + "W" + Math.min(w,5);
}
function toPercentage(n,d) {
    if(d === undefined) d = SIMULATIONS;
    const ratio = n/d;
    const adjusted = Math.round(ratio*1000)/10;
    const percent =  adjusted.toFixed(1).toString() + "%";
    return percent.padStart(6);
}

//prepare keys
const s_limited = {}, s_standard = {}, a_featured = {};
for(let w = 0; w <= context.w; w++)  {
    for(let c = 0; c <= context.c; c++) {
        s_limited[toLabel(c,w)] = 0;
        s_standard[toLabel(c,w)] = 0;
    }
}
//run
const target = toLabel(context.c,context.w);
let totalPulls = 0;
let remaining = 0;
let set = [];
for(i = 0, n = SIMULATIONS; i < n; i++) {
    const result = simulate(context);
    s_limited[toLabel(result.fc,result.fw)]++;
    s_standard[toLabel(result.sc,result.sw)]++;
    if(result.fa.toString() in a_featured) a_featured[result.fa.toString()]++; else a_featured[result.fa.toString()] = 1;
    remaining += result.p;
    totalPulls += context.p - result.p; 
    if(result.p > 0) set.push(result.p);
}
let mean = remaining/s_limited[target];
set = set.map(k => (k-mean) ** 2);
const squaresum = set.reduce((sum, item) => sum + item, 0);
const variance = squaresum / set.length;
let stddev = Math.sqrt(variance);
mean = Math.round(mean);
stddev = Math.round(stddev);

console.log(`\nTarget S-Rank: ${target}, pulls: ${context.p} ${includeRefunds ? '(including A-rank refunds)' : ''}`);
for(const key in s_limited) {
    if(s_limited[key] == 0) continue;
    console.log(`    ${key} : ${s_limited[key].toString().padStart(7)} - ${toPercentage(s_limited[key])}`)
}
if(showStandardWins) console.log(`\nBonus S-Rank Stats:`);
for(const key in s_standard) {
    if(s_standard[key] == 0) continue;
    if(showStandardWins) console.log(`    ${key} : ${s_standard[key].toString().padStart(7)} - ${toPercentage(s_standard[key])}`)
}
//TODO summarize probability of M6 and W5 of featured, don't need actual breakdown. Also calc average repulls. 
if(showDistributionA) console.log(`\nBonus A-Rank Stats:`);
let weightedSum = 0, totalWeight = 0;
for(const key in a_featured) {
    if(a_featured[key] == 0) continue;
    if(showDistributionA) console.log(`    ${key.padEnd(3)} : ${a_featured[key].toString().padStart(7)} - ${toPercentage(a_featured[key])}`)
    weightedSum += key * a_featured[key];
    totalWeight += a_featured[key];
}
const avgA = (weightedSum/totalWeight).toFixed(2);
const avgP = Math.ceil(totalPulls/SIMULATIONS);
console.log(`${avgP} average pulls executed in pursuit of target`);
console.log(`${mean} average remaining pulls on success, standard deviation: ${stddev} (between ${mean-stddev}-${mean+stddev} pulls)`);
if(!includeRefunds) {
  //console.log(`${avgA} average featured A-rank pulls; average refund percentage: ${toPercentage(avgA,avgP)}`);
  console.log(`${avgA} average featured A-rank pulls`);
}
