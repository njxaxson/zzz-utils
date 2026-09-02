/**
 * Rankings - per-agent, per-boss team ladders
 *
 * Pivot of compositions.js: instead of a flat top-N list per agent, writes
 * one matchups/<unit>.csv file per agent with a column per boss, listing
 * that agent's top -n teams for the boss (best at top). No scores - this is
 * a pure ordering artifact, meant to be diffed/eyeballed across engine
 * changes and against compositions.js output.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from './lib/cli.js';
import { loadAllData } from './lib/data.js';
import { applyShareUrl } from './lib/share-url.js';
import { resolveOptions, resolveUnit } from './lib/unit-resolver.js';
import { buildAvailableUnits } from './lib/roster-builder.js';
import { filterBosses } from './lib/boss-filter.js';
import { buildTeams } from './lib/team-pipeline.js';
import { parseTeams } from './lib/team-parser.js';
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';
import { rawScorePassesFilter } from './lib/score-filter.js';
import { ELEMENTS } from './app/public/lib/common/constants.js';

const DPS_TAGS = ['attack', 'anomaly', 'rupture', 'armorer'];
const MATCHUPS_DIR = join(process.cwd(), 'matchups');

const options = parseArgs({
    name: 'rankings.js',
    description: 'Writes matchups/<unit>.csv ladders: one column per boss, top -n teams per agent, best first.',
    options: ['depth', 'onlyMine', 'preview', 'debug', 'units', 'exclude', 'include', 'flex', 'bosses', 'omit', 'query', 'teams', 'rank', 'element', 'tsv'],
    defaults: { depth: 3, preview: true },
    examples: [
        '  node rankings.js                    Native S-rank DPS agents, top 3 teams each',
        '  node rankings.js -7                  Top 7 teams per agent',
        '  node rankings.js --tsv               Tab-separated, padded for alignment',
        '  node rankings.js -m                  Whole roster, filtered to personal roster',
        '  node rankings.js -R S                Whole roster, filtered to S-rank',
        '  node rankings.js :Alice :Miyabi       Only Alice and Miyabi'
    ].join('\n')
});

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function csvCell(value) {
    if (value == null) return '';
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
}

function writeCsv(headers, rows) {
    const lines = [headers.map(csvCell).join(',')];
    for (const row of rows) {
        lines.push(headers.map((_, i) => csvCell(row[i])).join(','));
    }
    return lines.join('\n') + '\n';
}

function writeTsv(headers, rows) {
    const widths = headers.map((h, i) => {
        let max = h.length;
        for (const row of rows) {
            const cell = row[i] || '';
            if (cell.length > max) max = cell.length;
        }
        return max;
    });
    const formatRow = cells => cells.map((c, i) => (c || '').padEnd(widths[i])).join('\t');
    const lines = [formatRow(headers)];
    for (const row of rows) lines.push(formatRow(row));
    return lines.join('\n') + '\n';
}

async function main() {
    const { units: allUnits, bosses, roster } = await loadAllData();
    applyShareUrl(options, allUnits);
    resolveOptions(options, allUnits);

    if (options.rank) {
        const rank = options.rank.toUpperCase();
        if (rank !== 'S' && rank !== 'A') {
            console.error(`ERROR: --rank must be "S" or "A", got "${options.rank}"`);
            process.exit(1);
        }
        options.rank = rank;
    }
    if (options.element) {
        const element = options.element.toLowerCase();
        if (!ELEMENTS.includes(element)) {
            console.error(`ERROR: --element must be one of: ${ELEMENTS.join(', ')}`);
            process.exit(1);
        }
        options.element = element;
    }

    const agentSelectorTokens = options.positional.filter(p => p.startsWith(':')).map(p => p.slice(1));
    let selectedAgentNames = null;
    if (agentSelectorTokens.length > 0) {
        try {
            selectedAgentNames = agentSelectorTokens.map(tok => resolveUnit(tok, allUnits).name);
        } catch (e) {
            console.error(`ERROR: ${e.message}`);
            process.exit(1);
        }
    }

    // Any roster-selection flag switches the agent-selection base from the
    // "native S-rank DPS" default to the whole roster (then filtered normally).
    const hasRosterSelectionFlags = Boolean(
        (options.units && options.units.length > 0) ||
        (options.exclude && options.exclude.length > 0) ||
        (options.include && options.include.length > 0) ||
        options.onlyMine || options.rank || options.element || selectedAgentNames
    );

    if (!options.omit) console.log("===== Rankings - Per-Agent Boss Ladders =====\n");

    let teamEntries;

    if (options.teams) {
        const { teams: parsedTeams, warnings } = parseTeams(options.teams, allUnits, { preview: options.preview });
        for (const w of warnings) console.warn(`WARNING: ${w}`);
        teamEntries = parsedTeams;
        if (!options.omit) console.log(`Explicit teams: ${teamEntries.length}\n`);
    } else {
        const { availableUnits, universalUnits } = buildAvailableUnits(allUnits, options, roster);
        if (!options.omit) console.log(`Using ${availableUnits.length} units\n`);
        const { threeCharTeams, teamLabels } = buildTeams(availableUnits, universalUnits);
        teamEntries = teamLabels.map(label => ({ label, team: threeCharTeams[label] }));
    }

    if (options.include && options.include.length > 0) {
        teamEntries = teamEntries.filter(({ team }) => {
            const teamUnitNames = team.map(u => u.name);
            return options.include.some(req => teamUnitNames.includes(req));
        });
    }

    let filteredBosses = bosses;
    if (options.bosses) {
        filteredBosses = filterBosses(bosses, options.bosses);
        if (!options.omit) console.log(`Boss filter: "${options.bosses}" (${filteredBosses.length} matches)\n`);
    } else if (options.queryBosses) {
        filteredBosses = filterBosses(bosses, options.queryBosses.join(','));
    }

    // Score every team against every boss once; keep only viable results.
    const scoredTeams = [];
    for (const { label, team } of teamEntries) {
        const bossScores = [];
        for (const boss of filteredBosses) {
            const score = scoreTeamForBoss(team, boss, { debug: options.debug });
            if (score > 0 && rawScorePassesFilter(score, options)) {
                bossScores.push({ bossName: boss.name, score });
            }
        }
        if (bossScores.length === 0) continue;
        scoredTeams.push({ label, team, bossScores });
    }

    let sectionAgents;
    if (hasRosterSelectionFlags) {
        sectionAgents = selectedAgentNames
            ? allUnits.filter(u => selectedAgentNames.includes(u.name))
            : allUnits;
        if (options.units && options.units.length > 0) {
            sectionAgents = sectionAgents.filter(u => options.units.some(n => n.toLowerCase() === u.name.toLowerCase()));
        }
        if (options.onlyMine) sectionAgents = sectionAgents.filter(u => roster.hasOwnProperty(u.name));
        if (options.exclude && options.exclude.length > 0) {
            sectionAgents = sectionAgents.filter(u => !options.exclude.some(n => n.toLowerCase() === u.name.toLowerCase()));
        }
        if (options.rank) sectionAgents = sectionAgents.filter(u => u.rank === options.rank);
        if (options.element) sectionAgents = sectionAgents.filter(u => (u.tags || []).includes(options.element));
    } else {
        sectionAgents = allUnits.filter(u => u.rank === 'S' && (u.tags || []).some(t => DPS_TAGS.includes(t)));
        if (!options.omit) console.log(`Default agent set: native S-rank DPS (${DPS_TAGS.join(', ')}) - ${sectionAgents.length} agents\n`);
    }
    sectionAgents = [...sectionAgents].sort((a, b) => a.name.localeCompare(b.name));

    await mkdir(MATCHUPS_DIR, { recursive: true });

    let written = 0;
    for (const agent of sectionAgents) {
        const agentTeams = scoredTeams.filter(t => t.team.some(u => u.name === agent.name));
        if (agentTeams.length === 0) {
            if (!options.omit) console.log(`${agent.name}: no viable teams, skipped`);
            continue;
        }

        // Per boss: this agent's teams, sorted best-first, deduped by boss.
        const bossColumns = [];
        for (const boss of filteredBosses) {
            const rows = [];
            for (const t of agentTeams) {
                const entry = t.bossScores.find(bs => bs.bossName === boss.name);
                if (entry) rows.push({ label: t.label, score: entry.score });
            }
            if (rows.length === 0) continue;
            rows.sort((a, b) => b.score - a.score);
            bossColumns.push({ bossName: boss.name, labels: rows.slice(0, options.depth).map(r => r.label) });
        }

        if (bossColumns.length === 0) {
            if (!options.omit) console.log(`${agent.name}: no relevant bosses, skipped`);
            continue;
        }

        const headers = bossColumns.map(c => c.bossName);
        const rows = [];
        for (let i = 0; i < options.depth; i++) {
            rows.push(bossColumns.map(c => c.labels[i] || ''));
        }

        const content = options.tsv ? writeTsv(headers, rows) : writeCsv(headers, rows);
        const filePath = join(MATCHUPS_DIR, `${slugify(agent.name)}.${options.tsv ? 'tsv' : 'csv'}`);
        await writeFile(filePath, content, 'utf-8');
        written++;
        if (!options.omit) console.log(`${agent.name}: wrote ${filePath} (${headers.length} bosses)`);
    }

    if (!options.omit) console.log(`\nWrote ${written} file(s) to ${MATCHUPS_DIR}`);
}

main().catch(console.error);
