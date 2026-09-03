#!/usr/bin/env node
/**
 * The certification gate for archetype calibration. Nothing downstream — no consumer gets
 * switched to calibrated scores — until this reports clean and the owner has approved a run.
 * Expect several tuning passes (anchor rule, K, target), so this is built to be cheap to re-run
 * and to be the thing actually read to decide, not a pass/fail buried in test output.
 *
 * TWO SEPARATE QUESTIONS, kept separate on purpose:
 *
 *   1. CERTIFICATION — did calibration corrupt anything? For every boss and every archetype,
 *      the calibrated ranking of that archetype's teams must be IDENTICAL to the raw ranking.
 *      This is true by construction (calibrated = raw * a positive per-archetype constant), so
 *      it costs nothing to assert and is exactly the kind of invariant that catches a real bug:
 *      an accidental clamp, a factor that leaked a per-boss term, rounding applied to the result
 *      instead of the factor, or an archetype mislabelled. Zero tolerance — any inversion fails
 *      the run.
 *
 *   2. WHAT MOVED ON PURPOSE — cross-archetype re-ranking is the entire point of calibration, so
 *      "did the top-10 mix change" is not a failure, it is the deliverable. Reported separately
 *      (--mix) so it never gets confused with #1's zero-tolerance check.
 *
 * Usage:
 *   node calibration-check.mjs                  # certify + compact mix + alignment summary
 *   node calibration-check.mjs --boss fiend      # narrow every section to one boss
 *   node calibration-check.mjs --top 20          # calibrated top-N per boss, archetype tagged
 *   node calibration-check.mjs --mix             # full per-boss top-10 archetype mix, raw vs cal
 *   node calibration-check.mjs --alignment       # neutral-boss p85 spread + per-boss p85 table
 *   node calibration-check.mjs --preview         # use calibration.preview.json (armorer/Claret)
 *   node calibration-check.mjs --json            # machine-readable, all sections
 *
 * Exit code: 0 only when certification finds zero rank inversions. Every other flag is
 * diagnostic and does not affect the exit code on its own.
 */

import { loadAllData, loadCalibration } from './lib/data.js';
import { buildTeams } from './lib/team-pipeline.js';
import { scoreTeamForBoss, resolveBossVariation } from './app/public/lib/common/team-scorer.js';
import { calibrate, computeEngineFingerprint, isStale } from './lib/calibration.js';

const argv = process.argv.slice(2);
const has = name => argv.includes(name);
const flag = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};

const PREVIEW = has('--preview') || has('-p');
const BOSS_FILTER = flag('--boss', null);
const TOP_N = parseInt(flag('--top', '0'), 10); // 0 = section not requested
const SHOW_MIX = has('--mix');
const SHOW_ALIGNMENT = has('--alignment');
const JSON_OUT = has('--json');

// The check every other section is downstream of. p85 on the neutral boss is the depth where
// mixed-archetype junk teams have mostly dropped out but the ceiling isn't just being
// re-measured — see the plan doc for why the pooled cross-corpus quantile table was the wrong
// objective function and this replaced it.
const ALIGNMENT_QUANTILE = 0.85;

const NEUTRAL_BOSS = {
    id: 'neutral',
    name: 'Synthetic Neutral Boss',
    favored: [],
    mechanics: { weaknesses: [], resistances: [], shill: null, anti: [], assists: 0 },
};

async function buildCorpus() {
    // loadAllData() always loads units.json/bosses.json in full (preview-flagged units
    // included) and filters happen locally below, matching score-dump.mjs's convention.
    // Its bundled `calibration` is always calibration.json (not preview-aware), so the preview
    // file is fetched explicitly here when --preview is passed.
    const { units: allUnits, bosses, calibration } = await loadAllData();
    const cal = PREVIEW ? await loadCalibration({ preview: true, required: false }) : calibration;
    if (!cal) {
        console.error(`No calibration file found (${PREVIEW ? 'calibration.preview.json' : 'calibration.json'}). ` +
            `Run: node generate-calibration.mjs${PREVIEW ? ' --preview' : ''}`);
        process.exit(2);
    }

    const availableUnits = PREVIEW ? [...allUnits] : allUnits.filter(u => u.available !== false);
    const { threeCharTeams, teamLabels } = buildTeams(availableUnits, ['Nicole']);

    let corpus = [];
    for (const boss of bosses) {
        corpus.push(boss);
        for (const [id, v] of Object.entries(boss.variations ?? {})) {
            if (v.enabled === true) corpus.push(resolveBossVariation(boss, id));
        }
    }
    corpus.push(NEUTRAL_BOSS);

    const bossLabel = b => (b._variationId ? `${b.id}:${b._variationId}` : b.id);
    if (BOSS_FILTER) corpus = corpus.filter(b => bossLabel(b) === BOSS_FILTER);
    if (BOSS_FILTER && corpus.length === 0) {
        console.error(`--boss ${BOSS_FILTER}: no matching boss (check the id, or id:variation).`);
        process.exit(2);
    }

    const rows = [];
    for (const boss of corpus) {
        const bl = bossLabel(boss);
        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            const trace = {};
            const raw = scoreTeamForBoss(team, boss, { trace });
            if (raw <= 0 || trace.disqualified) continue;
            const archetype = trace.carryArchetype;
            let calibrated;
            try {
                calibrated = calibrate(raw, archetype, cal);
            } catch (e) {
                console.error(`FATAL during calibration of "${label}" on "${bl}": ${e.message}`);
                process.exit(2);
            }
            rows.push({ boss: bl, team: label, raw, calibrated, archetype });
        }
    }

    return { rows, calibration: cal, bossLabels: corpus.map(bossLabel) };
}

// --- 1. CERTIFICATION ---------------------------------------------------------------------

function certify(rows) {
    const groups = new Map(); // "boss\tarchetype" -> rows
    for (const r of rows) {
        if (r.archetype == null) continue; // no primary carry — not archetype-comparable, skip
        const key = `${r.boss}\t${r.archetype}`;
        (groups.get(key) ?? groups.set(key, []).get(key)).push(r);
    }

    const inversions = [];
    let groupsChecked = 0, teamsChecked = 0;

    for (const [key, group] of groups) {
        groupsChecked++;
        teamsChecked += group.length;
        // Stable sort with an explicit index tiebreak, applied identically on both orderings —
        // this is what makes tie-handling correct: two teams tied on raw are necessarily tied on
        // calibrated (same archetype => same factor), so the shared tiebreak keeps them in the
        // same relative order in both sequences, and any REAL divergence is a genuine bug.
        const indexed = group.map((r, i) => ({ ...r, i }));
        const byRaw = [...indexed].sort((a, b) => b.raw - a.raw || a.i - b.i);
        const byCal = [...indexed].sort((a, b) => b.calibrated - a.calibrated || a.i - b.i);

        for (let pos = 0; pos < byRaw.length; pos++) {
            if (byRaw[pos].team !== byCal[pos].team) {
                const [boss, archetype] = key.split('\t');
                inversions.push({
                    boss, archetype, position: pos,
                    rawOrderTeam: byRaw[pos].team, rawOrderTeamScore: byRaw[pos].raw,
                    calOrderTeam: byCal[pos].team, calOrderTeamScore: byCal[pos].calibrated,
                });
                break; // one inversion per group is enough to fail it and to diagnose it
            }
        }
    }

    return { inversions, groupsChecked, teamsChecked };
}

// --- 2. WHAT MOVED (cross-archetype top-10 mix) --------------------------------------------

function mixByBoss(rows, archetypes) {
    const byBoss = new Map();
    for (const r of rows) (byBoss.get(r.boss) ?? byBoss.set(r.boss, []).get(r.boss)).push(r);

    const out = [];
    for (const [boss, group] of byBoss) {
        const rawTop = [...group].sort((a, b) => b.raw - a.raw).slice(0, 10);
        const calTop = [...group].sort((a, b) => b.calibrated - a.calibrated).slice(0, 10);
        const mix = list => Object.fromEntries(archetypes.map(a => [a, list.filter(r => r.archetype === a).length]));
        const rawTeams = new Set(rawTop.map(r => r.team));
        const calTeams = new Set(calTop.map(r => r.team));
        out.push({
            boss,
            rawMix: mix(rawTop), calMix: mix(calTop),
            entered: calTop.filter(r => !rawTeams.has(r.team)).map(r => r.team),
            left: rawTop.filter(r => !calTeams.has(r.team)).map(r => r.team),
        });
    }
    return out.sort((a, b) => a.boss.localeCompare(b.boss));
}

// --- 3. ALIGNMENT (neutral-boss p85 + per-boss p85 table) ----------------------------------

function quantile(sortedAsc, p) {
    if (sortedAsc.length === 0) return null;
    return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * p))];
}

function alignmentReport(rows, archetypes) {
    const neutral = rows.filter(r => r.boss === 'neutral');
    const neutralP85 = {};
    for (const a of archetypes) {
        const v = neutral.filter(r => r.archetype === a).map(r => r.calibrated).sort((x, y) => x - y);
        neutralP85[a] = quantile(v, ALIGNMENT_QUANTILE);
    }

    const byBoss = new Map();
    for (const r of rows) (byBoss.get(r.boss) ?? byBoss.set(r.boss, []).get(r.boss)).push(r);
    const perBoss = [];
    for (const [boss, group] of byBoss) {
        const p = {};
        for (const a of archetypes) {
            const v = group.filter(r => r.archetype === a).map(r => r.calibrated).sort((x, y) => x - y);
            p[a] = quantile(v, ALIGNMENT_QUANTILE);
        }
        perBoss.push({ boss, ...p });
    }

    return { neutralP85, perBoss: perBoss.sort((a, b) => a.boss.localeCompare(b.boss)) };
}

// --- report -----------------------------------------------------------------------------

function fmt(v) { return v == null ? '-' : v.toFixed(1); }

async function main() {
    const { rows, calibration } = await buildCorpus();
    const archetypes = Object.keys(calibration.archetypes);

    const fingerprint = await computeEngineFingerprint();
    const stale = isStale(calibration, fingerprint);

    const cert = certify(rows);
    const doMix = SHOW_MIX || (!TOP_N && !SHOW_ALIGNMENT); // part of the default summary
    const doAlignment = SHOW_ALIGNMENT || (!TOP_N && !SHOW_MIX);
    const mix = doMix ? mixByBoss(rows, archetypes) : null;
    const alignment = doAlignment ? alignmentReport(rows, archetypes) : null;

    if (JSON_OUT) {
        console.log(JSON.stringify({
            stale, certification: cert,
            mix: mix?.map(m => ({ ...m })), alignment,
        }, null, 2));
        process.exit(cert.inversions.length > 0 ? 1 : 0);
    }

    console.log('='.repeat(72));
    console.log(`Archetype calibration check  ${PREVIEW ? '(preview corpus)' : '(released corpus)'}`);
    console.log('='.repeat(72));
    if (stale) {
        console.log(`\n!! CALIBRATION IS STALE — calibration.json does not match the current engine/data.`);
        console.log(`   Numbers below are still internally consistent (certification is unaffected —`);
        console.log(`   it only checks that raw and calibrated orderings agree), but the alignment and`);
        console.log(`   mix numbers reflect an old engine state. Regenerate: node generate-calibration.mjs`);
    }

    console.log(`\n--- CERTIFICATION ---`);
    if (cert.inversions.length === 0) {
        console.log(`CERTIFIED: 0 within-archetype rank inversions — ` +
            `${cert.groupsChecked} (boss × archetype) groups, ${cert.teamsChecked} teams.`);
    } else {
        console.log(`FAILED: ${cert.inversions.length} within-archetype rank inversion(s) found.`);
        for (const inv of cert.inversions.slice(0, 20)) {
            console.log(`  [${inv.boss} / ${inv.archetype}] at position ${inv.position}:`);
            console.log(`    raw order says:        ${inv.rawOrderTeam}  (raw-ordered score ${fmt(inv.rawOrderTeamScore)})`);
            console.log(`    calibrated order says: ${inv.calOrderTeam}  (calibrated score ${fmt(inv.calOrderTeamScore)})`);
        }
        if (cert.inversions.length > 20) console.log(`  ...and ${cert.inversions.length - 20} more`);
    }

    if (mix) {
        console.log(`\n--- TOP-10 ARCHETYPE MIX PER BOSS (raw -> calibrated) ---`);
        console.log(`boss            raw(${archetypes.join('/')})   cal(${archetypes.join('/')})   entered / left`);
        for (const m of mix) {
            const rawStr = archetypes.map(a => m.rawMix[a]).join('/');
            const calStr = archetypes.map(a => m.calMix[a]).join('/');
            const churn = m.entered.length ? `+${m.entered.length}/-${m.left.length}` : '-';
            console.log(`${m.boss.padEnd(16)}${rawStr.padEnd(10)}${calStr.padEnd(10)}${churn}`);
        }
    }

    if (TOP_N > 0) {
        const byBoss = new Map();
        for (const r of rows) (byBoss.get(r.boss) ?? byBoss.set(r.boss, []).get(r.boss)).push(r);
        for (const [boss, group] of [...byBoss].sort((a, b) => a[0].localeCompare(b[0]))) {
            console.log(`\n--- TOP ${TOP_N} on ${boss} (calibrated) ---`);
            for (const r of [...group].sort((a, b) => b.calibrated - a.calibrated).slice(0, TOP_N)) {
                console.log(`  ${fmt(r.calibrated).padStart(7)}  (raw ${fmt(r.raw).padStart(7)})  ${r.archetype.padEnd(8)}  ${r.team}`);
            }
        }
    }

    if (alignment) {
        console.log(`\n--- ALIGNMENT: calibrated p${ALIGNMENT_QUANTILE * 100} on the NEUTRAL boss ---`);
        console.log(`(no boss shill confounding here — this is what "aligned" should look like)`);
        for (const a of archetypes) console.log(`  ${a.padEnd(8)} ${fmt(alignment.neutralP85[a])}`);

        console.log(`\n--- MATCHUP SIGNAL: calibrated p${ALIGNMENT_QUANTILE * 100} per boss ---`);
        console.log(`(divergence from the neutral-boss row above should track that boss's shill/favored,`);
        console.log(` not be uniform across bosses — uniform divergence would mean calibration is fighting L3)`);
        console.log(`boss            ${archetypes.map(a => a.padEnd(8)).join('')}`);
        for (const p of alignment.perBoss) {
            console.log(`${p.boss.padEnd(16)}${archetypes.map(a => fmt(p[a]).padStart(7) + ' ').join('')}`);
        }
    }

    console.log('\n' + '='.repeat(72));
    console.log(cert.inversions.length === 0
        ? 'RESULT: certification PASSED.'
        : 'RESULT: certification FAILED — do not proceed to wiring consumers until this is 0.');

    process.exit(cert.inversions.length > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
