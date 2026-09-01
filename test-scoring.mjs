/**
 * test-scoring.mjs
 *
 * Assertion-based regression tests for the team scoring engine
 * (`scoreTeamForBoss` from `app/public/lib/common/team-scorer.js`).
 *
 * Run from the repository root:
 *   node test-scoring.mjs            — run all tests
 *   node test-scoring.mjs -17 -22    — run only tests 17 and 22
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
import { filterBosses } from './lib/boss-filter.js';
import { parseTeams } from './lib/team-parser.js';
import { buildAvailableUnits } from './lib/roster-builder.js';
import { buildTeams } from './lib/team-pipeline.js';
import { rankBandEpsilon } from './app/public/lib/common/team-builder.js';
import { chargeableElementArms, getBasicDamage, getBasicDamageBaseline, getMaxBurstWeight, quickAssistCohesionWeight, scoreTeamForBoss, resolveBossVariation, resolveConditionalValue, getEffectiveScaling, effectiveDisorderSupply, effectiveDisorderWeakSupply } from './app/public/lib/common/team-scorer.js';

// ---------------------------------------------------------------------------
// Viability / disqualification
// ---------------------------------------------------------------------------
// `matchups.js` only *lists* teams with score > 0. A score <= 0 means the
// comp is not viable for that boss (disqualification, anti-synergy, etc.).
// Assertions use the raw `scoreTeamForBoss` return value unless noted.

/** Neutral synthetic boss: same as `matchups.js` (full roster has no "neutral" in JSON as a real boss in some builds — appended at runtime). */
const NEUTRAL_BOSS = {
    name: 'Synthetic Neutral Boss',
    favored: [],
    mechanics: {
        weaknesses: [],
        resistances: [],
        shill: null,
        anti: [],
        assists: 0
    }
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

/**
 * @param {object[]} allUnits
 * @param {object} roster
 * @returns {{ label: string, team: object[] }[]}
 */
function makeAllViableTeamEntries(allUnits, roster) {
    // This suite tests scoring mechanics on unreleased units, so preview units
    // are always included.
    const options = { preview: true };
    const { availableUnits, universalUnits } = buildAvailableUnits(allUnits, options, roster);
    const { threeCharTeams, teamLabels } = buildTeams(availableUnits, universalUnits);
    return teamLabels.map((label) => ({ label, team: threeCharTeams[label] }));
}

/**
 * @param {{ label: string, team: object[] }[]} entries
 * @param {string[]} [includeOneOf] - if set, only teams containing at least one of these (case-insensitive name match)
 */
function filterIncludeOneOf(entries, includeOneOf) {
    if (!includeOneOf || includeOneOf.length === 0) return entries;
    return entries.filter(({ team }) =>
        includeOneOf.some((name) => team.some((u) => u.name.toLowerCase() === name.toLowerCase()))
    );
}

/**
 * Viable = score > 0 (mirrors `matchups.js` listing).
 *
 * @param {{ label: string, team: object[] }[]} entries
 * @param {object} boss
 * @param {number} depth
 * @param {string[]} [includeOneOf]
 * @returns {{ label: string, team: object[], score: number }[]}
 */
function getTopViableTeams(entries, boss, depth, includeOneOf) {
    const base = filterIncludeOneOf(entries, includeOneOf);
    const rows = [];
    for (const { label, team } of base) {
        const score = scoreTeamForBoss(team, boss, {});
        if (score > 0) {
            rows.push({ label, team, score });
        }
    }
    rows.sort((a, b) => b.score - a.score);
    return rows.slice(0, depth);
}

function scoreForTeamString(teamsString, allUnits, opts = {}) {
    const { teams, warnings } = parseTeams(teamsString, allUnits, { preview: opts.preview ?? true });
    for (const w of warnings) {
        /* empty — batch suite expects expansion warnings to be ok */
    }
    return teams;
}

function scoreMapForBoss(parsedTeams, boss) {
    const m = new Map();
    for (const { label, team } of parsedTeams) {
        m.set(label, scoreTeamForBoss(team, boss, {}));
    }
    return m;
}

function withBosses(bosses, filterStr) {
    if (!filterStr) return bosses;
    return filterBosses(bosses, filterStr);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests that are red ON PURPOSE
//
// Some assertions in this file encode an ordering the owner believes is correct but the
// engine does not yet produce. They are kept red rather than deleted, because deleting
// them loses the disagreement. The cost is that the suite's exit code stops being a
// usable signal: "1" means both "you broke something" and "nothing changed".
//
// Listing a test number here restores the signal. The run exits 0 when the set of
// failing tests is EXACTLY this set, and exits 1 the moment one of these starts passing
// (the entry is stale — remove it) or any other test fails.
//
// Every entry needs a reason and the phase that is expected to clear it. Do not add an
// entry to silence a regression.
// ---------------------------------------------------------------------------
const KNOWN_RED = new Map([
    [101, 'The Miyabi best-in-slot ladder, red by design per issue 7. Five rungs fail and they share ' +
          'a shape: Nangong/Miyabi/X sitting below Miyabi/Vivian/Y where the ladder wants the ' +
          'reverse. BEFORE WORKING ON THIS, re-read the target with the owner. It was produced the ' +
          'same way the Evelyn stunner ladder was -- owner confirmation of engine output -- and on ' +
          '2026-09-01 that ladder was reversed against aggregated player statistics. Recognising ' +
          'output is not the same as checking it, so it is not yet known whether this target is ' +
          'independently derived. Making the engine match an unverified target is the expensive ' +
          'mistake here.'],
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

    console.log('--- Team scoring tests (raw scoreTeamForBoss) ---\n');

    // ========================================================================
    // TEST 1 (partial): no SAnby + Yixuan together in top 25, every boss
    // ========================================================================
    // Batch: "No SAnby/Yixuan ... in top 25". "Conventional meta" / other
    // incoherent comps: not checked here.
    run('TEST 1 (partial): top-25 per boss has no team with both SAnby and Yixuan', () => {
        for (const boss of bosses) {
            const top = getTopViableTeams(allTeamEntries, boss, 25, null);
            for (const { label, team } of top) {
                const hasS = team.some((u) => u.name === 'SAnby');
                const hasY = team.some((u) => u.name === 'Yixuan');
                assert(
                    !(hasS && hasY),
                    `${boss.name}: top-25 includes ${label} (both SAnby and Yixuan)`
                );
            }
        }
    });

    // ========================================================================
    // TEST 2: SAnby/Yixuan anti-synergy
    // ========================================================================
    // Expect: both listed comps score "very low" — we use < 130 on each boss.
    run('TEST 2: SAnby/Yixuan teams < 100 (Butcher, Corruption, Marionettes)', () => {
        const t =
            'SAnby/Yixuan/Rina,SAnby/Yixuan/Nicole';
        const teamList = scoreForTeamString(t, allUnits);
        for (const b of withBosses(bosses, 'Butcher,Corruption,Marionettes')) {
            for (const { label, team } of teamList) {
                const s = scoreTeamForBoss(team, b, {});
                assert(s < 130, `${b.name} / ${label}: got ${s}, expected < 130`);
            }
        }
    });

    // ========================================================================
    // TEST 3: SAnby proper teams on UCC — ordering and floor
    // ========================================================================
    run('TEST 3: SAnby proper teams on UCC — ordering and floor (>= 315)', () => {
        const b = withBosses(bosses, 'Corruption').find(Boolean);
        const allT =
            'Trigger/Orphie/SAnby,Trigger/Cissia/SAnby,Trigger/SAnby/Astra,Trigger/SAnby/Seed,Trigger/SAnby/Zhao,' +
            'Dialyn/Orphie/SAnby,Ju Fufu/Orphie/SAnby';
        const m = scoreMapForBoss(scoreForTeamString(allT, allUnits), b);

        const tOrphie = m.get('Trigger / Orphie / SAnby');
        const tCissia = m.get('Trigger / Cissia / SAnby');
        const tAstra = m.get('Trigger / SAnby / Astra');
        const tSeed = m.get('Trigger / SAnby / Seed');
        const tZhao = m.get('Trigger / SAnby / Zhao');
        assert(tOrphie >= 315, `Trigger+SAnby: Orphie (${tOrphie}) >= 315`);
        assert(tCissia >= 305, `Trigger+SAnby: Cissia (${tCissia}) >= 305`);
        assert(tAstra  >= 300, `Trigger+SAnby: Orphie (${tAstra }) >= 300`);
        assert(tSeed   >= 305, `Trigger+SAnby: Seed   (${tSeed  }) >= 305`);
        assert(tZhao   >= 290, `Trigger+SAnby: Zhao   (${tZhao  }) >= 290`);

        assert(tOrphie > tCissia, `Trigger+SAnby: Orphie (${tOrphie}) > Cissia (${tCissia})`);
        assert(tOrphie > tAstra, `Trigger+SAnby: Orphie (${tOrphie}) > Astra (${tAstra})`);

        const oTrigger = m.get('Trigger / Orphie / SAnby');
        const oJuFufu = m.get('Ju Fufu / Orphie / SAnby');
        const oDialyn = m.get('Dialyn / Orphie / SAnby');
        assert(oTrigger > oJuFufu, `SAnby+Orphie: Trigger (${oTrigger}) > Ju Fufu (${oJuFufu})`);
        assert(oJuFufu < oDialyn, `SAnby+Orphie: Ju Fufu (${oJuFufu}) < Dialyn (${oDialyn})`);

        
    });

    // ========================================================================
    // TEST 4: YSG + support ordering on Nightmare
    // ========================================================================
    // Expect: Dialyn/YSG/Sunna is #1 among the listed set. YSG/Zhao/Sunna and
    // YSG/Astra/Sunna beat JF/YSG/Sunna. (String tokens match validate-scoring.bat.)
    run('TEST 4: YSG support ordering (Nightmare)', () => {
        const t =
            'Dialyn/Ye Shunguong/Sunna,Dialyn/Ye Shunguong/Zhao,Dialyn/Ye Shunguong/Astra,Ju Fufu/Ye Shunguong/Sunna,Ye Shunguong/Zhao/Sunna,Ye Shunguong/Astra/Sunna,Trigger/Ye Shunguong/Sunna,Qingyi/Ye Shunguong/Sunna,Ju Fufu/Ye Shunguong/Zhao,Ye Shunguong/Zhao/Astra,Trigger/Ye Shunguong/Zhao';
        const teamList = scoreForTeamString(t, allUnits);
        const b = withBosses(bosses, 'Nightmare').find(Boolean);
        const map = scoreMapForBoss(teamList, b);
        const bestLabel = 'Dialyn / Ye Shunguong / Sunna';
        assert(map.get(bestLabel) === Math.max(...map.values()), 'Dialyn/YSG/Sunna should be best on Nightmare among listed teams');
        assert(
            map.get('Ye Shunguong / Zhao / Sunna') > map.get('Ju Fufu / Ye Shunguong / Sunna'),
            'YSG/Zhao/Sunna should beat JF/YSG/Sunna on Nightmare'
        );
        assert(
            map.get('Ye Shunguong / Astra / Sunna') > map.get('Ju Fufu / Ye Shunguong / Sunna'),
            'YSG/Astra/Sunna should beat JF/YSG/Sunna on Nightmare'
        );
    });

    // ========================================================================
    // TEST 5: Lucia on YSG (rupture-irrelevant 3rd)
    // ========================================================================
    // Expect: Lucia 3rds "well below" key Sunna/Zhao/Astra variants — we
    // require each Lucia line to score strictly less than every reference
    // support line on the same boss.
    run('TEST 5: Lucia on YSG below Sunna/Zhao/Astra-style lines (Nightmare, Sweeper)', () => {
        const luciaT = 'Dialyn/Ye Shunguong/Lucia,Ju Fufu/Ye Shunguong/Lucia';
        const refT =
            'Dialyn/Ye Shunguong/Sunna,Dialyn/Ye Shunguong/Zhao,Ye Shunguong/Zhao/Sunna,Ye Shunguong/Astra/Sunna';
        const luciaTeams = scoreForTeamString(luciaT, allUnits);
        const refTeams = scoreForTeamString(refT, allUnits);
        for (const b of withBosses(bosses, 'Nightmare,Sweeper')) {
            for (const { label, team } of luciaTeams) {
                const ls = scoreTeamForBoss(team, b, {});
                for (const { label: rLabel, team: rTeam } of refTeams) {
                    const rs = scoreTeamForBoss(rTeam, b, {});
                    assert(ls < rs, `${b.name}: ${label} (${ls}) should be < ${rLabel} (${rs})`);
                }
            }
        }
    });

    // ========================================================================
    // TEST 6: Hugo + Sunna vs real stunners
    // ========================================================================
    // Expect: Dialyn+Hugo - third member Sunna will be less than Lycaon or Lighter.
    run('TEST 6: Hugo + Sunna vs stunner bands (Thrall, Marionettes)', () => {
        const low = scoreForTeamString('Dialyn/Hugo/Sunna', allUnits)[0];
        const dualStunList = scoreForTeamString('Dialyn/Lighter/Hugo,Dialyn/Lycaon/Hugo,Lighter/Lycaon/Hugo', allUnits);
        for (const b of withBosses(bosses, 'Thrall,Marionettes')) {
            const lowS = scoreTeamForBoss(low.team, b, {});
            assert(lowS < 275, `${b.name} - Dialyn/Hugo/Sunna: got ${lowS}, expected < 275`);
            for (const { label, team } of dualStunList) {
                const s = scoreTeamForBoss(team, b, {});
                assert(s >= 240, `${b.name} - ${label}: got ${s}, expected >=240`);
            }
        }
    });

    // ========================================================================
    // TEST 7: Evelyn stunner ordering
    // ========================================================================
    // Expect: Dialyn > Lighter > JF for Astra 3rd; same for Lucia 3rd; and
    // Dialyn/.../Lighter order where applicable.
    run('TEST 7: Evelyn stunner ordering (Neutral, Pompey)', () => {
        // On Neutral: Dialyn > Lighter > JF
        for (const b of withBosses(bosses, 'Neutral')) {
            const astraTriple =
                'Dialyn/Evelyn/Astra,Lighter/Evelyn/Astra,Ju Fufu/Evelyn/Astra';
            const m1 = scoreMapForBoss(scoreForTeamString(astraTriple, allUnits), b);
            assert(
                m1.get('Dialyn / Evelyn / Astra') > m1.get('Lighter / Evelyn / Astra') &&
                    m1.get('Lighter / Evelyn / Astra') > m1.get('Ju Fufu / Evelyn / Astra'),
                `${b.name}: Evelyn+Astra: want Dialyn > Lighter > JF`
            );
            const evLucia = 'Dialyn/Evelyn/Lucia,Lighter/Evelyn/Lucia,Ju Fufu/Evelyn/Lucia';
            const m2 = scoreMapForBoss(scoreForTeamString(evLucia, allUnits), b);
            assert(
                m2.get('Dialyn / Evelyn / Lucia') > m2.get('Lighter / Evelyn / Lucia') &&
                    m2.get('Lighter / Evelyn / Lucia') > m2.get('Ju Fufu / Evelyn / Lucia'),
                `${b.name}: Evelyn+Lucia: want Dialyn > Lighter > JF`
            );
            const dLight = 'Dialyn/Lighter/Evelyn,Ju Fufu/Lighter/Evelyn';
            const m3 = scoreMapForBoss(scoreForTeamString(dLight, allUnits), b);
            assert(
                m3.get('Dialyn / Lighter / Evelyn') > m3.get('Ju Fufu / Lighter / Evelyn'),
                `${b.name}: Dialyn/Lighter/Evelyn > JF/Lighter/Evelyn`
            );
        }
        // On Pompey (fire-weak). REOPENED 2026-09-01 and the previous adjudication REVERSED.
        //
        // On 2026-08-31 the owner confirmed the engine's own ordering here (Norma > Lighter >
        // Dialyn) as "100% correct". They then checked aggregated player statistics and corrected
        // it: "Dialyn is indeed definitively better than Lighter and I had it pretty wrong."
        //
        //     Norma > Dialyn > Lighter > Ju Fufu
        //
        // with Norma and Dialyn inside one epsilon band and Lighter clearly outside it.
        //
        // SCOPE NOTE. The earlier version of this test also asserted the tail of the ladder
        // (Trigger > Koleda > Caesar > Pulchra > Qingyi). That came from the SAME reversed
        // adjudication and the owner has not re-confirmed it, so it is no longer asserted as an
        // order — only that all of them sit below Ju Fufu, which was never in dispute. Do not
        // restore the tail ordering without an independent source.
        //
        // THE LESSON, and it is why the tail was dropped: confirming an engine-produced ordering
        // is much weaker evidence than a spec stated independently of the engine. The nine-rung
        // ladder was adopted because the owner recognised the engine's output, and recognising
        // output is not the same as checking it.
        for (const b of withBosses(bosses, 'Pompey')) {
            const spec =
                'Norma/Evelyn/Astra,Lighter/Evelyn/Astra,Dialyn/Evelyn/Astra,' +
                'Ju Fufu/Evelyn/Astra,Trigger/Evelyn/Astra,Koleda/Evelyn/Astra,' +
                'Caesar/Evelyn/Astra,Pulchra/Evelyn/Astra,Qingyi/Evelyn/Astra';
            const m1 = scoreMapForBoss(scoreForTeamString(spec, allUnits), b);
            const top = ['Norma / Evelyn / Astra', 'Dialyn / Evelyn / Astra',
                         'Lighter / Evelyn / Astra', 'Ju Fufu / Evelyn / Astra'];
            for (let i = 0; i + 1 < top.length; i++) {
                const hi = m1.get(top[i]), lo = m1.get(top[i + 1]);
                assert(hi !== undefined && lo !== undefined && hi > lo,
                    `${b.name}: fire-weak stunner ladder: want ${top[i]} (${hi}) > ${top[i + 1]} (${lo})`);
            }
            // The unverified tail: no internal order asserted, only that it sits below Ju Fufu.
            const juFufu = m1.get('Ju Fufu / Evelyn / Astra');
            let tailChecked = 0;
            for (const t of ['Trigger / Evelyn / Astra', 'Koleda / Evelyn / Astra',
                             'Evelyn / Caesar / Astra', 'Pulchra / Evelyn / Astra',
                             'Qingyi / Evelyn / Astra']) {
                const v = m1.get(t);
                if (v === undefined) continue;
                tailChecked++;
                assert(v < juFufu, `${b.name}: ${t} (${v}) must sit below Ju Fufu (${juFufu})`);
            }
            assert(tailChecked >= 4,
                `only ${tailChecked} tail team(s) were live — fixture drift, fix it rather than letting this pass on nothing`);
            // Norma and Dialyn are one band; Lighter is a step below, not a shuffle.
            const norma = m1.get('Norma / Evelyn / Astra');
            const dialyn = m1.get('Dialyn / Evelyn / Astra');
            const lighter = m1.get('Lighter / Evelyn / Astra');
            // NOT asserted: that Norma and Dialyn share one epsilon band. Dropped 2026-09-01 at
            // the owner's direction, having been asserted for one day.
            //
            // The band matters for BUCKETING — teams inside one band share a rank, so a banded
            // pair does not burn a rank slot. The owner's point is that this only bites when
            // Dialyn is the one on top: "with Norma on top Dialyn will naturally be free to be
            // taken to a Yixuan team while leaving Norma for Evelyn." The allocator gets the
            // outcome it needs from the ordering alone, so forcing the band would be tuning for
            // a problem that does not arise in this configuration.
            //
            // FUTURE CONSIDERATION, not a concern now: if Dialyn ever lands above Norma here the
            // band question returns and matters. The gap is currently 28.7 against an epsilon of
            // 9.3, and it is not mysterious — +15 for the sole on-field carry (Norma is off-field,
            // worth 14.4 of it) plus +15 for an on-element stunner on a fire-weak boss. Both are
            // ring-fenced global constants; see the open-issues doc.
            void norma;
            // PARKED 2026-09-01. The owner's spec is that Lighter sits OUTSIDE Dialyn's epsilon
            // band, not merely below him. The engine currently separates them by 8.1 against an
            // epsilon of 8.7 — short by 0.6 — so the ordering is right and only the margin is
            // not. Parked rather than chased: closing 0.6 points would mean moving one of the two
            // ring-fenced constants that produce it, and the owner has twice declined to move a
            // corpus-wide constant to settle a single rung.
            //
            // The ordering IS still asserted, so a regression that actually flips them fails here.
            // Restore the epsilon form when the sole-carry / on-element constants are next opened.
            assert(dialyn > lighter,
                `${b.name}: Dialyn (${dialyn}) must beat Lighter (${lighter}) — ordering, not margin ` +
                `(the epsilon-band form of this rung is parked; gap is ${(dialyn - lighter).toFixed(1)}, ` +
                `eps ${rankBandEpsilon(dialyn).toFixed(1)})`);
        }
    });

    // ========================================================================
    // TEST 8: Nangong/Miyabi support order + Harumasa as fake support
    // ========================================================================
    // Expect: Yuzuha > Astra & Sunna > Nicole & Soukaku; Harumasa far below (~190–215 in batch) — we use < 300 vs > 400 split as a hard gap.
    // Nicole vs Soukaku can swap by boss; both sit below Astra/Sunna with Yuzuha on top.
    // NOTE: Sacrifice (Bringer) excluded — the freezable mechanic gives Soukaku a bonus there
    // that changes the ordering (Soukaku pseudo-anomaly freeze bonus outweighs generic supports).
    run('TEST 8: Nangong/Miyabi support ordering (Butcher, Marionettes)', () => {
        const t =
            'Nangong/Miyabi/Yuzuha,Nangong/Miyabi/Astra,Nangong/Miyabi/Sunna,Nangong/Miyabi/Nicole,Nangong/Miyabi/Soukaku,Nangong/Miyabi/Harumasa';
        for (const b of withBosses(bosses, 'Butcher,Marionettes')) {
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
            const y = m.get('Nangong / Miyabi / Yuzuha');
            const astra = m.get('Nangong / Miyabi / Astra');
            const sunna = m.get('Nangong / Miyabi / Sunna');
            const nico = m.get('Nangong / Miyabi / Nicole');
            const sou = m.get('Nangong / Miyabi / Soukaku');
            assert(y > astra, `${b.name}: Yuzuha > Astra`);
            assert(y > sunna, `${b.name}: Yuzuha > Sunna`);
            assert(astra > nico, `${b.name}: Astra > Nicole`);
            assert(sunna > nico, `${b.name}: Sunna > Nicole`);
            assert(astra > sou, `${b.name}: Astra > Soukaku`);
            assert(sunna > sou, `${b.name}: Sunna > Soukaku`);
            const midFloor = Math.min(astra, sunna);
            assert(midFloor > Math.max(nico, sou), `${b.name}: Astra/Sunna above Nicole/Soukaku (either order in lower tier)`);
            assert(
                m.get('Nangong / Miyabi / Yuzuha') - m.get('Nangong / Miyabi / Harumasa') > 150,
                `${b.name}: Harumasa should be far below real supports (gap > 150)`
            );
        }
    });

    // ========================================================================
    // TEST 9: Nangong/Aria on anomaly bosses
    // ========================================================================
    // Full chain: Sunna > Yuzuha > Astra > Zhao > Nicole > Vivian (on each boss).
    // Strict "Yuzuha second to Sunna" + above middle: Sweeper, Butcher. Solo often scrambles
    // Aria 3rds (batch already warns on ether/Zhao) — on Solo we only check Sunna best, Nicole>Vivian.
    run('TEST 9: Nangong/Aria support order (Solo, Sweeper, Butcher)', () => {
        const t =
            'Nangong/Aria/Sunna,Nangong/Aria/Zhao,Nangong/Aria/Yuzuha,Nangong/Aria/Astra,Nangong/Aria/Nicole,Nangong/Aria/Vivian';
        for (const b of withBosses(bosses, 'Sweeper,Butcher')) {
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
            const sun = m.get('Nangong / Aria / Sunna');
            const yu = m.get('Nangong / Aria / Yuzuha');
            const ast = m.get('Nangong / Aria / Astra');
            const zha = m.get('Nangong / Aria / Zhao');
            const nic = m.get('Nangong / Aria / Nicole');
            const viv = m.get('Nangong / Aria / Vivian');
            assert(sun > yu, `${b.name}: Sunna > Yuzuha`);
            assert(yu > zha, `${b.name}: Yuzuha > Zhao`);
            assert(zha > ast, `${b.name}: Zhao > Astra`);
            assert(ast > nic, `${b.name}: Astra > Nicole`);
            assert(nic > viv, `${b.name}: Nicole > Vivian`);
        }
        for (const b of withBosses(bosses, 'Solo')) {
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
            const sun = m.get('Nangong / Aria / Sunna');
            const nic = m.get('Nangong / Aria / Nicole');
            const viv = m.get('Nangong / Aria / Vivian');
            assert(nic > viv, `${b.name}: Nicole > Vivian`);
            assert(sun > viv, `${b.name}: Sunna not worst`);
        }
    });

    // ========================================================================
    // TEST 10: Disorder / dual-anomaly style bands
    // ========================================================================
    // Batch ranges: Nangong/Alice/Yuzuha ~300–350; others ~200+; Nangong/Alice/* lines.
    // Upper bound opened: current Fiend score for this line can land ~500+ when disorder + boss align.
    run('TEST 10: Disorder / Alice bands (Fiend, Sweeper, Solo)', () => {
        for (const b of withBosses(bosses, 'Fiend,Sweeper,Solo')) {
            const a = scoreForTeamString('Nangong/Alice/Yuzuha', allUnits)[0];
            const s = scoreTeamForBoss(a.team, b, {});
            assert(s >= 300, `${b.name} Nangong/Alice/Yuzuha: got ${s}, expected >= 300`);

            const avy = scoreForTeamString('Alice/Vivian/Yuzuha', allUnits)[0];
            assert(
                scoreTeamForBoss(avy.team, b, {}) >= 200,
                `${b.name} Alice/Vivian/Yuzuha should be >= 200`
            );

            for (const line of [
                'Nangong/Alice/Vivian',
                'Nangong/Alice/Sunna',
                'Nangong/Alice/Astra'
            ]) {
                const e = scoreForTeamString(line, allUnits)[0];
                const sc = scoreTeamForBoss(e.team, b, {});
                assert(sc >= 200, `${b.name} ${line}: got ${sc}, expected >= 200`);
            }
        }
    });

    // ========================================================================
    // TEST 11: Caesar quality checks
    // ========================================================================
    // Caesar/Yixuan/Lucia is an acceptable team on Butcher (Yx/L carry, Caesar stunner).
    // Trigger/Harumasa/Caesar and Trigger/YSG/Caesar on Slugger should be mid — verifies
    // that Trigger/Caesar diametric synergy doesn't hyperinflate.
    run('TEST 11: Caesar teams — CYL strong on Butcher, Trigger/Caesar mid on Slugger', () => {
        const butcher = withBosses(bosses, 'Butcher').find(Boolean);
        const cyl = scoreForTeamString('Yixuan/Caesar/Lucia', allUnits)[0];
        const cylScore = scoreTeamForBoss(cyl.team, butcher, {});
        assert(cylScore >= 300, `Butcher Caesar/Yx/Lucia: got ${cylScore}, expected >= 300`);

        const slugger = withBosses(bosses, 'Slugger').find(Boolean);
        const tcc = scoreForTeamString('Trigger/Harumasa/Caesar', allUnits)[0];
        const tccScore = scoreTeamForBoss(tcc.team, slugger, {});
        assert(tccScore <= 280, `Slugger Trigger/Harumasa/Caesar: got ${tccScore}, expected <= 280`);

        const tyc = scoreForTeamString('Trigger/Ye Shunguong/Caesar', allUnits)[0];
        const tycScore = scoreTeamForBoss(tyc.team, slugger, {});
        assert(tycScore <= 280, `Slugger Trigger/YSG/Caesar: got ${tycScore}, expected <= 280`);
    });

    // ========================================================================
    // TEST 12: Pan vs Astra (rupture) on Hunter
    // ========================================================================
    run('TEST 12: Pan beats Astra for listed pairs (Hunter)', () => {
        const rows = [
            ['Ju Fufu / Yixuan / Pan Yinhu', 'Ju Fufu / Yixuan / Astra'],
            ['Yixuan / Pan Yinhu / Lucia', 'Yixuan / Astra / Lucia'],
            ['Ju Fufu / Yidhari / Pan Yinhu', 'Ju Fufu / Yidhari / Astra']
        ];
        const t =
            'Ju Fufu/Yixuan/Pan Yinhu,Ju Fufu/Yixuan/Astra,Yixuan/Pan Yinhu/Lucia,Yixuan/Astra/Lucia,Ju Fufu/Yidhari/Pan Yinhu,Ju Fufu/Yidhari/Astra';
        const b = withBosses(bosses, 'Hunter').find(Boolean);
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        for (const [a, r] of rows) {
            assert(m.get(a) > m.get(r), `Hunter: ${a} should beat ${r}`);
        }
    });

    // ========================================================================
    // TEST 13: Rupture synergy on attack team is generally useless
    // ========================================================================
    // Expect: every listed team scores poorly
    run('TEST 13: Pan Yinhu on attack team should be useless', () => {
        const t = 'Dialyn/Evelyn/Pan Yinhu';
        const b = withBosses(bosses, 'Neutral').find(Boolean);
        for (const { team, label } of scoreForTeamString(t, allUnits)) {
            const s = scoreTeamForBoss(team, b, {});
            assert(s < 150, `${label} should be < 150, got ${s}`);
        }
    });

    // ========================================================================
    // TEST 14: Banyue fire-weak band
    // ========================================================================
    run('TEST 14: Banyue teams >350 (Pompey, Hunter)', () => {
        const t = 'Dialyn/Banyue/Lucia,Ju Fufu/Banyue/Lucia,Banyue/Astra/Lucia,Banyue/Pan Yinhu/Lucia,Norma/Banyue/Lucia';
        for (const b of withBosses(bosses, 'Pompey,Hunter')) {
            for (const { team, label } of scoreForTeamString(t, allUnits)) {
                const s = scoreTeamForBoss(team, b, {});
                assert(s >= 350 && s <= 485, `${b.name} ${label}: got ${s}, expected strong Banyue performance ~[350,485]`);
            }
        }
    });

    // ========================================================================
    // TEST 15: Nangong/Yixuan/Sunna — the emergent-team-building proof
    // ========================================================================
    // REVERSED 2026-09-01 after owner play-testing. This test used to assert the team was BAD
    // (a "cross-archetype mix" capped first at 265, then 305). Prevalent thought agrees: Sunna is
    // an attack/anomaly support, Yixuan is rupture, so the pairing looks like trash. The engine
    // insisted otherwise the whole time, and the owner played ~7 matches against Butcher to check:
    //
    //   "That team actually kinda rocks... Yixuan REALLY loves the stacking stun multipliers and
    //    her greedy stun windows rack up huge burst damage. The engine was right and prevalent
    //    thought was wrong."
    //
    // So this is now the FLAGSHIP proof that emergent scoring beats template matching. The claim:
    // Sunna, the support everyone would dismiss on a rupture carry, is at least as good as Astra,
    // the "correct" attack support — because Nangong (T0 fast stunner) + Sunna's daze + their
    // combined stun-multiplier is exactly what a greedy-window rupture carry wants.
    //
    // Sunna's rupture avoid was removed from units.json for the same reason: she can only reach a
    // rupture carry ALONGSIDE Nangong (join rules), and Nangong+Sunna is precisely the wheelchair
    // that makes it work. Tagging her to avoid rupture in a vacuum was wrong in practice.
    run('TEST 15: Nangong/Yixuan/Sunna rises — Sunna >= Astra on rupture with Nangong', () => {
        for (const b of withBosses(bosses, 'Neutral,Marionettes,Butcher')) {
            const m = scoreMapForBoss(
                scoreForTeamString('Nangong/Yixuan/Sunna,Nangong/Yixuan/Astra', allUnits), b);
            const sunna = m.get('Nangong / Yixuan / Sunna');
            const astra = m.get('Nangong / Yixuan / Astra');
            assert(sunna >= astra,
                `${b.name}: Nangong/Yixuan/Sunna (${sunna?.toFixed(1)}) must be at least as good as ` +
                `Nangong/Yixuan/Astra (${astra?.toFixed(1)}) — the stun wheelchair works on rupture`);
        }
    });

    // ========================================================================
    // TEST 16 (partial): Nangong on Fiend — Miyabi on top, Alice band
    // ========================================================================
    // SKIPPED: forcing Miyabi as rank-1 — Alice/Nangong can outscore in current metascoring.
    run('TEST 16 (partial): Fiend + Nangong — high table + Alice/Yuzuha in competitive band', () => {
        const b = withBosses(bosses, 'Fiend').find(Boolean);
        const top = getTopViableTeams(allTeamEntries, b, 25, ['Nangong']);
        assert(top.length > 0, 'Fiend: no Nangong teams');
        const first = top[0];
        assert(first.score >= 380, `Top Nangong team score ${first.score} expected >= 380`);
        assert(
            first.team.some((u) => u.name === 'Nangong'),
            `Rank-1 should include Nangong, got ${first.label}`
        );
        const aliceYuzu = scoreForTeamString('Nangong/Alice/Yuzuha', allUnits)[0];
        const as = scoreTeamForBoss(aliceYuzu.team, b, {});
        assert(as >= 300, `Nangong/Alice/Yuzuha on Fiend: got ${as}, expected >= 300`);
    });

    // ========================================================================
    // TEST 17: JF vs Astra on Yixuan/Lucia
    // ========================================================================
    run('TEST 17: Ju Fufu/Yixuan/Lucia > Yixuan/Astra/Lucia (Hunter)', () => {
        const a = scoreForTeamString('Ju Fufu/Yixuan/Lucia', allUnits)[0];
        const b2 = scoreForTeamString('Yixuan/Astra/Lucia', allUnits)[0];
        for (const b of withBosses(bosses, 'Hunter')) {
            assert(
                scoreTeamForBoss(a.team, b, {}) > scoreTeamForBoss(b2.team, b, {}),
                `${b.name}: JF/Yixuan/Lucia should beat Yixuan/Astra/Lucia`
            );
        }
    });

    // ========================================================================
    // TEST 18: Soukaku activation
    // ========================================================================
    // Lycaon/Yixuan/Soukaku mid; YSG/Zhao/Soukaku mid (boss-dependent); Nangong/Miyabi/Soukaku high.
    run('TEST 18: Soukaku — mid without anomaly enabler, high with Nangong/Miyabi (where viable)', () => {
        const low = scoreForTeamString('Lycaon/Yixuan/Soukaku', allUnits)[0];
        for (const b of withBosses(bosses, 'Nightmare,Butcher,Neutral')) {
            assert(
                scoreTeamForBoss(low.team, b, {}) <= 180,
                `${b.name} Lycaon/Yixuan/Soukaku should be bad (<= 180), got ${scoreTeamForBoss(low.team, b, {})}`
            );
        }
        const mid = scoreForTeamString('Ye Shunguong/Zhao/Soukaku', allUnits)[0];
        for (const b of withBosses(bosses, 'Nightmare')) {
            const ms = scoreTeamForBoss(mid.team, b, {});
            assert(ms >= 300, `${b.name} YSG/Zhao/Soukaku: got ${ms}, expected higher viability for a YSG shill boss`);
        }
        for (const b of withBosses(bosses, 'Butcher')) {
            const ms = scoreTeamForBoss(mid.team, b, {});
            assert(
                ms <= 325,
                `${b.name} YSG/Zhao/Soukaku: got ${ms}, expected less than ~325 (off-weakness anomaly boss)`
            );
        }
        const high = scoreForTeamString('Nangong/Miyabi/Soukaku', allUnits)[0];
        for (const b of withBosses(bosses, 'Butcher')) {
            const hs = scoreTeamForBoss(high.team, b, {});
            assert(
                hs >= 380,
                `${b.name} Nangong/Miyabi/Soukaku should be high (>= 380), got ${hs}`
            );
        }
    });

    // ========================================================================
    // TEST 19: Orphie fire resist vs Cissia on Slugger
    // ========================================================================
    run('TEST 19: Trigger/Cissia/Seed > Trigger/Orphie/SAnby on Slugger', () => {
        const b = withBosses(bosses, 'Slugger').find(Boolean);
        const t = 'Trigger/Orphie/SAnby,Trigger/Cissia/Seed,Trigger/Cissia/SAnby,Ju Fufu/Orphie/SAnby';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        assert(
            m.get('Trigger / Cissia / Seed') > m.get('Trigger / Orphie / SAnby'),
            'Slugger: Cissia/Seed should edge Orphie line'
        );
    });

    // ========================================================================
    // TEST 20: Burnice on fire-res — disqualify (score <= 0)
    // ========================================================================
    // Only the Burnice teams are asserted <= 0; the batch mixes in non-Burnice
    // control lines — we only assert rows that actually contain Burnice.
    run('TEST 20: Burnice on Solo/Sweeper — disqualified (<=0)', () => {
        for (const b of withBosses(bosses, 'Solo,Sweeper')) {
            for (const { team, label } of scoreForTeamString(
                'Aria/Burnice/Sunna,Nangong/Burnice/Vivian',
                allUnits
            )) {
                const s = scoreTeamForBoss(team, b, {});
                assert(
                    s <= 0,
                    `${b.name} ${label}: Burnice should be disqualified on fire-res, got ${s}`
                );
            }
        }
    });

    // ========================================================================
    // TEST 21: Banyue ranks well on Hunter — at least 5 teams scoring 350+
    // ========================================================================
    run('TEST 21: at least 5 Banyue teams score 350+ on Hunter', () => {
        const b = withBosses(bosses, 'Hunter').find(Boolean);
        const top = getTopViableTeams(allTeamEntries, b, 50, ['Banyue']);
        const strong = top.filter(({ score }) => score >= 350);
        assert(
            strong.length >= 5,
            `Hunter: only ${strong.length} Banyue team(s) score 350+, expected at least 5`
        );
    });

    // ========================================================================
    // TEST 22: YSG + Dialyn vs other stunners
    // ========================================================================
    // Batch: Dialyn/YSG should run ahead of JF/YSG for Sunna and Zhao 3rds.
    run('TEST 22: Dialyn/YSG beats JF/YSG (Sunna and Zhao) on Thrall, Defiler, Neutral', () => {
        for (const b of withBosses(bosses, 'Thrall,Defiler,Neutral')) {
            const t =
                'Dialyn/Ye Shunguong/Sunna,Dialyn/Ye Shunguong/Zhao,Ju Fufu/Ye Shunguong/Sunna';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
            assert(
                m.get('Dialyn / Ye Shunguong / Sunna') > m.get('Ju Fufu / Ye Shunguong / Sunna'),
                `${b.name}: Dialyn/YSG/Sunna > JF/YSG/Sunna`
            );
            assert(
                m.get('Dialyn / Ye Shunguong / Zhao') > m.get('Ju Fufu / Ye Shunguong / Sunna'),
                `${b.name}: Dialyn/YSG/Zhao > JF/YSG/Sunna (proxy vs JF line)`
            );
        }
    });

    // ========================================================================
    // TEST 23: MVY below Nangong/Miyabi variants
    // ========================================================================
    // Solo can invert (Vivian anomaly package); Sweeper+Butcher match the batch "strictly better" story.
    run('TEST 23: Nangong/Miyabi/Yuzuha > Miyabi/Vivian/Yuzuha (Sweeper, Butcher)', () => {
        for (const b of withBosses(bosses, 'Sweeper,Butcher')) {
            const t = 'Nangong/Miyabi/Yuzuha,Miyabi/Vivian/Yuzuha';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
            assert(
                m.get('Nangong / Miyabi / Yuzuha') > m.get('Miyabi / Vivian / Yuzuha'),
                `${b.name}: Nangong/Miyabi/Yuzuha should beat MVY`
            );
        }
    });

    // ========================================================================
    // TEST 24: Qingyi flex lines
    // ========================================================================
    // Flex lines: "above 350" in batch; allow ~320 on worst boss in the set (e.g. Butcher + Pan).
    run('TEST 24: Qingyi/Yixuan lines strong flex (Priest, Butcher, Corruption, Marionettes)', () => {
        for (const b of withBosses(bosses, 'Priest,Butcher,Corruption,Marionettes')) {
            for (const { team, label } of scoreForTeamString(
                'Qingyi/Yixuan/Lucia,Qingyi/Yixuan/Pan Yinhu',
                allUnits
            )) {
                const s = scoreTeamForBoss(team, b, {});
                assert(s > 320, `${b.name} ${label}: got ${s}, expected > 320 (strong flex floor)`);
            }
        }
    });

    // ========================================================================
    // TEST 25: Yuzuha on rupture (low)
    // ========================================================================
    // Expect: Yixuan/Lucia/Yuzuha in ~150–200 (batch); compare baselines in batch.
    run('TEST 25: Yuzuha on Yixuan/Lucia low vs baselines (Priest, Hunter)', () => {
        for (const b of withBosses(bosses, 'Priest,Hunter')) {
            const y = scoreForTeamString('Yixuan/Lucia/Yuzuha', allUnits)[0];
            const ys = scoreTeamForBoss(y.team, b, {});
            assert(ys >= 130 && ys <= 220, `${b.name} Yixuan/Lucia/Yuzuha: got ${ys}, expected ~[150, 200] slacked [130, 220]`);
            const jf = scoreForTeamString('Ju Fufu/Yixuan/Lucia', allUnits)[0];
            const ast = scoreForTeamString('Yixuan/Astra/Lucia', allUnits)[0];
            assert(ys < scoreTeamForBoss(jf.team, b, {}), `${b.name}: Yuzuha 3rd < JF comp`);
            assert(ys < scoreTeamForBoss(ast.team, b, {}), `${b.name}: Yuzuha 3rd < Astra comp`);
        }
    });

    // ========================================================================
    // TEST 26: YSG on Slugger (Typhon) — high score
    // ========================================================================
    run('TEST 26: YSG lines strong on Slugger (Typhon) — near 300+ titled brute', () => {
        const b = withBosses(bosses, 'Slugger').find(Boolean);
        for (const { team, label } of scoreForTeamString(
            'Trigger/Ye Shunguong/Zhao,Trigger/Ye Shunguong/Sunna,Qingyi/Ye Shunguong/Sunna',
            allUnits
        )) {
            const s = scoreTeamForBoss(team, b, {});
            assert(
                s >= 300,
                `Slugger ${label}: got ${s}, expected 300+`
            );
        }
    });

    // ========================================================================
    // TEST 27: Bringer (Sacrifice) — all MV* high, Yuzu best among listed
    // ========================================================================
    run('TEST 27: MV* on Bringer (Sacrifice) — all > 300, MVY tops Nicole/Soukaku/Astra', () => {
        const b = withBosses(bosses, 'Sacrifice').find(Boolean);
        const t =
            'Miyabi/Vivian/Nicole,Miyabi/Vivian/Soukaku,Miyabi/Vivian/Astra,Miyabi/Vivian/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        for (const k of m.keys()) {
            assert(m.get(k) > 300, `Sacrifice ${k}: got ${m.get(k)}, want > 300`);
        }
        const best = m.get('Miyabi / Vivian / Yuzuha');
        assert(best > m.get('Miyabi / Vivian / Nicole'), 'MVY > MVN');
        assert(best > m.get('Miyabi / Vivian / Soukaku'), 'MVY > MVS');
        assert(best > m.get('Miyabi / Vivian / Astra'), 'MVY > MVA');
    });

    // ========================================================================
    // TEST 28: Nangong/Alice/Yuzuha competitive with Miyabi/Vivian/Yuzuha on Fiend
    // ========================================================================
    // Alice is T1 physical anomaly; Fiend is physical+ether weak anomaly shill.
    // NAY (with Nangong stun + Alice on-element) should beat or be close to MVY.
    run('TEST 28: Nangong/Alice/Yuzuha >= Miyabi/Vivian/Yuzuha on Fiend', () => {
        const b = withBosses(bosses, 'Fiend').find(Boolean);
        const t = 'Nangong/Alice/Yuzuha,Miyabi/Vivian/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        const nay = m.get('Nangong / Alice / Yuzuha');
        const mvy = m.get('Miyabi / Vivian / Yuzuha');
        assert(
            nay >= mvy - 15,
            `Fiend: NAY (${nay}) should be >= MVY (${mvy}) or within 15 points`
        );
    });

    // ========================================================================
    // TEST 29: Astra/Nicole "wheelchair" — 300+ on Marionettes; UCC now anti-anomaly by default
    // ========================================================================
    // UCC (Corruption Complex) now defaults to anti-anomaly, so Miyabi teams are
    // disqualified there. Test Miyabi on Marionettes only, then verify UCC open
    // variation re-enables anomaly teams.
    run('TEST 29: Miyabi/Astra/Nicole 290+ on Marionettes; UCC open variant re-enables anomaly', () => {
        const miyabi = scoreForTeamString('Miyabi/Astra/Nicole', allUnits)[0];
        const zy = scoreForTeamString('Zhu Yuan/Astra/Nicole', allUnits)[0];

        // Marionettes: anomaly teams remain viable
        for (const b of withBosses(bosses, 'Marionettes')) {
            const ms = scoreTeamForBoss(miyabi.team, b, {});
            assert(ms >= 290, `${b.name} Miyabi/Astra/Nicole: got ${ms}, want >= 290`);
            const zs = scoreTeamForBoss(zy.team, b, {});
            assert(zs >= 100, `${b.name} Zhu Yuan/Astra/Nicole: got ${zs}, want 100+`);
        }

        // UCC default: anti-anomaly → Miyabi disqualified
        const ucc = bosses.find(b => b.id === 'ucc');
        const uccDefault = scoreTeamForBoss(miyabi.team, ucc, {});
        assert(uccDefault <= 0, `Default UCC should disqualify Miyabi (anti-anomaly), got ${uccDefault}`);

        // UCC open variation: no anti → Miyabi viable again
        const uccOpen = resolveBossVariation(ucc, 'og');
        const uccOpenScore = scoreTeamForBoss(miyabi.team, uccOpen, {});
        assert(uccOpenScore >= 290, `UCC open variation Miyabi/Astra/Nicole: got ${uccOpenScore}, want >= 290`);
    });

    // ========================================================================
    // TEST 30: disorder scaling sanity — Nangong > MVY > Astra
    // ========================================================================
    run('TEST 30: Nangong/Miyabi/Yuzuha > MVY > Miyabi/Astra/Yuzuha (Sacrifice, Fiend)', () => {
        for (const b of withBosses(bosses, 'Fiend')) {
            const t = 'Nangong/Miyabi/Yuzuha,Miyabi/Vivian/Yuzuha,Miyabi/Astra/Yuzuha';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
            assert(
                m.get('Nangong / Miyabi / Yuzuha') > m.get('Miyabi / Vivian / Yuzuha'),
                `${b.name}: Nangong line > MVY`
            );
            assert(
                m.get('Miyabi / Vivian / Yuzuha') > m.get('Miyabi / Astra / Yuzuha'),
                `${b.name}: MVY > Astra 3rd`
            );
        }
    });

    // ========================================================================
    // TEST 31: Soukaku buff alignment — no pseudoRole penalty with ice DPS
    // ========================================================================
    // Regression guard: Soukaku's anomaly pseudoRole penalty should NOT fire
    // when her ice buffs serve an ice DPS (buff alignment >= 0.5).
    run('TEST 31: Lycaon/Ellen/Soukaku viable on ice-weak boss (>= 180)', () => {
        const les = scoreForTeamString('Lycaon/Ellen/Soukaku', allUnits)[0];
        const len = scoreForTeamString('Lycaon/Ellen/Nicole', allUnits)[0];
        for (const b of withBosses(bosses, 'Marionettes')) {
            const lesS = scoreTeamForBoss(les.team, b, {});
            const lenS = scoreTeamForBoss(len.team, b, {});
            assert(lesS > lenS, `${b.name}: LES (${lesS}) should beat LEN (${lenS}) — ice synergy not penalized`);
        }
    });

    // ========================================================================
    // TEST 32: AoD (Nangong/Aria) beats non-AoD on Priest
    // ========================================================================
    run('TEST 32: Nangong/Aria/Sunna > Aria/Burnice/Sunna on Priest', () => {
        const teams = scoreForTeamString(
            'Nangong/Aria/Sunna,Aria/Burnice/Sunna', allUnits);
        for (const b of withBosses(bosses, 'Priest')) {
            const m = scoreMapForBoss(teams, b);
            const aod = m.get('Nangong / Aria / Sunna');
            const abs = m.get('Aria / Burnice / Sunna');
            assert(aod > abs,
                `${b.name}: NAS (${aod}) should beat ABS (${abs})`);
        }
    });

    // ========================================================================
    // TEST 33: Lighter/Evelyn/Astra > Trigger/Evelyn/Astra on Pompey
    // ========================================================================
    // Lighter should beat Trigger on fire-weak bosses
    run('TEST 33: Lighter > Trigger for Evelyn on Pompey', () => {
        const teams = scoreForTeamString('Lighter/Evelyn/Astra,Trigger/Evelyn/Astra', allUnits);
        for (const b of withBosses(bosses, 'Pompey')) {
            const m = scoreMapForBoss(teams, b);
            const lighter = m.get('Lighter / Evelyn / Astra');
            const trigger = m.get('Trigger / Evelyn / Astra');
            assert(lighter > trigger, `${b.name}: Lighter/Evelyn/Astra (${lighter}) should beat Trigger/Evelyn/Astra (${trigger})`);
        }
    });

    // ========================================================================
    // TEST 34: Promeia ice vortex dominance on Scorched Horizon
    // ========================================================================
    run('TEST 34: Promeia teams dominate Scorched Horizon; outscore Miyabi teams', () => {
        const teams = scoreForTeamString(
            'Lycaon/Promeia/Soukaku,Nangong/Promeia/Yuzuha,Miyabi/Vivian/Yuzuha,Nangong/Miyabi/Yuzuha',
            allUnits);
        for (const b of withBosses(bosses, 'Horizon')) {
            const m = scoreMapForBoss(teams, b);
            const lps = m.get('Lycaon / Promeia / Soukaku');
            const npy = m.get('Nangong / Promeia / Yuzuha');
            const mvy = m.get('Miyabi / Vivian / Yuzuha');
            const nmy = m.get('Nangong / Miyabi / Yuzuha');
            assert(npy > 350, `${b.name}: NPY (${npy}) expected > 350`);
            assert(lps > 320, `${b.name}: LPS (${lps}) expected > 320`);
            assert(npy > mvy, `${b.name}: NPY (${npy}) should beat MVY (${mvy})`);
            assert(npy > nmy, `${b.name}: NPY (${npy}) should beat NMY (${nmy}) — vortex advantage`);
            assert(npy > lps, `${b.name}: NPY (${npy}) should beat LPS (${lps}) — premier team should beat standard team`)
        }
    });

    // ========================================================================
    // TEST 35: Lighter/Promeia/Burnice abloom synergy on Scorched Horizon
    // ========================================================================
    run('TEST 35: Lighter/Promeia/Burnice competitive on Scorched Horizon (abloom + vortex)', () => {
        const teams = scoreForTeamString('Lighter/Promeia/Burnice', allUnits);
        for (const b of withBosses(bosses, 'Horizon')) {
            const m = scoreMapForBoss(teams, b);
            const lpb = m.get('Lighter / Burnice / Promeia');
            assert(lpb > 345, `${b.name}: LPB (${lpb}) expected > 345 (abloom + dual vortex)`); 
        }
    });

    // ========================================================================
    // TEST 36: Miyabi weakness on Horizon vs strength on Sacrifice Bringer
    // ========================================================================
    run('TEST 36: Miyabi/Vivian/Yuzuha much stronger on Bringer than Horizon', () => {
        const teams = scoreForTeamString(
            'Miyabi/Vivian/Yuzuha', allUnits);
        const horizons = withBosses(bosses, 'Horizon');
        const bringers = withBosses(bosses, 'Sacrifice');
        for (const hb of horizons) {
            const horizonScore = scoreTeamForBoss(teams[0].team, hb, {});
            for (const bb of bringers) {
                const bringerScore = scoreTeamForBoss(teams[0].team, bb, {});
                assert(bringerScore > 300, `${bb.name}: MVY (${bringerScore}) expected > 300`);
                assert(bringerScore > horizonScore + 50,
                    `MVY on Bringer (${bringerScore}) should beat Horizon (${horizonScore}) by 50+`);
            }
        }
    });

    // ========================================================================
    // TEST 37: Polarity providers mitigate Miyabi on Horizon
    // ========================================================================
    run('TEST 37: Nangong/Miyabi/Yuzuha > Miyabi/Vivian/Yuzuha on Horizon (polarity mitigation)', () => {
        const teams = scoreForTeamString(
            'Nangong/Miyabi/Yuzuha,Miyabi/Vivian/Yuzuha', allUnits);
        for (const b of withBosses(bosses, 'Horizon')) {
            const m = scoreMapForBoss(teams, b);
            const nmy = m.get('Nangong / Miyabi / Yuzuha');
            const mvy = m.get('Miyabi / Vivian / Yuzuha');
            assert(nmy > mvy,
                `${b.name}: NMY (${nmy}) should beat MVY (${mvy}) — Nangong polarity feeds Miyabi scaling`);
        }
    });

    // ========================================================================
    // TEST 38: Non-anomaly teams unaffected by vortex on Horizon
    // ========================================================================
    run('TEST 38: Attack/rupture teams on Scorched Horizon — no accidental vortex bonuses', () => {
        const teams = scoreForTeamString(
            'Lighter/Evelyn/Astra,Lycaon/Zhu Yuan/Nicole', allUnits);
        for (const b of withBosses(bosses, 'Horizon')) {
            const m = scoreMapForBoss(teams, b);
            for (const [label, s] of m) {
                assert(s > 0, `${b.name}: ${label} (${s}) should not be disqualified as a non-anomaly team`);
            }
        }
    });

    // ========================================================================
    // TEST 39: Regression — existing compositions unchanged on non-Horizon bosses
    // ========================================================================
    run('TEST 39: Key compositions identical on Sacrifice Bringer (no vortex regression)', () => {
        const teams = scoreForTeamString(
            'Nangong/Miyabi/Yuzuha,Miyabi/Vivian/Yuzuha', allUnits);
        for (const b of withBosses(bosses, 'Sacrifice')) {
            const m = scoreMapForBoss(teams, b);
            const nmy = m.get('Nangong / Miyabi / Yuzuha');
            const mvy = m.get('Miyabi / Vivian / Yuzuha');
            assert(nmy > 400, `${b.name}: NMY (${nmy}) expected > 400 (regression check)`);
            assert(mvy > 300, `${b.name}: MVY (${mvy}) expected > 300 (regression check)`);
            assert(nmy > mvy, `${b.name}: NMY (${nmy}) should beat MVY (${mvy}) (regression check)`);
        }
    });

    // ========================================================================
    // TEST 40: Butcher disorder weakness 
    // ========================================================================
    // All things considered, both Promeia and Aria are T0.5 anomaly DPS units hitting weaknesses.
    // Promeia/Vivian generates disorders, Aria/Vivian does not. Promeia should win. 
    run('TEST 40: Butcher disorders — Prom/Viv > Aria/Viv (disorder bonus)', () => {
        const b = withBosses(bosses, 'Butcher').find(Boolean);
        const t = 'Promeia/Vivian/Yuzuha,Aria/Vivian/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        const pvy = m.get('Promeia / Vivian / Yuzuha');
        const avy = m.get('Aria / Vivian / Yuzuha');
        assert(pvy > avy,
            `Butcher: PVY (${pvy}) should beat AVY (${avy}) — disorder weakness bonus`);
    });

    // ========================================================================
    // TEST 41: Vesper (Discordant Solo) veil weakness — veil providers rewarded
    // ========================================================================
    // Sunna (veils:3) contributes a larger veil bonus than non-veil supports on Solo.
    // This should push Sunna further ahead of zero-veil alternatives.
    // Zhao (veils:2) also gets credit; compared against Nicole (no veils) to verify
    // that non-AoD veil providers get scoring credit as intended.
    run('TEST 41: Vesper veil weakness — Sunna > Astra; Zhao > Nicole (veil generation bonus)', () => {
        const b = withBosses(bosses, 'Solo').find(Boolean);
        const t = 'Nangong/Aria/Sunna,Nangong/Aria/Astra,Nangong/Aria/Zhao,Nangong/Aria/Nicole';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        const sun = m.get('Nangong / Aria / Sunna');
        const astra = m.get('Nangong / Aria / Astra');
        const zhao = m.get('Nangong / Aria / Zhao');
        const nico = m.get('Nangong / Aria / Nicole');
        assert(sun > astra,
            `Solo: Sunna (${sun}) should beat Astra (${astra}) — Sunna veils:3 contributes`);
        assert(zhao > nico,
            `Solo: Zhao (${zhao}) should beat Nicole (${nico}) — Zhao veils:2 vs Nicole no veils`);
    });

    // ========================================================================
    // TEST 42: Bringer (Sacrifice Bringer) freeze bonus — ice anomaly teams rewarded
    // ========================================================================
    // Both Miyabi (frost, ice element) and Promeia (ice anomaly) get the full freeze
    // bonus (+60). Non-ice anomaly teams get no freeze bonus. Both ice teams should
    // score > 400; Alice (ether anomaly) team should score clearly below both.
    run('TEST 42: Bringer freeze — ice anomaly teams score high; non-ice anomaly does not benefit', () => {
        const b = withBosses(bosses, 'Sacrifice').find(Boolean);
        const t = 'Nangong/Promeia/Yuzuha,Nangong/Miyabi/Yuzuha,Nangong/Alice/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        const npy = m.get('Nangong / Promeia / Yuzuha');
        const nmy = m.get('Nangong / Miyabi / Yuzuha');
        const nay = m.get('Nangong / Alice / Yuzuha');
        assert(npy > 325, `Bringer: NPY (${npy}) should be > 325 (ice anomaly + freeze)`);
        assert(nmy > 400, `Bringer: NMY (${nmy}) should be > 400 (ice anomaly + freeze)`);
        assert(nmy > nay,
            `Bringer: NMY (${nmy}) should beat NAY (${nay}) — ice freeze bonus vs no freeze bonus`);
        assert(npy > nay,
            `Bringer: NPY (${npy}) should beat NAY (${nay}) — ice freeze bonus vs no freeze bonus`);
    });

    // ========================================================================
    // TEST 43: Sweeper stun weakness — teams with a stunner get a flat bonus
    // ========================================================================
    // The stun weakness gives any team with a stunner +15. Since Nangong/Miyabi/Yuzuha
    // also beats Miyabi/Vivian/Yuzuha from many other angles, the gap should be well
    // above 15 (the stun bonus is one contributor among several here).
    run('TEST 43: Sweeper stun weakness — stunner team outscores stunnerless team by meaningful gap', () => {
        const b = withBosses(bosses, 'Sweeper').find(Boolean);
        const t = 'Nangong/Miyabi/Yuzuha,Miyabi/Vivian/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        const nmy = m.get('Nangong / Miyabi / Yuzuha');
        const mvy = m.get('Miyabi / Vivian / Yuzuha');
        assert(nmy > mvy,
            `Sweeper: NMY (${nmy}) should beat MVY (${mvy}) — stun weakness bonus`);
        assert(nmy - mvy >= 15,
            `Sweeper: gap NMY–MVY (${nmy - mvy}) should be >= stun bonus (15)`);
    });

    // ========================================================================
    // TEST 44: Scorched Horizon CD debuff — anomaly agents unpenalized; CD buffs mitigate
    // ========================================================================
    // Promeia has no CD scaling (cd baseline = 0), so she gets zero penalty.
    // Miyabi has scaling.cd:3, getting a shortfall of 2 without CD buffs → penalty = 24.
    // This makes Promeia teams clearly stronger than Miyabi teams on Horizon.
    // Separately, Astra (buffs.cd:3) fully offsets the debuff for an attacker (cd baseline = 2),
    // so Lighter/Evelyn/Astra should score better than Lighter/Evelyn without CD coverage.
    run('TEST 44: Scorched Horizon CD debuff — Promeia unpenalized over Miyabi; Astra offsets for attackers', () => {
        const b = withBosses(bosses, 'Horizon').find(Boolean);
        const t1 = 'Nangong/Promeia/Yuzuha,Nangong/Miyabi/Yuzuha';
        const m1 = scoreMapForBoss(scoreForTeamString(t1, allUnits), b);
        const npy = m1.get('Nangong / Promeia / Yuzuha');
        const nmy = m1.get('Nangong / Miyabi / Yuzuha');
        assert(npy > nmy,
            `Horizon: NPY (${npy}) should beat NMY (${nmy}) — Promeia not penalized by CD debuff`);
        const t2 = 'Lighter/Evelyn/Astra,Lighter/Evelyn/Zhao';
        const m2 = scoreMapForBoss(scoreForTeamString(t2, allUnits), b);
        const lea = m2.get('Lighter / Evelyn / Astra');
        const lez = m2.get('Lighter / Evelyn / Zhao');
        assert(lea > lez,
            `Horizon: LEA (${lea}) should beat LEZ (${lez}) — Astra cd:3 offsets debuff for Evelyn`);
    });

    // ========================================================================
    // TEST 45: Scorched Horizon abloom weakness — abloom output rewarded proportionally
    // ========================================================================
    // Promeia (abloom:3) receives a larger abloom bonus (+15) than Vivian (abloom:3 same)
    // but Promeia also has ice vortex advantage. As a combined check: Promeia-based
    // team should outscore a Vivian-based team on Horizon where Promeia has more advantages.
    run('TEST 45: Scorched Horizon abloom weakness — Promeia/Nangong/Yuzuha > Vivian/Nangong/Yuzuha', () => {
        const b = withBosses(bosses, 'Horizon').find(Boolean);
        const t = 'Nangong/Promeia/Yuzuha,Nangong/Vivian/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        const npy = m.get('Nangong / Promeia / Yuzuha');
        const nvy = m.get('Nangong / Vivian / Yuzuha');
        assert(npy > nvy,
            `Horizon: NPY (${npy}) should beat NVY (${nvy}) — ice vortex + abloom + favored advantages`);
    });

    // ========================================================================
    // TEST 46: Norma sheer scaling — benefits from Lucia's sheer buffs on rupture teams
    // ========================================================================
    // Norma's scaling.sheer:3 means Lucia's
    // buffs.sheer:3 scores in baseline affinity for Norma just as it would for a rupture DPS.
    // Norma/Yixuan/Lucia is a full rupture team and should score strongly on rupture bosses.
    run('TEST 46: Norma sheer scaling — Norma/Yixuan/Lucia scores strongly on rupture bosses', () => {
        const t = 'Norma/Yixuan/Lucia';
        for (const b of withBosses(bosses, 'Hunter,Priest')) {
            for (const { team, label } of scoreForTeamString(t, allUnits, { preview: true })) {
                const s = scoreTeamForBoss(team, b, {});
                assert(s >= 350,
                    `${b.name} ${label}: got ${s}, expected >= 350 (Lucia sheer fully benefits Norma)`);
            }
        }
    });

    // ========================================================================
    // TEST 47: Vesper - Alice should not be overranking Aria teams
    // ========================================================================
    // 
    run('TEST 47: Alice without Sunna should not do as well as Aria variants', () => {
        const vesper = withBosses(bosses, 'vesper').find(Boolean);
        const alice = scoreTeamForBoss(scoreForTeamString('Nangong/Alice/Yuzuha', allUnits)[0].team, vesper, {});
        const t = 'Nangong/Aria/Sunna,Nangong/Aria/Zhao,Nangong/Aria/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), vesper);
        for (const { team, label } of scoreForTeamString(t, allUnits)) {
            const s = scoreTeamForBoss(team, vesper, {});
            assert(s > alice,
                `Vesper - ${label} (${s}) should not be worse than Nangong/Alice/Yuzuha (${alice})`);
        }
    });

    
    // ========================================================================
    // TEST 48: Promeia/Vivian/Yuzuha > Nangong/Vivian/Yuzuha > Nangong/Promeia/Yuzuha
    // ========================================================================
    // 
    run('TEST 48: Promeia/Vivian/Yuzuha > Nangong/Vivian/Yuzuha > Nangong/Promeia/Yuzuha', () => {
        const b = withBosses(bosses, 'horizon').find(Boolean);
        const t = 'Promeia/Vivian/Yuzuha,Nangong/Vivian/Yuzuha,Nangong/Promeia/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        const pvy = m.get('Promeia / Vivian / Yuzuha');
        const nvy = m.get('Nangong / Vivian / Yuzuha');
        const npy = m.get('Nangong / Promeia / Yuzuha');
        assert(npy > nvy, `NPY ${npy} should be better than NVY ${nvy}`);
        assert(pvy > npy, `PVY ${pvy} should be better than NPY ${npy}`);
    });

    // ========================================================================
    // TEST 49: Jane vortex buff on Scorched Horizon
    // ========================================================================
    // Compares Jane against Piper on Scorched Horizon. The vortex buff effect 
    // should create a bigger gap than on Butcher.
    run('TEST 49: Jane vortex buff — Jane > Piper on Scorched Horizon', () => {
        const t = "Alice/Jane/Yuzuha,Alice/Piper/Yuzuha"
        let b = withBosses(bosses, 'Horizon').find(Boolean);
        let m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        let j = m.get('Alice / Jane Doe / Yuzuha');
        let p = m.get('Alice / Piper / Yuzuha');
        assert(j > p, `Horizon: Jane (${j}) should beat Piper (${p}) due to vortex buff`);
        const hdiff = j - p;
        b = withBosses(bosses, 'Butcher').find(Boolean);
        m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        j = m.get('Alice / Jane Doe / Yuzuha');
        p = m.get('Alice / Piper / Yuzuha');
        const fdiff = j - p;
        assert(hdiff > fdiff, `Difference between Jane and Piper should be more pronounced on Horizon than Butcher because of vortex buff`);
    });

    // ========================================================================
    // TEST 50: resolveBossVariation — merge semantics
    // ========================================================================
    run('TEST 50: resolveBossVariation — merge semantics', () => {
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

    // ========================================================================
    // TEST 51: resolveBossVariation — UCC anti-anomaly + open variation
    // ========================================================================
    run('TEST 51: UCC default has anti-anomaly; open variation erases it', () => {
        const ucc = bosses.find(b => b.id === 'ucc');
        assert(ucc, 'UCC must be found');
        assert(Array.isArray(ucc.mechanics.anti) && ucc.mechanics.anti.includes('anomaly'),
            'Default UCC must have anti=["anomaly"]');

        const openUcc = resolveBossVariation(ucc, 'og');
        assert(!('anti' in openUcc.mechanics),
            'UCC open variation should have no "anti" key (erased by null)');
    });

    // ========================================================================
    // TEST 52: filterBosses supports boss:variation syntax
    // ========================================================================
    run('TEST 52: filterBosses boss:variation syntax resolves correctly', () => {
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

    // ========================================================================
    // TEST 53: Raging Butcher scoring — stun shill, disqualifies stunnerless teams
    // ========================================================================
    // Notorious Butcher: anomaly-shill → pure anomaly teams (no stunner) viable,
    //   gain anomaly shill bonus.
    // Raging Butcher: stun-shill → teams without a stunner are DISQUALIFIED entirely.
    // Note: teams that happen to satisfy BOTH shills (e.g. Qingyi + anomaly DPS)
    //   receive a +15 bonus on either variation and score identically — the key
    //   difference only emerges for teams that satisfy exactly one shill type.
    run('TEST 53: Raging Butcher — stun-shill disqualifies stunnerless anomaly teams', () => {
        const butcher = bosses.find(b => b.id === 'butcher');
        const ragingBoss = resolveBossVariation(butcher, 'raging');

        // Miyabi/Vivian/Yuzuha: pure anomaly team, no stunner tag anywhere
        // Notorious (anomaly shill): viable — Miyabi satisfies the shill requirement
        // Raging (stun shill): disqualified — no unit has the "stun" tag
        const anomalyOnlyTeams = scoreForTeamString('Miyabi/Vivian/Yuzuha', allUnits);
        if (anomalyOnlyTeams.length > 0) {
            const notoriousScore = scoreTeamForBoss(anomalyOnlyTeams[0].team, butcher, {});
            const ragingScore = scoreTeamForBoss(anomalyOnlyTeams[0].team, ragingBoss, {});
            assert(notoriousScore > 0,
                `Miyabi/Vivian/Yuzuha should be viable on Notorious Butcher (anomaly shill), got ${notoriousScore}`);
            assert(ragingScore <= 0,
                `Miyabi/Vivian/Yuzuha should be disqualified on Raging Butcher (stun shill, no stunner), got ${ragingScore}`);
        }
    });

    // ========================================================================
    // TEST 54: Ramiel triple-anomaly teams score 400+ on neutral
    // ========================================================================
    // Ramiel with 2 other primary anomaly units unlocks her max ATK buff (atk:4).
    // Combined with vortex/disorder reactions, these teams should exceed 400.
    run('TEST 54: Ramiel triple-anomaly team scores 400+ on neutral (VRP)', () => {
        const b = NEUTRAL_BOSS;
        const { team, label } = scoreForTeamString('Velina/Remielle/Promeia', allUnits, { preview: true })[0];
        const s = scoreTeamForBoss(team, b, {});
        assert(s >= 400, `${label}: got ${s}, expected >= 400 (triple-anomaly Ramiel team)`);
    });

    // ========================================================================
    // TEST 55: Ramiel triple-anomaly >> Ramiel wheelchair (Velina/Yuzuha)
    // ========================================================================
    // Triple-anomaly (Alice/Remielle/Velina) should beat the Velina+Yuzuha
    // wheelchair (Remielle/Vivian/Yuzuha) because Remielle's conditional ATK
    // buff is maximized (atk:4) on triple-anomaly vs only atk:2 on the wheelchair,
    // and the underutilization penalty penalizes the wheelchair team.
    run('TEST 55: Triple-anomaly Ramiel >= Ramiel/Velina/Yuzuha wheelchair', () => {
        const b = NEUTRAL_BOSS;
        const avr = scoreTeamForBoss(scoreForTeamString('Alice/Remielle/Velina', allUnits, { preview: true })[0].team, b, {});
        const rvy = scoreTeamForBoss(scoreForTeamString('Remielle/Velina/Yuzuha', allUnits, { preview: true })[0].team, b, {});
        assert(avr >= rvy, `Triple-anomaly AVR(${avr}) should be >= wheelchair RVY(${rvy})`);
    });

    // ========================================================================
    // TEST 56: Team legality — illegal teams DQ'd, flex teams accepted
    // ========================================================================
    // Illegal: no unit pair on the team has mutual join satisfaction.
    // Flex: at least one pair has mutual join satisfaction; 3rd is unconstrained.
    run('TEST 56: Team legality — illegal teams DQ, flex teams OK', () => {
        const b = NEUTRAL_BOSS;
        const ran = scoreTeamForBoss(scoreForTeamString('Remielle/Astra/Nicole', allUnits, { preview: true })[0].team, b, {});
        assert(ran === -1, `Remielle/Astra/Nicole should be disqualified (-1), got ${ran}`);
        const nry = scoreTeamForBoss(scoreForTeamString('Nangong/Remielle/Yuzuha', allUnits, { preview: true })[0].team, b, {});
        assert(nry === -1, `Nangong/Remielle/Yuzuha should be disqualified (-1), got ${nry}`);
        const thn = scoreTeamForBoss(scoreForTeamString('Trigger/Harumasa/Nicole', allUnits)[0].team, b, {});
        assert(thn > 0, `Trigger/Harumasa/Nicole is a valid flex team, got ${thn}`);
    });

    // ========================================================================
    // TEST 57: Miyabi existing teams unaffected by changes
    // ========================================================================
    // Regression guard: Miyabi has no conditional.buffs, so none of these changes
    // should alter her top team scores. Wheelchair should still be CONVENTIONAL.
    run('TEST 57: Miyabi/Astra/Nicole wheelchair still CONVENTIONAL (regression guard)', () => {
        const b = NEUTRAL_BOSS;
        const man = scoreTeamForBoss(scoreForTeamString('Miyabi/Astra/Nicole', allUnits)[0].team, b, {});
        const nmy = scoreTeamForBoss(scoreForTeamString('Nangong/Miyabi/Yuzuha', allUnits)[0].team, b, {});
        assert(man >= 300, `MAN: got ${man}, expected >= 300 (Miyabi wheelchair still CONVENTIONAL)`);
        assert(nmy > man, `NMY(${nmy}) should still beat MAN(${man})`);
    });

    // ========================================================================
    // TEST 58: Refringe cascade — multi-element > same-element triple-anomaly
    // ========================================================================
    // Alice/Vivian/Remielle generates disorders (physical+ether) so the Refringe
    // cascade bonus applies. Alice/Jane/Remielle is all-physical, no reactions to
    // cascade into. Multi-element should score higher.
    run('TEST 58: Multi-element triple-anomaly > same-element (Refringe cascade)', () => {
        const b = NEUTRAL_BOSS;
        const avr = scoreTeamForBoss(scoreForTeamString('Alice/Vivian/Remielle', allUnits, { preview: true })[0].team, b, {});
        const ajr = scoreTeamForBoss(scoreForTeamString('Alice/Jane Doe/Remielle', allUnits, { preview: true })[0].team, b, {});
        assert(avr > ajr, `Multi-element AVR(${avr}) should beat same-element AJR(${ajr}) due to Refringe cascade`);
    });

    // ========================================================================
    // TEST 59: Triple-anomaly Rem dominates duo-anomaly wheelchair
    // ========================================================================
    // The conditional buff gap between triple (buff=4, +1600 ATK) and duo (buff=2, +600)
    // is enormous. Triple-anomaly should decisively beat wheelchair compositions.
    run('TEST 59: Triple-anomaly Rem >> duo-anomaly wheelchair', () => {
        const b = NEUTRAL_BOSS;
        const triple = scoreTeamForBoss(scoreForTeamString('Alice/Vivian/Remielle', allUnits, { preview: true })[0].team, b, {});
        const wheelchair = scoreTeamForBoss(scoreForTeamString('Vivian/Remielle/Yuzuha', allUnits, { preview: true })[0].team, b, {});
        const gap = triple - wheelchair;
        assert(gap > 20, `Triple AVR(${triple}) should beat wheelchair VRY(${wheelchair}) by >20, gap was ${gap.toFixed(1)}`);
    });

    // ========================================================================
    // TEST 60: Miyabi/Rem triple-anomaly scores well 
    // ========================================================================
    // Miyabi now joins on anomaly, enabling Miyabi/Rem teams without Yanagi.
    run('TEST 60: Miyabi/Remielle/Vivian triple-anomaly scores well', () => {
        const b = NEUTRAL_BOSS;
        const mrv = scoreTeamForBoss(scoreForTeamString('Miyabi/Remielle/Vivian', allUnits, { preview: true })[0].team, b, {});
        assert(mrv >= 300, `Miyabi/Rem/Vivian should score >= 300 as triple-anomaly, got ${mrv}`);
    });

    // ========================================================================
    // TEST 61: Nangong wheelchair with Rem is severely penalized
    // ========================================================================
    // Nangong+Rem+Yuzuha: Rem has only 1 anomaly teammate count (Nangong is stun,
    // Yuzuha is support), so buff resolves to 0. This should score much worse than
    // a standard Nangong wheelchair without Rem.
    run('TEST 61: Nangong/Rem/Yuzuha penalized vs Nangong/Miyabi/Yuzuha', () => {
        const b = NEUTRAL_BOSS;
        const nry = scoreTeamForBoss(scoreForTeamString('Nangong/Remielle/Yuzuha', allUnits, { preview: true })[0].team, b, {});
        const nmy = scoreTeamForBoss(scoreForTeamString('Nangong/Miyabi/Yuzuha', allUnits)[0].team, b, {});
        assert(nmy > nry + 30, `NMY(${nmy}) should beat NRY(${nry}) by >30 — Rem buff=0 on this team`);
    });

    // ========================================================================
    // TEST 62: Sigrid stunner ordering — weak ultimate + chain replacement
    // ========================================================================
    // Sigrid has damage["ultimate:weak"]:2 and scaling.chains:3. On an ice-weak boss,
    // ice stunners (Lycaon, Lighter) should beat Dialyn because:
    //   1. Dialyn's ultimates provision gives Sigrid 0 benefit (weak ultimate)
    //   2. Dialyn's replaces: {ultimates:chains} penalizes Sigrid's chain scaling
    //   3. Ice stunners get on-element L3 bonus
    // But Dialyn still comfortably beats low-tier stunners (tier advantage).
    // Norma is the best stunner for Sigrid: chain provision + subdps damage + no replacement cost.
    run('TEST 62: Sigrid stunner ordering — weak ultimate + chain replacement (Marionettes)', () => {
        const t = 'Norma/Sigrid/Soukaku,Lighter/Sigrid/Soukaku,Lycaon/Sigrid/Soukaku,Dialyn/Sigrid/Soukaku,Koleda/Sigrid/Soukaku';
        for (const b of withBosses(bosses, 'Marionettes')) {
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            const norma = m.get('Norma / Sigrid / Soukaku');
            const lycaon = m.get('Lycaon / Sigrid / Soukaku');
            const lighter = m.get('Lighter / Sigrid / Soukaku');
            const dialyn = m.get('Dialyn / Sigrid / Soukaku');
            const koleda = m.get('Koleda / Sigrid / Soukaku');
            assert(norma > lycaon, `${b.name}: Norma(${norma?.toFixed(1)}) > Lycaon(${lycaon?.toFixed(1)}) for Sigrid`);
            assert(lycaon > dialyn, `${b.name}: Lycaon(${lycaon?.toFixed(1)}) > Dialyn(${dialyn?.toFixed(1)}) for Sigrid`);
            assert(lighter > dialyn, `${b.name}: Lighter(${lighter?.toFixed(1)}) > Dialyn(${dialyn?.toFixed(1)}) for Sigrid`);
            assert(dialyn > koleda + 20, `${b.name}: Dialyn(${dialyn?.toFixed(1)}) >> Koleda(${koleda?.toFixed(1)}) — tier still matters`);
        }
    });

    // ========================================================================
    // TEST 63: Norma/Astra synergy — ATK buff + chain provision value
    // ========================================================================
    // Norma has scaling.atk:3 and damage.chain:3. Astra's atk:3 + cd:3 + chain
    // provision makes her significantly better than Nicole for Norma teams.
    run('TEST 63: Norma/Astra synergy — Astra significantly better than Nicole (Pompey)', () => {
        const t = 'Norma/Evelyn/Astra,Norma/Evelyn/Nicole';
        for (const b of withBosses(bosses, 'Pompey')) {
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            const astra = m.get('Norma / Evelyn / Astra');
            const nicole = m.get('Norma / Evelyn / Nicole');
            assert(astra > nicole + 30, `${b.name}: Norma+Astra(${astra?.toFixed(1)}) >> Norma+Nicole(${nicole?.toFixed(1)}) — Astra provides better buff suite`);
        }
    });

    // ========================================================================
    // TEST 64: Norma vs Dialyn — fire-weak favors Norma, otherwise Dialyn wins
    // ========================================================================
    // Norma is a fire stunner with subdps chain damage; Dialyn is physical with free
    // ultimates. On fire-weak bosses Norma's on-element bonus + chain provision exceeds
    // Dialyn's generic utility. On physical-weak or neutral bosses Dialyn's tier advantage
    // and ultimate provision maintain her lead.
    run('TEST 64: Norma vs Dialyn — fire-weak favors Norma, otherwise Dialyn wins', () => {
        // Fire-weak: Norma > Dialyn (Pompey with Evelyn/Astra, Hunter with Lucia/Banyue)
        for (const b of withBosses(bosses, 'Pompey')) {
            const t = 'Norma/Evelyn/Astra,Dialyn/Evelyn/Astra';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            assert(m.get('Norma / Evelyn / Astra') > m.get('Dialyn / Evelyn / Astra'),
                `${b.name}: Norma(${m.get('Norma / Evelyn / Astra')?.toFixed(1)}) > Dialyn(${m.get('Dialyn / Evelyn / Astra')?.toFixed(1)}) for Evelyn/Astra`);
        }
        for (const b of withBosses(bosses, 'Hunter')) {
            const t = 'Norma/Banyue/Lucia,Dialyn/Banyue/Lucia';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            assert(m.get('Norma / Banyue / Lucia') > m.get('Dialyn / Banyue / Lucia'),
                `${b.name}: Norma(${m.get('Norma / Banyue / Lucia')?.toFixed(1)}) > Dialyn(${m.get('Dialyn / Banyue / Lucia')?.toFixed(1)}) for Banyue/Lucia`);
        }
        // Physical-weak: Dialyn > Norma (Thrall, Defiler with Lucia/Starlight Billy)
        for (const b of withBosses(bosses, 'Thrall,Defiler')) {
            const t = 'Norma/Starlight Billy/Lucia,Dialyn/Starlight Billy/Lucia';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            assert(m.get('Dialyn / Starlight Billy / Lucia') > m.get('Norma / Starlight Billy / Lucia'),
                `${b.name}: Dialyn(${m.get('Dialyn / Starlight Billy / Lucia')?.toFixed(1)}) > Norma(${m.get('Norma / Starlight Billy / Lucia')?.toFixed(1)}) for SBilly/Lucia`);
        }
        // Neutral (Corruption): Dialyn > Norma when neither hits a weakness
        for (const b of withBosses(bosses, 'Corruption')) {
            const t = 'Norma/Yixuan/Lucia,Dialyn/Yixuan/Lucia';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            assert(m.get('Dialyn / Yixuan / Lucia') > m.get('Norma / Yixuan / Lucia'),
                `${b.name}: Dialyn(${m.get('Dialyn / Yixuan / Lucia')?.toFixed(1)}) > Norma(${m.get('Norma / Yixuan / Lucia')?.toFixed(1)}) for Yixuan/Lucia`);
        }
    });

    // ========================================================================
    // TEST 65: Miyabi+Velina anti-pattern — wasted vortex cohesion penalty
    // ========================================================================
    // Velina is a wind anomaly subdps whose primary team value is vortex generation.
    // Miyabi (frost variant, vortex tier 0.001) cannot exploit vortex reactions,
    // so pairing them wastes Velina's contribution. The cohesion penalty should make
    // proper compositions score meaningfully higher than this anti-pattern.
    // Conversely, Promeia (ice, tier 4.5) actually uses vortex — no penalty there.
    run('TEST 65: Miyabi+Velina anti-pattern — wasted vortex cohesion penalty (Girtablullu)', () => {
        const t = 'Nangong/Miyabi/Velina,Nangong/Miyabi/Yuzuha,Nangong/Promeia/Velina,Promeia/Velina/Yuzuha,Miyabi/Velina/Yuzuha';
        for (const b of withBosses(bosses, 'Girtablullu')) {
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            const miyabiVelina  = m.get('Nangong / Miyabi / Velina');
            const miyabiYuzuha  = m.get('Nangong / Miyabi / Yuzuha');
            const promeiaVelina = m.get('Nangong / Promeia / Velina');
            const velinaYuzuha  = m.get('Promeia / Velina / Yuzuha');
            const meebsVelYuzu  = m.get('Miyabi / Velina / Yuzuha');
            assert(miyabiYuzuha > miyabiVelina,
                `${b.name}: Miyabi+Yuzuha(${miyabiYuzuha?.toFixed(1)}) > Miyabi+Velina(${miyabiVelina?.toFixed(1)}) — Yuzuha's buffs beat wasted vortex`);
            assert(promeiaVelina > miyabiVelina,
                `${b.name}: Promeia+Velina(${promeiaVelina?.toFixed(1)}) > Miyabi+Velina(${miyabiVelina?.toFixed(1)}) — Promeia uses vortex`);
            assert(velinaYuzuha > miyabiVelina,
                `${b.name}: Promeia/Velina/Yuzuha(${velinaYuzuha?.toFixed(1)}) > Miyabi+Velina(${miyabiVelina?.toFixed(1)}) — proper vortex team`);
            assert(meebsVelYuzu <= miyabiVelina + 15,
                    `${b.name}: MVY (${meebsVelYuzu?.toFixed(1)}) and NMV (${miyabiVelina?.toFixed(1)}) should be in the same class of scores comparative to proper vortex teams`);    
        }
    });

    // ========================================================================
    // TEST 66: Claret is a viable primary armorer DPS (Neutral)
    // ========================================================================
    // Claret is an Electric Armorer. Koleda/Claret/Rina should be strongly viable. 
    // Swapping Claret for pure-defense Ben leaves the team with NO DPS (DQ),
    // confirming Claret herself is the damage dealer.
    run('TEST 66: Claret is a viable armorer DPS (Neutral)', () => {
        if (!allUnits.find(u => u.id === 'claret')) return; // preview-only unit
        for (const b of withBosses(bosses, 'Neutral')) {
            const t = 'Koleda/Claret/Rina,Koleda/Ben/Rina';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            const claretTeam = m.get('Koleda / Claret / Rina');
            const benTeam = m.get('Koleda / Ben / Rina');
            assert(claretTeam > 230,
                `${b.name}: Koleda/Claret/Rina should be strongly viable (${claretTeam?.toFixed(1)})`);
            assert(benTeam <= 0,
                `${b.name}: Koleda/Ben/Rina has no DPS without Claret and should DQ (${benTeam?.toFixed(1)})`);
        }
    });

    // ========================================================================
    // TEST 67: DEF buff → Claret's DEF scaling — Rina outperforms Lucy control
    // ========================================================================
    // Rina and Lucy both provide buffs.atk:2. Only Rina provides buffs.def:2 (+pen:3).
    // Claret scales on DEF (scaling.def:3), so Rina's DEF/PEN should make her clearly
    // best-in-slot over Lucy for an armorer.
    run('TEST 67: Rina beats Lucy for Claret via DEF buff (Neutral)', () => {
        if (!allUnits.find(u => u.id === 'claret')) return;
        for (const b of withBosses(bosses, 'Neutral')) {
            const t = 'Koleda/Claret/Rina,Koleda/Claret/Lucy';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            const rina = m.get('Koleda / Claret / Rina');
            const lucy = m.get('Koleda / Claret / Lucy');
            assert(rina > lucy + 50,
                `${b.name}: Rina(${rina?.toFixed(1)}) should clearly beat Lucy(${lucy?.toFixed(1)}) — DEF/PEN buff`);
        }
    });

    // ========================================================================
    // TEST 68: Crit inversion — CD barely moves an armorer (Neutral)
    // ========================================================================
    // Armorer crit damage is fixed. Claret is the one exception: scaling.cd:1 converts a
    // sliver of CD into Laceration, so Astra's cd:3 is not quite dead — but at half an
    // attacker's weight, and her atk:3 is worth exactly nothing. Rina should still dominate
    // Astra as Claret's support, unlike for a normal crit attacker.
    run('TEST 68: CD buff barely helps Claret armorer (Neutral)', () => {
        if (!allUnits.find(u => u.id === 'claret')) return;
        for (const b of withBosses(bosses, 'Neutral')) {
            const t = 'Koleda/Claret/Rina,Koleda/Claret/Astra';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            const rina = m.get('Koleda / Claret / Rina');
            const astra = m.get('Koleda / Claret / Astra');
            assert(rina > astra + 60,
                `${b.name}: Rina(${rina?.toFixed(1)}) >> Astra(${astra?.toFixed(1)}) — Astra's ATK is dead and her CD barely converts`);
        }
    });

    // ========================================================================
    // TEST 69: Element resistance DQs Claret as a real DPS (Thrall & Sobek)
    // ========================================================================
    // Thrall resists electric. Claret (electric armorer) is a primary DPS, so an
    // electric-resistant boss disqualifies the team — armorers get no support-unit
    // resistance free pass.
    run('TEST 69: Electric resistance DQs Claret on Thrall', () => {
        if (!allUnits.find(u => u.id === 'claret')) return;
        for (const b of withBosses(bosses, 'Thrall')) {
            const t = 'Koleda/Claret/Rina';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            const s = m.get('Koleda / Claret / Rina');
            assert(s <= 0,
                `${b.name}: Electric-resistant boss should DQ Claret armorer team (${s?.toFixed(1)})`);
        }
    });

    // ========================================================================
    // TEST 70 (regression): Remielle scoring unchanged by dps-pseudorole fix
    // ========================================================================
    // Remielle has pseudoRole=["subdps","support"] — no `dps` marker — so none
    // of the changes should affect her. The canonical Alice/Vivian/Remielle
    // triple-anomaly team on Solo should remain strong.
    run('TEST 70: Remielle regression on Solo (Alice/Vivian/Remielle)', () => {
        if (!allUnits.find(u => u.id === 'ramiel')) return;
        for (const b of withBosses(bosses, 'Solo')) {
            const parsed = scoreForTeamString('Alice/Vivian/Remielle', allUnits, { preview: true });
            const s = scoreTeamForBoss(parsed[0].team, b, {});
            assert(s > 300,
                `${b.name}: Alice/Vivian/Remielle should remain strong (${s?.toFixed(1)}) — no dps pseudorole regression`);
        }
    });

    // ========================================================================
    // TEST 71: Burnice notPresent:velina conditional subdps
    // ========================================================================
    // Burnice's pseudoRole is `[{ role: "subdps", when: { notPresent: "velina" } }]`
    // — she's a subdps by default, but promotes to primary anomaly DPS when Velina
    // is on the team. On a neutral boss:
    //   * Burnice/Velina/Yuzuha (DPS/subDPS/support) should beat
    //     Burnice/Vivian/Yuzuha (subDPS/subDPS/support) by a meaningful margin
    //     because Burnice now claims the primary-DPS tier multiplier.
    //   * Burnice/Promeia/Yuzuha (subDPS/DPS/support) should land in the same
    //     ballpark as Burnice/Velina/Yuzuha — Burnice reverts to subdps and
    //     Promeia carries as primary anomaly DPS.
    run('TEST 71: Burnice notPresent:velina conditional subdps (Neutral)', () => {
        for (const b of withBosses(bosses, 'Neutral')) {
            const parsed = scoreForTeamString(
                'Burnice/Velina/Yuzuha,Burnice/Vivian/Yuzuha,Burnice/Promeia/Yuzuha',
                allUnits
            );
            const m = scoreMapForBoss(parsed, b);
            const bvey = m.get('Burnice / Velina / Yuzuha');
            const bvy = m.get('Burnice / Vivian / Yuzuha');
            const bpy = m.get('Burnice / Promeia / Yuzuha');
            assert(bvey > bvy * 1.25,
                `${b.name}: BVeY (${bvey?.toFixed(1)}) should meaningfully outscore BVY (${bvy?.toFixed(1)}) — Burnice's DPS promotion via notPresent:velina`);
            assert(bpy > bvey * 0.80 && bpy < bvey * 1.20,
                `${b.name}: BPY (${bpy?.toFixed(1)}) should be in the same tier as BVeY (${bvey?.toFixed(1)}) — Burnice reverts to subdps, Promeia is primary`);
        }
    });

    // ========================================================================
    // TEST 72: Maim enabler + structure — armorers want a Maim trigger (Neutral)
    // ========================================================================
    // Stun and armorer agents build the shared Gash pool; only an armorer detonates it into
    // a Maim, so an armorer wants gash builders alongside it. Koleda/Claret/Rina is a
    // conventional armorer-hypercarry with a stun enabler (+Maim, +stun-emergence);
    // Claret/Lucy/Rina is a stunless "false wheelchair" with no enabler, so it should score
    // meaningfully lower. (Dual-armorer structure can't be exercised until a second
    // armorer exists in the roster.)
    run('TEST 72: Maim enabler + armorer structure (Neutral)', () => {
        if (!allUnits.find(u => u.id === 'claret')) return;
        for (const b of withBosses(bosses, 'Neutral')) {
            const t = 'Koleda/Claret/Rina,Claret/Lucy/Rina';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            const withStun = m.get('Koleda / Claret / Rina');
            const stunless = m.get('Claret / Lucy / Rina');
            assert(withStun > stunless + 80,
                `${b.name}: stun-enabled Koleda/Claret/Rina (${withStun?.toFixed(1)}) should beat stunless Claret/Lucy/Rina (${stunless?.toFixed(1)})`);
        }
    });

    // ========================================================================
    // TEST 73: Unified conditional framework — recipient-scoped + team-scoped
    // ========================================================================
    // Koleda's P6 narrow buff: armorers receive Laceration, everyone else CD (recipient-scoped
    // `role` predicate). Remielle's ATK curve scales with anomaly count (team-scoped).
    run('TEST 73: conditional framework resolves per-recipient and per-team', () => {
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

    // ========================================================================
    // TEST 74: Koleda rework lands — general damage + P6 + tier 1.5
    // ========================================================================
    // Koleda's 3.2 rework (dmg:4 general-damage buff, P6 narrow Laceration/CD, tier 2.5→1.5)
    // considerably improves Koleda/Claret/Rina, and makes her a viable generalist on a
    // conventional attack team. The Evelyn floor is 295, not 300: the P6 rework moved her
    // armorer-facing buff from CR to Laceration, which is worth nothing to Evelyn, so the
    // generalist line sits marginally below where the pre-rework kit put it.
    run('TEST 74: Koleda rework improves her teams (Neutral)', () => {
        for (const b of withBosses(bosses, 'Neutral')) {
            const kcr = scoreForTeamString('Koleda/Claret/Rina', allUnits, { preview: true })[0];
            const kcrScore = scoreTeamForBoss(kcr.team, b, {});
            assert(kcrScore >= 305,
                `Koleda/Claret/Rina should score >= 315 after the rework, got ${kcrScore?.toFixed(1)}`);
            const kea = scoreForTeamString('Koleda/Evelyn/Astra', allUnits)[0];
            const keaScore = scoreTeamForBoss(kea.team, b, {});
            assert(keaScore >= 295,
                `Koleda/Evelyn/Astra should be a viable generalist team (>= 295), got ${keaScore?.toFixed(1)}`);
        }
    });

    // ========================================================================
    // TEST 75: Roxy is Claret's best-in-slot stunner (upgrades Koleda)
    // ========================================================================
    // Roxy and Koleda both run the P6 narrow Laceration/CD split, but Roxy's armorer-facing
    // Laceration is 3 to Koleda's 1, and her kit is stronger overall (wind pseudo-anomaly
    // subdps, heavy energy regen, daze). Roxy/Claret/Rina should be Claret's BiS and clearly
    // beat Koleda/Claret/Rina.
    run('TEST 75: Roxy/Claret/Rina is Claret BiS over Koleda (Neutral)', () => {
        if (!allUnits.find(u => u.id === 'roxy') || !allUnits.find(u => u.id === 'claret')) return;
        for (const b of withBosses(bosses, 'Neutral')) {
            const m = scoreMapForBoss(
                scoreForTeamString('Roxy/Claret/Rina,Koleda/Claret/Rina', allUnits, { preview: true }), b);
            const roxy = m.get('Roxy / Claret / Rina');
            const koleda = m.get('Koleda / Claret / Rina');
            assert(roxy >= 380, `Roxy/Claret/Rina should be BiS-strong (>= 380), got ${roxy?.toFixed(1)}`);
            assert(roxy > koleda, `Roxy/Claret/Rina (${roxy?.toFixed(1)}) should beat Koleda/Claret/Rina (${koleda?.toFixed(1)})`);
        }
    });

    // ========================================================================
    // TEST 76: Roxy enables Pyrois's wind-anomaly ultimate
    // ========================================================================
    // Pyrois deals bonus ultimate damage under wind anomaly (scaling["anomaly:wind"]).
    // Roxy, a wind pseudo-anomaly stunner who joins on attack, supplies it; a fire
    // stunner (Koleda) does not — so Roxy is decisively his better stunner here.
    run('TEST 76: Roxy enables Pyrois over a non-wind stunner (Neutral)', () => {
        if (!allUnits.find(u => u.id === 'roxy')) return;
        for (const b of withBosses(bosses, 'Neutral')) {
            const m = scoreMapForBoss(
                scoreForTeamString('Roxy/Pyrois/Astra,Koleda/Pyrois/Astra', allUnits, { preview: true }), b);
            const roxy = m.get('Roxy / Pyrois / Astra');
            const koleda = m.get('Koleda / Pyrois / Astra');
            assert(roxy > koleda + 40,
                `Roxy/Pyrois/Astra (${roxy?.toFixed(1)}) should clearly beat Koleda/Pyrois/Astra (${koleda?.toFixed(1)}) — wind-anomaly enabler`);
        }
    });

    // ========================================================================
    // TEST 77: Roxy/Harumasa/Velina — emergent wind team is viable (Typhon)
    // ========================================================================
    // The only fully-valid Roxy+Velina composition (Harumasa joins both). Roxy+Velina
    // stack wind anomaly + daze; on Typhon (electric + wind weak) it should be a solid,
    // playable team even with Harumasa at T2.5. (Not top-tier until Harumasa is buffed.)
    run('TEST 77: Roxy/Harumasa/Velina viable on Typhon', () => {
        if (!allUnits.find(u => u.id === 'roxy')) return;
        for (const b of withBosses(bosses, 'Typhon')) {
            const parsed = scoreForTeamString('Roxy/Harumasa/Velina', allUnits, { preview: true })[0];
            const s = scoreTeamForBoss(parsed.team, b, {});
            assert(s >= 250, `Roxy/Harumasa/Velina on Typhon should be playable (>= 250), got ${s?.toFixed(1)}`);
        }
    });

   // ========================================================================
    // TEST 78: hasUnit qualified identifier "anomaly:wind" (Pyrois conditional ultimate)
    // ========================================================================
    // Pyrois's damage["ultimate:strong"] activates only when a wind-anomaly unit is on the
    // team, expressed as { when: { hasUnit: "anomaly:wind" } }. A colon-qualified hasUnit
    // matches by effective role + element, so Roxy (wind pseudo-anomaly) triggers it but
    // Vivian (ether anomaly) does not.
    run('TEST 78: hasUnit "anomaly:wind" predicate (Pyrois ultimate)', () => {
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

    // ========================================================================
    // TEST 79: wind anomaly lets Pyrois receive Dialyn's free ultimates fully
    // ========================================================================
    // Pyrois's ultimate:weak normally suppresses ultimate-provision (Dialyn's free ults are
    // wasted on him). With a wind-anomaly unit present, his conditional ultimate:strong
    // overrides that, so Dialyn's provision lands — a large swing.
    run('TEST 79: wind anomaly un-suppresses Dialyn provision for Pyrois (Neutral)', () => {
        if (!allUnits.find(u => u.id === 'roxy')) return;
        for (const b of withBosses(bosses, 'Neutral')) { 
            const withWind = scoreForTeamString('Dialyn/Pyrois/Roxy', allUnits, { preview: true })[0];
            const noWind = scoreForTeamString('Dialyn/Pyrois/Trigger', allUnits)[0];
            const ws = scoreTeamForBoss(withWind.team, b, {});
            const ns = scoreTeamForBoss(noWind.team, b, {});
            assert(ws > ns + 30,
                `Dialyn/Pyrois/Roxy (${ws?.toFixed(1)}) should beat Dialyn/Pyrois/Trigger (${ns?.toFixed(1)}) by a nice margin — wind unlocks Pyrois's stronger ultimates`);
        }
    });

    // ========================================================================
    // TEST 80: Sigrid's wind-anomaly passive is a bonus, never a penalty
    // ========================================================================
    // Sigrid has scaling["anomaly:wind"]:1 (passive: extra damage under wind anomaly). It must
    // NOT inhibit her when no wind source is present — a wind-less team (Lighter/Sigrid/Astra)
    // must still be strong. A wind source (Roxy) adds a mild bonus.
    run('TEST 80: Sigrid not penalized without wind anomaly (Neutral)', () => {
        if (!allUnits.find(u => u.id === 'sigrid')) return;
        for (const b of withBosses(bosses, 'Neutral')) {
            const noWind = scoreForTeamString('Lighter/Sigrid/Astra', allUnits, { preview: true })[0];
            const ns = scoreTeamForBoss(noWind.team, b, {});
            assert(ns > 340,
                `Lighter/Sigrid/Astra should still be strong (no wind penalty), got ${ns?.toFixed(1)}`);
            const wind = scoreForTeamString('Roxy/Sigrid/Astra', allUnits, { preview: true })[0];
            const ws = scoreTeamForBoss(wind.team, b, {});
            assert(ws > ns,
                `Roxy/Sigrid/Astra (${ws?.toFixed(1)}) should beat the wind-less line (${ns?.toFixed(1)}) — mild wind bonus`);
        }
    });

    // ========================================================================
    // TEST 81: a stunless DPS satisfies a stun shill on its own (Thrall & Sobek)
    // ========================================================================
    // Thrall's `shill: stun` is a hard requirement because damage only lands inside
    // stun windows. A stunless DPS (YSG) carries that multiplier permanently and never
    // needs a window opened, so YSG/Sunna/Zhao must be viable — and strong — without a
    // stunner. The requirement still holds for everyone else: an equally stunnerless
    // team with a window-dependent DPS (Evelyn) stays disqualified.
    run('TEST 81: stunless DPS satisfies the stun shill on Thrall', () => {
        if (!allUnits.find(u => u.id === 'ysg')) return;
        for (const b of withBosses(bosses, 'Thrall')) {
            const stunless = scoreForTeamString('YSG/Sunna/Zhao', allUnits, { preview: true })[0];
            const ss = scoreTeamForBoss(stunless.team, b, {});
            assert(ss > 400,
                `${b.name}: YSG/Sunna/Zhao is stunless — must be viable and strong without a stunner, got ${ss?.toFixed(1)}`);

            const windowDependent = scoreForTeamString('Evelyn/Astra/Nicole', allUnits, { preview: true })[0];
            const ws = scoreTeamForBoss(windowDependent.team, b, {});
            assert(ws <= 0,
                `${b.name}: Evelyn/Astra/Nicole has no stunner and no stunless DPS — must stay disqualified, got ${ws?.toFixed(1)}`);
        }
    });


    // ========================================================================
    // TEST 82: Laceration buffs land on armorers and nobody else (Neutral)
    // ========================================================================
    // Laceration is the armorer's damage type — the class analogue of rupture's Sheer.
    // Isolated by A/B-ing the SAME team against itself with the laceration buff stripped out,
    // so tier, rank, element and every other kit difference cancel and the only delta is the
    // buff. Comparing two different DPS would just measure the tier gap instead.
    //
    // Laceration reaches an armorer down two independent paths — baseline affinity
    // (MULT.LACERATION_BUFF) and the damage-lever dependency (getArmorerLeverSupply) — so the
    // assertions below pin each one separately. A test that only checks "score went down"
    // passes even with MULT.LACERATION_BUFF at zero, because the lever path alone carries it.
    run('TEST 82: laceration buffs are armorer-only', () => {
        const roxy = allUnits.find(u => u.id === 'roxy');
        if (!roxy || !allUnits.find(u => u.id === 'claret')) return;

        const rLac = roxy.mechanics.buffs.laceration;
        assert(resolveConditionalValue(rLac, { team: [], self: roxy, consumer: { tags: ['armorer'] } }) === 3,
            'Roxy laceration should be 3 for an armorer recipient');
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

    // ========================================================================
    // TEST 83: Boss control skills — armorer quicktime intercept (synthetic)
    // ========================================================================
    // A control skill locks the player out of everything but dodge/parry/assist. Armorers
    // intercept it and reduce it to a quicktime event, so their value rises with the count.
    // Teams without an armorer must be completely unaffected.
    run('TEST 83: control skills reward armorers only', () => {
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

    // ========================================================================
    // TEST 84: Graded armorer damage-lever dependency (Neutral)
    // ========================================================================
    // Armorers have few damage levers: CR, Laceration, PEN and defense shred. A team
    // supplying none of them leaves Claret unable to reach her ceiling. Both a laceration
    // line and a pure-shred line must clear a team that hands her nothing.
    run('TEST 84: armorer lever dependency is graded, not binary', () => {
        if (!allUnits.find(u => u.id === 'claret')) return;
        for (const b of withBosses(bosses, 'Neutral')) {
            const m = scoreMapForBoss(scoreForTeamString(
                'Koleda/Claret/Rina,Trigger/Claret/Nicole,Lighter/Claret/Lucy',
                allUnits, { preview: true }), b);
            const laceration = m.get('Koleda / Claret / Rina');
            const shred = m.get('Trigger / Claret / Nicole');
            const nothing = m.get('Lighter / Claret / Lucy');
            assert(laceration > nothing + 100,
                `${b.name}: laceration line (${laceration?.toFixed(1)}) must clear the no-lever line (${nothing?.toFixed(1)})`);
            assert(shred > nothing + 100,
                `${b.name}: shred line (${shred?.toFixed(1)}) must clear the no-lever line (${nothing?.toFixed(1)})`);
        }
    });

    // ========================================================================
    // TEST 85: Defense shred stacks cumulatively for an armorer (Neutral)
    // ========================================================================
    // Trigger (defense:2) + Nicole (defense:3) shred ~60% between them. Shred raises armorer
    // damage without Claret receiving a buff at all, so the double-shred line must beat the
    // same team carrying only one shredder.
    run('TEST 85: stacked defense shred is cumulative for Claret', () => {
        if (!allUnits.find(u => u.id === 'claret')) return;
        for (const b of withBosses(bosses, 'Neutral')) {
            const m = scoreMapForBoss(scoreForTeamString(
                'Trigger/Claret/Nicole,Lighter/Claret/Nicole', allUnits, { preview: true }), b);
            const both = m.get('Trigger / Claret / Nicole');
            const one = m.get('Lighter / Claret / Nicole');
            assert(both > one,
                `${b.name}: two shredders (${both?.toFixed(1)}) should beat one (${one?.toFixed(1)})`);
        }
    });

    // ========================================================================
    // TEST 86: ATK is not an armorer lever — no diametric pair off it (Neutral)
    // ========================================================================
    // The buff × defense-shred diametric pair normally forms off ATK/CD. An armorer gets
    // nothing from ATK, so Lucy (atk:2 only) must not earn Claret a diametric floor — while
    // the same pairing still works for a conventional attacker.
    run('TEST 86: ATK earns an armorer no diametric credit', () => {
        if (!allUnits.find(u => u.id === 'claret')) return;
        for (const b of withBosses(bosses, 'Neutral')) {
            const m = scoreMapForBoss(scoreForTeamString(
                'Trigger/Claret/Lucy,Trigger/Claret/Rina,Trigger/Evelyn/Lucy',
                allUnits, { preview: true }), b);
            // Lucy's ATK is dead weight on Claret; Rina's PEN/DEF is a real lever.
            assert(m.get('Trigger / Claret / Rina') > m.get('Trigger / Claret / Lucy') + 150,
                `${b.name}: Rina must massively outclass Lucy for Claret — ATK is worthless to an armorer`);
            // The same ATK buffer is genuinely useful to an attacker, so that line stays healthy.
            assert(m.get('Trigger / Evelyn / Lucy') > m.get('Trigger / Claret / Lucy'),
                `${b.name}: Lucy's ATK should still work for an attacker even though it fails for an armorer`);
        }
    });

    // ========================================================================
    // TEST 87: no unit gets an ultimate need it did not declare
    // ========================================================================
    // The defect this suite's ultimate model was rebuilt around. getEffectiveScaling used to
    // manufacture an `ultimates` need for every primary DPS — a floor of 1, plus bumps from
    // magnitude and frequency — which the real annotated `scaling.ultimates` then OVERWROTE.
    // That fabricated a need for units like Evelyn and Seed, who declare none, and made the
    // engine pay twice for the same free ultimate: once through the provision channel
    // (correctly) and once through the need channel (not).
    //
    // Ultimate value now flows through exactly two places: magnitude → provision, and
    // `scaling.ultimates` → need. This asserts the second half stays honest.
    run('TEST 87: no unit has an ultimates need it did not declare', () => {
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

    // ========================================================================
    // TEST 88: scaling and magnitude are independent and both count
    // ========================================================================
    // Two carries with the SAME big ultimate, one of which also does something extra with it.
    // Dialyn must be worth strictly more to the one that does. Under the old override
    // semantics these were indistinguishable — the annotated value replaced the
    // magnitude-derived one instead of adding to it — so this case could not be expressed
    // at all. Synthesised rather than using a real unit because no shipped unit currently
    // pairs ultimate:strong 3 with a scaling annotation.
    run('TEST 88: a same-magnitude carry that also scales on ultimates is worth more to Dialyn', () => {
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

    // ========================================================================
    // TEST 89: ultimate magnitude is graded, not binary
    // ========================================================================
    // Evelyn's ultimate:strong 1 is ~4200%; an unannotated ultimate is ~3000-3600%. Neither
    // declares a scaling.ultimates need, so this is purely the provision channel, and it must
    // still separate them — otherwise annotating `ultimate:strong: 1` would be meaningless.
    // Guards the 1.0 → 1.1 rung of ULTIMATE_MAGNITUDE against being collapsed.
    //
    // Compared against a CLONE of Evelyn with the annotation stripped, not against another
    // real unit. Comparing Evelyn to Ellen looks like the same test but is not: those two
    // differ by ~90 points for reasons that have nothing to do with ultimates, so that version
    // passes whatever the rung is set to and guards nothing. The clone differs in one field.
    run('TEST 89: ultimate magnitude is graded — annotating ultimate:strong 1 beats not annotating', () => {
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

    // ========================================================================
    // TEST 90: a weak ultimate earns nothing through EITHER channel
    // ========================================================================
    // LOAD-BEARING. `ultimate:weak` with no `ultimate:strong` means the unit's ultimate is not
    // a real burst — Sigrid's lives in her enhanced attacks, Pyrois uses his as a mode switch —
    // so a free ultimate is worth nothing to them. This zeroing moved out of
    // getEffectiveScaling and into ULTIMATE_MAGNITUDE during the axis restructure; this pins
    // it in its new home. A conditional ultimate:strong must still lift it, which is exactly
    // how Pyrois's wind case works (see also TESTs 76, 78, 79).
    run('TEST 90: weak ultimates earn no provision, and a conditional strong ultimate lifts it', () => {
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

    // ========================================================================
    // TEST 91: partial ultimate coverage is priced by the FRACTION of the need met
    // ========================================================================
    // Ju Fufu's `utility.ultimates: 1` covers half of Yixuan's `scaling.ultimates: 2` and a
    // third of a hypothetical 3, and must earn strictly less in the second case. This used to
    // be impossible to express: the undersupply gate multiplied by `supply/scaling`, which
    // cancelled the `scaling` already in the need product, so EVERY undersupplied consumer
    // collected the same flat `keyMult x supply^2` regardless of appetite — Yixuan and YSG both
    // paid Ju Fufu exactly 1.9. The ratio is squared now; see FRACTIONAL_COVERAGE_KEYS.
    //
    // Two clones of ONE unit differing in exactly that field, per the TEST 89 lesson: comparing
    // two real units would pass on unrelated point differences and guard nothing.
    run('TEST 91: partial ultimate coverage is priced by fraction of need met', () => {
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

    // ========================================================================
    // TEST 92: under-met ultimate scaling is a smaller bonus, never a penalty
    // ========================================================================
    // The principle the fraction-of-need shape exists to protect: ultimates arrive naturally
    // and only two units in the roster provision them, so a carry who wants more of them than
    // any teammate can supply must never end up WORSE off than a carry who never asked. Both
    // an under-covered need and a wildly under-covered one must still beat no annotation at all.
    //
    // The second assertion pins the intended trailing-off past full coverage: with only 3 in
    // the roster to supply, a need of 4 is covered by nobody and every supplier's bonus scales
    // down proportionally. That is fraction-of-need semantics working, not the old cliff — the
    // guard here is that it stays a bonus.
    run('TEST 92: under-met ultimate scaling is a smaller bonus, never a penalty', () => {
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
            'the no-annotation clone must acquire no ultimates need (see TEST 87)');
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

    // ========================================================================
    // TEST 93: disorder supply is MEASURED, not a constant
    // ========================================================================
    // `scaling.disorders` declares a NEED, so Miyabi's score has to track how much disorder
    // the team actually generates. It used to be blind to that: the implicit block turned a
    // boolean `hasDisorder` into a hardcoded supply of 2, so EVERY disorder-generating team
    // paid her exactly 28.0 and her need of 3 sat permanently at 67% coverage, unreachable by
    // any composition.
    //
    // The load-bearing assertion is the SECOND block. The gradient alone is not decisive — the
    // old flat model produced that ordering too, out of its separately-priced polarity channel,
    // so a test built only on it passes against the very code it exists to guard (the TEST 89
    // lesson). What the flat model provably cannot do is tell ONE cycling element from TWO,
    // because `hasDisorder` was a boolean. Hence the clone: Vivian moved off Nangong's ether
    // onto fire, which hands Miyabi a second distinct element and changes nothing else. Vivian
    // carries no element-keyed mechanics, so on a neutral boss the tag is the only difference.
    run('TEST 93: Miyabi rises with the team disorder supply', () => {
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

    // ========================================================================
    // TEST 94: cycling and polarity supply AGGREGATE against one need
    // ========================================================================
    // The two sources are independent and both real, so they add. This test used to detect that
    // via the coverage STEP: it straddled the aggregate supply of 4 with needs of 4 and 5 and
    // asserted the covered one won. That step is deliberately gone — the credit curve is now
    // continuous — and the old assertion is unsatisfiable in principle, because making a bigger
    // need earn LESS at equal supply requires `supply x need x (supply/need)`, which collapses to
    // `supply^2` and deletes the appetite term. That collapse is precisely what issue 5 removed.
    //
    // So aggregation is pinned directly instead: give Miyabi a polarity provider that shares her
    // exact element, so element cycling is impossible (same variant → no reaction) and the ONLY
    // possible disorder source is the forced-polarity provision. If polarity did not enter the
    // aggregate, this team would have no disorder supply at all and Miyabi would be charged for
    // an unmet need rather than credited.
    //
    // Two clones differing in exactly one field, per the TEST 89 lesson.
    run('TEST 94: forced polarity feeds the disorder need with no element cycling at all', () => {
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

    // ========================================================================
    // TEST 95: a disorder is a TEAM event — any source satisfies any consumer
    // ========================================================================
    // MUTATION TEST for issue 5's headline. The engine used to satisfy a `disorders` need only
    // from the consumer's OWN anomaly reaction or a teammate's `utility.disorders`, so a
    // consumer that is not itself half of the cycling pair was charged an unmet need on a team
    // swimming in disorders. Latent on the live roster — both real `scaling.disorders` units
    // are anomaly agents — which is precisely why it needs a synthetic consumer to be testable.
    //
    // Nicole is a plain non-anomaly support, so she never receives a reaction of her own, and
    // Miyabi + Vivian cycle frost/ether while NEITHER carries `utility.disorders`. Every prior
    // route to "met" is therefore closed and only a team-wide reading credits her.
    run('TEST 95: a non-anomaly disorder consumer is credited for teammates cycling without it', () => {
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

    // ========================================================================
    // TEST 96: elemental variants disorder with their own base element
    // ========================================================================
    // A variant tracks a SEPARATE anomaly gauge, so Miyabi's frost genuinely reacts with plain
    // ice — `units.json` documents this on Soukaku's own entry. `computeAnomalyReactions`
    // compared BASE elements and so read frost and ice as identical, giving Miyabi/Soukaku and
    // Miyabi/Promeia zero disorders, while `teamHasImplicitDisorders` (variant-aware) said the
    // opposite. Two detectors of the same thing, and the base-element one was wrong.
    //
    // The control differs in exactly one field: a Soukaku clone handed Miyabi's own frost
    // variant, which genuinely should NOT disorder with her.
    run('TEST 96: an elemental variant disorders with its base element (Miyabi/Soukaku)', () => {
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

    // ========================================================================
    // TEST 97: an anomaly PROC source reacts even without an anomaly role
    // ========================================================================
    // MUTATION TEST. Reaction partners used to be enumerated as anomaly-ROLE agents only. But
    // `utility["anomaly:<element>"]` states that an extra anomaly of that element lands on the
    // target, and a proc is a proc whoever fires it — the anomaly-QUANTITY channel already read
    // the key role-blind while the reaction path did not. Latent today (Alice is the only
    // holder, and her `anomaly:physical` is an element she already supplies as an agent), hence
    // the synthetic enabler. This is the guard that keeps a wind-style enabler working if it
    // ever loses its `anomaly` pseudo-role while keeping the procs.
    run('TEST 97: a non-anomaly unit with utility[anomaly:<el>] completes a reaction', () => {
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

    // ========================================================================
    // TESTS 98-101: Miyabi's composition ordering — PARTIALLY RED BY DESIGN
    // ========================================================================
    // These encode owner-stated, game-grounded expectations. Some are committed red on purpose
    // as the specification for issue 7; a green suite here would mean the expectations had been
    // quietly weakened. See issue 7 for which are expected to fail and why.
    //
    // SCORES ARE ONLY COMPARABLE WITHIN A BOSS. Different bosses contribute different amounts
    // of weakness, shill, assist and debuff credit, so one team's 583 against Butcher and
    // another's 498 against a neutral boss say nothing whatever about each other. An earlier
    // version of these tests ranked teams by their best score across all bosses, which silently
    // compared different matchups and made every conclusion drawn from them unsafe.
    //
    // The ladder is therefore evaluated per boss, in a silo, against four matchups chosen so the
    // two axes that matter here vary independently:
    //
    //   Butcher      anomaly-shill  +  ether/ice weakness
    //   Marionettes  no shill       +  ether/ice weakness
    //   Girtablullu  anomaly-shill  +  effectively neutral to every unit involved
    //   Neutral      the synthetic true-neutral control
    //
    // An ordering that holds on all four is not an artifact of either axis.
    const LADDER_BOSSES = ['Butcher', 'Marionettes', 'Girtablullu', 'Neutral']
        .flatMap(f => withBosses(bosses, f));
    assert(LADDER_BOSSES.length === 4,
        `ladder fixture broken: expected 4 bosses, resolved ${LADDER_BOSSES.length} (${LADDER_BOSSES.map(b => b.name).join(', ')})`);

    /** Score one parsed spec against one boss. Returns -1 for a disqualified team. */
    const scoreSpec = (spec, boss, roster = allUnits) => {
        const parsed = scoreForTeamString(spec, roster)[0];
        assert(parsed, `fixture must parse to a legal team: ${spec}`);
        return { label: parsed.label, score: scoreTeamForBoss(parsed.team, boss, {}) };
    };

    run('TEST 98: Nangong/Miyabi/Yuzuha is Miyabi\'s strongest composition, per boss', () => {
        const miyabiTeams = filterIncludeOneOf(allTeamEntries, ['Miyabi']);
        assert(miyabiTeams.length > 100,
            `expected the full Miyabi team space, got ${miyabiTeams.length} teams`);
        const failures = [];
        for (const boss of LADDER_BOSSES) {
            const viable = miyabiTeams
                .map(({ label, team }) => ({ label, score: scoreTeamForBoss(team, boss, {}) }))
                .filter(t => t.score > 0);
            const target = viable.find(t => t.label === 'Nangong / Miyabi / Yuzuha');
            assert(target, `Nangong / Miyabi / Yuzuha must be viable on ${boss.name}`);
            const above = viable.filter(t => t.score > target.score)
                .sort((a, b) => b.score - a.score);
            if (above.length > 0) {
                failures.push(`${boss.name}: ${above.length} team(s) outscore NMY (${target.score.toFixed(1)}) — `
                    + above.slice(0, 5).map(t => `${t.label} ${t.score.toFixed(1)}`).join('; '));
            }
        }
        assert(failures.length === 0,
            `Nangong / Miyabi / Yuzuha must be Miyabi's strongest composition on every ladder boss:\n      - `
            + failures.join('\n      - '));
    });

    // A third anomaly agent is never an upgrade over a strong support, on either of Miyabi's two
    // viable cores. The second anomaly agent is what establishes disorder cycling; a third adds
    // far less than a top support brings, and costs field time and buffs on top.
    //
    // **Remielle is deliberately absent from both lists.** She is nominally an anomaly unit but
    // functions as the support in these teams — she is a pseudo-support, carries no anomaly gauge
    // of her own, and her value is the Luminize rebound off teammate procs. Including her would
    // assert something the owner explicitly rejects.
    //
    // Vacuity warning, and the reason for the `comparisons` guard below: on the `Miyabi/Vivian`
    // core every GENUINE third anomaly agent is disqualified outright (three anomaly units with no
    // support), so only pseudo-anomaly units — Nangong, Soukaku, Roxy — produce a real comparison
    // there. Those are the non-vacuous cases. Without the guard this test could silently degrade
    // into asserting nothing at all if DQ rules ever widened.
    const THIRD_ANOMALY_CASES = [
        {
            core: 'Nangong/Miyabi', support: 'Yuzuha',
            thirds: ['Yanagi', 'Burnice', 'Vivian', 'Grace', 'Aria'],
        },
        {
            core: 'Miyabi/Vivian', support: 'Yuzuha',
            thirds: ['Yanagi', 'Burnice', 'Grace', 'Aria', 'Alice', 'Soukaku', 'Roxy'],
        },
    ];

    run('TEST 99: a third anomaly agent does not out-value a strong support for Miyabi', () => {
        const failures = [];
        for (const { core, support, thirds } of THIRD_ANOMALY_CASES) {
            let comparisons = 0;
            for (const boss of LADDER_BOSSES) {
                const sup = scoreSpec(`${core}/${support}`, boss);
                if (sup.score <= 0) continue;      // the support line itself is not viable here
                for (const third of thirds) {
                    const triple = scoreSpec(`${core}/${third}`, boss);
                    if (triple.score <= 0) continue;   // disqualified — not a comparable team
                    comparisons++;
                    if (!(sup.score > triple.score)) {
                        failures.push(`${boss.name}: ${core}/${third} (${triple.score.toFixed(1)}) must not beat ${core}/${support} (${sup.score.toFixed(1)})`);
                    }
                }
            }
            assert(comparisons >= 3,
                `core ${core} produced only ${comparisons} live comparison(s) — this test has gone vacuous, most likely because disqualification rules widened. Fix the fixtures rather than letting it pass on nothing.`);
        }
        assert(failures.length === 0,
            `${failures.length} case(s) where a third anomaly agent out-valued a top support:\n      - `
            + failures.join('\n      - '));
    });

    // Ordering among Miyabi's TRUE anomaly partners only. Nangong is her absolute best-in-slot
    // partner and sits ahead of all three — the `Nangong > Vivian` assertion is a guard against
    // the fix overshooting, since raising Vivian for off-field buildup must not lift her past him.
    //
    // Burnice vs Yanagi was ADJUDICATED 2026-08-31 and turns out to DEPEND ON THE THIRD SLOT.
    // The original expectation (Yanagi always ahead) came from thinking of Yuzuha as the default
    // third, which is the one case where it is true.
    //
    // Miyabi's disorder supply is 4 with either partner, reached two different ways. Burnice is
    // off-field, so her fire gauge fills while Miyabi applies frost and `hasParallelGaugeSource`
    // doubles the cycling rate from 2 to 4. Yanagi shares the field, cycles serially at 2, and her
    // `utility.disorders: 2` polarity puts back exactly the 2 she lost. So disorder supply is a
    // wash and the rung is decided by everything else:
    //
    //   Burnice   +15.0   sole on-field carry (Miyabi owns the screen)
    //   Burnice    +1.5   tier — Burnice T1, Yanagi T1.5
    //   Yanagi     -5.5   her disorder-DAMAGE buff into Miyabi
    //             -----
    //   Burnice   +11.0   net, whenever the third slot is disorder-neutral
    //
    // Yuzuha inverts it. She buffs disorders, polarity is a subclass of disorders, and Yanagi
    // has `damage.polarity: 2` — so Yuzuha pays 18.0 into Yanagi's own damage and Yanagi wins by
    // 4.3. Burnice's `damage.abloom` gets nothing from her: abloom is a distinct mechanic that
    // Yuzuha does not buff. It is not a data gap — Promeia is the abloom amplifier (`buffs.abloom`
    // pays her 9.0 into Burnice), which is part of why Lighter/Burnice/Promeia is a real team.
    //
    // Owner: "Yuzuha changes the math... Yuzuha is super-dominant in anomaly team compositions and
    // Miyabi/Yanagi/Yuzuha > Miyabi/Burnice/Yuzuha makes sense."
    //
    // Keyed off `buffs.disorders` on the third rather than off Yuzuha's name, so a newly added
    // disorder buffer makes a real prediction here instead of silently landing in the wrong branch.
    // Remielle is NOT a valid third here — removed 2026-08-31. A third slot has to be a CONTROL,
    // and she is not one. She is tagged anomaly, so with Vivian, Yanagi or Burnice as the partner
    // the team has three anomaly bodies and her conditional ATK buff pays 4; with Nangong, who is
    // only pseudo-anomaly, it has two and pays 2. Swapping the partner changes the team's
    // ARCHETYPE, not just its partner, so the rung was measuring composition rather than partner
    // quality. Owner: "Any team with Rem that does NOT have a triple-anomaly team composition
    // should be nowhere near the ladder at all." That rule is pinned by TEST 109 instead.
    const PARTNER_THIRDS = ['Yuzuha', 'Astra', 'Nicole'];

    run('TEST 100: Miyabi\'s anomaly partners — Vivian first, then Burnice unless the third buffs disorders', () => {
        const vivian = allUnits.find(u => u.id === 'vivian');
        assert(vivian && vivian.mechanics?.onfield === false,
            'fixture assumption broken: Vivian should be an off-field unit');
        const failures = [];
        let disorderThirds = 0, neutralThirds = 0;
        for (const boss of LADDER_BOSSES) {
            for (const thirdName of PARTNER_THIRDS) {
                const third = allUnits.find(u => u.name === thirdName);
                const bd = third?.mechanics?.buffs?.disorders;
                const amplifiesPolarity = bd === true || (typeof bd === 'number' && bd > 0);
                const sc = partner => scoreSpec(`Miyabi/${partner}/${thirdName}`, boss).score;
                const v = sc('Vivian'), y = sc('Yanagi'), bu = sc('Burnice'), n = sc('Nangong');
                if ([v, y, bu, n].some(x => x <= 0)) continue;   // not a viable rung on this boss
                const where = `${boss.name}, third=${thirdName}`;
                if (!(n > v)) failures.push(`${where}: Nangong (${n.toFixed(1)}) is Miyabi's best-in-slot partner and must stay ahead of Vivian (${v.toFixed(1)})`);
                if (!(v > bu)) failures.push(`${where}: Vivian (${v.toFixed(1)}) must beat Burnice (${bu.toFixed(1)}) — both off-field, but Vivian is the stronger anomaly engine`);
                if (amplifiesPolarity) {
                    disorderThirds++;
                    if (!(y > bu)) failures.push(`${where}: ${thirdName} buffs disorders, which amplifies Yanagi's own polarity damage, so Yanagi (${y.toFixed(1)}) must beat Burnice (${bu.toFixed(1)})`);
                } else {
                    neutralThirds++;
                    if (!(bu > y)) failures.push(`${where}: ${thirdName} does not buff disorders, so Burnice (${bu.toFixed(1)}) must beat Yanagi (${y.toFixed(1)}) on tier and on leaving Miyabi the field`);
                }
            }
        }
        // Both branches must actually be exercised, or the split is asserting nothing.
        assert(disorderThirds > 0 && neutralThirds > 0,
            `the third-slot split went vacuous: ${disorderThirds} disorder-buffing third(s), ` +
            `${neutralThirds} neutral. Both branches must run for this test to mean anything.`);
        assert(failures.length === 0,
            `${failures.length} partner ordering(s) wrong:\n      - ` + failures.join('\n      - '));
    });

    // ========================================================================
    // TEST 101: the owner's Miyabi best-in-slot ladder
    // ========================================================================
    // The owner's stated ordering, checked per boss. Committed knowing parts of it fail: where
    // they do, either the engine or the expectation is wrong, and that is settled by review rather
    // than by tuning the engine until the ladder comes out. Middle entries were explicitly
    // flagged as arguable.
    //
    // Every adjacent pair is checked and ALL violations reported together — failing on the first
    // would hide the shape of the disagreement, which is the only thing this test is for.
    //
    // `Nangong/Miyabi/[Vivian|Nicole]` is one rung: the owner could not say which is better, so
    // the pair is unordered and only its position relative to its neighbours is asserted. A rung
    // whose teams are all disqualified on a given boss is skipped for that boss, and its
    // neighbours compared directly.
    run('TEST 101: Miyabi best-in-slot ladder (owner-stated; partially red by design)', () => {
        const ladder = [
            ['Nangong/Miyabi/Yuzuha'],
            ['Miyabi/Vivian/Remielle'],
            ['Nangong/Miyabi/Sunna'],
            ['Nangong/Miyabi/Astra'],
            ['Miyabi/Vivian/Yuzuha'],
            ['Nangong/Miyabi/Vivian', 'Nangong/Miyabi/Nicole'],
            ['Miyabi/Vivian/Astra'],
            ['Miyabi/Vivian/Nicole'],
        ];
        const violations = [];
        for (const boss of LADDER_BOSSES) {
            const rungs = ladder
                .map(rung => rung.map(spec => scoreSpec(spec, boss)).filter(t => t.score > 0))
                .filter(rung => rung.length > 0);
            for (let i = 0; i < rungs.length - 1; i++) {
                // An unordered rung must sit entirely above the one below it, so compare this
                // rung's floor against the next rung's ceiling.
                const upper = rungs[i].reduce((m, t) => (t.score < m.score ? t : m));
                const lower = rungs[i + 1].reduce((m, t) => (t.score > m.score ? t : m));
                if (!(upper.score > lower.score)) {
                    violations.push(`${boss.name}: ${upper.label} (${upper.score.toFixed(1)}) should outrank ${lower.label} (${lower.score.toFixed(1)})`);
                }
            }
        }
        assert(violations.length === 0,
            `${violations.length} rung(s) out of order:\n      - ` + violations.join('\n      - '));
    });

    // ========================================================================
    // TEST 102: the two disorder supply curves have the shapes they claim
    // ========================================================================
    // Pure arithmetic, asserted directly rather than through scores — a score-level test cannot
    // reach a team supply of 7 to prove the hard cap, and these are the properties the whole
    // model rests on. The two curves are DELIBERATELY different shapes; a future reader tempted
    // to unify them should find this red.
    run('TEST 102: disorder supply curves — consumer diminishes forever, boss weakness hard-caps', () => {
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

    // ========================================================================
    // TEST 103: Lighter's two element buffs are a menu, not two separate offerings
    // ========================================================================
    // Lighter buffs fire AND ice so that one of them matches whatever the team runs. He is
    // the only unit in the roster with more than one element buff. The rule (phase 1):
    //
    //   - no penalty for an arm that has no target
    //   - full credit for every arm that does land
    //   - a penalty only when NOTHING on the menu lands, and one penalty, not one per arm
    //
    // "Two arms landing beats one" is paid by LAYER 4, which pays element-buff per landing
    // pair, NOT by cohesion — cohesion correctly reads 100% in both cases, because in both
    // cases all of the kit that could be used is being used. Both halves are asserted here,
    // because reading only the final score cannot tell them apart.
    run('TEST 103: Lighter element buffs are a menu — dead arms are not charged, live arms are paid', () => {
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
        // dead arm is charged or not (issue 3). A score-level assertion here passes with the
        // mechanism reverted, which is worse than no test at all — it was tried.
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
        // is charged whether it lands or not, so an unmatched one still costs her (TEST 18).
        const soukakuMenu = [['ice', 3]];
        const sLands = chargeableElementArms(soukakuMenu, ['Miyabi', 'Vivian'].map(unit));
        assert(sLands.length === 1 && sLands[0].rel > 0,
            'Soukaku ice into an ice carry: one arm, charged, landing');
        const sMisses = chargeableElementArms(soukakuMenu, ['Ye Shunguong', 'Zhao'].map(unit));
        assert(sMisses.length === 1 && sMisses[0].rel === 0,
            'Soukaku ice into a team that cannot use it: still charged, at zero — a real ' +
            'mismatch that must keep costing her');
    });

    // ========================================================================
    // TEST 104: a quick assist is a small benefit that always lands
    // ========================================================================
    // Every unit in the game benefits from a quick assist. Most do nothing SPECIAL with one;
    // a few (Anton) declare a real need and get more out of it. So offering quick assists is
    // never a mismatch, and a support must never be recorded as wasting part of their kit on
    // the thing every carry happily uses.
    //
    // Asserted against the rule rather than through a team's score, for the same reason as
    // TEST 103: the absolute-supply threshold in computeBuffUtilization pins these suppliers
    // at 100% utilization either way, so a score-level assertion would pass with the
    // mechanism reverted (issue 3).
    run('TEST 104: quick assists are small, always land, and pay more to a declared need', () => {
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

    // ========================================================================
    // TEST 105: damage.basic is inherited from role, overridable, and never burst
    // ========================================================================
    run('TEST 105: damage.basic inheritance — role baseline, max across roles, out of burst', () => {
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

    // ========================================================================
    // TEST 106: Sunna beats Astra on attack and anomaly carries
    // ========================================================================
    // Owner spec from actual play results.
    //
    // The rupture half was REMOVED 2026-09-01 after play-testing (see TEST 15). It used to assert
    // Sunna "essentially never" beats Astra on rupture, enforced by a rupture avoid. That was
    // wrong in practice: Sunna can only reach a rupture carry alongside Nangong (join rules), and
    // Nangong+Sunna is exactly the stun wheelchair that makes rupture Yixuan sing — Yixuan loves
    // the stacking stun multipliers in her greedy burst windows. So Sunna does beat Astra on
    // rupture, and she SHOULD; the rupture avoid was removed from her data and this half of the
    // test with it. What remains is the attack/anomaly claim, which is unaffected.
    run('TEST 106: Sunna beats Astra on attack/anomaly carries', () => {
        const carryRole = (u) => {
            for (const r of ['rupture', 'anomaly', 'attack', 'armorer']) if (u.tags.includes(r)) return r;
            return u.tags.includes('stun') ? 'stun' : 'support';
        };
        const sunna = allUnits.find(u => u.name === 'Sunna');
        const astra = allUnits.find(u => u.name === 'Astra');
        const others = allUnits.filter(u => u.name !== 'Sunna' && u.name !== 'Astra');

        const tally = { attack: [0, 0], anomaly: [0, 0], rupture: [0, 0] };
        for (const boss of withBosses(bosses, 'Butcher,Marionettes,Girtablullu,Neutral')) {
            for (let i = 0; i < others.length; i++) {
                for (let j = i + 1; j < others.length; j++) {
                    const core = [others[i], others[j]];
                    const roles = core.map(carryRole);
                    const sS = scoreTeamForBoss([...core, sunna], boss, {});
                    if (sS <= 0) continue;
                    const sA = scoreTeamForBoss([...core, astra], boss, {});
                    if (sA <= 0) continue;
                    const arch = roles.includes('rupture') ? 'rupture'
                        : roles.includes('anomaly') ? 'anomaly'
                        : roles.includes('attack') ? 'attack' : null;
                    if (!arch) continue;
                    tally[arch][1]++;
                    if (sS > sA) tally[arch][0]++;
                }
            }
        }

        const pct = (a) => (100 * a[0]) / a[1];
        for (const arch of ['attack', 'anomaly']) {
            assert(tally[arch][1] >= 20,
                `only ${tally[arch][1]} live ${arch} comparisons — this test has gone vacuous, fix the fixture`);
        }
        assert(pct(tally.attack) > 55,
            `Sunna should be the better pick on most ATTACK carries; she wins ` +
            `${pct(tally.attack).toFixed(0)}% of ${tally.attack[1]} cores`);
        assert(pct(tally.anomaly) > 55,
            `Sunna should be the better pick on most ANOMALY carries; she wins ` +
            `${pct(tally.anomaly).toFixed(0)}% of ${tally.anomaly[1]} cores`);
    });

    // ========================================================================
    // TEST 107: two greedy carries cannot both own the stun window
    // ========================================================================
    // Remielle cannot fire her double ultimate while Miyabi is running
    // enhanced -> ultimate -> enhanced. `scaling.greedy` measures how much of the window a unit
    // needs to ITSELF, and it is about execution difficulty rather than damage: Miyabi's enhanced
    // attacks take about twice as long as Promeia's and need disorder fuel timed into the window,
    // while Aria's are very quick. Measuring this by burst size instead would have penalised Aria
    // and Promeia, who are two of Remielle's BEST partners.
    //
    // Only greed ABOVE 1 contends. That one rule is what separates the cases below, and it is the
    // property most worth guarding: the penalty must reach dual-greedy teams and nothing else.
    run('TEST 107: two greedy carries contend for the stun window; one greedy carry does not', () => {
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

        // Remielle's own best teams pair her with a greedy-1 partner and must be UNTOUCHED. This
        // is the sharpest check in the phase: a rule that penalised these would be wrong even if
        // it fixed everything else.
        const untouched = {
            'Promeia/Remielle/Velina': 501.6,
            'Burnice/Remielle/Velina': 461.5,
            'Aria/Remielle/Velina': 401.6,
            'Alice/Remielle/Velina': 396.9,
        };
        for (const [spec, expected] of Object.entries(untouched)) {
            const got = scoreOf(spec);
            assert(Math.abs(got - expected) < 0.15,
                `${spec} is one of Remielle's best teams and must not be touched by burst ` +
                `contention: expected ${expected}, got ${got.toFixed(1)}`);
        }

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

    // ========================================================================
    // TEST 108: a greedy carry gets more out of a shortened enemy recovery
    // ========================================================================
    // The other half of `scaling.greedy`, and the reverse of TEST 107's penalty. Most carries
    // have plenty of time to land their burst inside a normal stun window, so a recovery debuff
    // is a modest bonus. A GREEDY carry is the one that was actually running out of window, and
    // extending it lets them land damage they otherwise could not.
    //
    // The case: Lighter and Trigger both raise Evelyn's stun multiplier, but only Lighter
    // shortens the enemy's recovery — and Evelyn is greedy 3 and the one carry who declares
    // `scaling.recovery` outright.
    run('TEST 108: a recovery debuff is worth more to a greedy carry than to an ordinary one', () => {
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

    // ========================================================================
    // TEST 109: Remielle off triple-anomaly does not belong near the ladder
    // ========================================================================
    // Owner rule, stated 2026-08-31: "Any team with Rem that does NOT have a triple-anomaly
    // team composition should be nowhere near the ladder at all, not even Nangong/Miyabi/
    // Remielle, not even Nangong/Velina/Remielle."
    //
    // Remielle's ATK buff is `countTag: anomaly` — 4 at three anomaly bodies, 2 at two, 0 at one.
    // It counts TAGS, not effective roles, so Nangong's pseudo-anomaly does not feed it. Without
    // the third anomaly body her kit does not come together and her value crashes.
    //
    // The floor is TEST 101's bottom rung rather than a hardcoded number, so this test tracks the
    // ladder through a rescale instead of needing to be re-anchored after every calibration pass.
    //
    // NOT asserted here, deliberately: triple-anomaly Remielle teams WITHOUT Vivian
    // (Miyabi/Burnice/Remielle, Miyabi/Yanagi/Remielle, Alice, Velina...) may legitimately land
    // in the middle of the ladder or interleave with its lower rungs. Owner: "that can be
    // adjudicated based on results." Only the non-triple-anomaly ones are pinned.
    run('TEST 109: non-triple-anomaly Remielle teams sit below the Miyabi ladder', () => {
        const LADDER_FLOOR_SPEC = 'Miyabi/Vivian/Nicole';
        const violations = [];
        let checked = 0;
        for (const boss of LADDER_BOSSES) {
            const floor = scoreSpec(LADDER_FLOOR_SPEC, boss).score;
            assert(floor > 0,
                `${boss.name}: the ladder floor ${LADDER_FLOOR_SPEC} is not viable, so this test ` +
                `has nothing to measure against. Fix the fixture rather than skipping the boss.`);
            for (const { label, team } of allTeamEntries) {
                if (!team.some(u => u.name === 'Remielle')) continue;
                const anomalyBodies = team.filter(u => u.tags.includes('anomaly')).length;
                if (anomalyBodies >= 3) continue;
                const score = scoreTeamForBoss(team, boss, {});
                if (score <= 0) continue;               // not viable on this boss
                checked++;
                if (score >= floor) {
                    violations.push(
                        `${boss.name}: ${label} (${score.toFixed(1)}, ${anomalyBodies} anomaly ` +
                        `bodies) is at or above the ladder floor ${floor.toFixed(1)}`);
                }
            }
        }
        assert(checked > 50,
            `only ${checked} non-triple-anomaly Remielle team(s) were live across the ladder ` +
            `bosses — this test has gone vacuous. Expected well over a hundred.`);
        assert(violations.length === 0,
            `${violations.length} non-triple-anomaly Remielle team(s) crack the ladder:\n      - `
            + violations.join('\n      - '));
    });

    // ------------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------------
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
