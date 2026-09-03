/**
 * Archetype calibration — the pure transform, browser side.
 *
 * This is a deliberate DUPLICATE of the transform in the repo-root `lib/calibration.js`, not a
 * shared import. That file pulls in `node:crypto`/`node:fs` for engine fingerprinting, and this
 * codebase serves its ES modules straight to the browser with no bundler (see the header comment
 * on team-scorer.js) — a `node:`-prefixed import here would 404 and break every page that
 * imports this module, however indirectly. Regeneration and staleness-checking are CLI-only
 * concerns (generate-calibration.mjs, calibration-check.mjs); the browser only ever consumes a
 * finished calibration.json, fetched by roster-ui.js's `initRoster` alongside units.json.
 *
 * If `calibrate()` or `calibrationFactors()` change here, update the Node copy too (and vice
 * versa) — there is no automated check that the two stay in sync.
 */

const warnedOnce = new Set();
function warnOnce(key, message) {
    if (warnedOnce.has(key)) return;
    warnedOnce.add(key);
    console.warn(message);
}

/**
 * Apply the calibration transform: `raw * factor[archetype]`.
 *
 * `archetype` is expected to be `trace.carryArchetype` from `scoreTeamForBoss` — one of
 * `'anomaly' | 'attack' | 'rupture' | 'armorer' | null`.
 *
 * - `archetype == null` (no primary carry) returns `raw` unchanged and warns once.
 * - An archetype that exists in the game but is absent from `calibration.archetypes` is a
 *   **hard error** — never a silent factor of 1.0, which would let an uncalibrated archetype
 *   slip into a cross-archetype ranking unnoticed.
 *
 * Never clamps to `calibration.target` — an archetype's top teams are meant to land slightly
 * above it.
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
            `Regenerate calibration.json before scoring this archetype.`
        );
    }
    return raw * entry.factor;
}

/** `{ archetype: factor }` for every archetype in the file. */
export function calibrationFactors(calibration) {
    const out = {};
    for (const [archetype, entry] of Object.entries(calibration.archetypes)) {
        out[archetype] = entry.factor;
    }
    return out;
}
