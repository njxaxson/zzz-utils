// test-bucketing.mjs — regression tests for Deadly Assault *allocation*: deciding which team
// goes to which boss when the three teams must not share units. Different concern from
// test-scoring.mjs (is a team's score right?) — this asks whether the solver hands the scarce
// unit to the boss that needs it most, and survives noise-level score wobble. Assertions are on
// ALLOCATIONS and rank-band structure, never absolute scores, so the suite survives
// recalibration. Run: node test-bucketing.mjs [-1 -4 ...]. Exit code 0 if all (specified) pass.

import { loadUnits, loadBosses } from './lib/data.js';
import { filterBosses } from './lib/boss-filter.js';
import { buildTeams } from './lib/team-pipeline.js';
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';
import { solveDeadlyAssault } from './app/public/lib/common/deadly-assault-solver.js';
import {
    findExclusiveCombinations,
    assignBandedRanks,
    rankBandEpsilon,
    RANK_BAND_RATIO,
    RANK_BAND_FLOOR
} from './app/public/lib/common/team-builder.js';

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

// Real-data allocation harness — mirrors deadly-assault.js's pipeline so tests exercise the
// production solver rather than a reimplementation of it.

function buildSyntheticRoster(allUnits, ownedNames) {
    const nameSet = new Set(ownedNames.map(n => n.toLowerCase()));
    const owned = allUnits.filter(u => nameSet.has(u.name.toLowerCase()) || nameSet.has(u.id.toLowerCase()));
    const missing = ownedNames.filter(n => !owned.some(
        u => u.name.toLowerCase() === n.toLowerCase() || u.id.toLowerCase() === n.toLowerCase()));
    assert(missing.length === 0, `Roster names not found in units.json: ${missing.join(', ')}`);
    return owned;
}

// Allocate a synthetic roster across a boss set, returning the solver's combinations.
// bossFilter is a comma-separated boss filter (deadly-assault.js syntax).
function allocate(allUnits, allBosses, ownedNames, bossFilter) {
    const availableUnits = buildSyntheticRoster(allUnits, ownedNames);
    const bossObjects = filterBosses(allBosses, bossFilter);
    assert(bossObjects.length === 3, `Boss filter "${bossFilter}" matched ${bossObjects.length} bosses, need exactly 3`);
    const bossNames = bossObjects.map(b => b.name);

    const { threeCharTeams, teamLabels } = buildTeams(availableUnits, []);

    const viableTeamsByBoss = {};
    for (const boss of bossObjects) {
        const viable = [];
        for (const label of teamLabels) {
            const score = scoreTeamForBoss(threeCharTeams[label], boss, {});
            if (score > 0) viable.push({ label, team: threeCharTeams[label], score });
        }
        viable.sort((a, b) => b.score - a.score);
        viableTeamsByBoss[boss.name] = viable;
    }

    const { combinations } = solveDeadlyAssault({
        viableTeamsByBoss,
        bossNames,
        bossObjects,
        teamLabels,
        threeCharTeams,
        scoreLenient: (team, boss) => {
            const s = scoreTeamForBoss(team, boss, { lenient: true });
            return s > 0 ? s : null;
        }
    });

    return { combinations, bossNames, viableTeamsByBoss };
}

/** The boss a named unit was allocated to in a combination, or null. */
function bossOf(combo, unitName) {
    const lower = unitName.toLowerCase();
    for (const a of combo.assignments) {
        if (a.team.some(u => u.name.toLowerCase() === lower)) return a.boss;
    }
    return null;
}

/** The assignment for a given boss (substring match on boss name). */
function assignmentFor(combo, bossSubstring) {
    const lower = bossSubstring.toLowerCase();
    return combo.assignments.find(a => a.boss.toLowerCase().includes(lower));
}

function describe(combo) {
    return combo.assignments.map(a => `${a.boss}: ${a.label} (${a.score.toFixed(1)})`).join(' | ');
}

/** Score a single named team against a single boss. */
function scoreTeam(allUnits, allBosses, unitNames, bossFilter) {
    const units = buildSyntheticRoster(allUnits, unitNames);
    assert(units.length === unitNames.length, `Duplicate/missing units in ${unitNames.join('/')}`);
    const bosses = filterBosses(allBosses, bossFilter);
    assert(bosses.length === 1, `Boss filter "${bossFilter}" matched ${bosses.length} bosses, need exactly 1`);
    return scoreTeamForBoss(units, bosses[0], {});
}

// Synthetic-score harness — fabricated team entries for testing the allocator's rank/priority
// behaviour in isolation, with no dependence on engine calibration.

function fakeUnit(name) {
    return { id: name.toLowerCase(), name, tags: [], tier: 1 };
}

function fakeEntry(unitNames, score) {
    return { label: unitNames.join(' / '), team: unitNames.map(fakeUnit), score };
}

function fakeSolve(bossA, bossB, bossC) {
    const viable = { A: bossA, B: bossB, C: bossC };
    for (const k of Object.keys(viable)) viable[k].sort((a, b) => b.score - a.score);
    return findExclusiveCombinations(viable, ['A', 'B', 'C']);
}

// Parse -N test filters from argv
const testFilters = process.argv
    .slice(2)
    .filter(a => /^-\d+$/.test(a))
    .map(a => parseInt(a.slice(1), 10));

function shouldRun(n) {
    return testFilters.length === 0 || testFilters.includes(n);
}

const allUnits = await loadUnits();
const allBosses = await loadBosses();
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

console.log('Deadly Assault Bucketing / Allocation Tests\n');

// The roster from the original bug report.
const DIALYN_ROSTER = [
    'Promeia', 'Remielle', 'Velina',
    'Dialyn', 'Ye Shunguong', 'Sunna', 'Zhao',
    'Yixuan', 'Pan Yinhu', 'Lucia'
];

// TEST 1: Dialyn is Yixuan's best-in-slot stunner by a wide margin, but only a marginal
// upgrade over the stunless YSG/Zhao/Sunna line on Thrall. She must go to Priest.
await runTest(1, 'Dialyn is allocated to Priest, not Thrall (stunless carry covers Thrall)', () => {
    const { combinations } = allocate(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest');
    assert(combinations.length > 0, 'No combinations found');
    const best = combinations[0];

    const dialynBoss = bossOf(best, 'Dialyn');
    assert(dialynBoss !== null, `Dialyn was not used at all — ${describe(best)}`);
    assert(/priest/i.test(dialynBoss),
        `Dialyn should go to Miasma Priest (her marginal value there exceeds Thrall's), got ${dialynBoss} — ${describe(best)}`);

    const thrall = assignmentFor(best, 'Thrall');
    assert(thrall && /ye shunguong/i.test(thrall.label),
        `Thrall should be covered by a Ye Shunguong stunless line, got ${thrall && thrall.label}`);
    assert(!/dialyn/i.test(thrall.label),
        `Thrall must not consume Dialyn — got ${thrall.label}`);

    // The tell-tale symptom of the old bug: Yixuan's team backfilled with Pan Yinhu.
    const priest = assignmentFor(best, 'Priest');
    assert(!/pan yinhu/i.test(priest.label),
        `Priest team should not be backfilled with Pan Yinhu — got ${priest.label}`);
});

// TEST 2: the same reasoning in reverse — Dialyn must end up on Thrall. Two levers, both
// needed: swapping Zhao for Astra removes Thrall's other veil provider (YSG needs
// scaling.veils:2), raising Dialyn's Thrall marginal well clear of noise; adding Norma
// (Yixuan's other near-equal stunner) covers Priest without Dialyn, collapsing her Priest
// marginal to near zero. Guards against "always send Dialyn to Priest" passing TEST 1 for
// the wrong reason.
await runTest(2, 'Norma covers Priest, so Dialyn is freed for Thrall (marginal value reverses)', () => {
    const roster = DIALYN_ROSTER.filter(n => n !== 'Zhao').concat('Astra', 'Norma');
    const { combinations } = allocate(allUnits, allBosses, roster, 'Aberrant,Thrall,Priest');
    assert(combinations.length > 0, 'No combinations found');
    const best = combinations[0];

    const dialynBoss = bossOf(best, 'Dialyn');
    assert(dialynBoss !== null, `Dialyn was not used at all — ${describe(best)}`);
    assert(/thrall/i.test(dialynBoss),
        `Without a competitive stunless line, Dialyn should go to Thrall, got ${dialynBoss} — ${describe(best)}`);
});

// TEST 3: epsilon-band rank equivalence.
await runTest(3, 'assignBandedRanks bands near-equal scores and separates real gaps', () => {
    assert(RANK_BAND_RATIO > 0 && RANK_BAND_FLOOR > 0, 'Band constants must be positive');

    // Floor dominates at low scores, ratio dominates at high scores.
    assert(rankBandEpsilon(10) === RANK_BAND_FLOOR,
        `At score 10 the floor should apply, got ${rankBandEpsilon(10)}`);
    assert(rankBandEpsilon(1000) === 1000 * RANK_BAND_RATIO,
        `At score 1000 the ratio should apply, got ${rankBandEpsilon(1000)}`);

    const eps = rankBandEpsilon(500);

    // Two teams a hair apart share a rank; a clearly worse one does not.
    const teams = [
        { score: 500 },
        { score: 500 - eps * 0.5 },
        { score: 500 - eps * 2 }
    ];
    assignBandedRanks(teams);
    assert(teams[0].rank === 1 && teams[1].rank === 1,
        `Scores within epsilon (${eps.toFixed(2)}) must share rank 1, got ${teams[0].rank}/${teams[1].rank}`);
    assert(teams[2].rank === 2,
        `A score beyond epsilon must open a new rank, got ${teams[2].rank}`);

    // Bands are measured from the band LEADER, not the previous entry, so a long
    // shallow gradient must not chain into one giant band.
    const gradient = [];
    for (let i = 0; i < 12; i++) gradient.push({ score: 500 - i * (eps * 0.4) });
    assignBandedRanks(gradient);
    assert(gradient[gradient.length - 1].rank > 1,
        'A long shallow gradient must not collapse into a single rank band');
    for (let i = 1; i < gradient.length; i++) {
        assert(gradient[i].rank >= gradient[i - 1].rank, 'Ranks must be non-decreasing down a sorted list');
    }
    assert(gradient[0].rank === 1, 'First entry must be rank 1');
});

// TEST 4: a noise-level score gap must not evict a strictly better allocation. Rank bands are
// why (documentation/bucketing/deadly-assault.md) — `priority = maxRank * 100 + rankSum`
// weights maxRank so heavily that one extra raw-index rank step outranks any total-score gap.
await runTest(4, 'A sub-epsilon rank step cannot evict the higher-total allocation', () => {
    // Boss A: the top two lines both consume scarce unit X, so avoiding X means taking the
    // 3rd-listed line — despite all three being within a point of each other.
    const bossA = [
        fakeEntry(['X', 'a1', 'a2'], 100),
        fakeEntry(['X', 'a3', 'a4'], 99.5),
        fakeEntry(['Y', 'a1', 'a2'], 99)
    ];
    // Boss B: X is worth a real 6 points here — well outside the band.
    const bossB = [
        fakeEntry(['X', 'b1', 'b2'], 100),
        fakeEntry(['Z', 'b1', 'b2'], 94)
    ];
    const bossC = [fakeEntry(['c1', 'c2', 'c3'], 50)];

    const combos = fakeSolve(bossA, bossB, bossC);
    assert(combos.length > 0, 'No combinations found');
    const best = combos[0];

    // Give X to boss B (99 + 100 + 50 = 249), not boss A (100 + 94 + 50 = 244).
    assert(bossOf(best, 'X') === 'B',
        `X should be allocated to boss B, got ${bossOf(best, 'X')} — ${describe(best)}`);
    assert(Math.abs(best.totalScore - 249) < 1e-6,
        `Best total should be 249, got ${best.totalScore} — ${describe(best)}`);

    // And the winner must genuinely be the highest total available.
    const maxTotal = Math.max(...combos.map(c => c.totalScore));
    assert(Math.abs(best.totalScore - maxTotal) < 1e-6,
        `Top combination (${best.totalScore}) is not the highest total available (${maxTotal})`);

    // All three of boss A's near-equal lines must have collapsed into one band.
    assert(bossA.every(t => t.rank === 1),
        `Boss A's three near-equal lines should share rank 1, got ${bossA.map(t => t.rank).join('/')}`);
});

// TEST 5: scope of the stunless stun-shill credit (see documentation/archetypes/stunless.md).
// A stunless carry clears a stun shill without spending a slot on a stunner, and the engine
// prices that freed slot — but the credit must not leak to teams that simply lack a stunner.
await runTest(5, 'Stunless stun-shill credit is gated on a stunless carry, not on lacking a stunner', () => {
    const stunless = scoreTeam(allUnits, allBosses, ['Ye Shunguong', 'Zhao', 'Sunna'], 'Thrall');
    const withStunner = scoreTeam(allUnits, allBosses, ['Dialyn', 'Ye Shunguong', 'Sunna'], 'Thrall');

    // Gated: no stun role AND no stunless carry -> still disqualified.
    const noStunNoStunless = scoreTeam(allUnits, allBosses, ['Yixuan', 'Pan Yinhu', 'Lucia'], 'Thrall');
    assert(noStunNoStunless <= 0,
        `A team with neither a stunner nor a stunless carry must be disqualified on a stun-shill boss, got ${noStunNoStunless}`);

    // The two archetypes are on par — within one rank band of each other.
    const eps = rankBandEpsilon(withStunner);
    assert(Math.abs(withStunner - stunless) < eps,
        `YSG/Zhao/Sunna (${stunless.toFixed(1)}) and Dialyn/YSG/Sunna (${withStunner.toFixed(1)}) should be within one rank band (${eps.toFixed(1)}) on Thrall`);

    // But not overshot: the dedicated stunner line is still the better of the two.
    assert(withStunner > stunless,
        `Dialyn/YSG/Sunna (${withStunner.toFixed(1)}) should still edge out YSG/Zhao/Sunna (${stunless.toFixed(1)})`);
});

// TEST 6: allocations must never share a unit across bosses.
await runTest(6, 'No unit is allocated to two bosses in the same combination', () => {
    const { combinations } = allocate(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest');
    assert(combinations.length > 0, 'No combinations found');
    for (const combo of combinations.slice(0, 25)) {
        const seen = new Set();
        for (const a of combo.assignments) {
            for (const u of a.team) {
                assert(!seen.has(u.id),
                    `Unit ${u.name} appears on two bosses — ${describe(combo)}`);
                seen.add(u.id);
            }
        }
        assert(seen.size === 9, `Expected 9 distinct units, got ${seen.size} — ${describe(combo)}`);
    }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
