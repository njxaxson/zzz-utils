/**
 * Pull Recommendations - Client-side Logic
 * Analyzes roster gaps and recommends limited S-rank characters to pull.
 */

import {
    initRoster, getUnitStates, getAllUnits,
    getInitials, getCharacterImageUrl
} from '../common/roster-ui.js';

import { analyze, getUnitElement } from '../common/pull-engine.js';

const PAGE_STORAGE_KEY = 'zzz-pull-recommendations';

let resultLimit = 5;
let lastResults = null;

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadData() {
    try {
        await initRoster({
            containerSelector: '#roster-container',
            pageUrl: 'pull-recommendations.html',
            lockedUnits: ['nicole', 'anby', 'billy']
        });
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
            lastResults = analyze(allUnits, unitStates, ownedUnits, { maxRecommendations: 10 });
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
    renderRecommendations(results.recommendations.slice(0, resultLimit));

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
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

function renderRecommendations(recommendations) {
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

    container.innerHTML = recommendations.map(rec => createRecommendationCard(rec)).join('');
}

function createRecommendationCard(rec) {
    const priorityClass = rec.priority.toLowerCase();
    const unitsHtml = rec.units.map(unit => createRecUnitCard(unit)).join('');

    return `
        <div class="pull-rec-card priority-${priorityClass}">
            <div class="rec-header">
                <span class="priority-badge priority-${priorityClass}">${rec.priority}</span>
                <span class="rec-title">${rec.title}</span>
            </div>
            <p class="rec-reason">${rec.reason}</p>
            <div class="rec-unit-list">
                ${unitsHtml}
            </div>
        </div>
    `;
}

function createRecUnitCard(unit) {
    const element = getUnitElement(unit);
    const initials = getInitials(unit.name);
    const imageUrl = getCharacterImageUrl(unit.id);
    const isUpcoming = unit.available === false;

    const avatarHtml = imageUrl
        ? `<img class="unit-avatar" src="${imageUrl}" alt="${unit.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="unit-initials" style="display:none">${initials}</span>`
        : `<span class="unit-initials">${initials}</span>`;

    return `
        <div class="rec-unit element-${element}" title="${unit.name}${isUpcoming ? ' (Upcoming)' : ''}">
            ${avatarHtml}
            <span class="unit-name">${unit.name}</span>
            ${isUpcoming ? '<span class="upcoming-badge">Upcoming</span>' : ''}
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
