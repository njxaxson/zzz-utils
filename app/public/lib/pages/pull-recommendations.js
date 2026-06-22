/**
 * Pull Recommendations - Client-side Logic
 * Analyzes roster gaps and recommends limited S-rank characters to pull.
 */

import {
    initRoster, getUnitStates, getAllUnits,
    getInitials, getCharacterImageUrl
} from '../common/roster-ui.js';

import { analyze, getUnitElement, checkTeamDependencies } from '../common/pull-engine.js';

const PAGE_STORAGE_KEY = 'zzz-pull-recommendations';

// Banner schedule tuning (edit by hand as the meta shifts)
const BANNER_BUMP_WINDOW_MIN_TOTAL = 6;
const BANNER_BUMP_WINDOW_MIN_FROM_UPCOMING = 2;
const BANNER_CARD_SCORE_BUMP = 8;

let resultLimit = 5;
let lastResults = null;
/** @type {{ active: string[], upcoming: string[] } | null} */
let bannersData = null;

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadBanners() {
    try {
        const res = await fetch('data/banners.json');
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || typeof data !== 'object') return null;
        if (!Array.isArray(data.active) || !Array.isArray(data.upcoming)) return null;
        return { active: data.active, upcoming: data.upcoming };
    } catch {
        return null;
    }
}

/**
 * Globally dedupe IDs: active order first, then upcoming; later duplicates removed.
 * @returns {{ activeIds: string[], upcomingIds: string[], fullOrder: string[] }}
 */
function normalizeBannerSchedule(raw) {
    const seen = new Set();
    const activeIds = [];
    for (const id of raw.active) {
        if (typeof id !== 'string') continue;
        const k = id.trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        activeIds.push(k);
    }
    const upcomingIds = [];
    for (const id of raw.upcoming) {
        if (typeof id !== 'string') continue;
        const k = id.trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        upcomingIds.push(k);
    }
    return { activeIds, upcomingIds, fullOrder: [...activeIds, ...upcomingIds] };
}

/**
 * All active IDs, then upcoming until min total length and min count from upcoming are met.
 */
function computeBannerBumpWindow(activeIds, upcomingIds) {
    const W = [...activeIds];
    let fromUpcoming = 0;
    for (const id of upcomingIds) {
        W.push(id);
        fromUpcoming++;
        if (
            W.length >= BANNER_BUMP_WINDOW_MIN_TOTAL &&
            fromUpcoming >= BANNER_BUMP_WINDOW_MIN_FROM_UPCOMING
        ) {
            break;
        }
    }
    return W;
}

function buildBannerIndexMap(fullOrder) {
    const m = new Map();
    fullOrder.forEach((id, i) => m.set(id, i));
    return m;
}

function sortRecommendationUnits(units, bannerIndexMap) {
    const indexed = units.map((u, i) => ({ u, i }));
    const onBanner = indexed.filter(x => bannerIndexMap.has(x.u.id));
    const offBanner = indexed.filter(x => !bannerIndexMap.has(x.u.id));
    onBanner.sort((a, b) => bannerIndexMap.get(a.u.id) - bannerIndexMap.get(b.u.id));
    offBanner.sort((a, b) => a.i - b.i);
    return [...onBanner.map(x => x.u), ...offBanner.map(x => x.u)];
}

/**
 * @param {ReturnType<typeof analyze>['recommendations']} recommendations
 * @param {string[]} bumpWindowIds
 * @param {Map<string, number>} bannerIndexMap
 */
function applyBannerRecommendationOrdering(recommendations, bumpWindowIds, bannerIndexMap) {
    const PRIORITY_RANK = { 'High': 2, 'Medium': 1, 'Low': 0 };
    const bumpSet = new Set(bumpWindowIds);
    const decorated = recommendations.map((rec, origIdx) => {
        const units = sortRecommendationUnits(rec.units, bannerIndexMap);
        const touchesBumpWindow = units.some(u => bumpSet.has(u.id));
        // Banner bump only applies within the same priority tier — it cannot promote
        // a Medium recommendation above a High one.
        const sortScore = rec.score + (touchesBumpWindow ? BANNER_CARD_SCORE_BUMP : 0);
        const priorityRank = PRIORITY_RANK[rec.priority] ?? 0;
        return { rec: { ...rec, units }, sortScore, priorityRank, origIdx };
    });
    decorated.sort((a, b) => {
        // Primary sort: priority tier (High > Medium > Low)
        if (b.priorityRank !== a.priorityRank) return b.priorityRank - a.priorityRank;
        // Secondary: banner-bumped score within the same priority
        if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
        return a.origIdx - b.origIdx;
    });
    return decorated.map(d => d.rec);
}

/**
 * Best gap priority for a unit across all gaps.
 * Reads gap.priority set by the engine's assignPriority(), which uses relative
 * thresholds for loaded rosters — ensures tile verdicts match recommendation labels.
 */
function bannerTileVerdictClass(unitId, allGaps, ownedUnits, allUnits) {
    const RANK = { 'High': 2, 'Medium': 1, 'Low': 0 };
    const ORDERED = ['high', 'medium', 'low', 'no'];
    let best = -1;
    let bestPriority = null;
    for (const gap of allGaps) {
        if (!gap.units?.some(u => u.id === unitId)) continue;
        const rank = RANK[gap.priority] ?? -1;
        if (rank > best) {
            best = rank;
            bestPriority = gap.priority;
        }
    }
    if (bestPriority === null) return 'no';

    const verdict = bestPriority.toLowerCase();
    const unit = allUnits.find(u => u.id === unitId);
    if (unit && ownedUnits && allUnits) {
        const dep = checkTeamDependencies(unit, ownedUnits, allUnits);
        if (dep.hasUnmetDependency || dep.cannotFormTeam) {
            const idx = ORDERED.indexOf(verdict);
            const severe = dep.cannotFormTeam || dep.cannotActivateBuffs;
            const levels = severe ? 2 : 1;
            return ORDERED[Math.min(idx + levels, ORDERED.length - 1)];
        }
    }
    return verdict;
}

function verdictLabel(verdictClass) {
    if (verdictClass === 'no') return 'No';
    return verdictClass.charAt(0).toUpperCase() + verdictClass.slice(1);
}

async function loadData() {
    try {
        await Promise.all([
            initRoster({
                containerSelector: '#roster-container',
                pageUrl: 'pull-recommendations.html',
                lockedUnits: ['nicole', 'anby', 'billy']
            }),
            loadBanners().then((data) => {
                bannersData = data;
            })
        ]);
        loadPageFromStorage();
        setupEventListeners();
    } catch (error) {
        console.error('Failed to load data:', error);
        showError('Failed to load game data. Please refresh the page.');
    }
}

function savePageToStorage() {
    localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify({ resultLimit }));
}

function loadPageFromStorage() {
    try {
        const saved = localStorage.getItem(PAGE_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (typeof data.resultLimit === 'number') resultLimit = data.resultLimit;
        }
    } catch (e) {
        console.warn('Failed to load page state:', e);
    }
}

function setupEventListeners() {
    document.getElementById('run-btn').addEventListener('click', runAnalysis);

    document.querySelectorAll('#result-limit-toggle .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            resultLimit = parseInt(btn.dataset.value);
            applyResultLimitState();
            savePageToStorage();
            if (lastResults) displayResults(lastResults);
        });
    });

    applyResultLimitState();
}

function applyResultLimitState() {
    document.querySelectorAll('#result-limit-toggle .filter-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.value) === resultLimit);
    });
}

// ============================================================================
// ANALYSIS
// ============================================================================

function runAnalysis() {
    hideValidationErrors();

    const allUnits = getAllUnits();
    const unitStates = getUnitStates();
    const ownedUnits = allUnits.filter(u => unitStates[u.id]?.owned);

    if (ownedUnits.length < 3) {
        showValidationErrors(['Need at least 3 units in your roster to analyze.']);
        return;
    }

    const btn = document.getElementById('run-btn');
    btn.disabled = true;
    btn.textContent = 'ANALYZING...';

    setTimeout(() => {
        try {
            const analyzed = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 10 });
            let recommendations = analyzed.recommendations;
            let bannerMeta = null;

            if (bannersData) {
                const { activeIds, upcomingIds, fullOrder } = normalizeBannerSchedule(bannersData);
                const bumpWindow = computeBannerBumpWindow(activeIds, upcomingIds);
                const bannerIndexMap = buildBannerIndexMap(fullOrder);
                recommendations = applyBannerRecommendationOrdering(
                    analyzed.recommendations,
                    bumpWindow,
                    bannerIndexMap
                );
                const unitById = new Map(allUnits.map(u => [u.id, u]));
                bannerMeta = {
                    activeIds,
                    upcomingIds,
                    fullOrder,
                    bumpWindow,
                    bannerIndexMap,
                    unitById
                };
            }

            lastResults = { ...analyzed, recommendations, bannerMeta };
            displayResults(lastResults);
        } catch (error) {
            console.error('Analysis failed:', error);
            showError('Failed to analyze roster. Please try again.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Analyze Roster';
        }
    }, 50);
}

// ============================================================================
// RESULTS DISPLAY
// ============================================================================

function displayResults(results) {
    const section = document.getElementById('results-section');

    renderAssessment(results.assessment);
    renderBannerTiles(results);
    renderRecommendations(results);

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
}

function renderBannerTiles(results) {
    const el = document.getElementById('banner-tiles-section');
    if (!el) return;

    if (!results.bannerMeta) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }

    const { activeIds, upcomingIds, unitById } = results.bannerMeta;
    const unitStates = getUnitStates();
    const { allGaps } = results;
    const allUnits = getAllUnits();
    const ownedUnits = allUnits.filter(u => unitStates[u.id]?.owned);

    function tilesForIds(ids) {
        return ids
            .filter(id => unitById.has(id) && !unitStates[id]?.owned)
            .map(id => {
                const unit = unitById.get(id);
                const verdict = bannerTileVerdictClass(id, allGaps, ownedUnits, allUnits);
                return createBannerUnitTile(unit, verdict);
            })
            .join('');
    }

    const activeHtml = tilesForIds(activeIds);
    const upcomingHtml = tilesForIds(upcomingIds);

    if (!activeHtml && !upcomingHtml) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }

    const groups = [];
    if (activeHtml) {
        groups.push(`
            <div class="banner-tiles-group">
                <span class="banner-tiles-group-label">Current banners</span>
                <div class="banner-tiles-strip">${activeHtml}</div>
            </div>
        `);
    }
    if (upcomingHtml) {
        groups.push(`
            <div class="banner-tiles-group">
                <span class="banner-tiles-group-label">Upcoming banners</span>
                <div class="banner-tiles-strip">${upcomingHtml}</div>
            </div>
        `);
    }

    el.innerHTML = `<div class="banner-tiles-inner"><div class="banner-tiles-row">${groups.join('')}</div></div>`;
    el.style.display = 'block';
}

const BANNER_TILE_NAME_LIMIT = 10;

function tileDisplayName(unit) {
    if (unit.name.length <= BANNER_TILE_NAME_LIMIT) return unit.name;
    const aliases = unit.aliases ?? [];
    if (aliases.length === 0) return unit.name;
    return aliases.reduce((shortest, a) => a.length < shortest.length ? a : shortest, unit.name);
}

function createBannerUnitTile(unit, verdictClass) {
    const displayName = tileDisplayName(unit);
    const initials = getInitials(unit.name);
    const imageUrl = getCharacterImageUrl(unit.id);
    const avatarHtml = imageUrl
        ? `<img class="banner-tile-avatar" src="${imageUrl}" alt="${unit.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="banner-tile-initials" style="display:none">${initials}</span>`
        : `<span class="banner-tile-initials">${initials}</span>`;
    const label = verdictLabel(verdictClass);

    return `
        <div class="banner-unit-tile verdict-${verdictClass}" title="${unit.name}: ${label}">
            ${avatarHtml}
            <span class="banner-tile-name">${displayName}</span>
            <span class="banner-tile-verdict">${label}</span>
        </div>
    `;
}

function renderAssessment(assessment) {
    const container = document.getElementById('roster-assessment');
    container.innerHTML = `
        <div class="roster-assessment-card" style="border-left-color: ${assessment.ratingColor}">
            <div class="assessment-header">
                <span class="assessment-label">Roster Health</span>
                <span class="assessment-rating" style="color: ${assessment.ratingColor}">${assessment.ratingTier}</span>
            </div>
            <p class="assessment-summary">${assessment.summary}</p>
        </div>
    `;
}

function renderRecommendations(results) {
    const recommendations = results.recommendations.slice(0, resultLimit);
    const container = document.getElementById('recommendations-list');

    if (recommendations.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <p>No pull recommendations — your roster is in great shape!</p>
                <p class="hint">You have strong coverage across all major roles and archetypes.</p>
            </div>
        `;
        return;
    }

    let activeSet = null;
    let upcomingSet = null;
    if (results.bannerMeta) {
        const { activeIds, upcomingIds, unitById } = results.bannerMeta;
        activeSet = new Set(activeIds.filter(id => unitById.has(id)));
        upcomingSet = new Set(upcomingIds.filter(id => unitById.has(id)));
    }

    container.innerHTML = recommendations.map(rec => createRecommendationCard(rec, activeSet, upcomingSet)).join('');
}

function formatDependencyReason(unitName, note, activeSet, upcomingSet) {
    if (!note.providers || note.providers.length === 0) return note.text;
    const names = note.providers.map(p => {
        if (activeSet?.has(p.id)) return `${p.name} (available now)`;
        if (upcomingSet?.has(p.id)) return `${p.name} (upcoming)`;
        return p.name;
    });
    return `${unitName} would be a more valuable pull with ${names.join(' or ')}`;
}

function createRecommendationCard(rec, activeSet, upcomingSet) {
    const priorityClass = rec.priority.toLowerCase();
    const unitsHtml = rec.units.map(unit =>
        createRecUnitCard(unit, activeSet, upcomingSet)
    ).join('');

    const allReasons = [rec.reason, ...(rec.additionalReasons?.map(r => r.reason) ?? [])];
    if (rec.teamDependencyNotes?.length > 0 && rec.units[0]) {
        const unitName = rec.units[0].name;
        for (const note of rec.teamDependencyNotes) {
            allReasons.push(formatDependencyReason(unitName, note, activeSet, upcomingSet));
        }
    }
    const reasonsHtml = `<ul class="rec-reasons">${allReasons.map(r => `<li class="rec-reason">${r}</li>`).join('')}</ul>`;

    return `
        <div class="pull-rec-card priority-${priorityClass}">
            <div class="rec-header">
                <span class="priority-badge priority-${priorityClass}">${rec.priority}</span>
                <span class="rec-title">${rec.title}</span>
            </div>
            ${reasonsHtml}
            <div class="rec-unit-list">
                ${unitsHtml}
            </div>
        </div>
    `;
}

/**
 * @param {Set<string> | null} activeSet
 * @param {Set<string> | null} upcomingSet
 */
function createRecUnitCard(unit, activeSet, upcomingSet) {
    const element = getUnitElement(unit);
    const initials = getInitials(unit.name);
    const imageUrl = getCharacterImageUrl(unit.id);
    const onActiveBanner = activeSet?.has(unit.id);
    const onUpcomingBanner = upcomingSet?.has(unit.id);
    const isGameUpcoming = unit.available === false;

    const avatarHtml = imageUrl
        ? `<img class="unit-avatar" src="${imageUrl}" alt="${unit.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="unit-initials" style="display:none">${initials}</span>`
        : `<span class="unit-initials">${initials}</span>`;

    let badgeHtml = '';
    if (onActiveBanner) {
        badgeHtml = '<span class="available-badge">Available</span>';
    } else if (onUpcomingBanner || isGameUpcoming) {
        badgeHtml = '<span class="upcoming-badge">Upcoming</span>';
    }

    const titleBits = [unit.name];
    if (onActiveBanner) titleBits.push('Available on current banner');
    else if (onUpcomingBanner || isGameUpcoming) titleBits.push('Upcoming');

    return `
        <div class="rec-unit element-${element}" title="${titleBits.join(' — ')}">
            ${avatarHtml}
            <span class="unit-name">${unit.name}</span>
            ${badgeHtml}
        </div>
    `;
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
