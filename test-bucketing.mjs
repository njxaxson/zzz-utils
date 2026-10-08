// test-bucketing.mjs — regression tests for Deadly Assault *allocation*: deciding which team
// goes to which boss when the three teams must not share units. Different concern from
// test-mechanics.mjs/test-rankings.mjs (is a team's score right?) — this asks whether the solver hands the scarce
// unit to the boss that needs it most, and survives noise-level score wobble. Assertions are on
// ALLOCATIONS and rank-band structure, never absolute scores, so the suite survives
// recalibration. Run: node test-bucketing.mjs [-1 -4 ...]. Exit code 0 if all (specified) pass.

import { loadUnits, loadBosses, deepFreeze } from './lib/data.js';
import { filterBosses } from './lib/boss-filter.js';
import { buildTeams } from './lib/team-pipeline.js';
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';
import { solveDeadlyAssault, getCandidateTeamsForBoss, teamAllowedForBoss } from './app/public/lib/common/deadly-assault-solver.js';
import { isValidTeam, getTeams } from './app/public/lib/common/team-builder.js';
import {
    createEmptyPlan, sanitizePicks, getPlanProblems, planToPins, getEffectiveUnitStates
} from './app/public/lib/common/custom-plan.js';
import { encodePlan, decodePlan } from './app/public/lib/common/roster-share.js';
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

// Mirrors the page's custom-plan flow: owned roster plus any pinned agent counts as the unit
// pool, each boss is scored only against its candidate teams, and the solver gets the pins.
// `pinNames` is `{ bossSubstring: [unit names] }`. Also returns how many teams each boss scored.
function allocatePinned(allUnits, allBosses, ownedNames, bossFilter, pinNames) {
    const owned = buildSyntheticRoster(allUnits, ownedNames);
    const bossObjects = filterBosses(allBosses, bossFilter);
    assert(bossObjects.length === 3, `Boss filter "${bossFilter}" matched ${bossObjects.length} bosses, need exactly 3`);
    const bossNames = bossObjects.map(b => b.name);

    const pinsByBoss = {};
    for (const boss of bossObjects) {
        const key = Object.keys(pinNames).find(k => boss.name.toLowerCase().includes(k.toLowerCase()));
        pinsByBoss[boss.name] = key ? buildSyntheticRoster(allUnits, pinNames[key]).map(u => u.id) : [];
    }
    const pinnedUnits = allUnits.filter(u => Object.values(pinsByBoss).flat().includes(u.id));
    const unitPool = [...owned, ...pinnedUnits.filter(u => !owned.includes(u))];

    const { threeCharTeams, teamLabels } = buildTeams(unitPool, []);
    const scoredCount = {};
    const viableTeamsByBoss = {};
    for (const boss of bossObjects) {
        const candidates = getCandidateTeamsForBoss({ bossName: boss.name, pinsByBoss, threeCharTeams, unitPool });
        scoredCount[boss.name] = Object.keys(candidates).length;
        let viable = [];
        for (const label in candidates) {
            const score = scoreTeamForBoss(candidates[label], boss, {});
            if (score > 0) viable.push({ label, team: candidates[label], score });
        }
        if (viable.length === 0) {
            for (const label in candidates) {
                const score = scoreTeamForBoss(candidates[label], boss, { lenient: true });
                if (score > 0) viable.push({ label, team: candidates[label], score, lenient: true });
            }
        }
        viableTeamsByBoss[boss.name] = viable.sort((a, b) => b.score - a.score);
    }

    const { combinations } = solveDeadlyAssault({
        viableTeamsByBoss, bossNames, bossObjects, teamLabels, threeCharTeams,
        scoreLenient: (team, boss) => {
            const s = scoreTeamForBoss(team, boss, { lenient: true });
            return s > 0 ? s : null;
        },
        pinsByBoss, unitPool
    });
    return { combinations, bossNames, scoredCount, threeCharTeams, unitPool };
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

// Frozen so any write to a unit throws instead of landing silently. The engine
// resolves onto a UnitContext and must never touch `units.json` data. [CTX-01]
const allUnits = deepFreeze(await loadUnits());
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

    // Gated: no stun role AND no stunless carry -> still disqualified (strict only). [LEN-01]
    const noStunNoStunless = scoreTeam(allUnits, allBosses, ['Yixuan', 'Pan Yinhu', 'Lucia'], 'Thrall');
    assert(noStunNoStunless <= 0,
        `A team with neither a stunner nor a stunless carry must be disqualified on a stun-shill boss, got ${noStunNoStunless}`);

    // ...but lenient mode keeps it in play, scored without the shill credit. A rupture carry with
    // a double-rupture support clears Thrall in the real game, so lenient must score it, and
    // below the same team given a stunner.
    const thrall = filterBosses(allBosses, 'Thrall')[0];
    const lenientTeam = names => scoreTeamForBoss(buildSyntheticRoster(allUnits, names), thrall, { lenient: true });
    const lenientNoStun = lenientTeam(['Yixuan', 'Pan Yinhu', 'Lucia']);
    assert(lenientNoStun > 0, `Lenient mode must not disqualify a team merely lacking a stunner, got ${lenientNoStun}`);
    assert(lenientNoStun < lenientTeam(['Dialyn', 'Yixuan', 'Lucia']),
        'The stunnerless team should still score below the same carry with a stunner');

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

// Custom Deadly Assault plan (pins). Page-level feature over the same solver; the assertions are
// on allocations, never scores. documentation/bucketing/deadly-assault.md#custom-plans-pins

// TEST 7: with no pins the solver must behave exactly as before.
await runTest(7, 'No pins (null, empty, or all-empty) allocates identically to the unpinned solver', () => {
    const base = allocate(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest').combinations;
    const none = allocatePinned(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest', {}).combinations;
    const empty = allocatePinned(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest', { Thrall: [] }).combinations;
    for (const other of [none, empty]) {
        assert(other.length === base.length, `Combination count changed: ${base.length} -> ${other.length}`);
        for (let i = 0; i < Math.min(base.length, 25); i++) {
            assert(describe(base[i]) === describe(other[i]), `Combination #${i + 1} differs: ${describe(base[i])} vs ${describe(other[i])}`);
        }
    }
});

// TEST 8: a pin forces the agent onto that boss, in every combination, at a cost the player chose.
await runTest(8, 'A pinned agent is on its boss in every combination, and only that boss is narrowed', () => {
    const free = allocate(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest');
    assert(/priest/i.test(bossOf(free.combinations[0], 'Dialyn')), 'Precondition: unpinned, Dialyn goes to Priest (TEST 1)');

    const pinned = allocatePinned(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest', { Thrall: ['Dialyn'] });
    assert(pinned.combinations.length > 0, 'No combinations found');
    for (const combo of pinned.combinations.slice(0, 25)) {
        assert(/thrall/i.test(bossOf(combo, 'Dialyn')), `Dialyn must be on Thrall — ${describe(combo)}`);
    }
    assert(pinned.combinations[0].totalScore <= free.combinations[0].totalScore + 1e-6,
        'A constraint cannot beat the unconstrained best');

    // Scoring work shrinks for the pinned boss: only teams holding the pin are scored.
    const thrallKey = pinned.bossNames.find(n => /thrall/i.test(n));
    const totalLegal = Object.keys(pinned.threeCharTeams).length;
    assert(pinned.scoredCount[thrallKey] < totalLegal / 2,
        `Pinned boss should score far fewer than ${totalLegal} teams, scored ${pinned.scoredCount[thrallKey]}`);
});

// TEST 9: fixed teams (three pins) are scored as-is — legal, illegal, or unscorable alike.
await runTest(9, 'A fixed team is used exactly as given: legal, illegal, and unscorable', () => {
    const run = names => allocatePinned(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest', { Thrall: names });
    const thrallOf = (combo, res) => combo.assignments.find(a => a.boss === res.bossNames.find(n => /thrall/i.test(n)));
    const sameTeam = (a, names) => names.every(n => a.team.some(u => u.name === n)) && a.team.length === names.length;

    // Legal.
    const legalNames = ['Dialyn', 'Ye Shunguong', 'Sunna'];
    const legal = run(legalNames);
    assert(legal.combinations.length > 0 && sameTeam(thrallOf(legal.combinations[0], legal), legalNames), 'Legal fixed team not honoured');
    assert(legal.scoredCount[legal.bossNames.find(n => /thrall/i.test(n))] === 1, 'A fixed boss must score exactly one team');

    // Illegal join, but scorable: judged as it stands, not refused.
    const illegalNames = ['Dialyn', 'Sunna', 'Yixuan'];
    assert(!isValidTeam(...buildSyntheticRoster(allUnits, illegalNames)), 'Precondition: this team must be an illegal join');
    const illegal = run(illegalNames);
    const illegalAssign = thrallOf(illegal.combinations[0], illegal);
    assert(sameTeam(illegalAssign, illegalNames) && illegalAssign.score > 0, `Illegal fixed team should score as given, got ${illegalAssign.label} (${illegalAssign.score})`);

    // Unscorable even leniently (no DPS at all): still answered, flagged, at 0 — and the other
    // bosses still solve.
    const hopelessNames = ['Sunna', 'Zhao', 'Lucia'];
    const hopeless = run(hopelessNames);
    assert(hopeless.combinations.length > 0, 'An unscorable fixed team must not empty the whole result');
    const h = thrallOf(hopeless.combinations[0], hopeless);
    assert(sameTeam(h, hopelessNames) && h.score === 0 && h.unscorable === true,
        `Unscorable fixed team should be kept at 0 and flagged, got ${h.label} (${h.score}, unscorable=${h.unscorable})`);

    // A team only strict mode rejects (no stunner on a stun-shill boss) is scored, not Abysmal. [LEN-01]
    const noStunner = run(['Lucia', 'Pan Yinhu', 'Yixuan']);
    const n = thrallOf(noStunner.combinations[0], noStunner);
    assert(sameTeam(n, ['Lucia', 'Pan Yinhu', 'Yixuan']) && n.score > 0 && !n.unscorable,
        `A stunnerless fixed team must be scored leniently, got ${n.label} (${n.score}, unscorable=${n.unscorable})`);
});

// TEST 10: pins claim their agents — no other boss may use them.
await runTest(10, 'Pinned agents are barred from every other boss', () => {
    const res = allocatePinned(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest',
        { Thrall: ['Dialyn'], Priest: ['Yixuan'] });
    assert(res.combinations.length > 0, 'No combinations found');
    for (const combo of res.combinations.slice(0, 25)) {
        assert(/thrall/i.test(bossOf(combo, 'Dialyn')), `Dialyn must be on Thrall — ${describe(combo)}`);
        assert(/priest/i.test(bossOf(combo, 'Yixuan')), `Yixuan must be on Priest — ${describe(combo)}`);
    }
    const pins = { A: ['x'], B: [], C: [] };
    assert(!teamAllowedForBoss([{ id: 'x' }, { id: 'y' }, { id: 'z' }], 'B', pins), 'B must not use a unit pinned to A');
    assert(teamAllowedForBoss([{ id: 'x' }, { id: 'y' }, { id: 'z' }], 'A', pins), 'A must accept a team holding its pin');
    assert(!teamAllowedForBoss([{ id: 'y' }, { id: 'z' }, { id: 'w' }], 'A', pins), 'A must reject a team missing its pin');
});

// TEST 11: an unowned agent works only where pinned, even when no legal team can hold them.
await runTest(11, 'An unowned pinned agent is used on their boss only; a pin with no legal team is completed anyway', () => {
    const unowned = 'Soldier 11';
    assert(!DIALYN_ROSTER.includes(unowned), 'Precondition: Soldier 11 must be outside the roster');
    const withPin = allocatePinned(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest', { Priest: [unowned] });

    const legalWithThem = Object.values(getTeams(withPin.unitPool)).filter(t => t.length === 3 && t.some(u => u.name === unowned));
    assert(legalWithThem.length === 0, 'Precondition: no legal team may exist for Soldier 11 in this roster');

    assert(withPin.combinations.length > 0, 'A pin no legal team can hold must still produce an answer');
    for (const combo of withPin.combinations.slice(0, 25)) {
        assert(/priest/i.test(bossOf(combo, unowned)), `${unowned} must be on Priest — ${describe(combo)}`);
    }
    // Unpinned, the same unowned agent is simply not available.
    const without = allocatePinned(allUnits, allBosses, DIALYN_ROSTER, 'Aberrant,Thrall,Priest', {});
    assert(without.combinations.every(c => bossOf(c, unowned) === null), 'An unpinned unowned agent must never appear');
});

// TEST 12: plan module — validation, pins, and ownership.
await runTest(12, 'Plan: duplicates are rejected; off or empty plans mean no pins; only pinned agents count as owned', () => {
    const bosses = filterBosses(allBosses, 'Aberrant,Thrall,Priest');
    const ids = bosses.map(b => b.id);
    const dialyn = allUnits.find(u => u.name === 'Dialyn').id;
    const yixuan = allUnits.find(u => u.name === 'Yixuan').id;

    const plan = { enabled: true, picks: { [ids[0]]: [dialyn], [ids[1]]: [dialyn, yixuan] } };
    const problems = getPlanProblems(plan, ids, allUnits, allBosses);
    assert(problems.length === 1 && /Dialyn/.test(problems[0]), `Dialyn on two bosses must be one problem, got ${JSON.stringify(problems)}`);
    assert(getPlanProblems({ ...plan, enabled: false }, ids, allUnits, allBosses).length === 0, 'A disabled plan has no problems');
    assert(getPlanProblems(plan, [ids[1], ids[2]], allUnits, allBosses).length === 0, 'Picks on an unselected boss are dormant');

    assert(planToPins({ ...plan, enabled: false }, bosses) === null, 'Disabled plan must yield no pins');
    assert(planToPins({ enabled: true, picks: {} }, bosses) === null, 'Empty plan must yield no pins');
    const pins = planToPins({ enabled: true, picks: { [ids[1]]: [dialyn] } }, bosses);
    assert(pins[bosses[1].name].join() === dialyn && pins[bosses[0].name].length === 0, 'Pins must be keyed by boss name');

    const states = { [dialyn]: { owned: false }, [yixuan]: { owned: false } };
    const eff = getEffectiveUnitStates(states, pins);
    assert(eff[dialyn].owned === true && eff[yixuan].owned === false, 'Only pinned agents become owned');
    assert(states[dialyn].owned === false, 'Input states must not be mutated');
    assert(createEmptyPlan().enabled === false, 'A new plan starts disabled');
});

// TEST 13: share link — new parameter, old links unaffected, bad entries dropped.
await runTest(13, 'Plan share encoding round-trips, writes only selected bosses, and ignores bad entries', () => {
    const picks = { butcher: ['dialyn', 'yixuan'], priest: ['lucia'], thrall: ['anby'] };
    const encoded = encodePlan(picks, ['butcher', 'priest']);
    assert(encoded === 'butcher:dialyn.yixuan,priest:lucia', `Unexpected encoding: ${encoded}`);
    assert(JSON.stringify(decodePlan(encoded, allBosses)) === JSON.stringify({ butcher: ['dialyn', 'yixuan'], priest: ['lucia'] }),
        'Round trip must preserve picks');

    assert(Object.keys(decodePlan(null, allBosses)).length === 0 && Object.keys(decodePlan('', allBosses)).length === 0,
        'A link with no plan parameter decodes to an empty plan');
    assert(encodePlan({}, ['butcher']) === '' && encodePlan(null, ['butcher']) === '', 'No picks, no parameter');

    const messy = decodePlan('nonsense,ghostboss:anby,butcher:,butcher:anby.notanagent.anby.billy.nicole.yixuan', allBosses);
    const clean = sanitizePicks(messy, allUnits, allBosses);
    assert(JSON.stringify(Object.keys(clean)) === '["butcher"]', `Only the real boss should survive, got ${Object.keys(clean)}`);
    assert(JSON.stringify(clean.butcher) === '["anby","billy","nicole"]',
        `Unknown agents and repeats dropped, capped at three, got ${JSON.stringify(clean.butcher)}`);
});

// TEST 14: the solver always answers, even when every top team shares one agent.
await runTest(14, 'Pinned solve never comes back empty: greedy fallback builds one allocation', () => {
    const pool = Array.from({ length: 9 }, (_, i) => fakeUnit(`u${i + 1}`));
    const [u1, u2, u3, u4, u5, u6, , , u9] = pool;
    const entry = (team, score) => ({ label: team.map(u => u.name).join(' / '), team, score });
    const eA = entry([u1, u9, u2], 100), eB = entry([u9, u3, u4], 90), eC = entry([u9, u5, u6], 80);
    const bossObjects = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    const viableTeamsByBoss = { A: [eA], B: [eB], C: [eC] };
    const threeCharTeams = Object.fromEntries([eA, eB, eC].map(e => [e.label, e.team]));

    const { combinations } = solveDeadlyAssault({
        viableTeamsByBoss, bossNames: ['A', 'B', 'C'], bossObjects,
        teamLabels: Object.keys(threeCharTeams), threeCharTeams,
        scoreLenient: () => 50,
        pinsByBoss: { A: ['u1'], B: [], C: [] }, unitPool: pool
    });
    assert(combinations.length === 1, `Expected the single fallback allocation, got ${combinations.length}`);
    const ids = combinations[0].assignments.flatMap(a => a.team.map(u => u.id));
    assert(new Set(ids).size === 9, `All nine units must be used once, got ${ids.join(',')}`);
    assert(combinations[0].assignments[0].team.some(u => u.id === 'u1'), 'The pin must still be honoured');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
