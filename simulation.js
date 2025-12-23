/**
 * ZZZ Gacha Simulator - Command Line Interface
 * 
 * Uses shared simulation logic from app/public/lib/gacha-core.js
 * 
 * Usage: node simulation.js
 * 
 * Configure context below to set your pull parameters.
 */

// Dynamic import for ES module
async function main() {
    const { 
        SIMULATIONS,
        toLabel,
        toPercentage,
        runBatchSimulation
    } = await import('./app/public/lib/gacha-core.js');

    // ============================================================================
    // CONFIGURATION - Edit these values
    // ============================================================================
    
    let context = {
        p: Math.floor(31898 / 160) + 37,  // Total pulls (polychrome / 160 + tapes)
        c: 3,                               // Target character copies (1 = M0, 7 = M6)
        w: 1,                               // Target W-Engine copies (1 = W1, 5 = W5)
        pity: [10, 19, 4, 3],              // [S-Char, S-Weapon, A-Char, A-Weapon]
        guarantees: [false]                 // [Char guaranteed, Weapon guaranteed]
    };

    // Additional pull calculations (uncomment as needed)
    // context.p += Math.floor(86/3); //v2.4 pulls left in first half (86, but two-thirds done already)
    // context.p += 15; //v2.4 pulls available in second half
    // context.p += Math.floor((12588-3206+780)/160) + 18; //v2.5, minus endgame poly, plus monthly pass

    // ============================================================================
    // OPTIONS
    // ============================================================================
    
    const showStandardWins = context.p >= 300; // Show standard S-rank distribution
    const showDistributionA = false;            // Show A-rank distribution
    const includeRefunds = context.p > 100;     // Include A-rank refund estimates

    if (includeRefunds) {
        context.p += Math.floor(context.p 
            * 0.065); // Assuming 1/10 is guaranteed A-rank, 65% are characters = refund
            //* 0.031); // Lower-end statistical rate-of-return for M6+ A residual signals
    }

    // ============================================================================
    // VALIDATION
    // ============================================================================
    
    //Guaranteed Thresholds: M0W0=180, M0W1=340, M1W1=520, M2W1=700
    //       75% Thresholds: M0W0=144, M0W1=234, M1W1=349, M2W1=457

    if (context.c > 7 || context.w > 5) {
        console.warn("Target is above M6W5 maximum");
    }

    // ============================================================================
    // RUN SIMULATION
    // ============================================================================
    
    const results = runBatchSimulation(context);
    const { target, s_limited, s_standard, a_featured, mean, stddev, avgA, avgP } = results;

    // ============================================================================
    // OUTPUT RESULTS
    // ============================================================================
    
    console.log(`\nTarget S-Rank: ${target}, pulls: ${context.p} ${includeRefunds ? '(including A-rank refunds)' : ''}`);
    
    for (const key in s_limited) {
        if (s_limited[key] == 0) continue;
        console.log(`    ${key} : ${s_limited[key].toString().padStart(7)} - ${toPercentage(s_limited[key])}`);
    }

    if (showStandardWins) {
        console.log(`\nBonus S-Rank Stats:`);
    }
    for (const key in s_standard) {
        if (s_standard[key] == 0) continue;
        if (showStandardWins) {
            console.log(`    ${key} : ${s_standard[key].toString().padStart(7)} - ${toPercentage(s_standard[key])}`);
        }
    }

    if (showDistributionA) {
        console.log(`\nBonus A-Rank Stats:`);
    }
    for (const key in a_featured) {
        if (a_featured[key] == 0) continue;
        if (showDistributionA) {
            console.log(`    ${key.padEnd(3)} : ${a_featured[key].toString().padStart(7)} - ${toPercentage(a_featured[key])}`);
        }
    }

    console.log(`${avgP} average pulls executed in pursuit of target`);
    console.log(`${mean} average remaining pulls on success, standard deviation: ${stddev} (between ${mean - stddev}-${mean + stddev} pulls)`);
    
    if (!includeRefunds) {
        console.log(`${avgA} average featured A-rank pulls`);
    }
}

main().catch(console.error);
