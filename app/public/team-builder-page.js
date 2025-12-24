/**
 * Team Builder Page - Client-side Logic
 * Generates and filters team combinations based on user roster and filters
 */

import { getTeams, sortTeamByRole, getTeamLabel } from './lib/team-builder.js';
import { scoreTeamForBoss, isDPS, isStun, isSupport, isDefense, getElement, ELEMENTS, DPS_ROLES } from './lib/team-scorer.js';
import { 
    encodeRoster, 
    decodeRoster, 
    getRosterFromUrl, 
    isSharedRosterMode, 
    generateShareUrl, 
    copyToClipboard 
} from './lib/roster-share.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const ROSTER_STORAGE_KEY = 'zzz-roster';
const FILTERS_STORAGE_KEY = 'zzz-team-builder-filters';
const MIN_TEAMS_TO_SHOW = 6;

// Elements and DPS types for grid
const GRID_ELEMENTS = ['fire', 'ice', 'electric', 'physical', 'ether'];
const GRID_DPS_TYPES = ['attack', 'anomaly', 'rupture'];

/**
 * Check if a team has a DPS unit that matches BOTH the target element AND DPS type.
 * e.g., for Ice Anomaly, we need a unit that is both ice element AND anomaly role.
 */
function teamHasMatchingDPS(team, targetElement, targetDpsType) {
    for (const unit of team) {
        const unitElement = getElement(unit);
        const unitDpsType = getDpsTypeForUnit(unit);
        
        if (unitElement === targetElement && unitDpsType === targetDpsType) {
            return true;
        }
    }
    return false;
}

/**
 * Create a synthetic boss for a specific element + DPS type combination.
 * The boss is weak to the target element, shills the target DPS type,
 * and is ANTI the other DPS types.
 * 
 * For attack: Also RESISTS other elements (want on-element stunners)
 * For anomaly: NO resistances (dual-element teams are common)
 * For rupture: NO resistances (double-support compositions are common)
 *              REQUIRES 2 defensive assists (favors Pan/Lucia over Astra)
 */
function createSyntheticBoss(element, dpsType) {
    // Anti the other two DPS types to pigeonhole teams into the correct cell
    const allDpsTypes = ['attack', 'anomaly', 'rupture'];
    const antiTypes = allDpsTypes.filter(t => t !== dpsType);
    
    // Only attack teams need element resistances (to favor on-element stunners)
    // Anomaly and rupture teams have more flexible compositions
    let resistedElements = [];
    if (dpsType === 'attack') {
        const allElements = ['fire', 'ice', 'electric', 'physical', 'ether'];
        resistedElements = allElements.filter(e => e !== element);
    }
    
    // Rupture teams typically need 2 defensive assists (Pan/Lucia style)
    const assistsRequired = dpsType === 'rupture' ? 2 : 0;
    
    return {
        name: `${element}-${dpsType}`,
        weaknesses: element ? [element] : [],
        resistances: resistedElements,
        shill: dpsType,
        anti: antiTypes,
        favored: [],
        assists: assistsRequired
    };
}

// ============================================================================
// STATE
// ============================================================================

let allUnits = [];
let characterImages = {};

// Unit states: { unitId: { owned: boolean, universal: boolean } }
let unitStates = {};

// Section collapse states
let rosterOpen = true;
let filtersOpen = true;

// Shared roster mode - when true, localStorage is NOT used
let sharedRosterMode = false;

// Filter state
let filters = {
    elements: [],         // Array of selected elements
    dpsRoles: [],         // Array of selected DPS roles
    minSRank: 0,          // Minimum S-rank count
    maxTier: 99,          // Maximum unit tier allowed
    mustInclude: [],      // Unit IDs that must be included
    exclude: []           // Unit IDs to exclude
};

// Pagination
let currentPage = 0;
let filteredTeams = [];

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadData() {
    try {
        const [unitsResponse, imagesResponse] = await Promise.all([
            fetch('./data/units.json'),
            fetch('./data/character-images.json')
        ]);
        
        allUnits = await unitsResponse.json();
        characterImages = await imagesResponse.json();
        
        initializeUnitStates();
        loadFromStorage();
        renderUI();
    } catch (error) {
        console.error('Failed to load data:', error);
        showError('Failed to load game data. Please refresh the page.');
    }
}

function initializeUnitStates() {
    for (const unit of allUnits) {
        if (!unitStates[unit.id]) {
            // Default: Limited S-ranks are NOT owned, others ARE owned
            const defaultOwned = unit.rank === 'A' || (unit.rank === 'S' && !unit.limited);
            unitStates[unit.id] = {
                owned: defaultOwned,
                universal: false
            };
        }
    }
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================

function saveRosterToStorage() {
    // Do NOT save to localStorage when viewing a shared roster
    if (sharedRosterMode) {
        return;
    }
    
    const data = {
        unitStates,
        rosterOpen,
        filtersOpen
    };
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(data));
}

function saveFiltersToStorage() {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
}

function loadFromStorage() {
    // Check for shared roster in URL parameter first
    const rosterParam = getRosterFromUrl();
    if (rosterParam !== null) {
        sharedRosterMode = true;
        
        // Decode the roster from URL
        const sharedStates = decodeRoster(rosterParam, allUnits);
        if (sharedStates) {
            // Apply the shared roster states
            for (const unitId in sharedStates) {
                if (unitStates[unitId]) {
                    unitStates[unitId] = sharedStates[unitId];
                }
            }
        } else {
            console.warn('Failed to decode shared roster, falling back to defaults');
        }
        
        // Show the shared roster banner
        showSharedRosterBanner();
        
        // Still load filters from localStorage (those are personal preference)
        loadFiltersFromStorage();
        return;
    }
    
    // Normal mode: load from localStorage
    sharedRosterMode = false;
    
    // Load roster (shared with other pages)
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
            
            if (typeof data.filtersOpen === 'boolean') {
                filtersOpen = data.filtersOpen;
            }
        }
        
        // Migration: check if old storage key has data we should use
        const oldSaved = localStorage.getItem('zzz-deadly-assault');
        if (oldSaved && !saved) {
            const oldData = JSON.parse(oldSaved);
            if (oldData.unitStates) {
                for (const unitId in oldData.unitStates) {
                    if (unitStates[unitId]) {
                        unitStates[unitId] = { ...unitStates[unitId], ...oldData.unitStates[unitId] };
                    }
                }
            }
            saveRosterToStorage();
        }
    } catch (e) {
        console.warn('Failed to load roster state:', e);
    }
    
    loadFiltersFromStorage();
}

function loadFiltersFromStorage() {
    // Load filters (page-specific)
    try {
        const savedFilters = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (savedFilters) {
            const loadedFilters = JSON.parse(savedFilters);
            filters = { ...filters, ...loadedFilters };
        }
    } catch (e) {
        console.warn('Failed to load filter state:', e);
    }
}

function showSharedRosterBanner() {
    const banner = document.getElementById('shared-roster-banner');
    if (banner) {
        banner.style.display = 'flex';
    }
}

// ============================================================================
// UI RENDERING
// ============================================================================

function renderUI() {
    renderUnitSections();
    renderMustIncludeDropdown();
    renderExcludeDropdown();
    updateCounts();
    applySectionStates();
    applyFilterStates();
    setupEventListeners();
}

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
    container.innerHTML = units.map(unit => createUnitCard(unit)).join('');
}

function createUnitCard(unit) {
    const state = unitStates[unit.id];
    const initials = getInitials(unit.name);
    const element = getUnitElement(unit);
    const imageUrl = getCharacterImageUrl(unit.id);
    
    const classes = ['unit-card'];
    classes.push(`element-${element}`);
    if (!state.owned) classes.push('not-owned');
    if (state.universal) classes.push('universal');
    
    const avatarHtml = imageUrl 
        ? `<img class="unit-avatar" src="${imageUrl}" alt="${unit.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="unit-initials" style="display:none">${initials}</span>`
        : `<span class="unit-initials">${initials}</span>`;
    
    return `
        <button type="button" class="${classes.join(' ')}" 
                data-unit-id="${unit.id}" 
                data-element="${element}"
                title="${unit.name}${state.universal ? ' (Flex)' : ''}">
            ${avatarHtml}
            <span class="unit-name">${unit.name}</span>
            ${state.universal ? '<span class="flex-badge">FLEX</span>' : ''}
        </button>
    `;
}

function renderMustIncludeDropdown() {
    const menu = document.getElementById('must-include-menu');
    const itemsContainer = menu.querySelector('.dropdown-items');
    itemsContainer.innerHTML = allUnits
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(unit => {
            const checked = filters.mustInclude.includes(unit.id) ? 'checked' : '';
            const roles = unit.tags.filter(t => ['stun', 'attack', 'anomaly', 'rupture', 'support', 'defense'].includes(t));
            return `
                <label class="dropdown-item" data-name="${unit.name.toLowerCase()}" data-roles="${roles.join(',')}">
                    <input type="checkbox" value="${unit.id}" ${checked}>
                    <span>${unit.name}</span>
                </label>
            `;
        }).join('');
}

function renderExcludeDropdown() {
    const menu = document.getElementById('exclude-menu');
    const itemsContainer = menu.querySelector('.dropdown-items');
    itemsContainer.innerHTML = allUnits
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(unit => {
            const checked = filters.exclude.includes(unit.id) ? 'checked' : '';
            const tier = unit.tier !== undefined ? unit.tier : 0;
            return `
                <label class="dropdown-item" data-name="${unit.name.toLowerCase()}" data-tier="${tier}">
                    <input type="checkbox" value="${unit.id}" ${checked}>
                    <span>${unit.name}</span>
                </label>
            `;
        }).join('');
}

function getInitials(name) {
    return name.split(' ')
        .filter(word => word.length > 0)
        .map(word => word[0].toUpperCase())
        .slice(0, 2)
        .join('');
}

function getUnitElement(unit) {
    const elements = ['fire', 'ice', 'electric', 'physical', 'ether'];
    return unit.tags.find(tag => elements.includes(tag)) || 'unknown';
}

function getCharacterImageUrl(unitId) {
    return characterImages[unitId] || null;
}

function updateCounts() {
    updateCategoryCount('limited-s', u => u.rank === 'S' && u.limited);
    updateCategoryCount('standard-s', u => u.rank === 'S' && !u.limited);
    updateCategoryCount('a-rank', u => u.rank === 'A');
}

function updateCategoryCount(category, filterFn) {
    const units = allUnits.filter(filterFn);
    const owned = units.filter(u => unitStates[u.id].owned).length;
    const total = units.length;
    
    const countEl = document.getElementById(`${category}-count`);
    if (countEl) {
        countEl.textContent = `${owned}/${total}`;
    }
}

function applySectionStates() {
    const rosterSection = document.getElementById('roster-section');
    if (rosterSection) {
        rosterSection.open = rosterOpen;
    }
    
    const filterSection = document.getElementById('filter-section');
    if (filterSection) {
        filterSection.open = filtersOpen;
    }
}

function applyFilterStates() {
    // Elements dropdown
    const elementsDropdown = document.querySelector('[data-filter="elements"]');
    if (elementsDropdown) {
        elementsDropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = filters.elements.includes(cb.value);
        });
        updateDropdownText(elementsDropdown, filters.elements, 'Any element');
    }
    
    // DPS roles dropdown
    const dpsDropdown = document.querySelector('[data-filter="dps-role"]');
    if (dpsDropdown) {
        dpsDropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = filters.dpsRoles.includes(cb.value);
        });
        updateDropdownText(dpsDropdown, filters.dpsRoles, 'Any DPS');
    }
    
    // Min S-Rank buttons
    const minSRankGroup = document.querySelector('[data-filter="min-s-rank"]');
    if (minSRankGroup) {
        minSRankGroup.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.value) === filters.minSRank);
        });
    }
    
    // Max Tier buttons
    const maxTierGroup = document.querySelector('[data-filter="max-tier"]');
    if (maxTierGroup) {
        maxTierGroup.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.value) === filters.maxTier);
        });
    }
    
    // Must Include dropdown
    const mustIncludeDropdown = document.querySelector('[data-filter="must-include"]');
    if (mustIncludeDropdown) {
        const names = filters.mustInclude.map(id => {
            const unit = allUnits.find(u => u.id === id);
            return unit ? unit.name : id;
        });
        updateDropdownText(mustIncludeDropdown, names, 'No specific units');
    }
    
    // Exclude dropdown
    const excludeDropdown = document.querySelector('[data-filter="exclude"]');
    if (excludeDropdown) {
        const names = filters.exclude.map(id => {
            const unit = allUnits.find(u => u.id === id);
            return unit ? unit.name : id;
        });
        updateDropdownText(excludeDropdown, names, 'No exclusions');
    }
}

function updateDropdownText(dropdown, selected, defaultText) {
    const textEl = dropdown.querySelector('.dropdown-text');
    if (selected.length === 0) {
        textEl.textContent = defaultText;
    } else if (selected.length <= 2) {
        textEl.textContent = selected.join(', ');
    } else {
        textEl.textContent = `${selected.length} selected`;
    }
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function setupEventListeners() {
    // Unit card interactions
    document.querySelectorAll('.unit-grid').forEach(grid => {
        grid.addEventListener('click', handleUnitClick);
        grid.addEventListener('contextmenu', handleUnitRightClick);
    });
    
    // Subsection actions (All / None)
    document.querySelectorAll('.subtle-btn').forEach(btn => {
        btn.addEventListener('click', handleCategoryAction);
    });
    
    // Roster section toggle tracking
    const rosterSection = document.getElementById('roster-section');
    if (rosterSection) {
        rosterSection.addEventListener('toggle', handleRosterToggle);
    }
    
    // Filter section toggle tracking
    const filterSection = document.getElementById('filter-section');
    if (filterSection) {
        filterSection.addEventListener('toggle', handleFilterToggle);
    }
    
    // Multi-select dropdowns
    document.querySelectorAll('.multi-dropdown').forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown(dropdown);
        });
        
        // Use event delegation for checkboxes (since some are dynamically rendered)
        const menu = dropdown.querySelector('.dropdown-menu');
        menu.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                handleDropdownChange(dropdown);
            }
        });
        
        // Search input handling
        const searchInput = dropdown.querySelector('.dropdown-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => applyDropdownFilters(dropdown));
            searchInput.addEventListener('click', (e) => e.stopPropagation());
        }
        
        // Quick filter buttons
        dropdown.querySelectorAll('.quick-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.classList.toggle('active');
                applyDropdownFilters(dropdown);
            });
        });
        
        // Select All/None buttons
        const selectAllBtn = dropdown.querySelector('.select-all-visible');
        const selectNoneBtn = dropdown.querySelector('.select-none-visible');
        
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectVisibleItems(dropdown, true);
            });
        }
        
        if (selectNoneBtn) {
            selectNoneBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectVisibleItems(dropdown, false);
            });
        }
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.multi-dropdown')) {
            closeAllDropdowns();
        }
    });
    
    // Button groups (single select)
    document.querySelectorAll('.button-group').forEach(group => {
        group.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => handleButtonGroupClick(group, btn));
        });
    });
    
    // Action buttons
    document.getElementById('build-btn').addEventListener('click', buildTeams);
    document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
    
    // Share button
    const shareBtn = document.getElementById('share-roster-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', handleShareClick);
    }
    
    // Pagination
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
}

// ============================================================================
// SHARE FUNCTIONALITY
// ============================================================================

async function handleShareClick(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const btn = document.getElementById('share-roster-btn');
    
    // Generate the share URL
    const shareUrl = generateShareUrl(unitStates, allUnits);
    
    // Copy to clipboard
    const success = await copyToClipboard(shareUrl);
    
    if (success) {
        // Show success state on button
        btn.classList.add('copied');
        const textEl = btn.querySelector('.share-text');
        const originalText = textEl.textContent;
        textEl.textContent = 'Copied!';
        
        // Show toast
        showToast('Share link copied to clipboard!');
        
        // Reset button after delay
        setTimeout(() => {
            btn.classList.remove('copied');
            textEl.textContent = originalText;
        }, 2000);
    } else {
        showToast('Failed to copy link. Try again.', true);
    }
}

function showToast(message, isError = false) {
    // Remove any existing toast
    const existingToast = document.querySelector('.share-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'share-toast' + (isError ? ' error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });
    
    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function handleUnitClick(e) {
    const card = e.target.closest('.unit-card');
    if (!card) return;
    
    const unitId = card.dataset.unitId;
    const state = unitStates[unitId];
    
    state.owned = !state.owned;
    if (!state.owned) {
        state.universal = false;
    }
    
    updateUnitCard(card, unitId);
    updateCounts();
    saveRosterToStorage();
}

function handleUnitRightClick(e) {
    e.preventDefault();
    const card = e.target.closest('.unit-card');
    if (!card) return;
    
    const unitId = card.dataset.unitId;
    const state = unitStates[unitId];
    
    if (state.owned) {
        state.universal = !state.universal;
        updateUnitCard(card, unitId);
        saveRosterToStorage();
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
        unitStates[unit.id].owned = isSelectAll;
        if (!isSelectAll) {
            unitStates[unit.id].universal = false;
        }
    }
    
    const gridId = `${category}-grid`;
    renderUnitGrid(gridId, units);
    
    const grid = document.getElementById(gridId);
    grid.addEventListener('click', handleUnitClick);
    grid.addEventListener('contextmenu', handleUnitRightClick);
    
    updateCounts();
    saveRosterToStorage();
}

function handleRosterToggle(e) {
    rosterOpen = e.target.open;
    saveRosterToStorage();
}

function handleFilterToggle(e) {
    filtersOpen = e.target.open;
    saveRosterToStorage();
}

function toggleDropdown(dropdown) {
    const wasOpen = dropdown.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) {
        dropdown.classList.add('open');
        // Focus search input if present
        const searchInput = dropdown.querySelector('.dropdown-search-input');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 50);
        }
    }
}

function closeAllDropdowns() {
    document.querySelectorAll('.multi-dropdown.open').forEach(dd => {
        dd.classList.remove('open');
        // Clear search and quick filters when closing
        const searchInput = dd.querySelector('.dropdown-search-input');
        if (searchInput) {
            searchInput.value = '';
        }
        dd.querySelectorAll('.quick-filter-btn.active').forEach(btn => {
            btn.classList.remove('active');
        });
        // Show all items
        dd.querySelectorAll('.dropdown-item').forEach(item => {
            item.classList.remove('hidden');
        });
    });
}

function selectVisibleItems(dropdown, selectAll) {
    const visibleItems = dropdown.querySelectorAll('.dropdown-item:not(.hidden)');
    
    visibleItems.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = selectAll;
        }
    });
    
    // Trigger the filter change handler
    handleDropdownChange(dropdown);
}

function applyDropdownFilters(dropdown) {
    const searchInput = dropdown.querySelector('.dropdown-search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    // Get active quick filters
    const activeRoleFilters = [];
    const activeTierFilters = [];
    
    dropdown.querySelectorAll('.quick-filter-btn.active').forEach(btn => {
        if (btn.dataset.roleFilter) {
            activeRoleFilters.push(...btn.dataset.roleFilter.split(','));
        }
        if (btn.dataset.tierFilter) {
            activeTierFilters.push(parseFloat(btn.dataset.tierFilter));
        }
    });
    
    const items = dropdown.querySelectorAll('.dropdown-item[data-name]');
    
    items.forEach(item => {
        const name = item.dataset.name || '';
        let matchesSearch = query === '' || name.includes(query);
        let matchesQuickFilter = true;
        
        // Check role filters (OR logic - match any active role)
        if (activeRoleFilters.length > 0) {
            const itemRoles = (item.dataset.roles || '').split(',').filter(r => r);
            matchesQuickFilter = activeRoleFilters.some(role => itemRoles.includes(role));
        }
        
        // Check tier filters (OR logic - match any active tier)
        if (activeTierFilters.length > 0 && item.dataset.tier !== undefined) {
            const itemTier = parseFloat(item.dataset.tier);
            // Match if tier is >= the filter tier (e.g., Tier 2 shows units with tier 2.0, 2.5, 3.0, etc.)
            matchesQuickFilter = activeTierFilters.some(tier => itemTier >= tier && itemTier < tier + 1);
        }
        
        if (matchesSearch && matchesQuickFilter) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
}

function handleDropdownChange(dropdown) {
    const filterType = dropdown.dataset.filter;
    const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]:checked');
    const values = Array.from(checkboxes).map(cb => cb.value);
    
    switch (filterType) {
        case 'elements':
            filters.elements = values;
            updateDropdownText(dropdown, values, 'Any element');
            break;
        case 'dps-role':
            filters.dpsRoles = values;
            updateDropdownText(dropdown, values, 'Any DPS');
            break;
        case 'must-include':
            filters.mustInclude = values;
            const mustIncludeNames = values.map(id => {
                const unit = allUnits.find(u => u.id === id);
                return unit ? unit.name : id;
            });
            updateDropdownText(dropdown, mustIncludeNames, 'No specific units');
            break;
        case 'exclude':
            filters.exclude = values;
            const excludeNames = values.map(id => {
                const unit = allUnits.find(u => u.id === id);
                return unit ? unit.name : id;
            });
            updateDropdownText(dropdown, excludeNames, 'No exclusions');
            break;
    }
    
    saveFiltersToStorage();
}

function handleButtonGroupClick(group, clickedBtn) {
    const filterType = group.dataset.filter;
    const value = parseFloat(clickedBtn.dataset.value);
    
    group.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    clickedBtn.classList.add('active');
    
    switch (filterType) {
        case 'min-s-rank':
            filters.minSRank = value;
            break;
        case 'max-tier':
            filters.maxTier = value;
            break;
    }
    
    saveFiltersToStorage();
}

function clearFilters() {
    filters = {
        elements: [],
        dpsRoles: [],
        minSRank: 0,
        maxTier: 99,
        mustInclude: [],
        exclude: []
    };
    
    // Reset UI
    document.querySelectorAll('.multi-dropdown input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    document.querySelectorAll('.button-group').forEach(group => {
        const buttons = group.querySelectorAll('.filter-btn');
        buttons.forEach((btn, i) => {
            btn.classList.toggle('active', i === 0);
        });
    });
    
    applyFilterStates();
    saveFiltersToStorage();
    
    // Clear results
    document.getElementById('results-section').style.display = 'none';
}

// ============================================================================
// TEAM BUILDING
// ============================================================================

function buildTeams() {
    hideValidationErrors();
    
    // Get available units
    const availableUnits = getAvailableUnits();
    
    if (availableUnits.length < 3) {
        showValidationErrors(['Need at least 3 units in your roster to build teams.']);
        return;
    }
    
    // Disable button while processing
    const btn = document.getElementById('build-btn');
    btn.disabled = true;
    btn.textContent = 'BUILDING...';
    
    setTimeout(() => {
        try {
            // Generate all valid teams
            const allTeams = getTeams(availableUnits);
            
            // Convert to array and filter to 3-person teams only
            let teams = Object.entries(allTeams)
                .filter(([label, team]) => team.length === 3)
                .map(([label, team]) => ({ label, team }));
            
            // Apply user filters first
            teams = applyUserFilters(teams);
            
            // Select best teams using synthetic boss scoring
            filteredTeams = selectBestTeams(teams, availableUnits);
            
            // Reset pagination and display
            currentPage = 0;
            displayResults();
        } catch (error) {
            console.error('Team building failed:', error);
            showError('Failed to build teams. Please try again.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Build Teams';
        }
    }, 50);
}

function getAvailableUnits() {
    return allUnits.filter(unit => {
        const state = unitStates[unit.id];
        return state.owned;
    }).map(unit => ({
        ...unit,
        numericId: undefined
    }));
}

function applyUserFilters(teams) {
    return teams.filter(({ label, team }) => {
        // Filter: Element (at least 2 units with selected element)
        if (filters.elements.length > 0) {
            const hasMatchingElement = filters.elements.some(element => {
                const count = team.filter(u => u.tags.includes(element)).length;
                return count >= 2;
            });
            if (!hasMatchingElement) return false;
        }
        
        // Filter: DPS Role (at least one unit with selected role)
        if (filters.dpsRoles.length > 0) {
            const hasDpsRole = team.some(u => 
                filters.dpsRoles.some(role => u.tags.includes(role))
            );
            if (!hasDpsRole) return false;
        }
        
        // Filter: Minimum S-Ranks
        if (filters.minSRank > 0) {
            const sRankCount = team.filter(u => u.rank === 'S').length;
            if (sRankCount < filters.minSRank) return false;
        }
        
        // Filter: Maximum Tier
        if (filters.maxTier < 99) {
            const hasHighTier = team.some(u => u.tier > filters.maxTier);
            if (hasHighTier) return false;
        }
        
        // Filter: Must Include (at least one of the selected units)
        if (filters.mustInclude.length > 0) {
            const hasRequiredUnit = team.some(u => 
                filters.mustInclude.includes(u.id)
            );
            if (!hasRequiredUnit) return false;
        }
        
        // Filter: Exclude (none of the excluded units)
        if (filters.exclude.length > 0) {
            const hasExcludedUnit = team.some(u => 
                filters.exclude.includes(u.id)
            );
            if (hasExcludedUnit) return false;
        }
        
        return true;
    });
}

function selectBestTeams(teams, availableUnits) {
    if (teams.length === 0) return [];
    
    // Determine available elements and DPS types based on filters and roster
    const availableElements = getAvailableElements(availableUnits);
    const availableDpsTypes = getAvailableDpsTypes(availableUnits);
    
    // Build grid: element -> dpsType -> best team
    const grid = {};
    const allGridTeams = new Map(); // label -> teamData (to avoid duplicates)
    
    // Step 1: Populate the grid with best team for each (element, dpsType) cell
    for (const element of availableElements) {
        grid[element] = {};
        
        for (const dpsType of availableDpsTypes) {
            const boss = createSyntheticBoss(element, dpsType);
            
            // Filter to teams that have a DPS unit matching BOTH element AND DPS type
            // e.g., Ice Anomaly cell needs a unit that is BOTH ice AND anomaly
            const matchingTeams = teams.filter(({ team }) => {
                return teamHasMatchingDPS(team, element, dpsType);
            });
            
            // Score matching teams against this specific boss
            const scoredTeams = matchingTeams.map(({ label, team }) => {
                const score = scoreTeamForBoss(team, boss, { lenient: true });
                return { label, team, score, element, dpsType };
            }).filter(t => t.score > 0)
              .sort((a, b) => b.score - a.score);
            
            // Keep only the BEST team per cell (to avoid clutter)
            if (scoredTeams.length > 0) {
                grid[element][dpsType] = [scoredTeams[0]];
            }
        }
    }
    
    // Step 2: Collect unique teams from grid
    const candidateTeams = new Map(); // label -> teamData
    
    for (const element of Object.keys(grid)) {
        for (const dpsType of Object.keys(grid[element])) {
            const cellTeams = grid[element][dpsType];
            if (cellTeams) {
                for (const teamData of cellTeams) {
                    if (!candidateTeams.has(teamData.label)) {
                        candidateTeams.set(teamData.label, teamData);
                    }
                }
            }
        }
    }
    
    // Step 3: Remove teams that are A-rank substitutions of better teams
    const teamsToRemove = new Set();
    const candidateList = Array.from(candidateTeams.values());
    
    for (let i = 0; i < candidateList.length; i++) {
        for (let j = 0; j < candidateList.length; j++) {
            if (i === j) continue;
            
            const teamA = candidateList[i];
            const teamB = candidateList[j];
            
            // Check if teamA is an inferior version of teamB
            if (isInferiorSubstitution(teamA.team, teamB.team)) {
                teamsToRemove.add(teamA.label);
            }
        }
    }
    
    // Remove inferior teams
    for (const label of teamsToRemove) {
        candidateTeams.delete(label);
    }
    
    // Step 4: Track S-rank coverage from remaining teams
    const coveredSRanks = new Set();
    for (const teamData of candidateTeams.values()) {
        teamData.team.forEach(u => {
            if (u.rank === 'S') coveredSRanks.add(u.id);
        });
    }
    
    // Step 5: Add teams for uncovered S-ranks (but avoid redundant coverage)
    const eligibleSRanks = getEligibleSRanks(teams, availableUnits);
    
    for (const sRankId of eligibleSRanks) {
        if (coveredSRanks.has(sRankId)) continue;
        
        const sRankUnit = availableUnits.find(u => u.id === sRankId);
        if (!sRankUnit) continue;
        
        const sRankElement = getElement(sRankUnit);
        const sRankDpsType = getDpsTypeForUnit(sRankUnit);
        const boss = createSyntheticBoss(sRankElement, sRankDpsType || 'attack');
        
        // Find teams containing this S-rank
        const teamsWithSRank = teams.filter(({ team }) => 
            team.some(u => u.id === sRankId)
        );
        
        const scoredTeams = teamsWithSRank.map(({ label, team }) => {
            const score = scoreTeamForBoss(team, boss, { lenient: true });
            return { label, team, score, element: sRankElement, dpsType: sRankDpsType };
        }).filter(t => t.score > 0)
          .sort((a, b) => b.score - a.score);
        
        // Find a team that's not already in our list and not an inferior substitution
        for (const teamData of scoredTeams) {
            if (candidateTeams.has(teamData.label)) continue;
            
            // Check if this would be an inferior substitution
            let isInferior = false;
            for (const existingTeam of candidateTeams.values()) {
                if (isInferiorSubstitution(teamData.team, existingTeam.team)) {
                    isInferior = true;
                    break;
                }
            }
            
            if (!isInferior) {
                candidateTeams.set(teamData.label, teamData);
                teamData.team.forEach(u => {
                    if (u.rank === 'S') coveredSRanks.add(u.id);
                });
                break;
            }
        }
    }
    
    // Step 6: Ensure minimum team count
    if (candidateTeams.size < MIN_TEAMS_TO_SHOW) {
        for (const element of availableElements) {
            if (candidateTeams.size >= MIN_TEAMS_TO_SHOW) break;
            
            for (const dpsType of availableDpsTypes) {
                if (candidateTeams.size >= MIN_TEAMS_TO_SHOW) break;
                
                const boss = createSyntheticBoss(element, dpsType);
                
                // Filter to teams that have a DPS unit matching both element and DPS type
                const matchingTeams = teams.filter(({ team }) => {
                    return teamHasMatchingDPS(team, element, dpsType);
                });
                
                const scoredTeams = matchingTeams.map(({ label, team }) => {
                    const score = scoreTeamForBoss(team, boss, { lenient: true });
                    return { label, team, score, element, dpsType };
                }).filter(t => t.score > 0)
                  .sort((a, b) => b.score - a.score);
                
                for (const teamData of scoredTeams) {
                    if (candidateTeams.size >= MIN_TEAMS_TO_SHOW) break;
                    if (!candidateTeams.has(teamData.label)) {
                        // Check not inferior
                        let isInferior = false;
                        for (const existingTeam of candidateTeams.values()) {
                            if (isInferiorSubstitution(teamData.team, existingTeam.team)) {
                                isInferior = true;
                                break;
                            }
                        }
                        if (!isInferior) {
                            candidateTeams.set(teamData.label, teamData);
                        }
                    }
                }
            }
        }
    }
    
    // Convert to array and sort by score
    return Array.from(candidateTeams.values())
        .sort((a, b) => b.score - a.score);
}

/**
 * Check if teamA is an inferior substitution of teamB
 * (same team but with A-rank(s) instead of S-rank(s))
 */
function isInferiorSubstitution(teamA, teamB) {
    // Teams must have same size
    if (teamA.length !== teamB.length) return false;
    
    // Count how many units are shared vs different
    const idsA = new Set(teamA.map(u => u.id));
    const idsB = new Set(teamB.map(u => u.id));
    
    let sharedCount = 0;
    let aHasWorseUnit = false;
    let bHasWorseUnit = false;
    
    for (const id of idsA) {
        if (idsB.has(id)) {
            sharedCount++;
        }
    }
    
    // Must share at least 2 units to be considered a substitution
    if (sharedCount < 2) return false;
    
    // Find the differing units
    const onlyInA = teamA.filter(u => !idsB.has(u.id));
    const onlyInB = teamB.filter(u => !idsA.has(u.id));
    
    // If same number of different units, compare ranks
    if (onlyInA.length !== onlyInB.length) return false;
    
    // Check if A's unique units are all A-rank and B's are all S-rank
    const aUniqueARanks = onlyInA.filter(u => u.rank === 'A').length;
    const bUniqueSRanks = onlyInB.filter(u => u.rank === 'S').length;
    
    // TeamA is inferior if its unique units are A-rank while B's are S-rank
    return aUniqueARanks > 0 && bUniqueSRanks > 0 && aUniqueARanks >= bUniqueSRanks;
}

/**
 * Get DPS type for a unit
 */
function getDpsTypeForUnit(unit) {
    if (unit.tags.includes('attack')) return 'attack';
    if (unit.tags.includes('anomaly')) return 'anomaly';
    if (unit.tags.includes('rupture')) return 'rupture';
    return null;
}

function getEligibleSRanks(teams, availableUnits) {
    const sRanksInTeams = new Set();
    
    // Find all S-ranks that appear in at least one team
    for (const { team } of teams) {
        for (const unit of team) {
            if (unit.rank === 'S' && !filters.exclude.includes(unit.id)) {
                sRanksInTeams.add(unit.id);
            }
        }
    }
    
    return sRanksInTeams;
}

function getAvailableElements(availableUnits) {
    // Elements available in roster (considering filters)
    const elements = new Set();
    
    // Only consider elements that have DPS units
    for (const unit of availableUnits) {
        if (filters.exclude.includes(unit.id)) continue;
        if (isDPS(unit)) {
            const element = getElement(unit);
            if (element) {
                // If element filter is active, only include those elements
                if (filters.elements.length === 0 || filters.elements.includes(element)) {
                    elements.add(element);
                }
            }
        }
    }
    
    return elements;
}

function getAvailableDpsTypes(availableUnits) {
    // DPS types available in roster (considering filters)
    const dpsTypes = new Set();
    
    for (const unit of availableUnits) {
        if (filters.exclude.includes(unit.id)) continue;
        
        for (const role of DPS_ROLES) {
            if (unit.tags.includes(role)) {
                // If DPS filter is active, only include those types
                if (filters.dpsRoles.length === 0 || filters.dpsRoles.includes(role)) {
                    // Attack+Anomaly hybrid counts as attack
                    if (role === 'anomaly' && unit.tags.includes('attack')) {
                        dpsTypes.add('attack');
                    } else {
                        dpsTypes.add(role);
                    }
                }
            }
        }
    }
    
    return dpsTypes;
}

/**
 * Get team element(s) based on DPS units only.
 * Falls back to stun, then support/defense if no DPS.
 */
function getTeamElements(team) {
    const elements = [];
    
    // Priority 1: DPS units
    const dpsUnits = team.filter(isDPS);
    if (dpsUnits.length > 0) {
        for (const unit of dpsUnits) {
            const el = getElement(unit);
            if (el && !elements.includes(el)) {
                elements.push(el);
            }
        }
        return elements;
    }
    
    // Priority 2: Stun units
    const stunUnits = team.filter(isStun);
    if (stunUnits.length > 0) {
        for (const unit of stunUnits) {
            const el = getElement(unit);
            if (el && !elements.includes(el)) {
                elements.push(el);
            }
        }
        return elements;
    }
    
    // Priority 3: Support/Defense units
    const supportDefenseUnits = team.filter(u => isSupport(u) || isDefense(u));
    for (const unit of supportDefenseUnits) {
        const el = getElement(unit);
        if (el && !elements.includes(el)) {
            elements.push(el);
        }
    }
    
    return elements;
}

/**
 * Get team DPS type. Attack+Anomaly hybrid = attack.
 */
function getTeamDpsType(team) {
    const dpsUnits = team.filter(isDPS);
    
    if (dpsUnits.length === 0) return null;
    
    const hasAttack = dpsUnits.some(u => u.tags.includes('attack'));
    const hasAnomaly = dpsUnits.some(u => u.tags.includes('anomaly'));
    const hasRupture = dpsUnits.some(u => u.tags.includes('rupture'));
    
    // Attack+Anomaly hybrid = attack
    if (hasAttack && hasAnomaly) return 'attack';
    if (hasAttack) return 'attack';
    if (hasAnomaly) return 'anomaly';
    if (hasRupture) return 'rupture';
    
    return null;
}

// ============================================================================
// RESULTS DISPLAY
// ============================================================================

function displayResults() {
    const section = document.getElementById('results-section');
    const grid = document.getElementById('teams-grid');
    const countEl = document.getElementById('results-count');
    const pagination = document.getElementById('results-pagination');
    
    if (filteredTeams.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <p>No teams match your current filters.</p>
                <p class="hint">Try adjusting your filters or adding more units to your roster.</p>
            </div>
        `;
        countEl.innerHTML = '';
        pagination.style.display = 'none';
    } else {
        // Build grid display: rows = elements, columns = DPS types
        grid.innerHTML = createTeamGrid(filteredTeams);
        
        countEl.innerHTML = `Showing <span class="highlight">${filteredTeams.length}</span> recommended team${filteredTeams.length !== 1 ? 's' : ''}`;
        
        // Hide pagination for curated results
        pagination.style.display = 'none';
    }
    
    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Create a grid display with elements as rows and DPS types as columns
 */
function createTeamGrid(teams) {
    // Group teams by the cell they were selected for
    const teamsByCell = {};
    
    for (const teamData of teams) {
        // Use the element/dpsType the team was selected for (not all matching elements)
        const element = teamData.element;
        const dpsType = teamData.dpsType;
        const key = `${element}-${dpsType}`;
        
        if (!teamsByCell[key]) {
            teamsByCell[key] = [];
        }
        teamsByCell[key].push(teamData);
    }
    
    // Determine which elements and DPS types to display
    let displayElements;
    let displayDpsTypes;
    
    if (filters.elements.length > 0) {
        // User has selected specific elements - show only those (maintain order)
        displayElements = GRID_ELEMENTS.filter(el => filters.elements.includes(el));
    } else {
        // No filter - show only elements that have teams
        const elementsWithTeams = new Set(teams.map(t => t.element).filter(Boolean));
        displayElements = GRID_ELEMENTS.filter(el => elementsWithTeams.has(el));
    }
    
    if (filters.dpsRoles.length > 0) {
        // User has selected specific DPS types - show only those (maintain order)
        displayDpsTypes = GRID_DPS_TYPES.filter(role => filters.dpsRoles.includes(role));
    } else {
        // No filter - show only DPS types that have teams
        const dpsTypesWithTeams = new Set(teams.map(t => t.dpsType).filter(Boolean));
        displayDpsTypes = GRID_DPS_TYPES.filter(role => dpsTypesWithTeams.has(role));
    }
    
    // Build grid HTML
    let html = '<div class="team-grid-container">';
    
    // Header row with DPS type labels
    html += '<div class="team-grid-header">';
    html += '<div class="grid-corner"></div>'; // Empty corner cell
    for (const dpsType of displayDpsTypes) {
        html += `<div class="grid-header-cell dps-${dpsType}">${capitalizeFirst(dpsType)}</div>`;
    }
    html += '</div>';
    
    // Data rows (one per element)
    for (const element of displayElements) {
        html += '<div class="team-grid-row">';
        
        // Row label (element)
        html += `<div class="grid-row-label element-${element}">${capitalizeFirst(element)}</div>`;
        
        // Cells for each DPS type
        for (const dpsType of displayDpsTypes) {
            const key = `${element}-${dpsType}`;
            const cellTeams = teamsByCell[key] || [];
            
            html += '<div class="grid-cell">';
            if (cellTeams.length > 0) {
                // Show ALL teams in this cell
                html += '<div class="grid-cell-teams">';
                for (const teamData of cellTeams) {
                    html += createTeamCard(teamData.team, true);
                }
                html += '</div>';
            } else {
                html += '<div class="grid-cell-empty">—</div>';
            }
            html += '</div>';
        }
        
        html += '</div>';
    }
    
    html += '</div>';
    
    return html;
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function createTeamCard(team, compact = false) {
    const unitsHtml = team.map(unit => createTeamUnitCard(unit)).join('');
    
    // Get badges using new logic (skip badges in compact/grid mode - they're implicit from position)
    const badges = [];
    
    if (!compact) {
        // Element badges (based on DPS units, falling back to stun, then support/defense)
        const teamElements = getTeamElements(team);
        for (const element of teamElements) {
            badges.push(`<span class="team-badge element-badge ${element}">${element}</span>`);
        }
        
        // DPS type badge (attack+anomaly = attack)
        const dpsType = getTeamDpsType(team);
        if (dpsType) {
            badges.push(`<span class="team-badge role-badge">${dpsType}</span>`);
        }
    }
    
    const cardClass = compact ? 'team-card team-card-compact' : 'team-card';
    
    return `
        <div class="${cardClass}">
            <div class="team-card-units">
                ${unitsHtml}
            </div>
            ${badges.length > 0 ? `<div class="team-card-info">${badges.join('')}</div>` : ''}
        </div>
    `;
}

function createTeamUnitCard(unit) {
    const element = getUnitElement(unit);
    const initials = getInitials(unit.name);
    const imageUrl = getCharacterImageUrl(unit.id);
    
    const avatarHtml = imageUrl 
        ? `<img class="unit-avatar" src="${imageUrl}" alt="${unit.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="unit-initials" style="display:none">${initials}</span>`
        : `<span class="unit-initials">${initials}</span>`;
    
    return `
        <div class="team-unit element-${element}" title="${unit.name}">
            ${avatarHtml}
            <span class="unit-name">${unit.name}</span>
        </div>
    `;
}

function changePage(delta) {
    const totalPages = Math.ceil(filteredTeams.length / TEAMS_PER_PAGE);
    currentPage = Math.max(0, Math.min(totalPages - 1, currentPage + delta));
    displayResults();
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

function showValidationErrors(errors) {
    const container = document.getElementById('validation-errors');
    container.innerHTML = '<ul>' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
    container.style.display = 'block';
    container.style.animation = 'none';
    container.offsetHeight;
    container.style.animation = 'shake 0.3s ease-out';
}

function hideValidationErrors() {
    document.getElementById('validation-errors').style.display = 'none';
}

function showError(message) {
    showValidationErrors([message]);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', loadData);

