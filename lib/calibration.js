/**
 * Archetype calibration — the shared transform, loaded by every consumer that compares team
 * scores ACROSS archetypes (Deadly Assault allocation, cross-archetype ladders, strength
 * labels). Consumers that only ever compare within one archetype (rankings.js, compositions.js)
 * must NOT import this — see documentation/engine/reading-scores.md for why raw is correct
 * there.
 *
 * The engine (`team-scorer.js`) never sees this file and never calibrates its own output.
 * Calibration is strictly a boundary transform: `calibrated = raw * factor[archetype]`, one
 * factor per archetype, fitted so each archetype's top teams land near the same target score.
 * See documentation/engine/calibration.md for how the factors are derived
 * (`generate-calibration.mjs`) and why a flat per-archetype scalar was chosen over a per-boss or
 * non-linear form.
 *
 * WHAT THIS FILE DOES NOT DO: it does not decide which teams are "favored" for anchor purposes,
 * does not run the corpus, and does not write calibration.json. That is generate-calibration.mjs.
 * This file only consumes the finished data.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// The three inputs that determine every anchor in calibration.json. If any of these changes,
// the anchors are stale — they were fit against a corpus that no longer exists. Deliberately
// NOT including bosses.json's non-mechanics fields (display-only data) or any CLI script, so an
// unrelated edit does not manufacture a false-stale reading.
const FINGERPRINT_INPUTS = [
    join(ROOT_DIR, 'app', 'public', 'lib', 'common', 'team-scorer.js'),
    join(ROOT_DIR, 'app', 'public', 'data', 'units.json'),
    join(ROOT_DIR, 'app', 'public', 'data', 'bosses.json'),
];

/**
 * Sha256 over the concatenated bytes of team-scorer.js + units.json + bosses.json. Anything
 * that can move a raw score — an engine change, a unit reweight, a boss mechanic edit — changes
 * this hash, which is exactly the set of changes that can invalidate a fitted anchor.
 */
export async function computeEngineFingerprint() {
    const hash = createHash('sha256');
    for (const path of FINGERPRINT_INPUTS) {
        hash.update(await readFile(path));
    }
    return hash.digest('hex');
}

/**
 * True when `calibration.engineFingerprint` no longer matches the current inputs — the
 * committed file was generated against a different engine/data state and its anchors cannot be
 * trusted. `currentFingerprint` is passed in rather than recomputed here so a caller that already
 * has it (e.g. `--check` scripts comparing several things) does not pay for it twice.
 */
export function isStale(calibration, currentFingerprint) {
    return calibration.engineFingerprint !== currentFingerprint;
}

/**
 * True when the committed file was generated with a different archetype pooling map than the one
 * now in force. Kept SEPARATE from `isStale` on purpose: `isStale` means one specific thing (the
 * engine/data fingerprint moved) and is consumed by `calibration-check.mjs` as well, so widening it
 * would change what that report claims. This is a second, independent staleness axis.
 *
 * It exists because `FINGERPRINT_INPUTS` deliberately excludes every CLI script, so the pooling map
 * -- which lives in `generate-calibration.mjs` -- is invisible to the fingerprint. Without this a
 * pooling edit followed by a forgotten regeneration would pass `--check` silently, which is the
 * exact failure the fingerprint exists to prevent.
 *
 * A file generated before pooling existed has no `pools` key; it is read as `{}`, so it compares
 * equal to an empty map and only trips once a pool is actually declared.
 */
export function poolsDiffer(calibration, currentPools) {
    const committed = calibration.pools ?? {};
    const current = currentPools ?? {};
    const keys = new Set([...Object.keys(committed), ...Object.keys(current)]);
    for (const k of keys) {
        if (committed[k] !== current[k]) return true;
    }
    return false;
}

/**
 * `{ archetype: factor }` for every archetype in the file. Thin, but gives every consumer one
 * place to read factors from rather than reaching into `calibration.archetypes[a].factor`
 * directly, so a schema change (e.g. the eventual non-linear form) has one call site to update
 * per consumer instead of many.
 */
export function calibrationFactors(calibration) {
    const out = {};
    for (const [archetype, entry] of Object.entries(calibration.archetypes)) {
        out[archetype] = entry.factor;
    }
    return out;
}

// Warn at most once per missing/unlabelled-archetype case per process, so a hot loop over a
// large corpus does not flood stdout with the same warning tens of thousands of times.
const warnedOnce = new Set();
function warnOnce(key, message) {
    if (warnedOnce.has(key)) return;
    warnedOnce.add(key);
    console.warn(message);
}

/**
 * Apply the calibration transform: `raw * factor[archetype]`.
 *
 * `archetype` is expected to be `trace.carryArchetype` from `scoreTeamForBoss` (or the return of
 * the exported `getTeamArchetype`) — one of `'anomaly' | 'attack' | 'rupture' | 'armorer' | null`.
 *
 * - `archetype == null` (no primary carry — does not occur in the released corpus, measured)
 *   returns `raw` unchanged and warns once. This is a guard for an edge case, not a real path.
 * - An archetype that exists in the game but is absent from `calibration.archetypes` is a
 *   **hard error**. A newly shipped archetype, before its first regeneration, must fail loudly
 *   rather than silently receive a factor of 1.0, which would let an uncalibrated archetype slip
 *   into a cross-archetype ranking unnoticed. Note that an archetype listed in `pools` is always
 *   emitted, even with no teams of its own, precisely so this branch cannot fire for one.
 *
 * Never clamps to `calibration.target` — the top teams of an archetype are meant to land
 * slightly above it. See "Never clamp at T" in the plan.
 */
export function calibrate(raw, archetype, calibration) {
    if (archetype == null) {
        warnOnce('null-archetype', 'calibrate(): team has no primary carry (archetype=null) — ' +
            'returning raw score uncalibrated. This should not occur in the released corpus.');
        return raw;
    }
    const entry = calibration.archetypes[archetype];
    if (!entry) {
        throw new Error(
            `calibrate(): archetype "${archetype}" has no entry in calibration.archetypes. ` +
            `Known archetypes: ${Object.keys(calibration.archetypes).join(', ')}. ` +
            `Regenerate calibration.json (node generate-calibration.mjs) before scoring this archetype.`
        );
    }
    return raw * entry.factor;
}
