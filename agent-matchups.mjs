/**
 * Runs matchups.js for every limited S-rank in app/public/data/units.json.
 * The roster is read on each run from that file (no hardcoded ID list) so you
 * can add/remove/flag units in JSON and re-run the script.
 *
 * A unit with "available": false is not in the normal pool; for those rows only,
 * this passes -p (preview) to matchups. Units without an "available" field are
 * treated as available.
 *
 * Usage (from repo root):
 *   node agent-matchups.mjs                    # depth 5 (default)
 *   node agent-matchups.mjs -7               # depth 7 (same form as matchups)
 *   node agent-matchups.mjs --depth 7
 *
 * Writes: matchups/<unit-id>.txt
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const UNITS_JSON = join(__dirname, 'app', 'public', 'data', 'units.json');
const MATCHUPS_JS = join(__dirname, 'matchups.js');
const OUT_DIR = join(__dirname, 'matchups');

const SCRIPT = 'agent-matchups.mjs';

function parseDepth(argv) {
    const args = argv.slice(2);
    let fromLong = null;
    let fromShort = null;

    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-h' || a === '--help' || a === '-?') {
            console.log(`Usage: node ${SCRIPT} [options]

  -N                 Depth passed to matchups as -N (e.g. -7 for top 7 per boss)
  --depth <n>       Same as -N

  (omit both for default depth 5)

Output files: matchups/<unit-id>.txt (one per limited S-rank)`);
            process.exit(0);
        }
        if (a === '--depth') {
            const v = args[++i];
            if (v === undefined) {
                console.error('--depth requires a positive integer argument.');
                process.exit(1);
            }
            const n = parseInt(v, 10);
            if (!Number.isFinite(n) || n < 1) {
                console.error('--depth must be a positive integer.');
                process.exit(1);
            }
            fromLong = n;
            continue;
        }
        if (/^-\d+$/.test(a)) {
            const n = parseInt(a.slice(1), 10);
            if (!Number.isFinite(n) || n < 1) {
                console.error('Depth shorthand -N must be a positive integer.');
                process.exit(1);
            }
            fromShort = n;
            continue;
        }
        console.error(`Unknown argument: ${a}`);
        console.error(`Use -N (e.g. -7) or --depth <n>, or node ${SCRIPT} -h for help.`);
        process.exit(1);
    }

    if (fromLong !== null && fromShort !== null && fromLong !== fromShort) {
        console.error(`Conflicting depth: --depth ${fromLong} vs -${fromShort}.`);
        process.exit(1);
    }

    return fromLong ?? fromShort ?? 5;
}

const depth = parseDepth(process.argv);

const raw = readFileSync(UNITS_JSON, 'utf8');
let units;
try {
    units = JSON.parse(raw);
} catch (e) {
    console.error(`Invalid JSON in ${UNITS_JSON}: ${e.message}`);
    process.exit(1);
}
if (!Array.isArray(units)) {
    console.error(`${UNITS_JSON} must be a JSON array of unit objects.`);
    process.exit(1);
}
const limitedS = units.filter(
    (u) => u && typeof u === 'object' && u.rank === 'S' && u.limited === true
);
limitedS.sort((a, b) => String(a.id).localeCompare(String(b.id)));

const needsPreview = (u) => u.available === false;

mkdirSync(OUT_DIR, { recursive: true });

const previewCount = limitedS.filter(needsPreview).length;
console.log(
    `Limited S-ranks: ${limitedS.length} (${previewCount} unavailable → -p), depth -${depth}, out: ${OUT_DIR}\n`
);

for (const u of limitedS) {
    const outPath = join(OUT_DIR, `${u.id}.txt`);
    const args = [MATCHUPS_JS, `-${depth}`];
    if (needsPreview(u)) {
        args.push('-p');
    }
    args.push('-i', u.id);
    const r = spawnSync(process.execPath, args, {
        cwd: __dirname,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024
    });
    const body = (r.stdout ?? '') + (r.stderr ?? '');
    writeFileSync(outPath, body, 'utf8');
    if (r.error) {
        console.error(`${u.id}: spawn error: ${r.error.message}`);
        continue;
    }
    if (r.status !== 0) {
        console.error(`${u.id}: matchups exited with code ${r.status} -> ${outPath}`);
    } else {
        const tag = needsPreview(u) ? ' (with -p)' : '';
        console.log(`${u.id} -> ${outPath}${tag}`);
    }
}
