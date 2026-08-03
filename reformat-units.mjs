import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync('app/public/data/units.json', 'utf8'));

function inlineArray(arr) {
    return '[' + arr.map(v => JSON.stringify(v)).join(', ') + ']';
}

function inlineObj(obj) {
    const pairs = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    return '{ ' + pairs.join(', ') + ' }';
}

function formatPseudoRole(arr) {
    if (arr.every(e => typeof e === 'string')) return inlineArray(arr);
    // contains conditional objects — expand each entry
    const lines = arr.map(e => '                ' + JSON.stringify(e));
    return '[\n' + lines.join(',\n') + '\n            ]';
}

function formatMechanics(mech) {
    const lines = [];
    const indent = '            ';
    for (const [k, v] of Object.entries(mech)) {
        if (k === 'pseudoRole') {
            lines.push(`${indent}"pseudoRole": ${formatPseudoRole(v)}`);
        } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            // buffs/debuffs/damage/scaling/utility — values may be scalars or conditional
            // { cases: [...] } specs; JSON.stringify renders either inline and valid.
            lines.push(`${indent}${JSON.stringify(k)}: ${inlineObj(v)}`);
        } else {
            lines.push(`${indent}${JSON.stringify(k)}: ${JSON.stringify(v)}`);
        }
    }
    return '{\n' + lines.join(',\n') + '\n        }';
}

function formatSynergy(s) {
    const u = '[' + (s.units || []).map(x => JSON.stringify(x)).join(', ') + ']';
    const t = '[' + (s.tags || []).map(x => JSON.stringify(x)).join(', ') + ']';
    const a = '[' + (s.avoid || []).map(x => JSON.stringify(x)).join(', ') + ']';
    return `{ "units": ${u}, "tags": ${t}, "avoid": ${a} }`;
}

function formatUnit(u) {
    const lines = [];
    const i = '        ';
    for (const [k, v] of Object.entries(u)) {
        if (k === 'tags' || k === 'join' || k === 'aliases') {
            lines.push(`${i}${JSON.stringify(k)}: ${inlineArray(v)}`);
        } else if (k === 'synergy') {
            lines.push(`${i}"synergy": ${formatSynergy(v)}`);
        } else if (k === 'mechanics') {
            if (Object.keys(v).length === 0) {
                lines.push(`${i}"mechanics": {}`);
            } else {
                lines.push(`${i}"mechanics": ${formatMechanics(v)}`);
            }
        } else {
            lines.push(`${i}${JSON.stringify(k)}: ${JSON.stringify(v)}`);
        }
    }
    return '    {\n' + lines.join(',\n') + '\n    }';
}

const result = '[\n' + data.map(formatUnit).join(',\n') + '\n]\n';
writeFileSync('app/public/data/units.json', result);
console.log(`Done. ${data.length} units, ${result.split('\n').length} lines.`);
