/**
 * Deadly Assault Team Builder - Client-side Logic
 * Finds optimal team allocations for 3 DA bosses
 */

import { scoreTeamForBoss, getBossWeaknesses, getBossShill, resolveBossVariation } from '../common/team-scorer.js';
import { createStrengthLabelHtml, getStrengthRating } from '../common/strength-rating.js';
import { getRosterUnits, buildRosterTeams, scoreCalibrated, scoreTeamsForBoss, requireCalibration } from '../common/team-pool.js';
import { createAgentPicker } from '../common/agent-picker.js';
import { joinList } from '../common/text.js';
import {
    createEmptyPlan, isPlanEmpty, sanitizePicks, getPlanProblems, planToPins, getEffectiveUnitStates, PLAN_TEAM_SIZE
} from '../common/custom-plan.js';
import { createUnitCard, getWeaknessGradientClass } from '../common/team-card.js';
import { favoriteStarHtml, bindFavoriteStars, getFavoritePresets, teamTilesHtml } from '../common/favorite-star.js';
import {
    decodeBosses, getBossesFromUrl, generateShareUrlWithBosses,
    encodeBossVariations, decodeBossVariations, getBossVariationsFromUrl,
    decodePlan, getPlanFromUrl
} from '../common/roster-share.js';
import {
    initRoster, getUnitStates, getAllUnits, getCalibration,
    getInitials, getUniversalUnitNames
} from '../common/roster-ui.js';
import { isPrimaryDps, unitFingerprint, teamDpsFingerprint } from '../common/dps-buckets.js';
import { solveDeadlyAssault, getCandidateTeamsForBoss } from '../common/deadly-assault-solver.js';

// Constants

const COMBINATION_LIMIT = 25;
const DISPLAY_LIMIT = 5;
const MIN_UNITS_REQUIRED = 9;
const BOSSES_REQUIRED = 3;
const PAGE_STORAGE_KEY = 'zzz-deadly-assault';     // Page-specific settings

// State

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

// Custom plan: { enabled, picks: { [bossId]: unitId[] } }. Picks outlive the toggle, so a
// player can switch the plan off and on again without re-entering it.
let plan = createEmptyPlan();
let planPicker = null;

// Results
let showCreativeOptions = false;
let lastResults = null;

// Data Loading

async function loadData() {
    try {
        const bossesResponse = await fetch('./data/bosses.json');
        allBosses = await bossesResponse.json();

        await initRoster({
            containerSelector: '#roster-container',
            pageUrl: 'deadly-assault.html',
            onStateChange: () => { savePageToStorage(); planPicker?.refresh(); },
            shareUrlGenerator: (unitStates, allUnits) =>
                generateShareUrlWithBosses(unitStates, allUnits, selectedBosses, selectedBossVariations,
                    plan.enabled ? plan.picks : null)
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

        // A plan in the link means the sharer was using it, so it arrives switched on.
        const picks = sanitizePicks(decodePlan(getPlanFromUrl(), allBosses), getAllUnits(), allBosses);
        plan = { enabled: !isPlanEmpty({ picks }), picks };
    } else {
        sharedBossesMode = false;
        loadPageFromStorage();
    }
}

// Local Storage

function savePageToStorage() {
    // Do NOT save to localStorage when viewing shared bosses
    if (sharedBossesMode) {
        return;
    }
    
    const data = {
        selectedBosses,
        selectedBossVariations,
        showCreativeOptions,
        plan
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
            if (data.plan && typeof data.plan === 'object') {
                plan = {
                    enabled: data.plan.enabled === true,
                    picks: sanitizePicks(data.plan.picks, getAllUnits(), allBosses)
                };
            }
        }
    } catch (e) {
        console.warn('Failed to load page state:', e);
    }
}

// UI Rendering

function renderPageUI() {
    renderBossSection();
    setupPlan();
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

// Custom plan

function setupPlan() {
    planPicker = createAgentPicker({
        getUnits: getAllUnits,
        isOwned: id => !!getUnitStates()[id]?.owned,
        allowUnowned: true,
        title: () => 'Choose an agent',
        isConflict: (id, ctx) => isPlannedElsewhere(id, ctx.key),
        getPresets: () => getFavoritePresets(getAllUnits())
    });

    document.getElementById('da-plan-toggle').addEventListener('change', e => {
        plan.enabled = e.target.checked;
        savePageToStorage();
        renderPlan();
    });
    document.getElementById('da-plan-clear').addEventListener('click', () => {
        plan.picks = {};
        savePageToStorage();
        renderPlan();
    });
    renderPlan();
}

// The same agent on two selected bosses is the one input that cannot be submitted.
function isPlannedElsewhere(unitId, bossId) {
    return selectedBosses.some(id => id !== bossId && (plan.picks[id] ?? []).includes(unitId));
}

function createResultBossTileHtml(boss) {
    const weaknessClass = getWeaknessGradientClass(getBossWeaknesses(boss));
    const imageUrl = getBossImageUrl(boss.id);
    const initials = getInitials(boss.shortName);
    const avatarHtml = imageUrl
        ? `<img class="boss-avatar-img" src="${imageUrl}" alt="${boss.shortName}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="boss-initials" style="display:none">${initials}</span>`
        : `<span class="boss-initials">${initials}</span>`;
    return `
        <div class="result-boss-tile ${weaknessClass}">
            <div class="result-boss-avatar">
                ${avatarHtml}
            </div>
            <div class="boss-name">${boss.shortName}</div>
        </div>`;
}

function updateClearButton() {
    document.getElementById('da-plan-clear').disabled = isPlanEmpty(plan);
    updateCreativeOption();
}

// "More creative options" has nothing to offer once the player is planning (see displayResults),
// so it is disabled and hidden while a non-empty plan is on, or for results that came from one.
// The saved preference is left alone, so it returns when the plan is cleared.
function updateCreativeOption() {
    const checkbox = document.getElementById('da-variations-checkbox');
    if (!checkbox) return;
    const hidden = (plan.enabled && !isPlanEmpty(plan)) || !!lastResults?.planned;
    checkbox.disabled = hidden;
    checkbox.closest('.variations-checkbox').style.display = hidden ? 'none' : '';
}

function setPicks(bossId, ids) {
    if (ids.length > 0) plan.picks[bossId] = ids;
    else delete plan.picks[bossId];
    savePageToStorage();
    hideValidationErrors();
    updateClearButton();
    renderPlanStars();
}

// Always three rows: a boss that is not chosen yet shows a placeholder and cannot take picks.
function renderPlan() {
    const toggle = document.getElementById('da-plan-toggle');
    const body = document.getElementById('da-plan-body');
    const rows = document.getElementById('da-plan-rows');
    toggle.checked = plan.enabled;
    body.hidden = !plan.enabled;
    document.getElementById('da-plan-clear').hidden = !plan.enabled;
    document.getElementById('da-plan-description').hidden = plan.enabled;
    document.getElementById('da-plan-section').classList.toggle('active', plan.enabled);

    planPicker.clearGroups();
    rows.innerHTML = '';
    if (!plan.enabled) {
        updateCreativeOption();
        return;
    }

    const bossObjects = getSelectedBossObjects();
    for (let i = 0; i < BOSSES_REQUIRED; i++) {
        const boss = bossObjects[i];
        const row = document.createElement('div');
        row.className = 'da-row result-card da-plan-row';
        if (boss) {
            row.innerHTML = `
                ${createResultBossTileHtml(boss)}
                <div class="da-plan-divider"></div>
                <div class="da-row-team"></div>
                <div class="da-plan-save" data-boss="${boss.id}"></div>`;
        } else {
            row.classList.add('da-plan-row--empty');
            row.innerHTML = `
                <div class="result-boss-tile da-plan-boss-empty"><div class="result-boss-avatar"><span>?</span></div><div class="boss-name">Select a boss</div></div>
                <div class="da-plan-divider"></div>
                <div class="da-row-team"></div>
                <div class="da-plan-save"></div>`;
        }
        rows.appendChild(row);

        const bossId = boss?.id;
        planPicker.mountSlots(row.querySelector('.da-row-team'), {
            key: bossId ?? `empty-${i}`,
            getIds: () => (bossId && plan.picks[bossId]) || [],
            setIds: ids => setPicks(bossId, ids),
            max: PLAN_TEAM_SIZE,
            fixedSlots: true,
            disabled: !bossId,
            anchorEl: row,
            addLabel: () => 'Select agent'
        });
    }
    renderPlanStars();
    updateClearButton();
}

// A full team can be saved right from its plan row, as on Agent Teams.
function renderPlanStars() {
    document.querySelectorAll('#da-plan-rows .da-plan-save[data-boss]').forEach(el => {
        const ids = plan.picks[el.dataset.boss] ?? [];
        el.innerHTML = ids.length === PLAN_TEAM_SIZE ? favoriteStarHtml(ids) : '';
    });
}

// Event Handling

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
        selectedBosses.push(bossId);
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
    }
    
    savePageToStorage();
    renderPlan();
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
    renderPlan();
}

// Validation

function validate() {
    const errors = [];
    
    if (selectedBosses.length !== BOSSES_REQUIRED) {
        errors.push(`Please select exactly ${BOSSES_REQUIRED} bosses (currently ${selectedBosses.length} selected)`);
    }
    
    const availableUnits = getAvailableUnits(getActivePins());
    if (availableUnits.length < MIN_UNITS_REQUIRED) {
        errors.push(`Need at least ${MIN_UNITS_REQUIRED} available units (currently ${availableUnits.length})`);
    }

    errors.push(...getPlanProblems(plan, selectedBosses, getAllUnits(), allBosses));
    
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

// Optimization Algorithm

// The owned roster, plus any agent the plan pins (so a player can plan around one they lack).
function getAvailableUnits(pinsByBoss = null) {
    return getRosterUnits(getAllUnits(), getEffectiveUnitStates(getUnitStates(), pinsByBoss));
}

function getSelectedBossObjects() {
    return selectedBosses
        .map(id => {
            const boss = allBosses.find(b => b.id === id);
            if (!boss || boss.available === false) return null;
            const variationId = selectedBossVariations[id] || null;
            return variationId ? resolveBossVariation(boss, variationId) : boss;
        })
        .filter(Boolean);
}

// The solver's pins for the current plan, or null when the plan is off or empty.
function getActivePins() {
    return planToPins(plan, getSelectedBossObjects());
}

function runOptimization() {
    const errors = validate();
    if (errors.length > 0) {
        showValidationErrors(errors);
        return;
    }
    hideValidationErrors();
    
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
    const selectedBossObjects = getSelectedBossObjects();
    const pinsByBoss = planToPins(plan, selectedBossObjects);
    const availableUnits = getAvailableUnits(pinsByBoss);
    const universalUnitNames = getUniversalUnitNames();
    // Deadly Assault compares teams of DIFFERENT archetypes across 3 bosses at once (banding,
    // totalScore sum, perBossFloor), so every `.score` here must be CALIBRATED, not raw.
    const calibration = requireCalibration(getCalibration());
    const selectedBossNames = selectedBossObjects.map(b => b.name);
    
    //TODO Decide if this should remain
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
    
    const threeCharTeams = buildRosterTeams(availableUnits, universalUnitNames);
    const teamLabels = Object.keys(threeCharTeams);
    
    console.log('🔢 Teams after universal extension:');
    console.log(`   3-person teams: ${teamLabels.length}`);
    console.log('📝 All 3-person team labels:', teamLabels);
    
    const viableTeamsByBoss = {};
    
    for (const boss of selectedBossObjects) {
        console.group(`👹 Scoring teams for: ${boss.name}`);
        console.log('   Weaknesses:', getBossWeaknesses(boss));
        console.log('   Resistances:', boss.mechanics?.resistances ?? []);
        console.log('   Shill:', boss.mechanics?.shill || 'none');
        console.log('   Anti:', boss.mechanics?.anti || 'none');
        
        // A pinned boss scores only the teams its pins allow, not the whole roster.
        const candidates = pinsByBoss
            ? getCandidateTeamsForBoss({ bossName: boss.name, pinsByBoss, threeCharTeams, unitPool: availableUnits })
            : threeCharTeams;
        const { viable, disqualified: disqualifiedTeams, usedLenient } =
            scoreTeamsForBoss(candidates, boss, calibration);
        viableTeamsByBoss[boss.name] = viable;
        
        console.log(`   ✅ Viable teams: ${usedLenient ? 0 : viable.length}`);
        console.log(`   ❌ Disqualified teams: ${disqualifiedTeams.length}`);
        
        if (usedLenient && disqualifiedTeams.length > 0) {
            console.log('   🔍 Debugging disqualified teams:');
            for (const dt of disqualifiedTeams.slice(0, 5)) {
                const debugResult = scoreTeamForBoss(dt.team, boss, { debug: true });
                console.log(`      ${dt.label}:`, debugResult);
            }
            console.log('   All teams were disqualified. Sample disqualified teams:');
            console.table(disqualifiedTeams.slice(0, 10).map(t => ({ label: t.label, score: t.score })));
            console.log(`   ⚠️ No viable teams - lenient mode viable teams: ${viable.length}`);
        } else if (viable.length > 0) {
            console.log('   Top viable teams:');
            console.table(viable.slice(0, 5).map(t => ({ label: t.label, score: t.score.toFixed(1), raw: t.raw.toFixed(1), archetype: t.archetype })));
        }
        
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
            // Contract kept as a bare number — matches the CLI's implementation of this same
            // callback against the same shared solver (deadly-assault-solver.js).
            const scored = scoreCalibrated(team, boss, { lenient: true }, calibration);
            return scored ? scored.score : null;
        },
        diverseLimit: DISPLAY_LIMIT,
        log: console.log,
        pinsByBoss,
        unitPool: availableUnits
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
        lenientBosses,
        planned: !!pinsByBoss
    };
}

// Results Display

// Carousel state
let currentResultIndex = 0;
let totalResults = 0;

function displayResults(results, scroll = true) {
    lastResults = results;
    const container = document.getElementById('results-container');
    const section = document.getElementById('results-section');

    const checkbox = document.getElementById('da-variations-checkbox');
    if (checkbox) checkbox.checked = showCreativeOptions;
    updateCreativeOption();

    let combos;
    let creativeDisclaimer = '';
    // A planned solve is already the player's own creativity, and DPS bucketing over many pins
    // gives confusing results, so planned results always use the ranked view.
    if (showCreativeOptions && !results.planned) {
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

        const lenientReason = results.planned ? 'Your plan needed' : 'Limited roster — using';
        const lenientNotice = results.lenientBosses && results.lenientBosses.length > 0
            ? `<div class="lenient-notice">* ${lenientReason} lenient scoring for ${joinList(results.lenientBosses)}.</div>`
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
    
    const track = document.querySelector('.carousel-track');
    track.style.transform = `translateX(-${index * 100}%)`;
    
    document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
    
    document.getElementById('current-result').textContent = index + 1;
    
    document.querySelector('.carousel-prev').disabled = index === 0;
    document.querySelector('.carousel-next').disabled = index === totalResults - 1;
}

function createResultSlide(combo, index, bosses) {
    const rowsHtml = combo.assignments.map(assignment => {
        const boss = bosses.find(b => b.name === assignment.boss);
        const teamHtml = teamTilesHtml(assignment.team, createUnitCard);
        const band = getStrengthRating(assignment.score, assignment.team, { unscorable: assignment.unscorable, lenient: assignment.lenient }).label.toLowerCase();
        
        return `
            <div class="da-row result-card band-${band}">
                ${createResultBossTileHtml(boss)}
                <div class="da-row-meta">
                    ${createStrengthLabelHtml(assignment.score, assignment.team, { lenient: assignment.lenient, unscorable: assignment.unscorable })}
                    ${favoriteStarHtml(assignment.team)}
                </div>
                <div class="da-row-team">
                    ${teamHtml}
                </div>
            </div>
        `;
    }).join('');
    
    return `
        <div class="carousel-slide">
            <div class="result-label">Option #${index + 1}</div>
            <div class="da-rows">
                ${rowsHtml}
            </div>
        </div>
    `;
}

// Global Exports (for onclick handlers)

window.prevResult = prevResult;
window.nextResult = nextResult;
window.goToResult = goToResult;

// Initialization

document.addEventListener('DOMContentLoaded', () => {
    bindFavoriteStars(document.body);
    loadData();
});

