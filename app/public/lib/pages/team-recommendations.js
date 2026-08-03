/**
 * Team Recommendations - Client-side Logic
 * Custom boss matchup: configure weaknesses, resistances, archetypes,
 * then find the top teams from the user's roster.
 */

import { 
    getTeams, 
    sortTeamByRole, 
    getTeamLabel,
    extendTeamsWithUniversalUnits
} from '../common/team-builder.js';
import { scoreTeamForBoss } from '../common/team-scorer.js';
import { isSubdps } from '../common/pull-engine.js';
import { createStrengthLabelHtml } from '../common/strength-rating.js';
import { 
    initRoster, getUnitStates, getAllUnits,
    getInitials, getUnitElement, getCharacterImageUrl, getUniversalUnitNames
} from '../common/roster-ui.js';
import { ELEMENTS, DPS_ROLES } from '../common/constants.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DPS_ARCHETYPES = DPS_ROLES;
const MIN_UNITS_REQUIRED = 3;
const PAGE_STORAGE_KEY = 'zzz-team-recommendations';
// Lumen isn't a real damage element — Lumen units morph their damage to a teammate's
// element via Attribute Mutation, so a boss can never be weak to or resist "Lumen" itself.
const BOSS_ELEMENTS = ELEMENTS.filter(e => e !== 'lumen');

// ============================================================================
// STATE
// ============================================================================

// Boss config
let selectedWeaknesses = [];
let selectedResistances = [];
let selectedArchetypes = [];

// Results
let resultLimit = 5;
let showVariations = false;
let lastResults = null;

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadData() {
    try {
        await initRoster({
            containerSelector: '#roster-container',
            pageUrl: 'team-recommendations.html',
            onStateChange: () => savePageToStorage()
        });
        loadPageFromStorage();
        renderPageUI();
    } catch (error) {
        console.error('Failed to load data:', error);
        showError('Failed to load game data. Please refresh the page.');
    }
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================

function savePageToStorage() {
    const data = {
        selectedWeaknesses,
        selectedResistances,
        selectedArchetypes,
        resultLimit,
        showVariations
    };
    localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify(data));
}

function loadPageFromStorage() {
    try {
        const saved = localStorage.getItem(PAGE_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (Array.isArray(data.selectedWeaknesses)) {
                selectedWeaknesses = data.selectedWeaknesses.filter(e => BOSS_ELEMENTS.includes(e));
            }
            if (Array.isArray(data.selectedResistances)) {
                selectedResistances = data.selectedResistances.filter(e => BOSS_ELEMENTS.includes(e));
            }
            if (Array.isArray(data.selectedArchetypes)) {
                selectedArchetypes = data.selectedArchetypes.filter(a => DPS_ARCHETYPES.includes(a));
            }
            if (typeof data.resultLimit === 'number') {
                resultLimit = data.resultLimit;
            }
            if (typeof data.showVariations === 'boolean') {
                showVariations = data.showVariations;
            }
        }
    } catch (e) {
        console.warn('Failed to load page state:', e);
    }
}

// ============================================================================
// BOSS OBJECT CONSTRUCTION
// ============================================================================

function buildCustomBoss() {
    let shill = null;
    let anti = [];
    
    const allSelected = selectedArchetypes.length === DPS_ARCHETYPES.length;
    const noneSelected = selectedArchetypes.length === 0;
    
    if (!allSelected && !noneSelected) {
        const deselected = DPS_ARCHETYPES.filter(a => !selectedArchetypes.includes(a));
        anti = deselected;
        
        if (selectedArchetypes.length === 1) {
            shill = selectedArchetypes[0];
        }
    }
    
    return {
        id: 'custom',
        name: 'Custom Boss',
        shortName: 'Custom Boss',
        favored: [],
        mechanics: {
            weaknesses: [...selectedWeaknesses],
            resistances: [...selectedResistances],
            shill,
            anti,
            assists: 1,
            shillIntensity: 1
        }
    };
}

// ============================================================================
// UI RENDERING
// ============================================================================

function renderPageUI() {
    applyBossConfigState();
    applyResultLimitState();
    setupEventListeners();
}

function applyBossConfigState() {
    // Apply weakness selections
    document.querySelectorAll('#weakness-toggles .element-toggle').forEach(btn => {
        const el = btn.dataset.element;
        btn.classList.toggle('active', selectedWeaknesses.includes(el));
    });
    
    // Apply resistance selections
    document.querySelectorAll('#resistance-toggles .element-toggle').forEach(btn => {
        const el = btn.dataset.element;
        btn.classList.toggle('active', selectedResistances.includes(el));
        btn.classList.toggle('disabled-by-weakness', selectedWeaknesses.includes(el));
        btn.disabled = selectedWeaknesses.includes(el);
    });
    
    // Apply archetype selections
    document.querySelectorAll('#archetype-toggles .archetype-toggle').forEach(btn => {
        btn.classList.toggle('active', selectedArchetypes.includes(btn.dataset.archetype));
    });
}

function applyResultLimitState() {
    document.querySelectorAll('#result-limit-toggle .filter-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.value) === resultLimit);
    });
    
    const variationsCheckbox = document.getElementById('show-variations');
    if (variationsCheckbox) variationsCheckbox.checked = showVariations;
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function setupEventListeners() {
    // Boss config: weaknesses
    document.querySelectorAll('#weakness-toggles .element-toggle').forEach(btn => {
        btn.addEventListener('click', () => handleWeaknessToggle(btn.dataset.element));
    });
    
    // Boss config: resistances
    document.querySelectorAll('#resistance-toggles .element-toggle').forEach(btn => {
        btn.addEventListener('click', () => handleResistanceToggle(btn.dataset.element));
    });
    
    // Boss config: archetypes
    document.querySelectorAll('#archetype-toggles .archetype-toggle').forEach(btn => {
        btn.addEventListener('click', () => handleArchetypeToggle(btn.dataset.archetype));
    });
    
    // Run button
    document.getElementById('run-btn').addEventListener('click', runRecommendations);
    
    // Result limit toggle
    document.querySelectorAll('#result-limit-toggle .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            resultLimit = parseInt(btn.dataset.value);
            applyResultLimitState();
            savePageToStorage();
            if (lastResults) displayResults(lastResults);
        });
    });
    
    // Show variations checkbox
    const variationsCheckbox = document.getElementById('show-variations');
    if (variationsCheckbox) {
        variationsCheckbox.addEventListener('change', () => {
            showVariations = variationsCheckbox.checked;
            savePageToStorage();
            if (lastResults) displayResults(lastResults);
        });
    }
}

// ============================================================================
// BOSS CONFIG HANDLERS
// ============================================================================

function handleWeaknessToggle(element) {
    const idx = selectedWeaknesses.indexOf(element);
    if (idx >= 0) {
        selectedWeaknesses.splice(idx, 1);
    } else {
        selectedWeaknesses.push(element);
        // Remove from resistances if present (mutual exclusion)
        const resIdx = selectedResistances.indexOf(element);
        if (resIdx >= 0) selectedResistances.splice(resIdx, 1);
    }
    applyBossConfigState();
    savePageToStorage();
}

function handleResistanceToggle(element) {
    if (selectedWeaknesses.includes(element)) return;
    
    const idx = selectedResistances.indexOf(element);
    if (idx >= 0) {
        selectedResistances.splice(idx, 1);
    } else {
        selectedResistances.push(element);
    }
    applyBossConfigState();
    savePageToStorage();
}

function handleArchetypeToggle(archetype) {
    const idx = selectedArchetypes.indexOf(archetype);
    if (idx >= 0) {
        selectedArchetypes.splice(idx, 1);
    } else {
        selectedArchetypes.push(archetype);
    }
    applyBossConfigState();
    savePageToStorage();
}

// ============================================================================
// VALIDATION
// ============================================================================

function validate() {
    const errors = [];
    
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
// RECOMMENDATION ALGORITHM
// ============================================================================

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

function runRecommendations() {
    const errors = validate();
    if (errors.length > 0) {
        showValidationErrors(errors);
        return;
    }
    hideValidationErrors();
    
    const btn = document.getElementById('run-btn');
    btn.disabled = true;
    btn.textContent = 'CALCULATING...';
    
    setTimeout(() => {
        try {
            const results = calculateRecommendations();
            lastResults = results;
            displayResults(results);
        } catch (error) {
            console.error('Recommendation failed:', error);
            showError('Failed to calculate recommendations. Try adjusting your selections.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Find Best Teams';
        }
    }, 50);
}

function calculateRecommendations() {
    const availableUnits = getAvailableUnits();
    const universalUnitNames = getUniversalUnitNames();
    const boss = buildCustomBoss();
    
    console.group('Custom Boss Recommendations');
    console.log('Boss config:', boss);
    console.log('Available units:', availableUnits.length);
    console.log('Universal units:', universalUnitNames);
    
    const allTeams = getTeams(availableUnits);
    
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
    
    const universalUnitObjects = availableUnits.filter(u => universalUnitNames.includes(u.name));
    if (universalUnitObjects.length > 0) {
        extendTeamsWithUniversalUnits(twoCharTeams, threeCharTeams, universalUnitObjects);
    }
    
    const teamLabels = Object.keys(threeCharTeams);
    console.log('Total 3-person teams:', teamLabels.length);
    
    // Score teams
    let viableTeams = [];
    let usedLenient = false;
    
    for (const label of teamLabels) {
        const team = threeCharTeams[label];
        const score = scoreTeamForBoss(team, boss);
        if (score > 0) {
            viableTeams.push({ label, team, score });
        }
    }
    
    console.log('Viable teams (strict):', viableTeams.length);
    
    // Fallback to lenient mode
    if (viableTeams.length === 0) {
        console.log('No strict results, trying lenient mode...');
        usedLenient = true;
        
        for (const label of teamLabels) {
            const team = threeCharTeams[label];
            const score = scoreTeamForBoss(team, boss, { lenient: true });
            if (score > 0) {
                viableTeams.push({ label, team, score });
            }
        }
        
        console.log('Viable teams (lenient):', viableTeams.length);
    }
    
    viableTeams.sort((a, b) => b.score - a.score);
    
    console.log('Top teams:', viableTeams.slice(0, 5).map(t => `${t.label} (${t.score})`));
    console.groupEnd();
    
    return {
        teams: viableTeams,
        boss,
        usedLenient,
        totalFound: viableTeams.length
    };
}

// ============================================================================
// RESULTS DISPLAY
// ============================================================================

const DPS_TAGS = DPS_ARCHETYPES; // ['attack', 'anomaly', 'rupture', 'armorer'] — single source

function getTeamPrimaryDpsNames(team) {
    return team
        .filter(u => u.tags.some(t => DPS_TAGS.includes(t)) && !isSubdps(u, team))
        .map(u => u.name);
}

function filterUniqueDps(teams) {
    const usedDps = new Set();
    const filtered = [];
    for (const entry of teams) {
        const primaryNames = getTeamPrimaryDpsNames(entry.team);
        if (primaryNames.some(name => usedDps.has(name))) continue;
        primaryNames.forEach(name => usedDps.add(name));
        filtered.push(entry);
    }
    return filtered;
}

function displayResults(results) {
    const container = document.getElementById('recommendations-list');
    const section = document.getElementById('results-section');
    const countEl = document.getElementById('results-count');
    
    if (results.teams.length === 0) {
        countEl.textContent = '';
        container.innerHTML = `
            <div class="no-results">
                <p>No valid teams found for this boss configuration.</p>
                <p>Try adding more units to your roster or adjusting the boss settings.</p>
            </div>
        `;
    } else {
        const pool = showVariations ? results.teams : filterUniqueDps(results.teams);
        const effectiveLimit = showVariations ? resultLimit + 5 : resultLimit;
        const displayTeams = pool.slice(0, effectiveLimit);
        countEl.textContent = `Showing ${displayTeams.length} of ${pool.length} viable teams`;
        
        const lenientNote = results.usedLenient 
            ? '<div class="lenient-notice">No ideal teams found — showing best available options (lenient scoring).</div>' 
            : '';
        
        container.innerHTML = lenientNote + displayTeams.map((entry, index) => 
            createResultRow(entry, index)
        ).join('');
    }
    
    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
}

function createResultRow(entry, index) {
    const teamHtml = entry.team.map(unit => createResultUnitCard(unit)).join('');
    
    return `
        <div class="recommendation-row">
            <div class="recommendation-rank">#${index + 1}</div>
            <div class="recommendation-team">
                ${teamHtml}
            </div>
            <div class="recommendation-strength">
                ${createStrengthLabelHtml(entry.score, entry.team)}
            </div>
            <div class="recommendation-score">${Math.round(entry.score)}</div>
        </div>
    `;
}

function createResultUnitCard(unit) {
    const element = getUnitElement(unit);
    const initials = getInitials(unit.name);
    const imageUrl = getCharacterImageUrl(unit.id);
    
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
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', loadData);
