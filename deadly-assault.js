/**
 * Deadly Assault Team Builder for Zenless Zone Zero
 * 
 * Generates optimal team allocations for 3 DA bosses,
 * ensuring no unit overlap and matching teams to boss requirements.
 */

import { parseArgs } from './lib/cli.js';
import { loadAllData } from './lib/data.js';
import { applyShareUrl } from './lib/share-url.js';
import { buildAvailableUnits } from './lib/roster-builder.js';
import { filterBosses } from './lib/boss-filter.js';
import { buildTeams } from './lib/team-pipeline.js';
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';
import { findExclusiveCombinations } from './app/public/lib/common/team-builder.js';

const options = parseArgs({
    name: 'deadly-assault.js',
    description: 'Finds optimal non-overlapping team allocations for 3 DA bosses.',
    examples: [
        '  node deadly-assault.js -b butch,ucc,pomp       3 bosses by partial name',
        '  node deadly-assault.js -b defiler,hunter,solo   Another combo',
        '  node deadly-assault.js -m -b butch,ucc,pomp     Personal roster',
        '  node deadly-assault.js -q "?roster=..." -10     Share URL, top 10'
    ].join('\n')
});

async function main() {
    const { units: allUnits, bosses, roster } = await loadAllData();
    applyShareUrl(options, allUnits);

    // ============================================================================
    // BOSS SELECTION
    // ============================================================================

    if (!options.bosses && !options.queryBosses) {
        console.error("ERROR: Boss filter required. Use --bosses/-b <filter> to specify bosses.");
        console.log("Example: node deadly-assault.js -b butch,ucc,pomp");
        console.log("\nAvailable bosses:");
        bosses.forEach(b => console.log(`  - ${b.name}`));
        return;
    }

    const bossFilter = options.bosses || options.queryBosses?.join(',');
    const SELECTED_BOSSES = filterBosses(bosses, bossFilter).map(b => b.name);

    if (SELECTED_BOSSES.length !== 3) {
        console.error(`ERROR: Boss filter must match exactly 3 bosses. Found ${SELECTED_BOSSES.length}:`);
        SELECTED_BOSSES.forEach(name => console.log(`  - ${name}`));
        if (SELECTED_BOSSES.length < 3) {
            console.log("\nAvailable bosses:");
            bosses.forEach(b => console.log(`  - ${b.name}`));
        }
        return;
    }

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    const DEBUG = options.debug;

    // Developer-only: Additional units not in units.json
    const DEVELOPER_UNITS = [];

    if (options.include && options.include.length > 0) {
        console.log(`Solutions must include at least one of: ${options.include.join(', ')}`);
    }

    const { availableUnits, universalUnits } = buildAvailableUnits(allUnits, options, roster, {
        extraUnits: DEVELOPER_UNITS
    });

    if (DEBUG) {
        const modeNote = options.units ? " (whitelist mode)" : (options.onlyMine ? " (personal roster)" : "");
        console.log(`Using ${availableUnits.length} units${modeNote}\n`);
    }

    // ============================================================================
    // TIER 0 SANITY CHECK
    // ============================================================================

    const DPS_ROLES = ["attack", "anomaly", "rupture"];
    const ELEMENTS = ["fire", "ice", "electric", "physical", "ether"];

    function checkTier0Utilization(combination, availableUnits, selectedBosses, bosses) {
        const warnings = [];
        const notes = [];

        const usedUnits = new Set();
        for (const assignment of combination.assignments) {
            for (const unit of assignment.team) {
                usedUnits.add(unit.name);
            }
        }

        const dpsTypesInCombo = new Set();
        for (const assignment of combination.assignments) {
            for (const unit of assignment.team) {
                for (const role of DPS_ROLES) {
                    if (unit.tags.includes(role)) dpsTypesInCombo.add(role);
                }
            }
        }

        const tier0Units = availableUnits.filter(u => u.tier === 0);
        const tier0Supports = tier0Units.filter(u => u.tags.includes("support"));
        const tier0DPS = tier0Units.filter(u => DPS_ROLES.some(role => u.tags.includes(role)));

        for (const support of tier0Supports) {
            if (usedUnits.has(support.name)) continue;
            const avoidTags = support.synergy?.avoid || [];

            if (avoidTags.length === 0) {
                warnings.push(`⚠️  ${support.name} (Tier 0 support, no restrictions) is not used`);
            } else {
                const canFitSomewhere = [...dpsTypesInCombo].some(dpsType => !avoidTags.includes(dpsType));
                if (canFitSomewhere) {
                    const compatibleTypes = [...dpsTypesInCombo].filter(t => !avoidTags.includes(t));
                    warnings.push(`⚠️  ${support.name} (Tier 0 support) not used despite compatible teams (${compatibleTypes.join("/")})`);
                }
            }
        }

        const bossData = selectedBosses.map(name => bosses.find(b => b.name === name));
        for (const dps of tier0DPS) {
            if (usedUnits.has(dps.name)) continue;
            const dpsElement = dps.tags.find(t => ELEMENTS.includes(t));
            const dpsType = dps.tags.find(t => DPS_ROLES.includes(t));

            const matchingBosses = bossData.filter(boss => {
                const weaknessMatch = boss.weaknesses.includes(dpsElement);
                const notAnti = !boss.anti || !boss.anti.includes(dpsType);
                return weaknessMatch && notAnti;
            });

            if (matchingBosses.length > 0) {
                const bossNames = matchingBosses.map(b =>
                    b.name.replace("Notorious ", "").substring(0, 15)
                ).join(", ");
                notes.push(`ℹ️  ${dps.name} (Tier 0 ${dpsType}) not used but matches weakness for: ${bossNames}`);
            }
        }

        const tier0Used = [...usedUnits].filter(name => {
            const unit = availableUnits.find(u => u.name === name);
            return unit && unit.tier === 0;
        }).length;
        const tier0Available = tier0Units.length;

        return { warnings, notes, tier0Used, tier0Available, usedUnits: [...usedUnits] };
    }

    // ============================================================================
    // DOMINANCE CHECK
    // ============================================================================

    function isDominatedCombination(combination, viableTeamsByBoss, availableUnits) {
        const usedUnitIds = new Set();
        for (const assignment of combination.assignments) {
            for (const unit of assignment.team) {
                usedUnitIds.add(unit.id);
            }
        }

        const tier0Units = availableUnits.filter(u => u.tier === 0);
        const missingTier0 = tier0Units.filter(u => !usedUnitIds.has(u.id));

        if (missingTier0.length === 0) return { dominated: false };

        for (const missingUnit of missingTier0) {
            for (let i = 0; i < combination.assignments.length; i++) {
                const assignment = combination.assignments[i];
                const bossName = assignment.boss;
                const currentScore = assignment.score;
                const viableTeams = viableTeamsByBoss[bossName] || [];

                const otherTeamUnitIds = new Set();
                for (let j = 0; j < combination.assignments.length; j++) {
                    if (j !== i) {
                        for (const unit of combination.assignments[j].team) {
                            otherTeamUnitIds.add(unit.id);
                        }
                    }
                }

                for (const candidateTeam of viableTeams) {
                    if (candidateTeam.score <= currentScore) continue;
                    if (!candidateTeam.team.some(u => u.id === missingUnit.id)) continue;
                    if (candidateTeam.team.some(u => otherTeamUnitIds.has(u.id))) continue;

                    return {
                        dominated: true,
                        reason: `Could use ${candidateTeam.label} (${candidateTeam.score}) for ${bossName.replace("Notorious ", "")} instead of ${assignment.label} (${currentScore}) to include ${missingUnit.name}`
                    };
                }
            }
        }

        return { dominated: false };
    }

    // ============================================================================
    // MAIN EXECUTION
    // ============================================================================

    console.log("===== Deadly Assault Team Builder =====\n");

    const selectedBossObjects = [];
    for (const bossName of SELECTED_BOSSES) {
        const boss = bosses.find(b => b.name === bossName);
        if (!boss) {
            console.error(`ERROR: Boss "${bossName}" not found in bosses.json`);
            return;
        }
        selectedBossObjects.push(boss);
    }

    console.log("Selected Bosses:");
    for (const boss of selectedBossObjects) {
        if (DEBUG) {
            const weakStr = boss.weaknesses.join(", ") || "none";
            const resStr = boss.resistances.join(", ") || "none";
            const shillStr = boss.shill || "none";
            console.log(`  ${boss.name}`);
            console.log(`    Weak: ${weakStr} | Resist: ${resStr} | Shill: ${shillStr} | Assists: ${boss.assists}`);
        } else {
            console.log(`  - ${boss.name}`);
        }
    }
    console.log();

    const { threeCharTeams, teamLabels, extendedCount, universalUnitObjects } = buildTeams(availableUnits, universalUnits);

    if (universalUnitObjects.length > 0) {
        if (DEBUG) console.log(`Universal units: ${universalUnitObjects.map(u => u.name).join(", ")}`);
        if (DEBUG && extendedCount > 0) console.log(`Extended ${extendedCount} teams using universal units`);
    }
    if (DEBUG) console.log(`Total 3-character teams: ${teamLabels.length}\n`);

    // Score teams for each boss
    const viableTeamsByBoss = {};
    const lenientBosses = [];

    for (const boss of selectedBossObjects) {
        viableTeamsByBoss[boss.name] = [];

        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            const score = scoreTeamForBoss(team, boss, { debug: options.debug });
            if (score > 0) {
                viableTeamsByBoss[boss.name].push({ label, team, score });
            }
        }

        if (viableTeamsByBoss[boss.name].length === 0) {
            lenientBosses.push(boss.name);
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const score = scoreTeamForBoss(team, boss, { lenient: true, debug: options.debug });
                if (score > 0) {
                    viableTeamsByBoss[boss.name].push({ label, team, score, lenient: true });
                }
            }
        }

        viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);
        if (DEBUG) {
            const lenientNote = lenientBosses.includes(boss.name) ? " (LENIENT)" : "";
            console.log(`${boss.name}: ${viableTeamsByBoss[boss.name].length} viable teams${lenientNote}`);
        }
    }

    if (lenientBosses.length > 0) {
        console.log(`⚠️  No on-element DPS for: ${lenientBosses.join(", ")} - using fallback mode`);
    }
    if (DEBUG) console.log();

    if (DEBUG) {
        console.log("===== Top Teams Per Boss =====\n");
        const TOP_DISPLAY = 7;
        for (const boss of selectedBossObjects) {
            console.log(`${boss.name}:`);
            const topTeams = viableTeamsByBoss[boss.name].slice(0, TOP_DISPLAY);
            topTeams.forEach((t, i) => {
                console.log(`  #${i + 1}: ${t.label} (${t.score.toFixed(1)})`);
            });
            console.log();
        }
    }

    // Find exclusive combinations
    let combinations = findExclusiveCombinations(viableTeamsByBoss, SELECTED_BOSSES);
    const totalCombos = combinations.length;

    if (options.include && options.include.length > 0) {
        const beforeIncludeFilter = combinations.length;
        combinations = combinations.filter(combo => {
            const allUnitsInSolution = new Set();
            for (const assignment of combo.assignments) {
                for (const unit of assignment.team) {
                    allUnitsInSolution.add(unit.name);
                }
            }
            return options.include.some(req => allUnitsInSolution.has(req));
        });
        if (DEBUG && beforeIncludeFilter - combinations.length > 0) {
            console.log(`Include filter removed ${beforeIncludeFilter - combinations.length} combinations`);
        }
    }

    combinations = combinations.filter(combo => {
        const result = isDominatedCombination(combo, viableTeamsByBoss, availableUnits);
        combo.dominanceCheck = result;
        return !result.dominated;
    });

    const dominatedCount = totalCombos - combinations.length;

    for (const combo of combinations) {
        const check = checkTier0Utilization(combo, availableUnits, SELECTED_BOSSES, bosses);
        combo.sanityCheck = check;
        combo.priority += check.warnings.length * 1000;
    }

    combinations.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.totalScore - a.totalScore;
    });

    if (DEBUG) {
        console.log(`Found ${combinations.length} valid team allocations (${dominatedCount} dominated removed)\n`);
    }

    if (combinations.length === 0) {
        console.log('⚠️ No non-overlapping combinations found — retrying all bosses in lenient mode...');
        for (const boss of selectedBossObjects) {
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const score = scoreTeamForBoss(team, boss, { lenient: true, debug: options.debug });
                if (score <= 0) continue;

                const existing = viableTeamsByBoss[boss.name].find(t => t.label === label);
                if (existing) {
                    if (score > existing.score) existing.score = score;
                    existing.lenient = true;
                } else {
                    viableTeamsByBoss[boss.name].push({ label, team, score, lenient: true });
                }
            }
            viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);
            console.log(`   ${boss.name}: ${viableTeamsByBoss[boss.name].length} viable teams (after lenient)`);
        }

        combinations = findExclusiveCombinations(viableTeamsByBoss, SELECTED_BOSSES);
        combinations = combinations.filter(combo => {
            const result = isDominatedCombination(combo, viableTeamsByBoss, availableUnits);
            combo.dominanceCheck = result;
            return !result.dominated;
        });
        for (const combo of combinations) {
            const check = checkTier0Utilization(combo, availableUnits, SELECTED_BOSSES, bosses);
            combo.sanityCheck = check;
            combo.priority += check.warnings.length * 1000;
        }
        combinations.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return b.totalScore - a.totalScore;
        });

        console.log(`After lenient retry — ${combinations.length} valid allocations`);
        if (combinations.length === 0) {
            console.log("No valid combinations found even in lenient mode. Try different bosses or expand your unit pool.");
            return;
        }
    }

    // Display results
    const displayCount = Math.min(options.depth, combinations.length);
    console.log(`===== Top ${displayCount} Team Allocations =====\n`);

    for (let i = 0; i < displayCount; i++) {
        const combo = combinations[i];
        const ranksUsed = combo.assignments.map(a => a.rank).join('+');
        console.log(`Combination #${i + 1} (Ranks: ${ranksUsed}, Total: ${combo.totalScore.toFixed(0)})`);

        for (const assignment of combo.assignments) {
            const shortBoss = assignment.boss.replace("Notorious ", "").substring(0, 20).padEnd(20);
            console.log(`  ${shortBoss}: [#${assignment.rank}] ${assignment.label} (${assignment.score})`);
        }

        const check = combo.sanityCheck;
        if (check.warnings.length > 0 || check.notes.length > 0) {
            console.log(`  --- Tier 0 Check (${check.tier0Used}/${check.tier0Available} used) ---`);
            for (const warning of check.warnings) console.log(`  ${warning}`);
            for (const note of check.notes) console.log(`  ${note}`);
        } else {
            console.log(`  ✓ Tier 0 utilization: ${check.tier0Used}/${check.tier0Available}`);
        }

        console.log();
    }

    if (combinations.length > options.depth) {
        console.log(`... and ${combinations.length - options.depth} more combinations.`);
        console.log(`Use --depth or -N to see more (e.g., -10 for top 10).`);
    }
}

main().catch(console.error);
