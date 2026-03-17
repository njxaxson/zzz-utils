/**
 * Data loading utilities for ZZZ CLI scripts.
 * Centralizes paths and JSON parsing for units, bosses, and roster.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DATA_DIR = join(ROOT_DIR, 'app', 'public', 'data');

export async function loadUnits() {
    return JSON.parse(await readFile(join(DATA_DIR, 'units.json'), 'utf-8'));
}

export async function loadBosses() {
    return JSON.parse(await readFile(join(DATA_DIR, 'bosses.json'), 'utf-8'));
}

export async function loadRoster() {
    return JSON.parse(await readFile(join(ROOT_DIR, 'roster.json'), 'utf-8'));
}

export async function loadAllData() {
    const [units, bosses, roster] = await Promise.all([
        loadUnits(),
        loadBosses(),
        loadRoster()
    ]);
    return { units, bosses, roster };
}
