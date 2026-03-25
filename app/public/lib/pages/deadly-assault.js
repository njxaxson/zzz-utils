/**
 * Deadly Assault Team Builder - Client-side Logic
 * Finds optimal team allocations for 3 DA bosses
 */

import { 
    getTeams, sortTeamByRole, getTeamLabel,
    extendTeamsWithUniversalUnits, findExclusiveCombinations, teamsOverlap 
} from '../common/team-builder.js';
import { scoreTeamForBoss } from '../common/team-scorer.js';
import { createStrengthLabelHtml } from '../common/strength-rating.js';
import { 
    decodeBosses, getBossesFromUrl, generateShareUrlWithBosses 
} from '../common/roster-share.js';
import { 
    initRoster, getUnitStates, getAllUnits,
    getInitials, getUnitElement, getCharacterImageUrl, getUniversalUnitNames
} from '../common/roster-ui.js';
import {
    isPrimaryDps, unitFingerprint, getTeamDpsBuckets, teamDpsFingerprint,
    findDiverseStrategies as findDiverseStrategiesCore,
    DEFAULT_PER_BOSS_FLOOR_RATIO, DEFAULT_MIN_RESULTS_BEFORE_FLOOR
} from '../common/dps-buckets.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const COMBINATION_LIMIT = 25;
const DISPLAY_LIMIT = 5;
const MIN_UNITS_REQUIRED = 9;
const BOSSES_REQUIRED = 3;
const PAGE_STORAGE_KEY = 'zzz-deadly-assault';     // Page-specific settings

// ============================================================================
// STATE
// ============================================================================

let allBosses = [];

// Selected boss IDs
let selectedBosses = [];

// Shared bosses mode - when true, localStorage is NOT used for page settings
let sharedBossesMode = false;

// Results
let showVariations = false;
let lastResults = null;

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadData() {
    try {
        const bossesResponse = await fetch('./data/bosses.json');
        allBosses = await bossesResponse.json();

        await initRoster({
            containerSelector: '#roster-container',
            pageUrl: 'deadly-assault.html',
            onStateChange: () => savePageToStorage(),
            shareUrlGenerator: (unitStates, allUnits) => generateShareUrlWithBosses(unitStates, allUnits, selectedBosses)
        });
        
        loadBossState();
        renderPageUI();
    } catch (error) {
        console.error('Failed to load data:', error);
        showError('Failed to load game data. Please refresh the page.');
    }
}

function loadBossState() {
    const bossesParam = getBossesFromUrl();
    if (bossesParam !== null) {
        sharedBossesMode = true;
        const sharedBosses = decodeBosses(bossesParam, allBosses);
        if (sharedBosses) {
            selectedBosses = sharedBosses.filter(id => {
                const boss = allBosses.find(b => b.id === id);
                return boss && boss.available !== false;
            });
        } else {
            selectedBosses = [];
        }
    } else {
        sharedBossesMode = false;
        loadPageFromStorage();
    }
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================

function savePageToStorage() {
    // Do NOT save to localStorage when viewing shared bosses
    if (sharedBossesMode) {
        return;
    }
    
    const data = {
        selectedBosses,
        showVariations
    };
    localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify(data));
}

function loadPageFromStorage() {
    // Load page-specific settings
    try {
        const pageSaved = localStorage.getItem(PAGE_STORAGE_KEY);
        if (pageSaved) {
            const data = JSON.parse(pageSaved);
            
            if (data.selectedBosses) {
                selectedBosses = data.selectedBosses.filter(id => {
                    const boss = allBosses.find(b => b.id === id);
                    return boss && boss.available !== false;
                });
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
// UI RENDERING
// ============================================================================

function renderPageUI() {
    renderBossSection();
    setupEventListeners();
}

function renderBossSection() {
    const container = document.getElementById('boss-grid');
    if (!container) return;
    // Filter out bosses with available=false
    const availableBosses = allBosses.filter(boss => boss.available !== false);
    container.innerHTML = availableBosses.map(boss => createBossCard(boss)).join('');
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
    const boss = allBosses.find(b => b.id === bossId);
    if (!boss || !boss.image) {
        return null;
    }
    return boss.image;
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

// ============================================================================
// EVENT HANDLING
// ============================================================================

function setupEventListeners() {
    document.getElementById('boss-grid').addEventListener('click', handleBossClick);
    document.getElementById('run-btn').addEventListener('click', runOptimization);
    
    document.getElementById('da-variations-checkbox').addEventListener('change', (e) => {
        showVariations = e.target.checked;
        savePageToStorage();
        if (lastResults) {
            displayResults(lastResults, false);
        }
    });
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
    
    savePageToStorage();
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
    const universalUnitNames = getUniversalUnitNames();
    // Filter out unavailable bosses (shouldn't happen, but safety check)
    const selectedBossObjects = selectedBosses
        .map(id => allBosses.find(b => b.id === id))
        .filter(boss => boss && boss.available !== false);
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
    
    // Variations mode: standard score-sorted combinations
    let combinations = findExclusiveCombinations(viableTeamsByBoss, selectedBossNames);

    // Diverse mode: DPS assignment is the first-class decision
    let diverseResults = findDiverseStrategies(
        viableTeamsByBoss, selectedBossNames, DISPLAY_LIMIT
    );

    // Fallback: if no non-overlapping triples found, retry all bosses in lenient mode
    if (combinations.length === 0 && diverseResults.length === 0) {
        console.log('⚠️ No non-overlapping combinations found — retrying all bosses in lenient mode...');
        for (const boss of selectedBossObjects) {
            for (const label of teamLabels) {
                const team = threeCharTeams[label];
                const score = scoreTeamForBoss(team, boss, { lenient: true });
                if (score <= 0) continue;

                const existing = viableTeamsByBoss[boss.name].find(t => t.label === label);
                if (existing) {
                    if (score > existing.score) existing.score = score;
                    existing.lenient = true;
                } else {
                    viableTeamsByBoss[boss.name].push({ label, team, score, lenient: true });
                }
            }
            viableTeamsByBoss[boss.name].sort((a, b) => b.score - a.score);
            console.log(`   ${boss.name}: ${viableTeamsByBoss[boss.name].length} viable teams (after lenient)`);
        }

        combinations = findExclusiveCombinations(viableTeamsByBoss, selectedBossNames);
        diverseResults = findDiverseStrategies(
            viableTeamsByBoss, selectedBossNames, DISPLAY_LIMIT
        );
        console.log(`After lenient retry — Combinations: ${combinations.length}, Diverse: ${diverseResults.length}`);
    }

    console.log(`Combinations: ${combinations.length}, Diverse strategies: ${diverseResults.length}`);
    diverseResults.forEach((combo, i) => {
        const detail = combo.assignments.map(a => {
            const fp = teamDpsFingerprint(a.team);
            return `${a.boss}: ${a.label} (${a.score.toFixed(0)}) [${fp}]`;
        }).join(', ');
        console.log(`  #${i + 1} (total: ${combo.totalScore.toFixed(0)}): ${detail}`);
    });
    console.groupEnd();
    
    const lenientBosses = selectedBossObjects
        .filter(b => viableTeamsByBoss[b.name].some(t => t.lenient))
        .map(b => b.shortName || b.name);

    return {
        combinations: combinations.slice(0, COMBINATION_LIMIT),
        diverseResults,
        bosses: selectedBossObjects,
        totalFound: combinations.length,
        lenientBosses
    };
}

// ============================================================================
// RESULTS DISPLAY
// ============================================================================

// Carousel state
let currentResultIndex = 0;
let totalResults = 0;

function findDiverseStrategies(viableTeamsByBoss, bossNames, limit) {
    const result = findDiverseStrategiesCore(viableTeamsByBoss, bossNames, limit);
    console.log(`Diversity selection: ${result.totalStrategies} total strategies, per-boss floor ${result.perBossFloor.toFixed(0)} (enforced after ${DEFAULT_MIN_RESULTS_BEFORE_FLOOR} results)`);
    return result.selected;
}

function displayResults(results, scroll = true) {
    lastResults = results;
    const container = document.getElementById('results-container');
    const section = document.getElementById('results-section');

    // Update checkbox state
    const checkbox = document.getElementById('da-variations-checkbox');
    if (checkbox) checkbox.checked = showVariations;

    let combos;
    if (showVariations) {
        combos = results.combinations.slice(0, DISPLAY_LIMIT + 5);
    } else {
        combos = results.diverseResults || [];
    }
    
    if (combos.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <p>No valid team combinations found.</p>
                <p>Try adding more units to your roster or selecting different bosses.</p>
            </div>
        `;
    } else {
        totalResults = combos.length;
        currentResultIndex = 0;
        
        const slidesHtml = combos.map((combo, index) => 
            createResultSlide(combo, index, results.bosses)
        ).join('');

        const lenientNotice = results.lenientBosses && results.lenientBosses.length > 0
            ? `<div class="lenient-notice">* Limited roster — using lenient scoring for ${results.lenientBosses.join(', ')}.</div>`
            : '';
        
        container.innerHTML = `${lenientNotice}
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
                ${combos.map((_, i) => 
                    `<button class="carousel-dot ${i === 0 ? 'active' : ''}" onclick="goToResult(${i})" aria-label="Go to result ${i + 1}"></button>`
                ).join('')}
            </div>
            <div class="carousel-counter">
                <span id="current-result">1</span> of ${totalResults}
            </div>
        `;
    }
    
    section.style.display = 'block';
    if (scroll) section.scrollIntoView({ behavior: 'smooth' });
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
                ${createStrengthLabelHtml(assignment.score, assignment.team, { lenient: assignment.lenient })}
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

