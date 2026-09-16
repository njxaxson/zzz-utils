/**
 * test-mechanics.mjs
 *
 * Assertion-based regression tests for isolated team-scoring engine mechanics
 * (predicates, conditional resolution, boss-variation merging, disorder-supply curves, etc.)
 * — the mechanism-focused half of what used to be test-scoring.mjs. These tests use synthetic
 * clones or direct engine calls, not roster rankings, so a new unit or boss should not require
 * changes here. Ranking/ladder assertions against the live roster live in test-rankings.mjs.
 *
 * Run from the repository root:
 *   node test-mechanics.mjs            — run all tests
 *   node test-mechanics.mjs -17 -22    — run only tests 17 and 22
 *
 * Exit code: 0 if all (specified) tests pass, 1 if any (specified) test fails.
 * Unspecified tests are completely ignored when -N flags are provided.
 *
 * Each TEST block verifies specific ordering relationships, score thresholds,
 * or structural constraints. Some tests are partial — they check the most
 * important assertions while noting aspects that are qualitative or
 * boss-dependent and not suitable for hard automation.
 */

import { loadAllData } from './lib/data.js';
import { chargeableElementArms, getBasicDamage, getBasicDamageBaseline, getMaxBurstWeight, quickAssistCohesionWeight, scoreTeamForBoss, resolveBossVariation, resolveConditionalValue, getEffectiveScaling, effectiveDisorderSupply, effectiveDisorderWeakSupply, getChainMagnitude } from './app/public/lib/common/team-scorer.js';
import { filterBosses } from './lib/boss-filter.js';
import { NEUTRAL_BOSS, assert, makeAllViableTeamEntries, filterIncludeOneOf, getTopViableTeams, scoreForTeamString, scoreMapForBoss, withBosses } from './lib/scoring-test-utils.js';

// Viability / disqualification: `matchups.js` only *lists* teams with score > 0. A score <= 0
// means the comp is not viable for that boss (disqualification, anti-synergy, etc.). Assertions
// use the raw `scoreTeamForBoss` return value unless noted.

// Tests that are red ON PURPOSE: some assertions here encode an ordering the owner believes
// correct but the engine does not yet produce, listed rather than deleted so the disagreement
// is not lost. See documentation/tooling/verification-loop.md#why-known_red-works-the-way-it-does
// for why the exit code depends on the failing set matching this EXACTLY. Every entry needs a
// reason and the phase expected to clear it. Do NOT add an entry to silence a regression.
const KNOWN_RED = new Map([
]);

async function main() {
    // Collect -N flags (e.g. -17 -22 -34) from argv.
    const onlyTests = new Set();
    for (const arg of process.argv.slice(2)) {
        const m = /^-(\d+)$/.exec(arg);
        if (m) onlyTests.add(Number(m[1]));
    }

    const { units: allUnits, bosses: bossesRaw, roster } = await loadAllData();
    const bosses = [...bossesRaw, { ...NEUTRAL_BOSS }];
    const allTeamEntries = makeAllViableTeamEntries(allUnits, roster);

    const failures = [];

    function run(name, fn) {
        // If a filter is active, skip tests whose number is not listed.
        if (onlyTests.size > 0) {
            const nm = /^TEST (\d+)/.exec(name);
            if (!nm || !onlyTests.has(Number(nm[1]))) return;
        }
        try {
            fn();
            console.log(`PASS: ${name}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log(`FAIL: ${name}`);
            console.log(`      ${msg}`);
            failures.push({ name, msg });
        }
    }

    console.log('--- Team scoring tests: mechanics (raw scoreTeamForBoss) ---\n');



    // TEST 1: resolveBossVariation — merge semantics
    run('TEST 1: resolveBossVariation — merge semantics', () => {
        const butcher = bosses.find(b => b.id === 'butcher');
        assert(butcher, 'Butcher must be found');
        assert(butcher.variations?.raging, 'Butcher must have a "raging" variation');

        // Default returns the base object unchanged
        const defaultBoss = resolveBossVariation(butcher, null);
        assert(defaultBoss === butcher, 'null variationId should return the base object itself');

        // Raging variation: shill changes to stun, debuffs are erased
        const ragingBoss = resolveBossVariation(butcher, 'raging');
        assert(ragingBoss !== butcher, 'resolved variation must be a new object');
        assert(ragingBoss.mechanics.shill === 'stun',
            `Raging Butcher shill should be "stun", got "${ragingBoss.mechanics.shill}"`);
        assert(!('debuffs' in ragingBoss.mechanics),
            'Raging Butcher should have no debuffs key (erased by null override)');
        assert(ragingBoss._variationId === 'raging', '_variationId should be set');

        // Base object is not mutated
        assert(butcher.mechanics.shill === 'anomaly', 'Base Butcher shill must remain "anomaly"');
        assert('debuffs' in butcher.mechanics, 'Base Butcher debuffs must still exist');
    });

    // TEST 2: resolveBossVariation — UCC anti-anomaly + open variation
    run('TEST 2: UCC default has anti-anomaly; open variation erases it', () => {
        const ucc = bosses.find(b => b.id === 'ucc');
        assert(ucc, 'UCC must be found');
        assert(Array.isArray(ucc.mechanics.anti) && ucc.mechanics.anti.includes('anomaly'),
            'Default UCC must have anti=["anomaly"]');

        const openUcc = resolveBossVariation(ucc, 'og');
        assert(!('anti' in openUcc.mechanics),
            'UCC open variation should have no "anti" key (erased by null)');
    });

    // TEST 3: filterBosses supports boss:variation syntax
    run('TEST 3: filterBosses boss:variation syntax resolves correctly', () => {
        const ragingBosses = filterBosses(bosses, 'butcher:raging');
        assert(ragingBosses.length === 1, `Expected 1 result for "butcher:raging", got ${ragingBosses.length}`);
        const rb = ragingBosses[0];
        assert(rb.mechanics.shill === 'stun',
            `Raging Butcher from filterBosses should have shill="stun", got "${rb.mechanics.shill}"`);

        // Plain filter still returns default
        const defaultBosses = filterBosses(bosses, 'butcher');
        assert(defaultBosses.length === 1, 'Plain butcher filter should return 1');
        assert(defaultBosses[0].mechanics.shill === 'anomaly',
            'Default Butcher should remain anomaly shill');
    });

    // TEST 4: Unified conditional framework — recipient-scoped + team-scoped
    // Koleda's P6 narrow buff: armorers receive Laceration, everyone else CD (recipient-scoped
    // `role` predicate). Remielle's ATK curve scales with anomaly count (team-scoped).
    run('TEST 4: conditional framework resolves per-recipient and per-team', () => {
        const koleda = allUnits.find(u => u.id === 'koleda');
        const rem = allUnits.find(u => u.id === 'ramiel');
        const armorer = { tags: ['armorer'] };
        const attacker = { tags: ['attack'] };
        const kLac = koleda.mechanics.buffs.laceration, kCd = koleda.mechanics.buffs.cd;
        // Recipient-scoped: armorer → Laceration:1/CD:0; non-armorer → Laceration:0/CD:3
        assert(resolveConditionalValue(kLac, { team: [], self: koleda, consumer: armorer }) === 1,
            'Koleda Laceration should be 1 for an armorer recipient');
        assert(resolveConditionalValue(kCd, { team: [], self: koleda, consumer: armorer }) === 0,
            'Koleda CD should be 0 for an armorer recipient');
        assert(resolveConditionalValue(kLac, { team: [], self: koleda, consumer: attacker }) === 0,
            'Koleda Laceration should be 0 for a non-armorer recipient');
        assert(resolveConditionalValue(kCd, { team: [], self: koleda, consumer: attacker }) === 3,
            'Koleda CD should be 3 for a non-armorer recipient');
        // Team-scoped: Remielle ATK by anomaly count (incl. self): 3+→4, 2→2, else 0
        const ano = n => Array.from({ length: n }, () => ({ tags: ['anomaly'] }));
        const rAtk = rem.mechanics.buffs.atk;
        assert(resolveConditionalValue(rAtk, { team: ano(3), self: rem, consumer: null }) === 4,
            'Remielle ATK should be 4 on a triple-anomaly team');
        assert(resolveConditionalValue(rAtk, { team: ano(2), self: rem, consumer: null }) === 2,
            'Remielle ATK should be 2 on a duo-anomaly team');
        assert(resolveConditionalValue(rAtk, { team: ano(1), self: rem, consumer: null }) === 0,
            'Remielle ATK should be 0 with a lone anomaly');
    });

    // TEST 5: Pyrois's ultimate:strong is conditioned on provisions:"anomaly:wind", which Roxy
    // meets via her utility["anomaly:wind"] surplus. Compared against a CLONE of Roxy with that
    // entry stripped, not a real stunner (e.g. Koleda) — see the TEST 11 lesson for why.
    run('TEST 5: Roxy enables Pyrois over a clone without wind-anomaly provision (Neutral)', () => {
        const roxy = allUnits.find(u => u.id === 'roxy');
        if (!roxy) return;
        assert(roxy.mechanics.utility?.['anomaly:wind'] > 0,
            'fixture assumption broken: Roxy should provision utility["anomaly:wind"]');
        const noWind = JSON.parse(JSON.stringify(roxy));
        noWind.id = 'roxy-nowind';
        noWind.name = 'Roxy Nowind';
        delete noWind.mechanics.utility['anomaly:wind'];
        const roster = [...allUnits, noWind];
        for (const b of withBosses(bosses, 'Neutral')) {
            const real = scoreForTeamString('Roxy/Pyrois/Astra', roster, { preview: true })[0];
            const clone = scoreForTeamString('Roxy Nowind/Pyrois/Astra', roster, { preview: true })[0];
            const rs = scoreTeamForBoss(real.team, b, {});
            const cs = scoreTeamForBoss(clone.team, b, {});
            assert(rs > 0 && cs > 0, `both fixtures must be legal teams, got ${rs} / ${cs}`);
            assert(rs > cs,
                `${b.name}: Roxy (${rs.toFixed(1)}, provisions anomaly:wind) must earn more from Pyrois than the same unit without that provision (${cs.toFixed(1)})`);
        }
    });

    // TEST 6: Pyrois's damage["ultimate:strong"] activates only with a wind-anomaly teammate,
    // `{ when: { hasUnit: "anomaly:wind" } }` — a colon-qualified hasUnit matches by effective
    // role + element, so Roxy (wind pseudo-anomaly) triggers it but ether-anomaly Vivian does not.
    run('TEST 6: hasUnit "anomaly:wind" predicate (Pyrois ultimate)', () => {
        if (!allUnits.find(u => u.id === 'roxy')) return;
        const pyrois = allUnits.find(u => u.id === 'pyrois');
        const roxy = allUnits.find(u => u.id === 'roxy');
        const vivian = allUnits.find(u => u.id === 'vivian');
        const spec = pyrois.mechanics.damage['ultimate:strong'];
        assert(resolveConditionalValue(spec, { team: [pyrois, roxy], self: pyrois, consumer: null }) === 1,
            'Pyrois ultimate:strong should be 1 with a wind-anomaly unit (Roxy) present');
        assert(resolveConditionalValue(spec, { team: [pyrois, vivian], self: pyrois, consumer: null }) === 0,
            'Pyrois ultimate:strong should be 0 with only ether anomaly (Vivian) present');
        assert(resolveConditionalValue(spec, { team: [pyrois], self: pyrois, consumer: null }) === 0,
            'Pyrois ultimate:strong should be 0 with no wind anomaly on the team');
    });


    // TEST 7: Laceration (the armorer's damage type, class analogue of rupture's Sheer) reaches
    // an armorer down two independent paths — baseline affinity (MULT.LACERATION_BUFF) and the
    // damage-lever dependency (getArmorerLeverSupply) — so each is pinned separately below; a
    // test that only checks "score went down" would pass even with MULT.LACERATION_BUFF zeroed.
    // Isolated by A/B-ing the SAME team with the buff stripped, so only the buff differs.
    run('TEST 7: laceration buffs are armorer-only', () => {
        const roxy = allUnits.find(u => u.id === 'roxy');
        if (!roxy || !allUnits.find(u => u.id === 'claret')) return;

        const rLac = roxy.mechanics.buffs.laceration;
        assert(resolveConditionalValue(rLac, { team: [], self: roxy, consumer: { tags: ['armorer'] } }) > 0,
            'Roxy laceration should not be 0 for an armorer recipient');
        assert(resolveConditionalValue(rLac, { team: [], self: roxy, consumer: { tags: ['attack'] } }) === 0,
            'Roxy laceration should be 0 for a non-armorer recipient');

        // Same units with the laceration buff neutralised to 0 (optionally on one named unit).
        // Zeroed rather than deleted on purpose: deleting Claret's only buff would empty her
        // `buffs` map and flip her into a different cohesion branch, which would show up as a
        // score change that has nothing to do with laceration.
        const stripLaceration = (team, onlyId = null) => team.map(u => {
            if (!u.mechanics?.buffs?.laceration) return u;
            if (onlyId && u.id !== onlyId) return u;
            return { ...u, mechanics: { ...u.mechanics, buffs: { ...u.mechanics.buffs, laceration: 0 } } };
        });
        const abTest = (teamString, b, onlyId = null) => {
            const team = scoreForTeamString(teamString, allUnits, { preview: true })[0].team;
            return [scoreTeamForBoss(team, b, {}), scoreTeamForBoss(stripLaceration(team, onlyId), b, {})];
        };

        for (const b of withBosses(bosses, 'Neutral')) {
            // (a) Combined effect: laceration is worth real points to an armorer team.
            const [withLac, withoutLac] = abTest('Roxy/Claret/Rina', b);
            assert(withLac > withoutLac,
                `${b.name}: stripping Roxy's laceration must cost Claret real points (${withLac?.toFixed(1)} → ${withoutLac?.toFixed(1)})`);

            // (b) Baseline-affinity path in isolation. Nicole's cr:1 + defense:3 already
            // saturate Claret's lever dependency (3.25 >= ARMORER_LEVER_FULL) with Roxy's
            // laceration removed, so lever utility is pinned at 1.0 on BOTH sides and the
            // entire remaining delta is the affinity term. This is the assertion that fails
            // if MULT.LACERATION_BUFF is zeroed.
            const [satWith, satWithout] = abTest('Roxy/Claret/Nicole', b);
            assert(satWith > satWithout + 20,
                `${b.name}: on a lever-saturated team the laceration affinity term must still land (${satWith?.toFixed(1)} → ${satWithout?.toFixed(1)})`);

            // (c) Recipient gate: Roxy's laceration is written as a `role: armorer` conditional,
            // so on a team with no armorer it resolves to 0 and the score must not move at all.
            const [attackWith, attackWithout] = abTest('Roxy/Harumasa/Rina', b);
            assert(attackWith === attackWithout,
                `${b.name}: a conditional laceration buff must be worth exactly nothing without an armorer (${attackWith?.toFixed(1)} vs ${attackWithout?.toFixed(1)})`);

            // (d) Consumer gate: Claret's OWN laceration:3 is unconditional, so nothing stops it
            // reaching Roxy and Rina except resolveBaselineWeight('laceration') returning 0 for
            // non-armorers. With no second armorer on the team it must land on nobody — stripping
            // it changes nothing. This is the assertion that fails if that gate is removed, and
            // (c) cannot cover it: Roxy's buff is already zeroed by its own conditional.
            const [claretWith, claretWithout] = abTest('Roxy/Claret/Rina', b, 'claret');
            assert(claretWith === claretWithout,
                `${b.name}: Claret's unconditional laceration must reach no non-armorer teammate (${claretWith?.toFixed(1)} vs ${claretWithout?.toFixed(1)})`);
        }
    });

    // TEST 8: Boss control skills — armorer quicktime intercept (synthetic)
    // A control skill locks the player out of everything but dodge/parry/assist. Armorers
    // intercept it and reduce it to a quicktime event, so their value rises with the count.
    // Teams without an armorer must be completely unaffected.
    run('TEST 8: control skills reward armorers only', () => {
        if (!allUnits.find(u => u.id === 'claret')) return;
        const base = withBosses(bosses, 'Neutral')[0];
        const withControl = (n) => ({ ...base, mechanics: { ...base.mechanics, control: n } });
        const armorer = scoreForTeamString('Koleda/Claret/Rina', allUnits, { preview: true })[0].team;
        const noArmorer = scoreForTeamString('Koleda/Evelyn/Astra', allUnits)[0].team;

        const a0 = scoreTeamForBoss(armorer, withControl(0), {});
        const a3 = scoreTeamForBoss(armorer, withControl(3), {});
        assert(a3 > a0, `control:3 should lift the armorer team (${a0?.toFixed(1)} → ${a3?.toFixed(1)})`);

        const n0 = scoreTeamForBoss(noArmorer, withControl(0), {});
        const n3 = scoreTeamForBoss(noArmorer, withControl(3), {});
        assert(n0 === n3,
            `control skills must not move a team with no armorer (${n0?.toFixed(1)} vs ${n3?.toFixed(1)})`);
    });

    // TEST 9: no unit gets an ultimate need it did not declare
    // Pins that ultimate value flows through exactly two places — magnitude -> provision, and
    // `scaling.ultimates` -> need — with no manufactured floor bleeding into the second. Full
    // defect history: ../engine/ultimates-two-channel.md#never-fabricate-a-need.
    run('TEST 9: no unit has an ultimates need it did not declare', () => {
        const offenders = [];
        for (const u of allUnits) {
            const declared = u.mechanics?.scaling?.ultimates;
            const effective = getEffectiveScaling(u).ultimates;
            if (effective === undefined && declared === undefined) continue;
            if (effective !== declared) offenders.push(`${u.id} declares ${declared} but reports ${effective}`);
        }
        assert(offenders.length === 0,
            `effective ultimate need must equal the annotated value exactly: ${offenders.join('; ')}`);
        // And the population is small on purpose — only units that genuinely do something
        // extra with an ultimate belong here.
        const withNeed = allUnits.filter(u => getEffectiveScaling(u).ultimates !== undefined).map(u => u.id).sort();
        assert(withNeed.every(id => allUnits.find(u => u.id === id).mechanics.scaling.ultimates > 0),
            `every unit in the need channel must annotate a positive value, got ${withNeed.join(',')}`);
    });

    // TEST 10: scaling and magnitude are independent and both count
    // Pins that provision (magnitude) and need (declared scaling.ultimates) ADD, rather than the
    // old override semantics where the annotated value replaced the magnitude-derived one. See
    // ../engine/ultimates-two-channel.md#the-channels-do-not-overlap-and-that-is-the-whole-point.
    // Synthesised: no shipped unit currently pairs ultimate:strong 3 with a scaling annotation.
    run('TEST 10: a same-magnitude carry that also scales on ultimates is worth more to Dialyn', () => {
        const seed = allUnits.find(u => u.id === 'seed');
        assert(seed && seed.mechanics.damage['ultimate:strong'] === 3 && seed.mechanics.scaling?.ultimates === undefined,
            'fixture assumption broken: Seed should be ultimate:strong 3 with no scaling.ultimates');
        const terrence = JSON.parse(JSON.stringify(seed));
        terrence.id = 'terrence';
        terrence.name = 'Terrence';
        terrence.mechanics.scaling = { ...(terrence.mechanics.scaling || {}), ultimates: 1 };
        const roster = [...allUnits, terrence];
        for (const b of withBosses(bosses, 'Neutral')) {
            const withSeed = scoreForTeamString('Dialyn/Seed/Orphie', roster)[0];
            const withTerrence = scoreForTeamString('Dialyn/Terrence/Orphie', roster)[0];
            const ss = scoreTeamForBoss(withSeed.team, b, {});
            const ts = scoreTeamForBoss(withTerrence.team, b, {});
            assert(ss > 0 && ts > 0, `both fixtures must be legal teams, got Seed ${ss} / Terrence ${ts}`);
            assert(ts > ss,
                `${b.name}: Terrence (${ts.toFixed(1)}) has Seed's ultimate PLUS a declared benefit, so Dialyn must be worth more to him than to Seed (${ss.toFixed(1)})`);
        }
    });

    // TEST 11: ultimate magnitude is graded, not binary
    // Evelyn's ultimate:strong 1 (~4200%) must score above an unannotated ultimate (~3000-3600%)
    // through the provision channel alone, guarding the 1.0 -> 1.1 rung of ULTIMATE_MAGNITUDE.
    //
    // Compared against a CLONE of Evelyn with the annotation stripped, not a real unit — Evelyn
    // vs Ellen differ by ~90 points for unrelated reasons and would pass regardless (the "TEST 11
    // lesson", reused by several tests below). See
    // ../notes/known-pitfalls.md#a-test-that-cannot-fail-proves-nothing.
    run('TEST 11: ultimate magnitude is graded — annotating ultimate:strong 1 beats not annotating', () => {
        const evelyn = allUnits.find(u => u.id === 'evelyn');
        assert(evelyn && evelyn.mechanics.damage['ultimate:strong'] === 1,
            'fixture assumption broken: Evelyn should carry ultimate:strong 1');
        const plain = JSON.parse(JSON.stringify(evelyn));
        plain.id = 'evelyn-unannotated';
        plain.name = 'Evelyn Unannotated';
        delete plain.mechanics.damage['ultimate:strong'];
        const roster = [...allUnits, plain];
        for (const b of withBosses(bosses, 'Neutral')) {
            const real = scoreForTeamString('Dialyn/Evelyn/Astra', roster)[0];
            const clone = scoreForTeamString('Dialyn/Evelyn Unannotated/Astra', roster)[0];
            const rs = scoreTeamForBoss(real.team, b, {});
            const cs = scoreTeamForBoss(clone.team, b, {});
            assert(rs > 0 && cs > 0, `both fixtures must be legal teams, got ${rs} / ${cs}`);
            assert(rs > cs,
                `${b.name}: Evelyn (${rs.toFixed(1)}, ultimate:strong 1) must earn more from Dialyn than the same unit unannotated (${cs.toFixed(1)})`);
        }
    });

    // TEST 12: a weak ultimate earns nothing through EITHER channel
    // LOAD-BEARING. `ultimate:weak` with no `ultimate:strong` means the ultimate is not a real
    // burst, so a free one is worth nothing — see [ULT-02]. A conditional `ultimate:strong` must
    // still lift it, which is how Pyrois's wind case works (see also TESTs 76, 78, 79).
    run('TEST 12: weak ultimates earn no provision, and a conditional strong ultimate lifts it', () => {
        const sigrid = allUnits.find(u => u.id === 'sigrid');
        const pyrois = allUnits.find(u => u.id === 'pyrois');
        if (!sigrid || !pyrois) return;
        // Neither declares a need, and neither may acquire one.
        assert(getEffectiveScaling(sigrid).ultimates === undefined,
            'Sigrid must have no ultimates need — her ultimate is weaker than her enhanced attacks');
        assert(getEffectiveScaling(pyrois).ultimates === undefined,
            'Pyrois must have no ultimates need — he uses his ultimate as a mode switch');
        // Swapping Dialyn (ultimates provider) for a non-provider of similar standing must not
        // move Sigrid's line through the ultimate channels at all.
        for (const b of withBosses(bosses, 'Neutral')) {
            const withProvider = scoreForTeamString('Dialyn/Sigrid/Sunna', allUnits)[0];
            const s = scoreTeamForBoss(withProvider.team, b, {});
            assert(s > 0, `Dialyn/Sigrid/Sunna should be a legal team, got ${s}`);
        }
        // Pyrois: the wind-anomaly conditional must still open the provision channel.
        if (allUnits.find(u => u.id === 'roxy')) {
            for (const b of withBosses(bosses, 'Neutral')) {
                const wind = scoreForTeamString('Dialyn/Pyrois/Roxy', allUnits, { preview: true })[0];
                const noWind = scoreForTeamString('Dialyn/Pyrois/Trigger', allUnits)[0];
                const ws = scoreTeamForBoss(wind.team, b, {});
                const ns = scoreTeamForBoss(noWind.team, b, {});
                assert(ws > ns,
                    `${b.name}: wind must unlock Pyrois's ultimate provision — Roxy ${ws.toFixed(1)} vs Trigger ${ns.toFixed(1)}`);
            }
        }
    });

    // TEST 13: partial ultimate coverage is priced by the FRACTION of the need met
    // Ju Fufu's `utility.ultimates: 1` must earn strictly less covering a scaling.ultimates 3
    // need than a 2 need — the "least hungry pays the most" ruling and the squared-ratio fix
    // (FRACTIONAL_COVERAGE_KEYS):
    // ../notes/adjudications.md#least-hungry-pays-the-most-is-correct-for-ultimates.
    //
    // Two clones of ONE unit differing in exactly that field, per the TEST 11 lesson.
    run('TEST 13: partial ultimate coverage is priced by fraction of need met', () => {
        const yixuan = allUnits.find(u => u.id === 'yixuan');
        const juFufu = allUnits.find(u => u.id === 'ju-fufu');
        assert(yixuan && yixuan.mechanics.scaling?.ultimates === 2,
            'fixture assumption broken: Yixuan should annotate scaling.ultimates 2');
        assert(juFufu && juFufu.mechanics.utility?.ultimates === 1,
            'fixture assumption broken: Ju Fufu should supply utility.ultimates 1');
        const clone = (k, id, name) => {
            const c = JSON.parse(JSON.stringify(yixuan));
            c.id = id;
            c.name = name;
            c.mechanics.scaling.ultimates = k;
            return c;
        };
        const half = clone(2, 'yixuan-half', 'Yixuan Halfcovered');
        const third = clone(3, 'yixuan-third', 'Yixuan Thirdcovered');
        const roster = [...allUnits, half, third];
        for (const b of withBosses(bosses, 'Neutral')) {
            const hs = scoreTeamForBoss(scoreForTeamString('Ju Fufu/Yixuan Halfcovered/Lucia', roster)[0].team, b, {});
            const ts = scoreTeamForBoss(scoreForTeamString('Ju Fufu/Yixuan Thirdcovered/Lucia', roster)[0].team, b, {});
            assert(hs > 0 && ts > 0, `both fixtures must be legal teams, got ${hs} / ${ts}`);
            assert(hs > ts,
                `${b.name}: Ju Fufu covers half of a scaling.ultimates 2 need (${hs.toFixed(1)}) and only a third of a 3 need (${ts.toFixed(1)}), so the first must score higher — equal scores mean the coverage ratio has stopped being priced`);
        }
    });

    // TEST 14: under-met ultimate scaling is a smaller bonus, never a penalty
    // Ultimates arrive naturally and only two units provision them, so wanting more than any
    // teammate supplies must never score worse than declaring no need at all — including a need
    // beyond what anyone in the roster covers. Full ruling:
    // ../notes/adjudications.md#annotating-an-ultimate-need-above-the-maximum-provision-is-intended.
    run('TEST 14: under-met ultimate scaling is a smaller bonus, never a penalty', () => {
        const yixuan = allUnits.find(u => u.id === 'yixuan');
        assert(yixuan && yixuan.mechanics.scaling?.ultimates === 2,
            'fixture assumption broken: Yixuan should annotate scaling.ultimates 2');
        const clone = (k, id, name) => {
            const c = JSON.parse(JSON.stringify(yixuan));
            c.id = id;
            c.name = name;
            if (k === null) delete c.mechanics.scaling.ultimates;
            else c.mechanics.scaling.ultimates = k;
            return c;
        };
        const none = clone(null, 'yixuan-noneed', 'Yixuan Noneed');
        const k3 = clone(3, 'yixuan-k3', 'Yixuan Wants Three');
        const k4 = clone(4, 'yixuan-k4', 'Yixuan Wants Four');
        const roster = [...allUnits, none, k3, k4];
        assert(getEffectiveScaling(none).ultimates === undefined,
            'the no-annotation clone must acquire no ultimates need (see TEST 9)');
        for (const b of withBosses(bosses, 'Neutral')) {
            const sc = name => scoreTeamForBoss(scoreForTeamString(`Ju Fufu/${name}/Lucia`, roster)[0].team, b, {});
            const ns = sc('Yixuan Noneed'), s3 = sc('Yixuan Wants Three'), s4 = sc('Yixuan Wants Four');
            assert(ns > 0 && s3 > 0 && s4 > 0, `all fixtures must be legal teams, got ${ns} / ${s3} / ${s4}`);
            assert(s3 > ns,
                `${b.name}: a need Ju Fufu covers a third of (${s3.toFixed(1)}) must still beat declaring no need at all (${ns.toFixed(1)})`);
            assert(s4 > ns,
                `${b.name}: a need beyond what any unit in the roster supplies (${s4.toFixed(1)}) must still be a bonus over no need (${ns.toFixed(1)}) — unmet ultimate scaling is never charged`);
            assert(s3 > s4,
                `${b.name}: coverage falls as the need grows, so a 3 need (${s3.toFixed(1)}) must earn Ju Fufu more than a 4 need (${s4.toFixed(1)})`);
        }
    });

    // TEST 15: disorder supply is MEASURED, not a constant
    // `scaling.disorders` declares a NEED, so Miyabi's score must track how much disorder the
    // team actually generates — it used to be a hardcoded supply of 2 behind a boolean, so every
    // disorder-generating team paid her exactly 28.0. Full defect:
    // ../notes/lessons-learned.md#disorder-supply-was-never-measured.
    //
    // The load-bearing SECOND block clones Vivian onto fire (off Nangong's ether) so Miyabi gets
    // a second distinct cycling element with nothing else changed — the gradient alone passes
    // against the old flat model too (see
    // ../notes/known-pitfalls.md#a-test-that-cannot-fail-proves-nothing), since the old model's
    // boolean can't tell ONE cycling element from TWO.
    run('TEST 15: Miyabi rises with the team disorder supply', () => {
        for (const b of withBosses(bosses, 'Fiend')) {
            const t = 'Miyabi/Astra/Yuzuha,Miyabi/Vivian/Yuzuha,Nangong/Miyabi/Yuzuha';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
            const none = m.get('Miyabi / Astra / Yuzuha');
            const cycling = m.get('Miyabi / Vivian / Yuzuha');
            const both = m.get('Nangong / Miyabi / Yuzuha');
            assert(none > 0 && cycling > 0 && both > 0,
                `all three fixtures must be legal teams, got ${none} / ${cycling} / ${both}`);
            assert(cycling > none,
                `${b.name}: a cycling partner (${cycling.toFixed(1)}) must beat no disorder source at all (${none.toFixed(1)})`);
            assert(both > cycling,
                `${b.name}: cycling PLUS a polarity generator (${both.toFixed(1)}) must beat cycling alone (${cycling.toFixed(1)})`);
        }

        const vivian = allUnits.find(u => u.id === 'vivian');
        assert(vivian && vivian.tags.includes('ether'),
            'fixture assumption broken: Vivian should be an ether unit');
        const twin = JSON.parse(JSON.stringify(vivian));
        twin.id = 'vivian-fire'; twin.name = 'Vivian Fire';
        twin.tags = vivian.tags.map(t => (t === 'ether' ? 'fire' : t));
        const roster = [...allUnits, twin];
        for (const b of withBosses(bosses, 'Neutral')) {
            const sc = name => scoreTeamForBoss(
                scoreForTeamString(`Nangong/Miyabi/${name}`, roster)[0].team, b, {});
            const oneElement = sc('Vivian'), twoElements = sc('Vivian Fire');
            assert(oneElement > 0 && twoElements > 0,
                `both fixtures must be legal teams, got ${oneElement} / ${twoElements}`);
            assert(twoElements > oneElement,
                `${b.name}: Miyabi cycling with TWO distinct elements (${twoElements.toFixed(1)}) must out-supply cycling with one (${oneElement.toFixed(1)}) — equal scores mean disorder supply is a boolean again`);
        }
    });

    // TEST 16: cycling and polarity supply AGGREGATE against one need
    // The two disorder sources are independent and both real, so they must add. Pinned directly
    // via a polarity provider sharing Miyabi's exact elemental variant, so element cycling is
    // impossible (same variant -> no reaction) and forced polarity is the ONLY possible source —
    // if it did not enter the aggregate this team would have no disorder supply at all. See
    // ../notes/lessons-learned.md#disorder-supply-was-never-measured for why a coverage-step
    // formulation cannot express this (it requires supply^2, deleting the appetite term).
    //
    // Two clones differing in exactly one field, per the TEST 11 lesson.
    run('TEST 16: forced polarity feeds the disorder need with no element cycling at all', () => {
        const nangong = allUnits.find(u => u.id === 'nangong');
        const miyabi = allUnits.find(u => u.id === 'miyabi');
        assert(nangong && nangong.mechanics.utility?.disorders === 2,
            'fixture assumption broken: Nangong should supply utility.disorders 2');
        assert(miyabi?.mechanics?.elementalVariant === 'frost',
            'fixture assumption broken: Miyabi should carry elementalVariant frost');
        // Re-elemented onto Miyabi's exact ice/frost gauge, so the pair cannot cycle.
        const mk = (id, name, withPolarity) => {
            const c = JSON.parse(JSON.stringify(nangong));
            c.id = id; c.name = name;
            c.tags = nangong.tags.map(t => (t === 'ether' ? 'ice' : t));
            c.mechanics.elementalVariant = 'frost';
            if (!withPolarity) delete c.mechanics.utility.disorders;
            return c;
        };
        const withPol = mk('nangong-frost', 'Nangong Frost', true);
        const noPol = mk('nangong-frost-nopol', 'Nangong Frost Nopol', false);
        const roster = [...allUnits, withPol, noPol];
        // Astra as the third slot, NOT Yuzuha: `utility.disorders` also gates the
        // `buffs.disorders` affinity channel via `teamHasPolarity`, so a teammate who buffs
        // disorders would make this pass through a completely different mechanism. Astra buffs
        // no disorders, which leaves the aggregate-supply channel as the only difference.
        for (const b of withBosses(bosses, 'Neutral')) {
            const sc = name => scoreTeamForBoss(
                scoreForTeamString(`${name}/Miyabi/Astra`, roster)[0].team, b, {});
            const polarity = sc('Nangong Frost'), none = sc('Nangong Frost Nopol');
            assert(polarity > 0 && none > 0,
                `both fixtures must be legal teams, got ${polarity} / ${none}`);
            assert(polarity > none,
                `${b.name}: forced polarity is Miyabi's only possible disorder source here (${polarity.toFixed(1)}) and must beat having none at all (${none.toFixed(1)}) — equal scores mean polarity has stopped feeding the aggregate supply`);
        }
    });

    // TEST 17: a disorder is a TEAM event — any source satisfies any consumer
    // The needs side used to satisfy a `disorders` need only from the consumer's own reaction or
    // a teammate's `utility.disorders`, so a consumer that was not itself half of the cycling
    // pair read as unmet on a team swimming in disorders. See
    // ../notes/lessons-learned.md#disorder-supply-was-never-measured. Latent on the live roster
    // (both real `scaling.disorders` units are anomaly agents), hence the synthetic consumer.
    run('TEST 17: a non-anomaly disorder consumer is credited for teammates cycling without it', () => {
        const nicole = allUnits.find(u => u.id === 'nicole');
        assert(nicole && !nicole.tags.includes('anomaly') && !nicole.mechanics?.pseudoRole,
            'fixture assumption broken: Nicole should be a plain non-anomaly support');
        for (const id of ['miyabi', 'vivian']) {
            const u = allUnits.find(x => x.id === id);
            assert(!u.mechanics?.utility?.disorders,
                `fixture assumption broken: ${id} must not supply utility.disorders`);
        }
        const mk = (id, name, withNeed) => {
            const c = JSON.parse(JSON.stringify(nicole));
            c.id = id; c.name = name;
            c.mechanics.scaling = c.mechanics.scaling || {};
            if (withNeed) c.mechanics.scaling.disorders = 2;
            return c;
        };
        const needy = mk('nicole-needy', 'Nicole Needy', true);
        const plain = mk('nicole-plain', 'Nicole Plain', false);
        const roster = [...allUnits, needy, plain];
        for (const b of withBosses(bosses, 'Fiend')) {
            const sc = name => scoreTeamForBoss(
                scoreForTeamString(`Miyabi/Vivian/${name}`, roster)[0].team, b, {});
            const needyScore = sc('Nicole Needy'), plainScore = sc('Nicole Plain');
            assert(needyScore > 0 && plainScore > 0,
                `both fixtures must be legal teams, got ${needyScore} / ${plainScore}`);
            // The need is plainly supplied here, so declaring it must be a bonus over
            // declaring nothing. Before the fix it was a cohesion PENALTY and this went red.
            assert(needyScore > plainScore,
                `${b.name}: a disorder need met by two cycling teammates (${needyScore.toFixed(1)}) must beat declaring no need at all (${plainScore.toFixed(1)}) — a lower score means the consumer is charged for a need the team fills`);
        }
    });

    // TEST 18: elemental variants disorder with their own base element
    // A variant tracks a SEPARATE anomaly gauge, so Miyabi's frost genuinely reacts with plain
    // ice (documented on Soukaku's own entry). Two detectors disagreed and the live one compared
    // BASE elements, reading frost and ice as identical and zeroing Miyabi/Soukaku and
    // Miyabi/Promeia disorders entirely — the largest single mover in
    // ../notes/lessons-learned.md#disorder-supply-was-never-measured.
    //
    // Control differs in exactly one field: a Soukaku clone handed Miyabi's own frost variant,
    // which genuinely should NOT disorder with her.
    run('TEST 18: an elemental variant disorders with its base element (Miyabi/Soukaku)', () => {
        const miyabi = allUnits.find(u => u.id === 'miyabi');
        const soukaku = allUnits.find(u => u.id === 'soukaku');
        assert(miyabi?.mechanics?.elementalVariant === 'frost',
            'fixture assumption broken: Miyabi should carry elementalVariant frost');
        assert(soukaku && !soukaku.mechanics?.elementalVariant,
            'fixture assumption broken: Soukaku should carry no elementalVariant');
        const twin = JSON.parse(JSON.stringify(soukaku));
        twin.id = 'soukaku-frost'; twin.name = 'Soukaku Frost';
        twin.mechanics.elementalVariant = 'frost';
        const roster = [...allUnits, twin];
        for (const b of withBosses(bosses, 'Fiend')) {
            const sc = name => scoreTeamForBoss(
                scoreForTeamString(`Miyabi/${name}/Yuzuha`, roster)[0].team, b, {});
            const plainIce = sc('Soukaku'), sameVariant = sc('Soukaku Frost');
            assert(plainIce > 0 && sameVariant > 0,
                `both fixtures must be legal teams, got ${plainIce} / ${sameVariant}`);
            assert(plainIce > sameVariant,
                `${b.name}: plain-ice Soukaku disorders with frost Miyabi (${plainIce.toFixed(1)}) where a frost twin cannot (${sameVariant.toFixed(1)}) — equal scores mean variants are compared on base element again`);
        }
    });

    // TEST 19: an anomaly PROC source reacts even without an anomaly role
    // MUTATION TEST. Reaction partners used to be enumerated as anomaly-ROLE agents only, so a
    // `utility["anomaly:<element>"]` proc supplier without the role contributed nothing — see
    // ../notes/lessons-learned.md#disorder-supply-was-never-measured. Latent today (Alice is the
    // only holder, and her own element already supplies as an agent), hence the synthetic
    // enabler.
    run('TEST 19: a non-anomaly unit with utility[anomaly:<el>] completes a reaction', () => {
        const nicole = allUnits.find(u => u.id === 'nicole');
        assert(nicole && !nicole.tags.includes('anomaly') && !nicole.mechanics?.pseudoRole,
            'fixture assumption broken: Nicole should be a plain non-anomaly support');
        const mk = (id, name, withProcs) => {
            const c = JSON.parse(JSON.stringify(nicole));
            c.id = id; c.name = name;
            c.mechanics.utility = c.mechanics.utility || {};
            // Fire: an element nobody else on the fixture team supplies, so this annotation is
            // the ONLY thing physical Alice could possibly react with.
            if (withProcs) c.mechanics.utility['anomaly:fire'] = 2;
            return c;
        };
        const enabler = mk('nicole-procs', 'Nicole Enabler', true);
        const inert = mk('nicole-inert', 'Nicole Inert', false);
        const roster = [...allUnits, enabler, inert];
        for (const b of withBosses(bosses, 'Neutral')) {
            const sc = name => scoreTeamForBoss(
                scoreForTeamString(`Alice/${name}/Astra`, roster)[0].team, b, {});
            const withProcs = sc('Nicole Enabler'), without = sc('Nicole Inert');
            assert(withProcs > 0 && without > 0,
                `both fixtures must be legal teams, got ${withProcs} / ${without}`);
            assert(withProcs > without,
                `${b.name}: physical Alice disorders with a teammate's fire procs (${withProcs.toFixed(1)}) and has nothing to react with otherwise (${without.toFixed(1)}) — equal scores mean proc sources are still gated on holding an anomaly role`);
        }
    });

    // TEST 20: the two disorder supply curves have the shapes they claim
    // Pure arithmetic, asserted directly rather than through scores — a score-level test cannot
    // reach a team supply of 7 to prove the hard cap, and these are the properties the whole
    // model rests on. The two curves are DELIBERATELY different shapes; a future reader tempted
    // to unify them should find this red.
    run('TEST 20: disorder supply curves — consumer diminishes forever, boss weakness hard-caps', () => {
        // --- consumer side: full credit to the need, then unbounded but strictly diminishing ---
        for (const need of [2, 3]) {
            assert(effectiveDisorderSupply(need, need) === need,
                `E_need must be identity at the need (need=${need})`);
            assert(effectiveDisorderSupply(need - 1, need) === need - 1,
                `E_need must be identity below the need (need=${need})`);
            let prev = effectiveDisorderSupply(need, need);
            let prevStep = Infinity;
            for (let s = need + 1; s <= need + 12; s++) {
                const cur = effectiveDisorderSupply(s, need);
                const step = cur - prev;
                assert(step > 0,
                    `need=${need}: surplus must always be worth something (supply ${s} earned no more than ${s - 1})`);
                assert(step < prevStep,
                    `need=${need}: each extra point of surplus must be worth strictly less than the last (supply ${s})`);
                prev = cur; prevStep = step;
            }
            // Smooth join: the derivative at the need is 1, so there is no cliff of the kind the
            // old flat UNDERSUPPLY_FACTOR step produced.
            const h = 1e-6;
            const slope = (effectiveDisorderSupply(need + h, need) - need) / h;
            assert(Math.abs(slope - 1) < 1e-3,
                `need=${need}: E_need must join the linear part smoothly, got slope ${slope.toFixed(4)}`);
            // Unbounded: a truly absurd supply still earns more, just barely.
            assert(effectiveDisorderSupply(1000, need) > effectiveDisorderSupply(100, need),
                `need=${need}: E_need must stay unbounded — extreme play is still worth something`);
        }

        // --- boss weakness: hard cap, sixth source earns nothing ---
        assert(effectiveDisorderWeakSupply(3) === 3, 'E_weak identity up to the reference weight');
        assert(effectiveDisorderWeakSupply(4) > effectiveDisorderWeakSupply(3),
            'E_weak must still reward the 4th source');
        assert(effectiveDisorderWeakSupply(5) > effectiveDisorderWeakSupply(4),
            'E_weak must still reward the 5th source');
        const cap = effectiveDisorderWeakSupply(5);
        for (const s of [6, 7, 9, 20]) {
            assert(effectiveDisorderWeakSupply(s) === cap,
                `E_weak must hard-cap at 5 sources: supply ${s} earned ${effectiveDisorderWeakSupply(s)}, expected ${cap}`);
        }
        // The two shapes must not be collapsed into one.
        assert(effectiveDisorderSupply(20, 3) > effectiveDisorderSupply(6, 3),
            'the consumer curve must NOT hard-cap the way the boss-weakness curve does');
    });

    // TEST 21: Lighter's two element buffs are a menu, not two separate offerings
    // Lighter buffs fire AND ice so one of them matches whatever the team runs — he is the only
    // unit with more than one element buff. See [COH-02] for the menu rule cohesion applies.
    // Layer 4 has its own version: no penalty for an arm with no target, full credit for every
    // arm that lands, one penalty only when NOTHING lands. "Two arms landing beats one" is paid
    // by L4 per landing pair, NOT by cohesion — cohesion reads 100% in both cases, since all
    // usable kit is being used. Both halves are asserted here since the final score alone can't
    // tell them apart.
    run('TEST 21: Lighter element buffs are a menu — dead arms are not charged, live arms are paid', () => {
        const boss = withBosses(bosses, 'Butcher')[0];
        const scoreOf = (spec, roster = allUnits) => {
            const parsed = scoreForTeamString(spec, roster);
            assert(parsed.length === 1, `fixture ${spec} did not resolve to exactly one team`);
            return scoreTeamForBoss(parsed[0].team, boss, {});
        };
        const l4Element = (teamSpec) => {
            // Count what LAYER 4 pays Lighter for element buffs, by reading the debug trace.
            const lines = [];
            const parsed = scoreForTeamString(teamSpec, allUnits);
            assert(parsed.length === 1, `fixture ${teamSpec} did not resolve to exactly one team`);
            const realLog = console.log;
            console.log = (...a) => lines.push(a.join(' '));
            try { scoreTeamForBoss(parsed[0].team, boss, { debug: true }); }
            finally { console.log = realLog; }
            let total = 0;
            let inLighterPair = false;
            for (const line of lines) {
                const pair = /^\s{6}(\S[^→]*?) → /.exec(line);
                if (pair) inLighterPair = pair[1].trim() === 'Lighter';
                const m = /element-buff\((\w+)\):\s*([\d.]+)/.exec(line);
                if (m && inLighterPair) total += parseFloat(m[2]);
            }
            return total;
        };

        // Burnice is fire, Promeia is ice: BOTH arms land.
        const both = l4Element('Lighter/Burnice/Promeia');
        // Evelyn is fire, Astra is ether: only the fire arm lands.
        const one = l4Element('Lighter/Evelyn/Astra');
        // Harumasa is electric, Astra is ether: neither arm lands.
        const none = l4Element('Lighter/Harumasa/Astra');

        assert(both > one,
            `two landing element arms must pay more than one: both=${both}, one=${one}`);
        assert(one > none,
            `one landing element arm must pay more than none: one=${one}, none=${none}`);
        assert(none === 0,
            `an element menu that matches nobody must pay nothing, got ${none}`);

        // The cohesion side. Asserted directly against the rule rather than through a team's
        // score, because it CANNOT be observed through a score today: the absolute-supply
        // threshold in computeBuffUtilization pins Lighter's utilization at 100% whether his
        // dead arm is charged or not. A score-level assertion here passes with the mechanism
        // reverted, which is worse than no test at all — it was tried.
        const lighterMenu = [['fire', 2], ['ice', 2]];
        const unit = (name) => {
            const u = allUnits.find(x => x.name === name);
            assert(u, `fixture unit ${name} not found`);
            return u;
        };
        const charged = (...names) =>
            chargeableElementArms(lighterMenu, names.map(unit)).map(a => a.key).sort().join('+');

        // Burnice fire + Promeia ice: both arms have a target, both are charged and credited.
        assert(charged('Burnice', 'Promeia') === 'fire+ice',
            `both arms land, both must be charged — got ${charged('Burnice', 'Promeia')}`);
        // Evelyn fire + Astra ether: only fire lands. The ice arm must not be charged at all.
        assert(charged('Evelyn', 'Astra') === 'fire',
            `only the fire arm lands, so only fire may be charged — got ${charged('Evelyn', 'Astra')}`);
        // Miyabi ice + Piper physical: only ice lands.
        assert(charged('Miyabi', 'Piper') === 'ice',
            `only the ice arm lands, so only ice may be charged — got ${charged('Miyabi', 'Piper')}`);
        // Harumasa electric + Astra ether: nothing on the menu matches. That IS a mismatch and
        // is still charged — but ONCE, not once per arm.
        const dead = chargeableElementArms(lighterMenu, ['Harumasa', 'Astra'].map(unit));
        assert(dead.length === 1,
            `a menu matching nobody must be charged once, not once per arm — got ${dead.length}`);
        assert(dead[0].rel === 0,
            `the dead arm must be charged at zero relevance, got ${dead[0].rel}`);

        // A single-element unit must behave exactly as it does today: Soukaku's lone ice buff
        // is charged whether it lands or not, so an unmatched one still costs her
        // (test-rankings.mjs TEST 18).
        const soukakuMenu = [['ice', 3]];
        const sLands = chargeableElementArms(soukakuMenu, ['Miyabi', 'Vivian'].map(unit));
        assert(sLands.length === 1 && sLands[0].rel > 0,
            'Soukaku ice into an ice carry: one arm, charged, landing');
        const sMisses = chargeableElementArms(soukakuMenu, ['Ye Shunguong', 'Zhao'].map(unit));
        assert(sMisses.length === 1 && sMisses[0].rel === 0,
            'Soukaku ice into a team that cannot use it: still charged, at zero — a real ' +
            'mismatch that must keep costing her');
    });

    // TEST 22: a quick assist is a small benefit that always lands
    // Every unit benefits from a quick assist; a few (Anton) declare a real need and get more
    // out of it. So offering quick assists is never a mismatch — a support must never be
    // recorded as wasting kit on the thing every carry happily uses.
    //
    // Asserted against the rule rather than through a score: computeBuffUtilization's
    // absolute-supply threshold pins these suppliers at 100% either way, so a score-level
    // assertion would pass even with the mechanism reverted.
    run('TEST 22: quick assists are small, always land, and pay more to a declared need', () => {
        const unit = (name) => {
            const u = allUnits.find(x => x.name === name);
            assert(u, `fixture unit ${name} not found`);
            return u;
        };
        // A carry with no declared quick-assist need. Astra offers `quick-assists: 3`.
        const ordinary = ['Nangong', 'Aria'].map(unit);
        const w3 = quickAssistCohesionWeight(3, ordinary);

        // It lands. The caller adds this SAME number to both the charged and the credited
        // side, so there is no shortfall to hold against the provider — that is the whole fix.
        // What is asserted here is that the number is small and strictly positive.
        assert(w3 > 0, 'a quick assist must be worth something to everyone, got 0');
        assert(w3 < 3, `a quick assist must be SMALL — weight 3 charged at ${w3}, the full annotation`);
        assert(Math.abs(w3 - 0.75) < 1e-9,
            `weight 3 at the standard 0.25 benefit should charge 0.75, got ${w3}`);

        // Linear in the annotation: offering more quick assists is worth proportionally more.
        assert(Math.abs(quickAssistCohesionWeight(1, ordinary) * 3 - w3) < 1e-9,
            'quick-assist weight must scale linearly with the annotation');

        // Anton declares `scaling.quick-assists`, so a provider is worth strictly more with
        // him on the team. This is the half a naive "always charge the small floor" fix loses.
        const withAnton = [unit('Anton'), unit('Seed')];
        const wAnton = quickAssistCohesionWeight(3, withAnton);
        assert(wAnton > w3,
            `Anton declares a real quick-assist need, so a provider must be worth more to him: ` +
            `${wAnton} vs ${w3} for a carry with no declared need`);

        // A team with no DPS at all still benefits — every unit takes the standard bonus.
        const noDPS = ['Lucy', 'Seth'].map(unit);
        assert(quickAssistCohesionWeight(3, noDPS) > 0,
            'every unit in the game benefits from a quick assist, including non-DPS');

    });

    // TEST 23: damage.basic is inherited from role, overridable, and never burst
    run('TEST 23: damage.basic inheritance — role baseline, max across roles, out of burst', () => {
        const unit = (name) => {
            const u = allUnits.find(x => x.name === name);
            assert(u, `fixture unit ${name} not found`);
            return u;
        };
        const base = (name) => getBasicDamageBaseline(unit(name));
        const basic = (name) => getBasicDamage(unit(name));

        // The role table.
        for (const name of ['Miyabi', 'Evelyn', 'Yixuan', 'Claret']) {
            assert(base(name) === 3, `${name} holds a DPS role and must inherit basic 3, got ${base(name)}`);
        }
        for (const name of ['Qingyi', 'Lycaon', 'Dialyn']) {
            assert(base(name) === 2, `${name} is a stunner and must inherit basic 2, got ${base(name)}`);
        }
        for (const name of ['Ben', 'Seth', 'Zhao', 'Pan Yinhu']) {
            assert(base(name) === 1, `${name} is a defence agent and must inherit basic 1, got ${base(name)}`);
        }
        for (const name of ['Astra', 'Lucy', 'Nicole', 'Rina']) {
            assert(base(name) === 0, `${name} is a plain support and must inherit basic 0, got ${base(name)}`);
        }

        // Max across roles, not first match: Caesar is tagged defence (1) and carries a
        // pseudo-stun role (2), so he must read 2.
        assert(base('Caesar') === 2,
            `Caesar is defence-tagged with a pseudo-stun role, so max-across-roles gives 2, got ${base('Caesar')}`);
        // subdps counts as a DPS role even when the unit's tag says otherwise.
        assert(base('Norma') === 3,
            `Norma is tagged stun but plays subdps, so she must read 3, got ${base('Norma')}`);

        // The overrides, and the whole point of the key: Sunna and Yuzuha deal real damage
        // where a support is assumed to deal none, and Astra genuinely deals none.
        assert(basic('Sunna') === 1 && base('Sunna') === 0,
            `Sunna must override her support baseline of 0 to 1, got ${basic('Sunna')} over ${base('Sunna')}`);
        assert(basic('Yuzuha') === 1 && base('Yuzuha') === 0,
            `Yuzuha must override her support baseline of 0 to 1, got ${basic('Yuzuha')} over ${base('Yuzuha')}`);
        assert(basic('Astra') === 0,
            `Astra deals no damage of her own and must stay at 0, got ${basic('Astra')}`);

        // Resolved against EFFECTIVE roles, so it is a property of the unit ON THIS TEAM.
        // Nangong reads 3 beside an anomaly agent (his pseudo-anomaly role activates) and 2 on
        // a team without one. A static number in units.json would lose this.
        const nangong = { ...unit('Nangong'), _activatedRoles: ['stun', 'anomaly'] };
        const nangongAlone = { ...unit('Nangong'), _activatedRoles: ['stun'] };
        assert(getBasicDamageBaseline(nangong) === 3,
            `Nangong with his anomaly role active must read 3, got ${getBasicDamageBaseline(nangong)}`);
        assert(getBasicDamageBaseline(nangongAlone) === 2,
            `Nangong as a pure stunner must read 2, got ${getBasicDamageBaseline(nangongAlone)}`);

        // basic must NEVER reach burst throughput. Sunna's damage accrues off-field while
        // someone else is on screen; feeding it into the burst channel would make her contend
        // for a stun window she does not use, which is phase 5's concern and would be wrong.
        assert(getMaxBurstWeight(unit('Sunna')) === 0,
            `basic must stay out of burst throughput; Sunna reads ${getMaxBurstWeight(unit('Sunna'))}`);
    });

    // TEST 24: two greedy carries cannot both own the stun window
    // Remielle cannot fire her double ultimate while Miyabi runs enhanced -> ultimate ->
    // enhanced. `scaling.greedy` measures how much of the window a unit needs to ITSELF — about
    // execution difficulty, not damage: Miyabi's enhanced attacks run twice as long as Promeia's
    // and need disorder fuel timed into the window, while Aria's are quick. Measuring by burst
    // size instead would penalise Aria and Promeia, two of Remielle's BEST partners.
    //
    // Only greed ABOVE 1 contends — that is the property most worth guarding: the penalty must
    // reach dual-greedy teams and nothing else.
    run('TEST 24: two greedy carries contend for the stun window; one greedy carry does not', () => {
        const boss = withBosses(bosses, 'Neutral')[0];
        const scoreOf = (spec) => {
            const parsed = scoreForTeamString(spec, allUnits);
            assert(parsed.length === 1, `fixture ${spec} did not resolve to exactly one team`);
            return scoreTeamForBoss(parsed[0].team, boss, {});
        };
        const greedOf = (name) => {
            const u = allUnits.find(x => x.name === name);
            assert(u, `fixture unit ${name} not found`);
            return u.mechanics?.scaling?.greedy ?? 0;
        };

        // The annotation itself, so a silent data edit is caught here rather than as a mystery
        // score movement later.
        for (const [name, want] of [['Yixuan', 3], ['Remielle', 3], ['Miyabi', 3], ['Evelyn', 3]]) {
            assert(greedOf(name) === want,
                `${name} needs the stun window to itself and must be greedy ${want}, got ${greedOf(name)}`);
        }
        for (const name of ['Aria', 'Promeia', 'Alice', 'Sigrid', 'Harumasa']) {
            assert(greedOf(name) === 1,
                `${name} has a real enhanced-attack rotation but a quick one, so greedy 1, got ${greedOf(name)}`);
        }
        for (const name of ['Nangong', 'Velina', 'Yuzuha', 'Vivian', 'Burnice']) {
            assert(greedOf(name) === 0,
                `${name} does not compete for the burst window and must be greedy 0, got ${greedOf(name)}`);
        }

        // Remielle's own best teams pair her with a greedy-1 partner and must be UNTOUCHED by
        // burst contention. This is the sharpest check in the phase: a rule that penalised
        // these would be wrong even if it fixed everything else.
        //
        // ASSERTED ON THE CONTENTION TERM ITSELF, not on absolute scores — those are not on any
        // effectiveness scale and moved on nearly every engine change for unrelated reasons. See
        // ../notes/lessons-learned.md#the-rankings-pass--what-a-green-suite-was-hiding. Alice's
        // position in the playtested ladder is a known-open item, so this deliberately does NOT
        // pin it.
        const contentionOf = (spec) => {
            const parsed = scoreForTeamString(spec, allUnits);
            assert(parsed.length === 1, `fixture ${spec} did not resolve to exactly one team`);
            const trace = {};
            scoreTeamForBoss(parsed[0].team, boss, { trace });
            return trace.contention;
        };
        for (const spec of ['Promeia/Remielle/Velina', 'Burnice/Remielle/Velina',
                            'Aria/Remielle/Velina', 'Alice/Remielle/Velina']) {
            assert(contentionOf(spec) === 0,
                `${spec} pairs Remielle with a greedy-1 partner and must take NO burst ` +
                `contention charge, got ${contentionOf(spec)}`);
        }
        // Anti-vacuity: the charge must actually reach a dual-greedy team, or the loop above
        // is asserting that a dead rule is dead.
        const contendedCharge = contentionOf('Miyabi/Remielle/Vivian');
        assert(contendedCharge < 0,
            `Miyabi beside Remielle is two greedy-3 carries and must be charged for burst ` +
            `contention, got ${contendedCharge}`);

        // Miyabi beside Remielle is two greedy carries, and must cost.
        const contended = scoreOf('Miyabi/Remielle/Vivian');
        const uncontended = scoreOf('Miyabi/Vivian/Yuzuha');
        assert(contended > uncontended,
            `Miyabi/Remielle/Vivian should still beat Miyabi/Vivian/Yuzuha — the owner rates it ` +
            `slightly better — got ${contended.toFixed(1)} vs ${uncontended.toFixed(1)}`);
        const best = scoreOf('Nangong/Miyabi/Yuzuha');
        assert(best > contended,
            `Nangong/Miyabi/Yuzuha is Miyabi's best team and must outrank Miyabi/Remielle/Vivian: ` +
            `${best.toFixed(1)} vs ${contended.toFixed(1)}`);

        // NOT COVERED, deliberately: the penalty SCALES with the greed values, but every
        // contender on the current roster is annotated 3, so every clash is 3+3 and no fixture
        // can distinguish scaling from a flat charge. This becomes testable when a greedy-2 unit
        // exists; until then the scaling is unverified by design, not by oversight.
    });

    // TEST 25: a greedy carry gets more out of a shortened enemy recovery
    // The other half of `scaling.greedy`, and the reverse of TEST 24's penalty. Most carries
    // have plenty of time to land their burst inside a normal stun window, so a recovery debuff
    // is a modest bonus. A GREEDY carry is the one that was actually running out of window, and
    // extending it lets them land damage they otherwise could not.
    //
    // The case: Lighter and Trigger both raise Evelyn's stun multiplier, but only Lighter
    // shortens the enemy's recovery — and Evelyn is greedy 3 and the one carry who declares
    // `scaling.recovery` outright.
    run('TEST 25: a recovery debuff is worth more to a greedy carry than to an ordinary one', () => {
        const boss = withBosses(bosses, 'Neutral')[0];
        const scoreOf = (spec) => {
            const parsed = scoreForTeamString(spec, allUnits);
            assert(parsed.length === 1, `fixture ${spec} did not resolve to exactly one team`);
            return scoreTeamForBoss(parsed[0].team, boss, {});
        };

        // Lighter (recovery 3) must beat Trigger (no recovery debuff) as Evelyn's stunner.
        const lighter = scoreOf('Lighter/Evelyn/Astra');
        const trigger = scoreOf('Trigger/Evelyn/Astra');
        assert(lighter > trigger,
            `Evelyn is greedy and wants the longer window Lighter's recovery debuff buys her, ` +
            `so Lighter/Evelyn/Astra must beat Trigger/Evelyn/Astra: ` +
            `${lighter.toFixed(1)} vs ${trigger.toFixed(1)}`);

        // But Dialyn keeps the top slot — free ultimates plus his own recovery debuff.
        const dialyn = scoreOf('Dialyn/Evelyn/Astra');
        assert(dialyn > lighter,
            `Dialyn still outclasses Lighter for Evelyn on a neutral boss: ` +
            `${dialyn.toFixed(1)} vs ${lighter.toFixed(1)}`);

        // The bonus is GATED at greed 2: a greedy-1 rotation is quick enough already, so more
        // window is gravy rather than a multiplier. Asserted behaviourally by promoting a
        // greedy-1 carry past the gate and checking the score responds — a fixture assertion on
        // the annotation alone passes with the gate deleted, which was tried and caught here.
        const greedOf = (name) => allUnits.find(u => u.name === name)?.mechanics?.scaling?.greedy ?? 0;
        assert(greedOf('Sigrid') === 1, 'fixture intent: Sigrid sits below the gate');
        const scoreWith = (roster) => {
            const parsed = scoreForTeamString('Lighter/Sigrid/Astra', roster);
            return scoreTeamForBoss(parsed[0].team, boss, {});
        };
        const withGreed = (g) => allUnits.map(u => u.name !== 'Sigrid' ? u : ({
            ...u, mechanics: { ...u.mechanics, scaling: { ...u.mechanics.scaling, greedy: g } }
        }));
        const atZero = scoreWith(withGreed(0));
        const atOne = scoreWith(allUnits);          // her real value, below the gate
        const atThree = scoreWith(withGreed(3));
        // BELOW the gate, greed must make no difference at all — this is the half that a
        // "does greed matter" assertion misses, and deleting the gate passes that one.
        assert(Math.abs(atOne - atZero) < 1e-9,
            `greed 1 is below the gate and must score identically to greed 0: ` +
            `${atOne.toFixed(2)} vs ${atZero.toFixed(2)}`);
        // ABOVE it, greed must pay.
        assert(atThree > atOne,
            `promoting Sigrid past the gate must raise Lighter/Sigrid/Astra: ` +
            `${atOne.toFixed(1)} at greed 1, ${atThree.toFixed(1)} at greed 3`);
    });

    // TEST 26: the stunless carve-out is role-agnostic
    // Pins that `classifyTeamStructure`'s stunless exemption applies regardless of role — it
    // used to live inside the attacker branch only, so a stunless rupture/armorer carry would
    // have been charged a no-stunner tier for a window it never wanted. Latent when found (Ye
    // Shunguong is the only stunless unit and she is attack), so this synthesises the case. See
    // ../notes/lessons-learned.md#reviewing-the-code-found-a-bug-the-corpus-could-not.
    //
    // Anomaly is excluded from the carve-out: it has no no-stun tier to be exempt from.
    // Asserted on the STRUCTURE KEY via the trace, not the score, since declaring a carry
    // stunless also zeroes its baseline and gates the recovery debuff — so the score moves for
    // several reasons and only the tier is under test.
    run('TEST 26: a stunless rupture carry is not charged a no-stunner tier', () => {
        const boss = withBosses(bosses, 'Priest').find(Boolean);
        const find = (n) => {
            const u = allUnits.find(x => x.name === n);
            assert(u, `fixture unit ${n} not found`);
            return u;
        };
        const yixuan = find('Yixuan'), pan = find('Pan Yinhu'), lucia = find('Lucia');
        const structureOf = (team) => {
            const trace = {};
            scoreTeamForBoss(team, boss, { trace });
            return trace.structure;
        };
        // Supports that actually FIT a rupture carry, so the support-fit downgrade does not
        // fire and mask the tier — `Yixuan/Lucia/Nicole` would read UNCONVENTIONAL_VIABLE for
        // that unrelated reason.
        const plain = structureOf([yixuan, pan, lucia]);
        assert(plain === -2,
            `rupture + double support with no stunner must classify NO_STUN_RUPTURE (-2), got ${plain}`);

        const stunlessYixuan = {
            ...yixuan,
            mechanics: {
                ...yixuan.mechanics,
                utility: { ...(yixuan.mechanics?.utility || {}), stunless: true },
            },
        };
        const exempt = structureOf([stunlessYixuan, pan, lucia]);
        assert(exempt === 35,
            `a STUNLESS rupture carry does not need the window, so the same shape must classify ` +
            `CONVENTIONAL (35), got ${exempt}`);
    });

    // TEST 27: a chain BUFF is not a chain PROVISION
    // Pins scoreBaselineAffinity's chain-buff pricing: it scales with the consumer's chain
    // MAGNITUDE (getChainMagnitude), not with a `chains` need. Koleda is the only unit that
    // declares `buffs.chains`. See [BUFF-03].
    //
    // Measured on the NEUTRAL boss on purpose: the L4 element modifier multiplies the pair total,
    // so on a real boss these deltas come out scaled and the Evelyn/Billy ordering inverts for a
    // reason that has nothing to do with chains.
    run('TEST 27: a chain buff scales with chain magnitude, not with a chains need', () => {
        const boss = withBosses(bosses, 'Neutral').find(Boolean);
        assert(boss, 'synthetic neutral boss not found');
        const find = (n) => {
            const u = allUnits.find(x => x.name === n);
            assert(u, `fixture unit ${n} not found`);
            return u;
        };
        const koleda = find('Koleda'), lucia = find('Lucia');
        assert(koleda.mechanics?.buffs?.chains,
            'Koleda must still declare `buffs.chains` — this test has no subject without it');

        // Same unit with the chain buff removed, so the delta IS the chain buff.
        const noBuff = {
            ...koleda,
            mechanics: {
                ...koleda.mechanics,
                buffs: Object.fromEntries(
                    Object.entries(koleda.mechanics.buffs).filter(([k]) => k !== 'chains')),
            },
        };
        const l4rawOf = (team) => {
            const trace = {};
            const score = scoreTeamForBoss(team, boss, { trace });
            assert(score > 0, `fixture team scored ${score} — pick a legal, viable team`);
            return trace.l4raw;
        };
        const chainBuffValue = (consumer) =>
            l4rawOf([koleda, consumer, lucia]) - l4rawOf([noBuff, consumer, lucia]);

        // Yixuan declares NO chain damage and NO chains need, so he is the "every DPS" case.
        const yixuan = find('Yixuan');
        const plain = chainBuffValue(yixuan);
        assert(plain > 0,
            `a chain buff must land on a DPS with no declared chain damage at all, got ${plain.toFixed(2)}`);

        // It scales with how hard the consumer's chains hit.
        const billy = chainBuffValue(find('Starlight Billy'));   // damage.chain: 2
        const evelyn = chainBuffValue(find('Evelyn'));           // damage.chain: 3
        assert(billy > plain,
            `Starlight Billy's chains hit harder than an unannotated carry's, so the buff must be ` +
            `worth more to her: ${billy.toFixed(2)} vs ${plain.toFixed(2)}`);
        assert(evelyn > billy,
            `Evelyn's chains hit hardest, so the buff must be worth most to her: ` +
            `${evelyn.toFixed(2)} vs ${billy.toFixed(2)}`);

        // PURITY: the value is chain magnitude and nothing else. Evelyn declares
        // `scaling.chains: 3` and Yixuan declares none, so if the buff were still feeding the
        // chains NEED channel Evelyn's share would carry an extra ~4.2 and this ratio would come
        // out near 2.85 instead of 1.45. Asserted as a ratio so it does not hardcode the rate.
        const magRatio = getChainMagnitude(find('Evelyn')) / getChainMagnitude(yixuan);
        const valueRatio = evelyn / plain;
        assert(Math.abs(valueRatio - magRatio) < 0.02,
            `the buff must be priced off chain magnitude alone: value ratio ${valueRatio.toFixed(3)} ` +
            `should equal the magnitude ratio ${magRatio.toFixed(3)}. A mismatch means Evelyn's ` +
            `\`scaling.chains\` appetite is leaking back into the buff.`);
    });

    // TEST 28: the vortex tier is the MEAN of the team's non-wind pool, not the MAX — and the
    // "is there a vortex carry here" gate reads a carry's OWN element, not that pool.
    //
    // The game fact: vortex events are gated by the wind agent's cyclones, a limited resource
    // the non-wind agents share. A second non-wind element does not add vortex events, it splits
    // them, so a weak element in the pool dilutes what the wind agent produces. See [VTX-01].
    //
    // Part 1 isolates the pool cleanly. The third slot is a clone of Nicole carrying nothing but
    // `utility["anomaly:<element>"]`, which contributes an element to the pool while holding
    // everything else fixed: she has no anomaly role, so no reaction of her own, and either
    // element is equally a fresh disorder partner for Promeia. The three teams differ ONLY in
    // the tier of the pooled element, and their teamwork multipliers are identical, so the whole
    // delta is vortex.
    //
    // Anti-vacuity: under the old MAX model all three pools read ice's 4.5 and the three l4raw
    // values would be equal. The test cannot pass against that model.
    run('TEST 28: vortex tier pools as a mean, and the vortex-carry gate reads the own element', () => {
        const boss = withBosses(bosses, 'Neutral').find(Boolean);
        assert(boss, 'synthetic neutral boss not found');
        const find = (n) => {
            const u = allUnits.find(x => x.name === n);
            assert(u, `fixture unit ${n} not found`);
            return u;
        };
        const nicole = find('Nicole'), velina = find('Velina'), promeia = find('Promeia');

        // A pure element donor: adds one element to the team's proc pool and nothing else.
        const donor = (el) => ({
            ...nicole,
            name: `${nicole.name}-${el}`,
            mechanics: {
                ...nicole.mechanics,
                utility: { ...(nicole.mechanics?.utility || {}), [`anomaly:${el}`]: 1 },
            },
        });
        const measure = (team) => {
            const trace = {};
            const score = scoreTeamForBoss(team, boss, { trace });
            assert(score > 0, `fixture team scored ${score} — pick a legal, viable team`);
            return trace;
        };

        // Promeia is ice (4.0). Pools: {ice, electric} = 2.5, {ice, fire} = 3.0, {ice} = 4.0.
        const weak = measure([velina, promeia, donor('electric')]);
        const mid  = measure([velina, promeia, donor('fire')]);
        const pure = measure([velina, promeia, nicole]);

        assert(Math.abs(weak.teamwork - mid.teamwork) < 1e-9
            && Math.abs(mid.teamwork - pure.teamwork) < 1e-9,
            `the three fixtures must differ only in the vortex pool, but their teamwork ` +
            `multipliers differ (${weak.teamwork}, ${mid.teamwork}, ${pure.teamwork}) — ` +
            `something other than the pool is moving and the measurement is confounded`);

        assert(weak.l4raw < mid.l4raw,
            `a weaker element in the pool must dilute it: {ice, electric} scored ` +
            `${weak.l4raw.toFixed(1)} but {ice, fire} scored ${mid.l4raw.toFixed(1)}`);
        // "Any second element dilutes a pure pool" is asserted on the POOLED TIER, not on a
        // team score. Comparing a team holding a donor against one without cannot be clean: the
        // donor also brings a fresh disorder partner and an extra proc, so an l4raw comparison
        // measures dilution NET of those. It held only while VORTEX_BASE was big enough for
        // dilution to dominate, which made this assertion a hidden pin on that constant rather
        // than a test of the pooling rule. Read the tier the payout actually used instead.
        const pooledTier = (team, carry) => {
            const realLog = console.log;
            const lines = [];
            console.log = (...a) => lines.push(a.join(' '));
            try { scoreTeamForBoss(team, boss, { debug: true }); }
            finally { console.log = realLog; }
            const marker = `Vortex bonus: ${carry} `;
            const TIER = '(tier ';
            for (const line of lines) {
                const at = line.indexOf(marker);
                if (at < 0) continue;
                const t = line.indexOf(TIER, at);
                if (t < 0) continue;
                return parseFloat(line.slice(t + TIER.length));
            }
            assert(false, `no vortex payout line for ${carry} — fixture is not producing a vortex`);
        };
        const weakTier = pooledTier([velina, promeia, donor('electric')], 'Promeia');
        const midTier  = pooledTier([velina, promeia, donor('fire')], 'Promeia');
        const pureTier = pooledTier([velina, promeia, nicole], 'Promeia');
        assert(weakTier < midTier && midTier < pureTier,
            `the pooled tier must fall as weaker elements join it: {ice} read ${pureTier}, ` +
            `{ice, fire} read ${midTier}, {ice, electric} read ${weakTier}. Under a MAX model ` +
            `all three would read ice's own tier.`);
        assert(Math.abs(pureTier - midTier) > 1e-9,
            `adding ANY second element must dilute a pure pool: {ice} read ${pureTier} and ` +
            `{ice, fire} read ${midTier}. Equal values mean the tier is back to a max.`);

        // Part 2 — [VTX-02]. Nangong/Miyabi/Velina pools ether (2.0) with frost (0.8) for a mean
        // of 1.4, which CLEARS VORTEX_PRIMARY_MIN (1.0). The wasted-vortex cohesion charge must
        // still fire, because it asks whether a carry's OWN element makes vortex worth building
        // around and Miyabi's frost is 0.8. If the gate ever reads the pooled value instead, the
        // charge silently disappears and this team gains roughly 70 points.
        const nmv = measure([find('Nangong'), find('Miyabi'), velina]);
        const npv = measure([find('Nangong'), promeia, velina]);
        assert(nmv.teamwork < npv.teamwork - 0.05,
            `Nangong/Miyabi/Velina (teamwork ${nmv.teamwork.toFixed(3)}) must still take the ` +
            `wasted-vortex charge that Nangong/Promeia/Velina (${npv.teamwork.toFixed(3)}) does ` +
            `not, even though its POOLED tier of 1.4 clears VORTEX_PRIMARY_MIN. Equal multipliers ` +
            `mean the gate is reading the pool instead of the carry's own element.`);
    });

    // TEST 29: a conditional buff can declare that not firing is not a failure.
    //
    // A team-scoped conditional buff is normally charged when it lands below its maximum — the
    // squared-gap penalty. That is right for Remielle and Phoenix, whose conditional buff IS the
    // codependency: a Remielle who is the only anomaly agent has failed at the thing she is for.
    //
    // It is wrong for a generalist support who merely happens to help anomaly teams. `optional`
    // is how the data says so. Both halves are asserted, because a test that only checks the
    // opt-out cannot tell "the flag works" from "the penalty stopped firing entirely". [PRED-01]
    run('TEST 29: an `optional` conditional buff is not charged for failing to fire', () => {
        const boss = withBosses(bosses, 'Neutral').find(Boolean);
        assert(boss, 'synthetic neutral boss not found');
        const find = (n) => {
            const u = allUnits.find(x => x.name === n);
            assert(u, `fixture unit ${n} not found`);
            return u;
        };
        // An attack team with no native anomaly agent, so a countTag-gated buff cannot fire.
        const base = [find('Lighter'), find('Ellen'), find('Astra')];
        const plain = scoreTeamForBoss(base, boss, {});
        assert(plain > 0, `fixture team must be viable, got ${plain}`);

        // Same team, but the support carries a conditional buff whose condition fails.
        const withConditional = (extra) => {
            const astra = base[2];
            const clone = {
                ...astra,
                mechanics: {
                    ...astra.mechanics,
                    buffs: {
                        ...astra.mechanics.buffs,
                        anomaly: { cases: [
                            { when: { countTag: 'anomaly', minCount: 1 }, value: 3 },
                            { value: 0 },
                        ], ...extra },
                    },
                },
            };
            return scoreTeamForBoss([base[0], base[1], clone], boss, {});
        };

        const charged = withConditional({});
        const exempt = withConditional({ optional: true });

        // Half one: without the flag, the unmet conditional costs real points.
        assert(charged < plain - 1,
            `a team-scoped conditional that cannot fire must still be charged: ${charged.toFixed(1)} ` +
            `against ${plain.toFixed(1)} without the buff. Equal scores mean the penalty stopped ` +
            `firing at all and the other half of this test proves nothing.`);

        // Half two: with the flag, it costs nothing — the team scores as if the buff were absent.
        assert(Math.abs(exempt - plain) < 1e-9,
            `an \`optional\` conditional that cannot fire must cost nothing: ${exempt.toFixed(1)} ` +
            `against ${plain.toFixed(1)} without the buff.`);
    });

    // TEST 30: Soukaku promotes to anomaly only when she is BACKFILLING a disorder partner.
    //
    // The game fact: Soukaku is the non-frost ice partner Miyabi disorders with, and she is only
    // played that way when nobody else is doing that job. Beside Vivian or Nangong you are not
    // running her for disorders — you are running her to buff ice and attack. She used to promote
    // beside Miyabi unconditionally, which made an A-rank support a full third carry: Nangong paid
    // her 27.1 where he pays Astra 0, and she outscored Astra behind Nangong/Miyabi by 0.3.
    //
    // The predicate asks whether the OTHER two members disorder with each other, which is what
    // keeps it out of a cycle — Soukaku's own element never enters the answer. It is asked in
    // ELEMENT terms rather than role terms, which is what gets the lumen and wind rows right.
    // [PRED-02]
    run('TEST 30: Soukaku plays anomaly only when nobody else partners Miyabi', () => {
        const boss = withBosses(bosses, 'Butcher').find(Boolean);
        assert(boss, 'Butcher fixture boss not found');

        // Does Soukaku actually react on this team? The disorder line is printed per agent, so
        // its presence IS her promotion — a far more direct read than the score.
        const soukakuReacts = (spec) => {
            const parsed = scoreForTeamString(spec, allUnits, { preview: true })[0];
            assert(parsed, `fixture must parse to a legal team: ${spec}`);
            const real = console.log;
            const lines = [];
            console.log = (...a) => lines.push(a.join(' '));
            try { scoreTeamForBoss(parsed.team, boss, { debug: true }); }
            finally { console.log = real; }
            return lines.some(l => /Implicit disorder: Soukaku/.test(l));
        };

        // BACKFILLING — she is the only disorder partner Miyabi has, so she must promote.
        for (const [spec, why] of [
            ['Miyabi/Soukaku/Yuzuha', 'Yuzuha lands no anomaly at all'],
            ['Miyabi/Remielle/Soukaku', 'Remielle is lumen and procs nothing'],
            ['Miyabi/Velina/Soukaku', 'Velina is wind, so she vortexes rather than disorders'],
        ]) {
            assert(soukakuReacts(spec),
                `${spec}: Soukaku must still play the disorder partner — ${why}. A role COUNT ` +
                `gets these wrong; the predicate has to ask in element terms.`);
        }

        // REDUNDANT — someone else already partners Miyabi, so she stays a support.
        for (const [spec, why] of [
            ['Nangong/Miyabi/Soukaku', 'Nangong promotes to anomaly and covers it'],
            ['Miyabi/Vivian/Soukaku', 'Vivian is a native anomaly agent'],
        ]) {
            assert(!soukakuReacts(spec),
                `${spec}: Soukaku must NOT be promoted — ${why}, so she is being run to buff ` +
                `ice and attack, not to generate disorders.`);
        }

        // The consequence that started this: behind Nangong and Miyabi, Astra must clearly win.
        const score = (spec) => scoreTeamForBoss(
            scoreForTeamString(spec, allUnits, { preview: true })[0].team, boss, {});
        const astra = score('Nangong/Miyabi/Astra'), souk = score('Nangong/Miyabi/Soukaku');
        assert(astra > souk + 20,
            `Astra (${astra.toFixed(1)}) must clearly beat Soukaku (${souk.toFixed(1)}) behind ` +
            `Nangong/Miyabi, where Soukaku is redundant as a disorder partner.`);

        // ...and the backfill case must not be collateral damage.
        const backfill = score('Miyabi/Soukaku/Yuzuha'), noPartner = score('Miyabi/Astra/Yuzuha');
        assert(backfill > noPartner,
            `Miyabi/Soukaku/Yuzuha (${backfill.toFixed(1)}) must beat Miyabi/Astra/Yuzuha ` +
            `(${noPartner.toFixed(1)}) — with no other ice partner, Soukaku's promotion is the ` +
            `whole point of her and must survive this change.`);
    });

    // TEST 31: a buildup buff reaches anomaly agents, and never reaches lumen.
    //
    // `buffs.buildup` buffs how fast anomaly PROCS land. Remielle is lumen: she fills no gauge
    // and procs nothing at all, so there is no rate to raise. She is anomaly-TAGGED, though,
    // which is what let a role check pay her — Velina was handing her 3.2 for a buff she cannot
    // use. Same shape as [LUM-02] on a different key.
    //
    // The other half is the ruling that buildup does NOT scale by how much damage the consumer
    // deals, unlike `atk` in the same function. Owner: buildup defines proc RATE, not damage,
    // and it helps an anomaly teammate alongside Harumasa who only cares about the NUMBER of
    // procs. As long as it lands, it works. Do not re-litigate this. [BUFF-07]
    run('TEST 31: buildup buffs reach anomaly agents but never lumen', () => {
        const boss = withBosses(bosses, 'Neutral').find(Boolean);
        assert(boss, 'synthetic neutral boss not found');
        const find = (n) => {
            const u = allUnits.find(x => x.name === n);
            assert(u, `fixture unit ${n} not found`);
            return u;
        };
        const pairLines = (team, from, to) => {
            const real = console.log;
            const lines = [];
            console.log = (...a) => lines.push(a.join(' '));
            try { scoreTeamForBoss(team, boss, { debug: true }); }
            finally { console.log = real; }
            const start = lines.findIndex(l => l.includes(`${from} → ${to}:`));
            if (start < 0) return [];
            const rest = lines.slice(start + 1);
            const end = rest.findIndex(l => /pair total|→/.test(l));
            return rest.slice(0, end < 0 ? 0 : end);
        };

        // Velina supplies buildup. Aria procs; Remielle does not.
        const team = [find('Aria'), find('Remielle'), find('Velina')];
        const toAria = pairLines(team, 'Velina', 'Aria');
        const toRem = pairLines(team, 'Velina', 'Remielle');

        assert(toAria.some(l => /buildup:/.test(l)),
            `Velina's buildup must reach Aria, who procs anomalies. Lines were: ${JSON.stringify(toAria)}`);
        assert(!toRem.some(l => /buildup:/.test(l)),
            `Velina's buildup must NOT reach Remielle — she is lumen and procs nothing, so there ` +
            `is no rate to buff. Lines were: ${JSON.stringify(toRem)}`);
    });

    // TEST 32: a conjunctive synergy group pays only when the WHOLE group is present
    // `synergy.units` entries joined with "+" require every named unit on the team, and the gating
    // IS the point: a group that paid out on a partial match would be indistinguishable from two
    // single-name declarations and would lift teams nobody asked to lift.
    //
    // Lives here, on a SYNTHETIC clone, because it pins the mechanism rather than any unit's data.
    // It was written twice against live declarations — Alice's "Remielle+Velina", then SAnby's
    // "Trigger+Seed" — and broke both times when that data was removed rather than when the
    // mechanism changed. The live declarations today are the three Angels of Delusion, whose
    // MAGNITUDE is pinned in rankings TEST 94; this test deliberately knows nothing about it.
    //
    // ASSERTS THE GATING, NOT THE AMOUNT. It used to require `>= 55`, which was a hidden pin on
    // `CONJUNCTIVE_SYNERGY_BONUS` — re-deriving that constant to 45 broke this test, which is not
    // a statement about whether conjunctive groups gate correctly. Same failure shape as TEST 28's
    // old hidden pin on `VORTEX_BASE`. The claim here is "all present pays, partial pays nothing".
    run('TEST 32: conjunctive synergy requires the whole group', () => {
        const boss = withBosses(bosses, 'Neutral').find(Boolean);
        assert(boss, 'synthetic neutral boss not found');
        const sanby = allUnits.find(u => u.id === 'sanby');
        assert(sanby, 'fixture unit SAnby not found');
        assert(!(sanby.synergy?.units || []).some(e => typeof e === 'string' && e.includes('+')),
            'fixture assumption broken: SAnby should declare no conjunctive group of her own');

        const clone = JSON.parse(JSON.stringify(sanby));
        clone.id = 'sanby-clone';
        clone.name = 'SAnbyClone';
        clone.synergy = { units: ['Trigger+Seed'], tags: [], avoid: [] };
        const roster = [...allUnits, clone];

        const l5Of = (spec) => {
            const trace = {};
            const parsed = scoreForTeamString(spec, roster);
            assert(parsed.length === 1, `fixture ${spec} did not resolve to one team`);
            scoreTeamForBoss(parsed[0].team, boss, { trace });
            return trace.l5;
        };

        // Whole group present: the clone's group pays SOMETHING. How much is not this test's
        // business — see the header.
        const both = l5Of('Trigger/SAnbyClone/Seed');
        assert(both > 0,
            `with the whole group present the conjunctive bonus must pay: L5 was ${both}`);

        // Only ONE member present: the group pays nothing at all. This is the half that matters —
        // a group paying out on a partial match would be indistinguishable from two single-name
        // declarations, so `both > 0` alone would not tell a working gate from a broken one.
        const onlyTrigger = l5Of('Trigger/SAnbyClone/Astra');
        assert(onlyTrigger === 0,
            `Trigger without Seed must not trigger the clone's group: L5 was ${onlyTrigger}`);
    });

    // TEST 33: `hasRole` counts EFFECTIVE roles, optionally narrowed by element
    // `countTag` could not express "a second electric attacker": it counts a raw tag in a vacuum
    // and understands neither pseudo-roles nor element. Both directions are asserted — a test that
    // only checks the match cannot tell "the element filter works" from "the predicate always
    // passes". Self is counted, matching `countTag`. [PRED-03]
    run('TEST 33: hasRole counts effective roles and honours the element qualifier', () => {
        const boss = withBosses(bosses, 'Neutral').find(Boolean);
        const probe = (when) => {
            const c = JSON.parse(JSON.stringify(allUnits.find(u => u.id === 'cissia')));
            c.id = 'probe';
            c.name = 'Probe';
            c.mechanics.pseudoRole = [{ role: 'subdps', when }];
            return c;
        };
        const structureOf = (spec, unit) => {
            const parsed = scoreForTeamString(spec, [...allUnits, unit]);
            assert(parsed.length === 1, `fixture ${spec} did not resolve to one team`);
            const trace = {};
            scoreTeamForBoss(parsed[0].team, boss, { trace });
            return trace.structure;
        };

        const EL = probe({ hasRole: 'attack:electric', minCount: 2 });
        const ANY = probe({ hasRole: 'attack', minCount: 2 });

        // Beside SAnby (attack, ELECTRIC) both forms agree — the element qualifier is satisfied.
        const elElectric = structureOf('Trigger/Probe/SAnby', EL);
        const anyElectric = structureOf('Trigger/Probe/SAnby', ANY);
        assert(elElectric === anyElectric,
            `beside an electric attacker both forms must agree: ${elElectric} vs ${anyElectric}`);

        // Beside Ellen (attack, ICE) only the unqualified form promotes. Same role, wrong element —
        // exactly the distinction countTag cannot draw.
        const elIce = structureOf('Lycaon/Probe/Ellen', EL);
        const anyIce = structureOf('Lycaon/Probe/Ellen', ANY);
        assert(anyIce !== elIce,
            `"attack" must promote beside an ICE attacker where "attack:electric" does not: ` +
            `qualified ${elIce} vs unqualified ${anyIce}`);
        assert(anyIce === anyElectric,
            `the unqualified form should not care about element: ${anyIce} vs ${anyElectric}`);

        // minCount is real: three electric attackers cannot be met by two, so the role stands down.
        const THREE = probe({ hasRole: 'attack:electric', minCount: 3 });
        const elThree = structureOf('Trigger/Probe/SAnby', THREE);
        assert(elThree !== elElectric,
            `minCount 3 cannot be met by two electric attackers: ${elThree} vs ${elElectric}`);
        assert(elThree === elIce,
            `an unmet hasRole should read the same as a non-matching one: ${elThree} vs ${elIce}`);
    });

    // TEST 34: a `join` with no non-carry option mandates a dual carry
    // Seed joins on "attack" and nothing else, so every legal Seed team holds two attack agents.
    // That displacement — the mandated second carry boxes out the stunner or the support — is what
    // the rule models, and it WAIVES the no-support charge rather than granting anything. Five
    // parts, because a test that only checks the exemption cannot tell "the rule works" from "the
    // tier stopped firing". [PIPE-03]
    run('TEST 34: a join with no non-carry option mandates a dual carry', () => {
        const boss = withBosses(bosses, 'Neutral').find(Boolean);
        const clone = (srcId, id, name, patch) => {
            const c = JSON.parse(JSON.stringify(allUnits.find(u => u.id === srcId)));
            c.id = id;
            c.name = name;
            return Object.assign(c, patch);
        };
        const structureOf = (spec, roster) => {
            const parsed = scoreForTeamString(spec, roster);
            assert(parsed.length === 1, `fixture ${spec} did not resolve to one team`);
            const trace = {};
            scoreTeamForBoss(parsed[0].team, boss, { trace });
            return trace.structure;
        };

        // Ellen joins on stunners and supports: a conventional team exists for her, so pairing two
        // of her kind is a choice, not a mandate.
        const plain = clone('ellen', 'mandate-off', 'MandateOff', {});
        const NO_INTERACTION = structureOf('Lycaon/Ellen/MandateOff', [...allUnits, plain]);

        // (1) the same unit with its join narrowed to "attack" only is mandated, so the second
        //     carry counts as interaction.
        const mandated = clone('ellen', 'mandate-on', 'MandateOn', { join: ['attack'] });
        const MANDATED = structureOf('Lycaon/Ellen/MandateOn', [...allUnits, mandated]);
        assert(MANDATED > NO_INTERACTION,
            `a join offering no non-carry option must lift the team off the no-interaction tier: ` +
            `${MANDATED} vs ${NO_INTERACTION}`);

        // (2) the unmodified pair must NOT be lifted, or the tier has simply stopped firing.
        assert(NO_INTERACTION < 0,
            `two ordinary attack carries must still classify as no-interaction, got ${NO_INTERACTION}`);

        // (3) CROSSING carry class qualifies. An attacker that can only join ruptures is boxed out
        //     exactly as one that can only join attackers; "same role" is too narrow a reading.
        const crossed = clone('ellen', 'mandate-rup', 'MandateRup', { join: ['rupture'] });
        assert(structureOf('Lycaon/Ellen/MandateRup', [...allUnits, crossed]) === MANDATED,
            `an attacker joining only on rupture must qualify like one joining only on attack`);

        // (4) ARMORER does not qualify, even with the same all-carry join. Attack and rupture
        //     assume a solo carry; armorer and anomaly assume a DPS partner already.
        const arm = clone('claret', 'mandate-arm', 'MandateArm', { join: ['attack'] });
        const armPlain = clone('claret', 'mandate-arm2', 'MandateArm2', { join: ['stun', 'support'] });
        const armMandated = structureOf('Lycaon/Ellen/MandateArm', [...allUnits, arm]);
        const armOrdinary = structureOf('Lycaon/Ellen/MandateArm2', [...allUnits, armPlain]);
        assert(armMandated === armOrdinary,
            `an armorer's join must not buy the dual-carry exemption: ${armMandated} vs ${armOrdinary}`);

        // (5) The rule WAIVES a charge, it never GRANTS a tier. Two halves:
        //
        //   (a) the waiver itself — a supportless mandated team keeps the classified tier instead
        //       of being demoted to NO_SUPPORT.
        assert(MANDATED === 0,
            `a mandated team must land on UNCONVENTIONAL_VIABLE, not be demoted to the ` +
            `no-support tier: got ${MANDATED}`);
        //
        //   (b) the ceiling — the mandate never reaches CONVENTIONAL. Note this applies to a
        //       team that ALREADY has a support too, and must: the double-attacker branch accepts
        //       `nSup >= 1`, so if the mandate did not apply there, a Seed team WITH a support
        //       would sit on the 0.6 no-interaction tier while a supportless one sat on 0.85 —
        //       backwards. What a support does buy is the no-support check returning early.
        const supported = structureOf('Ellen/MandateOn/Astra', [...allUnits, mandated]);
        assert(supported === MANDATED,
            `a support must not change the mandated classification: ${supported} vs ${MANDATED}`);
        assert(supported < 35,
            `the mandate must never reach CONVENTIONAL: got ${supported}`);

        // Roster guard: Seed is the only live qualifier. A future unit shipping this join shape
        // should trip a test rather than quietly move thousands of corpus rows.
        const CARRY = ['attack', 'rupture', 'armorer', 'anomaly'];
        const qualifiers = allUnits.filter(u =>
            ['attack', 'rupture'].some(r => u.tags.includes(r)) &&
            Array.isArray(u.join) && u.join.length > 0 && u.join.every(j => CARRY.includes(j)));
        assert(qualifiers.length === 1 && qualifiers[0].id === 'seed',
            `Seed should be the only unit whose join mandates a dual carry, got ` +
            `[${qualifiers.map(u => u.name).join(', ')}]. If that is intended, update this test ` +
            `and re-measure — the rule moves every double-carry team the new unit appears on.`);
    });
    // Summary
    console.log('');

    // Compare the failing set against KNOWN_RED so the exit code distinguishes
    // "still broken exactly as expected" from "something changed".
    const testNumber = name => {
        const m = /^TEST (\d+)/.exec(name);
        return m ? Number(m[1]) : null;
    };
    const failedNums = new Set(failures.map(f => testNumber(f.name)).filter(n => n !== null));
    const filtering = onlyTests.size > 0;

    // Under a -N filter only the listed tests ran, so a KNOWN_RED entry that did not run
    // is not stale — it is simply absent.
    const expectedRed = [...KNOWN_RED.keys()].filter(n => !filtering || onlyTests.has(n));
    const unexpectedFails = failures.filter(f => !KNOWN_RED.has(testNumber(f.name)));
    const staleEntries = expectedRed.filter(n => !failedNums.has(n));

    if (failures.length === 0 && staleEntries.length === 0) {
        console.log('All tests passed.');
        process.exit(0);
    }

    console.log(`${failures.length} test(s) failed.`);

    if (expectedRed.length > 0) {
        const red = failures.filter(f => KNOWN_RED.has(testNumber(f.name)));
        if (red.length > 0) {
            console.log(`\n${red.length} of those are KNOWN_RED (expected):`);
            for (const f of red) {
                console.log(`  - ${f.name.split(':')[0]}: ${KNOWN_RED.get(testNumber(f.name))}`);
            }
        }
    }

    if (staleEntries.length > 0) {
        console.log(`\nSTALE KNOWN_RED: test(s) ${staleEntries.join(', ')} are listed as expected-red but PASSED.`);
        console.log('That is good news, but remove the entry so the list keeps meaning something.');
    }

    if (unexpectedFails.length > 0) {
        console.log(`\n${unexpectedFails.length} UNEXPECTED failure(s):`);
        for (const f of unexpectedFails) console.log(`  - ${f.name}`);
    }

    if (unexpectedFails.length === 0 && staleEntries.length === 0) {
        console.log('\nNo unexpected failures. Exiting 0.');
        process.exit(0);
    }
    process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
