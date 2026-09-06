#!/usr/bin/env node
/**
 * Generate app/public/data/calibration.json (or calibration.preview.json under -p) — the
 * per-archetype scalars that let Deadly Assault allocation, cross-archetype ladders, and
 * strength labels compare an anomaly team's score against an attack or rupture team's on equal
 * terms. See documentation/engine/calibration.md for the full derivation; this file
 * is only the mechanical regeneration.
 *
 * METHOD (linear, one factor per archetype):
 *   calibrated = raw * factor[archetype]
 *   factor[a]  = TARGET / anchor[a]
 *   anchor[a]  = mean of archetype a's top K viable scores, GLOBAL across every boss, EXCLUDING
 *                any team that contains one of that boss's `favored` units.
 *
 * The favored-exclusion is load-bearing, not a nicety: without it, anomaly's anchor is measured
 * almost entirely on the bosses that already favour anomaly (8 of 17 declare `shill: anomaly`),
 * which turns the boss's own favouritism into a calibration PENALTY on exactly the bosses where
 * anomaly should win. Measured and rejected: restricting only to `shillIntensity > 3` bosses
 * (183 rows) is not enough; excluding every `favored` team (1,463 rows) is what closes the gap.
 *
 * ALSO MEASURED AND REJECTED: computing the anchor on pre-L4-cap scores. The cap distorts each
 * archetype's top-10 anchor by 3.83% (anomaly) / 1.33% (attack) / 5.02% (rupture) — enough to
 * matter against a ~2.3% cross-archetype margin — but removing that distortion makes anomaly's
 * anchor grow MORE than attack's or rupture's (anomaly's own top teams sit deepest in cap
 * territory), which shrinks anomaly's factor and flips the very cases the exclusion rule fixed
 * (Fiend's #1, sweeper's mix). The cap stays untouched, and anchors are computed on the engine's
 * actual (post-cap) output.
 *
 * Usage:
 *   node generate-calibration.mjs                    # writes app/public/data/calibration.json
 *   node generate-calibration.mjs --preview   (-p)    # writes calibration.preview.json instead,
 *                                                      #   corpus includes preview units (Claret)
 *   node generate-calibration.mjs --check             # exit 1 if the committed file is stale
 *                                                      #   against the current engine/data
 *   node generate-calibration.mjs --check --preview   # same, for calibration.preview.json
 */

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadAllData } from './lib/data.js';
import { buildTeams } from './lib/team-pipeline.js';
import { scoreTeamForBoss, resolveBossVariation } from './app/public/lib/common/team-scorer.js';
import { computeEngineFingerprint, isStale } from './lib/calibration.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'app', 'public', 'data');

const INCLUDE_PREVIEW = process.argv.includes('--preview') || process.argv.includes('-p');
const CHECK_ONLY = process.argv.includes('--check');
const OUT_PATH = join(DATA_DIR, INCLUDE_PREVIEW ? 'calibration.preview.json' : 'calibration.json');

// K in the top-K mean. See the plan doc for why top-K over the bare max: it is within 0.3% of
// the max-anchored ratios but does not let one outlier team drag an entire archetype's scale
// after every regeneration.
const K = 10;

// The scale every archetype's anchor is mapped onto. One field, so widening it later (e.g. if
// rank-band granularity needs breathing room) is a one-line change.
const TARGET = 400;

// An archetype's anchor is only as trustworthy as the sample it is drawn from. Below this many
// non-excluded viable teams, the top-10 mean is close to meaningless statistically — flag it
// rather than presenting it with the same authority as anomaly's 18,000+ samples. Armorer sits
// here until Claret ships and the released corpus grows real armorer teams.
const LOW_CONFIDENCE_N = 200;

const NEUTRAL_BOSS = {
    id: 'neutral',
    name: 'Synthetic Neutral Boss',
    favored: [],
    mechanics: { weaknesses: [], resistances: [], shill: null, anti: [], assists: 0 },
};

async function computeAnchors() {
    const { units: allUnits, bosses } = await loadAllData();
    const availableUnits = INCLUDE_PREVIEW ? [...allUnits] : allUnits.filter(u => u.available !== false);
    const { threeCharTeams, teamLabels } = buildTeams(availableUnits, ['Nicole']);

    const corpus = [];
    for (const boss of bosses) {
        corpus.push(boss);
        for (const [id, v] of Object.entries(boss.variations ?? {})) {
            if (v.enabled === true) corpus.push(resolveBossVariation(boss, id));
        }
    }
    corpus.push(NEUTRAL_BOSS);

    // scores[archetype] = every viable score for that archetype, GLOBAL across all bosses.
    // excludedScores[archetype] = the subset dropped because the team contained a boss `favored`
    // unit — kept separate so the anchor pool (scores minus excludedScores) and the reported
    // `n`/`excluded` counts stay consistent with each other.
    const scores = {};
    const excludedCount = {};

    let totalPairs = 0, viablePairs = 0;
    for (const boss of corpus) {
        const favored = boss.favored ?? boss.mechanics?.favored ?? [];
        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            totalPairs++;
            const trace = {};
            const score = scoreTeamForBoss(team, boss, { trace });
            if (score <= 0 || trace.disqualified) continue;
            viablePairs++;

            const archetype = trace.carryArchetype;
            if (archetype == null) continue; // no primary carry — does not occur, measured; guard only

            (scores[archetype] ??= []).push(score);

            const isFavored = favored.length > 0 && team.some(u => favored.includes(u.name));
            if (isFavored) {
                excludedCount[archetype] = (excludedCount[archetype] ?? 0) + 1;
            } else {
                (scores[`${archetype}:anchor-pool`] ??= []).push(score);
            }
        }
    }

    const archetypes = {};
    for (const archetype of Object.keys(scores).filter(k => !k.includes(':'))) {
        const n = scores[archetype].length;
        const anchorPool = scores[`${archetype}:anchor-pool`] ?? [];
        const excluded = excludedCount[archetype] ?? 0;
        if (anchorPool.length === 0) continue; // never labelled at all (armorer, released corpus)

        const topK = anchorPool.slice().sort((a, b) => b - a).slice(0, K);
        const anchor = topK.reduce((sum, s) => sum + s, 0) / topK.length;
        const factor = TARGET / anchor;

        archetypes[archetype] = {
            anchor: Math.round(anchor * 10) / 10,
            factor: Math.round(factor * 1e6) / 1e6, // 6dp — see "round the factor, not the result"
            n,
            excluded,
            ...(anchorPool.length < LOW_CONFIDENCE_N ? { lowConfidence: true } : {}),
        };
    }

    return {
        archetypes,
        corpus: { teams: teamLabels.length, bosses: corpus.length, totalPairs, viablePairs },
    };
}

async function main() {
    if (CHECK_ONLY) {
        let existing;
        try {
            existing = JSON.parse(await readFile(OUT_PATH, 'utf-8'));
        } catch (e) {
            console.error(`--check: cannot read ${OUT_PATH}: ${e.message}`);
            process.exit(1);
        }
        const fingerprint = await computeEngineFingerprint();
        if (isStale(existing, fingerprint)) {
            console.error(`STALE: ${OUT_PATH} was generated against a different engine/data state.`);
            console.error(`  committed fingerprint: ${existing.engineFingerprint}`);
            console.error(`  current fingerprint:   ${fingerprint}`);
            console.error(`  regenerate with: node generate-calibration.mjs${INCLUDE_PREVIEW ? ' --preview' : ''}`);
            process.exit(1);
        }
        console.log(`OK: ${OUT_PATH} matches the current engine/data fingerprint.`);
        return;
    }

    const { archetypes, corpus } = await computeAnchors();
    const fingerprint = await computeEngineFingerprint();

    const out = {
        generated: new Date().toISOString(),
        method: 'linear',
        target: TARGET,
        k: K,
        anchorRule: 'top-K mean, global across all bosses, excluding teams containing a boss favored unit',
        engineFingerprint: fingerprint,
        corpus,
        archetypes,
    };

    await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
    console.log(`Wrote ${OUT_PATH}`);
    for (const [a, e] of Object.entries(archetypes)) {
        console.log(`  ${a.padEnd(8)} anchor=${e.anchor.toFixed(1).padStart(7)}  factor=${e.factor.toFixed(6)}  ` +
            `n=${e.n}  excluded=${e.excluded}${e.lowConfidence ? '  [LOW CONFIDENCE]' : ''}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
