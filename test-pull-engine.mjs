/**
 * test-pull-engine.mjs
 *
 * Assertion-based regression tests for the pull recommendations engine.
 *
 * Run from the repository root:
 *   node test-pull-engine.mjs
 *   node test-pull-engine.mjs -1 -11
 *
 * Exit code: 0 if all (specified) tests pass, 1 if any fail.
 */

import { loadUnits } from './lib/data.js';
import {
    analyze,
    isSubdps,
    getUnitElement,
    tierToQuality,
    qualityLabel,
    capitalize,
    DPS_ARCHETYPES
} from './app/public/lib/common/pull-engine.js';

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function buildSyntheticRoster(allUnits, ownedNames) {
    const unitStates = {};
    const ownedUnits = [];
    const nameSet = new Set(ownedNames.map(n => n.toLowerCase()));
    for (const u of allUnits) {
        const owned = nameSet.has(u.name.toLowerCase()) || nameSet.has(u.id.toLowerCase());
        unitStates[u.id] = { owned };
        if (owned) ownedUnits.push(u);
    }
    return { unitStates, ownedUnits };
}

function findGap(result, id) {
    return result.allGaps.find(g => g.id === id);
}

function hasGap(result, id) {
    return result.allGaps.some(g => g.id === id);
}

function gapReasons(result) {
    return result.allGaps.map(g => g.reason).join(' ');
}

function unitByName(allUnits, name) {
    return allUnits.find(u => u.name.toLowerCase() === name.toLowerCase());
}

// ---------------------------------------------------------------------------
// Parse -N test filters from argv
// ---------------------------------------------------------------------------

const testFilters = process.argv
    .slice(2)
    .filter(a => /^-\d+$/.test(a))
    .map(a => parseInt(a.slice(1), 10));

function shouldRun(n) {
    return testFilters.length === 0 || testFilters.includes(n);
}

const allUnits = await loadUnits();
let passed = 0;
let failed = 0;

async function runTest(num, name, fn) {
    if (!shouldRun(num)) return;
    try {
        await fn();
        console.log(`  PASS  TEST ${num}: ${name}`);
        passed++;
    } catch (e) {
        console.log(`  FAIL  TEST ${num}: ${name}`);
        console.log(`        ${e.message}`);
        failed++;
    }
}

console.log('Pull Engine Tests\n');

// TEST 1
await runTest(1, 'isSubdps correctness', () => {
    const subdpsNames = ['Burnice', 'Vivian', 'Grace', 'Cissia', 'Orphie', 'Velina'];
    const primaryNames = ['Miyabi', 'Evelyn', 'SAnby'];
    for (const name of subdpsNames) {
        const u = unitByName(allUnits, name);
        assert(u, `missing unit ${name}`);
        assert(isSubdps(u), `${name} should be subdps`);
    }
    for (const name of primaryNames) {
        const u = unitByName(allUnits, name);
        assert(u, `missing unit ${name}`);
        assert(!isSubdps(u), `${name} should not be subdps`);
    }
});

// TEST 2
await runTest(2, 'Empty roster gap detection', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, ['Nicole', 'Anby', 'Billy']);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(hasGap(result, 'dps-attack'), 'expected attack DPS gap');
    assert(hasGap(result, 'dps-anomaly'), 'expected anomaly DPS gap');
    assert(hasGap(result, 'dps-rupture'), 'expected rupture DPS gap');
    assert(hasGap(result, 'support'), 'expected support gap');
    const high = result.recommendations.filter(r => r.priority === 'High');
    assert(high.length >= 3, `expected multiple high-priority recs, got ${high.length}`);
});

// TEST 3
await runTest(3, 'Attack-only roster', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Evelyn', 'Dialyn', 'Astra', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(hasGap(result, 'dps-anomaly'), 'expected anomaly DPS gap');
    assert(hasGap(result, 'dps-rupture'), 'expected rupture DPS gap');
    const anomalyGap = findGap(result, 'dps-anomaly');
    assert(anomalyGap && anomalyGap.score >= 70, 'anomaly gap should be high priority');
    const reasons = gapReasons(result);
    assert(!reasons.includes('Astra'), 'reasons should not reference Astra by name');
    assert(!reasons.includes('Yuzuha'), 'reasons should not reference Yuzuha by name');
    assert(!reasons.includes('Lucia'), 'reasons should not reference Lucia by name');
});

// TEST 4
await runTest(4, 'Anomaly-loaded roster', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Nangong', 'Yuzuha', 'Vivian', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(result.coverage.dpsQuality.anomaly >= 95, `anomaly quality expected Elite, got ${result.coverage.dpsQuality.anomaly}`);
    assert(qualityLabel(result.coverage.dpsQuality.anomaly) === 'Elite', 'anomaly should be Elite');
    assert(!hasGap(result, 'subdps-anomaly'), 'anomaly sub-DPS gap should not fire when Vivian owned');
    assert(!hasGap(result, 'anomaly-partner'), 'anomaly partner gap should not fire with Vivian+Nangong');
    const hasAttackOrRuptureRec = result.recommendations.some(r =>
        r.title.includes('Attack') || r.title.includes('Rupture')
    );
    assert(hasAttackOrRuptureRec, 'should recommend attack or rupture DPS');
});

// TEST 5
await runTest(5, 'Support gap mechanics', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Yixuan', 'Evelyn', 'Koleda', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const supportGap = findGap(result, 'support');
    assert(supportGap, 'expected support gap');
    assert(!supportGap.reason.includes('must pull Astra'), 'support reason should not hardcode Astra');
    assert(!/\byuzuha\b/i.test(supportGap.reason), 'support reason should not hardcode Yuzuha');
    assert(supportGap.units.length > 0, 'support gap should list candidates');
});

// TEST 6
await runTest(6, 'Wind element coverage', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Evelyn', 'Dialyn', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits);
    assert(result.coverage.elementQuality.wind === 0,
        `wind element quality should be 0, got ${result.coverage.elementQuality.wind}`);
    const velina = unitByName(allUnits, 'Velina');
    if (velina && isSubdps(velina)) {
        assert(getUnitElement(velina) === 'wind', 'Velina should be wind');
    }
});

// TEST 7
await runTest(7, 'Loaded roster still produces recommendations', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Nangong', 'Yuzuha', 'Astra', 'Yixuan', 'Dialyn', 'Evelyn', 'Trigger', 'SAnby', 'Lucia', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 10 });
    const tier = result.assessment.ratingTier;
    // A loaded roster with remaining high-priority gaps is at most Well-Rounded;
    // Strong Coverage or Fully Loaded are still valid if gaps are all Medium/Low.
    const validTiers = ['Well-Rounded', 'Strong Coverage', 'Fully Loaded'];
    assert(validTiers.includes(tier), `expected a mid-to-high tier, got ${tier}`);
    assert(result.recommendations.length >= 3, 'should have at least 3 recommendations');
    const scored = result.recommendations.filter(r => r.score > 0);
    assert(scored.length >= 3, 'at least 3 recommendations with score > 0');
});

// TEST 8
await runTest(8, 'Mechanics synergy detection', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['SAnby', 'Trigger', 'Astra', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    // Orphie may be grouped with other candidates sharing the same best pair; search by unit content
    const orphieGap = result.allGaps.find(g =>
        g.id.startsWith('mech-synergy-') && g.units.some(u => u.name === 'Orphie')
    );
    assert(orphieGap, 'expected mechanical synergy gap containing Orphie');
    assert(orphieGap.score >= 15, `Orphie synergy score too low: ${orphieGap.score}`);
});

// TEST 9
await runTest(9, 'SubDPS not counted as primary', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Vivian', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(result.coverage.dpsQuality.anomaly === 0,
        `anomaly dpsQuality should be 0 without primary, got ${result.coverage.dpsQuality.anomaly}`);
    assert(hasGap(result, 'dps-anomaly'), 'should recommend primary anomaly DPS');
});

// TEST 10
await runTest(10, 'Calibration does not flatten loaded rosters', () => {
    const loadedNames = [
        'Miyabi', 'Nangong', 'Yuzuha', 'Astra', 'Yixuan', 'Dialyn',
        'Evelyn', 'Trigger', 'SAnby', 'Lucia', 'Yanagi', 'Burnice',
        'Evelyn', 'Nicole', 'Anby', 'Billy'
    ];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, loadedNames);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(result.compositeScore > 70, `expected loaded composite > 70, got ${result.compositeScore}`);
    const scores = result.allGaps.map(g => g.score).filter(s => s > 0);
    assert(scores.length >= 2, 'need at least 2 scored gaps');
    const spread = Math.max(...scores) - Math.min(...scores);
    assert(spread > 15, `gap score spread should be > 15, got ${spread}`);
});

// TEST 11a
await runTest(11, '11a: No disorder partner', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, ['Miyabi', 'Nicole', 'Anby', 'Billy']);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const gap = findGap(result, 'anomaly-partner');
    assert(gap, 'expected anomaly-partner gap');
    assert(gap.reason.includes('no anomaly partner'), `unexpected reason: ${gap.reason}`);
    const ids = gap.units.map(u => u.id);
    assert(ids.includes('burnice') || ids.includes('vivian'), 'expected Burnice or Vivian as candidate');
});

// TEST 11b
await runTest(12, '11b: Same-element sub-DPS', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Yanagi', 'Grace', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const gap = findGap(result, 'anomaly-partner');
    assert(gap, 'expected anomaly-partner gap when Grace same element as Yanagi');
    assert(gap.reason.includes('element') || gap.reason.includes('low-tier'),
        `expected element or tier reason, got: ${gap.reason}`);
});

// TEST 11c
await runTest(13, '11c: Weak sub-DPS (T3) still fires gap', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Yanagi', 'Grace', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const gap = findGap(result, 'anomaly-partner');
    assert(gap, 'expected anomaly-partner gap when only weak Grace as partner');
    assert(gap.reason.includes('low-tier'), `expected low-tier reason, got: ${gap.reason}`);
});

// TEST 11d
await runTest(14, '11d: Pseudo-anomaly mitigates gap', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Nangong', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(!hasGap(result, 'anomaly-partner'),
        'anomaly-partner gap should not fire with Nangong pseudo-anomaly partner');
});

// TEST 11e
await runTest(15, '11e: Strong partner covers holistically', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Aria', 'Vivian', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(!hasGap(result, 'anomaly-partner'),
        'anomaly-partner gap should not fire with strong Vivian cross-element partner');
});

// TEST 11f
await runTest(16, '11f: Full coverage with Burnice', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Yanagi', 'Burnice', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(!hasGap(result, 'anomaly-partner'),
        'anomaly-partner gap should not fire with Burnice fire partner');
});

// TEST 11g
await runTest(17, '11g: No primary anomaly DPS', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Evelyn', 'Dialyn', 'Trigger', 'Astra', 'Vivian', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(!hasGap(result, 'anomaly-partner'),
        'anomaly-partner gap should not fire without primary anomaly DPS');
});

// TEST 11h
await runTest(18, '11h: Candidate ranking by element match', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Aria', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const gap = findGap(result, 'anomaly-partner');
    assert(gap, 'expected anomaly-partner gap for Aria-only roster');
    const ids = gap.units.map(u => u.id);
    const burniceIdx = ids.indexOf('burnice');
    const vivianIdx = ids.indexOf('vivian');
    if (burniceIdx >= 0 && vivianIdx >= 0) {
        assert(burniceIdx < vivianIdx,
            `Burnice (fire) should rank before Vivian (ether) for Aria roster`);
    }
});

// TEST 19
// Regression: exact roster from diagnostic output.
// Bug 1 — Burnice (T1.5) is owned, so the subdps-anomaly gap should not fire and
//          Vivian should not surface as a top-10 recommendation via that gap.
// Bug 2 — Trigger (T0.5, electric off-field aftershock stunner) is already owned and
//          provides strictly better mechanical fit with SAnby than Ju Fufu does.
//          The mech-synergy-sanby gap must not exist; Ju Fufu's only remaining signal
//          should be the lower-weight rupture-tag affinity gap, not the mechanical one.
await runTest(19, 'Loaded roster: subdps-anomaly and mech-synergy-sanby bugs fixed', () => {
    const rosterNames = [
        // Limited S (18)
        'Astra', 'Banyue', 'Burnice', 'Caesar', 'Cissia', 'Ellen', 'Jane Doe',
        'Lighter', 'Lucia', 'Miyabi', 'Orphie', 'SAnby', 'Seed', 'Trigger',
        'Ye Shunguong', 'Yidhari', 'Yuzuha', 'Zhao',
        // Standard S (6)
        'Grace', 'Koleda', 'Lycaon', 'Nekomata', 'Rina', 'Soldier 11',
        // A-rank (13)
        'Anby', 'Anton', 'Ben', 'Billy', 'Corin', 'Komano', 'Lucy',
        'Nicole', 'Pan Yinhu', 'Piper', 'Pulchra', 'Seth', 'Soukaku'
    ];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, rosterNames);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 10 });

    // Bug 1: subdps-anomaly gap should not fire — Burnice (T1.5, quality 40) meets the threshold
    assert(!hasGap(result, 'subdps-anomaly'),
        'subdps-anomaly gap should not fire when Burnice (T1.5) is owned');

    // Bug 1 corollary: Vivian should not appear in top-10 recommendations via the sub-DPS gap
    const top10UnitIds = new Set(result.recommendations.flatMap(r => r.units.map(u => u.id)));
    assert(!top10UnitIds.has('vivian'),
        'Vivian should not appear in top-10 recommendations — Burnice already covers anomaly sub-DPS');

    // Bug 2: the mechanical synergy gap pairing Ju Fufu with SAnby should not exist —
    // Trigger already provides equal or better off-field aftershock stunner fit for SAnby.
    assert(!hasGap(result, 'mech-synergy-sanby'),
        'mech-synergy-sanby gap should not exist — Trigger already covers this mechanical role');

    // Bug 2 corollary: if Ju Fufu still appears (e.g. via rupture-tag affinity), its score
    // must be LOW priority only — the inflated mech-synergy score (Medium) must be gone.
    const juFufuRec = result.recommendations.find(r => r.units.some(u => u.id === 'ju-fufu'));
    if (juFufuRec) {
        assert(juFufuRec.priority === 'Low',
            `Ju Fufu recommendation should be Low priority only, got ${juFufuRec.priority} — mech-synergy-sanby may still be inflating its score`);
    }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
