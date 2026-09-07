#!/usr/bin/env node
/**
 * Cohesion fixture runner — the objective function for support-fit work.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every previous attempt at "does this support belong on this team?" was judged against the
 * 109-test scoring suite, where unrelated numeric bands move on any change and drown out the
 * signal you actually care about. So a change that FIXED the mechanism could look like a
 * regression, and a change that broke it could look clean. Eight attempts failed partly for the
 * lack of a single number to optimise.
 *
 * This is that number. It holds the owner's judgements as ORDERED PAIRS and BANDS (never absolute
 * scores, which are impossible to keep self-consistent) in cohesion-fixture.json, scores the teams
 * with the live engine, and reports how many hold.
 *
 * Usage:
 *   node cohesion-fixture.mjs            # summary
 *   node cohesion-fixture.mjs --verbose  # every entry with numbers
 *   node cohesion-fixture.mjs --fail     # only failures
 *   node cohesion-fixture.mjs --stated   # only 'stated'-provenance entries (drop 'confirmed')
 *
 * Exit code: 0 if every (selected) entry holds, 1 otherwise — so it can gate a change the same way
 * the test suites do.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadAllData } from './lib/data.js';
import { parseTeams } from './lib/team-parser.js';
import { filterBosses } from './lib/boss-filter.js';
import { scoreTeamForBoss } from './app/public/lib/common/team-scorer.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const NEUTRAL_BOSS = {
    id: 'neutral',
    name: 'Synthetic Neutral Boss',
    favored: [],
    mechanics: { weaknesses: [], resistances: [], shill: null, anti: [], assists: 0 },
};

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const FAIL_ONLY = process.argv.includes('--fail');
const STATED_ONLY = process.argv.includes('--stated');

// Resolve a boss-filter string to a single boss object. 'neutral' is the synthetic boss, which
// filterBosses does not know about, so it is handled here. Mirrors withBosses() in lib/scoring-test-utils.js.
function resolveBoss(bosses, filterStr) {
    if (!filterStr || filterStr.toLowerCase() === 'neutral') return NEUTRAL_BOSS;
    const matches = filterBosses(bosses, filterStr);
    if (matches.length === 0) throw new Error(`boss filter '${filterStr}' matched nothing`);
    // A fixture entry names ONE boss on purpose; if a filter is loose enough to match several,
    // that is an authoring bug worth surfacing rather than silently taking the first.
    if (matches.length > 1) {
        throw new Error(`boss filter '${filterStr}' matched ${matches.length} bosses ` +
            `(${matches.map(b => b.name).join(', ')}); make it specific`);
    }
    return matches[0];
}

// Score one '/'-joined team spec on a boss. Preview units are included (these fixtures reference
// unreleased units, same as the scoring suite). Returns null if the spec does not resolve to
// exactly one team, so an authoring typo fails loudly rather than scoring the wrong thing.
function scoreSpec(spec, boss, allUnits) {
    const { teams } = parseTeams(spec, allUnits, { preview: true });
    if (teams.length !== 1) return { score: null, label: spec, error: `parsed to ${teams.length} teams` };
    const label = teams[0].label;
    return { score: scoreTeamForBoss(teams[0].team, boss, {}), label };
}

function checkEntry(entry, bosses, allUnits) {
    const boss = resolveBoss(bosses, entry.boss);
    const lines = [];
    let ok = true;

    const s = (spec) => scoreSpec(spec, boss, allUnits);

    if (entry.type === 'pair' || entry.type === 'margin') {
        const g = s(entry.greater);
        const l = s(entry.less);
        const by = entry.type === 'margin' ? (entry.by ?? 0) : 0;
        if (g.score === null || l.score === null) {
            ok = false;
            lines.push(`  UNRESOLVED: ${g.error ? entry.greater + ' — ' + g.error : ''}${l.error ? ' / ' + entry.less + ' — ' + l.error : ''}`);
        } else {
            ok = g.score > l.score + by;
            const rel = by > 0 ? `by >=${by}` : '>';
            lines.push(`  ${g.label} (${g.score.toFixed(1)}) ${rel} ${l.label} (${l.score.toFixed(1)})` +
                `  [gap ${(g.score - l.score).toFixed(1)}]`);
        }
    } else if (entry.type === 'band') {
        const t = s(entry.team);
        if (t.score === null) {
            ok = false;
            lines.push(`  UNRESOLVED: ${entry.team} — ${t.error}`);
        } else {
            const lo = entry.min ?? -Infinity;
            const hi = entry.max ?? Infinity;
            ok = t.score >= lo && t.score <= hi;
            const range = `[${entry.min ?? '-inf'}, ${entry.max ?? '+inf'}]`;
            lines.push(`  ${t.label} (${t.score.toFixed(1)}) in ${range}`);
        }
    } else if (entry.type === 'ladder') {
        const scored = entry.teams.map(s);
        const bad = scored.find(x => x.score === null);
        if (bad) {
            ok = false;
            lines.push(`  UNRESOLVED: ${bad.label} — ${bad.error}`);
        } else {
            for (let i = 0; i + 1 < scored.length; i++) {
                if (!(scored[i].score > scored[i + 1].score)) ok = false;
            }
            lines.push('  ' + scored.map(x => `${x.label.split(' / ')[0]} ${x.score.toFixed(1)}`).join(' > '));
        }
    } else {
        ok = false;
        lines.push(`  UNKNOWN ENTRY TYPE: ${entry.type}`);
    }

    return { ok, lines };
}

async function main() {
    const { units: allUnits, bosses } = await loadAllData();
    const fixturePath = join(HERE, 'cohesion-fixture.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

    let entries = fixture.entries;
    if (STATED_ONLY) entries = entries.filter(e => e.provenance === 'stated');

    let held = 0;
    const failed = [];

    for (const entry of entries) {
        let result;
        try {
            result = checkEntry(entry, bosses, allUnits);
        } catch (e) {
            result = { ok: false, lines: [`  ERROR: ${e.message}`] };
        }
        if (result.ok) held++;
        else failed.push(entry.id);

        const show = VERBOSE || (FAIL_ONLY && !result.ok) || (!FAIL_ONLY && !result.ok);
        if (show) {
            const mark = result.ok ? 'PASS' : 'FAIL';
            const prov = entry.provenance === 'confirmed' ? ' (confirmed — weak)' : '';
            console.log(`${mark}  ${entry.id}${prov}`);
            for (const ln of result.lines) console.log(ln);
            if (VERBOSE && entry.note) console.log(`  · ${entry.note}`);
            console.log('');
        }
    }

    const total = entries.length;
    console.log(`${'='.repeat(60)}`);
    console.log(`Cohesion fixture: ${held}/${total} judgements hold` +
        `${STATED_ONLY ? ' (stated-only)' : ''}.`);
    if (failed.length) console.log(`Failing: ${failed.join(', ')}`);
    process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
