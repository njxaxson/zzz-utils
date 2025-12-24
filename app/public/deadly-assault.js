/**
 * Deadly Assault Team Builder - Client-side Logic
 * Finds optimal team allocations for 3 DA bosses
 */

import { 
    getTeams, 
    sortTeamByRole, 
    getTeamLabel,
    extendTeamsWithUniversalUnits,
    findExclusiveCombinations 
} from './lib/team-builder.js';
import { scoreTeamForBoss } from './lib/team-scorer.js';
import { 
    decodeRoster, 
    getRosterFromUrl, 
    decodeBosses,
    getBossesFromUrl,
    generateShareUrlWithBosses, 
    copyToClipboard 
} from './lib/roster-share.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const RESULT_LIMIT = 5;
const MIN_UNITS_REQUIRED = 9;
const BOSSES_REQUIRED = 3;
const ROSTER_STORAGE_KEY = 'zzz-roster';           // Shared with team-builder page
const PAGE_STORAGE_KEY = 'zzz-deadly-assault';     // Page-specific settings

// ============================================================================
// STATE
// ============================================================================

let allUnits = [];
let allBosses = [];
let characterImages = {};
let bossImages = {};

// Unit states: { unitId: { owned: boolean, excluded: boolean, universal: boolean } }
let unitStates = {};

// Selected boss IDs
let selectedBosses = [];

// Roster section collapse state
let rosterOpen = true;

// Shared roster mode - when true, localStorage is NOT used for roster
let sharedRosterMode = false;

// Shared bosses mode - when true, localStorage is NOT used for page settings
let sharedBossesMode = false;

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadData() {
    try {
        const [unitsResponse, bossesResponse, imagesResponse, bossImagesResponse] = await Promise.all([
            fetch('./data/units.json'),
            fetch('./data/bosses.json'),
            fetch('./data/character-images.json'),
            fetch('./data/boss-images.json')
        ]);
        
        allUnits = await unitsResponse.json();
        allBosses = await bossesResponse.json();
        characterImages = await imagesResponse.json();
        bossImages = await bossImagesResponse.json();
        
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
        rosterOpen
    };
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(data));
}

function savePageToStorage() {
    // Do NOT save to localStorage when viewing shared bosses
    if (sharedBossesMode) {
        return;
    }
    
    const data = {
        selectedBosses
    };
    localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify(data));
}

function saveToStorage() {
    saveRosterToStorage();
    savePageToStorage();
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
    } else {
        // Normal mode: load roster from localStorage
        sharedRosterMode = false;
        loadRosterFromLocalStorage();
    }
    
    // Check for shared bosses in URL parameter
    const bossesParam = getBossesFromUrl();
    if (bossesParam !== null) {
        sharedBossesMode = true;
        
        // Decode the bosses from URL
        const sharedBosses = decodeBosses(bossesParam, allBosses);
        if (sharedBosses) {
            selectedBosses = sharedBosses;
        } else {
            console.warn('Failed to decode shared bosses, starting with none selected');
            selectedBosses = [];
        }
    } else {
        // Normal mode: load page settings from localStorage
        sharedBossesMode = false;
        loadPageFromStorage();
    }
}

function loadRosterFromLocalStorage() {
    // Load roster (shared with team-builder page)
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
        
        // Migration: check if old storage has data we should use
        const oldSaved = localStorage.getItem(PAGE_STORAGE_KEY);
        if (oldSaved && !saved) {
            const oldData = JSON.parse(oldSaved);
            if (oldData.unitStates) {
                for (const unitId in oldData.unitStates) {
                    if (unitStates[unitId]) {
                        unitStates[unitId] = { ...unitStates[unitId], ...oldData.unitStates[unitId] };
                    }
                }
            }
            if (typeof oldData.rosterOpen === 'boolean') {
                rosterOpen = oldData.rosterOpen;
            }
            saveRosterToStorage();
        }
    } catch (e) {
        console.warn('Failed to load roster state:', e);
    }
}

function loadPageFromStorage() {
    // Load page-specific settings
    try {
        const pageSaved = localStorage.getItem(PAGE_STORAGE_KEY);
        if (pageSaved) {
            const data = JSON.parse(pageSaved);
            
            if (data.selectedBosses) {
                selectedBosses = data.selectedBosses.filter(id => 
                    allBosses.some(b => b.id === id)
                );
            }
        }
    } catch (e) {
        console.warn('Failed to load page state:', e);
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
    renderBossSection();
    updateCounts();
    applySectionStates();
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
    
    // Use image if available, fallback to initials
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

function renderBossSection() {
    const container = document.getElementById('boss-grid');
    if (!container) return;
    container.innerHTML = allBosses.map(boss => createBossCard(boss)).join('');
}

function createBossCard(boss) {
    const isSelected = selectedBosses.includes(boss.id);
    const initials = getInitials(boss.shortName);
    const weaknessClass = getWeaknessGradientClass(boss.weaknesses);
    const imageUrl = getBossImageUrl(boss.id);
    
    const avatarHtml = imageUrl
        ? `<img class="boss-avatar-img" src="${imageUrl}" alt="${boss.shortName}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="boss-initials" style="display:none">${initials}</span>`
        : `<span class="boss-initials">${initials}</span>`;
    
    return `
        <button type="button" class="boss-card ${weaknessClass} ${isSelected ? 'selected' : ''}" 
                data-boss-id="${boss.id}" 
                aria-pressed="${isSelected}"
                aria-label="${boss.shortName} - Weak to ${boss.weaknesses.join(', ')}">
            <div class="boss-avatar">
                ${avatarHtml}
            </div>
            <div class="boss-name">${boss.shortName}</div>
        </button>
    `;
}

function getBossImageUrl(bossId) {
    if (!bossImages.bosses || !bossImages.bosses[bossId]) {
        return null;
    }
    return `./assets/bosses/${bossImages.bosses[bossId]}`;
}

function getWeaknessGradientClass(weaknesses) {
    if (!weaknesses || weaknesses.length === 0) {
        return 'weakness-physical'; // default fallback
    }
    
    if (weaknesses.length === 1) {
        return `weakness-${weaknesses[0]}`;
    }
    
    // For two weaknesses, sort alphabetically to match CSS class naming
    const sorted = [...weaknesses].sort();
    return `weakness-${sorted[0]}-${sorted[1]}`;
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
    // characterImages is now a simple map of unitId -> local path
    return characterImages[unitId] || null;
}

function getElementIcon(element) {
    const icons = {
        fire: '🔥',
        ice: '❄️',
        electric: '⚡',
        physical: '💥',
        ether: '🌀'
    };
    return `<span class="element-icon element-${element}" title="${element}">${icons[element] || '?'}</span>`;
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
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function setupEventListeners() {
    // Unit card interactions (left click to toggle owned, right click for flex/universal)
    document.querySelectorAll('.unit-grid').forEach(grid => {
        grid.addEventListener('click', handleUnitClick);
        grid.addEventListener('contextmenu', handleUnitRightClick);
    });
    
    // Boss card interactions
    document.getElementById('boss-grid').addEventListener('click', handleBossClick);
    
    // Subsection actions (All / None)
    document.querySelectorAll('.subtle-btn').forEach(btn => {
        btn.addEventListener('click', handleCategoryAction);
    });
    
    // Roster section toggle tracking
    const rosterSection = document.getElementById('roster-section');
    if (rosterSection) {
        rosterSection.addEventListener('toggle', handleRosterToggle);
    }
    
    // Run button
    document.getElementById('run-btn').addEventListener('click', runOptimization);
    
    // Share button
    const shareBtn = document.getElementById('share-roster-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', handleShareClick);
    }
}

// ============================================================================
// SHARE FUNCTIONALITY
// ============================================================================

async function handleShareClick(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const btn = document.getElementById('share-roster-btn');
    
    // Generate the share URL (includes both roster AND bosses)
    const shareUrl = generateShareUrlWithBosses(unitStates, allUnits, selectedBosses);
    
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
    
    // Left click: toggle owned
    // Right click is handled by context menu event
    state.owned = !state.owned;
    if (!state.owned) {
        state.universal = false;
    }
    
    updateUnitCard(card, unitId);
    updateCounts();
    saveToStorage();
}

function handleUnitRightClick(e) {
    e.preventDefault();
    const card = e.target.closest('.unit-card');
    if (!card) return;
    
    const unitId = card.dataset.unitId;
    const state = unitStates[unitId];
    
    // Only toggle universal if owned
    if (state.owned) {
        state.universal = !state.universal;
        updateUnitCard(card, unitId);
        saveToStorage();
    }
}

function updateUnitCard(card, unitId) {
    const state = unitStates[unitId];
    const unit = allUnits.find(u => u.id === unitId);
    
    // Update card classes
    card.classList.toggle('not-owned', !state.owned);
    card.classList.toggle('universal', state.universal);
    
    // Update flex badge
    const existingBadge = card.querySelector('.flex-badge');
    if (state.universal && !existingBadge) {
        const badge = document.createElement('span');
        badge.className = 'flex-badge';
        badge.textContent = 'FLEX';
        card.appendChild(badge);
    } else if (!state.universal && existingBadge) {
        existingBadge.remove();
    }
    
    // Update title
    card.title = unit ? `${unit.name}${state.universal ? ' (Flex)' : ''}` : '';
}

function handleBossClick(e) {
    const card = e.target.closest('.boss-card');
    if (!card) return;
    
    const bossId = card.dataset.bossId;
    const index = selectedBosses.indexOf(bossId);
    
    if (index >= 0) {
        // Deselect
        selectedBosses.splice(index, 1);
        card.classList.remove('selected');
        card.setAttribute('aria-pressed', 'false');
    } else {
        // If already at max, remove the oldest selection first
        if (selectedBosses.length >= BOSSES_REQUIRED) {
            const oldestBossId = selectedBosses.shift();
            const oldestCard = document.querySelector(`.boss-card[data-boss-id="${oldestBossId}"]`);
            if (oldestCard) {
                oldestCard.classList.remove('selected');
                oldestCard.setAttribute('aria-pressed', 'false');
            }
        }
        // Select the new boss
        selectedBosses.push(bossId);
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
    }
    
    saveToStorage();
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
    
    // Re-render the affected grid
    const gridId = `${category}-grid`;
    renderUnitGrid(gridId, units);
    
    // Re-attach click handlers
    const grid = document.getElementById(gridId);
    grid.addEventListener('click', handleUnitClick);
    grid.addEventListener('contextmenu', handleUnitRightClick);
    
    updateCounts();
    saveToStorage();
}

function handleRosterToggle(e) {
    rosterOpen = e.target.open;
    saveToStorage();
}

// ============================================================================
// VALIDATION
// ============================================================================

function validate() {
    const errors = [];
    
    // Check boss count
    if (selectedBosses.length !== BOSSES_REQUIRED) {
        errors.push(`Please select exactly ${BOSSES_REQUIRED} bosses (currently ${selectedBosses.length} selected)`);
    }
    
    // Check unit count
    const availableUnits = getAvailableUnits();
    if (availableUnits.length < MIN_UNITS_REQUIRED) {
        errors.push(`Need at least ${MIN_UNITS_REQUIRED} available units (currently ${availableUnits.length})`);
    }
    
    return errors;
}

function showValidationErrors(errors) {
    const container = document.getElementById('validation-errors');
    container.innerHTML = '<ul>' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
    container.style.display = 'block';
    container.style.animation = 'none';
    container.offsetHeight; // Trigger reflow
    container.style.animation = 'shake 0.3s ease-out';
}

function hideValidationErrors() {
    document.getElementById('validation-errors').style.display = 'none';
}

function showError(message) {
    showValidationErrors([message]);
}

// ============================================================================
// OPTIMIZATION ALGORITHM
// ============================================================================

function getAvailableUnits() {
    return allUnits.filter(unit => {
        const state = unitStates[unit.id];
        return state.owned;
    }).map(unit => ({
        ...unit,
        // Reset numericId - will be assigned by getTeams
        numericId: undefined
    }));
}

function getUniversalUnits() {
    return allUnits.filter(unit => {
        const state = unitStates[unit.id];
        return state.owned && state.universal;
    }).map(u => u.name);
}


function runOptimization() {
    // Validate
    const errors = validate();
    if (errors.length > 0) {
        showValidationErrors(errors);
        return;
    }
    hideValidationErrors();
    
    // Disable button
    const btn = document.getElementById('run-btn');
    btn.disabled = true;
    btn.textContent = 'CALCULATING...';
    
    // Run in next tick for UI update
    setTimeout(() => {
        try {
            const results = calculateOptimalTeams();
            displayResults(results);
        } catch (error) {
            console.error('Optimization failed:', error);
            showError('Failed to calculate optimal teams. Try adjusting your selections.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Find Optimal Teams';
        }
    }, 50);
}

function calculateOptimalTeams() {
    const availableUnits = getAvailableUnits();
    const universalUnitNames = getUniversalUnits();
    const selectedBossObjects = selectedBosses.map(id => allBosses.find(b => b.id === id));
    const selectedBossNames = selectedBossObjects.map(b => b.name);
    
    // DEBUG: Log available units
    console.group('🎮 Deadly Assault Debug Info');
    console.log('📋 Available Units:', availableUnits.length);
    console.table(availableUnits.map(u => ({
        name: u.name,
        tier: u.tier,
        tags: u.tags.join(', '),
        synergy: u.synergy ? JSON.stringify(u.synergy) : 'none'
    })));
    console.log('🌟 Universal Units:', universalUnitNames);
    console.log('👹 Selected Bosses:', selectedBossObjects.map(b => b.name));
    
    // Generate all valid teams
    const allTeams = getTeams(availableUnits);
    
    // Separate 2-person and 3-person teams
    const twoCharTeams = {};
    const threeCharTeams = {};
    for (const label in allTeams) {
        const team = allTeams[label];
        if (team.length === 2) {
            twoCharTeams[label] = team;
        } else if (team.length === 3) {
            threeCharTeams[label] = team;
        }
    }
    
    // DEBUG: Log team counts before extension
    console.log('🔢 Teams before universal extension:');
    console.log(`   2-person teams: ${Object.keys(twoCharTeams).length}`);
    console.log(`   3-person teams: ${Object.keys(threeCharTeams).length}`);
    
    // Extend 2-person teams with universal units
    const universalUnitObjects = availableUnits.filter(u => universalUnitNames.includes(u.name));
    if (universalUnitObjects.length > 0) {
        extendTeamsWithUniversalUnits(twoCharTeams, threeCharTeams, universalUnitObjects);
    }
    
    const teamLabels = Object.keys(threeCharTeams);
    
    // DEBUG: Log team counts after extension
    console.log('🔢 Teams after universal extension:');
    console.log(`   3-person teams: ${teamLabels.length}`);
    console.log('📝 All 3-person team labels:', teamLabels);
    
    // Score teams for each boss
    const viableTeamsByBoss = {};
    
    for (const boss of selectedBossObjects) {
        viableTeamsByBoss[boss.name] = [];
        
        // DEBUG: Log boss info
        console.group(`👹 Scoring teams for: ${boss.name}`);
        console.log('   Weaknesses:', boss.weaknesses);
        console.log('   Resistances:', boss.resistances);
        console.log('   Shill:', boss.shill || 'none');
        console.log('   Anti:', boss.anti || 'none');
        
        const disqualifiedTeams = [];
        
        // First pass: normal scoring
        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            const score = scoreTeamForBoss(team, boss);
            
            if (score > 0) {
                viableTeamsByBoss[boss.name].push({ label, team, score });
            } else {
                disqualifiedTeams.push({ label, score, team });
            }
        }
        
        // DEBUG: Log scoring results
        console.log(`   ✅ Viable teams: ${viableTeamsByBoss[boss.name].length}`);
        console.log(`   ❌ Disqualified teams: ${disqualifiedTeams.length}`);
        
        // DEBUG: Run detailed debug on first few disqualified teams to understand why
        if (disqualifiedTeams.length > 0 && viableTeamsByBoss[boss.name].length === 0) {
            console.log('   🔍 Debugging disqualified teams:');
            for (const dt of disqualifiedTeams.slice(0, 5)) {
                const debugResult = scoreTeamForBoss(dt.team, boss, { debug: true });
                console.log(`      ${dt.label}:`, debugResult);
            }
        }
        
        if (viableTeamsByBoss[boss.name].length > 0) {
            console.log('   Top viable teams:');
            const topViable = [...viableTeamsByBoss[boss.name]]
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);
            console.table(topViable.map(t => ({ label: t.label, score: t.score })));
        }
        
        if (disqualifiedTeams.length > 0 && viableTeamsByBoss[boss.name].length === 0) {
            console.log('   All teams were disqualified. Sample disqualified teams:');
            console.table(disqualifiedTeams.slice(0, 10).map(t => ({ label: t.label, score: t.score })));
        }
        
        // Fallback: lenient mode if no viable teams
        if (viableTeamsByBoss[boss.name].length === 0) {
            console.log('   ⚠️ No viable teams - trying lenient mode...');
            
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const score = scoreTeamForBoss(team, boss, { lenient: true });
                
                if (score > 0) {
                    viableTeamsByBoss[boss.name].push({ label, team, score, lenient: true });
                }
            }
            
            console.log(`   Lenient mode viable teams: ${viableTeamsByBoss[boss.name].length}`);
        }
        
        // Sort by score descending
        viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);
        console.groupEnd();
    }
    
    // Find exclusive combinations
    const combinations = findExclusiveCombinations(viableTeamsByBoss, selectedBossNames);
    
    // DEBUG: Log final results
    console.log('🏆 Final Results:');
    console.log(`   Total exclusive combinations found: ${combinations.length}`);
    if (combinations.length > 0) {
        console.log('   Top combinations:');
        combinations.slice(0, 3).forEach((combo, i) => {
            console.log(`   #${i + 1} (score: ${combo.totalScore}):`);
            combo.assignments.forEach(a => {
                console.log(`      ${a.boss}: ${a.label} (${a.score})`);
            });
        });
    }
    console.groupEnd();
    
    return {
        combinations: combinations.slice(0, RESULT_LIMIT),
        bosses: selectedBossObjects,
        totalFound: combinations.length
    };
}

// ============================================================================
// RESULTS DISPLAY
// ============================================================================

// Carousel state
let currentResultIndex = 0;
let totalResults = 0;

function displayResults(results) {
    const container = document.getElementById('results-container');
    const section = document.getElementById('results-section');
    
    if (results.combinations.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <p>No valid team combinations found.</p>
                <p>Try adding more units to your roster or selecting different bosses.</p>
            </div>
        `;
    } else {
        totalResults = results.combinations.length;
        currentResultIndex = 0;
        
        const slidesHtml = results.combinations.map((combo, index) => 
            createResultSlide(combo, index, results.bosses)
        ).join('');
        
        container.innerHTML = `
            <div class="carousel">
                <button class="carousel-btn carousel-prev" onclick="prevResult()" aria-label="Previous result">
                    <span>‹</span>
                </button>
                <div class="carousel-viewport">
                    <div class="carousel-track">
                        ${slidesHtml}
                    </div>
                </div>
                <button class="carousel-btn carousel-next" onclick="nextResult()" aria-label="Next result">
                    <span>›</span>
                </button>
            </div>
            <div class="carousel-indicators">
                ${results.combinations.map((_, i) => 
                    `<button class="carousel-dot ${i === 0 ? 'active' : ''}" onclick="goToResult(${i})" aria-label="Go to result ${i + 1}"></button>`
                ).join('')}
            </div>
            <div class="carousel-counter">
                <span id="current-result">1</span> of ${totalResults}
            </div>
        `;
    }
    
    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
}

function prevResult() {
    if (currentResultIndex > 0) {
        goToResult(currentResultIndex - 1);
    }
}

function nextResult() {
    if (currentResultIndex < totalResults - 1) {
        goToResult(currentResultIndex + 1);
    }
}

function goToResult(index) {
    currentResultIndex = index;
    
    // Move the track
    const track = document.querySelector('.carousel-track');
    track.style.transform = `translateX(-${index * 100}%)`;
    
    // Update dots
    document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
    
    // Update counter
    document.getElementById('current-result').textContent = index + 1;
    
    // Update button states
    document.querySelector('.carousel-prev').disabled = index === 0;
    document.querySelector('.carousel-next').disabled = index === totalResults - 1;
}

function createResultSlide(combo, index, bosses) {
    // Create 3 columns - one per boss/team assignment
    const columnsHtml = combo.assignments.map(assignment => {
        const boss = bosses.find(b => b.name === assignment.boss);
        const weaknessClass = getWeaknessGradientClass(boss.weaknesses);
        const teamHtml = assignment.team.map(unit => createResultUnitCard(unit)).join('');
        const imageUrl = getBossImageUrl(boss.id);
        const initials = getInitials(boss.shortName);
        
        const avatarHtml = imageUrl
            ? `<img class="boss-avatar-img" src="${imageUrl}" alt="${boss.shortName}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="boss-initials" style="display:none">${initials}</span>`
            : `<span class="boss-initials">${initials}</span>`;
        
        return `
            <div class="result-column">
                <div class="result-boss-tile ${weaknessClass}">
                    <div class="result-boss-avatar">
                        ${avatarHtml}
                    </div>
                    <div class="boss-name">${boss.shortName}</div>
                </div>
                <div class="result-team-stack">
                    ${teamHtml}
                </div>
            </div>
        `;
    }).join('');
    
    return `
        <div class="carousel-slide">
            <div class="result-label">Option #${index + 1}</div>
            <div class="result-columns">
                ${columnsHtml}
            </div>
        </div>
    `;
}

function createResultUnitCard(unit) {
    const element = getUnitElement(unit);
    const initials = getInitials(unit.name);
    const imageUrl = getCharacterImageUrl(unit.id);
    
    // Use image if available, fallback to initials
    const avatarHtml = imageUrl 
        ? `<img class="unit-avatar" src="${imageUrl}" alt="${unit.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="unit-initials" style="display:none">${initials}</span>`
        : `<span class="unit-initials">${initials}</span>`;
    
    return `
        <div class="result-unit-card element-${element}" title="${unit.name}">
            ${avatarHtml}
            <span class="unit-name">${unit.name}</span>
        </div>
    `;
}

// ============================================================================
// GLOBAL EXPORTS (for onclick handlers)
// ============================================================================

window.prevResult = prevResult;
window.nextResult = nextResult;
window.goToResult = goToResult;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', loadData);

