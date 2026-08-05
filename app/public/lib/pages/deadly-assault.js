/**
 * Deadly Assault Team Builder - Client-side Logic
 * Finds optimal team allocations for 3 DA bosses
 */

import {
    getTeams, sortTeamByRole, getTeamLabel,
    extendTeamsWithUniversalUnits, teamsOverlap
} from '../common/team-builder.js';
import { scoreTeamForBoss, getBossWeaknesses, getBossShill, resolveBossVariation } from '../common/team-scorer.js';
import { createStrengthLabelHtml } from '../common/strength-rating.js';
import {
    decodeBosses, getBossesFromUrl, generateShareUrlWithBosses,
    encodeBossVariations, decodeBossVariations, getBossVariationsFromUrl
} from '../common/roster-share.js';
import {
    initRoster, getUnitStates, getAllUnits,
    getInitials, getUnitElement, getCharacterImageUrl, getUniversalUnitNames
} from '../common/roster-ui.js';
import { isPrimaryDps, unitFingerprint, teamDpsFingerprint } from '../common/dps-buckets.js';
import { solveDeadlyAssault } from '../common/deadly-assault-solver.js';

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

// Active variation per boss ID: { "butcher": "raging", ... }
// Keys present only when a non-default variation is active.
let selectedBossVariations = {};

// Shared bosses mode - when true, localStorage is NOT used for page settings
let sharedBossesMode = false;

// Mobile touch mode for boss cards: null | "variant"
let bossCardTouchMode = null;

// Results
let showCreativeOptions = false;
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
            shareUrlGenerator: (unitStates, allUnits) =>
                generateShareUrlWithBosses(unitStates, allUnits, selectedBosses, selectedBossVariations)
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
        const variationsParam = getBossVariationsFromUrl();
        selectedBossVariations = variationsParam ? decodeBossVariations(variationsParam, allBosses) : {};
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
        selectedBossVariations,
        showCreativeOptions
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
            if (data.selectedBossVariations && typeof data.selectedBossVariations === 'object') {
                selectedBossVariations = data.selectedBossVariations;
            }
            if (typeof data.showCreativeOptions === 'boolean') {
                showCreativeOptions = data.showCreativeOptions;
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

    // Inject mobile mode toggle above the boss grid (once)
    let modeBar = document.getElementById('boss-mode-toggle');
    if (!modeBar) {
        modeBar = document.createElement('div');
        modeBar.id = 'boss-mode-toggle';
        modeBar.className = 'boss-mode-toggle-container';
        modeBar.innerHTML = `
            <button class="boss-mode-toggle-btn" data-mode="variant" title="Tap a boss to cycle its variation">
                Mode: Boss Variant
            </button>
            <p class="boss-mode-toggle-hint" id="boss-mode-toggle-hint">Bosses with a <span class="boss-variation-hint-dot">&#9679;</span> have alternate versions &mdash; long-press a boss to cycle, or turn this mode on to tap instead.</p>
        `;
        container.parentNode.insertBefore(modeBar, container);
        modeBar.addEventListener('click', handleBossModeToggle);
    }

    // Filter out bosses with available=false
    const availableBosses = allBosses.filter(boss => boss.available !== false);
    container.innerHTML = availableBosses.map(boss => createBossCard(boss)).join('');

    // Only show the mode toggle (and hints) when at least one boss has an enabled variation
    const anyHasVariants = availableBosses.some(boss => getBossEnabledVariationKeys(boss).length > 0);
    modeBar.style.display = anyHasVariants ? '' : 'none';

    const hint = document.getElementById('boss-variation-hint');
    if (hint) {
        hint.style.display = anyHasVariants ? '' : 'none';
    }
}

function getBossEnabledVariationKeys(boss) {
    if (!boss.variations) return [];
    return Object.entries(boss.variations)
        .filter(([, v]) => v.enabled !== false)
        .map(([key]) => key);
}

function getBossVariationLabel(boss, variationId) {
    if (!variationId) return null;
    const resolved = resolveBossVariation(boss, variationId);
    const shill = getBossShill(resolved);
    if (shill) return shill.charAt(0).toUpperCase() + shill.slice(1);
    return variationId.charAt(0).toUpperCase() + variationId.slice(1);
}

function createBossCard(boss) {
    const isSelected = selectedBosses.includes(boss.id);
    const activeVariationId = selectedBossVariations[boss.id] || null;
    const resolvedBoss = activeVariationId ? resolveBossVariation(boss, activeVariationId) : boss;

    const initials = getInitials(resolvedBoss.shortName || boss.shortName);
    const weaknessClass = getWeaknessGradientClass(getBossWeaknesses(resolvedBoss));
    const imageUrl = getBossImageUrl(boss.id);

    const isMirrored = !!activeVariationId;
    const imgClass = `boss-avatar-img${isMirrored ? ' boss-avatar-img--mirrored' : ''}`;

    const avatarHtml = imageUrl
        ? `<img class="${imgClass}" src="${imageUrl}" alt="${boss.shortName}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="boss-initials" style="display:none">${initials}</span>`
        : `<span class="boss-initials">${initials}</span>`;

    const variationLabel = getBossVariationLabel(boss, activeVariationId);
    const badgeHtml = variationLabel
        ? `<div class="boss-variation-badge">${variationLabel}</div>`
        : '';

    const hasVariations = getBossEnabledVariationKeys(boss).length > 0;
    const displayName = resolvedBoss.shortName || boss.shortName;

    return `
        <button type="button" class="boss-card ${weaknessClass} ${isSelected ? 'selected' : ''} ${hasVariations ? 'has-variations' : ''}" 
                data-boss-id="${boss.id}" 
                aria-pressed="${isSelected}"
                aria-label="${displayName} - Weak to ${getBossWeaknesses(resolvedBoss).join(', ')}${activeVariationId ? ' (variant: ' + activeVariationId + ')' : ''}">
            <div class="boss-avatar">
                ${avatarHtml}
                ${badgeHtml}
            </div>
            <div class="boss-name">${displayName}</div>
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
    const bossGrid = document.getElementById('boss-grid');
    bossGrid.addEventListener('click', handleBossClick);
    bossGrid.addEventListener('contextmenu', handleBossRightClick);

    addLongPressToGrid(bossGrid);

    document.getElementById('run-btn').addEventListener('click', runOptimization);
    
    document.getElementById('da-variations-checkbox').addEventListener('change', (e) => {
        showCreativeOptions = e.target.checked;
        savePageToStorage();
        if (lastResults) {
            displayResults(lastResults, false);
        }
    });
}

function addLongPressToGrid(bossGrid) {
    let longPressTimer = null;
    let longPressTriggered = false;

    bossGrid.addEventListener('touchstart', (e) => {
        longPressTriggered = false;
        const card = e.target.closest('.boss-card');
        if (!card) return;
        longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            if (window.navigator.vibrate) window.navigator.vibrate(50);
            cycleBossVariation(card.dataset.bossId);
        }, 500);
    }, { passive: true });

    bossGrid.addEventListener('touchend', (e) => {
        clearTimeout(longPressTimer);
        if (longPressTriggered) {
            e.preventDefault();
        }
    }, { passive: false });

    bossGrid.addEventListener('touchmove', () => {
        clearTimeout(longPressTimer);
    }, { passive: true });
}

function handleBossModeToggle(e) {
    const btn = e.target.closest('.boss-mode-toggle-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (bossCardTouchMode === mode) {
        bossCardTouchMode = null;
        btn.classList.remove('active');
    } else {
        document.querySelectorAll('.boss-mode-toggle-btn').forEach(b => b.classList.remove('active'));
        bossCardTouchMode = mode;
        btn.classList.add('active');
    }
}

function handleBossClick(e) {
    const card = e.target.closest('.boss-card');
    if (!card) return;

    const bossId = card.dataset.bossId;

    // In "variant" touch mode, tap cycles the variation instead of selecting
    if (bossCardTouchMode === 'variant') {
        cycleBossVariation(bossId);
        return;
    }

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

function handleBossRightClick(e) {
    const card = e.target.closest('.boss-card');
    if (!card) return;
    e.preventDefault();
    cycleBossVariation(card.dataset.bossId);
}

function cycleBossVariation(bossId) {
    const boss = allBosses.find(b => b.id === bossId);
    if (!boss || !boss.variations) return;

    const variationKeys = getBossEnabledVariationKeys(boss);
    if (variationKeys.length === 0) return;

    // Cycle: default → variation[0] → variation[1] → ... → default
    const currentVariation = selectedBossVariations[bossId] || null;
    const currentIndex = currentVariation ? variationKeys.indexOf(currentVariation) : -1;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= variationKeys.length) {
        delete selectedBossVariations[bossId];
    } else {
        selectedBossVariations[bossId] = variationKeys[nextIndex];
    }

    const activeVariationId = selectedBossVariations[bossId] || null;
    const resolvedBoss = activeVariationId ? resolveBossVariation(boss, activeVariationId) : boss;

    // Surgical DOM update so the CSS image-flip transition can fire smoothly.
    const card = document.querySelector(`.boss-card[data-boss-id="${bossId}"]`);
    if (card) {
        // 1. Toggle the mirror class on the existing <img> (CSS transition fires here)
        const img = card.querySelector('.boss-avatar-img');
        if (img) {
            img.classList.toggle('boss-avatar-img--mirrored', !!activeVariationId);
        }

        // 2. Update the variation badge inside the avatar
        const avatarEl = card.querySelector('.boss-avatar');
        const existingBadge = card.querySelector('.boss-variation-badge');
        const variationLabel = getBossVariationLabel(boss, activeVariationId);
        if (variationLabel) {
            if (existingBadge) {
                existingBadge.textContent = variationLabel;
            } else if (avatarEl) {
                const newBadge = document.createElement('div');
                newBadge.className = 'boss-variation-badge';
                newBadge.textContent = variationLabel;
                avatarEl.appendChild(newBadge);
            }
        } else if (existingBadge) {
            existingBadge.remove();
        }

        // 3. Update the boss name text
        const nameEl = card.querySelector('.boss-name');
        if (nameEl) {
            nameEl.textContent = resolvedBoss.shortName || boss.shortName;
        }

        // 4. Swap weakness gradient class
        const newWeaknessClass = getWeaknessGradientClass(getBossWeaknesses(resolvedBoss));
        for (const cls of [...card.classList]) {
            if (cls.startsWith('weakness-')) card.classList.remove(cls);
        }
        card.classList.add(newWeaknessClass);

        // 5. Update aria-label
        const weakStr = getBossWeaknesses(resolvedBoss).join(', ');
        const varStr = activeVariationId ? ` (variant: ${activeVariationId})` : '';
        card.setAttribute('aria-label', `${resolvedBoss.shortName || boss.shortName} - Weak to ${weakStr}${varStr}`);
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
    // Resolve selected bosses to their active variations
    const selectedBossObjects = selectedBosses
        .map(id => {
            const boss = allBosses.find(b => b.id === id);
            if (!boss || boss.available === false) return null;
            const variationId = selectedBossVariations[id] || null;
            return variationId ? resolveBossVariation(boss, variationId) : boss;
        })
        .filter(Boolean);
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
        console.log('   Weaknesses:', getBossWeaknesses(boss));
        console.log('   Resistances:', boss.mechanics?.resistances ?? []);
        console.log('   Shill:', boss.mechanics?.shill || 'none');
        console.log('   Anti:', boss.mechanics?.anti || 'none');
        
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
    
    // Variations mode (standard score-sorted combinations) and Diverse mode
    // (DPS assignment as the first-class decision) share one solver so the
    // webapp and the deadly-assault CLI can never drift apart.
    const { combinations, diverseResults } = solveDeadlyAssault({
        viableTeamsByBoss,
        bossNames: selectedBossNames,
        bossObjects: selectedBossObjects,
        teamLabels,
        threeCharTeams,
        scoreLenient: (team, boss) => {
            const score = scoreTeamForBoss(team, boss, { lenient: true });
            return score > 0 ? score : null;
        },
        diverseLimit: DISPLAY_LIMIT,
        log: console.log
    });

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

function displayResults(results, scroll = true) {
    lastResults = results;
    const container = document.getElementById('results-container');
    const section = document.getElementById('results-section');

    // Update checkbox state
    const checkbox = document.getElementById('da-variations-checkbox');
    if (checkbox) checkbox.checked = showCreativeOptions;

    let combos;
    let creativeDisclaimer = '';
    if (showCreativeOptions) {
        combos = results.diverseResults || [];
        creativeDisclaimer = `<div class="lenient-notice">These results prioritize roster variety &mdash; each option uses a distinct DPS lineup. Individual assignments may not be the absolute strongest possible teams.</div>`;
    } else {
        combos = results.combinations.slice(0, DISPLAY_LIMIT + 5);
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
        
        container.innerHTML = `${lenientNotice}${creativeDisclaimer}
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
        const weaknessClass = getWeaknessGradientClass(getBossWeaknesses(boss));
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

