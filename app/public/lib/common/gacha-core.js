/**
 * ZZZ Gacha Simulation Core
 * Shared logic for gacha pull simulation
 * 
 * Browser-compatible ES module version
 */

// Constants
export const SIMULATIONS = 100000.0;
export const RATE_S = 0.006;
export const RATE_A = 0.072;
export const PITY_C = 90;
export const PITY_W = 80;
export const PITY_A = 10;
export const CFEATURED = 0.5;
export const WFEATURED = 0.75;
export const REFUND_RATE = 0.65;

export const RESULT_FEATURED_S = 4;
export const RESULT_STANDARD_S = 3;
export const RESULT_FEATURED_A = 2;
export const RESULT_STANDARD_A = 1;
export const RESULT_NOTHING = 0;

/**
 * Simulate a single character banner pull
 * @param {Object} state - Current pity/guarantee state (mutated)
 * @param {Object} tracker - Optional tracker for average calculations
 * @param {boolean} useSoftPity - Whether to use undocumented soft-pity rates
 * @returns {number} Result constant
 */
export function cpull(state, tracker = null, useSoftPity = false) {
    state.cpity++;
    state.apity++;
    const roll = Math.random();
    
    // Calculate S-rank rate (with soft-pity if enabled)
    let sRate = RATE_S;
    if (useSoftPity && state.cpity >= 74 && state.cpity < PITY_C) {
        sRate = RATE_S + (state.cpity - 73) * 0.06;
    }
    
    // Hard guarantee or S-rank roll
    if (state.cpity >= PITY_C || roll < sRate) {
        if (tracker) {
            tracker.pulls += state.cpity;
            tracker.wins++;
        }
        state.cpity = 0;
        state.apity = 0; // A-rank counter resets when S-rank is pulled
        if (state.cguaranteed || Math.random() < CFEATURED) {
            state.cguaranteed = false;
            return RESULT_FEATURED_S;
        }
        //otherwise
        state.cguaranteed = true;
        return RESULT_STANDARD_S;
    }
    
    // Calculate A-rank rate (with soft-pity if enabled)
    let aRate = RATE_A;
    if (useSoftPity && state.apity === 9) {
        aRate = RATE_A + 0.5; // 57.2% instead of 7.2%
    }
    
    // Hard guarantee or A-rank roll
    if (state.apity >= PITY_A || roll < RATE_S + aRate) {
        state.apity = 0;
        if (state.aguaranteed || Math.random() < CFEATURED) {
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

/**
 * Simulate a single W-Engine banner pull
 * @param {Object} state - Current pity/guarantee state (mutated)
 * @param {boolean} useSoftPity - Whether to use undocumented soft-pity rates
 * @returns {number} Result constant
 */
export function wpull(state, useSoftPity = false) {
    state.wpity++;
    state.epity++;
    const roll = Math.random();
    
    // Calculate S-rank rate (with soft-pity if enabled)
    let sRate = RATE_S;
    if (useSoftPity && state.wpity >= 65 && state.wpity < PITY_W) {
        sRate = RATE_S + (state.wpity - 64) * 0.06;
    }
    
    // Hard guarantee or S-rank roll
    if (state.wpity >= PITY_W || roll < sRate) {
        state.wpity = 0;
        state.epity = 0; // A-rank counter resets when S-rank is pulled
        if (state.wguaranteed || Math.random() < WFEATURED) {
            state.wguaranteed = false;
            return RESULT_FEATURED_S;
        }
        //otherwise
        state.wguaranteed = true;
        return RESULT_STANDARD_S;
    }
    
    // Calculate A-rank rate (with soft-pity if enabled)
    let aRate = RATE_A;
    if (useSoftPity && state.epity === 9) {
        aRate = RATE_A + 0.5; // 57.2% instead of 7.2%
    }
    
    // Hard guarantee or A-rank roll
    if (state.epity >= PITY_A || roll < RATE_S + aRate) {
        state.epity = 0;
        if (state.eguaranteed || Math.random() < WFEATURED) {
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

/**
 * Pull tactics - determines the order of pulling when targeting both characters and engines
 * - "engine-first": Pull 1 char, 1 engine, remaining chars, remaining engines (default)
 * - "mindscapes-first": Pull all chars first, then all engines
 */
export const TACTICS = {
    ENGINE_FIRST: "engine-first",
    MINDSCAPES_FIRST: "mindscapes-first"
};

/**
 * Run a complete simulation for the given context
 * @param {Object} context - Simulation parameters (p, c, w, pity[], guarantees[], tactic)
 * @param {Object} tracker - Optional tracker for average calculations
 * @returns {Object} Results object with fc, fw, sc, sw, fa, sa, fe, se, p
 */
export function simulate(context, tracker = null) {
    let state = {
        cpity: context.pity && context.pity.length > 0 && context.pity[0] ? context.pity[0] : 0,
        wpity: context.pity && context.pity.length > 1 && context.pity[1] ? context.pity[1] : 0,
        apity: context.pity && context.pity.length > 2 && context.pity[2] ? context.pity[2] : 0,
        epity: context.pity && context.pity.length > 3 && context.pity[3] ? context.pity[3] : 0,
        cguaranteed: context.guarantees && context.guarantees.length > 0 && context.guarantees[0],
        wguaranteed: context.guarantees && context.guarantees.length > 1 && context.guarantees[1],
        aguaranteed: context.guarantees && context.guarantees.length > 2 && context.guarantees[2],
        eguaranteed: context.guarantees && context.guarantees.length > 3 && context.guarantees[3]
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
    let pullsUsed = 0;
    const tactic = context.tactic || TACTICS.ENGINE_FIRST;
    const useSoftPity = context.useSoftPity || false;
    const refundRate = context.refundRate || 0;

    // Each character banner A-rank (featured or standard) has a refundRate chance
    // of refunding one pull, added immediately back into the remaining pool.
    // This is exhaustive: refund pulls can themselves earn further refunds.
    function cpullWithRefund() {
        pulls--;
        pullsUsed++;
        const result = cpull(state, tracker, useSoftPity);
        ctally(result, results);
        if (refundRate > 0 && (result === RESULT_FEATURED_A || result === RESULT_STANDARD_A)) {
            if (Math.random() < refundRate) pulls++;
        }
    }

    function wpullTracked() {
        pulls--;
        pullsUsed++;
        const result = wpull(state, useSoftPity);
        wtally(result, results);
    }
    
    if (tactic === TACTICS.MINDSCAPES_FIRST) {
        // All mindscapes first, then all engines
        while (results.fc < context.c && pulls > 0) {
            cpullWithRefund();
        }
        while (results.fw < context.w && pulls > 0) {
            wpullTracked();
        }
    } else {
        // Default: engine-first (1 char, 1 engine, remaining chars, remaining engines)
        while (context.c > 0 && pulls > 0 && results.fc == 0) {
            cpullWithRefund();
        }
        while (context.w > 0 && pulls > 0 && results.fw == 0) {
            wpullTracked();
        }
        while (results.fc < context.c && pulls > 0) {
            cpullWithRefund();
        }
        while (results.fw < context.w && pulls > 0) {
            wpullTracked();
        }
    }
    
    results.p = pulls;
    results.pullsUsed = pullsUsed;
    return results;
}

/**
 * Tally character banner result
 */
export function ctally(result, results) {
    if (result == RESULT_FEATURED_S) results.fc++; else
    if (result == RESULT_STANDARD_S) results.sc++; else
    if (result == RESULT_FEATURED_A) results.fa++; else
    if (result == RESULT_STANDARD_A) results.sa++;
}

/**
 * Tally W-Engine banner result
 */
export function wtally(result, results) {
    if (result == RESULT_FEATURED_S) results.fw++; else
    if (result == RESULT_STANDARD_S) results.sw++; else
    if (result == RESULT_FEATURED_A) results.fe++; else
    if (result == RESULT_STANDARD_A) results.se++;
}

/**
 * Convert character/weapon counts to display label
 * @param {number} c - Character count
 * @param {number} w - Weapon count
 * @returns {string} Label like "M2W1" or "MxW0"
 */
export function toLabel(c, w) {
    const label = (c == 0) ? "MxW" + w : "M" + Math.min(c - 1, 6) + "W" + Math.min(w, 5);
    return label == "MxW0" ? "None" : label;
}

/**
 * Convert count to percentage string
 * @param {number} n - Count
 * @param {number} d - Divisor (default: SIMULATIONS)
 * @returns {string} Formatted percentage
 */
export function toPercentage(n, d) {
    if (d === undefined) d = SIMULATIONS;
    const ratio = n / d;
    const adjusted = Math.round(ratio * 1000) / 10;
    const percent = adjusted.toFixed(1).toString() + "%";
    return percent.padStart(6);
}

/**
 * Run batch simulation and collect statistics
 * @param {Object} context - Simulation parameters
 * @param {number} iterations - Number of simulations to run (default: SIMULATIONS)
 * @returns {Object} Aggregated results
 */
export function runBatchSimulation(context, iterations = SIMULATIONS) {
    const tracker = { pulls: 0, wins: 0 };
    
    // Prepare result buckets
    const s_limited = {}, s_standard = {}, a_featured = {};
    for (let w = 0; w <= context.w; w++) {
        for (let c = 0; c <= context.c; c++) {
            s_limited[toLabel(c, w)] = 0;
            s_standard[toLabel(c, w)] = 0;
        }
    }
    
    // Run simulations
    const target = toLabel(context.c, context.w);
    let totalPullsUsed = 0;
    let exhaustedPullsUsed = 0;
    let exhaustedCount = 0;
    let remaining = 0;
    let set = [];
    
    for (let i = 0; i < iterations; i++) {
        const result = simulate(context, tracker);
        s_limited[toLabel(result.fc, result.fw)]++;
        s_standard[toLabel(result.sc, result.sw)]++;
        if (result.fa.toString() in a_featured) {
            a_featured[result.fa.toString()]++;
        } else {
            a_featured[result.fa.toString()] = 1;
        }
        remaining += result.p;
        totalPullsUsed += result.pullsUsed;
        if (result.p === 0) {
            exhaustedPullsUsed += result.pullsUsed;
            exhaustedCount++;
        }
        if (result.p > 0) set.push(result.p);
    }
    
    // Calculate statistics
    let mean = remaining / s_limited[target];
    set = set.map(k => (k - mean) ** 2);
    const squaresum = set.reduce((sum, item) => sum + item, 0);
    const variance = squaresum / set.length;
    let stddev = Math.sqrt(variance);
    mean = Math.round(mean);
    stddev = Math.round(stddev);
    
    // Calculate weighted A-rank average
    let weightedSum = 0, totalWeight = 0;
    for (const key in a_featured) {
        weightedSum += key * a_featured[key];
        totalWeight += a_featured[key];
    }
    const avgA = totalWeight > 0 ? (weightedSum / totalWeight).toFixed(2) : "0.00";
    const avgP = Math.ceil(totalPullsUsed / iterations);
    const avgExhaustedPulls = exhaustedCount > 0 ? Math.floor(exhaustedPullsUsed / exhaustedCount) : context.p;
    
    return {
        target,
        s_limited,
        s_standard,
        a_featured,
        totalPullsUsed,
        remaining,
        mean,
        stddev,
        avgA,
        avgExhaustedPulls,
        avgP,
        tracker,
        iterations
    };
}

