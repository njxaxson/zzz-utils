/**
 * Agent Teams - Client-side Logic
 * Pick an agent (optionally up to two teammates); list the best roster teams
 * containing them, each with the bosses it matches up best against.
 */

import { getBossShill, getBossWeaknesses, resolveBossVariation } from '../common/team-scorer.js';
import { getStrengthRating } from '../common/strength-rating.js';
import { generateShareUrl } from '../common/roster-share.js';
import {
    initRoster, getUnitStates, getAllUnits, getCalibration, isSharedMode,
    getInitials, getUnitElement, getUniversalUnitNames
} from '../common/roster-ui.js';
import { getRosterUnits, buildRosterTeams, scoreCalibrated, requireCalibration } from '../common/team-pool.js';
import { createUnitCard, getWeaknessGradientClass } from '../common/team-card.js';
import { ELEMENTS } from '../common/constants.js';

// Constants

const PAGE_STORAGE_KEY = 'zzz-agent-detail';
const MAX_FOCUS = 3;
const MAX_ROWS = 5;
const TOP_PER_BOSS = 3;         // a team earns a boss tile by placing top-K among candidates for it
const MIN_BAND = 'Good';        // ...and reaching at least this strength band there
const FORCED_TILES = 3;
const MAX_TILES = 6;             // beyond this a team's boss list is noise
const DPS_TAGS = ['attack', 'anomaly', 'rupture', 'armorer'];
const BAND_ORDER = ['Excellent', 'Great', 'Good', 'OK', 'Tough', 'Risky', 'Bad'];

// State

let allBosses = [];
let focusIds = [];
let pickingSlot = null;
let pickerFilters = { rank: null, role: null, element: null };

// Data Loading

async function loadData() {
    try {
        const bossesResponse = await fetch('./data/bosses.json');
        allBosses = (await bossesResponse.json()).filter(b => b.available !== false);

        await initRoster({
            containerSelector: '#roster-container',
            pageUrl: 'agent-detail.html',
            onStateChange: () => { if (pickingSlot !== null) renderPicker(); },
            shareUrlGenerator: (unitStates, allUnits) => withAgentsParam(generateShareUrl(unitStates, allUnits)),
            collapseKnownRoster: true
        });

        focusIds = loadInitialFocus();
        setupEventListeners();
        renderSlots();
        // A deep link should land on results, not on an unpressed button.
        if (getActiveFocus().length > 0) runSearch({ scroll: false });
    } catch (error) {
        console.error('Failed to load data:', error);
        showError('Failed to load data. Refresh the page to try again.');
    }
}

function loadInitialFocus() {
    const knownIds = new Set(getAllUnits().map(u => u.id));
    const param = new URLSearchParams(window.location.search).get('agents');
    let ids = [];
    if (param !== null) {
        ids = param.split(',');
    } else if (!isSharedMode()) {
        try {
            ids = JSON.parse(localStorage.getItem(PAGE_STORAGE_KEY))?.focusIds ?? [];
        } catch (e) {
            ids = [];
        }
    }
    return [...new Set(ids.map(s => s.trim().toLowerCase()))]
        .filter(id => knownIds.has(id))
        .slice(0, MAX_FOCUS);
}

function saveFocus() {
    history.replaceState(null, '', withAgentsParam(window.location.href));
    if (isSharedMode()) return;
    try {
        localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify({ focusIds }));
    } catch (e) {
        console.warn('Failed to save agent detail settings:', e);
    }
}

// Sets `?agents=` to the focus selection, keeping commas readable.
function withAgentsParam(href) {
    const url = new URL(href);
    url.searchParams.delete('agents');
    if (focusIds.length === 0) return url.toString();
    url.search += `${url.search ? '&' : '?'}agents=${focusIds.join(',')}`;
    return url.toString();
}

// Roster helpers

function getUnit(id) {
    return getAllUnits().find(u => u.id === id);
}

function isOwned(id) {
    return !!getUnitStates()[id]?.owned;
}

function getActiveFocus() {
    return focusIds.filter(isOwned);
}

function teamHasAll(team, ids) {
    return ids.every(id => team.some(u => u.id === id));
}

function isFlex(id) {
    return !!getUnitStates()[id]?.universal;
}

// How many more teams containing the focus agents there would be if every non-FLEX
// support/defense focus agent were marked FLEX (FLEX suits a slot-filler, not a carry or stunner).
const NO_FLEX_TIP_TAGS = [...DPS_TAGS, 'stun'];
function getFlexTip(activeFocus, currentCount) {
    const notFlex = activeFocus.filter(id => !isFlex(id) && !NO_FLEX_TIP_TAGS.some(t => getUnit(id).tags.includes(t)));
    if (notFlex.length === 0) return null;
    const flexNames = [...getUniversalUnitNames(), ...notFlex.map(id => getUnit(id).name)];
    const units = getRosterUnits(getAllUnits(), getUnitStates());
    const withFlex = Object.values(buildRosterTeams(units, flexNames))
        .filter(team => teamHasAll(team, activeFocus)).length;
    const gain = withFlex - currentCount;
    return gain > 0 ? { names: notFlex.map(id => getUnit(id).name), gain } : null;
}

function createFlexTipHtml(tip) {
    if (!tip) return '';
    const who = joinNames(tip.names);
    const verb = tip.names.length === 1 ? "isn't" : "aren't";
    return `<div class="ad-tip"><strong>Tip:</strong> ${who} ${verb} FLEX. Marking ${who} FLEX in your roster adds <strong>${tip.gain}</strong> more ${tip.gain === 1 ? 'team' : 'teams'} to choose from. FLEX lets an agent complete any team, even without their additional ability. ${FLEX_HOW}</div>`;
}

const FLEX_HOW = 'Open Your Roster and right-click the agent, or use Mode: Mark Flex on mobile.';

function getRosterTeams() {
    return buildRosterTeams(getRosterUnits(getAllUnits(), getUnitStates()), getUniversalUnitNames());
}

// Bosses, one entry per enabled variation as well (mirrors Deadly Assault).
function getBossEntries() {
    const entries = [];
    for (const boss of allBosses) {
        entries.push({ key: boss.id, boss, name: boss.shortName || boss.name, image: boss.image });
        for (const [variationId, variation] of Object.entries(boss.variations || {})) {
            if (variation.enabled === false) continue;
            const resolved = resolveBossVariation(boss, variationId);
            const shill = getBossShill(resolved);
            const tag = shill ? shill.charAt(0).toUpperCase() + shill.slice(1) : variationId;
            entries.push({
                key: `${boss.id}:${variationId}`,
                boss: resolved,
                name: resolved.shortName || boss.shortName,
                variation: tag,
                image: boss.image
            });
        }
    }
    return entries;
}

// Scoring

function bandIndex(score, team) {
    return BAND_ORDER.indexOf(getStrengthRating(score, team).label);
}

// Best band first; within a band a boss that shills the team's archetype outranks a
// higher-scoring one that doesn't; then score.
function byMatchup(a, b) {
    return a.band - b.band || b.shillMatch - a.shillMatch || b.score - a.score;
}

function scoreEntry(team, entry, calibration, scoreOptions = {}) {
    const result = scoreCalibrated(team, entry.boss, scoreOptions, calibration);
    if (!result) return null;
    return {
        entry,
        score: result.score,
        band: bandIndex(result.score, team),
        shillMatch: !!result.archetype && getBossShill(entry.boss) === result.archetype,
        lenient: !!scoreOptions.lenient
    };
}

function computeResults(activeFocus) {
    const calibration = requireCalibration(getCalibration());
    const candidates = Object.entries(getRosterTeams())
        .filter(([, team]) => teamHasAll(team, activeFocus))
        .map(([label, team]) => ({ label, team, results: [] }));

    const flexTip = getFlexTip(activeFocus, candidates.length);
    if (candidates.length === 0) return { rows: [], forced: false, candidates: 0, flexTip };

    const bossEntries = getBossEntries();
    const minBand = BAND_ORDER.indexOf(MIN_BAND);
    const qualified = new Map();    // label -> matchups

    for (const entry of bossEntries) {
        const scored = [];
        for (const candidate of candidates) {
            const matchup = scoreEntry(candidate.team, entry, calibration);
            if (!matchup) continue;
            candidate.results.push(matchup);
            scored.push({ candidate, matchup });
        }
        // Rank within this boss only; scores are not comparable across bosses.
        scored.sort((a, b) => b.matchup.score - a.matchup.score);
        for (const { candidate, matchup } of scored.slice(0, TOP_PER_BOSS)) {
            if (matchup.band > minBand) continue;
            if (!qualified.has(candidate.label)) qualified.set(candidate.label, []);
            qualified.get(candidate.label).push(matchup);
        }
    }

    let rows = candidates
        .filter(c => qualified.has(c.label))
        .map(c => ({ ...c, tiles: qualified.get(c.label).sort(byMatchup) }));
    let forced = false;

    if (rows.length === 0) {
        // Nothing reaches Good: show the best available rather than nothing.
        forced = true;
        rows = candidates.map(c => ({ ...c, tiles: c.results.sort(byMatchup).slice(0, FORCED_TILES) }));
        if (rows.every(r => r.tiles.length === 0)) {
            for (const row of rows) {
                row.tiles = bossEntries
                    .map(entry => scoreEntry(row.team, entry, calibration, { lenient: true }))
                    .filter(Boolean)
                    .sort(byMatchup)
                    .slice(0, FORCED_TILES);
            }
        }
        rows = rows.filter(r => r.tiles.length > 0);
    }

    const bandCount = (row, band) => row.tiles.filter(t => t.band === band).length;
    rows.sort((a, b) =>
        a.tiles[0].band - b.tiles[0].band ||
        bandCount(b, b.tiles[0].band) - bandCount(a, a.tiles[0].band) ||
        b.tiles.length - a.tiles.length ||
        byMatchup(a.tiles[0], b.tiles[0]));

    rows = rows.slice(0, MAX_ROWS).map(r => ({ ...r, tiles: r.tiles.slice(0, MAX_TILES) }));
    return { rows, forced, candidates: candidates.length, flexTip };
}

// Explains an empty result: can these agents share a team at all?
function explainNoTeams(activeFocus) {
    const names = activeFocus.map(id => getUnit(id).name);
    const released = getAllUnits().filter(u => u.available !== false).map(u => ({ ...u, numericId: undefined }));
    const anyTeam = Object.values(buildRosterTeams(released))
        .filter(team => teamHasAll(team, activeFocus));

    if (anyTeam.length === 0) {
        return activeFocus.length === 1
            ? `${names[0]} can't form a legal team.`
            : `${joinNames(names)} can't be on the same team.`;
    }
    const missing = new Set();
    for (const team of anyTeam) {
        for (const u of team) if (!activeFocus.includes(u.id) && !isOwned(u.id)) missing.add(u.name);
    }
    const sample = [...missing].slice(0, 4);
    return `No one in your roster completes a team with ${joinNames(names)}.` +
        (sample.length ? ` Agents who would: ${joinNames(sample)}${missing.size > sample.length ? ', and others' : ''}.` : '');
}

function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Rendering: focus tiles

function renderSlots() {
    const tiles = focusIds.map((id, i) => createFocusTile(getUnit(id), i));
    if (focusIds.length < MAX_FOCUS) tiles.push(createAddTile(focusIds.length));
    document.getElementById('ad-slots').innerHTML = tiles.join('');
}

function createFocusTile(unit, index) {
    const element = getUnitElement(unit);
    const owned = isOwned(unit.id);
    const picking = pickingSlot === index ? ' picking' : '';
    const avatar = unit.image
        ? `<img class="ad-tile-img" src="${unit.image}" alt="">`
        : `<span class="ad-tile-initials">${getInitials(unit.name)}</span>`;
    return `
        <div class="ad-tile element-${element}${picking}" data-slot="${index}" role="button" tabindex="0" aria-label="Change ${unit.name}">
            <div class="ad-tile-avatar">
                ${avatar}
                ${owned ? '' : '<span class="ad-tile-badge">Not owned</span>'}
            </div>
            <div class="ad-tile-name">${unit.name}</div>
            <button type="button" class="ad-tile-clear" data-clear="${index}" aria-label="Remove ${unit.name}">✕</button>
        </div>
    `;
}

function createAddTile(index) {
    const first = index === 0;
    const picking = pickingSlot === index ? ' picking' : '';
    return `
        <div class="ad-tile ad-tile-add${first ? ' primary' : ''}${picking}" data-slot="${index}" role="button" tabindex="0">
            <div class="ad-tile-avatar"><span class="ad-tile-plus">+</span></div>
            <div class="ad-tile-name">${first ? 'Choose agent' : 'Add teammate'}</div>
        </div>
    `;
}

// Rendering: picker

const FILTER_GROUPS = [
    { key: 'rank', options: [['S', 'S-Rank'], ['A', 'A-Rank']] },
    { key: 'role', options: [['dps', 'DPS'], ['stun', 'Stun'], ['support', 'Support'], ['defense', 'Defense']] },
    { key: 'element', options: ELEMENTS.map(e => [e, e]) }
];

function renderPicker() {
    const picker = document.getElementById('ad-picker');
    picker.hidden = pickingSlot === null;
    if (picker.hidden) return;

    document.getElementById('ad-picker-title').textContent =
        pickingSlot === 0 && focusIds.length <= 1 ? 'Choose an agent' : 'Add a teammate';

    document.getElementById('ad-picker-filters').innerHTML = FILTER_GROUPS.map(group =>
        `<div class="ad-filter-group">${group.options.map(([value, label]) =>
            `<button type="button" class="ad-filter${group.key === 'element' ? ` element-${value}` : ''}${pickerFilters[group.key] === value ? ' active' : ''}" data-group="${group.key}" data-value="${value}">${label}</button>`
        ).join('')}</div>`
    ).join('');

    const query = document.getElementById('ad-picker-search').value.trim().toLowerCase();
    // The new pick must be able to team with everyone except the slot being replaced.
    const others = getActiveFocus().filter(id => id !== focusIds[pickingSlot]);
    const teams = Object.values(getRosterTeams()).filter(team => teamHasAll(team, others));
    const joinable = new Set(teams.flatMap(team => team.map(u => u.id)));

    const units = getAllUnits()
        .filter(u => isOwned(u.id) && !focusIds.includes(u.id))
        .filter(matchesFilters)
        .filter(u => !query || u.name.toLowerCase().includes(query) ||
            (u.aliases || []).some(a => a.toLowerCase().includes(query)));

    document.getElementById('ad-picker-grid').innerHTML = units.length
        ? units.map(u => createPickTile(u, joinable.has(u.id))).join('')
        : '<div class="ad-picker-empty">No matching agents in your roster.</div>';

    const hint = document.getElementById('ad-picker-hint');
    const faded = units.some(u => !joinable.has(u.id));
    hint.hidden = !faded;
    if (faded) {
        hint.innerHTML = others.length
            ? `<strong>Faded agents</strong> can't team with ${joinNames(others.map(id => getUnit(id).name))}. Marking either side FLEX lets them join. ${FLEX_HOW}`
            : `<strong>Faded agents</strong> can't form a team from your roster. Marking them FLEX lets them join. ${FLEX_HOW}`;
    }
}

function matchesFilters(unit) {
    const { rank, role, element } = pickerFilters;
    if (rank && unit.rank !== rank) return false;
    if (role === 'dps' && !DPS_TAGS.some(t => unit.tags.includes(t))) return false;
    if (role && role !== 'dps' && !unit.tags.includes(role)) return false;
    if (element && !unit.tags.includes(element)) return false;
    return true;
}

function createPickTile(unit, enabled) {
    const element = getUnitElement(unit);
    const avatar = unit.image
        ? `<img src="${unit.image}" alt="">`
        : `<span class="ad-pick-initials">${getInitials(unit.name)}</span>`;
    return `
        <button type="button" class="ad-pick element-${element}" data-pick="${unit.id}" ${enabled ? '' : 'disabled title="Can\'t team with your selection"'}>
            ${avatar}
            <span class="ad-pick-name">${unit.name}</span>
        </button>
    `;
}

// Rendering: results

function showError(message) {
    const el = document.getElementById('validation-errors');
    el.textContent = message;
    el.style.display = 'block';
}

function hideError() {
    document.getElementById('validation-errors').style.display = 'none';
}

function clearResults() {
    document.getElementById('ad-results').style.display = 'none';
}

function showResults(countText, bodyHtml, { scroll }) {
    const section = document.getElementById('ad-results');
    document.getElementById('ad-results-count').textContent = countText;
    document.getElementById('ad-results-body').innerHTML = bodyHtml;
    section.style.display = 'block';
    if (scroll) section.scrollIntoView({ behavior: 'smooth' });
}

function runSearch({ scroll = true } = {}) {
    hideError();
    const activeFocus = getActiveFocus();
    if (focusIds.length === 0) {
        showError('Choose an agent first.');
        return;
    }
    if (activeFocus.length === 0) {
        showError(`${joinNames(focusIds.map(id => getUnit(id).name))} ${focusIds.length === 1 ? "isn't" : "aren't"} in your roster - add them first.`);
        return;
    }

    const btn = document.getElementById('run-btn');
    btn.disabled = true;
    btn.textContent = 'Finding…';
    setTimeout(() => {
        try {
            renderResults(activeFocus, computeResults(activeFocus), scroll);
        } catch (error) {
            console.error('Agent detail scoring failed:', error);
            showError('Scoring failed. Refresh the page to try again.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Find Teams';
        }
    }, 50);
}

function renderResults(activeFocus, { rows, forced, candidates, flexTip }, scroll) {
    // Only worth suggesting FLEX when there aren't already a full list of Good teams.
    const tip = rows.length < MAX_ROWS || forced ? createFlexTipHtml(flexTip) : '';
    if (candidates === 0) {
        showResults('', `<div class="no-results"><p>${explainNoTeams(activeFocus)}</p></div>${tip}`, { scroll });
        return;
    }
    if (rows.length === 0) {
        showResults('', `<div class="no-results"><p>None of the ${candidates} possible teams can take on any boss.</p></div>`, { scroll });
        return;
    }

    const notice = forced
        ? '<div class="lenient-notice">No good matchups for this selection. Showing the best available.</div>'
        : '';
    const countText = forced
        ? `Best ${rows.length} of ${candidates} teams`
        : `Top ${rows.length} of ${candidates} teams`;
    showResults(countText, notice + tip + `<div class="ad-rows">${rows.map(createRow).join('')}</div>`, { scroll });
}

function createRow(row) {
    const best = getStrengthRating(row.tiles[0].score, row.team);
    const teamHtml = row.team.map(unit => createUnitCard(unit)).join('');
    return `
        <div class="ad-row ad-band-${best.label.toLowerCase()}">
            <div class="ad-row-team">${teamHtml}</div>
            <div class="ad-row-matchups">
                <div class="ad-bosses-label">Best against</div>
                <div class="ad-row-bosses">${row.tiles.map(tile => createBossTile(tile, row.team)).join('')}</div>
            </div>
        </div>
    `;
}

function createBossTile(tile, team) {
    const { entry } = tile;
    const rating = getStrengthRating(tile.score, team);
    const weaknessClass = getWeaknessGradientClass(getBossWeaknesses(entry.boss));
    const initials = getInitials(entry.name);
    const avatar = entry.image
        ? `<img class="boss-avatar-img${entry.variation ? ' boss-avatar-img--mirrored' : ''}" src="${entry.image}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="boss-initials" style="display:none">${initials}</span>`
        : `<span class="boss-initials">${initials}</span>`;
    const badge = entry.variation ? `<div class="boss-variation-badge ad-variation-badge">${entry.variation}</div>` : '';
    const title = `${entry.name}${entry.variation ? ` (${entry.variation})` : ''}: ${rating.label}${tile.lenient ? '*' : ''}`;
    return `
        <div class="result-boss-tile ad-boss-tile ${weaknessClass}" title="${title}">
            <div class="result-boss-avatar">${avatar}${badge}<span class="ad-boss-rating ${rating.cssClass}">${rating.label}${tile.lenient ? '*' : ''}</span></div>
            <div class="boss-name">${entry.name}</div>
        </div>
    `;
}

// Event Handling

function setupEventListeners() {
    const slots = document.getElementById('ad-slots');
    slots.addEventListener('click', handleSlotClick);
    slots.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.ad-tile')) {
            e.preventDefault();
            handleSlotClick(e);
        }
    });

    document.getElementById('ad-picker-grid').addEventListener('click', e => {
        const tile = e.target.closest('[data-pick]');
        if (!tile || tile.disabled) return;
        focusIds[pickingSlot] = tile.dataset.pick;
        focusIds = focusIds.filter(Boolean);
        closePicker();
        onFocusChange();
    });

    document.getElementById('ad-picker-filters').addEventListener('click', e => {
        const btn = e.target.closest('[data-group]');
        if (!btn) return;
        const { group, value } = btn.dataset;
        pickerFilters[group] = pickerFilters[group] === value ? null : value;
        renderPicker();
    });

    document.getElementById('ad-picker-search').addEventListener('input', renderPicker);
    document.getElementById('ad-picker-close').addEventListener('click', closePicker);
    document.getElementById('run-btn').addEventListener('click', () => runSearch());
}

function handleSlotClick(e) {
    const clear = e.target.closest('[data-clear]');
    if (clear) {
        e.stopPropagation();
        focusIds.splice(Number(clear.dataset.clear), 1);
        pickingSlot = null;
        renderPicker();
        onFocusChange();
        return;
    }
    const slot = e.target.closest('.ad-tile');
    if (!slot) return;
    const index = Number(slot.dataset.slot);
    if (pickingSlot === index) {
        closePicker();
        return;
    }
    pickingSlot = index;
    document.getElementById('ad-picker-search').value = '';
    renderPicker();
    renderSlots();
    document.getElementById('ad-picker-search').focus({ preventScroll: true });
}

function closePicker() {
    pickingSlot = null;
    renderPicker();
    renderSlots();
}

// Results describe the old selection, so they go away until Find Teams is pressed again.
function onFocusChange() {
    saveFocus();
    hideError();
    clearResults();
    renderSlots();
}

// Initialization

document.addEventListener('DOMContentLoaded', loadData);
