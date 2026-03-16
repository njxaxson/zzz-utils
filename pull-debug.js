/**
 * Pull Recommendations Debug Script
 * 
 * Runs the pull recommendation engine from the command line for debugging.
 * 
 * Usage:
 *   node pull-debug.js              Full roster, top 5 recommendations
 *   node pull-debug.js -10          Show top 10 recommendations
 *   node pull-debug.js -d 10        Verbose debug + top 10
 *   node pull-debug.js -m           Personal roster (from roster.json)
 *   node pull-debug.js -u "Miyabi,Astra,Nicole,Anby,Billy"   Specific units only
 *   node pull-debug.js -Miyabi      Remove Miyabi from roster
 *   node pull-debug.js +Orphie      Add Orphie to roster
 *   node pull-debug.js -m +Astra    Personal roster, but also add Astra
 *   node pull-debug.js -m -Evelyn   Personal roster, but remove Evelyn
 *   node pull-debug.js -q "?roster=eJwN..."  Roster from share URL query string
 *   node pull-debug.js -q "?roster=eJwN..." +Orphie  Share URL roster with overrides
 */

async function main() {
    const { default: allUnits } = await import('./app/public/data/units.json', { with: { type: 'json' } });
    const { default: myRoster } = await import('./roster.json', { with: { type: 'json' } });
    const {
        analyze, tierToQuality, qualityLabel, getBestTier, getUnitElement,
        isSubdps, capitalize, DPS_ARCHETYPES, ELEMENTS
    } = await import('./app/public/lib/pull-engine.js');
    const { inflateSync } = await import('node:zlib');

    // ========================================================================
    // PARSE ARGUMENTS
    // ========================================================================

    const args = process.argv.slice(2);
    const options = {
        depth: 5,
        debug: false,
        onlyMine: false,
        units: null,
        query: null,
        additions: [],
        removals: []
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const depthMatch = arg.match(/^-(\d+)$/);
        if (depthMatch) {
            options.depth = parseInt(depthMatch[1], 10);
        } else if (arg === '-d' || arg === '--debug') {
            options.debug = true;
            if (args[i + 1] && /^\d+$/.test(args[i + 1])) {
                options.depth = parseInt(args[i + 1], 10);
                i++;
            }
        } else if (arg === '-m' || arg === '--only-mine') {
            options.onlyMine = true;
        } else if ((arg === '-u' || arg === '--units') && args[i + 1]) {
            options.units = args[i + 1].split(',').map(u => u.trim());
            i++;
        } else if ((arg === '-q' || arg === '--query') && args[i + 1]) {
            options.query = args[i + 1];
            i++;
        } else if (arg.startsWith('+')) {
            options.additions.push(arg.slice(1));
        } else if (arg.startsWith('-') && arg.length > 2) {
            options.removals.push(arg.slice(1));
        }
    }

    // ========================================================================
    // SHARE URL DECODING
    // ========================================================================

    function base64UrlDecodeNode(str) {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        return Buffer.from(base64, 'base64');
    }

    function decodeRosterFromParam(encoded) {
        let deltaString;
        try {
            if (encoded.startsWith('u_')) {
                deltaString = base64UrlDecodeNode(encoded.slice(2)).toString('utf8');
            } else {
                deltaString = inflateSync(base64UrlDecodeNode(encoded)).toString('utf8');
            }
        } catch (e) {
            console.error('Failed to decode roster from share URL:', e.message);
            process.exit(1);
        }

        const [ownedLimitedStr, notOwnedOthersStr] = deltaString.split('|');
        const ownedLimited = new Set(ownedLimitedStr ? ownedLimitedStr.split(',').filter(Boolean) : []);
        const notOwnedOthers = new Set(notOwnedOthersStr ? notOwnedOthersStr.split(',').filter(Boolean) : []);

        const owned = [];
        for (const unit of allUnits) {
            const defaultOwned = unit.rank === 'A' || (unit.rank === 'S' && !unit.limited);
            let isOwned = defaultOwned;
            if (ownedLimited.has(unit.id)) isOwned = true;
            if (notOwnedOthers.has(unit.id)) isOwned = false;
            if (isOwned) owned.push(unit.name);
        }

        return owned;
    }

    if (options.query) {
        if (options.units) {
            console.error('Error: --query (-q) and --units (-u) are mutually exclusive.');
            process.exit(1);
        }
        const queryStart = options.query.indexOf('?');
        const qs = queryStart >= 0 ? options.query.substring(queryStart + 1) : options.query;
        const params = new URLSearchParams(qs);

        const rosterParam = params.get('roster');
        if (rosterParam) {
            options.units = decodeRosterFromParam(rosterParam);
            console.log(`Share URL roster: ${options.units.length} owned units`);
        }
    }

    // ========================================================================
    // BUILD ROSTER STATE
    // ========================================================================

    const LOCKED = ['nicole', 'anby', 'billy'];

    const unitStates = {};
    for (const unit of allUnits) {
        const isAvailable = unit.available !== false;
        let owned;

        if (options.units) {
            owned = options.units.some(n => n.toLowerCase() === unit.name.toLowerCase());
        } else if (options.onlyMine) {
            owned = myRoster.hasOwnProperty(unit.name);
        } else {
            owned = isAvailable && (unit.rank === 'A' || (unit.rank === 'S' && !unit.limited));
        }

        if (LOCKED.includes(unit.id)) owned = true;

        unitStates[unit.id] = { owned };
    }

    for (const name of options.additions) {
        const unit = allUnits.find(u => u.name.toLowerCase() === name.toLowerCase());
        if (unit) {
            unitStates[unit.id].owned = true;
        } else {
            console.warn(`WARNING: Unknown unit "${name}" in + override`);
        }
    }
    for (const name of options.removals) {
        const unit = allUnits.find(u => u.name.toLowerCase() === name.toLowerCase());
        if (unit) {
            if (LOCKED.includes(unit.id)) {
                console.warn(`WARNING: Cannot remove locked starter "${name}"`);
            } else {
                unitStates[unit.id].owned = false;
            }
        } else {
            console.warn(`WARNING: Unknown unit "${name}" in - override`);
        }
    }

    const ownedUnits = allUnits.filter(u => unitStates[u.id].owned);

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
