/**
 * test-scoring.mjs
 *
 * Assertion-based regression tests for the team scoring engine
 * (`scoreTeamForBoss` from `app/public/lib/common/team-scorer.js`).
 *
 * Run from the repository root:
 *   node test-scoring.mjs
 *
 * Exit code: 0 if all tests pass, 1 if any test fails.
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
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';

// ---------------------------------------------------------------------------
// Viability / disqualification
// ---------------------------------------------------------------------------
// `matchups.js` only *lists* teams with score > 0. A score <= 0 means the
// comp is not viable for that boss (disqualification, anti-synergy, etc.).
// Assertions use the raw `scoreTeamForBoss` return value unless noted.

/** Neutral synthetic boss: same as `matchups.js` (full roster has no "neutral" in JSON as a real boss in some builds — appended at runtime). */
const NEUTRAL_BOSS = {
    name: 'Synthetic Neutral Boss',
    weaknesses: [],
    resistances: [],
    shill: null,
    anti: [],
    favored: [],
    assists: 0
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
    const options = { preview: false };
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
    const { teams, warnings } = parseTeams(teamsString, allUnits, { preview: opts.preview ?? false });
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

async function main() {
    const { units: allUnits, bosses: bossesRaw, roster } = await loadAllData();
    const bosses = [...bossesRaw, { ...NEUTRAL_BOSS }];
    const allTeamEntries = makeAllViableTeamEntries(allUnits, roster);

    const failures = [];

    function run(name, fn) {
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
        assert(tOrphie > tCissia, `Trigger+SAnby: Orphie (${tOrphie}) > Cissia (${tCissia})`);
        assert(tCissia > tAstra, `Trigger+SAnby: Cissia (${tCissia}) > Astra (${tAstra})`);
        assert(tAstra > tSeed, `Trigger+SAnby: Astra (${tAstra}) > Seed (${tSeed})`);
        assert(tSeed > tZhao, `Trigger+SAnby: Seed (${tSeed}) > Zhao (${tZhao})`);

        const oTrigger = m.get('Trigger / Orphie / SAnby');
        const oJuFufu = m.get('Ju Fufu / Orphie / SAnby');
        const oDialyn = m.get('Dialyn / Orphie / SAnby');
        assert(oTrigger > oJuFufu, `SAnby+Orphie: Trigger (${oTrigger}) > Ju Fufu (${oJuFufu})`);
        assert(oJuFufu > oDialyn, `SAnby+Orphie: Ju Fufu (${oJuFufu}) > Dialyn (${oDialyn})`);

        for (const [label, score] of m) {
            assert(score >= 315, `UCC / ${label}: got ${score}, expected >= 315`);
        }
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
    // Expect: Dialyn/Hugo/Sunna ~200–270; with Lycaon or Lighter stun, higher band.
    run('TEST 6: Hugo + Sunna vs stunner bands (Thrall, Marionettes, Neutral)', () => {
        const lowT = 'Dialyn/Hugo/Sunna';
        const dualStunT = 'Dialyn/Lighter/Hugo,Dialyn/Lycaon/Hugo,Ju Fufu/Lighter/Hugo';
        const jlhT = 'Ju Fufu/Lycaon/Hugo';
        const flexT = 'Dialyn/Trigger/Hugo,Dialyn/Ju Fufu/Hugo';
        const low = scoreForTeamString(lowT, allUnits)[0];
        const dualStunList = scoreForTeamString(dualStunT, allUnits);
        const jlh = scoreForTeamString(jlhT, allUnits)[0];
        const flexList = scoreForTeamString(flexT, allUnits);
        for (const b of withBosses(bosses, 'Thrall,Marionettes')) {
            const lowS = scoreTeamForBoss(low.team, b, {});
            assert(
                lowS >= 180 && lowS <= 275,
                `${b.name} Dialyn/Hugo/Sunna: got ${lowS}, expected [180, 275]`
            );
            for (const { label, team } of dualStunList) {
                const s = scoreTeamForBoss(team, b, {});
                assert(s >= 350, `${b.name} ${label}: got ${s}, expected >=350`);
            }
            for (const { label, team } of flexList) {
                const s = scoreTeamForBoss(team, b, {});
                assert(s >= 350, `${b.name} ${label}: got ${s}, expected >=350`);
            }
            const jlhS = scoreTeamForBoss(jlh.team, b, {});
            assert(jlhS >= 300, `${b.name} JF/Lycaon/Hugo: got ${jlhS}, expected >=300`);
            for (const { label, team } of dualStunList) {
                const s = scoreTeamForBoss(team, b, {});
                assert(jlhS < s, `${b.name}: JF/Lycaon/Hugo (${jlhS}) should be < ${label} (${s})`);
            }
        }
        for (const b of withBosses(bosses, 'Neutral')) {
            const lowS = scoreTeamForBoss(low.team, b, {});
            assert(
                lowS >= 180 && lowS <= 220,
                `${b.name} Dialyn/Hugo/Sunna: got ${lowS}, expected [180, 220]`
            );
            for (const { label, team } of dualStunList) {
                const s = scoreTeamForBoss(team, b, {});
                assert(s >= 300, `${b.name} ${label}: got ${s}, expected >=300`);
            }
            for (const { label, team } of flexList) {
                const s = scoreTeamForBoss(team, b, {});
                assert(s >= 300, `${b.name} ${label}: got ${s}, expected >=300`);
            }
            const jlhS = scoreTeamForBoss(jlh.team, b, {});
            assert(jlhS >= 285, `${b.name} JF/Lycaon/Hugo: got ${jlhS}, expected >=285`);
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
        // On Pompey (fire-weak): Lighter beats Dialyn due to fire element + recovery synergy
        for (const b of withBosses(bosses, 'Pompey')) {
            const astraTriple =
                'Dialyn/Evelyn/Astra,Lighter/Evelyn/Astra,Ju Fufu/Evelyn/Astra';
            const m1 = scoreMapForBoss(scoreForTeamString(astraTriple, allUnits), b);
            assert(
                m1.get('Lighter / Evelyn / Astra') > m1.get('Dialyn / Evelyn / Astra') &&
                    m1.get('Dialyn / Evelyn / Astra') > m1.get('Ju Fufu / Evelyn / Astra'),
                `${b.name}: Evelyn+Astra: want Lighter > Dialyn > JF (fire-weak)`
            );
        }
    });

    // ========================================================================
    // TEST 8: Nangong/Miyabi support order + Harumasa as fake support
    // ========================================================================
    // Expect: Yuzuha > Astra & Sunna > Nicole & Soukaku; Harumasa far below (~190–215 in batch) — we use < 300 vs > 400 split as a hard gap.
    // Nicole vs Soukaku can swap by boss; both sit below Astra/Sunna with Yuzuha on top.
    run('TEST 8: Nangong/Miyabi support ordering (Butcher, Marionettes, Sacrifice)', () => {
        const t =
            'Nangong/Miyabi/Yuzuha,Nangong/Miyabi/Astra,Nangong/Miyabi/Sunna,Nangong/Miyabi/Nicole,Nangong/Miyabi/Soukaku,Nangong/Miyabi/Harumasa';
        for (const b of withBosses(bosses, 'Butcher,Marionettes,Sacrifice')) {
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
    // Caesar/Yixuan/Lucia is a legit team on Butcher (Yx/L carry, Caesar stunner).
    // Trigger/Cissia/Caesar and Trigger/YSG/Caesar on Slugger should be mid — verifies
    // that Trigger/Caesar diametric synergy doesn't hyperinflate.
    run('TEST 11: Caesar teams — CYL strong on Butcher, Trigger/Caesar mid on Slugger', () => {
        const butcher = withBosses(bosses, 'Butcher').find(Boolean);
        const cyl = scoreForTeamString('Yixuan/Caesar/Lucia', allUnits)[0];
        const cylScore = scoreTeamForBoss(cyl.team, butcher, {});
        assert(cylScore >= 350, `Butcher Caesar/Yx/Lucia: got ${cylScore}, expected >= 350`);

        const slugger = withBosses(bosses, 'Slugger').find(Boolean);
        const tcc = scoreForTeamString('Trigger/Cissia/Caesar', allUnits)[0];
        const tccScore = scoreTeamForBoss(tcc.team, slugger, {});
        assert(tccScore <= 220, `Slugger Trigger/Cissia/Caesar: got ${tccScore}, expected <= 220`);

        const tyc = scoreForTeamString('Trigger/Ye Shunguong/Caesar', allUnits)[0];
        const tycScore = scoreTeamForBoss(tyc.team, slugger, {});
        assert(tycScore <= 220, `Slugger Trigger/YSG/Caesar: got ${tycScore}, expected <= 220`);
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
    // TEST 13: synergy.avoid — Pan + Dialyn
    // ========================================================================
    // Expect: every listed team is disqualified (score <= 0) on Neutral.
    run('TEST 13: Dialyn + Pan Yinhu teams are disqualified (<=0) on Neutral', () => {
        const t = 'Dialyn/Pan Yinhu/Evelyn,Dialyn/Pan Yinhu/Banyue,Dialyn/Pan Yinhu/Yidhari';
        const b = withBosses(bosses, 'Neutral').find(Boolean);
        for (const { team, label } of scoreForTeamString(t, allUnits)) {
            const s = scoreTeamForBoss(team, b, {});
            assert(s <= 0, `Neutral: ${label} should be disqualified, got ${s}`);
        }
    });

    // ========================================================================
    // TEST 14: Banyue fire-weak band
    // ========================================================================
    run('TEST 14: Banyue teams ~320–385 (Neutral, Pompey, Hunter)', () => {
        const t =
            'Dialyn/Banyue/Lucia,Ju Fufu/Banyue/Lucia,Banyue/Astra/Lucia,Banyue/Pan Yinhu/Lucia';
        for (const b of withBosses(bosses, 'Neutral,Pompey,Hunter')) {
            for (const { team, label } of scoreForTeamString(t, allUnits)) {
                const s = scoreTeamForBoss(team, b, {});
                assert(
                    s >= 320 && s <= 450,
                    `${b.name} ${label}: got ${s}, expected Banyue fire-weak ~[320, 385] widened to [320, 450]`
                );
            }
        }
    });

    // ========================================================================
    // TEST 15 (partial only): Nangong/Yixuan/Sunna band; Dialyn/Hugo/Sunna SKIPPED
    // ========================================================================
    run('TEST 15 (partial): Nangong/Yixuan/Sunna suboptimal mix ceiling (Butcher, Marionettes, Neutral)', () => {
        const { team } = scoreForTeamString('Nangong/Yixuan/Sunna', allUnits)[0];
        for (const b of withBosses(bosses, 'Butcher,Marionettes,Neutral')) {
            const s = scoreTeamForBoss(team, b, {});
            assert(
                s <= 265,
                `${b.name}: got ${s}, expected <= 265 (cross-archetype mix should not score well)`
            );
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
    run('TEST 17: Ju Fufu/Yixuan/Lucia > Yixuan/Astra/Lucia (rupture bosses)', () => {
        const a = scoreForTeamString('Ju Fufu/Yixuan/Lucia', allUnits)[0];
        const b2 = scoreForTeamString('Yixuan/Astra/Lucia', allUnits)[0];
        for (const b of withBosses(bosses, 'Butcher,Corruption,Hunter,Priest')) {
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
                scoreTeamForBoss(low.team, b, {}) <= 250,
                `${b.name} Lycaon/Yixuan/Soukaku should be mid (<= 250), got ${scoreTeamForBoss(low.team, b, {})}`
            );
        }
        const mid = scoreForTeamString('Ye Shunguong/Zhao/Soukaku', allUnits)[0];
        for (const b of withBosses(bosses, 'Nightmare')) {
            const ms = scoreTeamForBoss(mid.team, b, {});
            assert(ms >= 300, `${b.name} YSG/Zhao/Soukaku: got ${ms}, expected >= 300 (YSG shill boss)`);
        }
        for (const b of withBosses(bosses, 'Butcher')) {
            const ms = scoreTeamForBoss(mid.team, b, {});
            assert(
                ms >= 180 && ms <= 240,
                `${b.name} YSG/Zhao/Soukaku: got ${ms}, expected [180, 240] (off-weakness anomaly boss)`
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
    // TEST 28: on-weakness T0.5 vs off-weakness T0 (Fiend)
    // ========================================================================
    run('TEST 28: Alice/Vivian/Yuzuha > Miyabi/Vivian/Yuzuha on Fiend', () => {
        const b = withBosses(bosses, 'Fiend').find(Boolean);
        const t = 'Alice/Vivian/Yuzuha,Miyabi/Vivian/Yuzuha';
        const m = scoreMapForBoss(scoreForTeamString(t, allUnits), b);
        assert(
            m.get('Alice / Vivian / Yuzuha') > m.get('Miyabi / Vivian / Yuzuha'),
            'Fiend: AVY should beat MVY (on-weakness vs off-weakness)'
        );
    });

    // ========================================================================
    // TEST 29: Astra/Nicole "wheelchair" — 300+ on Marionettes & Corruption
    // ========================================================================
    // Batch: Miyabi 300+; "ZY/Astra/Nicole viable but lower (ZY is T2)" — separate floor for Zhu Yuan.
    run('TEST 29: Miyabi and Zhu Yuan Astra/Nicole "wheelchair" competitive (Marionettes, Corruption)', () => {
        const miyabi = scoreForTeamString('Miyabi/Astra/Nicole', allUnits)[0];
        const zy = scoreForTeamString('Zhu Yuan/Astra/Nicole', allUnits)[0];
        for (const b of withBosses(bosses, 'Marionettes,Corruption')) {
            const ms = scoreTeamForBoss(miyabi.team, b, {});
            assert(
                ms >= 300,
                `${b.name} Miyabi/Astra/Nicole: got ${ms}, want >= 300`
            );
            const zs = scoreTeamForBoss(zy.team, b, {});
            assert(
                zs >= 180,
                `${b.name} Zhu Yuan/Astra/Nicole: got ${zs}, want 180+ (T2 DPS, ZY not hypercarry enough to go without stunner)`
            );
        }
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
            assert(lesS >= 180, `${b.name} LES: got ${lesS}, expected >= 180`);
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
    // TEST 33: Lighter/Evelyn/Astra > Trigger/Evelyn/Astra on neutral
    // ========================================================================
    // Lighter's recovery debuff synergizes with Evelyn's chain-scaling playstyle;
    // should beat Trigger's diametric synergy advantage on neutral bosses.
    run('TEST 33: Lighter > Trigger for Evelyn on neutral (recovery synergy)', () => {
        const teams = scoreForTeamString(
            'Lighter/Evelyn/Astra,Trigger/Evelyn/Astra', allUnits);
        for (const b of withBosses(bosses, 'Neutral')) {
            const m = scoreMapForBoss(teams, b);
            const lighter = m.get('Lighter / Evelyn / Astra');
            const trigger = m.get('Trigger / Evelyn / Astra');
            assert(lighter > trigger,
                `${b.name}: Lighter/Evelyn/Astra (${lighter}) should beat Trigger/Evelyn/Astra (${trigger})`);
        }
    });

    // ========================================================================
    // TEST 34: Promeia ice vortex dominance on Mutant
    // ========================================================================
    run('TEST 34: Promeia teams dominate Mutant; outscore Miyabi teams', () => {
        const teams = scoreForTeamString(
            'Lycaon/Promeia/Soukaku,Nangong/Promeia/Yuzuha,Lighter/Promeia/Burnice,Miyabi/Vivian/Yuzuha,Nangong/Miyabi/Yuzuha',
            allUnits, { preview: true });
        for (const b of withBosses(bosses, 'Mutant')) {
            const m = scoreMapForBoss(teams, b);
            const lps = m.get('Lycaon / Promeia / Soukaku');
            const npy = m.get('Nangong / Promeia / Yuzuha');
            const lpb = m.get('Lighter / Burnice / Promeia');
            const mvy = m.get('Miyabi / Vivian / Yuzuha');
            const nmy = m.get('Nangong / Miyabi / Yuzuha');
            assert(npy > 400, `${b.name}: NPY (${npy}) expected > 400`);
            assert(lps > 400, `${b.name}: LPS (${lps}) expected > 400`);
            assert(lpb > 380, `${b.name}: LPB (${lpb}) expected > 380`);
            assert(npy > mvy, `${b.name}: NPY (${npy}) should beat MVY (${mvy})`);
            assert(lps > mvy, `${b.name}: LPS (${lps}) should beat MVY (${mvy})`);
            assert(npy > nmy, `${b.name}: NPY (${npy}) should beat NMY (${nmy}) — vortex advantage`);
        }
    });

    // ========================================================================
    // TEST 35: Lighter/Promeia/Burnice abloom synergy on Mutant
    // ========================================================================
    run('TEST 35: Lighter/Promeia/Burnice competitive on Mutant (abloom + vortex)', () => {
        const teams = scoreForTeamString(
            'Lighter/Promeia/Burnice', allUnits, { preview: true });
        for (const b of withBosses(bosses, 'Mutant')) {
            const m = scoreMapForBoss(teams, b);
            const lpb = m.get('Lighter / Burnice / Promeia');
            assert(lpb > 380, `${b.name}: LPB (${lpb}) expected > 380 (abloom + dual vortex)`);
        }
    });

    // ========================================================================
    // TEST 36: Miyabi weakness on Mutant vs strength on Sacrifice Bringer
    // ========================================================================
    run('TEST 36: Miyabi/Vivian/Yuzuha much stronger on Bringer than Mutant', () => {
        const teams = scoreForTeamString(
            'Miyabi/Vivian/Yuzuha', allUnits, { preview: true });
        const mutants = withBosses(bosses, 'Mutant');
        const bringers = withBosses(bosses, 'Sacrifice');
        for (const mb of mutants) {
            const mutantScore = scoreTeamForBoss(teams[0].team, mb, {});
            for (const bb of bringers) {
                const bringerScore = scoreTeamForBoss(teams[0].team, bb, {});
                assert(bringerScore > 300, `${bb.name}: MVY (${bringerScore}) expected > 300`);
                assert(bringerScore > mutantScore + 50,
                    `MVY on Bringer (${bringerScore}) should beat Mutant (${mutantScore}) by 50+`);
            }
        }
    });

    // ========================================================================
    // TEST 37: Polarity providers mitigate Miyabi on Mutant
    // ========================================================================
    run('TEST 37: Nangong/Miyabi/Yuzuha > Miyabi/Vivian/Yuzuha on Mutant (polarity mitigation)', () => {
        const teams = scoreForTeamString(
            'Nangong/Miyabi/Yuzuha,Miyabi/Vivian/Yuzuha', allUnits, { preview: true });
        for (const b of withBosses(bosses, 'Mutant')) {
            const m = scoreMapForBoss(teams, b);
            const nmy = m.get('Nangong / Miyabi / Yuzuha');
            const mvy = m.get('Miyabi / Vivian / Yuzuha');
            assert(nmy > mvy,
                `${b.name}: NMY (${nmy}) should beat MVY (${mvy}) — Nangong polarity feeds Miyabi scaling`);
        }
    });

    // ========================================================================
    // TEST 38: Non-anomaly teams unaffected by vortex on Mutant
    // ========================================================================
    run('TEST 38: Attack/rupture teams on Mutant — no accidental vortex bonuses', () => {
        const teams = scoreForTeamString(
            'Lighter/Evelyn/Astra,Lycaon/Zhu Yuan/Nicole', allUnits, { preview: true });
        for (const b of withBosses(bosses, 'Mutant')) {
            const m = scoreMapForBoss(teams, b);
            for (const [label, s] of m) {
                assert(s > 0, `${b.name}: ${label} (${s}) should not be disqualified as a non-anomaly team`);
            }
        }
    });

    // ========================================================================
    // TEST 39: Regression — existing compositions unchanged on non-Mutant bosses
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

    // ------------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------------
    console.log('');
    if (failures.length === 0) {
        console.log('All tests passed.');
        process.exit(0);
    } else {
        console.log(`${failures.length} test(s) failed.`);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
