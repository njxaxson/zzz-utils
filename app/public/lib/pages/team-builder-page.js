/**
 * Team Builder Page - Client-side Logic
 * Generates and filters team combinations based on user roster and filters
 */

import { getTeams, sortTeamByRole, getTeamLabel } from '../common/team-builder.js';
import { scoreTeamForBoss, isDPS, isStun, isSupport, isDefense, getElement, hasSubDPSRole } from '../common/team-scorer.js';
import { 
    initRoster, getUnitStates, getAllUnits,
    getInitials, getUnitElement, getCharacterImageUrl
} from '../common/roster-ui.js';
import { ELEMENTS, DPS_ROLES } from '../common/constants.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const FILTERS_STORAGE_KEY = 'zzz-team-builder-filters';
const MIN_TEAMS_TO_SHOW = 6;

// Lumen isn't a real damage element — Lumen units morph their damage to a teammate's
// element via Attribute Mutation, so there's no such thing as a "Lumen team." Lumen
// remains a valid roster filter (see team-builder.html), but it's excluded from the
// results grid's element rows/badges since it can never be the archetype a team is built around.
const GRID_ELEMENTS = ELEMENTS.filter(e => e !== 'lumen');
const GRID_DPS_TYPES = DPS_ROLES;

/**
 * Check if a team has a DPS unit that matches BOTH the target element AND DPS type.
 * e.g., for Ice Anomaly, we need a unit that is both ice element AND anomaly role.
 */
function teamHasMatchingDPS(team, targetElement, targetDpsType, allowSubDPS = false) {
    for (const unit of team) {
        const unitElement = getElement(unit);
        const unitDpsType = getDpsTypeForUnit(unit);
        
        if (unitElement === targetElement && unitDpsType === targetDpsType) {
            return allowSubDPS || !hasSubDPSRole(unit);
        }
    }
    return false;
}

// ============================================================================
// STATE
// ============================================================================

// Section collapse states
let filtersOpen = true;

// Filter state
let filters = {
    elements: [],         // Array of selected elements
    dpsRoles: [],         // Array of selected DPS roles
    minSRank: 0,          // Minimum S-rank count
    maxTier: 99,          // Maximum unit tier allowed
    teamsPerArchetype: 2, // Number of teams to show per archetype (element + DPS type)
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
        await initRoster({
            containerSelector: '#roster-container',
            pageUrl: 'team-builder.html',
            onStateChange: () => saveFiltersToStorage()
        });
        loadFiltersFromStorage();
        renderPageUI();
    } catch (error) {
        console.error('Failed to load data:', error);
        showError('Failed to load game data. Please refresh the page.');
    }
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================

function saveFiltersToStorage() {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ ...filters, filtersOpen }));
}

function loadFiltersFromStorage() {
    try {
        const savedFilters = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (savedFilters) {
            const data = JSON.parse(savedFilters);
            if (typeof data.filtersOpen === 'boolean') {
                filtersOpen = data.filtersOpen;
            }
            const { filtersOpen: _, ...filterData } = data;
            filters = { ...filters, ...filterData };
        }
    } catch (e) {
        console.warn('Failed to load filter state:', e);
    }
}

// ============================================================================
// UI RENDERING
// ============================================================================

function renderPageUI() {
    renderMustIncludeDropdown();
    renderExcludeDropdown();
    applySectionStates();
    applyFilterStates();
    setupEventListeners();
}

function renderMustIncludeDropdown() {
    const menu = document.getElementById('must-include-menu');
    const itemsContainer = menu.querySelector('.dropdown-items');
    // Only show available units in the dropdown
    const availableUnits = getAllUnits().filter(u => u.available !== false);
    itemsContainer.innerHTML = availableUnits
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
    // Only show available units in the dropdown
    const availableUnits = getAllUnits().filter(u => u.available !== false);
    itemsContainer.innerHTML = availableUnits
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

function applySectionStates() {
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
        updateDropdownText(elementsDropdown, capitalizedList(filters.elements), 'Any element');
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
    
    // Teams Per Archetype buttons
    const teamsPerArchetypeGroup = document.querySelector('[data-filter="teams-per-archetype"]');
    if (teamsPerArchetypeGroup) {
        teamsPerArchetypeGroup.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.value) === filters.teamsPerArchetype);
        });
    }
    
    // Must Include dropdown
    const mustIncludeDropdown = document.querySelector('[data-filter="must-include"]');
    if (mustIncludeDropdown) {
        const allUnits = getAllUnits();
        const names = filters.mustInclude.map(id => {
            const unit = allUnits.find(u => u.id === id);
            return unit ? unit.name : id;
        });
        updateDropdownText(mustIncludeDropdown, names, 'No specific units');
    }
    
    // Exclude dropdown
    const excludeDropdown = document.querySelector('[data-filter="exclude"]');
    if (excludeDropdown) {
        const allUnits = getAllUnits();
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

// Raw filter values (e.g. checkbox values like "fire", "lumen") are lowercase;
// capitalize them for display in the dropdown summary text.
function capitalizedList(values) {
    return values.map(capitalizeFirst);
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function setupEventListeners() {
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
    
    document.getElementById('build-btn').addEventListener('click', buildTeams);
    document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
    
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
}

function handleFilterToggle(e) {
    filtersOpen = e.target.open;
    saveFiltersToStorage();
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
            updateDropdownText(dropdown, capitalizedList(values), 'Any element');
            break;
        case 'dps-role':
            filters.dpsRoles = values;
            updateDropdownText(dropdown, values, 'Any DPS');
            break;
        case 'must-include':
            filters.mustInclude = values;
            const allUnits = getAllUnits();
            const mustIncludeNames = values.map(id => {
                const unit = allUnits.find(u => u.id === id);
                return unit ? unit.name : id;
            });
            updateDropdownText(dropdown, mustIncludeNames, 'No specific units');
            break;
        case 'exclude':
            filters.exclude = values;
            const allUnitsExclude = getAllUnits();
            const excludeNames = values.map(id => {
                const unit = allUnitsExclude.find(u => u.id === id);
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
        case 'teams-per-archetype':
            filters.teamsPerArchetype = value;
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
        teamsPerArchetype: 2,
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
    const allUnits = getAllUnits();
    const unitStates = getUnitStates();
    return allUnits.filter(unit => {
        const state = unitStates[unit.id];
        return state.owned;
    }).map(unit => ({
        ...unit,
        numericId: undefined
    }));
}

function applyUserFilters(teams) {
    const applyElementFilter = (teamList, minCount) =>
        teamList.filter(({ label, team }) => {
            if (filters.elements.length === 0) return true;
            return filters.elements.some(element =>
                team.filter(u => u.tags.includes(element)).length >= minCount
            );
        });

    // Apply all non-element filters first, then layer on the element filter
    const nonElementFiltered = teams.filter(({ label, team }) => {
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

    if (filters.elements.length === 0) return nonElementFiltered;

    // Prefer teams with 2+ units of a selected element; fall back to 1+ if none exist
    const strictPass = applyElementFilter(nonElementFiltered, 2);
    return strictPass.length > 0 ? strictPass : applyElementFilter(nonElementFiltered, 1);
}


function selectBestTeams(teams, availableUnits) {
    if (teams.length === 0) return [];
    
    // Determine available elements and DPS types based on filters and roster
    const availableElements = getAvailableElements(availableUnits);
    const availableDpsTypes = getAvailableDpsTypes(availableUnits);

    // Use a neutral boss for global scoring (no element bias)
    const neutralBoss = {
        name: 'neutral',
        weaknesses: [],
        resistances: [],
        shill: null,
        anti: [],
        favored: [],
        assists: 0
    };
    
    // Step 1: Score all teams globally with consistent scoring
    const scoredTeams = teams.map(({ label, team }) => {
        const score = scoreTeamForBoss(team, neutralBoss, { lenient: true });
        return { label, team, score };
    }).filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score);
    
    // Step 2: Build grid by finding highest-ranked teams for each archetype
    const grid = {};
    const usedTeams = new Set(); // Track which teams are already in the grid
    
    for (const element of availableElements) {
        grid[element] = {};
        for (const dpsType of availableDpsTypes) {
            grid[element][dpsType] = []; // Array to hold multiple teams
        }
    }
    
    // First pass: Prefer teams with 2+ units matching the archetype's element
    // For anomaly archetypes, use special scoring that prioritizes dual-anomaly compositions
    for (const element of availableElements) {
        for (const dpsType of availableDpsTypes) {
            // Get all teams that match this archetype
            const matchingTeams = scoredTeams
                .filter(teamData => !usedTeams.has(teamData.label))
                .filter(teamData => teamHasMatchingDPS(teamData.team, element, dpsType));
            
            if (matchingTeams.length === 0) continue;
       
            // Take up to teamsPerArchetype teams for this archetype
            const teamsToAdd = matchingTeams.slice(0, filters.teamsPerArchetype);
            
            for (const teamData of teamsToAdd) {
                grid[element][dpsType].push({
                    ...teamData,
                    element,
                    dpsType
                });
                usedTeams.add(teamData.label);
            }
        }
    }
        
    // Second pass: Fill remaining empty archetypes (or add more teams to archetypes below limit)
    for (const teamData of scoredTeams) {
        if (usedTeams.has(teamData.label)) continue;
        
        // Find an archetype that still needs teams
        let assigned = false;
        for (const element of availableElements) {
            for (const dpsType of availableDpsTypes) {
                // Check if this archetype needs more teams
                if (grid[element][dpsType].length >= filters.teamsPerArchetype) continue;
                
                // Check if team matches this archetype's criteria
                if (teamHasMatchingDPS(teamData.team, element, dpsType)) {
                    grid[element][dpsType].push({
                        ...teamData,
                        element,
                        dpsType
                    });
                    usedTeams.add(teamData.label);
                    assigned = true;
                    break;
                }
            }
            if (assigned) break;
        }
    }

    // Third pass: Fill any still-empty cells by reusing already-assigned teams.
    // This allows the same team to appear in multiple grid cells rather than
    // leaving a cell blank just because the best match was claimed elsewhere.
    for (const element of availableElements) {
        for (const dpsType of availableDpsTypes) {
            if (grid[element][dpsType].length > 0) continue;

            for (const teamData of scoredTeams) {
                if (teamHasMatchingDPS(teamData.team, element, dpsType, true)) {
                    grid[element][dpsType].push({
                        ...teamData,
                        element,
                        dpsType
                    });
                    if (grid[element][dpsType].length >= filters.teamsPerArchetype) break;
                }
            }
        }
    }
    
    // Step 3: Collect all teams from grid.
    // A team may appear in multiple cells (different element/dpsType) when it was
    // reused by the third pass to fill an otherwise-empty cell, so we key by the
    // combination of label + cell coordinates rather than label alone.
    const candidateTeams = [];
    const seenKeys = new Set();
    
    for (const element of Object.keys(grid)) {
        for (const dpsType of Object.keys(grid[element])) {
            const cellTeams = grid[element][dpsType];
            for (const teamData of cellTeams) {
                if (teamData) {
                    const key = `${teamData.label}|${teamData.element}|${teamData.dpsType}`;
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        candidateTeams.push(teamData);
                    }
                }
            }
        }
    }
    
    // Step 4: Ensure minimum team count by adding top teams not yet included
    const includedLabels = new Set(candidateTeams.map(t => t.label));
    let nextTeamIndex = 0;
    while (includedLabels.size < MIN_TEAMS_TO_SHOW && nextTeamIndex < scoredTeams.length) {
        const teamData = scoredTeams[nextTeamIndex];
        if (!includedLabels.has(teamData.label)) {
            const element = getTeamElements(teamData.team)[0];
            const dpsType = getTeamDpsType(teamData.team);
            candidateTeams.push({
                ...teamData,
                element,
                dpsType
            });
            includedLabels.add(teamData.label);
        }
        nextTeamIndex++;
    }
    
    return candidateTeams;
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

function getAvailableElements(availableUnits) {
    // Elements available in roster (considering filters)
    const elements = new Set();

    // Lumen has no grid row of its own (see GRID_ELEMENTS) — a Lumen-only element
    // filter shouldn't suppress every real-element row, it should surface whatever
    // real elements Lumen units end up morphing/pairing into.
    const realElementFilters = filters.elements.filter(e => e !== 'lumen');

    // Only consider elements that have DPS units
    for (const unit of availableUnits) {
        if (filters.exclude.includes(unit.id)) continue;
        if (isDPS(unit)) {
            const element = getElement(unit);
            if (element && element !== 'lumen') {
                // If a real-element filter is active, only include those elements
                if (realElementFilters.length === 0 || realElementFilters.includes(element)) {
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
            if (el && el !== 'lumen' && !elements.includes(el)) {
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
            if (el && el !== 'lumen' && !elements.includes(el)) {
                elements.push(el);
            }
        }
        return elements;
    }

    // Priority 3: Support/Defense units
    const supportDefenseUnits = team.filter(u => isSupport(u) || isDefense(u));
    for (const unit of supportDefenseUnits) {
        const el = getElement(unit);
        if (el && el !== 'lumen' && !elements.includes(el)) {
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
    // Group teams by the archetype they were selected for
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
    
    // Lumen has no grid row of its own — a Lumen-only element filter falls back to
    // showing every real-element row that has teams, same as no filter at all.
    const realElementFilters = filters.elements.filter(el => el !== 'lumen');

    if (realElementFilters.length > 0) {
        // User has selected specific real elements - show only those (maintain order)
        displayElements = GRID_ELEMENTS.filter(el => realElementFilters.includes(el));
    } else {
        // No real-element filter - show only elements that have teams
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

