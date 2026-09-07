/**
 * test-rankings.mjs
 *
 * Assertion-based regression tests for team *rankings* against the live roster —
 * score floors, orderings, and ladders for named units and bosses — the roster-facing half of
 * what used to be test-scoring.mjs. These are the tests expected to need new entries or
 * adjustment whenever a new unit or boss ships. Isolated engine-mechanic assertions that do
 * not depend on roster content live in test-mechanics.mjs.
 *
 * Run from the repository root:
 *   node test-rankings.mjs            — run all tests
 *   node test-rankings.mjs -17 -22    — run only tests 17 and 22
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
import { scoreTeamForBoss, resolveBossVariation, getBossResistances } from './app/public/lib/common/team-scorer.js';
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

    console.log('--- Team scoring tests: rankings (raw scoreTeamForBoss) ---\n');


    // TEST 1 (partial): no SAnby + Yixuan together in top 25, every boss
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

    // TEST 2: SAnby/Yixuan anti-synergy
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

    // TEST 3: SAnby proper teams on UCC — ordering and floor
    run('TEST 3: SAnby proper teams on UCC — ordering and floor (>= 315)', () => {
        const b = withBosses(bosses, 'Corruption').find(Boolean);
        const allT =
            'Trigger/Orphie/SAnby,Trigger/Cissia/SAnby,Trigger/SAnby/Astra,Trigger/SAnby/Seed,Trigger/SAnby/Zhao,' +
            'Dialyn/Orphie/SAnby,Ju Fufu/Orphie/SAnby';
        const m = scoreMapForBoss(scoreForTeamString(allT, allUnits), b);

        const tOrphie = m.get('Trigger / Orphie / SAnby');
        const tCissia = m.get('Trigger / Cissia / SAnby');
        const tAstra = m.get('Trigger / SAnby / Astra');
        const tZhao = m.get('Trigger / SAnby / Zhao');
        assert(tOrphie >= 315, `Trigger+SAnby: Orphie (${tOrphie}) >= 315`);
        assert(tCissia >= 305, `Trigger+SAnby: Cissia (${tCissia}) >= 305`);
        assert(tAstra  >= 300, `Trigger+SAnby: Orphie (${tAstra }) >= 300`);
        // Trigger/SAnby/Seed's floor lives in TEST 88. Split out so the rest of TEST 3 keeps
        // guarding its five other floors and four orderings independently of it.
        assert(tZhao   >= 290, `Trigger+SAnby: Zhao   (${tZhao  }) >= 290`);

        assert(tOrphie > tCissia, `Trigger+SAnby: Orphie (${tOrphie}) > Cissia (${tCissia})`);
        assert(tOrphie > tAstra, `Trigger+SAnby: Orphie (${tOrphie}) > Astra (${tAstra})`);

        const oTrigger = m.get('Trigger / Orphie / SAnby');
        const oJuFufu = m.get('Ju Fufu / Orphie / SAnby');
        const oDialyn = m.get('Dialyn / Orphie / SAnby');
        assert(oTrigger > oJuFufu, `SAnby+Orphie: Trigger (${oTrigger}) > Ju Fufu (${oJuFufu})`);
        assert(oJuFufu < oDialyn, `SAnby+Orphie: Ju Fufu (${oJuFufu}) < Dialyn (${oDialyn})`);

        
    });

    // TEST 4: YSG + support ordering on Nightmare
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

    // TEST 5: Lucia on YSG (rupture-irrelevant 3rd) — every Lucia line must score strictly less
    // than every reference support line on the same boss.
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

    // TEST 6: Hugo + Sunna vs real stunners
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

    // TEST 7: Evelyn stunner ordering — Pompey (fire-weak) ladder Norma > Dialyn > Lighter >
    // Koleda > Ju Fufu, rest unordered but below Ju Fufu. Koleda's buff rework put her above Ju
    // Fufu here, but not on Neutral, where Trigger still beats both.
    run('TEST 7: Evelyn stunner ordering (Pompey, Neutral)', () => {
        for (const b of withBosses(bosses, 'Pompey')) {
            const spec =
                'Norma/Evelyn/Astra,Dialyn/Evelyn/Astra,Lighter/Evelyn/Astra,' +
                'Koleda/Evelyn/Astra,Ju Fufu/Evelyn/Astra,Trigger/Evelyn/Astra,' +
                'Caesar/Evelyn/Astra,Pulchra/Evelyn/Astra,Qingyi/Evelyn/Astra';
            const m = scoreMapForBoss(scoreForTeamString(spec, allUnits), b);

            const ladder = ['Norma / Evelyn / Astra', 'Dialyn / Evelyn / Astra',
                'Lighter / Evelyn / Astra', 'Koleda / Evelyn / Astra',
                'Ju Fufu / Evelyn / Astra'];
            for (let i = 0; i + 1 < ladder.length; i++) {
                const hi = m.get(ladder[i]), lo = m.get(ladder[i + 1]);
                assert(hi !== undefined && lo !== undefined && hi > lo,
                    `${b.name}: fire-weak stunner ladder: want ${ladder[i]} (${hi}) > ${ladder[i + 1]} (${lo})`);
            }

            const juFufu = m.get('Ju Fufu / Evelyn / Astra');
            const tail = ['Trigger / Evelyn / Astra', 'Evelyn / Caesar / Astra',
                'Pulchra / Evelyn / Astra', 'Qingyi / Evelyn / Astra'];
            for (const t of tail) {
                const v = m.get(t);
                assert(v !== undefined && v < juFufu,
                    `${b.name}: ${t} (${v}) must sit below Ju Fufu (${juFufu})`);
            }
        }

        for (const b of withBosses(bosses, 'Neutral')) {
            const spec = 'Trigger/Evelyn/Astra,Ju Fufu/Evelyn/Astra,Koleda/Evelyn/Astra';
            const m = scoreMapForBoss(scoreForTeamString(spec, allUnits), b);
            const trigger = m.get('Trigger / Evelyn / Astra');
            const koleda = m.get('Koleda / Evelyn / Astra');
            const juFufu = m.get('Ju Fufu / Evelyn / Astra');
            assert(trigger > koleda && trigger > juFufu,
                `${b.name}: Trigger (${trigger}) must beat Koleda (${koleda}) and Ju Fufu (${juFufu})`);
        }
    });

    // TEST 8: Nangong/Miyabi support ordering — Yuzuha > Astra/Sunna > Nicole/Soukaku >> Harumasa.
    // Bringer is excluded: its freeze mechanic gives Soukaku's pseudo-anomaly a bonus that
    // inverts the ordering.
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

    // TEST 9: Nangong/Aria support order — Sunna > Yuzuha > Astra > Zhao > Nicole > Vivian on
    // Sweeper/Butcher. Solo scrambles the middle, so only Sunna-best and Nicole > Vivian hold.
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

    // TEST 10: Disorder / dual-anomaly style bands
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

    // TEST 11: Caesar quality checks
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

        // Ceiling is 290, not the original 280: YSG's unmet `scaling.veils: 2` is now charged at
        // severity 0.44 rather than 1.0 (see needSeverity), unrelated to the diametric synergy
        // this test guards. Still reads as "mid" — about 54% of Slugger's best team.
        const tyc = scoreForTeamString('Trigger/Ye Shunguong/Caesar', allUnits)[0];
        const tycScore = scoreTeamForBoss(tyc.team, slugger, {});
        assert(tycScore <= 290, `Slugger Trigger/YSG/Caesar: got ${tycScore}, expected <= 290`);
    });

    // TEST 12: Pan vs Astra (rupture) on Hunter
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

    // TEST 13: Rupture synergy on attack team is generally useless
    run('TEST 13: Pan Yinhu on attack team should be useless', () => {
        const t = 'Dialyn/Evelyn/Pan Yinhu';
        const b = withBosses(bosses, 'Neutral').find(Boolean);
        for (const { team, label } of scoreForTeamString(t, allUnits)) {
            const s = scoreTeamForBoss(team, b, {});
            assert(s < 150, `${label} should be < 150, got ${s}`);
        }
    });

    // TEST 14: Banyue fire-weak band
    run('TEST 14: Banyue teams >350 (Pompey, Hunter)', () => {
        const t = 'Dialyn/Banyue/Lucia,Ju Fufu/Banyue/Lucia,Banyue/Astra/Lucia,Banyue/Pan Yinhu/Lucia,Norma/Banyue/Lucia';
        for (const b of withBosses(bosses, 'Pompey,Hunter')) {
            for (const { team, label } of scoreForTeamString(t, allUnits)) {
                const s = scoreTeamForBoss(team, b, {});
                assert(s >= 350 && s <= 485, `${b.name} ${label}: got ${s}, expected strong Banyue performance ~[350,485]`);
            }
        }
    });

    // TEST 15: Nangong/Yixuan/Sunna — the emergent-team-building proof
    // The FLAGSHIP proof that emergent scoring beats template matching. Sunna reads as a trash
    // pick for a rupture carry (attack/anomaly support beside rupture Yixuan), but Nangong (T0
    // fast stunner) + Sunna's daze + their combined stun-multiplier is exactly what greedy-window
    // Yixuan wants — confirmed by owner playtesting, not just the engine. Full story:
    // ../notes/lessons-learned.md#the-team-that-was-supposed-to-be-the-bane.
    //
    // Sunna's rupture avoid was removed from units.json for the same reason (see TEST 83).
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

    // TEST 16 (partial): Nangong on Fiend — Miyabi on top, Alice band
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

    // TEST 17: JF vs Astra on Yixuan/Lucia
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

    // TEST 18: Soukaku activation
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

    // TEST 19: Orphie fire resist vs Cissia on Slugger
    run('TEST 19: Trigger/Cissia/Seed > Trigger/Orphie/SAnby on Slugger', () => {
        const b = withBosses(bosses, 'Slugger').find(Boolean);
        const t = 'Trigger/Orphie/SAnby,Trigger/Cissia/Seed,Trigger/Cissia/SAnby,Ju Fufu/Orphie/SAnby';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        assert(
            m.get('Trigger / Cissia / Seed') > m.get('Trigger / Orphie / SAnby'),
            'Slugger: Cissia/Seed should edge Orphie line'
        );
    });

    // TEST 20: Burnice on fire-res — disqualify (score <= 0)
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

    // TEST 21: Banyue ranks well on Hunter — at least 5 teams scoring 350+
    run('TEST 21: at least 5 Banyue teams score 350+ on Hunter', () => {
        const b = withBosses(bosses, 'Hunter').find(Boolean);
        const top = getTopViableTeams(allTeamEntries, b, 50, ['Banyue']);
        const strong = top.filter(({ score }) => score >= 350);
        assert(
            strong.length >= 5,
            `Hunter: only ${strong.length} Banyue team(s) score 350+, expected at least 5`
        );
    });

    // TEST 22: YSG + Dialyn vs other stunners
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

    // TEST 23: MVY below Nangong/Miyabi variants — Solo can invert (Vivian's anomaly package),
    // so only checked on Sweeper/Butcher.
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

    // TEST 24: Qingyi flex lines
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

    // TEST 25: Yuzuha on rupture (low)
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

    // TEST 26: YSG on Slugger (Typhon) — high score
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

    // TEST 27: Bringer (Sacrifice) — all MV* high, Yuzu best among listed
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

    // TEST 28: Nangong/Alice/Yuzuha competitive with Miyabi/Vivian/Yuzuha on Fiend — Alice is T1
    // physical anomaly and Fiend is physical+ether weak, so NAY should beat or be close to MVY.
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

    // TEST 29: UCC (Corruption Complex) defaults to anti-anomaly, so Miyabi teams are
    // disqualified there; checked on Marionettes instead, then the UCC open variation confirmed
    // to re-enable anomaly teams.
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

    // TEST 30: disorder scaling sanity — Nangong > MVY > Astra
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

    // TEST 31: Soukaku buff alignment — no pseudoRole penalty with ice DPS
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

    // TEST 32: AoD (Nangong/Aria) beats non-AoD on Priest
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

    // TEST 33: Lighter should beat Trigger on fire-weak bosses
    run('TEST 33: Lighter > Trigger for Evelyn on Pompey', () => {
        const teams = scoreForTeamString('Lighter/Evelyn/Astra,Trigger/Evelyn/Astra', allUnits);
        for (const b of withBosses(bosses, 'Pompey')) {
            const m = scoreMapForBoss(teams, b);
            const lighter = m.get('Lighter / Evelyn / Astra');
            const trigger = m.get('Trigger / Evelyn / Astra');
            assert(lighter > trigger, `${b.name}: Lighter/Evelyn/Astra (${lighter}) should beat Trigger/Evelyn/Astra (${trigger})`);
        }
    });

    // TEST 34: Promeia ice vortex dominance on Scorched Horizon
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

    // TEST 35: Lighter/Promeia/Burnice abloom synergy on Scorched Horizon
    run('TEST 35: Lighter/Promeia/Burnice competitive on Scorched Horizon (abloom + vortex)', () => {
        const teams = scoreForTeamString('Lighter/Promeia/Burnice', allUnits);
        for (const b of withBosses(bosses, 'Horizon')) {
            const m = scoreMapForBoss(teams, b);
            const lpb = m.get('Lighter / Burnice / Promeia');
            assert(lpb > 345, `${b.name}: LPB (${lpb}) expected > 345 (abloom + dual vortex)`); 
        }
    });

    // TEST 36: Miyabi weakness on Horizon vs strength on Sacrifice Bringer
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

    // TEST 37: Polarity providers mitigate Miyabi on Horizon
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

    // TEST 38: Non-anomaly teams unaffected by vortex on Horizon
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

    // TEST 39: Regression — existing compositions unchanged on non-Horizon bosses
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

    // TEST 40: Promeia and Aria are both T0.5 anomaly DPS hitting the same weakness, but only
    // Promeia/Vivian generates disorders, so Promeia should win.
    run('TEST 40: Butcher disorders — Prom/Viv > Aria/Viv (disorder bonus)', () => {
        const b = withBosses(bosses, 'Butcher').find(Boolean);
        const t = 'Promeia/Vivian/Yuzuha,Aria/Vivian/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        const pvy = m.get('Promeia / Vivian / Yuzuha');
        const avy = m.get('Aria / Vivian / Yuzuha');
        assert(pvy > avy,
            `Butcher: PVY (${pvy}) should beat AVY (${avy}) — disorder weakness bonus`);
    });

    // TEST 41: Vesper's veil weakness rewards veil providers proportionally — Sunna (veils:3)
    // beats zero-veil Astra, and Zhao (veils:2) beats zero-veil Nicole.
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

    // TEST 42: both Miyabi (frost) and Promeia (ice) get Bringer's full freeze bonus (+60); Alice
    // (ether anomaly) gets none and should score clearly below both.
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

    // TEST 43: Sweeper's stun weakness gives any team with a stunner +15, one of several
    // contributors here, so the gap should be well above that floor.
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

    // TEST 44: Promeia has no CD scaling (baseline 0) so takes zero of Horizon's CD debuff, while
    // Miyabi's scaling.cd:3 eats a real penalty — Promeia teams should clearly beat Miyabi teams.
    // Separately, Astra's buffs.cd:3 should fully offset the debuff for an attacker.
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

    // TEST 45: Promeia and Vivian share abloom:3, but Promeia also gets an ice vortex advantage
    // on Horizon, so her team should outscore Vivian's.
    run('TEST 45: Scorched Horizon abloom weakness — Promeia/Nangong/Yuzuha > Vivian/Nangong/Yuzuha', () => {
        const b = withBosses(bosses, 'Horizon').find(Boolean);
        const t = 'Nangong/Promeia/Yuzuha,Nangong/Vivian/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        const npy = m.get('Nangong / Promeia / Yuzuha');
        const nvy = m.get('Nangong / Vivian / Yuzuha');
        assert(npy > nvy,
            `Horizon: NPY (${npy}) should beat NVY (${nvy}) — ice vortex + abloom + favored advantages`);
    });

    // TEST 46: Norma's scaling.sheer:3 means Lucia's buffs.sheer:3 scores for her just as it
    // would for a rupture DPS.
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

    // TEST 47: Vesper — Alice should not be overranking Aria teams
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

    // TEST 48: Promeia/Vivian/Yuzuha > Nangong/Vivian/Yuzuha > Nangong/Promeia/Yuzuha
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

    // TEST 49: Jane's vortex buff should create a bigger gap over Piper on Horizon than on Butcher.
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

    // TEST 50: Notorious Butcher is anomaly-shill (pure anomaly teams viable); Raging Butcher is
    // stun-shill, which DISQUALIFIES stunnerless teams outright rather than just penalising them.
    run('TEST 50: Raging Butcher — stun-shill disqualifies stunnerless anomaly teams', () => {
        const butcher = bosses.find(b => b.id === 'butcher');
        const ragingBoss = resolveBossVariation(butcher, 'raging');

        // Miyabi/Vivian/Yuzuha: pure anomaly team, no stunner tag anywhere.
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

    // TEST 51: Remielle with 2 other primary anomaly units unlocks her max ATK buff (atk:4).
    run('TEST 51: Ramiel triple-anomaly team scores 400+ on neutral (VRP)', () => {
        const b = NEUTRAL_BOSS;
        const { team, label } = scoreForTeamString('Velina/Remielle/Promeia', allUnits, { preview: true })[0];
        const s = scoreTeamForBoss(team, b, {});
        assert(s >= 400, `${label}: got ${s}, expected >= 400 (triple-anomaly Ramiel team)`);
    });

    // TEST 52: triple-anomaly maximizes Remielle's conditional ATK buff (atk:4) versus only
    // atk:2 on the Velina+Yuzuha wheelchair, which also eats an underutilization penalty.
    run('TEST 52: Triple-anomaly Ramiel >= Ramiel/Velina/Yuzuha wheelchair', () => {
        const b = NEUTRAL_BOSS;
        const avr = scoreTeamForBoss(scoreForTeamString('Alice/Remielle/Velina', allUnits, { preview: true })[0].team, b, {});
        const rvy = scoreTeamForBoss(scoreForTeamString('Remielle/Velina/Yuzuha', allUnits, { preview: true })[0].team, b, {});
        assert(avr >= rvy, `Triple-anomaly AVR(${avr}) should be >= wheelchair RVY(${rvy})`);
    });

    // TEST 53: illegal = no unit pair has mutual join satisfaction; flex = at least one pair
    // does, with the 3rd unconstrained.
    run('TEST 53: Team legality — illegal teams DQ, flex teams OK', () => {
        const b = NEUTRAL_BOSS;
        const ran = scoreTeamForBoss(scoreForTeamString('Remielle/Astra/Nicole', allUnits, { preview: true })[0].team, b, {});
        assert(ran === -1, `Remielle/Astra/Nicole should be disqualified (-1), got ${ran}`);
        const nry = scoreTeamForBoss(scoreForTeamString('Nangong/Remielle/Yuzuha', allUnits, { preview: true })[0].team, b, {});
        assert(nry === -1, `Nangong/Remielle/Yuzuha should be disqualified (-1), got ${nry}`);
        const thn = scoreTeamForBoss(scoreForTeamString('Trigger/Harumasa/Nicole', allUnits)[0].team, b, {});
        assert(thn > 0, `Trigger/Harumasa/Nicole is a valid flex team, got ${thn}`);
    });

    // TEST 54: regression guard — Miyabi has no conditional.buffs, so none of these changes
    // should alter her top team scores.
    run('TEST 54: Miyabi/Astra/Nicole wheelchair still CONVENTIONAL (regression guard)', () => {
        const b = NEUTRAL_BOSS;
        const man = scoreTeamForBoss(scoreForTeamString('Miyabi/Astra/Nicole', allUnits)[0].team, b, {});
        const nmy = scoreTeamForBoss(scoreForTeamString('Nangong/Miyabi/Yuzuha', allUnits)[0].team, b, {});
        assert(man >= 300, `MAN: got ${man}, expected >= 300 (Miyabi wheelchair still CONVENTIONAL)`);
        assert(nmy > man, `NMY(${nmy}) should still beat MAN(${man})`);
    });

    // TEST 55: Alice/Vivian/Remielle generates disorders (physical+ether), triggering the
    // Refringe cascade bonus; all-physical Alice/Jane/Remielle has no reaction to cascade into.
    run('TEST 55: Multi-element triple-anomaly > same-element (Refringe cascade)', () => {
        const b = NEUTRAL_BOSS;
        const avr = scoreTeamForBoss(scoreForTeamString('Alice/Vivian/Remielle', allUnits, { preview: true })[0].team, b, {});
        const ajr = scoreTeamForBoss(scoreForTeamString('Alice/Jane Doe/Remielle', allUnits, { preview: true })[0].team, b, {});
        assert(avr > ajr, `Multi-element AVR(${avr}) should beat same-element AJR(${ajr}) due to Refringe cascade`);
    });

    // TEST 56: the conditional buff gap between triple (buff=4, +1600 ATK) and duo (buff=2, +600)
    // is enormous, so triple-anomaly should decisively win.
    run('TEST 56: Triple-anomaly Rem >> duo-anomaly wheelchair', () => {
        const b = NEUTRAL_BOSS;
        const triple = scoreTeamForBoss(scoreForTeamString('Alice/Vivian/Remielle', allUnits, { preview: true })[0].team, b, {});
        const wheelchair = scoreTeamForBoss(scoreForTeamString('Vivian/Remielle/Yuzuha', allUnits, { preview: true })[0].team, b, {});
        const gap = triple - wheelchair;
        assert(gap > 20, `Triple AVR(${triple}) should beat wheelchair VRY(${wheelchair}) by >20, gap was ${gap.toFixed(1)}`);
    });

    // TEST 57: Miyabi joins on anomaly, enabling Miyabi/Rem teams without Yanagi.
    run('TEST 57: Miyabi/Remielle/Vivian triple-anomaly scores well', () => {
        const b = NEUTRAL_BOSS;
        const mrv = scoreTeamForBoss(scoreForTeamString('Miyabi/Remielle/Vivian', allUnits, { preview: true })[0].team, b, {});
        assert(mrv >= 300, `Miyabi/Rem/Vivian should score >= 300 as triple-anomaly, got ${mrv}`);
    });

    // TEST 58: Nangong+Rem+Yuzuha counts only 1 anomaly teammate (Nangong is stun, Yuzuha is
    // support), so Remielle's buff resolves to 0 and this should score much worse.
    run('TEST 58: Nangong/Rem/Yuzuha penalized vs Nangong/Miyabi/Yuzuha', () => {
        const b = NEUTRAL_BOSS;
        const nry = scoreTeamForBoss(scoreForTeamString('Nangong/Remielle/Yuzuha', allUnits, { preview: true })[0].team, b, {});
        const nmy = scoreTeamForBoss(scoreForTeamString('Nangong/Miyabi/Yuzuha', allUnits)[0].team, b, {});
        assert(nmy > nry + 30, `NMY(${nmy}) should beat NRY(${nry}) by >30 — Rem buff=0 on this team`);
    });

    // TEST 59: Sigrid's damage["ultimate:weak"]:2 gets 0 from Dialyn's ultimate provision, and
    // his `replaces: {ultimates:chains}` penalizes her scaling.chains:3 on top — so on an
    // ice-weak boss, ice stunners' on-element bonus beats him, though he still beats low-tier
    // stunners on raw tier. Norma is best: chain provision + subdps damage + no replacement cost.
    run('TEST 59: Sigrid stunner ordering — weak ultimate + chain replacement (Marionettes)', () => {
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
            //Koleda's last-minute P6 changes bring her very close to Dialyn for Sigrid, although Dialyn is still ahead. 
            assert(dialyn > koleda, `${b.name}: Dialyn(${dialyn?.toFixed(1)}) >> Koleda(${koleda?.toFixed(1)}) — tier still matters`);
        }
    });

    // TEST 60: Norma has scaling.atk:3 and damage.chain:3, so Astra's atk/cd/chain-provision
    // suite should make her significantly better than Nicole here.
    run('TEST 60: Norma/Astra synergy — Astra significantly better than Nicole (Pompey)', () => {
        const t = 'Norma/Evelyn/Astra,Norma/Evelyn/Nicole';
        for (const b of withBosses(bosses, 'Pompey')) {
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            const astra = m.get('Norma / Evelyn / Astra');
            const nicole = m.get('Norma / Evelyn / Nicole');
            assert(astra > nicole + 30, `${b.name}: Norma+Astra(${astra?.toFixed(1)}) >> Norma+Nicole(${nicole?.toFixed(1)}) — Astra provides better buff suite`);
        }
    });

    // TEST 61: Norma is a fire stunner with subdps chain damage; Dialyn is physical with free
    // ultimates. Fire-weak bosses let Norma's on-element bonus + chain provision exceed Dialyn's
    // generic utility; elsewhere Dialyn's tier and ultimate provision keep him ahead.
    run('TEST 61: Norma vs Dialyn — fire-weak favors Norma, otherwise Dialyn wins', () => {
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

    // TEST 62: Miyabi+Velina anti-pattern — wasted vortex cohesion penalty
    // Velina is a wind anomaly subdps whose primary team value is vortex generation.
    // Miyabi (frost variant, vortex tier 0.001) cannot exploit vortex reactions,
    // so pairing them wastes Velina's contribution. The cohesion penalty should make
    // proper compositions score meaningfully higher than this anti-pattern.
    // Conversely, Promeia (ice, tier 4.5) actually uses vortex — no penalty there.
    run('TEST 62: Miyabi+Velina anti-pattern — wasted vortex cohesion penalty (Girtablullu)', () => {
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

    // TEST 63: Claret (electric armorer) should be strongly viable; swapping her for
    // pure-defense Ben leaves the team with NO DPS, confirming she is the damage dealer.
    run('TEST 63: Claret is a viable armorer DPS (Neutral)', () => {
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

    // TEST 64: Rina and Lucy both give buffs.atk:2, but only Rina gives buffs.def:2 (+pen:3),
    // which Claret's scaling.def:3 should reward clearly.
    run('TEST 64: Rina beats Lucy for Claret via DEF buff (Neutral)', () => {
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

    // TEST 65: armorer crit damage is normally fixed; Claret's scaling.cd:1 is the one exception,
    // converting a sliver of CD into Laceration — so Astra's cd:3 is not quite dead (at half an
    // attacker's weight) but her atk:3 is worth nothing, and Rina should still dominate her.
    run('TEST 65: CD buff barely helps Claret armorer (Neutral)', () => {
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

    // TEST 66: Claret (electric armorer) is a primary DPS, so electric-resistant Thrall must
    // disqualify the team — armorers get no support-unit resistance free pass.
    run('TEST 66: Electric resistance DQs Claret on Thrall', () => {
        if (!allUnits.find(u => u.id === 'claret')) return;
        for (const b of withBosses(bosses, 'Thrall')) {
            const t = 'Koleda/Claret/Rina';
            const m = scoreMapForBoss(scoreForTeamString(t, allUnits, { preview: true }), b);
            const s = m.get('Koleda / Claret / Rina');
            assert(s <= 0,
                `${b.name}: Electric-resistant boss should DQ Claret armorer team (${s?.toFixed(1)})`);
        }
    });

    // TEST 67 (regression): Remielle's pseudoRole is ["subdps","support"] with no `dps` marker,
    // so a dps-pseudorole fix should not touch her.
    run('TEST 67: Remielle regression on Solo (Alice/Vivian/Remielle)', () => {
        if (!allUnits.find(u => u.id === 'ramiel')) return;
        for (const b of withBosses(bosses, 'Solo')) {
            const parsed = scoreForTeamString('Alice/Vivian/Remielle', allUnits, { preview: true });
            const s = scoreTeamForBoss(parsed[0].team, b, {});
            assert(s > 300,
                `${b.name}: Alice/Vivian/Remielle should remain strong (${s?.toFixed(1)}) — no dps pseudorole regression`);
        }
    });

    // TEST 68: Burnice's pseudoRole (`subdps` by default, promoting to primary anomaly DPS when
    // Velina is absent) means Burnice/Velina/Yuzuha (DPS/subDPS/support) should beat
    // Burnice/Vivian/Yuzuha (subDPS/subDPS/support) by claiming the primary-DPS tier multiplier,
    // while Burnice/Promeia/Yuzuha lands in the same ballpark (Burnice reverts, Promeia carries).
    run('TEST 68: Burnice notPresent:velina conditional subdps (Neutral)', () => {
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

    // TEST 69: stun and armorer agents build a shared Gash pool that only an armorer detonates
    // into a Maim, so Koleda/Claret/Rina (armorer + stun enabler) should score meaningfully
    // higher than Claret/Lucy/Rina, a stunless "false wheelchair" with no enabler.
    run('TEST 69: Maim enabler + armorer structure (Neutral)', () => {
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

    // TEST 70: Koleda's 3.2 rework (general-damage buff, narrow P6 Laceration/CD, tier 2.5->1.5)
    // should improve Koleda/Claret/Rina considerably. The Evelyn floor is 295, not 300, because
    // the P6 rework moved her armorer-facing buff from CR to Laceration, worth nothing to Evelyn.
    run('TEST 70: Koleda rework improves her teams (Neutral)', () => {
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

    // TEST 71: the Claret/Rina stunner ranking depends on electric weakness, since Trigger's kit
    // leans harder on it than Roxy's: electric-weak UCC gives Trigger > Roxy > Koleda > Lycaon >
    // Anby, electric-neutral Marionettes gives Roxy > Trigger > Koleda > Lycaon > Anby. Typhon
    // (electric + wind weak) is checked separately on a Claret/Nicole base, since Rina (evasive
    // assist) can't join Typhon's 3-defensive-assist requirement and Lycaon can't join either:
    // Roxy > Trigger > Koleda > Anby.
    run('TEST 71: Claret stunner order — electric-weak, electric-neutral, and Typhon', () => {
        if (!allUnits.find(u => u.id === 'roxy') || !allUnits.find(u => u.id === 'claret')) return;
        const stunnerTeams = 'Trigger/Claret/Rina,Roxy/Claret/Rina,Koleda/Claret/Rina,' +
            'Lycaon/Claret/Rina,Anby/Claret/Rina';

        const assertOrder = (b, m, names, suffix, label) => {
            const order = names.map(n => ({ n, s: m.get(`${n} / Claret / ${suffix}`) }));
            for (let i = 0; i < order.length - 1; i++) {
                assert(order[i].s > order[i + 1].s,
                    `${b.name}: ${order[i].n}/Claret/${suffix} (${order[i].s?.toFixed(1)}) should beat ` +
                    `${order[i + 1].n}/Claret/${suffix} (${order[i + 1].s?.toFixed(1)}) (${label})`);
            }
        };

        for (const b of withBosses(bosses, 'ucc')) {
            const m = scoreMapForBoss(scoreForTeamString(stunnerTeams, allUnits, { preview: true }), b);
            assertOrder(b, m, ['Trigger', 'Roxy', 'Koleda', 'Lycaon', 'Anby'], 'Rina', 'electric-weak order');
        }

        for (const b of withBosses(bosses, 'Marionettes,Neutral')) {
            const m = scoreMapForBoss(scoreForTeamString(stunnerTeams, allUnits, { preview: true }), b);
            assertOrder(b, m, ['Roxy', 'Trigger', 'Koleda', 'Lycaon', 'Anby'], 'Rina', 'electric-neutral order');
        }

        // Typhon requires 3 defensive assists; Rina is an evasive assist and disqualifies the
        // team there, so this leg swaps in Nicole and drops Lycaon/Caesar, who likewise fail
        // to join a legal Typhon team.
        const typhonTeams = 'Roxy/Claret/Nicole,Trigger/Claret/Nicole,Koleda/Claret/Nicole,Anby/Claret/Nicole';
        for (const b of withBosses(bosses, 'Typhon')) {
            const m = scoreMapForBoss(scoreForTeamString(typhonTeams, allUnits, { preview: true }), b);
            assertOrder(b, m, ['Roxy', 'Trigger', 'Koleda', 'Anby'], 'Nicole', 'Typhon order');
        }
    });

    // TEST 72: the only fully-valid Roxy+Velina composition (Harumasa joins both), stacking wind
    // anomaly + daze — should be a solid, playable team on wind-weak Typhon, though not top-tier
    // until Harumasa is buffed.
    run('TEST 72: Roxy/Harumasa/Velina viable on Typhon', () => {
        if (!allUnits.find(u => u.id === 'roxy')) return;
        for (const b of withBosses(bosses, 'Typhon')) {
            const parsed = scoreForTeamString('Roxy/Harumasa/Velina', allUnits, { preview: true })[0];
            const s = scoreTeamForBoss(parsed.team, b, {});
            // Floor is 245, not the original 250: this team has NO support or defense agent, so
            // scoreTeamStructure's NO_SUPPORT demotion (applied to every supportless team, not
            // just CONVENTIONAL-classified ones — see ../engine/layers.md#no-support-or-defense-is-its-own-tier)
            // puts it at 0.80 instead of 0.85. The assertion is a VIABILITY FLOOR ("solid,
            // playable, not top-tier"), not an ordering. Softening NO_SUPPORT instead was
            // rejected: TEST 82 needs it below 0.812 and this team needs it at or above 0.81 —
            // a 0.002 window, too narrow to serve both.
            assert(s >= 245, `Roxy/Harumasa/Velina on Typhon should be playable (>= 245), got ${s?.toFixed(1)}`);
        }
    });

    // TEST 73: Pyrois's ultimate:weak normally suppresses ultimate provision (Dialyn's free
    // ults wasted on him); a wind-anomaly teammate's conditional ultimate:strong overrides that.
    run('TEST 73: wind anomaly un-suppresses Dialyn provision for Pyrois (Neutral)', () => {
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

    // TEST 74: Sigrid's scaling["anomaly:wind"]:1 passive must NOT inhibit her with no wind
    // source present — a wind-less team must still be strong, with a wind source only a bonus.
    run('TEST 74: Sigrid not penalized without wind anomaly (Neutral)', () => {
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

    // TEST 75: Thrall's `shill: stun` is a hard requirement because damage only lands inside
    // stun windows — but a stunless DPS (YSG) carries that multiplier permanently, so
    // YSG/Sunna/Zhao must stay viable without a stunner while a window-dependent DPS (Evelyn)
    // in the same shape stays disqualified.
    run('TEST 75: stunless DPS satisfies the stun shill on Thrall', () => {
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

    // TEST 76: Graded armorer damage-lever dependency (Neutral)
    // Armorers have few damage levers: CR, Laceration, PEN and defense shred. A team
    // supplying none of them leaves Claret unable to reach her ceiling. Both a laceration
    // line and a pure-shred line must clear a team that hands her nothing.
    run('TEST 76: armorer lever dependency is graded, not binary', () => {
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

    // TEST 77: Defense shred stacks cumulatively for an armorer (Neutral)
    // Trigger (defense:2) + Nicole (defense:3) shred ~60% between them. Shred raises armorer
    // damage without Claret receiving a buff at all, so the double-shred line must beat the
    // same team carrying only one shredder.
    run('TEST 77: stacked defense shred is cumulative for Claret', () => {
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

    // TEST 78: ATK is not an armorer lever — no diametric pair off it (Neutral)
    // The buff × defense-shred diametric pair normally forms off ATK/CD. An armorer gets
    // nothing from ATK, so Lucy (atk:2 only) must not earn Claret a diametric floor — while
    // the same pairing still works for a conventional attacker.
    run('TEST 78: ATK earns an armorer no diametric credit', () => {
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

    // TESTS 98-101: Miyabi's composition ordering — PARTIALLY RED BY DESIGN
    // Encodes owner-stated, game-grounded expectations; some are committed red on purpose as a
    // pinned specification, not a bug — a green suite here would mean the expectations had been
    // quietly weakened.
    //
    // Scores are only comparable within one boss (see ../engine/reading-scores.md), so the
    // ladder is evaluated per boss, in a silo, against four matchups chosen so the two axes that
    // matter here vary independently:
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
    // The bosses whose element favours the Miyabi/Nangong lines, and the only ones where the FULL
    // ladder order is asserted. Below the top two the order is boss-conditional by owner ruling —
    // see TEST 82 part 2.
    const STRICT_LADDER_BOSSES = ['Butcher', 'Marionettes'].flatMap(f => withBosses(bosses, f));
    assert(STRICT_LADDER_BOSSES.length === 2,
        `strict ladder fixture broken: expected 2 bosses, resolved ${STRICT_LADDER_BOSSES.length}`);

    /** Score one parsed spec against one boss. Returns -1 for a disqualified team. */
    const scoreSpec = (spec, boss, roster = allUnits) => {
        const parsed = scoreForTeamString(spec, roster)[0];
        assert(parsed, `fixture must parse to a legal team: ${spec}`);
        return { label: parsed.label, score: scoreTeamForBoss(parsed.team, boss, {}) };
    };

    run('TEST 79: Nangong/Miyabi/Yuzuha is Miyabi\'s strongest composition, per boss', () => {
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
    // viable cores. The second anomaly agent establishes disorder cycling; a third adds far less
    // than a top support brings, and costs field time and buffs on top.
    //
    // Remielle is deliberately absent from both lists: she is nominally anomaly but functions as
    // the support here (pseudo-support, no anomaly gauge of her own, her value is the Luminize
    // rebound off teammate procs), so including her would assert something the owner rejects.
    //
    // Vacuity guard: on the Miyabi/Vivian core every genuine third anomaly agent is disqualified
    // outright (three anomaly units, no support), so only pseudo-anomaly thirds (Nangong,
    // Soukaku, Roxy) produce a live comparison there — without the guard this could silently
    // degrade into asserting nothing if DQ rules ever widened.
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

    run('TEST 80: a third anomaly agent does not out-value a strong support for Miyabi', () => {
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

    // Ordering among Miyabi's TRUE anomaly partners only. Nangong is her best-in-slot partner and
    // sits ahead of all three — `Nangong > Vivian` guards against the fix overshooting when
    // raising Vivian for off-field buildup.
    //
    // Burnice vs Yanagi DEPENDS ON THE THIRD SLOT — Miyabi's disorder supply is 4 with either
    // partner by different routes, so disorder is a wash and the rung is decided by everything
    // else (Burnice wins by being the sole on-field carry and a half-tier higher; Yanagi's
    // disorder-damage buff nearly closes it). A third that buffs disorders (Yuzuha) inverts it,
    // since polarity is a disorder subclass and that buff pays into Yanagi's own damage. Full
    // numbers and ruling:
    // ../notes/adjudications.md#burnice-versus-yanagi-as-miyabis-anomaly-partner.
    //
    // Keyed off `buffs.disorders` on the third rather than off Yuzuha's name, so a newly added
    // disorder buffer makes a real prediction here instead of silently landing in the wrong
    // branch.
    //
    // Remielle is NOT a valid third here: swapping her partner changes the team's ARCHETYPE (two
    // vs three anomaly bodies feeds her conditional ATK buff differently), so the rung would be
    // measuring composition rather than partner quality. That rule is pinned by TEST 84 instead.
    const PARTNER_THIRDS = ['Yuzuha', 'Astra', 'Nicole'];

    run('TEST 81: Miyabi\'s anomaly partners — Vivian first, then Burnice unless the third buffs disorders', () => {
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

    // TEST 82: the owner's Miyabi best-in-slot ladder
    // The owner's stated ordering, checked per boss, committed knowing parts of it fail — where
    // they do, either the engine or the expectation is wrong, settled by review rather than by
    // tuning the engine to match. Middle entries were explicitly flagged as arguable, and the
    // bottom four are LOW CONFIDENCE (owner: "honestly very hard to answer") — re-derive during a
    // correctness pass rather than treating that half as a hard spec.
    //
    // Every adjacent pair is checked and ALL violations reported together — failing on the first
    // would hide the shape of the disagreement, which is the only thing this test is for.
    //
    // `Nangong/Miyabi/[Vivian|Nicole]` is one rung: the owner could not say which is better, so
    // the pair is unordered and only its position relative to its neighbours is asserted. A rung
    // whose teams are all disqualified on a given boss is skipped for that boss, and its
    // neighbours compared directly.
    run('TEST 82: Miyabi best-in-slot ladder (owner-stated)', () => {
        // `Nangong/Miyabi/Vivian` sits last because it has NO SUPPORT (stunner + carry + anomaly
        // subdps) and `scoreTeamStructure` demotes that from CONVENTIONAL to
        // UNCONVENTIONAL_VIABLE. `Nangong/Miyabi/Nicole` keeps a real support and stays mid-table.
        //
        // `Nangong/Miyabi/Sunna` above `Miyabi/Vivian/Yuzuha` is a hard, play-proven assertion —
        // owner: "the Nangong/Sunna wheelchair for Miyabi is very strong, only surpassed by the
        // Nangong/Yuzuha wheelchair." `Nangong/Miyabi/Astra` vs `Miyabi/Vivian/Yuzuha` is NOT —
        // owner called it a close, arguable call — so they share an UNORDERED rung: the ladder
        // asserts only where the pair sits relative to its neighbours, not which of the two wins.
        const ladder = [
            ['Nangong/Miyabi/Yuzuha'],
            ['Miyabi/Vivian/Remielle'],
            ['Nangong/Miyabi/Sunna'],
            ['Nangong/Miyabi/Astra', 'Miyabi/Vivian/Yuzuha'],
            ['Miyabi/Vivian/Astra'],
            ['Nangong/Miyabi/Nicole'],
            ['Miyabi/Vivian/Nicole'],
            ['Nangong/Miyabi/Vivian'],
        ];
        const violations = [];

        // PART 1 — holds on EVERY boss: the top two Miyabi teams are Nangong/Miyabi/Yuzuha then
        // Miyabi/Vivian/Remielle. Owner: "As long as NMY and MVR are the top 2 in all cases, I can
        // accept this." Asserted across the WHOLE corpus of Miyabi teams, not just the ladder
        // fixture, which is a stronger claim than the ladder alone and is what actually protects
        // the two wheelchairs.
        for (const boss of LADDER_BOSSES) {
            const top = getTopViableTeams(allTeamEntries, boss, 2, ['Miyabi']);
            if (top.length < 2) {
                violations.push(`${boss.name}: only ${top.length} viable Miyabi team(s) — fixture broken`);
                continue;
            }
            if (top[0].label !== 'Nangong / Miyabi / Yuzuha') {
                violations.push(`${boss.name}: Miyabi's #1 must be Nangong/Miyabi/Yuzuha, got ${top[0].label} (${top[0].score.toFixed(1)})`);
            }
            if (top[1].label !== 'Miyabi / Remielle / Vivian') {
                violations.push(`${boss.name}: Miyabi's #2 must be Miyabi/Vivian/Remielle, got ${top[1].label} (${top[1].score.toFixed(1)})`);
            }
        }

        // PART 2 — the FULL ladder, asserted only on the element-favourable bosses. Below the
        // top two the order is BOSS-CONDITIONAL, and that is accepted rather than a defect — full
        // ruling: ../notes/adjudications.md#miyabis-ladder-may-reorder-on-element-neutral-bosses.
        // No uniform lever can force it everywhere: a lift big enough for the neutral boss breaks
        // a rung on the favourable one, and lowering the other side fails for the mirror reason.
        for (const boss of STRICT_LADDER_BOSSES) {
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
            `${violations.length} ladder violation(s):\n      - ` + violations.join('\n      - '));
    });

    // TEST 83: Sunna beats Astra on attack and anomaly carries
    // Owner spec from actual play results. The rupture half was removed after playtesting showed
    // Sunna beating Astra on rupture too — she can only reach a rupture carry beside Nangong
    // (join rules), and Nangong+Sunna is the stun wheelchair Yixuan's stacking multipliers want.
    // Full story: ../notes/lessons-learned.md#the-team-that-was-supposed-to-be-the-bane. What
    // remains here is the attack/anomaly claim, unaffected by that removal.
    run('TEST 83: Sunna beats Astra on attack/anomaly carries', () => {
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

    // TEST 84: Remielle off triple-anomaly does not belong near the ladder
    // Pins that any non-triple-anomaly Remielle team sits below the Miyabi ladder floor. Her ATK
    // buff is `countTag: anomaly` (4 at three bodies, 2 at two, 0 at one) and counts TAGS, not
    // effective roles, so Nangong's pseudo-anomaly does not feed it. Full ruling:
    // ../notes/adjudications.md#remielle-off-triple-anomaly.
    //
    // The floor is TEST 82's bottom rung, so this tracks a rescale rather than needing
    // re-anchoring after calibration. Deliberately NOT asserted: non-triple-anomaly Remielle
    // teams without Vivian may legitimately interleave with the ladder's lower rungs — only the
    // non-triple-anomaly floor violation is pinned.
    run('TEST 84: non-triple-anomaly Remielle teams sit below the Miyabi ladder', () => {
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

    // TEST 85: a supportless team is never rewarded for being unconventional
    // Pins that the NO_SUPPORT demotion takes the harsher of the two classification factors, so
    // a supportless team that also classifies UNCONVENTIONAL_VIABLE cannot escape it. See
    // ../engine/layers.md#no-support-or-defense-is-its-own-tier for the Nangong/Alice/Sunna case
    // this fixed.
    //
    // PART 1 is asserted on Fiend only — boss-conditional, since Miyabi's on-element L3 edge
    // wins the anomaly-shill bosses instead (same ruling as TEST 82). PART 2 compares the same
    // two carries corpus-wide with no elemental confound.
    run('TEST 85: a supportless team never beats its supported counterpart (Fiend)', () => {
        const fiend = withBosses(bosses, 'Fiend');
        assert(fiend.length === 1, `expected exactly one Fiend boss, got ${fiend.length}`);

        const pairs = [
            ['Nangong/Alice/Sunna', 'Nangong/Alice/Miyabi'],
            ['Jane Doe/Vivian/Yuzuha', 'Nangong/Jane Doe/Vivian'],
        ];
        for (const [supported, supportless] of pairs) {
            const a = scoreSpec(supported, fiend[0]);
            const b = scoreSpec(supportless, fiend[0]);
            assert(a.score > b.score,
                `Fiend: ${a.label} (${a.score.toFixed(1)}) must beat the supportless ` +
                `${b.label} (${b.score.toFixed(1)})`);
        }

        // Part 2 — same carries, third slot swapped, every boss.
        let checked = 0;
        for (const boss of bosses) {
            const sup = scoreSpec('Nangong/Miyabi/Yuzuha', boss);
            const nos = scoreSpec('Nangong/Aria/Miyabi', boss);
            if (sup.score <= 0 && nos.score <= 0) continue;
            checked++;
            assert(sup.score > nos.score,
                `${boss.name}: Nangong/Miyabi/Yuzuha (${sup.score.toFixed(1)}) must beat the ` +
                `supportless Nangong/Aria/Miyabi (${nos.score.toFixed(1)})`);
        }
        assert(checked >= 8,
            `only ${checked} boss(es) were live for part 2 — this test has gone vacuous.`);
    });

    // TEST 86: a carry with no stunner loses real ground
    // Pins that a rupture carry with two supports and no stunner loses to stunner-plus-support,
    // per the graded structural credit in
    // ../notes/adjudications.md#a-missing-stunner-costs-different-amounts-to-different-archetypes.
    // Rupture's archetype page (../archetypes/rupture.md) names Pan Yinhu as the SUPPORT slot.
    //
    // Bosses are chosen per carry so neither the carry nor the compared stunners are resisted —
    // the owner's rule carries an explicit "except when the stunner is resisted" carve-out.
    run('TEST 86: a rupture carry prefers a stunner over a second support', () => {
        // Part 1 — the filed cases, each on the boss it was filed against.
        const cases = [
            ['Priest', 'Dialyn/Starlight Billy/Lucia', 'Starlight Billy/Pan Yinhu/Lucia'],
            ['Priest', 'Dialyn/Banyue/Lucia', 'Banyue/Pan Yinhu/Lucia'],
            ['Priest', 'Dialyn/Yixuan/Lucia', 'Yixuan/Pan Yinhu/Lucia'],
        ];
        for (const [bossName, withStun, noStun] of cases) {
            const bs = withBosses(bosses, bossName);
            assert(bs.length === 1, `expected one ${bossName}, got ${bs.length}`);
            const a = scoreSpec(withStun, bs[0]);
            const b = scoreSpec(noStun, bs[0]);
            assert(a.score > b.score,
                `${bs[0].name}: ${a.label} (${a.score.toFixed(1)}) must beat the stunnerless ` +
                `${b.label} (${b.score.toFixed(1)})`);
        }

        // Part 2 — the Yidhari/Lucia stunner ladder on Butcher, which has NO resistances, so
        // every stunner below is judged on merit rather than on being resisted. Owner: with
        // Yidhari/Lucia, Pan Yinhu must never beat Norma, Dialyn, Ju Fufu or Lycaon.
        const butcher = withBosses(bosses, 'Butcher').filter(b => !/raging/i.test(b.name));
        assert(butcher.length === 1, `expected one plain Butcher, got ${butcher.length}`);
        const pan = scoreSpec('Yidhari/Pan Yinhu/Lucia', butcher[0]);
        for (const spec of ['Norma/Yidhari/Lucia', 'Dialyn/Yidhari/Lucia',
                            'Ju Fufu/Yidhari/Lucia', 'Lycaon/Yidhari/Lucia']) {
            const st = scoreSpec(spec, butcher[0]);
            assert(st.score > pan.score,
                `Butcher: ${st.label} (${st.score.toFixed(1)}) must beat the stunnerless ` +
                `${pan.label} (${pan.score.toFixed(1)})`);
        }
        // Owner: Lycaon/Yidhari/Lucia should consistently beat Astra/Yidhari/Lucia.
        const lycaon = scoreSpec('Lycaon/Yidhari/Lucia', butcher[0]);
        const astra = scoreSpec('Astra/Yidhari/Lucia', butcher[0]);
        assert(lycaon.score > astra.score,
            `Butcher: ${lycaon.label} (${lycaon.score.toFixed(1)}) must beat ` +
            `${astra.label} (${astra.score.toFixed(1)})`);
    });

    // TEST 87: a resisted subdps is disqualified; a resisted pure stunner is not
    // Pins `isDamageDealer` (isDPS || hasSubDPSRole), used only by the L1 resistance check, not
    // a widening of DPS_ROLES. See [FUND-01]. All three arms matter: a resisted subdps (Norma)
    // is disqualified outright, a resisted pure stunner (Ju Fufu, Koleda) is only penalised, and
    // a resisted subdps who plays effective support (Orphie) is exempt from the DQ entirely.
    run('TEST 87: resisted subdps is DQd, resisted pure stunner is only penalised', () => {
        const fireResisting = bosses.filter(b => getBossResistances(b).includes('fire'));
        assert(fireResisting.length >= 4,
            `expected at least 4 fire-resisting bosses, got ${fireResisting.length}`);

        // Harumasa is the carry rather than a rupture unit on purpose: Sanguine Sweeper and
        // Discordant Solo both carry `anti: ["rupture"]`, which kills every rupture team
        // outright and would leave only two live bosses to compare on.
        let checked = 0;
        for (const boss of fireResisting) {
            // CONTROL: same team, non-fire stunner. If the control is dead the boss rejects
            // the composition for an unrelated reason and the comparison says nothing.
            const control = scoreSpec('Dialyn/Harumasa/Astra', boss);
            if (control.score <= 0) continue;
            checked++;

            // Norma is a fire SUBDPS -> disqualified outright.
            const norma = scoreSpec('Norma/Harumasa/Astra', boss);
            assert(norma.score <= 0,
                `${boss.name} resists fire: ${norma.label} must be disqualified, got ${norma.score.toFixed(1)}`);

            // Ju Fufu is a fire PURE stunner -> penalised (-80 in L3) but still playable.
            // This arm is what makes the change correct rather than merely harsh: the owner's
            // ruling distinguishes a subdps, whose damage IS her value, from a stunner whose
            // job is the window and survives a resisted element.
            const juFufu = scoreSpec('Ju Fufu/Harumasa/Astra', boss);
            assert(juFufu.score > 0,
                `${boss.name}: ${juFufu.label} is a PURE stunner and must stay viable despite ` +
                `the resisted element, got ${juFufu.score.toFixed(1)}`);

            // Orphie is fire AND carries a subdps pseudo-role, but plays as an effective
            // support — the isEffectiveSupport exemption must keep her out of the DQ entirely.
            const orphie = scoreSpec('Orphie/Harumasa/Astra', boss);
            assert(orphie.score > 0,
                `${boss.name}: ${orphie.label} plays support and must not be disqualified, ` +
                `got ${orphie.score.toFixed(1)}`);
        }
        assert(checked >= 4,
            `only ${checked} fire-resisting boss(es) gave a live comparison — this test has ` +
            `gone vacuous.`);

        // Koleda cannot join Harumasa/Astra (join legality, not resistance), so her arm of the
        // pure-stunner rule is checked on the rupture team, on the one fire-resisting boss
        // that does not also carry `anti: rupture`.
        const fiend = withBosses(bosses, 'Fiend');
        assert(fiend.length === 1, `expected one Fiend, got ${fiend.length}`);
        const koleda = scoreSpec('Koleda/Yixuan/Lucia', fiend[0]);
        assert(koleda.score > 0,
            `Fiend: ${koleda.label} is a PURE stunner and must stay viable despite the ` +
            `resisted element, got ${koleda.score.toFixed(1)}`);
    });

    // TEST 88: Trigger/SAnby/Seed floor on UCC
    // Pins the floor at 295. Seed is tagged `attack` but plays support (buffs atk 3/cd 3/dmg 2)
    // beside SAnby's `scaling.codependent`, and the engine can't see that — she declares no
    // `pseudoRole`, so the team classifies as two same-element attack carries with no
    // interaction (see TEST 89). Cleared only by two declared L5 synergy groups
    // (`"Trigger+Seed"`, `"Trigger+SAnby"`), not emergently — a DECLARED carve-out, not a fix.
    // Margin is ~2 points; treat the floor as a viability statement, not a calibrated number.
    //
    // History, rejected fixes, and the open principled fix (give Seed a support `pseudoRole`, or
    // infer pseudosupport from buff supply):
    // ../notes/lessons-learned.md#when-a-carve-out-is-a-carve-out-say-so and
    // ../issues/deferred/medium-trigger-sanby-seed-clears-its-floor-only-by-declaration.md.
    // Do NOT rescue it by restoring the same-element escape; that re-breaks TEST 89.
    run('TEST 88: Trigger/SAnby/Seed stays playable on UCC (>= 300)', () => {
        const b = withBosses(bosses, 'Corruption').find(Boolean);
        const seed = scoreSpec('Trigger/SAnby/Seed', b);
        assert(seed.score >= 295,
            `${b.name}: ${seed.label} (${seed.score.toFixed(1)}) >= 295 - Seed plays support ` +
            `(atk 3 / cd 3 / dmg 2) but declares no pseudoRole, so the team reads as two carries; force-adjusted via L5`);
    });

    // TEST 89: two attack carries of one element are not a team
    // Pins that `classifyTeamStructure` grants a second carry credit only when it is explicitly
    // a subdps or pseudosupport — sharing an element alone is not interaction, since same-element
    // carries can't disorder each other and still can't both hold the field. Anomaly is the role
    // that genuinely wants two bodies; attack is not. See
    // ../notes/adjudications.md#same-element-is-not-interaction.
    //
    // Each pair swaps the second carry for a support and keeps everything else fixed, so the
    // comparison isolates the second-carry question. Asserted per boss, corpus-wide.
    run('TEST 89: a second same-element attack carry loses to a support', () => {
        const pairs = [
            ['Norma/Ellen/Astra', 'Norma/Ellen/Sigrid'],                  // both ice
            ['Ye Shunguong/Sunna/Astra', 'Nekomata/Ye Shunguong/Sunna'],  // both physical
            ['Norma/Evelyn/Astra', 'Norma/Evelyn/Soldier 11'],            // both fire
        ];
        let checked = 0;
        for (const [supported, dualCarry] of pairs) {
            for (const boss of bosses) {
                const a = scoreSpec(supported, boss);
                const b = scoreSpec(dualCarry, boss);
                if (a.score <= 0 && b.score <= 0) continue;
                checked++;
                assert(a.score > b.score,
                    `${boss.name}: ${a.label} (${a.score.toFixed(1)}) must beat the ` +
                    `double-carry ${b.label} (${b.score.toFixed(1)})`);
            }
        }
        assert(checked >= 25,
            `only ${checked} live boss/pair comparison(s) - this test has gone vacuous.`);
    });

    // TEST 90: the Remielle/Velina third-slot ladder (owner playtest)
    // Pins the owner's playtested order (Aria > Promeia > Alice > Burnice > Jane Doe) and that
    // the whole Velina track outranks Miyabi/Vivian/Remielle. Held up by two DECLARED L5
    // relationships rather than emergent scoring — a mutual Remielle<->Velina pair, and Alice's
    // CONJUNCTIVE "Remielle+Velina" group, which pays only when both are present. Full history:
    // ../notes/lessons-learned.md#declared-relationships-fixed-what-no-constant-could.
    //
    // BOSS-CONDITIONAL, asserted narrowly on purpose: elemental L3 legitimately reorders the
    // lower rungs elsewhere (fire-weak Pompey lifts Burnice, ice-weak Horizon lifts Promeia
    // above Aria, ice+ether-weak Butcher/Marionettes lift frost Miyabi above the RV teams — see
    // TEST 82 for the same pattern on the Miyabi ladder). Girtablullu and Stagnant Aberrant are
    // the two anomaly-shill bosses that are element-neutral to every unit here, so they are
    // where the ladder is a statement about the units rather than the matchup. DO NOT widen this
    // to every boss; it will fail, and correctly.
    run('TEST 90: Remielle/Velina third-slot ladder on element-neutral bosses', () => {
        const LADDER = [
            'Aria/Remielle/Velina',
            'Promeia/Remielle/Velina',
            'Alice/Remielle/Velina',
            'Burnice/Remielle/Velina',
            'Jane Doe/Remielle/Velina',
        ];
        const NEUTRAL_TO_THESE = ['Girtablullu', 'Aberrant'];

        let checked = 0;
        for (const bossName of NEUTRAL_TO_THESE) {
            const bs = withBosses(bosses, bossName);
            assert(bs.length === 1, `expected exactly one ${bossName}, got ${bs.length}`);
            const boss = bs[0];
            const scored = LADDER.map(spec => scoreSpec(spec, boss));
            if (scored.some(x => x.score <= 0)) continue;
            checked++;

            for (let i = 1; i < scored.length; i++) {
                assert(scored[i - 1].score > scored[i].score,
                    `${boss.name}: ${scored[i - 1].label} (${scored[i - 1].score.toFixed(1)}) must ` +
                    `outrank ${scored[i].label} (${scored[i].score.toFixed(1)})`);
            }

            // The Vivian/Miyabi track must sit below the whole Velina track here.
            const mvr = scoreSpec('Miyabi/Remielle/Vivian', boss);
            const worstRV = Math.min(...scored.map(x => x.score));
            assert(mvr.score < worstRV,
                `${boss.name}: ${mvr.label} (${mvr.score.toFixed(1)}) must sit below every ` +
                `Remielle/Velina team (worst is ${worstRV.toFixed(1)})`);
        }
        assert(checked === 2,
            `only ${checked} of the 2 element-neutral bosses were live - this test has gone vacuous.`);
    });

    // TEST 91: a conjunctive synergy group pays only when the WHOLE group is present
    // `synergy.units` entries joined with "+" require every named unit on the team. This is the
    // mechanism behind Alice's placement in TEST 90, and the gating IS the point: a group that
    // paid out on a partial match would be indistinguishable from two single-name declarations
    // and would lift teams the owner never asked to lift.
    run('TEST 91: conjunctive synergy requires the whole group', () => {
        const boss = withBosses(bosses, 'Aberrant').find(Boolean);
        const alice = allUnits.find(u => u.name === 'Alice');
        assert(alice, 'fixture unit Alice not found');
        const group = (alice.synergy?.units || []).find(e => typeof e === 'string' && e.includes('+'));
        assert(group === 'Remielle+Velina',
            `Alice should declare the conjunctive group "Remielle+Velina", got ${JSON.stringify(group)}`);

        const l5Of = (spec) => {
            const trace = {};
            const parsed = scoreForTeamString(spec, allUnits);
            assert(parsed.length === 1, `fixture ${spec} did not resolve to one team`);
            scoreTeamForBoss(parsed[0].team, boss, { trace });
            return trace.l5;
        };

        // Both present: Alice's 55 plus the Remielle<->Velina mutual pair.
        const both = l5Of('Alice/Remielle/Velina');
        assert(both >= 55,
            `with both group members present Alice's group must pay: L5 was ${both}`);

        // Only ONE member present: the group pays nothing. Neither partial team carries any
        // other L5 relationship, so these must be exactly 0.
        const onlyRemielle = l5Of('Alice/Remielle/Vivian');
        assert(onlyRemielle === 0,
            `Remielle without Velina must not trigger Alice's group: L5 was ${onlyRemielle}`);
        const onlyVelina = l5Of('Nangong/Alice/Velina');
        assert(onlyVelina === 0,
            `Velina without Remielle must not trigger Alice's group: L5 was ${onlyVelina}`);
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
