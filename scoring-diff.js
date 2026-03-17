#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseFile(filepath) {
    const content = fs.readFileSync(filepath, 'utf-8');
    const bosses = new Map();
    const bossOrder = [];
    const lines = content.split('\n');
    let currentBoss = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (i + 1 < lines.length && /^\s+Weak:/.test(lines[i + 1])) {
            currentBoss = line.trim();
            bosses.set(currentBoss, []);
            bossOrder.push(currentBoss);
            continue;
        }

        const m = line.match(/^\s+#\s*(\d+):\s*(?:✓\s*)?(.+?)\s*\((-?\d+\.?\d*)\)/);
        if (m && currentBoss) {
            bosses.get(currentBoss).push({
                rank: parseInt(m[1]),
                name: m[2].trim(),
                score: parseFloat(m[3])
            });
        }
    }

    return { bosses, bossOrder };
}

// ---------------------------------------------------------------------------
// LIS-based mover detection
//
// Identifies teams that genuinely changed their relative ordering, as opposed
// to teams whose absolute index shifted because some *other* team moved.
//
// Approach: compute the Longest Increasing Subsequence (LIS) of baseline
// positions when teams are arranged in modified order.  Teams in the LIS
// maintained their relative order ("stable backbone").  A team is a genuine
// mover if removing it does NOT decrease the LIS length — meaning it was
// never part of any maximum-length stable backbone.
// ---------------------------------------------------------------------------

function lisLength(arr) {
    const tails = [];
    for (const x of arr) {
        let lo = 0, hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (tails[mid] < x) lo = mid + 1;
            else hi = mid;
        }
        tails[lo] = x;
    }
    return tails.length;
}

function findMovers(baselineCommon, modifiedCommon) {
    if (modifiedCommon.length <= 1) return new Set();

    const bPos = new Map(baselineCommon.map((t, i) => [t.name, i]));
    const seq = modifiedCommon.map(t => bPos.get(t.name));
    const fullLen = lisLength(seq);

    const movers = new Set();
    for (let i = 0; i < seq.length; i++) {
        const reduced = seq.filter((_, j) => j !== i);
        if (lisLength(reduced) >= fullLen) {
            movers.add(modifiedCommon[i].name);
        }
    }
    return movers;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function compareBoss(baselineTeams, modifiedTeams) {
    const baselineByName = new Map(
        baselineTeams.map((t, i) => [t.name, { ...t, idx: i }])
    );
    const modifiedByName = new Map(
        modifiedTeams.map((t, i) => [t.name, { ...t, idx: i }])
    );

    const newTeams = modifiedTeams
        .filter(t => !baselineByName.has(t.name))
        .map(t => ({ name: t.name, rank: t.rank, score: t.score }));

    const disappearedTeams = baselineTeams
        .filter(t => !modifiedByName.has(t.name))
        .map(t => ({ name: t.name, rank: t.rank, score: t.score }));

    const baselineCommon = baselineTeams.filter(t => modifiedByName.has(t.name));
    const modifiedCommon = modifiedTeams.filter(t => baselineByName.has(t.name));

    const bCommonPos = new Map(baselineCommon.map((t, i) => [t.name, i]));
    const mCommonPos = new Map(modifiedCommon.map((t, i) => [t.name, i]));

    const movers = findMovers(baselineCommon, modifiedCommon);

    const reordered = [];
    for (const name of movers) {
        const bInfo = baselineByName.get(name);
        const mInfo = modifiedByName.get(name);
        const relDelta = mCommonPos.get(name) - bCommonPos.get(name);

        const threshold = Math.min(mInfo.rank, bInfo.rank) <= 20 ? 1 : 2;

        if (Math.abs(relDelta) >= threshold) {
            reordered.push({
                name,
                bRank: bInfo.rank,
                mRank: mInfo.rank,
                bScore: bInfo.score,
                mScore: mInfo.score,
                relDelta,
                direction: relDelta < 0 ? 'up' : 'down'
            });
        }
    }

    reordered.sort((a, b) => a.mRank - b.mRank);

    return { newTeams, disappearedTeams, reordered };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function formatChange(t) {
    const arrow = t.direction === 'up' ? '^' : 'v';
    const scoreDelta = t.mScore - t.bScore;
    const scoreStr = scoreDelta !== 0
        ? ` (${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)} pts)`
        : '';
    return `  ${arrow} #${t.bRank} -> #${t.mRank}: ${t.name}${scoreStr}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.error('Usage: node scoring-diff.js <baseline.txt> <modified.txt>');
    process.exit(1);
}

const [baselinePath, modifiedPath] = args;

if (!fs.existsSync(baselinePath)) {
    console.error(`File not found: ${baselinePath}`);
    process.exit(1);
}
if (!fs.existsSync(modifiedPath)) {
    console.error(`File not found: ${modifiedPath}`);
    process.exit(1);
}

const baseline = parseFile(baselinePath);
const modified = parseFile(modifiedPath);

const bossOrder = [...modified.bossOrder];
for (const boss of baseline.bossOrder) {
    if (!bossOrder.includes(boss)) bossOrder.push(boss);
}

console.log(`Scoring Diff: ${path.basename(baselinePath)} -> ${path.basename(modifiedPath)}`);
console.log('='.repeat(64));
console.log();

let totalChanges = 0;
let bossesWithChanges = 0;

for (const boss of bossOrder) {
    const bTeams = baseline.bosses.get(boss);
    const mTeams = modified.bosses.get(boss);

    if (!bTeams) {
        console.log(`${boss}: NEW BOSS (not in baseline)`);
        totalChanges++;
        bossesWithChanges++;
        console.log();
        continue;
    }
    if (!mTeams) {
        console.log(`${boss}: REMOVED BOSS (not in modified)`);
        totalChanges++;
        bossesWithChanges++;
        console.log();
        continue;
    }

    const { newTeams, disappearedTeams, reordered } = compareBoss(bTeams, mTeams);
    const count = newTeams.length + disappearedTeams.length + reordered.length;
    totalChanges += count;

    if (count === 0) {
        console.log(`${boss}: no material changes`);
        continue;
    }

    bossesWithChanges++;
    const parts = [];
    if (newTeams.length) parts.push(`${newTeams.length} new`);
    if (disappearedTeams.length) parts.push(`${disappearedTeams.length} gone`);
    if (reordered.length) parts.push(`${reordered.length} reordered`);

    console.log(`${boss}: ${count} material change${count !== 1 ? 's' : ''} (${parts.join(', ')})`);

    for (const t of newTeams) {
        console.log(`  NEW  #${t.rank}: ${t.name} (${t.score})`);
    }
    for (const t of disappearedTeams) {
        console.log(`  GONE was #${t.rank}: ${t.name} (${t.score})`);
    }
    for (const t of reordered) {
        console.log(formatChange(t));
    }
    console.log();
}

console.log('='.repeat(64));
console.log(
    `Total: ${totalChanges} material change${totalChanges !== 1 ? 's' : ''} ` +
    `across ${bossesWithChanges}/${bossOrder.length} bosses`
);
