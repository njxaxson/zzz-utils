#!/usr/bin/env node
/**
 * Compare two score dumps and check a stated prediction.
 *
 * WHY THIS EXISTS
 * ---------------
 * The house rule on this project is that a green test suite is not evidence. The thing
 * that has actually caught bad fixes is stating, BEFORE the change, which teams are
 * allowed to move — "every team that moves must contain Lighter" — and then listing the
 * exceptions. This tool does that listing.
 *
 * Everything else it prints (movement counts, distribution, biggest movers, which layer
 * moved) is there to answer the follow-up question once the prediction holds or fails.
 *
 * Usage:
 *   node score-delta.mjs before.tsv after.tsv
 *   node score-delta.mjs before.tsv after.tsv --predict Lighter
 *   node score-delta.mjs before.tsv after.tsv --predict Astra,Caesar
 *   node score-delta.mjs before.tsv after.tsv --predict-none
 *   node score-delta.mjs before.tsv after.tsv --predict Lighter --top 30 --eps 0.05
 *
 * --predict NAME[,NAME...]  every moved team must contain at least one of these units
 * --predict-none            nothing at all may move
 * --eps N                   movement threshold in points (default 0.05, i.e. one
 *                           display step — anything smaller cannot be a real change
 *                           given the engine rounds to 0.1)
 * --top N                   how many biggest movers to list each way (default 20)
 * --exceptions N            how many prediction exceptions to list (default 40)
 */

import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
// Flags that take a value, so the value is not mistaken for a positional path.
const VALUED = new Set(['--predict', '--eps', '--top', '--exceptions']);
const positional = argv.filter((a, i) => !a.startsWith('-') && !VALUED.has(argv[i - 1]));
const flag = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const has = name => argv.includes(name);

if (positional.length !== 2) {
    console.error('Usage: node score-delta.mjs <before.tsv> <after.tsv> [--predict Name[,Name]] [--predict-none]');
    process.exit(2);
}

const [beforePath, afterPath] = positional;
const EPS = parseFloat(flag('--eps', '0.05'));
const TOP = parseInt(flag('--top', '20'), 10);
const MAX_EXCEPTIONS = parseInt(flag('--exceptions', '40'), 10);
const predictNone = has('--predict-none');
const predictUnits = predictNone
    ? []
    : String(flag('--predict', '')).split(',').map(s => s.trim()).filter(Boolean);
const hasPrediction = predictNone || predictUnits.length > 0;

function load(path) {
    const text = readFileSync(path, 'utf-8');
    const lines = text.split('\n');
    let header = null;
    const rows = new Map();
    for (const line of lines) {
        if (!line || line.startsWith('#')) continue;
        const parts = line.split('\t');
        if (!header) {
            if (parts[0] !== 'boss') throw new Error(`${path}: expected a header row starting with "boss"`);
            header = parts;
            continue;
        }
        const rec = {};
        for (let i = 0; i < header.length; i++) rec[header[i]] = parts[i];
        rows.set(`${rec.boss}\t${rec.team}`, rec);
    }
    if (!header) throw new Error(`${path}: no header row found`);
    return { header, rows };
}

const before = load(beforePath);
const after = load(afterPath);

// Layer columns are read from the header rather than hard-coded, so adding a layer to
// score-dump.mjs needs no change here.
const LAYERS = after.header.filter(h => h !== 'boss' && h !== 'team' && h !== 'score');

const n = v => (v === '' || v === undefined ? null : parseFloat(v));

const moved = [];
const appeared = [];       // was non-viable, now scores
const vanished = [];       // scored, now non-viable
const missing = [];        // key present in one dump only — a corpus mismatch
const layerCounts = new Map();
let compared = 0;

for (const [key, b] of before.rows) {
    const a = after.rows.get(key);
    if (!a) { missing.push(`only in before: ${key.replace('\t', ' / ')}`); continue; }
    compared++;

    const bs = n(b.score), as = n(a.score);
    const bViable = bs !== null && bs > 0;
    const aViable = as !== null && as > 0;

    if (bViable && !aViable) { vanished.push({ key, bs, as }); continue; }
    if (!bViable && aViable) { appeared.push({ key, bs, as }); continue; }
    if (!bViable && !aViable) continue;

    const delta = as - bs;
    if (Math.abs(delta) < EPS) continue;

    // Attribute the move to whichever layers actually changed. A team whose only changed
    // layer is `teamwork` moved for a different reason than one whose `l4` changed, and
    // that distinction is the whole point of dumping the breakdown.
    const changedLayers = LAYERS.filter(L => {
        const bv = n(b[L]), av = n(a[L]);
        if (bv === null || av === null) return bv !== av;
        return Math.abs(av - bv) > 1e-6;
    }).filter(L => L !== 'raw');   // `raw` is the sum of the others; it is always implied

    const sig = changedLayers.length ? changedLayers.join('+') : '(rounding only)';
    layerCounts.set(sig, (layerCounts.get(sig) || 0) + 1);

    const [boss, team] = key.split('\t');
    moved.push({ boss, team, bs, as, delta, sig });
}

for (const key of after.rows.keys()) {
    if (!before.rows.has(key)) missing.push(`only in after: ${key.replace('\t', ' / ')}`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const fx = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);

console.log(`score-delta: ${beforePath} -> ${afterPath}`);
console.log('='.repeat(72));
console.log(`Rows compared:      ${compared}`);
console.log(`Scores moved:       ${moved.length}  (${(100 * moved.length / Math.max(1, compared)).toFixed(1)}% of corpus, threshold ${EPS})`);
console.log(`Became viable:      ${appeared.length}`);
console.log(`Became non-viable:  ${vanished.length}`);
if (missing.length) {
    console.log(`\n!! CORPUS MISMATCH: ${missing.length} row(s) present in only one dump.`);
    console.log('   The two dumps do not describe the same teams, so nothing below is trustworthy.');
    for (const m of missing.slice(0, 10)) console.log(`   ${m}`);
    if (missing.length > 10) console.log(`   ...and ${missing.length - 10} more`);
}

if (moved.length) {
    const deltas = moved.map(m => m.delta).sort((x, y) => x - y);
    const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    const pct = p => deltas[Math.min(deltas.length - 1, Math.floor(p * deltas.length))];
    const up = deltas.filter(d => d > 0).length;
    console.log('\nMovement distribution');
    console.log('-'.repeat(72));
    console.log(`  up ${up} / down ${deltas.length - up}`);
    console.log(`  mean ${fx(mean, 2)}   min ${fx(deltas[0], 1)}   p10 ${fx(pct(0.10), 1)}   ` +
        `median ${fx(pct(0.50), 1)}   p90 ${fx(pct(0.90), 1)}   max ${fx(deltas[deltas.length - 1], 1)}`);

    console.log('\nWhich layer moved (by changed-layer signature)');
    console.log('-'.repeat(72));
    for (const [sig, count] of [...layerCounts].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
        console.log(`  ${String(count).padStart(7)}  ${sig}`);
    }

    const byDelta = [...moved].sort((a, b) => b.delta - a.delta);
    const show = (title, list) => {
        console.log(`\n${title}`);
        console.log('-'.repeat(72));
        for (const m of list) {
            console.log(`  ${fx(m.delta).padStart(9)}  ${m.bs.toFixed(1)} -> ${m.as.toFixed(1)}  ` +
                `${m.boss.padEnd(15)} ${m.team}   [${m.sig}]`);
        }
    };
    // Labelled "largest/smallest delta" rather than "gains/losses": when every mover
    // goes the same way, calling the bottom of the list "losses" is a lie.
    show(`Largest deltas (top ${TOP})`, byDelta.slice(0, TOP));
    show(`Smallest deltas (bottom ${TOP})`, byDelta.slice(-TOP).reverse());
}

for (const [title, list] of [['Became viable', appeared], ['Became non-viable', vanished]]) {
    if (!list.length) continue;
    console.log(`\n${title}`);
    console.log('-'.repeat(72));
    for (const v of list.slice(0, TOP)) {
        console.log(`  ${v.key.replace('\t', '  ')}   ${v.bs === null ? '-' : v.bs.toFixed(1)} -> ${v.as === null ? '-' : v.as.toFixed(1)}`);
    }
    if (list.length > TOP) console.log(`  ...and ${list.length - TOP} more`);
}

// ---------------------------------------------------------------------------
// The prediction check — the part that decides whether the phase continues
// ---------------------------------------------------------------------------

let exitCode = 0;

if (hasPrediction) {
    console.log('\n' + '='.repeat(72));
    const claim = predictNone
        ? 'nothing moves'
        : `every moved team contains one of: ${predictUnits.join(', ')}`;
    console.log(`PREDICTION: ${claim}`);
    console.log('='.repeat(72));

    // Viability flips count as movement — a team that stopped scoring moved further than
    // any team that merely lost points.
    const candidates = [
        ...moved.map(m => ({ boss: m.boss, team: m.team, note: `${m.bs.toFixed(1)} -> ${m.as.toFixed(1)} (${fx(m.delta)}) [${m.sig}]` })),
        ...appeared.map(v => ({ ...splitKey(v.key), note: 'became viable' })),
        ...vanished.map(v => ({ ...splitKey(v.key), note: 'became non-viable' }))
    ];

    const exceptions = predictNone
        ? candidates
        : candidates.filter(c => !predictUnits.some(u => teamContains(c.team, u)));

    if (exceptions.length === 0) {
        console.log(`HOLDS. ${candidates.length} team-boss row(s) moved, 0 exceptions.`);
    } else {
        console.log(`FAILS. ${exceptions.length} exception(s) out of ${candidates.length} moved row(s).`);
        console.log('The change reached teams it was not supposed to reach. Per the plan, stop here.\n');
        for (const e of exceptions.slice(0, MAX_EXCEPTIONS)) {
            console.log(`  ${e.boss.padEnd(15)} ${e.team.padEnd(38)} ${e.note}`);
        }
        if (exceptions.length > MAX_EXCEPTIONS) console.log(`  ...and ${exceptions.length - MAX_EXCEPTIONS} more`);

        // Which units show up in the exceptions, most-frequent first — usually names the
        // real cause faster than reading the list does.
        const unitFreq = new Map();
        for (const e of exceptions) {
            for (const u of e.team.split(' / ')) unitFreq.set(u, (unitFreq.get(u) || 0) + 1);
        }
        console.log('\n  Units appearing in exceptions:');
        for (const [u, c] of [...unitFreq].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
            console.log(`    ${String(c).padStart(6)}  ${u}`);
        }
        exitCode = 1;
    }
}

function splitKey(key) {
    const [boss, team] = key.split('\t');
    return { boss, team };
}

function teamContains(teamLabel, unitName) {
    return teamLabel.split(' / ').some(n => n === unitName);
}

process.exit(exitCode);
