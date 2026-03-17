/**
 * Shared Roster UI Component
 * Manages roster display, interaction, and storage across all roster-based pages.
 */

import {
    decodeRoster,
    getRosterFromUrl,
    generateShareUrl,
    copyToClipboard
} from './roster-share.js';
import { addLongPressListener } from './touch-utils.js';

const ROSTER_STORAGE_KEY = 'zzz-roster';
const ELEMENTS = ['fire', 'ice', 'electric', 'physical', 'ether'];

let allUnits = [];
let unitStates = {};
let rosterOpen = true;
let sharedRosterMode = false;

let _options = {
    containerSelector: '#roster-container',
    pageUrl: '',
    onStateChange: null,
    shareUrlGenerator: null,
    lockedUnits: []
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the roster component.
 * Loads game data, injects the roster HTML, and sets up all interactions.
 * @param {Object} opts
 * @param {string} opts.containerSelector - Where to inject roster HTML (default '#roster-container')
 * @param {string} opts.pageUrl - Current page filename for shared-roster-banner reset link
 * @param {Function} opts.onStateChange - Callback when roster state changes (for page-specific saves)
 * @param {Function} opts.shareUrlGenerator - Custom (unitStates, allUnits) => string; defaults to generateShareUrl
 * @param {string[]} opts.lockedUnits - Unit IDs that are force-owned and non-toggleable
 */
export async function initRoster(opts = {}) {
    _options = { ..._options, ...opts };

    const [unitsResponse, templateResponse] = await Promise.all([
        fetch('./data/units.json'),
        fetch('components/roster.html')
    ]);

    allUnits = await unitsResponse.json();

    const container = document.querySelector(_options.containerSelector);
    if (!container) {
        console.error(`Roster container "${_options.containerSelector}" not found`);
        return;
    }
    container.innerHTML = await templateResponse.text();

    const resetLink = document.getElementById('shared-reset-link');
    if (resetLink && _options.pageUrl) {
        resetLink.href = _options.pageUrl;
    }

    initializeUnitStates();
    loadRosterState();

    for (const lockedId of _options.lockedUnits) {
        if (unitStates[lockedId]) {
            unitStates[lockedId].owned = true;
        }
    }

    renderUnitSections();
    updateCounts();
    applySectionStates();
    setupEventListeners();
}

export function getUnitStates() { return unitStates; }
export function getAllUnits() { return allUnits; }
export function isSharedMode() { return sharedRosterMode; }

export function getOwnedUnits() {
    return allUnits.filter(u => unitStates[u.id]?.owned);
}

export function getUniversalUnitNames() {
    return allUnits
        .filter(u => { const s = unitStates[u.id]; return s && s.owned && s.universal; })
        .map(u => u.name);
}

export function getInitials(name) {
    return name.split(' ')
        .filter(word => word.length > 0)
        .map(word => word[0].toUpperCase())
        .slice(0, 2)
        .join('');
}

export function getUnitElement(unit) {
    return unit.tags.find(tag => ELEMENTS.includes(tag)) || 'unknown';
}

export function getCharacterImageUrl(unitId) {
    const unit = allUnits.find(u => u.id === unitId);
    return (unit && unit.image) || null;
}

// ============================================================================
// STATE INITIALIZATION
// ============================================================================

function initializeUnitStates() {
    for (const unit of allUnits) {
        if (!unitStates[unit.id]) {
            const isAvailable = unit.available !== false;
            const defaultOwned = isAvailable && (unit.rank === 'A' || (unit.rank === 'S' && !unit.limited));
            const defaultUniversal = isAvailable && unit.id === 'nicole';
            unitStates[unit.id] = {
                owned: defaultOwned,
                universal: defaultUniversal
            };
        }
    }
}

// ============================================================================
// STORAGE
// ============================================================================

function loadRosterState() {
    const rosterParam = getRosterFromUrl();
    if (rosterParam !== null) {
        sharedRosterMode = true;
        const sharedStates = decodeRoster(rosterParam, allUnits);
        if (sharedStates) {
            for (const unitId in sharedStates) {
                if (unitStates[unitId]) {
                    unitStates[unitId] = sharedStates[unitId];
                }
            }
        }
        showSharedRosterBanner();
    } else {
        sharedRosterMode = false;
        loadRosterFromLocalStorage();
    }
}

function loadRosterFromLocalStorage() {
    try {
        const saved = localStorage.getItem(ROSTER_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data.unitStates) {
                for (const unitId in data.unitStates) {
                    if (unitStates[unitId]) {
                        unitStates[unitId] = { ...unitStates[unitId], ...data.unitStates[unitId] };
                    }
                }
            }
            if (typeof data.rosterOpen === 'boolean') {
                rosterOpen = data.rosterOpen;
            }
        }
    } catch (e) {
        console.warn('Failed to load roster state:', e);
    }
}

function saveRosterToStorage() {
    if (sharedRosterMode) return;
    const data = { unitStates, rosterOpen };
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(data));
}

function notifyStateChange() {
    saveRosterToStorage();
    if (_options.onStateChange) {
        _options.onStateChange();
    }
}

function showSharedRosterBanner() {
    const banner = document.getElementById('shared-roster-banner');
    if (banner) banner.style.display = 'flex';
}

// ============================================================================
// RENDERING
// ============================================================================

function renderUnitSections() {
    const limitedS = allUnits.filter(u => u.rank === 'S' && u.limited);
    const standardS = allUnits.filter(u => u.rank === 'S' && !u.limited);
    const aRank = allUnits.filter(u => u.rank === 'A');

    renderUnitGrid('limited-s-grid', limitedS);
    renderUnitGrid('standard-s-grid', standardS);
    renderUnitGrid('a-rank-grid', aRank);
}

function renderUnitGrid(containerId, units) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = units.map(unit => createUnitCard(unit)).join('');

    container.querySelectorAll('.unit-card').forEach(card => {
        addLongPressListener(card, () => {
            const event = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            card.dispatchEvent(event);
        });
    });
}

function createUnitCard(unit) {
    const state = unitStates[unit.id];
    const initials = getInitials(unit.name);
    const element = getUnitElement(unit);
    const imageUrl = getCharacterImageUrl(unit.id);
    const isAvailable = unit.available !== false;
    const isLocked = _options.lockedUnits.includes(unit.id);

    const classes = ['unit-card'];
    classes.push(`element-${element}`);
    if (!isAvailable) classes.push('unavailable');
    if (isLocked) classes.push('starter-locked');
    if (!state.owned) classes.push('not-owned');
    if (state.universal) classes.push('universal');

    const avatarHtml = imageUrl
        ? `<img class="unit-avatar" src="${imageUrl}" alt="${unit.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="unit-initials" style="display:none">${initials}</span>`
        : `<span class="unit-initials">${initials}</span>`;

    let titleText;
    if (!isAvailable) titleText = `${unit.name} (Unavailable)`;
    else if (isLocked) titleText = `${unit.name} (Starter)`;
    else titleText = `${unit.name}${state.universal ? ' (Flex)' : ''}`;

    return `
        <button type="button" class="${classes.join(' ')}" 
                data-unit-id="${unit.id}" 
                data-element="${element}"
                title="${titleText}">
            ${avatarHtml}
            <span class="unit-name">${unit.name}</span>
            ${state.universal ? '<span class="flex-badge">FLEX</span>' : ''}
        </button>
    `;
}

function updateCounts() {
    updateCategoryCount('limited-s', u => u.rank === 'S' && u.limited);
    updateCategoryCount('standard-s', u => u.rank === 'S' && !u.limited);
    updateCategoryCount('a-rank', u => u.rank === 'A');
}

function updateCategoryCount(category, filterFn) {
    const units = allUnits.filter(filterFn);
    const availableUnits = units.filter(u => u.available !== false);
    const owned = availableUnits.filter(u => unitStates[u.id].owned).length;
    const total = availableUnits.length;

    const countEl = document.getElementById(`${category}-count`);
    if (countEl) countEl.textContent = `${owned}/${total}`;
}

function applySectionStates() {
    const rosterSection = document.getElementById('roster-section');
    if (rosterSection) rosterSection.open = rosterOpen;
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function setupEventListeners() {
    document.querySelectorAll('.unit-grid').forEach(grid => {
        grid.addEventListener('click', handleUnitClick);
        grid.addEventListener('contextmenu', handleUnitRightClick);
    });

    document.querySelectorAll('.roster-section .subtle-btn').forEach(btn => {
        btn.addEventListener('click', handleCategoryAction);
    });

    const rosterSection = document.getElementById('roster-section');
    if (rosterSection) {
        rosterSection.addEventListener('toggle', handleRosterToggle);
    }

    const shareBtn = document.getElementById('share-roster-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', handleShareClick);
    }

    document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
}

function handleUnitClick(e) {
    const card = e.target.closest('.unit-card');
    if (!card) return;
    if (card.classList.contains('unavailable')) return;
    if (card.classList.contains('starter-locked')) return;

    const flexBtn = document.querySelector('.mode-toggle-btn[data-mode="flex"]');
    const isFlexMode = flexBtn &&
                       flexBtn.classList.contains('active') &&
                       getComputedStyle(document.getElementById('mode-toggle-container')).display !== 'none';

    if (isFlexMode) {
        handleUnitRightClick(e);
        return;
    }

    const unitId = card.dataset.unitId;
    const state = unitStates[unitId];

    state.owned = !state.owned;
    if (!state.owned) state.universal = false;

    updateUnitCard(card, unitId);
    updateCounts();
    notifyStateChange();
}

function handleUnitRightClick(e) {
    e.preventDefault();
    const card = e.target.closest('.unit-card');
    if (!card) return;
    if (card.classList.contains('unavailable')) return;
    if (card.classList.contains('starter-locked')) return;

    const unitId = card.dataset.unitId;
    const state = unitStates[unitId];

    if (state.owned) {
        state.universal = !state.universal;
        updateUnitCard(card, unitId);
        notifyStateChange();
    }
}

function updateUnitCard(card, unitId) {
    const state = unitStates[unitId];
    const unit = allUnits.find(u => u.id === unitId);

    card.classList.toggle('not-owned', !state.owned);
    card.classList.toggle('universal', state.universal);

    const existingBadge = card.querySelector('.flex-badge');
    if (state.universal && !existingBadge) {
        const badge = document.createElement('span');
        badge.className = 'flex-badge';
        badge.textContent = 'FLEX';
        card.appendChild(badge);
    } else if (!state.universal && existingBadge) {
        existingBadge.remove();
    }

    card.title = unit ? `${unit.name}${state.universal ? ' (Flex)' : ''}` : '';
}

function handleCategoryAction(e) {
    const btn = e.target;
    const category = btn.dataset.category;
    const isSelectAll = btn.classList.contains('select-all');

    let filterFn;
    switch (category) {
        case 'limited-s':
            filterFn = u => u.rank === 'S' && u.limited;
            break;
        case 'standard-s':
            filterFn = u => u.rank === 'S' && !u.limited;
            break;
        case 'a-rank':
            filterFn = u => u.rank === 'A';
            break;
    }

    const units = allUnits.filter(filterFn);
    for (const unit of units) {
        if (unit.available === false) continue;
        if (_options.lockedUnits.includes(unit.id)) continue;

        unitStates[unit.id].owned = isSelectAll;
        if (!isSelectAll) unitStates[unit.id].universal = false;
    }

    for (const lockedId of _options.lockedUnits) {
        if (unitStates[lockedId]) unitStates[lockedId].owned = true;
    }

    const gridId = `${category}-grid`;
    renderUnitGrid(gridId, units);

    const grid = document.getElementById(gridId);
    grid.addEventListener('click', handleUnitClick);
    grid.addEventListener('contextmenu', handleUnitRightClick);

    updateCounts();
    notifyStateChange();
}

function handleRosterToggle(e) {
    rosterOpen = e.target.open;
    notifyStateChange();
}

async function handleShareClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const btn = document.getElementById('share-roster-btn');

    const shareUrl = _options.shareUrlGenerator
        ? _options.shareUrlGenerator(unitStates, allUnits)
        : generateShareUrl(unitStates, allUnits);

    const success = await copyToClipboard(shareUrl);

    if (success) {
        btn.classList.add('copied');
        const textEl = btn.querySelector('.share-text');
        const originalText = textEl.textContent;
        textEl.textContent = 'Copied!';
        showToast('Share link copied to clipboard!');
        setTimeout(() => {
            btn.classList.remove('copied');
            textEl.textContent = originalText;
        }, 2000);
    } else {
        showToast('Failed to copy link. Try again.', true);
    }
}

function showToast(message, isError = false) {
    const existingToast = document.querySelector('.share-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'share-toast' + (isError ? ' error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
