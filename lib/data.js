/**
 * Data loading utilities for ZZZ CLI scripts.
 * Centralizes paths and JSON parsing for units, bosses, and roster.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DATA_DIR = join(ROOT_DIR, 'app', 'public', 'data');

export async function loadUnits() {
    return JSON.parse(await readFile(join(DATA_DIR, 'units.json'), 'utf-8'));
}

export async function loadBosses() {
    return JSON.parse(await readFile(join(DATA_DIR, 'bosses.json'), 'utf-8'));
}

export async function loadRoster() {
    return JSON.parse(await readFile(join(ROOT_DIR, 'roster.json'), 'utf-8'));
}

// `preview: true` loads calibration.preview.json — the anchor set fit against the --preview
// corpus (currently the only place armorer/Claret exists). Production pages must never pass
// this; it is for the diagnostic CLIs only.
//
// `required: false` (the default via loadAllData) swallows ENOENT and returns null instead of
// throwing. This is deliberate, not sloppy: calibration.json is DERIVED from units.json/
// bosses.json/team-scorer.js by generate-calibration.mjs, which itself calls loadAllData() to
// read those inputs — if loadAllData() hard-required calibration.json, the very first
// generation run could never bootstrap. It also means every script that predates calibration
// (score-dump.mjs, rankings.js, the test suites, ...) keeps working unchanged whether or not the
// file has been generated yet; only a consumer that actually reads `.calibration` needs to
// handle null, and per the plan that is a deliberate hard error at the point of use — see
// `lib/calibration.js`'s `calibrate()` — not a silent fallback here.
export async function loadCalibration({ preview = false, required = true } = {}) {
    const file = preview ? 'calibration.preview.json' : 'calibration.json';
    try {
        return JSON.parse(await readFile(join(DATA_DIR, file), 'utf-8'));
    } catch (e) {
        if (e.code === 'ENOENT' && !required) return null;
        throw e;
    }
}

export async function loadAllData() {
    const [units, bosses, roster, calibration] = await Promise.all([
        loadUnits(),
        loadBosses(),
        loadRoster(),
        loadCalibration({ required: false })
    ]);
    return { units, bosses, roster, calibration };
}
