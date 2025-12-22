/**
 * Team Builder Page - Client-side Logic
 * Generates and filters team combinations based on user roster and filters
 */

import { getTeams, sortTeamByRole, getTeamLabel } from './lib/team-builder.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const ROSTER_STORAGE_KEY = 'zzz-roster';
const FILTERS_STORAGE_KEY = 'zzz-team-builder-filters';
const TEAMS_PER_PAGE = 20;

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
            ${state.universal ? '<span class="flex-badge">✦</span>' : ''}
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
    
    // Pagination
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
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
        badge.textContent = '✦';
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
            
            // Apply filters
            filteredTeams = applyFilters(teams);
            
            // Sort alphabetically by label
            filteredTeams.sort((a, b) => a.label.localeCompare(b.label));
            
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

function applyFilters(teams) {
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
        const totalPages = Math.ceil(filteredTeams.length / TEAMS_PER_PAGE);
        const startIdx = currentPage * TEAMS_PER_PAGE;
        const endIdx = Math.min(startIdx + TEAMS_PER_PAGE, filteredTeams.length);
        const pageTeams = filteredTeams.slice(startIdx, endIdx);
        
        grid.innerHTML = pageTeams.map(({ label, team }) => createTeamCard(team)).join('');
        
        countEl.innerHTML = `Showing <span class="highlight">${startIdx + 1}-${endIdx}</span> of <span class="highlight">${filteredTeams.length}</span> teams`;
        
        // Update pagination
        if (totalPages > 1) {
            pagination.style.display = 'flex';
            document.getElementById('prev-page').disabled = currentPage === 0;
            document.getElementById('next-page').disabled = currentPage >= totalPages - 1;
            document.getElementById('pagination-info').textContent = `Page ${currentPage + 1} of ${totalPages}`;
        } else {
            pagination.style.display = 'none';
        }
    }
    
    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
}

function createTeamCard(team) {
    const unitsHtml = team.map(unit => createTeamUnitCard(unit)).join('');
    
    // Determine team element (most common element)
    const elements = ['fire', 'ice', 'electric', 'physical', 'ether'];
    const elementCounts = {};
    team.forEach(u => {
        const el = u.tags.find(t => elements.includes(t));
        if (el) elementCounts[el] = (elementCounts[el] || 0) + 1;
    });
    
    // Get badges
    const badges = [];
    
    // Element badge (if 2+ share same element)
    for (const [element, count] of Object.entries(elementCounts)) {
        if (count >= 2) {
            badges.push(`<span class="team-badge element-badge ${element}">${element}</span>`);
        }
    }
    
    // Role badge
    const dpsRoles = ['attack', 'anomaly', 'rupture'];
    const teamDps = team.find(u => dpsRoles.some(r => u.tags.includes(r)));
    if (teamDps) {
        const role = dpsRoles.find(r => teamDps.tags.includes(r));
        badges.push(`<span class="team-badge role-badge">${role}</span>`);
    }
    
    return `
        <div class="team-card">
            <div class="team-card-units">
                ${unitsHtml}
            </div>
            <div class="team-card-info">
                ${badges.join('')}
            </div>
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

