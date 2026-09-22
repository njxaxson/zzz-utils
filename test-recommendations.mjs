// test-recommendations.mjs — assertion-based regression tests for the pull recommendations engine.
// Run: node test-recommendations.mjs [-1 -11 ...]. Exit code 0 if all (specified) tests pass.

import { loadUnits, deepFreeze } from './lib/data.js';
import {
    analyze,
    isSubdps,
    getUnitElement,
    tierToQuality,
    qualityLabel,
    capitalize,
    checkTeamDependencies,
    DPS_ARCHETYPES,
    hasDPSRole,
    getPrimaryDPSArchetype
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

// Parse -N test filters from argv
const testFilters = process.argv
    .slice(2)
    .filter(a => /^-\d+$/.test(a))
    .map(a => parseInt(a.slice(1), 10));

function shouldRun(n) {
    return testFilters.length === 0 || testFilters.includes(n);
}

// Frozen so any write to a unit throws instead of landing silently. The engine
// resolves onto a UnitContext and must never touch `units.json` data. [CTX-01]
const allUnits = deepFreeze(await loadUnits());
let passed = 0;
let failed = 0;
const failures = [];        // test numbers that failed, for the KNOWN_RED check at the end
const ranTests = new Set(); // which tests actually ran, so a -N filter cannot fake a stale entry

async function runTest(num, name, fn) {
    if (!shouldRun(num)) return;
    ranTests.add(num);
    try {
        await fn();
        console.log(`  PASS  TEST ${num}: ${name}`);
        passed++;
    } catch (e) {
        console.log(`  FAIL  TEST ${num}: ${name}`);
        console.log(`        ${e.message}`);
        failed++;
        failures.push(num);
    }
}

console.log('Pull Engine Tests\n');

// PRE-TEST 0: isSubdps unit-level sanity check
await runTest(0, 'isSubdps correctness (pre-test)', () => {
    const subdpsNames = ['Burnice', 'Vivian', 'Grace', 'Orphie', 'Velina'];
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
    const cissia = unitByName(allUnits, 'Cissia');
    assert(cissia, 'missing unit Cissia');
    assert(!isSubdps(cissia), 'Cissia should not be subdps without team context');
    const seed = unitByName(allUnits, 'Seed');
    if (seed) {
        assert(isSubdps(cissia, [seed]),
            'Cissia should be subdps beside Seed — two ELECTRIC attackers, self included');
    }
    // The element qualifier reaches the pull engine too, not just the scorer. Evelyn is an
    // attacker, so the old `countTag attack >= 2` promoted Cissia beside her; `hasRole
    // attack:electric` does not. [PRED-03]
    const evelyn = unitByName(allUnits, 'Evelyn');
    if (evelyn) {
        assert(!isSubdps(cissia, [evelyn]),
            'Cissia should NOT be subdps beside a FIRE attacker — the predicate is element-qualified');
    }
    const yanagi = unitByName(allUnits, 'Yanagi');
    assert(yanagi, 'missing unit Yanagi');
    assert(!isSubdps(yanagi), 'Yanagi should not be subdps without Miyabi');
    const miyabi = unitByName(allUnits, 'Miyabi');
    if (miyabi) {
        assert(isSubdps(yanagi, [miyabi]), 'Yanagi should be subdps when Miyabi is in the team');
    }
});

// TESTS 1-7: Conditional subdps in pull recommendations (integration) — the recommendation
// engine must account for conditional subdps roles in roster coverage and candidates.

await runTest(1, 'Yanagi counts as anomaly subdps when Miyabi is owned', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Yanagi', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(!hasGap(result, 'subdps-anomaly'),
        'subdps-anomaly gap should NOT fire — Yanagi fills the subdps role when Miyabi is present');
});

await runTest(2, 'Yanagi does NOT count as subdps without Miyabi', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Yanagi', 'Aria', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    // Yanagi (T1) + Aria (T0.5) give anomaly quality >= 50, triggering subdps check
    // But Yanagi without Miyabi is primary only — no subdps coverage
    if (result.coverage.dpsQuality.anomaly >= 50) {
        assert(hasGap(result, 'subdps-anomaly'),
            'subdps-anomaly gap SHOULD fire — Yanagi without Miyabi is primary only');
    }
});

await runTest(3, 'Yanagi recommended as subdps when Miyabi is owned', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const gap = findGap(result, 'subdps-anomaly');
    assert(gap, 'subdps-anomaly gap should fire — Miyabi has no subdps partner');
    const yanagi = gap.units.find(u => u.id === 'yanagi');
    assert(yanagi, 'Yanagi should appear as a subdps-anomaly candidate (her condition is met by owned Miyabi)');
});

await runTest(4, 'Yanagi NOT a subdps candidate without Miyabi in roster', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Aria', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const gap = findGap(result, 'subdps-anomaly');
    if (gap) {
        const yanagi = gap.units.find(u => u.id === 'yanagi');
        assert(!yanagi, 'Yanagi should NOT appear as subdps candidate — no Miyabi to activate her conditional role');
    }
});

await runTest(5, 'Cissia counts as attack subdps when a second electric attacker is owned', () => {
    // Owned coverage: Cissia fills subdps role, gap should not fire
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Evelyn', 'Cissia', 'Seed', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(!hasGap(result, 'subdps-attack'),
        'subdps-attack gap should NOT fire — Cissia fills the subdps role when Seed is present');

    // Candidate: without Cissia but with Seed, Cissia should appear as a candidate
    const { unitStates: us2, ownedUnits: ou2 } = buildSyntheticRoster(
        allUnits, ['Evelyn', 'Seed', 'Nicole', 'Anby', 'Billy']
    );
    const result2 = analyze(allUnits, us2, ou2, { maxRecommendations: 20 });
    const gap = findGap(result2, 'subdps-attack');
    if (gap) {
        const cissia = gap.units.find(u => u.id === 'cissia');
        assert(cissia, 'Cissia should appear as subdps-attack candidate when Seed is owned');
    }
});

await runTest(6, 'Cissia NOT a subdps candidate without a second electric attacker', () => {
    // Evelyn is an attacker but FIRE. Under the old `countTag attack >= 2` this roster activated
    // Cissia's sub-DPS role; under `hasRole attack:electric` it does not. The direct assertion is
    // the point — the gap check below is guarded and would pass vacuously on its own. [PRED-03]
    const cissia = unitByName(allUnits, 'Cissia');
    const evelyn = unitByName(allUnits, 'Evelyn');
    const sanby = unitByName(allUnits, 'SAnby');
    assert(cissia && evelyn && sanby, 'missing fixture units');
    assert(!isSubdps(cissia, [evelyn]),
        'Cissia must not be subdps beside a fire attacker');
    assert(isSubdps(cissia, [sanby]),
        'Cissia must be subdps beside SAnby — an electric attacker, which is the real condition');

    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Evelyn', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const gap = findGap(result, 'subdps-attack');
    if (gap) {
        const c = gap.units.find(u => u.id === 'cissia');
        assert(!c, 'Cissia should NOT appear as attack subdps candidate — no electric attacker to activate her');
    }
});

await runTest(7, 'Enabler still recommended via primary gap', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Yanagi', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const miyabiRec = result.recommendations.find(r => r.units.some(u => u.id === 'miyabi'));
    assert(miyabiRec, 'Miyabi should be recommended (T0 anomaly DPS fills the dps-anomaly gap)');
});

// TEST 8
await runTest(8, 'Empty roster gap detection', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, ['Nicole', 'Anby', 'Billy']);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(hasGap(result, 'dps-attack'), 'expected attack DPS gap');
    assert(hasGap(result, 'dps-anomaly'), 'expected anomaly DPS gap');
    assert(hasGap(result, 'dps-rupture'), 'expected rupture DPS gap');
    assert(hasGap(result, 'support'), 'expected support gap');
    const high = result.recommendations.filter(r => r.priority === 'High');
    assert(high.length >= 3, `expected multiple high-priority recs, got ${high.length}`);
});

// TEST 9
await runTest(9, 'Attack-only roster', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Evelyn', 'Dialyn', 'Astra', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(hasGap(result, 'dps-anomaly'), 'expected anomaly DPS gap');
    assert(hasGap(result, 'dps-rupture'), 'expected rupture DPS gap');
    const anomalyGap = findGap(result, 'dps-anomaly');
    assert(anomalyGap && anomalyGap.score >= 70, 'anomaly gap should be high priority');
    // Structural gap reasons must not hard-code unit names as prescriptive recommendations.
    // Mech-synergy gaps are excluded — they legitimately name owned units to explain a pairing.
    const structuralReasons = result.allGaps
        .filter(g => !g.id.startsWith('mech-synergy-'))
        .map(g => g.reason).join(' ');
    assert(!structuralReasons.includes('Astra'), 'structural reasons should not reference Astra by name');
    assert(!structuralReasons.includes('Yuzuha'), 'structural reasons should not reference Yuzuha by name');
    assert(!structuralReasons.includes('Lucia'), 'structural reasons should not reference Lucia by name');
});

// TEST 10
await runTest(10, 'Anomaly-loaded roster', () => {
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

// TEST 11
await runTest(11, 'Support gap mechanics', () => {
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

// TEST 12
await runTest(12, 'Wind element coverage', () => {
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

// TEST 13
await runTest(13, 'Loaded roster still produces recommendations', () => {
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

// TEST 14
await runTest(14, 'Mechanics synergy detection', () => {
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

// TEST 15
await runTest(15, 'SubDPS not counted as primary', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Vivian', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(result.coverage.dpsQuality.anomaly === 0,
        `anomaly dpsQuality should be 0 without primary, got ${result.coverage.dpsQuality.anomaly}`);
    assert(hasGap(result, 'dps-anomaly'), 'should recommend primary anomaly DPS');
});

// TEST 16
await runTest(16, 'Calibration does not flatten loaded rosters', () => {
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

// TEST 17
await runTest(17, 'No disorder partner', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, ['Miyabi', 'Nicole', 'Anby', 'Billy']);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const gap = findGap(result, 'anomaly-partner');
    assert(gap, 'expected anomaly-partner gap');
    assert(gap.reason.includes('no anomaly partner'), `unexpected reason: ${gap.reason}`);
    const ids = gap.units.map(u => u.id);
    assert(ids.includes('burnice') || ids.includes('vivian'), 'expected Burnice or Vivian as candidate');
});

// TEST 18
await runTest(18, 'Same-element sub-DPS', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Yanagi', 'Grace', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    const gap = findGap(result, 'anomaly-partner');
    assert(gap, 'expected anomaly-partner gap when Grace same element as Yanagi');
    assert(gap.reason.includes('element') || gap.reason.includes('low-tier'),
        `expected element or tier reason, got: ${gap.reason}`);
});

// TEST 19 removed — Grace is no longer weak enough for this fixture (recent buffs, Remielle, Velina).

// TEST 20
await runTest(20, 'Pseudo-anomaly mitigates gap', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Nangong', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(!hasGap(result, 'anomaly-partner'),
        'anomaly-partner gap should not fire with Nangong pseudo-anomaly partner');
});

// TEST 21
await runTest(21, 'Strong partner covers holistically', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Aria', 'Vivian', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(!hasGap(result, 'anomaly-partner'),
        'anomaly-partner gap should not fire with strong Vivian cross-element partner');
});

// TEST 22
await runTest(22, 'Full coverage with Burnice', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Miyabi', 'Yanagi', 'Burnice', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(!hasGap(result, 'anomaly-partner'),
        'anomaly-partner gap should not fire with Burnice fire partner');
});

// TEST 23
await runTest(23, 'No primary anomaly DPS — partner gap skipped', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(
        allUnits, ['Evelyn', 'Dialyn', 'Trigger', 'Astra', 'Vivian', 'Nicole', 'Anby', 'Billy']
    );
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });
    assert(!hasGap(result, 'anomaly-partner'),
        'anomaly-partner gap should not fire without primary anomaly DPS');
});

// TEST 24
await runTest(24, 'Candidate ranking by element match', () => {
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

// TEST 25 pins two things on one loaded roster:
// Bug 1 — Burnice (T1.5) owned means subdps-anomaly must not fire, and Vivian must not surface
//         via that gap.
// Bug 2 — Trigger (T0.5, electric off-field aftershock stunner) already owned means the
//         mech-synergy-sanby gap must not exist, since he beats Ju Fufu for that role; Ju
//         Fufu's only remaining signal is the lower-weight rupture-tag affinity gap.
await runTest(25, 'Loaded roster: subdps-anomaly and mech-synergy-sanby bugs fixed', () => {
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

    assert(!hasGap(result, 'subdps-anomaly'),
        'subdps-anomaly gap should not fire when Burnice (T1.5) is owned');

    const top10UnitIds = new Set(result.recommendations.flatMap(r => r.units.map(u => u.id)));
    assert(!top10UnitIds.has('vivian'),
        'Vivian should not appear in top-10 recommendations — Burnice already covers anomaly sub-DPS');

    assert(!hasGap(result, 'mech-synergy-sanby'),
        'mech-synergy-sanby gap should not exist — Trigger already covers this mechanical role');

    // If Ju Fufu still appears (e.g. via rupture-tag affinity) it must be Low only — the
    // inflated mech-synergy score must be gone.
    const juFufuRec = result.recommendations.find(r => r.units.some(u => u.id === 'ju-fufu'));
    if (juFufuRec) {
        assert(juFufuRec.priority === 'Low',
            `Ju Fufu recommendation should be Low priority only, got ${juFufuRec.priority} — mech-synergy-sanby may still be inflating its score`);
    }
});

// TESTS 26-29: Codependent scaling (YSG veil dependency). See
// documentation/recommendations/codependency-gating.md. Fixture: Cissia's veils:1 falls short
// of YSG's scaling.veils:2, so this roster has no adequate veil provider. YSG is codependent;
// Aria is not.

const CODEPENDENT_ROSTER = [
    'Cissia', 'Lucia', 'Koleda', 'Nekomata',
    'Anby', 'Ben', 'Billy', 'Corin', 'Komano', 'Lucy',
    'Nicole', 'Pan Yinhu', 'Pulchra', 'Seth', 'Soukaku'
];

await runTest(26, 'YSG codependent — unmet veil dependency drops priority', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, CODEPENDENT_ROSTER);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    const ysgRec = result.recommendations.find(r => r.units.some(u => u.id === 'ysg'));
    assert(ysgRec, 'YSG should appear in recommendations');
    assert(ysgRec.teamDependencyNotes?.length > 0,
        'YSG recommendation should have teamDependencyNotes (veil providers missing)');

    const providerIds = ysgRec.teamDependencyNotes.flatMap(n => n.providers.map(p => p.id));
    assert(providerIds.includes('sunna'), 'Sunna should be listed as a veil provider');
    assert(providerIds.includes('zhao'), 'Zhao should be listed as a veil provider');

    // One rank lower than without the check.
    assert(ysgRec.priority !== 'High',
        `YSG priority should have been downgraded, got ${ysgRec.priority}`);
});

await runTest(27, 'YSG codependent — Sunna in roster satisfies dependency', () => {
    const roster = [...CODEPENDENT_ROSTER, 'Sunna'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    const ysgRec = result.recommendations.find(r => r.units.some(u => u.id === 'ysg'));
    if (ysgRec) {
        assert(!ysgRec.teamDependencyNotes?.length,
            'YSG should have no teamDependencyNotes when Sunna is owned');
    }
});

await runTest(28, 'YSG codependent — Zhao in roster satisfies dependency', () => {
    const roster = [...CODEPENDENT_ROSTER, 'Zhao'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    const ysgRec = result.recommendations.find(r => r.units.some(u => u.id === 'ysg'));
    if (ysgRec) {
        assert(!ysgRec.teamDependencyNotes?.length,
            'YSG should have no teamDependencyNotes when Zhao is owned');
    }
});

await runTest(29, 'Aria has no codependent flag — no dependency check runs', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, CODEPENDENT_ROSTER);

    // Aria's own unit-level check must be clean (card-level notes may still inherit from a
    // codependent co-card member — that's fine, only the unit-level check matters here).
    const aria = unitByName(allUnits, 'Aria');
    const dep = checkTeamDependencies(aria, ownedUnits, allUnits);
    assert(!dep.hasUnmetDependency,
        'checkTeamDependencies should return no unmet dependency for Aria (no codependent flag)');
});

// TESTS 30-35: Per-archetype support coverage

await runTest(30, 'Support coverage — Lucia alone does NOT cover attack support', () => {
    const roster = ['Evelyn', 'Lucia', 'Koleda', 'Nicole', 'Anby', 'Billy'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    assert(hasGap(result, 'support-attack'),
        'support-attack gap should fire — Lucia is a terrible fit for attack teams');

    const gap = findGap(result, 'support-attack');
    const sunna = gap.units.find(u => u.id === 'sunna');
    assert(sunna, 'Sunna should appear as a candidate in the support-attack gap');
});

await runTest(31, 'Support coverage — Astra covers attack support', () => {
    const roster = ['Evelyn', 'Astra', 'Koleda', 'Nicole', 'Anby', 'Billy'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    assert(!hasGap(result, 'support-attack'),
        'support-attack gap should NOT fire — Astra is a strong fit for attack teams');
});

await runTest(32, 'Support coverage — Yuzuha alone does NOT cover rupture support', () => {
    const roster = ['Yixuan', 'Yuzuha', 'Dialyn', 'Nicole', 'Anby', 'Billy'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    assert(hasGap(result, 'support-rupture'),
        'support-rupture gap should fire — Yuzuha is a poor fit for rupture teams');

    const gap = findGap(result, 'support-rupture');
    const lucia = gap.units.find(u => u.id === 'lucia');
    assert(lucia, 'Lucia should appear as a candidate in the support-rupture gap');
});

await runTest(33, 'Support coverage — Sunna is a High recommendation when Lucia is the only premium support', () => {
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, CODEPENDENT_ROSTER);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    // Lucia is a rupture specialist and covers almost nothing for attack teams; the gap must
    // fire even though attack DPS quality is low, since the player has A-rank attack DPS and
    // zero adequate support.
    assert(hasGap(result, 'support-attack'),
        'support-attack gap should fire — Lucia does not cover attack support needs');

    const gap = findGap(result, 'support-attack');
    assert(gap.units.some(u => u.id === 'sunna'),
        'Sunna should appear as a candidate in the support-attack gap');

    // One specialist premium support only -> gap is High priority.
    assert(gap.priority === 'High',
        `support-attack gap should be High priority, got ${gap.priority}`);

    const sunnaRec = result.recommendations.find(r =>
        r.units.some(u => u.id === 'sunna'));
    assert(sunnaRec, 'Sunna should appear in a recommendation card');
});

await runTest(34, 'Support coverage — Astra is a High recommendation when Lucia is the only premium support', () => {
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

await runTest(35, 'Support coverage — Lucia recommended for rupture, Sunna excluded (join incompatible)', () => {
    // Codependent roster with Lucia removed and Zhao added; Zhao can't join rupture teams.
    const roster = CODEPENDENT_ROSTER.filter(n => n !== 'Lucia').concat('Zhao');
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    assert(hasGap(result, 'support-rupture'),
        'support-rupture gap should fire — Zhao does not cover rupture support');

    const gap = findGap(result, 'support-rupture');
    assert(gap.units.some(u => u.id === 'lucia'),
        'Lucia should appear as a candidate in the support-rupture gap');

    // Sunna joins on ["attack", "faction"] — incompatible with rupture teams.
    assert(!gap.units.some(u => u.id === 'sunna'),
        'Sunna should NOT appear in the support-rupture gap — her join conditions are incompatible');

    assert(hasGap(result, 'support-attack'),
        'support-attack gap should also fire');
    const attackGap = findGap(result, 'support-attack');
    assert(attackGap.units.some(u => u.id === 'sunna'),
        'Sunna should appear in the support-attack gap instead');
});

// TESTS 36-39: Lumen / Remielle pull recommendations

await runTest(36, 'Remielle not recommended to synergize with join-incompatible units', () => {
    // Trigger joins on ["attack", "electric"] — no join overlap with Rem at all.
    // Rem should NOT appear in a mech-synergy gap paired with Trigger.
    const roster = ['Trigger', 'Evelyn', 'Astra', 'Nicole', 'Anby', 'Billy'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });

    const remTriggerGap = result.allGaps.find(g =>
        g.id.startsWith('mech-synergy-') &&
        g.units.some(u => u.id === 'ramiel') &&
        g.bestPairName === 'Trigger'
    );
    assert(!remTriggerGap,
        'Remielle should NOT be paired with Trigger — no join compatibility');
});

await runTest(38, 'Remielle does NOT count as disorder partner for other anomaly DPS', () => {
    // Roster: Miyabi + Remielle — Rem is lumen and can't generate disorders.
    // Miyabi should still need a non-lumen disorder partner.
    const roster = ['Miyabi', 'Remielle', 'Nicole', 'Anby', 'Billy'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });

    assert(hasGap(result, 'anomaly-partner'),
        'anomaly-partner gap should fire — Remielle (lumen) cannot generate disorders for Miyabi');
});

await runTest(40, 'Remielle codependent — no anomaly roster drops to Low or removed', () => {
    // Roster has zero anomaly agents — Rem can't form any valid team.
    // cannotFormTeam should fire, dropping TWO priority levels.
    const roster = [
        'Evelyn', 'Trigger', 'Harumasa', 'Lighter',
        'Astra', 'Yuzuha', 'Lycaon',
        'Nicole', 'Anby', 'Billy'
    ];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 15 });

    const ramiel = unitByName(allUnits, 'Remielle');
    const dep = checkTeamDependencies(ramiel, ownedUnits, allUnits);
    assert(dep.cannotFormTeam, 'cannotFormTeam should be true with no anomaly roster');

    const remRec = result.recommendations.find(r => r.units.some(u => u.id === 'ramiel'));
    assert(!remRec, 'Rem should not appear in recommendations at all when she cannot form any team');
});

await runTest(41, 'Remielle excluded with single A-rank anomaly partner (Piper)', () => {
    // Piper alone can't enable triple-anomaly. Rem's best achievable buff is 2
    // (half of max 4) — cannotActivateBuffs should fire, excluding her from gaps.
    const baseRoster = [
        'Evelyn', 'Trigger', 'Harumasa', 'Lighter',
        'Astra', 'Yuzuha', 'Lycaon', 'Nangong',
        'Nicole', 'Anby', 'Billy'
    ];

    // Without Piper: zero anomaly → Rem excluded (cannotActivateBuffs)
    const { unitStates: states0, ownedUnits: owned0 } = buildSyntheticRoster(allUnits, baseRoster);
    const result0 = analyze(allUnits, states0, owned0, { maxRecommendations: 15 });
    const rem0 = result0.recommendations.find(r => r.units.some(u => u.id === 'ramiel'));
    assert(!rem0, 'Rem should not appear with zero anomaly agents');

    // With Piper: single A-rank anomaly → Rem STILL excluded (buff = 2/4 ≤ half)
    const withPiper = [...baseRoster, 'Piper'];
    const { unitStates: states1, ownedUnits: owned1 } = buildSyntheticRoster(allUnits, withPiper);
    const result1 = analyze(allUnits, states1, owned1, { maxRecommendations: 15 });
    const rem1 = result1.recommendations.find(r => r.units.some(u => u.id === 'ramiel'));
    assert(!rem1, 'Rem should not appear with only Piper — can\'t build triple-anomaly');

    // Verify the anomaly DPS gap itself stays HIGH without Piper (the NEED is real)
    const anomalyGap0 = result0.allGaps.find(g => g.id === 'dps-anomaly');
    assert(anomalyGap0, 'dps-anomaly gap should fire with zero anomaly agents');
    assert(anomalyGap0.priority === 'High',
        `dps-anomaly should be High with zero anomaly, got ${anomalyGap0.priority}`);

    // With Piper, anomaly DPS gap should still fire (Piper is borderline at best)
    const anomalyGap1 = result1.allGaps.find(g => g.id === 'dps-anomaly');
    assert(anomalyGap1, 'dps-anomaly gap should still fire with only Piper');
});

await runTest(42, 'Remielle without Velina is Medium, not High, even on an anomaly-loaded roster', () => {
    // Partner ladder (documentation/recommendations/partner-ladder.md): without Velina the best
    // line here is Alice/Vivian/Remielle, good but not her ceiling. Also throttled by her 3-body
    // conditional ATK buff and by sharing a stun window with Miyabi (`scaling.greedy`, phase 5).
    const roster = [
        'Miyabi', 'Alice', 'Promeia', 'Vivian', 'Nangong', 'Yuzuha',
        'Astra', 'Trigger', 'Nicole', 'Anby', 'Billy'
    ];
    assert(!roster.includes('Velina'), 'fixture intent: this roster must NOT contain Velina');
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 10 });

    const remRec = result.recommendations.find(r => r.units.some(u => u.id === 'ramiel'));
    assert(remRec, 'Remielle should still appear in recommendations for an anomaly-loaded roster');
    assert(remRec.priority !== 'High',
        `Without Velina, Remielle should not be High priority — her best line here is around ` +
        `Alice/Vivian/Remielle, not the Rem/Velina ceiling. Got ${remRec.priority}`);
    assert(remRec.priority === 'Medium',
        `Without Velina, Remielle should be Medium — still a titled T0 that opens new archetypes, ` +
        `just not at her ceiling. Got ${remRec.priority}`);
});

await runTest(43, 'Adding Velina to the same roster raises Remielle above her no-Velina priority', () => {
    // Paired with TEST 42: same roster, plus Velina, must rate Remielle higher — the partner
    // ladder's top rung (see partner-ladder.md).
    const base = [
        'Miyabi', 'Alice', 'Promeia', 'Vivian', 'Nangong', 'Yuzuha',
        'Astra', 'Trigger', 'Nicole', 'Anby', 'Billy'
    ];
    const RANK = { Low: 0, Medium: 1, High: 2, Critical: 3 };

    const priorityOn = (roster) => {
        const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
        const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 10 });
        const rec = result.recommendations.find(r => r.units.some(u => u.id === 'ramiel'));
        return rec ? rec.priority : null;
    };

    const without = priorityOn(base);
    const with_ = priorityOn([...base, 'Velina']);
    assert(without, 'Remielle should appear without Velina');
    assert(with_, 'Remielle should appear with Velina');
    assert(RANK[with_] > RANK[without],
        `Velina is the partner that unlocks Remielle's ceiling, so adding her must raise ` +
        `Remielle's priority: got ${without} without Velina and ${with_} with her`);
});

// TESTS 44-46: Claret (armorer/electric, light kit) must classify as primary armorer DPS,
// not a support unit, and credit electric-DPS coverage.

await runTest(44, 'Claret classifies as armorer DPS', () => {
    const claret = unitByName(allUnits, 'Claret');
    if (!claret) return; // unreleased data not present
    assert(hasDPSRole(claret), 'hasDPSRole(Claret) should be true');
    assert(getPrimaryDPSArchetype(claret) === 'armorer',
        `getPrimaryDPSArchetype(Claret) should be 'armorer', got ${getPrimaryDPSArchetype(claret)}`);
});

await runTest(45, 'Claret surfaces as armorer/electric DPS candidate', () => {
    const claret = unitByName(allUnits, 'Claret');
    if (!claret) return;
    // Roster with no armorer and no primary electric DPS.
    const roster = [
        'Miyabi', 'Nangong', 'Yuzuha', 'Astra', 'Rina',
        'Nicole', 'Anby', 'Billy'
    ];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 20 });

    // Claret should appear in an armorer-DPS or electric-element gap card.
    const claretGaps = result.allGaps.filter(g =>
        g.units?.some(u => u.id === 'claret')
    );
    assert(claretGaps.length > 0,
        `Claret should appear in at least one gap; got: ${result.allGaps.map(g => g.id).join(', ')}`);

    const claretGapIds = claretGaps.map(g => g.id);
    const inDPSOrElemGap = claretGapIds.some(id =>
        id === 'dps-armorer' || id === 'element-electric' || id === 'depth-armorer'
    );
    assert(inDPSOrElemGap,
        `Claret should appear in dps-armorer / element-electric / depth-armorer, got: ${claretGapIds.join(', ')}`);

    // She should NOT be classified into a support gap.
    const supportGap = result.allGaps.find(g => g.id.startsWith('support'));
    if (supportGap) {
        assert(!supportGap.units?.some(u => u.id === 'claret'),
            'Claret should not appear in support gaps');
    }
});

await runTest(46, 'Electric DPS coverage improves when Claret is added to roster', () => {
    const claret = unitByName(allUnits, 'Claret');
    if (!claret) return;
    // Base roster has electric support (Rina) and electric stun (Anby) but no primary
    // electric DPS, so electric-DPS element coverage should be zero until Claret arrives.
    const baseRoster = [
        'Miyabi', 'Nangong', 'Yuzuha', 'Astra', 'Rina',
        'Nicole', 'Anby', 'Billy'
    ];
    const { unitStates: s0, ownedUnits: o0 } = buildSyntheticRoster(allUnits, baseRoster);
    const r0 = analyze(allUnits, s0, o0, { maxRecommendations: 10 });
    const electric0 = r0.coverage.elementQuality?.electric ?? 0;

    const withClaret = [...baseRoster, 'Claret'];
    const { unitStates: s1, ownedUnits: o1 } = buildSyntheticRoster(allUnits, withClaret);
    const r1 = analyze(allUnits, s1, o1, { maxRecommendations: 10 });
    const electric1 = r1.coverage.elementQuality?.electric ?? 0;

    assert(electric1 > electric0,
        `Electric coverage should improve when Claret is added — before: ${electric0}, after: ${electric1}`);
});

await runTest(47, 'An element covered only by a sub-DPS is not reported as having no options', () => {
    // Velina is a T0 wind anomaly SUB-DPS. Element quality counts primary carries only, so
    // wind reads 0 either way — but the reason line must not claim there is nothing. [GAP-01]
    const withVelina = ['Miyabi', 'Velina', 'Nangong', 'Astra', 'Nicole', 'Anby'];
    const { unitStates: s1, ownedUnits: o1 } = buildSyntheticRoster(allUnits, withVelina);
    const r1 = analyze(allUnits, s1, o1, { maxRecommendations: 20 });
    const windGap = r1.allGaps.find(g => g.id === 'element-wind');
    assert(windGap, 'a wind element gap should still fire — there is no primary wind carry');
    assert(!/no DPS options/i.test(windGap.reason),
        `wind reason must not claim no options while Velina is owned; got: "${windGap.reason}"`);
    assert(/sub-DPS/i.test(windGap.reason),
        `wind reason should name the sub-DPS; got: "${windGap.reason}"`);

    // Without any wind unit the original wording is still the right one.
    const noWind = ['Miyabi', 'Nangong', 'Astra', 'Nicole', 'Anby'];
    const { unitStates: s0, ownedUnits: o0 } = buildSyntheticRoster(allUnits, noWind);
    const r0 = analyze(allUnits, s0, o0, { maxRecommendations: 20 });
    const windGap0 = r0.allGaps.find(g => g.id === 'element-wind');
    assert(windGap0 && /no DPS options/i.test(windGap0.reason),
        `a wind-less roster should still read "no DPS options"; got: "${windGap0?.reason}"`);
});

await runTest(48, 'A carry whose only burst is a chain attack earns no recovery-debuff synergy', () => {
    // Severian's damage is `ultimate:strong: 2` + `chain: 3`. A MAX over those values read 3 —
    // the same as a 6000% ultimate — which paid Nangong's recovery debuff enough to clear the
    // synergy threshold and print "Severian has mechanical synergy with your Nangong". [PULL-03]
    const severian = unitByName(allUnits, 'Severian');
    if (!severian) return;
    const roster = ['Miyabi', 'Velina', 'Nangong', 'Astra', 'Nicole', 'Anby'];
    const { unitStates, ownedUnits } = buildSyntheticRoster(allUnits, roster);
    const result = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 30 });

    const claimsNangong = result.allGaps.some(g =>
        /Severian/.test(g.reason || '') && /Nangong/.test(g.reason || '')
    );
    assert(!claimsNangong,
        'no gap should claim Severian has mechanical synergy with Nangong');

    // The wind gap itself is legitimate and Severian should still be suggested for it.
    const windGap = result.allGaps.find(g => g.id === 'element-wind');
    assert(windGap?.units?.some(u => u.id === 'severian'),
        'Severian should still be a wind DPS candidate');
});

// Tests that are red ON PURPOSE. Same contract as test-mechanics.mjs's and test-rankings.mjs's
// KNOWN_RED: exits 0 only
// when the failing set is EXACTLY this map's keys — exits 1 the instant an entry starts
// passing (stale, remove it) or anything else fails. Every entry needs a reason; never add
// one just to silence a regression.
const KNOWN_RED = new Map([]);

const failedNums = new Set(failures);
const stale = [...KNOWN_RED.keys()].filter(n => ranTests.has(n) && !failedNums.has(n));
const unexpected = [...failedNums].filter(n => !KNOWN_RED.has(n)).sort((a, b) => a - b);

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0 && KNOWN_RED.size > 0) {
    const red = [...failedNums].filter(n => KNOWN_RED.has(n)).sort((a, b) => a - b);
    if (red.length > 0) {
        console.log(`\n${red.length} of those are KNOWN_RED (expected):`);
        for (const n of red) console.log(`  - TEST ${n}: ${KNOWN_RED.get(n)}`);
    }
}
if (stale.length > 0) {
    console.log(`\nSTALE KNOWN_RED: test(s) ${stale.join(', ')} are listed as expected-red but PASSED.`);
    console.log('That is good news, but remove the entry so the list keeps meaning something.');
}
if (unexpected.length > 0) {
    console.log(`\n${unexpected.length} UNEXPECTED failure(s): ${unexpected.map(n => `TEST ${n}`).join(', ')}`);
}

process.exit(unexpected.length > 0 || stale.length > 0 ? 1 : 0);
