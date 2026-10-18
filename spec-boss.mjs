#!/usr/bin/env node
/**
 * Preview harness — not part of the verification loop, not covered by any test suite.
 *
 * Drop a speculative boss's JSON on disk and see the full team ranking against it, using the
 * real engine + the CURRENT calibration.json factors (not regenerated, so numbers are
 * approximate if the boss would shift an archetype's own anchor). The sibling of spec-unit.mjs.
 *
 * Usage:
 *   node spec-boss.mjs new-boss.json [-N] [--variation <id>] [--preview|-p]
 *
 * -N is the depth shorthand used elsewhere in this repo — how many rows of the full ranking to
 * print. Defaults to 15. --variation resolves one of the boss's own "variations" onto the base.
 * --preview / -p includes unreleased (`available: false`) units in the roster and uses
 * calibration.preview.json, matching the repo-wide convention.
 *
 * The boss JSON is a single boss object (see documentation/data-model/boss-object.md). If its
 * "id" (or, failing that, "name") matches an existing boss, it REPLACES that boss for this run
 * only (handy for tweaking an existing fight); otherwise it is simply scored on its own.
 * `available: false` is ignored — previewing unreleased bosses is the point. The roster is the
 * released units unless --preview is given.
 */

import { readFile } from 'node:fs/promises';
import { loadUnits, loadBosses, loadCalibration } from './lib/data.js';
import { buildTeams } from './lib/team-pipeline.js';
import { scoreTeamForBoss, resolveBossVariation } from './app/public/lib/common/team-scorer.js';
import { calibrate } from './lib/calibration.js';

const rawArgs = process.argv.slice(2);
let depth = 15;
let variationId = null;
let preview = false;
const positional = [];
for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    const m = /^-(\d+)$/.exec(arg);
    if (m) depth = parseInt(m[1], 10);
    else if (arg === '--preview' || arg === '-p') preview = true;
    else if (arg === '--variation') variationId = rawArgs[++i];
    else positional.push(arg);
}
const [bossPath] = positional;

if (!bossPath) {
    console.error('Usage: node spec-boss.mjs <boss.json> [-N] [--variation <id>] [--preview|-p]');
    process.exit(1);
}

async function main() {
    const specBoss = JSON.parse(await readFile(bossPath, 'utf-8'));

    const [allUnits, allBosses, calibration] = await Promise.all([
        loadUnits(), loadBosses(), loadCalibration({ preview, required: false })
    ]);

    if (!calibration) {
        console.error(`No ${preview ? 'calibration.preview.json' : 'calibration.json'} found — ` +
            `run: node generate-calibration.mjs${preview ? ' --preview' : ''}`);
        process.exit(1);
    }

    const existing = allBosses.find(b =>
        (specBoss.id && b.id === specBoss.id) || (!specBoss.id && b.name === specBoss.name));
    console.log(existing
        ? `Replacing existing boss "${existing.name}" with the speculative version.\n`
        : `Scoring new speculative boss "${specBoss.name}".\n`);

    let boss = specBoss;
    if (variationId) {
        boss = resolveBossVariation(specBoss, variationId);
        console.log(`Variation: ${variationId}\n`);
    }

    const availableUnits = preview ? [...allUnits] : allUnits.filter(u => u.available !== false);
    const { threeCharTeams, teamLabels } = buildTeams(availableUnits, ['Nicole']);

    const rows = [];
    for (const label of teamLabels) {
        const trace = {};
        const raw = scoreTeamForBoss(threeCharTeams[label], boss, { trace });
        if (raw <= 0 || trace.disqualified) continue;
        const archetype = trace.carryArchetype;
        rows.push({ label, score: calibrate(raw, archetype, calibration), raw, archetype });
    }
    rows.sort((a, b) => b.score - a.score);

    console.log(`=== ${boss.name} ===`);
    console.log(`${rows.length} viable teams (of ${teamLabels.length} legal).`);
    if (rows.length === 0) {
        console.log('  (no viable teams)');
        return;
    }
    rows.slice(0, depth).forEach((r, i) => {
        console.log(`  #${String(i + 1).padStart(2, ' ')} ${r.label} (${r.score.toFixed(1)}, raw ${r.raw.toFixed(1)}, ${r.archetype})`);
    });
}

main().catch(e => { console.error(e); process.exit(1); });
