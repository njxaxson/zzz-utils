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
    checkTeamDependencies,
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

// ===========================================================================
// TESTS 20-23: Codependent scaling (YSG veil dependency)
// ===========================================================================
//
// Limited roster that has no adequate veil provider (Cissia has veils:1 < YSG's
// scaling.veils:2). YSG has codependent:true; Aria does not.

const CODEPENDENT_ROSTER = [
    'Cissia', 'Lucia', 'Koleda', 'Nekomata',
    'Anby', 'Ben', 'Billy', 'Corin', 'Komano', 'Lucy',
    'Nicole', 'Pan Yinhu', 'Pulchra', 'Seth', 'Soukaku'
];

await runTest(20, 'YSG codependent — unmet veil dependency drops priority', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, CODEPENDENT_ROSTER);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    const ysgRec = result.recommendations.find(r => r.units.some(u => u.id === 'ysg'));
    assert(ysgRec, 'YSG should appear in recommendations');
    assert(ysgRec.teamDependencyNotes?.length > 0,
        'YSG recommendation should have teamDependencyNotes (veil providers missing)');

    const providerIds = ysgRec.teamDependencyNotes.flatMap(n => n.providers.map(p => p.id));
    assert(providerIds.includes('sunna'), 'Sunna should be listed as a veil provider');
    assert(providerIds.includes('zhao'), 'Zhao should be listed as a veil provider');

    // Priority should be one rank lower than it would be without the check
    assert(ysgRec.priority !== 'High',
        `YSG priority should have been downgraded, got ${ysgRec.priority}`);
});

await runTest(21, 'YSG codependent — Sunna in roster satisfies dependency', () => {
    const roster = [...CODEPENDENT_ROSTER, 'Sunna'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    const ysgRec = result.recommendations.find(r => r.units.some(u => u.id === 'ysg'));
    if (ysgRec) {
        assert(!ysgRec.teamDependencyNotes?.length,
            'YSG should have no teamDependencyNotes when Sunna is owned');
    }
});

await runTest(22, 'YSG codependent — Zhao in roster satisfies dependency', () => {
    const roster = [...CODEPENDENT_ROSTER, 'Zhao'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    const ysgRec = result.recommendations.find(r => r.units.some(u => u.id === 'ysg'));
    if (ysgRec) {
        assert(!ysgRec.teamDependencyNotes?.length,
            'YSG should have no teamDependencyNotes when Zhao is owned');
    }
});

await runTest(23, 'Aria has no codependent flag — no dependency check runs', () => {
    // Put Aria on a synthetic banner to ensure she gets assessed for tile verdicts
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, CODEPENDENT_ROSTER);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    const ariaRec = result.recommendations.find(r => r.units.some(u => u.id === 'aria'));
    if (ariaRec) {
        assert(!ariaRec.teamDependencyNotes?.length,
            'Aria should NOT have teamDependencyNotes — she has no codependent flag');
    }

    // Also verify directly via checkTeamDependencies
    const aria = unitByName(allUnits, 'Aria');
    const dep = checkTeamDependencies(aria, ownedUnits, allUnits);
    assert(!dep.hasUnmetDependency,
        'checkTeamDependencies should return no unmet dependency for Aria (no codependent flag)');
});

// ===========================================================================
// TESTS 24-29: Per-archetype support coverage
// ===========================================================================

await runTest(24, 'Support coverage — Lucia alone does NOT cover attack support', () => {
    const roster = ['Evelyn', 'Lucia', 'Koleda', 'Nicole', 'Anby', 'Billy'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    assert(hasGap(result, 'support-attack'),
        'support-attack gap should fire — Lucia is a terrible fit for attack teams');

    const gap = findGap(result, 'support-attack');
    const sunna = gap.units.find(u => u.id === 'sunna');
    assert(sunna, 'Sunna should appear as a candidate in the support-attack gap');
});

await runTest(25, 'Support coverage — Astra covers attack support', () => {
    const roster = ['Evelyn', 'Astra', 'Koleda', 'Nicole', 'Anby', 'Billy'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    assert(!hasGap(result, 'support-attack'),
        'support-attack gap should NOT fire — Astra is a strong fit for attack teams');
});

await runTest(26, 'Support coverage — Yuzuha alone does NOT cover rupture support', () => {
    const roster = ['Yixuan', 'Yuzuha', 'Dialyn', 'Nicole', 'Anby', 'Billy'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    assert(hasGap(result, 'support-rupture'),
        'support-rupture gap should fire — Yuzuha is a poor fit for rupture teams');

    const gap = findGap(result, 'support-rupture');
    const lucia = gap.units.find(u => u.id === 'lucia');
    assert(lucia, 'Lucia should appear as a candidate in the support-rupture gap');
});

await runTest(27, 'Support coverage — Sunna is a High recommendation when Lucia is the only premium support', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, CODEPENDENT_ROSTER);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    // A support-attack gap should fire: Lucia is a rupture specialist and
    // provides almost nothing for attack teams. Even though attack DPS quality
    // is low, the player has attack DPS (A-rank) and zero adequate support.
    assert(hasGap(result, 'support-attack'),
        'support-attack gap should fire — Lucia does not cover attack support needs');

    const gap = findGap(result, 'support-attack');
    assert(gap.units.some(u => u.id === 'sunna'),
        'Sunna should appear as a candidate in the support-attack gap');

    // With only one specialist premium support, the gap should be High priority
    assert(gap.priority === 'High',
        `support-attack gap should be High priority, got ${gap.priority}`);

    // Sunna should appear in a recommendation card independently of YSG
    const sunnaRec = result.recommendations.find(r =>
        r.units.some(u => u.id === 'sunna'));
    assert(sunnaRec, 'Sunna should appear in a recommendation card');
});

await runTest(28, 'Support coverage — Astra is a High recommendation when Lucia is the only premium support', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, CODEPENDENT_ROSTER);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    assert(hasGap(result, 'support-attack'),
        'support-attack gap should fire — Lucia does not cover attack support needs');

    const gap = findGap(result, 'support-attack');
    assert(gap.units.some(u => u.id === 'astra'),
        'Astra should appear as a candidate in the support-attack gap');

    assert(gap.priority === 'High',
        `support-attack gap should be High priority, got ${gap.priority}`);

    const astraRec = result.recommendations.find(r =>
        r.units.some(u => u.id === 'astra'));
    assert(astraRec, 'Astra should appear in a recommendation card');
});

await runTest(29, 'Support coverage — Lucia recommended for rupture, Sunna excluded (join incompatible)', () => {
    // Codependent roster with Lucia removed and Zhao added
    const roster = CODEPENDENT_ROSTER.filter(n => n !== 'Lucia').concat('Zhao');
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    // Rupture support gap should fire — Zhao can't join rupture teams
    assert(hasGap(result, 'support-rupture'),
        'support-rupture gap should fire — Zhao does not cover rupture support');

    const gap = findGap(result, 'support-rupture');
    assert(gap.units.some(u => u.id === 'lucia'),
        'Lucia should appear as a candidate in the support-rupture gap');

    // Sunna joins on ["attack", "faction"] — she cannot be on rupture teams
    assert(!gap.units.some(u => u.id === 'sunna'),
        'Sunna should NOT appear in the support-rupture gap — her join conditions are incompatible');

    // Sunna should appear independently in the support-attack gap instead
    assert(hasGap(result, 'support-attack'),
        'support-attack gap should also fire');
    const attackGap = findGap(result, 'support-attack');
    assert(attackGap.units.some(u => u.id === 'sunna'),
        'Sunna should appear in the support-attack gap instead');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
