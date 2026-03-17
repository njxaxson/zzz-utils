/**
 * Pull Recommendations Debug Script
 * 
 * Runs the pull recommendation engine from the command line for debugging.
 */

import { parseArgs } from './lib/cli.js';
import { loadUnits, loadRoster } from './lib/data.js';
import { applyShareUrl } from './lib/share-url.js';
import { buildUnitStates } from './lib/roster-builder.js';
import {
    analyze, tierToQuality, qualityLabel, getBestTier, getUnitElement,
    isSubdps, capitalize, DPS_ARCHETYPES, ELEMENTS
} from './app/public/lib/common/pull-engine.js';

const options = parseArgs({
    name: 'pull-debug.js',
    description: 'Runs the pull recommendation engine for roster analysis and debugging.',
    examples: [
        '  node pull-debug.js                   Full roster, top 5 recommendations',
        '  node pull-debug.js -10                Show top 10 recommendations',
        '  node pull-debug.js -d -10             Verbose debug + top 10',
        '  node pull-debug.js -m                 Personal roster (from roster.json)',
        '  node pull-debug.js -u "Miyabi,Astra,Nicole,Anby,Billy"   Specific units',
        '  node pull-debug.js -Miyabi            Remove Miyabi from roster',
        '  node pull-debug.js +Orphie            Add Orphie to roster',
        '  node pull-debug.js -m +Astra          Personal roster + add Astra',
        '  node pull-debug.js -q "?roster=eJwN..."  Roster from share URL'
    ].join('\n')
});

async function main() {
    const allUnits = await loadUnits();
    const roster = await loadRoster();

    applyShareUrl(options, allUnits);

    const { unitStates, ownedUnits } = buildUnitStates(allUnits, options, roster);

    // ========================================================================
    // RUN ANALYSIS
    // ========================================================================

    const results = analyze(allUnits, unitStates, ownedUnits, {
        maxRecommendations: options.depth
    });

    const { assessment, recommendations, coverage, allGaps, compositeScore, calibration } = results;
    const { dpsQuality, supportQuality, stunnerQuality, elementQuality,
            ownedDPS, ownedSubdps, ownedSupports, ownedStunners, ownedByElement } = coverage;

    // ========================================================================
    // PRINT ROSTER SUMMARY
    // ========================================================================

    console.log('===== Pull Recommendations Debug =====\n');

    const mode = options.query ? 'share URL' : options.units ? 'specific units' : options.onlyMine ? 'personal roster' : 'full roster';
    console.log(`Mode: ${mode}  |  Depth: ${options.depth}  |  Debug: ${options.debug}`);
    if (options.additions.length) console.log(`Added: ${options.additions.join(', ')}`);
    if (options.removals.length) console.log(`Removed: ${options.removals.join(', ')}`);

    const ownedLimited = ownedUnits.filter(u => u.rank === 'S' && u.limited);
    const ownedStandard = ownedUnits.filter(u => u.rank === 'S' && !u.limited);
    const ownedA = ownedUnits.filter(u => u.rank === 'A');
    console.log(`Owned: ${ownedUnits.length} total (${ownedLimited.length} limited S, ${ownedStandard.length} standard S, ${ownedA.length} A-rank)`);
    if (ownedLimited.length > 0) {
        console.log(`  Limited S: ${ownedLimited.map(u => u.name).join(', ')}`);
    }
    console.log();

    // ========================================================================
    // PRINT COVERAGE
    // ========================================================================

    console.log('=== Coverage Quality ===\n');
    for (const arch of DPS_ARCHETYPES) {
        const units = ownedDPS[arch];
        const best = getBestTier(units);
        const q = dpsQuality[arch];
        const bestUnit = best !== null ? units.find(u => u.tier === best) : null;
        console.log(`  ${capitalize(arch).padEnd(10)} ${String(q).padStart(3)} (${qualityLabel(q).padEnd(10)})  best: ${bestUnit ? `${bestUnit.name} T${bestUnit.tier}` : '—'}  [${units.map(u => `${u.name} T${u.tier}`).join(', ') || '—'}]`);
    }
    const supportBest = getBestTier(ownedSupports);
    console.log(`  ${'Support'.padEnd(10)} ${String(supportQuality).padStart(3)} (${qualityLabel(supportQuality).padEnd(10)})  best: ${supportBest !== null ? `T${supportBest}` : '—'}  [${ownedSupports.map(u => `${u.name} T${u.tier}`).join(', ') || '—'}]`);
    const stunnerBest = getBestTier(ownedStunners);
    console.log(`  ${'Stunner'.padEnd(10)} ${String(stunnerQuality).padStart(3)} (${qualityLabel(stunnerQuality).padEnd(10)})  best: ${stunnerBest !== null ? `T${stunnerBest}` : '—'}  [${ownedStunners.map(u => `${u.name} T${u.tier}`).join(', ') || '—'}]`);
    console.log();
    console.log('  Element DPS coverage:');
    for (const el of ELEMENTS) {
        const q = elementQuality[el];
        console.log(`    ${capitalize(el).padEnd(10)} ${String(q).padStart(3)} (${qualityLabel(q).padEnd(10)})  [${ownedByElement[el].map(u => `${u.name} T${u.tier}`).join(', ') || '—'}]`);
    }
    console.log();
    console.log('  Sub-DPS:');
    console.log(`    Anomaly subdps: [${ownedSubdps.anomaly.map(u => `${u.name} T${u.tier}`).join(', ') || '—'}]`);
    console.log(`    Attack subdps:  [${ownedSubdps.attack.map(u => `${u.name} T${u.tier}`).join(', ') || '—'}]`);
    console.log();
    console.log(`  Composite: ${compositeScore.toFixed(1)}  |  Calibration: ${calibration}`);
    console.log();

    // ========================================================================
    // PRINT RESULTS
    // ========================================================================

    console.log('=== Roster Assessment ===\n');
    console.log(`  Rating:    ${assessment.ratingTier}  (composite: ${compositeScore.toFixed(1)})`);
    console.log(`  Summary:   ${assessment.summary}`);
    console.log();

    if (options.debug) {
        console.log('=== All Detected Gaps ===\n');
        for (const gap of allGaps) {
            const priority = gap.score >= 70 ? 'HIGH' : gap.score >= 40 ? 'MED ' : 'LOW ';
            console.log(`  [${priority}] ${gap.id.padEnd(22)} raw=${String(gap.rawScore).padStart(3)}  cal=${String(gap.score).padStart(3)}  ${gap.title}`);
            console.log(`         ${gap.reason}`);
            console.log(`         → ${gap.units.slice(0, 5).map(u => `${u.name}${u.available === false ? ' (upcoming)' : ''}`).join(', ')}`);
        }
        console.log();
    }

    console.log(`=== Recommendations (Top ${options.depth}) ===\n`);
    if (recommendations.length === 0) {
        console.log('  No recommendations — your roster is in great shape!\n');
    } else {
        for (let i = 0; i < recommendations.length; i++) {
            const rec = recommendations[i];
            const priorityTag = rec.priority === 'High' ? '🔴 HIGH' : rec.priority === 'Medium' ? '🟡 MED ' : '🟢 LOW ';
            console.log(`  #${i + 1} [${priorityTag}] ${rec.title}  (raw: ${rec.rawScore}, cal: ${rec.score})`);
            console.log(`     ${rec.reason}`);
            console.log(`     Suggested: ${rec.units.map(u => `${u.name} T${u.tier}${u.available === false ? ' (upcoming)' : ''}`).join(', ')}`);
            console.log();
        }
    }
}

main().catch(console.error);
