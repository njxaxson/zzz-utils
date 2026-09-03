#!/usr/bin/env node
/**
 * Full-corpus score dump — the measurement baseline for engine work.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scoring-diff.js` compares *rankings*, and it deliberately hides shuffles inside
 * groups of teams that share a score. That makes it useless for the one thing engine
 * retuning most needs to know: did every number move, and by how much? A change that
 * shifts the whole corpus by a similar amount shows up in `scoring-diff.js` as
 * "no material changes" while all ~130k scores have in fact moved.
 *
 * This script writes one row per (boss, team) with the final score AND the per-layer
 * breakdown, so `score-delta.mjs` can answer "which layer moved this team" without
 * re-running `--debug` team by team.
 *
 * The corpus is FIXED and takes no roster/filter flags on purpose — a baseline you can
 * accidentally narrow is not a baseline. Full unit list minus preview units, Nicole as
 * the flex unit (the CLI default), every boss in bosses.json plus every enabled
 * variation plus the synthetic neutral boss.
 *
 * Output is TSV so it diffs cleanly in git and parses without a JSON reader.
 *
 * Usage:
 *   node score-dump.mjs > matchups/before.txt
 *   node score-dump.mjs --preview > matchups/before.txt   # include preview units too
 */

import { loadAllData } from './lib/data.js';
import { buildTeams } from './lib/team-pipeline.js';
import { scoreTeamForBoss, resolveBossVariation } from './app/public/lib/common/team-scorer.js';

const INCLUDE_PREVIEW = process.argv.includes('--preview') || process.argv.includes('-p');

const NEUTRAL_BOSS = {
    id: 'neutral',
    name: 'Synthetic Neutral Boss',
    favored: [],
    mechanics: {
        weaknesses: [],
        resistances: [],
        shill: null,
        anti: [],
        assists: 0
    }
};

// The numeric columns after `score`. Kept in one place because score-delta.mjs reads the
// header rather than hard-coding them, so adding a layer here needs no change over there.
const LAYERS = ['base', 'avoid', 'structure', 'fieldTime', 'contention', 'l2', 'l3', 'l4raw', 'l4', 'l5', 'archetype', 'raw', 'teamwork'];

// Non-numeric columns, kept separate from LAYERS so score-delta.mjs's numeric diffing (which
// auto-derives its layer list from the header) does not have to special-case them.
const TEXT_COLUMNS = ['carryArchetype'];

function num(v) {
    // 4dp is well below any threshold the engine cares about but enough that a rounding
    // change shows as movement rather than hiding inside the display precision.
    return Number.isFinite(v) ? v.toFixed(4) : '';
}

async function main() {
    const { units: allUnits, bosses } = await loadAllData();

    const availableUnits = INCLUDE_PREVIEW
        ? [...allUnits]
        : allUnits.filter(u => u.available !== false);

    const { threeCharTeams, teamLabels } = buildTeams(availableUnits, ['Nicole']);

    // Every boss, then every enabled variation of it, then the neutral synthetic.
    const corpus = [];
    for (const boss of bosses) {
        corpus.push(boss);
        for (const [id, v] of Object.entries(boss.variations ?? {})) {
            if (v.enabled === true) corpus.push(resolveBossVariation(boss, id));
        }
    }
    corpus.push(NEUTRAL_BOSS);

    const bossLabel = b => (b._variationId ? `${b.id}:${b._variationId}` : b.id);

    process.stdout.write(`# score-dump corpus: ${teamLabels.length} teams x ${corpus.length} bosses` +
        `${INCLUDE_PREVIEW ? ' (preview units included)' : ''}\n`);
    process.stdout.write(['boss', 'team', 'score', ...LAYERS, ...TEXT_COLUMNS].join('\t') + '\n');

    // Buffered in chunks — 130k individual stdout writes is measurably slower than
    // assembling and flushing, and this script runs twice per phase.
    let buf = [];
    for (const boss of corpus) {
        const bl = bossLabel(boss);
        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            const trace = {};
            const score = scoreTeamForBoss(team, boss, { trace });
            if (score <= 0 || trace.disqualified) {
                // Disqualified/non-viable teams are still emitted, so a team that becomes
                // viable (or stops being) is a visible row change rather than a silent
                // absence that score-delta would have to guess about.
                buf.push([bl, label, num(score), ...LAYERS.map(() => ''), ...TEXT_COLUMNS.map(() => '')].join('\t'));
            } else {
                buf.push([bl, label, num(score), ...LAYERS.map(k => num(trace[k])),
                    ...TEXT_COLUMNS.map(k => trace[k] ?? '')].join('\t'));
            }
            if (buf.length >= 4096) { process.stdout.write(buf.join('\n') + '\n'); buf = []; }
        }
    }
    if (buf.length) process.stdout.write(buf.join('\n') + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
