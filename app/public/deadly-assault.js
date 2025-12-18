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

// ============================================================================
// CONSTANTS
// ============================================================================

const RESULT_LIMIT = 5;
const MIN_UNITS_REQUIRED = 9;
const BOSSES_REQUIRED = 3;
const STORAGE_KEY = 'zzz-deadly-assault';

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

function saveToStorage() {
    const data = {
        unitStates,
        selectedBosses,
        rosterOpen
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        
        const data = JSON.parse(saved);
        
        if (data.unitStates) {
            // Merge saved states with defaults (for new units)
            for (const unitId in data.unitStates) {
                if (unitStates[unitId]) {
                    unitStates[unitId] = { ...unitStates[unitId], ...data.unitStates[unitId] };
                }
            }
        }
        
        if (data.selectedBosses) {
            selectedBosses = data.selectedBosses.filter(id => 
                allBosses.some(b => b.id === id)
            );
        }
        
        if (typeof data.rosterOpen === 'boolean') {
            rosterOpen = data.rosterOpen;
        }
    } catch (e) {
        console.warn('Failed to load saved state:', e);
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
            ${state.universal ? '<span class="flex-badge">✦</span>' : ''}
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
        badge.textContent = '✦';
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
    
    // Extend 2-person teams with universal units
    const universalUnitObjects = availableUnits.filter(u => universalUnitNames.includes(u.name));
    if (universalUnitObjects.length > 0) {
        extendTeamsWithUniversalUnits(twoCharTeams, threeCharTeams, universalUnitObjects);
    }
    
    const teamLabels = Object.keys(threeCharTeams);
    
    // Score teams for each boss
    const viableTeamsByBoss = {};
    
    for (const boss of selectedBossObjects) {
        viableTeamsByBoss[boss.name] = [];
        
        // First pass: normal scoring
        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            const score = scoreTeamForBoss(team, boss);
            
            if (score > 0) {
                viableTeamsByBoss[boss.name].push({ label, team, score });
            }
        }
        
        // Fallback: lenient mode if no viable teams
        if (viableTeamsByBoss[boss.name].length === 0) {
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const score = scoreTeamForBoss(team, boss, { lenient: true });
                
                if (score > 0) {
                    viableTeamsByBoss[boss.name].push({ label, team, score, lenient: true });
                }
            }
        }
        
        // Sort by score descending
        viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);
    }
    
    // Find exclusive combinations
    const combinations = findExclusiveCombinations(viableTeamsByBoss, selectedBossNames);
    
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

