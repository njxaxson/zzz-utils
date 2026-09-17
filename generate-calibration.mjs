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
 * HISTORICAL, now moot: there used to be an argument here about whether to compute the anchor on
 * pre-L4-cap scores. The cap distorted each archetype's top-10 anchor by 3.83% (anomaly) / 1.33%
 * (attack) / 5.02% (rupture), and undoing that distortion was measured and rejected because it
 * shrank anomaly's factor and flipped the very cases the favored-exclusion rule fixed. The cap
 * was removed outright in 2026-09-15, so anchors are now computed on uncompressed output and the
 * question no longer arises. Kept because the SHAPE of that argument still applies to any future
 * non-linear term: a distortion you can measure is not automatically one you should remove, and
 * the sign of the correction is not knowable from its size.
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
import { computeEngineFingerprint, isStale, poolsDiffer } from './lib/calibration.js';
import { DPS_ROLES } from './app/public/lib/common/constants.js';

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
// non-excluded viable teams, the top-K mean is close to meaningless statistically — flag it rather
// than presenting it with the same authority as anomaly's 15,000+ samples. This branch has never
// fired in either committed file, and it is NOT the guard that caught armorer: it measures whether
// a sample is NOISY. `distinctCarries` measures whether it is DEGENERATE. Armorer had 2,090
// anchor-pool teams drawn from exactly one carry, so it sailed past this check while being the
// least trustworthy anchor in the file. Both are kept; neither subsumes the other.
const LOW_CONFIDENCE_N = 200;

// Archetypes that do not get their own anchor, and whose scores are folded into a host's anchor
// pool instead. An anchor is a top-K mean, so it measures an archetype's CEILING; with a dozen-odd
// carries that ceiling is set by the best of them and the rest sit below it, which is the whole
// point. With ONE carry the ceiling IS that carry, so the unit is pinned to TARGET by construction
// and can never score below it however good the competition is. Armorer (Claret) is that case.
// This map is a HUMAN decision and is deliberately not auto-driven off `distinctCarries` — the
// warnings below nag when it looks wrong, but flipping it is a ruling, not a threshold. [CAL-02]
const ARCHETYPE_POOLS = { armorer: 'attack' };

// Below this many distinct carries, an archetype that anchors itself is suspect; at or above it, a
// pooled archetype probably no longer needs to be. Both directions print a warning and neither
// changes behaviour. 3 is the smallest count at which a top-K mean can be set by more than a single
// unit plus a tie — rupture sits at 5 today and is the weakest self-anchoring archetype. [CAL-03]
const MIN_SELF_ANCHOR_CARRIES = 3;

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
    // The synthetic neutral boss is a DIAGNOSTIC reference, not a matchup, and is deliberately
    // absent from this corpus: fitting on a boss that does not exist inflates every reported `n`
    // by ~10%, and LOW_CONFIDENCE_N is checked against those counts. It changes no anchor today
    // -- a weakness-less boss scores too low to reach any top-K -- but it would the moment an
    // archetype had fewer than K real-boss teams. calibration-check.mjs, matchups.js and
    // team-builder-page.js each keep their own copy for their own purposes. [CAL-01]

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
                // Entries carry their team label so the stdout summary can name the teams that set
                // each anchor. Ten labels all naming one unit is the degenerate case ARCHETYPE_POOLS
                // exists for, and it communicates that far more directly than any count.
                (scores[`${archetype}:anchor-pool`] ??= []).push({ score, label, owner: archetype });
            }
        }
    }

    const hostOf = a => ARCHETYPE_POOLS[a] ?? a;
    const ownArchetypes = Object.keys(scores).filter(k => !k.includes(':'));

    // Distinct CARRIES, counted off the roster rather than the corpus: `getPrimaryCarry` is not
    // exported and the trace carries no carry name, so a corpus-exact count would cost an edit to
    // team-scorer.js — a FINGERPRINT_INPUTS member — and a regeneration, for an advisory number.
    // This is a strict upper bound on observed primary carries (exact in practice, since the corpus
    // enumerates every legal team) and it ignores the monoshock relabel. [ARCH-03]
    const distinctCarries = {};
    for (const role of DPS_ROLES) {
        distinctCarries[role] = availableUnits.filter(u => u.tags.includes(role)).length;
    }

    // Fold each archetype's anchor pool into its host's. A pooled archetype still contributes its
    // scores: if one ever climbs into the host's top-K the host's anchor moves, which is correct and
    // is exactly what `anchorFromPooled` is emitted to make visible.
    const hostPools = {};
    for (const a of ownArchetypes) {
        const pool = scores[`${a}:anchor-pool`] ?? [];
        (hostPools[hostOf(a)] ??= []).push(...pool);
    }

    const fit = {};
    for (const [host, pool] of Object.entries(hostPools)) {
        if (pool.length === 0) continue;
        const topK = pool.slice().sort((x, y) => y.score - x.score).slice(0, K);
        const anchor = topK.reduce((sum, e) => sum + e.score, 0) / topK.length;
        fit[host] = { anchor, topK, poolSize: pool.length };
    }

    // Emit every archetype the corpus produced, PLUS every pooled archetype in the map whose host
    // has an anchor — even one with no teams of its own. A pooled archetype's factor does not depend
    // on its own pool, and omitting it would make calibrate() hard-throw on the first such team.
    const archetypes = {};
    const emitOrder = [...ownArchetypes];
    for (const a of Object.keys(ARCHETYPE_POOLS)) {
        if (!emitOrder.includes(a) && fit[hostOf(a)]) emitOrder.push(a);
    }

    for (const archetype of emitOrder) {
        const host = hostOf(archetype);
        if (!fit[host]) continue;
        const { anchor } = fit[host];
        const factor = TARGET / anchor;
        const ownPool = scores[`${archetype}:anchor-pool`] ?? [];
        const pooledInto = host === archetype ? null : host;

        let selfAnchor;
        if (pooledInto && ownPool.length > 0) {
            const ownTopK = ownPool.slice().sort((x, y) => y.score - x.score).slice(0, K);
            selfAnchor = ownTopK.reduce((sum, e) => sum + e.score, 0) / ownTopK.length;
        }

        const pooledFrom = Object.keys(ARCHETYPE_POOLS).filter(a => ARCHETYPE_POOLS[a] === archetype);

        archetypes[archetype] = {
            // The anchor this archetype is calibrated AGAINST, so `factor === TARGET / anchor` holds
            // for every row including pooled ones. A pooled archetype's own top-K mean is reported
            // separately as `selfAnchor` and is diagnostic only.
            anchor: Math.round(anchor * 10) / 10,
            factor: Math.round(factor * 1e6) / 1e6, // 6dp — see "round the factor, not the result"
            n: scores[archetype]?.length ?? 0,
            excluded: excludedCount[archetype] ?? 0,
            anchorPoolN: ownPool.length,
            distinctCarries: distinctCarries[archetype] ?? 0,
            ...(pooledInto ? { pooledInto } : {}),
            ...(selfAnchor !== undefined ? { selfAnchor: Math.round(selfAnchor * 10) / 10 } : {}),
            ...(pooledFrom.length > 0 ? {
                pooledFrom,
                // How many of this host's top-K came from a pooled archetype. Zero today, and while
                // it stays zero the pooling provably cannot move the host's scale. The moment it is
                // non-zero, a pooled archetype is setting the host's anchor.
                anchorFromPooled: fit[host].topK.filter(e => e.owner !== host).length,
            } : {}),
            ...(ownPool.length > 0 && ownPool.length < LOW_CONFIDENCE_N ? { lowConfidence: true } : {}),
        };
    }

    return {
        archetypes,
        corpus: { teams: teamLabels.length, bosses: corpus.length, totalPairs, viablePairs },
        anchorTeams: Object.fromEntries(
            Object.entries(fit).map(([h, f]) => [h, f.topK.map(e => `${e.label} (${e.score.toFixed(1)}${e.owner !== h ? `, ${e.owner}` : ''})`)])),
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
        // The pooling map lives in THIS file, which FINGERPRINT_INPUTS deliberately excludes so that
        // an unrelated CLI edit cannot manufacture a false stale reading. That exclusion means the
        // fingerprint cannot see a pooling change at all: edit ARCHETYPE_POOLS, forget to
        // regenerate, and --check would report OK on a file whose factors no longer match the map.
        // Checked separately for exactly that reason. [CAL-02]
        if (poolsDiffer(existing, ARCHETYPE_POOLS)) {
            console.error(`STALE: ${OUT_PATH} was generated with a different archetype pooling map.`);
            console.error(`  committed pools: ${JSON.stringify(existing.pools ?? {})}`);
            console.error(`  current pools:   ${JSON.stringify(ARCHETYPE_POOLS)}`);
            console.error(`  regenerate with: node generate-calibration.mjs${INCLUDE_PREVIEW ? ' --preview' : ''}`);
            process.exit(1);
        }
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

    const { archetypes, corpus, anchorTeams } = await computeAnchors();
    const fingerprint = await computeEngineFingerprint();

    const out = {
        generated: new Date().toISOString(),
        method: 'linear',
        target: TARGET,
        k: K,
        anchorRule: "top-K mean, global across all real bosses (the synthetic neutral boss is a "
            + "diagnostic reference and is excluded), excluding teams containing a boss favored unit; "
            + "archetypes listed in `pools` do not anchor themselves - their scores join the host pool "
            + "and they take the host factor",
        pools: ARCHETYPE_POOLS,
        engineFingerprint: fingerprint,
        corpus,
        archetypes,
    };

    await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
    console.log(`Wrote ${OUT_PATH}`);
    for (const [a, e] of Object.entries(archetypes)) {
        console.log(`  ${a.padEnd(8)} anchor=${e.anchor.toFixed(1).padStart(7)}  factor=${e.factor.toFixed(6)}  ` +
            `n=${e.n}  excluded=${e.excluded}  carries=${e.distinctCarries}` +
            `${e.pooledInto ? `  [POOLED INTO ${e.pooledInto}, self-anchor ${e.selfAnchor ?? 'n/a'}]` : ''}` +
            `${e.lowConfidence ? '  [LOW CONFIDENCE]' : ''}`);
    }

    // The teams that actually set each anchor. Printed, not committed: it is a diagnostic for the
    // person running the regeneration, and it would churn the artifact on every roster change.
    console.log('');
    console.log('Anchor teams (top-K, in order):');
    for (const [host, teams] of Object.entries(anchorTeams)) {
        console.log(`  ${host}:`);
        for (const t of teams) console.log(`      ${t}`);
    }

    const warnings = [];
    for (const [a, e] of Object.entries(archetypes)) {
        if (!e.pooledInto && e.distinctCarries < MIN_SELF_ANCHOR_CARRIES) {
            warnings.push(`${a} anchors itself on only ${e.distinctCarries} distinct carrier(s) - ` +
                `its anchor is that unit's own ceiling. Consider adding it to ARCHETYPE_POOLS.`);
        }
        if (e.pooledInto && e.distinctCarries >= MIN_SELF_ANCHOR_CARRIES) {
            warnings.push(`${a} is pooled into ${e.pooledInto} but now has ${e.distinctCarries} distinct ` +
                `carriers - it may be able to anchor itself. Consider removing it from ARCHETYPE_POOLS.`);
        }
        if (e.anchorFromPooled > 0) {
            warnings.push(`${a} top-${K} now draws ${e.anchorFromPooled} team(s) from a pooled archetype ` +
                `(${e.pooledFrom.join(', ')}) - pooling is no longer scale-neutral for ${a}.`);
        }
    }
    if (warnings.length > 0) {
        console.log('');
        console.log('!! REVIEW:');
        for (const w of warnings) console.log(`   - ${w}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
