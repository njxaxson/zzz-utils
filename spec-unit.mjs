#!/usr/bin/env node
/**
 * TOY harness — not part of the verification loop, not covered by any test suite.
 *
 * Drop a speculative unit's JSON on disk, name some bosses, and see the full team ranking —
 * with rows containing the speculative unit marked — using the real engine + the CURRENT
 * calibration.json factors
 * (not regenerated — the speculative unit borrows its archetype's existing anchor, so numbers
 * are approximate whenever the new unit would shift that archetype's own anchor).
 *
 * Usage:
 *   node spec-unit.mjs phoenix.json "Boss A, Boss B" [-N]
 *
 * -N is the depth shorthand used elsewhere in this repo (e.g. matchups.js's "-10") — how many
 * rows of the full ranking to print per boss. Defaults to 15.
 *
 * The unit JSON is a single unit object (see documentation/data-model/unit-object.md). If its
 * "name" matches an existing unit, it REPLACES that unit for this run only (handy for tweaking
 * an existing kit); otherwise it's added to the roster.
 */

import { loadUnits, loadBosses, loadCalibration } from './lib/data.js';
import { buildTeams } from './lib/team-pipeline.js';
import { filterBosses } from './lib/boss-filter.js';
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';
import { calibrate } from './lib/calibration.js';

const rawArgs = process.argv.slice(2);
let depth = 15;
const positional = [];
for (const arg of rawArgs) {
    const m = /^-(\d+)$/.exec(arg);
    if (m) depth = parseInt(m[1], 10);
    else positional.push(arg);
}
const [unitPath, bossFilter] = positional;

if (!unitPath || !bossFilter) {
    console.error('Usage: node spec-unit.mjs <unit.json> "<boss filter, comma-separated>" [-N]');
    process.exit(1);
}

async function main() {
    const { readFile } = await import('node:fs/promises');
    const specUnit = JSON.parse(await readFile(unitPath, 'utf-8'));

    const [allUnits, allBosses, calibration] = await Promise.all([
        loadUnits(), loadBosses(), loadCalibration({ required: true })
    ]);

    const idx = allUnits.findIndex(u => u.name === specUnit.name);
    if (idx >= 0) {
        console.log(`Replacing existing unit "${specUnit.name}" with the speculative version.\n`);
        allUnits[idx] = specUnit;
    } else {
        console.log(`Adding new speculative unit "${specUnit.name}" to the roster.\n`);
        allUnits.push(specUnit);
    }

    const bosses = filterBosses(allBosses, bossFilter);
    if (bosses.length === 0) {
        console.error(`No bosses matched "${bossFilter}"`);
        process.exit(1);
    }

    // Keep the speculative unit regardless of its own `available` flag — the whole point of
    // this harness is to test units that aren't released yet.
    const availableUnits = allUnits.filter(u => u.available !== false || u.name === specUnit.name);
    const { threeCharTeams, teamLabels } = buildTeams(availableUnits, ['Nicole']);

    const hasSpec = label => threeCharTeams[label].some(u => u.name === specUnit.name);
    const specTeamCount = teamLabels.filter(hasSpec).length;
    console.log(`${specTeamCount} legal teams include ${specUnit.name} (of ${teamLabels.length} total).\n`);

    for (const boss of bosses) {
        const rows = [];
        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            const trace = {};
            const raw = scoreTeamForBoss(team, boss, { trace });
            if (raw <= 0 || trace.disqualified) continue;
            const archetype = trace.carryArchetype;
            const score = calibrate(raw, archetype, calibration);
            rows.push({ label, score, raw, archetype, spec: hasSpec(label) });
        }
        rows.sort((a, b) => b.score - a.score);

        console.log(`=== ${boss.name} ===`);
        if (rows.length === 0) {
            console.log('  (no viable teams)\n');
            continue;
        }
        rows.slice(0, depth).forEach((r, i) => {
            const marker = r.spec ? '*' : ' ';
            console.log(`  #${String(i + 1).padStart(2, ' ')}${marker} ${r.label} (${r.score.toFixed(1)}, raw ${r.raw.toFixed(1)}, ${r.archetype})`);
        });

        const bestSpecRank = rows.findIndex(r => r.spec);
        if (bestSpecRank >= depth) {
            const r = rows[bestSpecRank];
            console.log(`  ...`);
            console.log(`  #${String(bestSpecRank + 1).padStart(2, ' ')}* ${r.label} (${r.score.toFixed(1)}, raw ${r.raw.toFixed(1)}, ${r.archetype})  <- best ${specUnit.name} placement`);
        } else if (bestSpecRank === -1) {
            console.log(`  (no viable team with ${specUnit.name} against this boss)`);
        }
        console.log();
    }
}

main().catch(e => { console.error(e); process.exit(1); });
